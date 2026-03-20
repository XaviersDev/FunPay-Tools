// background/background.js — FunPay Tools 2.8

import { fetchAIResponse, fetchAILotGeneration, fetchAITranslation, fetchAIImageGeneration } from './ai.js';
import { BUMP_ALARM_NAME, startAutoBump, stopAutoBump, runBumpCycle } from './autobump.js';
import { runAutoResponderCycle, resetAutoResponderState } from './autoresponder.js';

const OFFSCREEN_DOCUMENT_PATH = 'offscreen/offscreen.html';
const DISCORD_LOG_ALARM_NAME = 'fpToolsDiscordCheck';
const AUTO_RESPONDER_ALARM_NAME = 'fpToolsAutoResponder';
let lastDiscordChatTag = null;
const IMPORT_PROCESS_KEY = 'fpToolsLotImportProcess';
const RETRY_LIMIT = 5;
const RETRY_DELAY = 5000; // 5 секунд

// --- ФИНАЛЬНАЯ, ИСПРАВЛЕННАЯ ФУНКЦИЯ СБОРА СТАТИСТИКИ БЕЗ ОГРАНИЧЕНИЙ ---
async function runSalesUpdateCycle() {
    console.log("FP Tools: Запуск полного цикла сбора статистики продаж...");
    try {
        const auth = await getAuthDetailsForBackground();
        if (!auth.golden_key) throw new Error("Не удалось получить golden_key для сбора статистики.");

        let {
            fpToolsSalesData: savedOrders = {},
            fpToolsFirstOrderId: firstOrderId,
            fpToolsLastOrderId: lastOrderId
        } = await chrome.storage.local.get(['fpToolsSalesData', 'fpToolsFirstOrderId', 'fpToolsLastOrderId']);

        const fetchAndParseSales = async (continueToken = null) => {
            const url = 'https://funpay.com/orders/trade';
            const body = continueToken ? new URLSearchParams({ 'continue': continueToken }) : null;
            const options = {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8', 'Cookie': `golden_key=${auth.golden_key}` },
                body: body
            };
            const response = await fetch(url, options);
            if (!response.ok) throw new Error(`Ошибка сети: ${response.status}`);
            const html = await response.text();
            return await parseHtmlViaOffscreen(html, 'parseSalesPage');
        };

        const saveSalesData = async (orders, firstId, lastId) => {
            await chrome.storage.local.set({
                fpToolsSalesData: orders,
                fpToolsFirstOrderId: firstId,
                fpToolsLastOrderId: lastId,
                fpToolsSalesLastUpdate: Date.now()
            });
        };

        if (firstOrderId) {
            let continueToken = null;
            let newOrdersFoundInCycle = true;
            while (newOrdersFoundInCycle) {
                const { nextOrderId, orders } = await fetchAndParseSales(continueToken);
                if (!orders || orders.length === 0) break;

                const knownOrderIndex = orders.findIndex(o => o.orderId === firstOrderId);
                const newOrders = (knownOrderIndex !== -1) ? orders.slice(0, knownOrderIndex) : orders;

                if (newOrders.length > 0) {
                    newOrders.forEach(o => savedOrders[o.orderId] = o);
                    firstOrderId = newOrders[0].orderId;
                    await saveSalesData(savedOrders, firstOrderId, lastOrderId);
                    console.log(`FP Tools: Добавлено ${newOrders.length} новых заказов сверху.`);
                } else {
                    newOrdersFoundInCycle = false;
                }

                if (knownOrderIndex !== -1 || !nextOrderId) break;
                
                continueToken = nextOrderId;
                await new Promise(resolve => setTimeout(resolve, 500));
            }
        }

        let continueToken = lastOrderId;
        if (!firstOrderId) { 
            const { nextOrderId, orders } = await fetchAndParseSales(null);
            if (orders && orders.length > 0) {
                orders.forEach(o => savedOrders[o.orderId] = o);
                firstOrderId = orders[0].orderId;
                lastOrderId = orders[orders.length - 1].orderId;
                await saveSalesData(savedOrders, firstOrderId, lastOrderId);
                console.log(`FP Tools: Инициализация статистики с ${orders.length} заказами.`);
                continueToken = nextOrderId;
            } else {
                continueToken = null; 
            }
        }
        
        while (continueToken) {
            const { nextOrderId, orders } = await fetchAndParseSales(continueToken);
            if (!orders || orders.length === 0) {
                console.log("FP Tools: Достигнут конец истории заказов.");
                break;
            }
            
            let newOrdersOnPageCount = 0;
            orders.forEach(order => {
                if (!savedOrders[order.orderId]) {
                    savedOrders[order.orderId] = order;
                    newOrdersOnPageCount++;
                }
            });

            if (newOrdersOnPageCount > 0) {
                lastOrderId = orders[orders.length - 1].orderId;
                await saveSalesData(savedOrders, firstOrderId, lastOrderId);
                console.log(`FP Tools: Добавлено ${newOrdersOnPageCount} старых заказов. Всего: ${Object.keys(savedOrders).length}.`);
            } else {
                console.log("FP Tools: Все старые заказы уже были загружены. Остановка.");
                break;
            }

            continueToken = nextOrderId;
            await new Promise(resolve => setTimeout(resolve, 500)); 
        }

    } catch (e) {
        console.error(`FP Tools: Ошибка в цикле сбора статистики: ${e.message}`);
    } finally {
        console.log("FP Tools: Сбор статистики продаж завершен.");
        await chrome.storage.local.set({ fpToolsSalesLastUpdate: Date.now() });
    }
}


