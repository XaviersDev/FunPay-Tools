// background/autobump.js

export const BUMP_ALARM_NAME = 'fpToolsAutoBump';

async function logToConsole(message) {
    const timestamp = new Date().toLocaleTimeString();
    const logMessage = `[${timestamp}] ${message}`;
    console.log(`[FP Tools AutoBump] ${logMessage}`);
    try {
        const tabs = await chrome.tabs.query({ url: "*://funpay.com/*" });
        if (tabs.length > 0) {
            tabs.forEach(tab => {
                chrome.tabs.sendMessage(tab.id, {
                    action: 'logToAutoBumpConsole',
                    message: logMessage
                }).catch(e => {});
            });
        }
    } catch (error) {
        console.error("Error sending log message to content script:", error);
    }
}

// --- НОВЫЙ БЛОК: Скопированная функция для связи с offscreen.js ---
async function parseHtmlViaOffscreen(html, action) {
    const OFFSCREEN_DOCUMENT_PATH = 'offscreen/offscreen.html';
    const existingContexts = await chrome.runtime.getContexts({
        contextTypes: ['OFFSCREEN_DOCUMENT'],
        documentUrls: [chrome.runtime.getURL(OFFSCREEN_DOCUMENT_PATH)]
    });
    if (!existingContexts.length) {
        await chrome.offscreen.createDocument({
            url: OFFSCREEN_DOCUMENT_PATH,
            reasons: ['DOM_PARSER'],
            justification: 'Parsing FunPay page HTML for autobump',
        });
    }
    return await chrome.runtime.sendMessage({ target: 'offscreen', action, html });
}
// --- КОНЕЦ НОВОГО БЛОКА ---

async function getAuthDetails() {
    const goldenKeyCookie = await chrome.cookies.get({ url: 'https://funpay.com', name: 'golden_key' });
    if (!goldenKeyCookie) throw new Error('Не удалось найти cookie "golden_key". Вы вошли в свой аккаунт FunPay?');
    // FIX: include PHPSESSID - FunPay requires it alongside golden_key for runner requests
    const phpSessIdCookie = await chrome.cookies.get({ url: 'https://funpay.com', name: 'PHPSESSID' });
    const phpsessidPart = phpSessIdCookie?.value ? `; PHPSESSID=${phpSessIdCookie.value}` : '';
    const cookies = `golden_key=${goldenKeyCookie.value}${phpsessidPart};`;

    // 1) Пытаемся получить userId/csrf из открытой вкладки FunPay (быстрый путь).
    const tabs = await chrome.tabs.query({ url: "https://funpay.com/*" });
    for (const tab of tabs) {
        try {
            if (tab.discarded) continue;
            const response = await chrome.tabs.sendMessage(tab.id, { action: "getAppData" });
            if (response && response.success) {
                const parsedData = response.data;
                let appData;
                if (Array.isArray(parsedData) && parsedData.length > 0) appData = parsedData[0];
                else if (typeof parsedData === 'object' && parsedData !== null && !Array.isArray(parsedData)) appData = parsedData;
                else continue;

                const userId = appData.userId;
                const csrfToken = appData['csrf-token'];
                if (!userId || !csrfToken) continue;

                return { cookies, userId, csrfToken };
            }
        } catch (e) {
            console.warn(`Could not connect to tab ${tab.id}. Trying next. Error: ${e.message}`);
        }
    }

    // 2) Открытой вкладки нет (например, команда /bump из Telegram) — берём
    //    userId/csrf напрямую с главной страницы, используя настоящие cookie.
    try {
        const resp = await fetch('https://funpay.com/', { credentials: 'include', cache: 'no-store' });
        const html = await resp.text();
        const auth = await parseHtmlViaOffscreen(html, 'parseAuthData');
        if (auth && auth.userId && auth.csrfToken) {
            return { cookies, userId: auth.userId, csrfToken: auth.csrfToken };
        }
    } catch (e) {
        console.warn('FP Tools AutoBump: homepage auth fallback failed:', e.message);
    }

    throw new Error("Не удалось получить данные авторизации (userId/csrf). Откройте вкладку FunPay или войдите заново.");
}


async function raiseCategory(categoryData, auth) {
    const { cookies, csrfToken } = auth;
    const { gameId, nodeId, categoryName } = categoryData;
    
    const initialData = new URLSearchParams({ game_id: gameId, node_id: nodeId });
    const headers = {
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'X-Requested-With': 'XMLHttpRequest',
        'X-Csrf-Token': csrfToken
    };

    let response = await fetch('https://funpay.com/lots/raise', { method: 'POST', headers: headers, body: initialData.toString(), credentials: 'include' });
    let responseText = await response.text();

    try {
        const jsonResponse = JSON.parse(responseText);
        if (jsonResponse.modal) {
            const modalHtml = jsonResponse.modal;
            
            const checkboxRegex = /<div class="checkbox"[^>]*>.*?<input[^>]*value="(\d+)"/g;
            const nodeIds = Array.from(modalHtml.matchAll(checkboxRegex), match => match[1]);

            if (nodeIds.length > 0) {
                const multiRaiseData = new URLSearchParams();
                multiRaiseData.append('game_id', gameId);
                multiRaiseData.append('node_id', nodeId);
                nodeIds.forEach(id => multiRaiseData.append('node_ids[]', id));
                
                response = await fetch('https://funpay.com/lots/raise', { method: 'POST', headers: headers, body: multiRaiseData.toString(), credentials: 'include' });
                responseText = await response.text();

            } else {
                await logToConsole(`Не поднято: ${categoryName}. Причина: Модальное окно не содержит подкатегорий для поднятия.`);
                return false;
            }
        }
    } catch (e) { }
    
    if (responseText.includes('подняты') || responseText.includes('raised')) {
        await logToConsole(`Поднято: ${categoryName}`);
        return true;
    } else {
        let errorMsg = responseText;
        try {
            const errJson = JSON.parse(responseText);
            errorMsg = errJson.msg || JSON.stringify(errJson);
        } catch(e) {
            errorMsg = responseText.replace(/<[^>]*>/g, '').trim();
        }
        await logToConsole(`Не поднято: ${categoryName}. Причина: ${errorMsg}`);
        return false;
    }
}

