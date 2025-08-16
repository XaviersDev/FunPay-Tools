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

async function getAuthDetails() {
    const goldenKeyCookie = await chrome.cookies.get({ url: 'https://funpay.com', name: 'golden_key' });
    if (!goldenKeyCookie) throw new Error('Не удалось найти cookie "golden_key". Вы вошли в свой аккаунт FunPay?');
    const cookies = `golden_key=${goldenKeyCookie.value};`;

    const tabs = await chrome.tabs.query({ url: "https://funpay.com/*" });
    if (tabs.length === 0) throw new Error("Не найдено открытых вкладок FunPay. Откройте сайт для получения данных.");

    for (const tab of tabs) {
        try {
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

    throw new Error("Не удалось связаться ни с одной страницей FunPay. Попробуйте перезагрузить вкладку с сайтом.");
}


async function raiseCategory(categoryData, auth) {
    const { cookies, csrfToken } = auth;
    const { gameId, nodeId, categoryName } = categoryData;
    
    const initialData = new URLSearchParams({ game_id: gameId, node_id: nodeId });
    const headers = {
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'Cookie': cookies,
        'X-Requested-With': 'XMLHttpRequest',
        'X-Csrf-Token': csrfToken
    };
    
    let response = await fetch('https://funpay.com/lots/raise', { method: 'POST', headers: headers, body: initialData.toString() });
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
                
                response = await fetch('https://funpay.com/lots/raise', { method: 'POST', headers: headers, body: multiRaiseData.toString() });
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

export async function runBumpCycle() {
    try {
        const auth = await getAuthDetails();
        const userUrl = `https://funpay.com/users/${auth.userId}/`;
        const userPageResponse = await fetch(userUrl, { headers: { 'Cookie': auth.cookies } });
        const userPageHtml = await userPageResponse.text();

        const categoryLinkRegex = /<a[^>]+href="([^"]+)"[^>]*class="[^"]*btn-plus[^"]*"/g;
        const categoryUrls = Array.from(userPageHtml.matchAll(categoryLinkRegex), match => match[1])
                                  .filter(url => !url.includes('chips'))
                                  .map(path => new URL(path, 'https://funpay.com/').href);

        if (categoryUrls.length === 0) {
            return;
        }

        for (const categoryUrl of categoryUrls) {
            const categoryPageResponse = await fetch(categoryUrl, { headers: { 'Cookie': auth.cookies } });
            
            const urlParts = categoryUrl.split('/');
            const guessedName = urlParts.length > 2 ? urlParts[urlParts.length - 2] : 'Неизвестная категория';
            
            if (!categoryPageResponse.ok) {
                await logToConsole(`Не поднято: ${guessedName}. Причина: Ошибка загрузки страницы ${categoryPageResponse.status}.`);
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
                await raiseCategory(categoryData, auth);
            } else {
                await logToConsole(`Не поднято: ${categoryName}. Причина: Не найдена кнопка поднятия.`);
            }
            await new Promise(resolve => setTimeout(resolve, 3000));
        }
    } catch (error) {
        await logToConsole(`Не поднято: [Системная ошибка]. Причина: ${error.message}`);
    }
}

export async function startAutoBump(cooldownMinutes) {
    await chrome.alarms.create(BUMP_ALARM_NAME, { delayInMinutes: 1, periodInMinutes: parseInt(cooldownMinutes, 10) });
    await runBumpCycle();
}

export async function stopAutoBump() {
    await chrome.alarms.clear(BUMP_ALARM_NAME);
}