// --- НИЖЕ ИДЕТ ОСТАЛЬНОЙ КОД ФАЙЛА, ОН ОСТАЕТСЯ БЕЗ ИЗМЕНЕНИЙ ---

// --- НАДЁЖНАЯ ФУНКЦИЯ АУТЕНТИФИКАЦИИ ---
async function getAuthDetailsForBackground() {
    const goldenKeyCookie = await chrome.cookies.get({ url: 'https://funpay.com', name: 'golden_key' });
    if (!goldenKeyCookie || !goldenKeyCookie.value) {
        console.error("FP Tools: golden_key не найден. Пользователь не авторизован.");
        return {};
    }
    const golden_key = goldenKeyCookie.value;
    // FIX: PHPSESSID is required by FunPay runner alongside golden_key
    const phpSessIdCookie = await chrome.cookies.get({ url: 'https://funpay.com', name: 'PHPSESSID' });
    const phpsessid = phpSessIdCookie?.value || '';

    const tabs = await chrome.tabs.query({ url: "https://funpay.com/*" });
    for (const tab of tabs) {
        try {
            if (tab.discarded) continue;
            const response = await chrome.tabs.sendMessage(tab.id, { action: "getAppData" });
            if (response && response.success) {
                const appData = Array.isArray(response.data) ? response.data[0] : response.data;
                if (appData && appData['csrf-token'] && appData.userId) {
                    console.log("FP Tools: Auth-данные получены из активной вкладки.");
                    return {
                        golden_key: golden_key,
                        phpsessid: phpsessid,
                        csrf_token: appData['csrf-token'],
                        userId: appData.userId,
                        username: appData.userName,
                    };
                }
            }
        } catch (e) {
            console.warn(`FP Tools: Не удалось получить appData из вкладки ${tab.id}. Пробую следующую.`);
        }
    }

    console.log("FP Tools: Не удалось получить appData от вкладок, делаю прямой запрос к FunPay...");
    try {
        const response = await fetch("https://funpay.com/", {
            headers: { "cookie": `golden_key=${golden_key}` }
        });
        if (!response.ok) throw new Error(`Статус ответа: ${response.status}`);
        const text = await response.text();

        const appDataMatch = text.match(/<body[^>]*data-app-data="([^"]+)"/);
        if (appDataMatch && appDataMatch[1]) {
            const appDataString = appDataMatch[1].replace(/&quot;/g, '"');
            const appData = JSON.parse(appDataString);
            const userData = Array.isArray(appData) ? appData[0] : appData;
            if (userData && userData['csrf-token'] && userData.userId) {
                console.log("FP Tools: Auth-данные успешно получены через прямой запрос.");
                return {
                    golden_key: golden_key,
                    phpsessid: phpsessid,
                    csrf_token: userData['csrf-token'],
                    userId: userData.userId,
                    username: userData.userName,
                };
            }
        }
        throw new Error("Не удалось найти data-app-data в HTML страницы.");
    } catch (e) {
        console.error("FP Tools: Прямой запрос для получения appData также провалился.", e.message);
        return { golden_key, phpsessid };
    }
}

// Функция для парсинга HTML через offscreen документ
async function parseHtmlViaOffscreen(html, action) {
    const existingContexts = await chrome.runtime.getContexts({
        contextTypes: ['OFFSCREEN_DOCUMENT'],
        documentUrls: [chrome.runtime.getURL(OFFSCREEN_DOCUMENT_PATH)]
    });

    if (!existingContexts.length) {
        await chrome.offscreen.createDocument({
            url: OFFSCREEN_DOCUMENT_PATH,
            reasons: ['DOM_PARSER'],
            justification: 'Parsing FunPay page HTML',
        });
    }

    return await chrome.runtime.sendMessage({
        target: 'offscreen',
        action: action,
        html: html,
    });
}