// --- ИЗМЕНЕННАЯ ФУНКЦИЯ ---
export async function runBumpCycle() {
    const summary = { raised: 0, errors: 0, skipped: 0 };
    try {
        const { fpToolsSelectiveBumpEnabled, fpToolsSelectedBumpCategories, fpToolsBumpOnlyAutoDelivery } = await chrome.storage.local.get(['fpToolsSelectiveBumpEnabled', 'fpToolsSelectedBumpCategories', 'fpToolsBumpOnlyAutoDelivery']);

        const auth = await getAuthDetails();
        const userUrl = `https://funpay.com/users/${auth.userId}/`;
        const userPageResponse = await fetch(userUrl, { credentials: 'include', cache: 'no-store' });
        const userPageHtml = await userPageResponse.text();

        // Получаем структурированный список категорий
        let categories = await parseHtmlViaOffscreen(userPageHtml, 'parseUserCategories');
        
        // Фильтр по автовыдаче
        if (fpToolsBumpOnlyAutoDelivery) {
            await logToConsole(`Режим "Только автовыдача" активен. Фильтрация...`);
            categories = categories.filter(cat => cat.hasAutoDelivery);
        }

        // Фильтр по выборочным категориям
        if (fpToolsSelectiveBumpEnabled && fpToolsSelectedBumpCategories && fpToolsSelectedBumpCategories.length > 0) {
            await logToConsole(`Режим выборочного поднятия активен. Выбрано категорий: ${fpToolsSelectedBumpCategories.length}.`);
            categories = categories.filter(cat => fpToolsSelectedBumpCategories.includes(cat.id));
        } else if (fpToolsSelectiveBumpEnabled) {
            await logToConsole("Выборочное поднятие включено, но категории не выбраны. Ничего не будет поднято.");
            return summary;
        }
        
        // Преобразуем отфильтрованный список в URL
        let categoryUrls = categories.map(cat => new URL(cat.id, 'https://funpay.com/'));

        if (categoryUrls.length === 0) {
            await logToConsole("Нет категорий для поднятия (согласно настройкам).");
            return summary;
        }
        
        const categoryUrlHrefs = categoryUrls.map(url => url.href);

        for (const categoryUrl of categoryUrlHrefs) {
            const categoryPageResponse = await fetch(categoryUrl, { credentials: 'include', cache: 'no-store' });
            
            const urlParts = categoryUrl.split('/');
            const guessedName = urlParts.length > 2 ? urlParts[urlParts.length - 2] : 'Неизвестная категория';
            
            if (!categoryPageResponse.ok) {
                await logToConsole(`Не поднято: ${guessedName}. Причина: Ошибка загрузки страницы ${categoryPageResponse.status}.`);
                summary.errors++;
                continue;
            }
            
            const categoryPageHtml = await categoryPageResponse.text();
            
            const categoryNameMatch = categoryPageHtml.match(/<span class="inside">([^<]+)<\/span>/);
            const categoryName = categoryNameMatch ? categoryNameMatch[1].trim() : guessedName;

            const raiseButtonRegex = /<button[^>]+class="[^"]*js-lot-raise[^"]*"[^>]*data-game="(\d+)"[^>]*data-node="([^"]+)"/;
            const raiseButtonMatch = categoryPageHtml.match(raiseButtonRegex);

            if (raiseButtonMatch) {
                const categoryData = { 
                    gameId: raiseButtonMatch[1], 
                    nodeId: raiseButtonMatch[2],
                    categoryName: categoryName
                };
                const ok = await raiseCategory(categoryData, auth);
                if (ok) summary.raised++; else summary.skipped++;
            } else {
                await logToConsole(`Не поднято: ${categoryName}. Причина: Не найдена кнопка поднятия.`);
                summary.skipped++;
            }
            await new Promise(resolve => setTimeout(resolve, 4500)); // 2.9: increased to 4.5s to avoid rate limiting
        }
        return summary;
    } catch (error) {
        await logToConsole(`Не поднято: [Системная ошибка]. Причина: ${error.message}`);
        summary.errors++;
        throw error;
    }
}

export async function startAutoBump(cooldownMinutes) {
    await chrome.alarms.create(BUMP_ALARM_NAME, { delayInMinutes: 1, periodInMinutes: parseInt(cooldownMinutes, 10) });
    await runBumpCycle();
}

export async function stopAutoBump() {
    await chrome.alarms.clear(BUMP_ALARM_NAME);
}