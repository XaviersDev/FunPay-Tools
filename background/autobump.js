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

    // 2) Открытой вкладки нет (например, команда /bump из Telegram) - берём
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
    const { csrfToken } = auth;
    const { gameId, nodeId, categoryName } = categoryData;

    const headers = {
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'X-Requested-With': 'XMLHttpRequest',
        'X-Csrf-Token': csrfToken
    };

    const initialData = new URLSearchParams({ game_id: gameId, node_id: nodeId });
    let response = await fetch('https://funpay.com/lots/raise', { method: 'POST', headers, body: initialData.toString(), credentials: 'include' });
    let responseText = await response.text();

    let parsed = null;
    try { parsed = JSON.parse(responseText); } catch (e) { parsed = null; }

    if (parsed && parsed.modal) {
        const checkboxRegex = /<div class="checkbox"[^>]*>.*?<input[^>]*value="(\d+)"/g;
        const nodeIds = Array.from(parsed.modal.matchAll(checkboxRegex), m => m[1]);
        if (nodeIds.length > 0) {
            const multi = new URLSearchParams();
            multi.append('game_id', gameId);
            multi.append('node_id', nodeId);
            nodeIds.forEach(id => multi.append('node_ids[]', id));
            response = await fetch('https://funpay.com/lots/raise', { method: 'POST', headers, body: multi.toString(), credentials: 'include' });
            responseText = await response.text();
            try { parsed = JSON.parse(responseText); } catch (e) { parsed = null; }
        } else {
            await logToConsole(`Не поднято: ${categoryName}. Модальное окно без подкатегорий.`);
            return { ok: false, waitSeconds: 4 * 3600 };
        }
    }

    if (response.status === 429) {
        const w = parsed && Number(parsed.wait) ? Number(parsed.wait) : 4 * 3600;
        await logToConsole(`Лимит: ${categoryName}. Следующая попытка через ${formatWait(w)}.`);
        return { ok: false, waitSeconds: w };
    }

    if (responseText.includes('подняты') || responseText.includes('raised') || (parsed && parsed.error === false)) {
        await logToConsole(`Поднято: ${categoryName}`);
        return { ok: true, waitSeconds: 4 * 3600 };
    }

    if (parsed && Number(parsed.wait)) {
        await logToConsole(`Не поднято: ${categoryName}. ${parsed.msg || ''} Ждать ${formatWait(Number(parsed.wait))}.`);
        return { ok: false, waitSeconds: Number(parsed.wait) };
    }

    let errorMsg = parsed ? (parsed.msg || JSON.stringify(parsed)) : responseText.replace(/<[^>]*>/g, '').trim();
    await logToConsole(`Не поднято: ${categoryName}. Причина: ${errorMsg}`);
    return { ok: false, waitSeconds: 600 };
}

function formatWait(sec) {
    sec = Math.max(0, Math.round(sec));
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    if (h > 0) return `${h} ч ${m} мин`;
    if (m > 0) return `${m} мин`;
    return `${sec} сек`;
}

async function collectCategories(auth) {
    const { fpToolsSelectiveBumpEnabled, fpToolsSelectedBumpCategories, fpToolsBumpOnlyAutoDelivery } =
        await chrome.storage.local.get(['fpToolsSelectiveBumpEnabled', 'fpToolsSelectedBumpCategories', 'fpToolsBumpOnlyAutoDelivery']);

    const userUrl = `https://funpay.com/users/${auth.userId}/`;
    const userPageHtml = await (await fetch(userUrl, { credentials: 'include', cache: 'no-store' })).text();
    let categories = await parseHtmlViaOffscreen(userPageHtml, 'parseUserCategories');

    if (fpToolsBumpOnlyAutoDelivery) categories = categories.filter(c => c.hasAutoDelivery);

    if (fpToolsSelectiveBumpEnabled && fpToolsSelectedBumpCategories && fpToolsSelectedBumpCategories.length > 0) {
        categories = categories.filter(c => fpToolsSelectedBumpCategories.includes(c.id));
    } else if (fpToolsSelectiveBumpEnabled) {
        return [];
    }
    return categories;
}

export async function runBumpCycle() {
    const summary = { raised: 0, errors: 0, skipped: 0, nextWaitSeconds: 4 * 3600 };
    try {
        const auth = await getAuthDetails();
        const categories = await collectCategories(auth);

        if (!categories.length) {
            await logToConsole('Нет категорий для поднятия (по настройкам).');
            return summary;
        }

        let minNextWait = Infinity;

        for (const cat of categories) {
            const categoryUrl = new URL(cat.id, 'https://funpay.com/').href;
            const pageResp = await fetch(categoryUrl, { credentials: 'include', cache: 'no-store' });
            const guessed = categoryUrl.split('/').slice(-2, -1)[0] || 'категория';

            if (!pageResp.ok) {
                await logToConsole(`Не поднято: ${guessed}. Ошибка загрузки ${pageResp.status}.`);
                summary.errors++;
                minNextWait = Math.min(minNextWait, 600);
                continue;
            }

            const html = await pageResp.text();
            const nameMatch = html.match(/<span class="inside">([^<]+)<\/span>/);
            const categoryName = nameMatch ? nameMatch[1].trim() : guessed;

            const btnMatch = html.match(/<button[^>]+class="[^"]*js-lot-raise[^"]*"[^>]*data-game="(\d+)"[^>]*data-node="([^"]+)"/);
            if (!btnMatch) {
                await logToConsole(`Не поднято: ${categoryName}. Кнопка поднятия не найдена.`);
                summary.skipped++;
                minNextWait = Math.min(minNextWait, 3600);
                continue;
            }

            const result = await raiseCategory({ gameId: btnMatch[1], nodeId: btnMatch[2], categoryName }, auth);
            if (result.ok) summary.raised++; else summary.skipped++;
            minNextWait = Math.min(minNextWait, result.waitSeconds || 4 * 3600);

            await new Promise(r => setTimeout(r, 2000));
        }

        if (!isFinite(minNextWait)) minNextWait = 4 * 3600;
        summary.nextWaitSeconds = minNextWait;
        return summary;
    } catch (error) {
        await logToConsole(`Не поднято: [Системная ошибка]. ${error.message}`);
        summary.errors++;
        summary.nextWaitSeconds = 600;
        return summary;
    }
}

async function scheduleNext(seconds) {
    const minutes = Math.max(1, Math.ceil((seconds + 15) / 60));
    await chrome.alarms.clear(BUMP_ALARM_NAME);
    await chrome.alarms.create(BUMP_ALARM_NAME, { delayInMinutes: minutes });
    await logToConsole(`Следующее поднятие примерно через ${formatWait(minutes * 60)}.`);
}

export async function runScheduledBump() {
    const { autoBumpEnabled } = await chrome.storage.local.get(['autoBumpEnabled']);
    if (!autoBumpEnabled) { await chrome.alarms.clear(BUMP_ALARM_NAME); return; }
    const summary = await runBumpCycle();
    await scheduleNext(summary.nextWaitSeconds);
}

export async function startAutoBump() {
    await chrome.storage.local.set({ autoBumpEnabled: true });
    await logToConsole('Автоподнятие включено.');
    await runScheduledBump();
}

export async function stopAutoBump() {
    await chrome.storage.local.set({ autoBumpEnabled: false });
    await chrome.alarms.clear(BUMP_ALARM_NAME);
    await logToConsole('Автоподнятие выключено.');
}