// --- СЕКЦИЯ РАБОТЫ С DISCORD ---
async function sendDiscordNotification(chat, settings) {
    let content = "";
    if (settings.pingEveryone) content += "@everyone ";
    if (settings.pingHere) content += "@here ";

    const payload = {
        content: content.trim(),
        embeds: [{
            author: {
                name: chat.chatName,
                url: `https://funpay.com/chat/?node=${chat.chatId}`,
                icon_url: chat.avatarUrl || 'https://funpay.com/img/layout/avatar.png'
            },
            description: chat.messageText.substring(0, 2000),
            color: 5814783,
            footer: {
                text: `FP Tools • ${new Date().toLocaleTimeString()}`
            }
        }]
    };

    try {
        const response = await fetch(settings.webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        if (!response.ok) {
            console.error('FP Tools: Не удалось отправить сообщение в Discord, статус:', response.status);
        } else {
            console.log(`FP Tools: Уведомление о сообщении от ${chat.chatName} отправлено в Discord.`);
        }
    } catch (error) {
        console.error('FP Tools: Ошибка при отправке сообщения в Discord:', error);
    }
}

async function runDiscordCheckCycle() {
    const { fpToolsDiscord, fpToolsProcessedDiscordIds } = await chrome.storage.local.get(['fpToolsDiscord', 'fpToolsProcessedDiscordIds']);

    if (!fpToolsDiscord || !fpToolsDiscord.enabled || !fpToolsDiscord.webhookUrl) {
        chrome.alarms.clear(DISCORD_LOG_ALARM_NAME);
        return;
    }
    
    const processedDiscordMessageIds = new Set(fpToolsProcessedDiscordIds || []);

    try {
        const auth = await getAuthDetailsForBackground();
        if (!auth.golden_key || !auth.csrf_token || !auth.userId) throw new Error("Нет данных авторизации для Discord-цикла.");

        const runnerPayload = {
            objects: JSON.stringify([{
                type: "chat_bookmarks",
                id: auth.userId,
                tag: lastDiscordChatTag || "0000000000",
                data: false
            }]),
            request: false,
            csrf_token: auth.csrf_token
        };

        const discordCookieStr = auth.phpsessid
            ? `golden_key=${auth.golden_key}; PHPSESSID=${auth.phpsessid}`
            : `golden_key=${auth.golden_key}`;
        const response = await fetch("https://funpay.com/runner/", {
            method: "POST",
            headers: {
                "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
                "x-requested-with": "XMLHttpRequest",
                "cookie": discordCookieStr
            },
            body: new URLSearchParams(runnerPayload).toString()
        });

        if (!response.ok) throw new Error(`Runner-запрос для Discord провалился: ${response.status}`);

        const data = await response.json();
        // 3.0: Also capture buyer_viewing data for chat header display
        const buyerViewingObjects = data.objects.filter(o => o.type === "buyer_viewing");
        if (buyerViewingObjects.length > 0) {
            const tabs = await chrome.tabs.query({ url: "https://funpay.com/*" });
            buyerViewingObjects.forEach(bv => {
                tabs.forEach(tab => {
                    chrome.tabs.sendMessage(tab.id, {
                        action: 'fpToolsBuyerViewing',
                        buyerId: bv.id,
                        data: bv.data
                    }).catch(() => {});
                });
            });
        }
        const chatObject = data.objects.find(o => o.type === "chat_bookmarks");

        if (!chatObject || !chatObject.data || !chatObject.data.html) return;

        lastDiscordChatTag = chatObject.tag;

        const parsedChats = await parseHtmlViaOffscreen(chatObject.data.html, 'parseChatList');
        
        let newMessagesToSend = false;
        for (const chat of parsedChats) {
            if (chat.isUnread && !processedDiscordMessageIds.has(chat.msgId)) {
                await sendDiscordNotification(chat, fpToolsDiscord);
                processedDiscordMessageIds.add(chat.msgId);
                newMessagesToSend = true;
            }
        }

        if (newMessagesToSend) {
            let idsToStore = Array.from(processedDiscordMessageIds);
            if (idsToStore.length > 200) {
                idsToStore = idsToStore.slice(-200);
            }
            await chrome.storage.local.set({ fpToolsProcessedDiscordIds: idsToStore });
        }

    } catch (e) {
        console.error(`FP Tools: Ошибка в цикле проверки Discord: ${e.message}`);
    }
}


// --- ИЗМЕНЕННЫЙ БЛОК: ЭКСПОРТ И ИМПОРТ ЛОТОВ ---

async function sendImportProgressUpdate(progressData) {
    const tabs = await chrome.tabs.query({ url: "*://funpay.com/*" });
    tabs.forEach(tab => {
        chrome.tabs.sendMessage(tab.id, {
            action: 'lotImportProgressUpdate',
            data: progressData
        }).catch(e => {});
    });
}

async function processNextLotImport() {
    const { [IMPORT_PROCESS_KEY]: process } = await chrome.storage.local.get(IMPORT_PROCESS_KEY);
    
    // Если процесса нет, или он отложен, или закончен - выходим.
    if (!process || process.state === 'postponed' || process.currentIndex >= process.lots.length) {
        if (process && process.currentIndex >= process.lots.length) {
            await chrome.storage.local.remove(IMPORT_PROCESS_KEY);
            sendImportProgressUpdate({ finished: true, lots: process.lots || [] });
        }
        return;
    }

    const currentLot = process.lots[process.currentIndex];
    
    // Если лот уже успешно создан или пропущен, переходим к следующему
    if (currentLot.status === 'success' || currentLot.status === 'skipped') {
        process.currentIndex++;
        await chrome.storage.local.set({ [IMPORT_PROCESS_KEY]: process });
        processNextLotImport(); // Сразу переходим к следующему
        return;
    }
    
    // Если попытки исчерпаны, останавливаемся
    if (currentLot.retries >= RETRY_LIMIT) {
        currentLot.status = 'error';
        currentLot.error = `Превышен лимит попыток (${RETRY_LIMIT}). Процесс остановлен.`;
        await chrome.storage.local.set({ [IMPORT_PROCESS_KEY]: process });
        sendImportProgressUpdate(process);
        return;
    }

    try {
        const auth = await getAuthDetailsForBackground();
        if (!auth.csrf_token) throw new Error("Не удалось получить CSRF-токен.");

        const formData = new URLSearchParams(currentLot.data);
        formData.set('csrf_token', auth.csrf_token);
        formData.set('offer_id', '0'); // Всегда создаем новый лот
        formData.set('active', 'on'); // Активируем по умолчанию

        const response = await fetch("https://funpay.com/lots/offerSave", {
            method: "POST",
            headers: { 
                "X-Requested-With": "XMLHttpRequest", 
                'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
                'Cookie': `golden_key=${auth.golden_key}`
            },
            body: formData
        });

        if (!response.ok) throw new Error(`Ошибка сети: ${response.statusText}`);
        
        const result = await response.json();
        
        if (result && (result.error === 0 || result.error === false)) {
            currentLot.status = 'success';
            process.currentIndex++;
            await chrome.storage.local.set({ [IMPORT_PROCESS_KEY]: process });
            sendImportProgressUpdate(process);
            setTimeout(processNextLotImport, 500); // Небольшая задержка перед следующим
        } else {
            throw new Error(result.msg || `Неизвестная ошибка API: ${JSON.stringify(result)}`);
        }

    } catch (error) {
        currentLot.retries++;
        currentLot.status = 'pending';
        currentLot.error = error.message;
        await chrome.storage.local.set({ [IMPORT_PROCESS_KEY]: process });
        sendImportProgressUpdate(process);
        
        // Если это была не последняя попытка, делаем таймаут
        if (currentLot.retries < RETRY_LIMIT) {
            setTimeout(processNextLotImport, RETRY_DELAY);
        }
    }
}

// --- КОНЕЦ ИЗМЕНЕННОГО БЛОКА ---


// --- Главный обработчик сообщений ---
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    // Relay parse requests from content scripts to the offscreen document
    if (request.target === 'offscreen') {
        parseHtmlViaOffscreen(request.html, request.action)
            .then(result => sendResponse(result))
            .catch(() => sendResponse(null));
        return true;
    }

    // RMTHUB PROXY (bypasses CORS — content scripts can't fetch cross-origin)
    if (request.action === 'rmthubFetch') {
        (async () => {
            const API = 'https://fptools-ai-server.vercel.app/api';
            try {
                const res = await fetch(`${API}/rmthub?username=${encodeURIComponent(request.username)}`);
                if (res.status === 404) { sendResponse({ ok: false, notFound: true }); return; }
                if (!res.ok) { sendResponse({ ok: false, status: res.status }); return; }
                const json = await res.json();
                if (json.error) { sendResponse({ ok: false, notFound: true }); return; }
                // Fetch avatar
                let avatar = 'https://funpay.com/img/layout/avatar.png';
                const uid = String(json.user?.id || '');
                if (uid) {
                    try {
                        const ar = await fetch(`${API}/avatar?user_id=${uid}`);
                        const aj = await ar.json();
                        if (aj.avatar && aj.avatar !== avatar) avatar = aj.avatar;
                    } catch (_) {}
                }
                sendResponse({ ok: true, data: json, avatar });
            } catch (e) {
                sendResponse({ ok: false, error: String(e) });
            }
        })();
        return true;
    }

    // AI HANDLERS
    if (request.action === "getAIProcessedText") {
        fetchAIResponse(request.text, request.context, request.myUsername, request.type).then(sendResponse);
        return true;
    }
    if (request.action === "generateAILot") {
        fetchAILotGeneration(request.data).then(sendResponse);
        return true;
    }
    if (request.action === "translateLotText") {
        fetchAITranslation(request.data).then(sendResponse);
        return true;
    }
    if (request.action === "getAIImageSettings") {
        fetchAIImageGeneration(request.prompt).then(sendResponse);
        return true;
    }

    // AUTOBUMP HANDLERS
    if (request.action === 'startAutoBump') {
        startAutoBump(request.cooldown).then(() => sendResponse({ success: true }));
        return true;
    }
    if (request.action === 'stopAutoBump') {
        stopAutoBump().then(() => sendResponse({ success: true }));
        return true;
    }
    if (request.action === 'getUserCategories') {
        (async () => {
            try {
                const auth = await getAuthDetailsForBackground();
                if (!auth.userId) throw new Error("Не удалось получить ID пользователя.");
                const userUrl = `https://funpay.com/users/${auth.userId}/`;
                const userPageResponse = await fetch(userUrl, { headers: { 'Cookie': `golden_key=${auth.golden_key}` } });
                if (!userPageResponse.ok) throw new Error(`Ошибка сети: ${userPageResponse.status}`);
                const userPageHtml = await userPageResponse.text();
                const categories = await parseHtmlViaOffscreen(userPageHtml, 'parseUserCategories');
                sendResponse({success: true, data: categories});
            } catch (e) {
                console.error("Error in getUserCategories:", e);
                sendResponse({success: false, error: e.message}); 
            }
        })();
        return true;
    }
    
    // --- ИЗМЕНЕННЫЙ БЛОК: LOT IO HANDLERS ---
    if (request.action === 'getLotForExport') {
        (async () => {
            try {
                const auth = await getAuthDetailsForBackground();
                const editUrl = `https://funpay.com/lots/offerEdit?node=${request.nodeId}&offer=${request.offerId}`;
                const response = await fetch(editUrl, { headers: { 'Cookie': `golden_key=${auth.golden_key}` } });
                if (!response.ok) throw new Error(`Network Error: ${response.status}`);
                const html = await response.text();
                const data = await parseHtmlViaOffscreen(html, 'parseLotEditPage');
                sendResponse({ success: true, data: data });
            } catch (e) {
                sendResponse({ success: false, error: e.message });
            }
        })();
        return true;
    }

    // 2.9: Save/update a single lot (used by bulk editor)
    if (request.action === 'saveSingleLot') {
        (async () => {
            try {
                const auth = await getAuthDetailsForBackground();
                if (!auth.csrf_token) throw new Error('Нет CSRF токена');

                const formData = new URLSearchParams(request.data);
                formData.set('csrf_token', auth.csrf_token);

                const response = await fetch('https://funpay.com/lots/offerSave', {
                    method: 'POST',
                    headers: {
                        'X-Requested-With': 'XMLHttpRequest',
                        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
                        'Cookie': `golden_key=${auth.golden_key}`
                    },
                    body: formData
                });

                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                const result = await response.json();

                if (result && (result.error === 0 || result.error === false)) {
                    sendResponse({ success: true });
                } else {
                    throw new Error(result.msg || 'Неизвестная ошибка API');
                }
            } catch (e) {
                sendResponse({ success: false, error: e.message });
            }
        })();
        return true;
    }

    // 2.9: Get unconfirmed (pending) balance
    if (request.action === 'getUnconfirmedBalance') {
        (async () => {
            try {
                const auth = await getAuthDetailsForBackground();
                const res = await fetch('https://funpay.com/orders/trade?status=paid', {
                    method: 'GET',
                    credentials: 'include',
                    headers: {
                        'Cookie': `golden_key=${auth.golden_key}`
                    }
                });
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                const html = await res.text();
                const data = await parseHtmlViaOffscreen(html, 'parseUnconfirmedBalance');
                sendResponse({ success: true, data });
            } catch (e) {
                sendResponse({ success: false, error: e.message });
            }
        })();
        return true;
    }

    if (request.action === 'startLotImport') {
        (async () => {
            const importProcess = {
                name: request.fileName || `Импорт от ${new Date().toLocaleString()}`,
                state: 'running', // 'running', 'postponed'
                lots: request.lots.map(lot => ({ ...lot, status: 'pending', retries: 0, error: null })),
                currentIndex: 0
            };
            await chrome.storage.local.set({ [IMPORT_PROCESS_KEY]: importProcess });
            sendResponse({ success: true });
            processNextLotImport();
        })();
        return true;
    }

    if (request.action === 'resumeLotImport') {
        (async () => {
             const { [IMPORT_PROCESS_KEY]: process } = await chrome.storage.local.get(IMPORT_PROCESS_KEY);
             if (process) {
                process.state = 'running'; // Меняем статус на "в процессе"
                // Сбрасываем счетчик попыток для всех лотов с ошибками
                process.lots.forEach(lot => {
                    if (lot.status === 'error') {
                        lot.retries = 0;
                        lot.status = 'pending';
                    }
                });
                await chrome.storage.local.set({ [IMPORT_PROCESS_KEY]: process });
                sendResponse({ success: true });
                processNextLotImport(); // Запускаем процесс
             } else {
                sendResponse({ success: false, error: 'Процесс импорта не найден.' });
             }
        })();
        return true;
    }

    if (request.action === 'cancelLotImport') {
        chrome.storage.local.remove(IMPORT_PROCESS_KEY).then(() => sendResponse({success: true}));
        return true;
    }

    if (request.action === 'postponeLotImport') {
        (async () => {
            const { [IMPORT_PROCESS_KEY]: process } = await chrome.storage.local.get(IMPORT_PROCESS_KEY);
            if (process) {
                process.state = 'postponed';
                await chrome.storage.local.set({ [IMPORT_PROCESS_KEY]: process });
                sendResponse({ success: true });
            } else {
                sendResponse({ success: false, error: 'Процесс для откладывания не найден.' });
            }
        })();
        return true;
    }

    if (request.action === 'skipLotImportItem') {
        (async () => {
            const { [IMPORT_PROCESS_KEY]: process } = await chrome.storage.local.get(IMPORT_PROCESS_KEY);
            if (process && process.lots[request.index]) {
                const lot = process.lots[request.index];
                lot.status = 'skipped';
                lot.error = 'Пропущено пользователем';
                await chrome.storage.local.set({ [IMPORT_PROCESS_KEY]: process });
                sendImportProgressUpdate(process);
                
                // Если пропущенный лот был текущим, немедленно запускаем следующий
                if (process.currentIndex === request.index) {
                    processNextLotImport();
                }

                sendResponse({ success: true });
            } else {
                sendResponse({ success: false, error: 'Лот для пропуска не найден.' });
            }
        })();
        return true;
    }
    // --- КОНЕЦ ИЗМЕНЕННОГО БЛОКА ---

    // ACCOUNT & COOKIE HANDLERS
    if (request.action === 'getGoldenKey') {
        (async () => {
            const cookie = await chrome.cookies.get({ url: "https://funpay.com", name: "golden_key" });
            sendResponse({ success: !!cookie, key: cookie ? cookie.value : null });
        })();
        return true;
    }
    if (request.action === 'setGoldenKey') {
        (async () => {
            // Remove PHPSESSID so FunPay creates a fresh session for the new golden_key
            // Without this, FunPay can mismatch session→account and force a logout
            const sessionCookie = await chrome.cookies.get({ url: 'https://funpay.com', name: 'PHPSESSID' });
            if (sessionCookie) {
                await chrome.cookies.remove({ url: 'https://funpay.com', name: 'PHPSESSID' });
            }
            await chrome.cookies.set({
                url: 'https://funpay.com', name: 'golden_key', value: request.key, domain: 'funpay.com',
                path: '/', secure: true, httpOnly: true,
                expirationDate: Math.floor(Date.now() / 1000) + (365 * 24 * 60 * 60)
            });
            chrome.tabs.reload(sender.tab.id);
            sendResponse({ success: true });
        })();
        return true;
    }
    if (request.action === 'deleteCookiesAndReload') {
        (async () => {
            const allCookies = await chrome.cookies.getAll({ url: "https://funpay.com" });
            for (const cookie of allCookies) {
                await chrome.cookies.remove({ url: "https://funpay.com", name: cookie.name, storeId: cookie.storeId });
            }
            chrome.tabs.reload(sender.tab.id);
        })();
        return true;
    }
    
    // SALES STATS HANDLERS
    if (request.action === 'updateSales') {
        runSalesUpdateCycle().then(() => sendResponse({success: true})).catch(e => sendResponse({success: false, error: e.message}));
        return true;
    }
    if (request.action === 'resetSalesStorage') {
        chrome.storage.local.remove([
            'fpToolsSalesData', 'fpToolsFirstOrderId', 'fpToolsLastOrderId', 'fpToolsSalesLastUpdate'
        ]).then(() => sendResponse({success: true}));
        return true;
    }

    // IMPORT & GLOBAL SEARCH HANDLERS
    if (request.action === 'getUserLotsList') {
        (async () => {
            try {
                const response = await fetch(`https://funpay.com/users/${request.userId}/`);
                const html = await response.text();
                const lots = await parseHtmlViaOffscreen(html, 'parseUserLotsList');
                sendResponse(lots);
            } catch (e) {
                sendResponse(null);
            }
        })();
        return true;
    }
    if (request.action === 'searchGames') {
        (async () => {
            try {
                const response = await fetch('https://funpay.com/games/promoFilter', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8', 'X-Requested-With': 'XMLHttpRequest' },
                    body: new URLSearchParams({ query: request.query })
                });
                const data = await response.json();
                const games = await parseHtmlViaOffscreen(data.html, 'parseGameSearchResults');
                sendResponse(games);
            } catch (e) {
                console.error("Error in searchGames:", e);
                sendResponse([]);
            }
        })();
        return true;
    }
    if (request.action === 'getCategoryList' || request.action === 'getLotList') {
        (async () => {
            try {
                const response = await fetch(request.url);
                const html = await response.text();
                const action = request.action === 'getCategoryList' ? 'parseCategoryPage' : 'parseLotListPage';
                const items = await parseHtmlViaOffscreen(html, action);
                sendResponse(items);
            } catch (e) {
                console.error(`Error in ${request.action}:`, e);
                sendResponse([]);
            }
        })();
        return true;
    }

    // ── Support / Tickets handlers ────────────────────────────────────────────
    if (request.action === 'supportGetTickets' || request.action === 'supportGetCategories' ||
        request.action === 'supportGetFields' || request.action === 'supportCreateTicket' ||
        request.action === 'getUnconfirmedOrders' || request.action === 'supportGetTicketDetails' ||
        request.action === 'supportAddComment' || request.action === 'supportCloseTicket') {
        (async () => {
            try {
                const gkCookie = await chrome.cookies.get({ url: 'https://funpay.com', name: 'golden_key' });
                const phpCookie = await chrome.cookies.get({ url: 'https://funpay.com', name: 'PHPSESSID' });
                if (!gkCookie) { sendResponse({ success: false, error: 'Не авторизован на FunPay' }); return; }
                const baseCookie = `golden_key=${gkCookie.value}${phpCookie ? '; PHPSESSID=' + phpCookie.value : ''}`;
                const ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';
                const supportBase = 'https://support.funpay.com';

                async function sfetch(url, opts = {}) {
                    // SSO: first go through funpay.com/support/sso to get support session cookies
                    const resp = await fetch(url, {
                        ...opts,
                        headers: { ...(opts.headers || {}), 'Cookie': baseCookie, 'User-Agent': ua }
                    });
                    return resp;
                }

                async function sfetchSupport(url, opts = {}) {
                    // For support.funpay.com we need to do SSO first to get the session
                    const ssoResp = await fetch('https://funpay.com/support/sso?return_to=' + encodeURIComponent(url.replace(supportBase, '')), {
                        redirect: 'follow',
                        headers: { 'Cookie': baseCookie, 'User-Agent': ua }
                    });
                    // The SSO sets a cookie on support.funpay.com - but we can't read cross-domain cookies
                    // Instead use the direct URL with the same golden_key (funpay SSO shares session)
                    const finalResp = await fetch(url, {
                        ...opts,
                        headers: { ...(opts.headers || {}), 'Cookie': baseCookie, 'User-Agent': ua }
                    });
                    return finalResp;
                }

                if (request.action === 'getUnconfirmedOrders') {
                    const r = await sfetch('https://funpay.com/orders/trade?state=paid');
                    const html = await r.text();
                    const ids = await parseHtmlViaOffscreen(html, 'parseOrdersPage');
                    sendResponse({ success: true, orderIds: (ids || []).slice(0, request.maxOrders || 5) });
                    return;
                }

                if (request.action === 'supportGetTickets') {
                    const r = await sfetchSupport(`${supportBase}/tickets?status=all&order=last_answered&page=1`);
                    const html = await r.text();
                    const tickets = await parseHtmlViaOffscreen(html, 'parseSupportTickets');
                    sendResponse({ success: true, tickets: tickets || [] });
                    return;
                }

                if (request.action === 'supportGetCategories') {
                    const r = await sfetchSupport(`${supportBase}/tickets/new`);
                    const html = await r.text();
                    const categories = await parseHtmlViaOffscreen(html, 'parseSupportCategories');
                    sendResponse({ success: true, categories: categories || [] });
                    return;
                }

                if (request.action === 'supportGetFields') {
                    const r = await sfetchSupport(`${supportBase}/tickets/new/${request.categoryId}`);
                    const html = await r.text();
                    const fields = await parseHtmlViaOffscreen(html, 'parseSupportFields');
                    sendResponse({ success: true, fields: fields || [] });
                    return;
                }

                if (request.action === 'supportCreateTicket') {
                    const { categoryId, fieldValues, message } = request;
                    const formResp = await sfetchSupport(`${supportBase}/tickets/new/${categoryId}`);
                    const formHtml = await formResp.text();
                    const token = await parseHtmlViaOffscreen(formHtml, 'parseSupportFormToken');
                    if (!token) { sendResponse({ success: false, error: 'Не удалось получить токен формы (возможно, не авторизован в ТП)' }); return; }
                    const params = new URLSearchParams();
                    Object.entries(fieldValues || {}).forEach(([k, v]) => { if (v) params.set(k, v); });
                    if (message) params.set('ticket[comment][body_html]', `<p>${message}</p>`);
                    params.set('ticket[comment][attachments]', '');
                    params.set('ticket[_token]', token);
                    const createResp = await fetch(`${supportBase}/tickets/create/${categoryId}`, {
                        method: 'POST',
                        headers: { 'Cookie': baseCookie, 'User-Agent': ua, 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8', 'X-Requested-With': 'XMLHttpRequest', 'Accept': 'application/json', 'Referer': `${supportBase}/tickets/new/${categoryId}` },
                        body: params.toString()
                    });
                    const body = await createResp.text();
                    let ticketId = null;
                    try { ticketId = JSON.parse(body)?.action?.url?.split('/').pop(); } catch (_) {}
                    if (!createResp.ok && createResp.status >= 400) {
                        let errMsg = `Ошибка ${createResp.status}`;
                        try { errMsg = JSON.parse(body)?.error || errMsg; } catch (_) {}
                        sendResponse({ success: false, error: errMsg }); return;
                    }
                    sendResponse({ success: true, ticketId });
                    return;
                }


                if (request.action === 'supportGetTicketDetails') {
                    const r = await fetch(`${supportBase}/tickets/${request.ticketId}`, {
                        headers: { 'Cookie': baseCookie, 'User-Agent': ua }
                    });
                    const html = await r.text();
                    const details = await parseHtmlViaOffscreen(html, 'parseTicketDetails');
                    sendResponse({ success: true, ...details });
                    return;
                }

                if (request.action === 'supportAddComment') {
                    const { ticketId, message, token } = request;
                    const params = new URLSearchParams();
                    params.set('add_comment[comment][body_html]', `<p>${message}</p>`);
                    params.set('add_comment[comment][attachments]', '');
                    params.set('add_comment[_token]', token);
                    const r = await fetch(`${supportBase}/tickets/${ticketId}/comments/create`, {
                        method: 'POST',
                        headers: { 'Cookie': baseCookie, 'User-Agent': ua, 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8', 'X-Requested-With': 'XMLHttpRequest', 'Accept': 'application/json', 'Referer': `${supportBase}/tickets/${ticketId}` },
                        body: params.toString()
                    });
                    if (!r.ok) {
                        let err = `Ошибка ${r.status}`;
                        try { const b = await r.text(); err = JSON.parse(b)?.error || err; } catch(_) {}
                        sendResponse({ success: false, error: err }); return;
                    }
                    sendResponse({ success: true });
                    return;
                }

                if (request.action === 'supportCloseTicket') {
                    const { ticketId } = request;
                    // Get token from ticket page
                    const pageResp = await fetch(`${supportBase}/tickets/${ticketId}`, {
                        headers: { 'Cookie': baseCookie, 'User-Agent': ua }
                    });
                    const pageHtml = await pageResp.text();
                    // Parse token: try close_ticket[_token] input, fallback to data-app-config csrfToken
                    let token = null;
                    const tokenMatch = pageHtml.match(/name="close_ticket\[_token\]"[^>]*value="([^"]+)"/);
                    if (tokenMatch) token = tokenMatch[1];
                    if (!token) {
                        const cfgMatch = pageHtml.match(/data-app-config="([^"]+)"/);
                        if (cfgMatch) {
                            try { token = JSON.parse(cfgMatch[1].replace(/&quot;/g, '"'))?.csrfToken || null; } catch(_) {}
                        }
                    }
                    if (!token) { sendResponse({ success: false, error: 'Не удалось получить токен' }); return; }
                    const closeResp = await fetch(`${supportBase}/tickets/${ticketId}/close`, {
                        method: 'POST',
                        headers: { 'Cookie': baseCookie, 'User-Agent': ua, 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8', 'X-Requested-With': 'XMLHttpRequest', 'Accept': 'application/json' },
                        body: new URLSearchParams({ csrf_token: token }).toString()
                    });
                    sendResponse({ success: closeResp.ok });
                    return;
                }

                sendResponse({ success: false, error: 'Unknown action' });
            } catch (e) {
                console.error('[FPTools Support]', e);
                sendResponse({ success: false, error: e.message });
            }
        })();
        return true;
    }
    return false;
});

// --- Обработчики будильников ---
chrome.alarms.onAlarm.addListener(async (alarm) => {
    if (alarm.name === BUMP_ALARM_NAME) {
        await runBumpCycle();
    }
    if (alarm.name === DISCORD_LOG_ALARM_NAME) {
        await runDiscordCheckCycle();
    }
    // <-- НОВЫЙ ОБРАБОТЧИК -->
    if (alarm.name === AUTO_RESPONDER_ALARM_NAME) {
        await runAutoResponderCycle();
    }
    if (alarm.name === 'fpToolsAutoRestore') {
        // Notify all FunPay tabs to check and restore/disable lots
        const tabs = await chrome.tabs.query({ url: "https://funpay.com/*" });
        tabs.forEach(tab => {
            chrome.tabs.sendMessage(tab.id, { action: 'fpToolsCheckRestoreLots' }).catch(() => {});
        });
    }
});

function setupInitialAlarms() {
    chrome.storage.local.get(['autoBumpEnabled', 'autoBumpCooldown', 'fpToolsDiscord', 'fpToolsAutoReplies'], (settings) => {
        if (settings.autoBumpEnabled && settings.autoBumpCooldown) {
            chrome.alarms.create(BUMP_ALARM_NAME, {
                delayInMinutes: 1,
                periodInMinutes: parseInt(settings.autoBumpCooldown, 10)
            });
            runBumpCycle();
        }
        // 3.0: Periodic lot restore/disable check (every 5 minutes)
        const AUTO_RESTORE_ALARM = 'fpToolsAutoRestore';
        if (settings.fpToolsAutoRestoreEnabled || settings.fpToolsAutoDisableEnabled) {
            chrome.alarms.create(AUTO_RESTORE_ALARM, {
                delayInMinutes: 1,
                periodInMinutes: 5
            });
        }

        if (settings.fpToolsDiscord && settings.fpToolsDiscord.enabled && settings.fpToolsDiscord.webhookUrl) {
            chrome.alarms.create(DISCORD_LOG_ALARM_NAME, {
                delayInMinutes: 1,
                periodInMinutes: 1
            });
            runDiscordCheckCycle();
        }
        // <-- НОВЫЙ БЛОК ДЛЯ АВТООТВЕТЧИКА -->
        const autoReplies = settings.fpToolsAutoReplies || {};
        const arAnyEnabled = autoReplies.greetingEnabled || autoReplies.keywordsEnabled ||
            autoReplies.autoReviewEnabled || autoReplies.bonusForReviewEnabled ||
            autoReplies.newOrderReplyEnabled || autoReplies.orderConfirmReplyEnabled ||
            autoReplies.autoDeliveryEnabled;
        if (arAnyEnabled) {
            chrome.alarms.create(AUTO_RESPONDER_ALARM_NAME, {
                delayInMinutes: 1,
                periodInMinutes: 0.25 // Каждые 15 секунд
            });
            runAutoResponderCycle();
        }
    });
}

chrome.runtime.onStartup.addListener(setupInitialAlarms);

chrome.runtime.onInstalled.addListener((details) => {
    if (details.reason === 'install') {
        chrome.storage.local.set({ 
            autoBumpEnabled: false, 
            autoBumpCooldown: 245,
            showSalesStats: true,
            hideBalance: false,
            viewSellersPromo: true,
            fpToolsDiscord: { enabled: false, webhookUrl: '', pingEveryone: false, pingHere: false }
        });
    }
    
    setupInitialAlarms();
});


chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;

    if (changes.fpToolsDiscord) {
        const newValue = changes.fpToolsDiscord.newValue;
        const isEnabled = newValue && newValue.enabled && newValue.webhookUrl;

        chrome.alarms.get(DISCORD_LOG_ALARM_NAME, (alarm) => {
            if (isEnabled && !alarm) {
                chrome.alarms.create(DISCORD_LOG_ALARM_NAME, { delayInMinutes: 1, periodInMinutes: 1 });
                runDiscordCheckCycle();
            } else if (!isEnabled && alarm) {
                chrome.alarms.clear(DISCORD_LOG_ALARM_NAME);
            }
        });
    }

    // <-- НОВЫЙ БЛОК ДЛЯ УПРАВЛЕНИЯ БУДИЛЬНИКОМ АВТООТВЕТЧИКА -->
    if (changes.fpToolsAutoReplies) {
        const newSettings = changes.fpToolsAutoReplies.newValue || {};
        const isEnabled = newSettings.greetingEnabled || newSettings.keywordsEnabled || newSettings.autoReviewEnabled || newSettings.bonusForReviewEnabled ||
            newSettings.newOrderReplyEnabled || newSettings.orderConfirmReplyEnabled || newSettings.autoDeliveryEnabled;

        chrome.alarms.get(AUTO_RESPONDER_ALARM_NAME, (alarm) => {
            if (isEnabled && !alarm) {
                chrome.alarms.create(AUTO_RESPONDER_ALARM_NAME, { delayInMinutes: 1, periodInMinutes: 0.25 });
                runAutoResponderCycle();
            } else if (!isEnabled && alarm) {
                chrome.alarms.clear(AUTO_RESPONDER_ALARM_NAME);
                resetAutoResponderState(); // 2.8: clear persisted tag on disable
            }
        });
    }
});

chrome.runtime.onUpdateAvailable.addListener(function(details) {
    console.log("FP Tools: доступно обновление до версии " + details.version + ". применение...");
    chrome.runtime.reload();
});