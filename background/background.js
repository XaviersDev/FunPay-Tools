// background/background.js

import { fetchAIResponse, fetchAILotGeneration, fetchAITranslation, fetchAIImageGeneration } from './ai.js';
import { BUMP_ALARM_NAME, startAutoBump, stopAutoBump, runBumpCycle } from './autobump.js';

const OFFSCREEN_DOCUMENT_PATH = 'offscreen/offscreen.html';
const EVENT_CHECK_ALARM_NAME = 'fpToolsEventCheck';
const DISCORD_LOG_ALARM_NAME = 'fpToolsDiscordCheck';
const ANNOUNCEMENT_CHECK_ALARM = 'fpToolsAnnouncementCheck';
let lastChatTag = null;
let lastDiscordChatTag = null;
const ANNOUNCEMENTS_URL = 'https://gist.githubusercontent.com/XaviersDev/d2cf9207d39b55bd50207123e924456c/raw/353f8df2e028b9834b6e313c7b1f24b4acf7a547/fptoolsannouncements'; 

async function fetchAnnouncements() {
    try {
        const response = await fetch(ANNOUNCEMENTS_URL, { cache: "no-store" });
        if (!response.ok) throw new Error(`Network response was not ok: ${response.statusText}`);
        const announcements = await response.json();
        if (!Array.isArray(announcements)) throw new Error("Invalid format");
        return announcements;
    } catch (error) {
        console.error("FP Tools: Failed to fetch announcements:", error);
        return null;
    }
}

async function checkAnnouncements(isForced = false) {
    console.log("FP Tools: Checking for new announcements...");
    const announcements = await fetchAnnouncements();
    if (!announcements || announcements.length === 0) {
        return;
    }

    const latestAnnouncement = announcements[0];
    const { fpToolsLastReadAnnouncementId, fpToolsAnnouncements } = await chrome.storage.local.get(['fpToolsLastReadAnnouncementId', 'fpToolsAnnouncements']);

    const storedAnnouncements = fpToolsAnnouncements || [];
    const newUnreadCount = announcements.filter(a => a.id > (fpToolsLastReadAnnouncementId || 0)).length;

    await chrome.storage.local.set({ 
        fpToolsAnnouncements: announcements,
        fpToolsUnreadCount: newUnreadCount
    });

    updateContentScriptUI(newUnreadCount);

    if (isForced) {
        // Если обновление принудительное, отправляем новые данные на вкладку
        const tabs = await chrome.tabs.query({ url: "*://funpay.com/*" });
        tabs.forEach(tab => {
            chrome.tabs.sendMessage(tab.id, {
                action: 'announcementsUpdated',
                announcements: announcements
            }).catch(e => console.log("Could not send announcement update to tab", e.message));
        });
    }
}

async function updateContentScriptUI(unreadCount) {
    const tabs = await chrome.tabs.query({ url: "*://funpay.com/*" });
    tabs.forEach(tab => {
        chrome.tabs.sendMessage(tab.id, {
            action: 'updateAnnouncementsBadge',
            unreadCount: unreadCount
        }).catch(e => {});
    });
}
// --- КОНЕЦ НОВОГО БЛОКА ---


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

        // ЭТАП 1: Загрузка самых новых заказов (если уже есть данные)
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

        // ЭТАП 2: Инициализация или дозагрузка старых заказов
        let continueToken = lastOrderId;
        if (!firstOrderId) { // Если данных вообще не было
            const { nextOrderId, orders } = await fetchAndParseSales(null);
            if (orders && orders.length > 0) {
                orders.forEach(o => savedOrders[o.orderId] = o);
                firstOrderId = orders[0].orderId;
                lastOrderId = orders[orders.length - 1].orderId;
                await saveSalesData(savedOrders, firstOrderId, lastOrderId);
                console.log(`FP Tools: Инициализация статистики с ${orders.length} заказами.`);
                continueToken = nextOrderId;
            } else {
                continueToken = null; // Нет заказов вообще
            }
        }
        
        // ЭТАП 3: Продолжаем загружать старые заказы до самого конца
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
                // Если на целой странице нет ни одного нового заказа, значит мы всё собрали
                console.log("FP Tools: Все старые заказы уже были загружены. Остановка.");
                break;
            }

            continueToken = nextOrderId;
            await new Promise(resolve => setTimeout(resolve, 500)); // Задержка между запросами
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
                    csrf_token: userData['csrf-token'],
                    userId: userData.userId,
                    username: userData.userName,
                };
            }
        }
        throw new Error("Не удалось найти data-app-data в HTML страницы.");
    } catch (e) {
        console.error("FP Tools: Прямой запрос для получения appData также провалился.", e.message);
        return { golden_key };
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

// Главный цикл проверки событий (Авто-отзывы и Приветствия)
async function runEventCheckCycle() {
    console.log("FP Tools: Запуск цикла проверки событий...");
    const settings = await chrome.storage.local.get(['fpToolsGreetings', 'knownChatIds', 'initialGreetingRunDoneFor']);

    const isGreetingsEnabled = settings.fpToolsGreetings && settings.fpToolsGreetings.enabled;

    if (!isGreetingsEnabled) {
        chrome.alarms.clear(EVENT_CHECK_ALARM_NAME);
        return;
    }

    try {
        const auth = await getAuthDetailsForBackground();
        if (!auth.golden_key || !auth.csrf_token || !auth.userId) {
            throw new Error("Не удалось получить данные авторизации.");
        }

        const allKnownChats = settings.knownChatIds || {};
        const currentUserKnownChats = new Set(allKnownChats[auth.userId] || []);
        
        const allInitialRuns = settings.initialGreetingRunDoneFor || [];
        const isInitialRunForThisUser = !allInitialRuns.includes(auth.userId);

        const runnerPayload = {
            objects: JSON.stringify([{
                type: "chat_bookmarks",
                id: auth.userId,
                tag: lastChatTag || "0000000000",
                data: false
            }]),
            request: false,
            csrf_token: auth.csrf_token
        };

        const response = await fetch("https://funpay.com/runner/", {
            method: "POST",
            headers: {
                "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
                "x-requested-with": "XMLHttpRequest",
                "cookie": `golden_key=${auth.golden_key}`
            },
            body: new URLSearchParams(runnerPayload).toString()
        });

        if (!response.ok) throw new Error(`Runner request failed: ${response.status}`);

        const data = await response.json();
        const chatObject = data.objects.find(o => o.type === "chat_bookmarks");

        if (!chatObject || !chatObject.data || !chatObject.data.html) return;

        lastChatTag = chatObject.tag;

        const parsedChats = await parseHtmlViaOffscreen(chatObject.data.html, 'parseChatList');
        
        if (isGreetingsEnabled && isInitialRunForThisUser && settings.fpToolsGreetings.cacheInitialChats !== false) {
            console.log(`FP Tools: Первый запуск для пользователя ${auth.userId}, кэширую существующие чаты...`);
            parsedChats.forEach(c => currentUserKnownChats.add(c.chatId));
            
            allKnownChats[auth.userId] = Array.from(currentUserKnownChats);
            allInitialRuns.push(auth.userId);

            await chrome.storage.local.set({ 
                knownChatIds: allKnownChats,
                initialGreetingRunDoneFor: allInitialRuns
            });
            console.log(`FP Tools: Для пользователя ${auth.userId} закэшировано ${currentUserKnownChats.size} чатов.`);
            return;
        }
        
        let newChatsFound = false;
        for (const chat of parsedChats) {
            if (isGreetingsEnabled && !currentUserKnownChats.has(chat.chatId)) {
                console.log(`FP Tools: Обнаружен новый чат с ${chat.chatName} (ID: ${chat.chatId}) для пользователя ${auth.userId}. Отправка приветствия.`);
                currentUserKnownChats.add(chat.chatId);
                newChatsFound = true;
                processGreeting(chat, settings.fpToolsGreetings, auth);
            }

        }
        
        if (newChatsFound) {
            allKnownChats[auth.userId] = Array.from(currentUserKnownChats);
            await chrome.storage.local.set({ knownChatIds: allKnownChats });
        }

    } catch (e) {
        console.error(`FP Tools: Ошибка в цикле проверки событий: ${e.message}`);
    }
}


// Функция отправки приветствия
async function processGreeting(chat, settings, auth) {
    try {
        const template = settings.text || "{welcome}, {buyername}!";
        if (!template.trim()) return;

        const getWelcomeMessage = () => {
            const hour = new Date().getHours();
            if (hour >= 5 && hour < 12) return "Доброе утро";
            if (hour >= 12 && hour < 18) return "Добрый день";
            return "Добрый вечер";
        };
        
        let processedText = template
            .replace(/{welcome}/g, getWelcomeMessage())
            .replace(/{buyername}/g, chat.chatName);
        
        const aiRegex = /\{ai:([^}]+)\}/g;
        let match;
        while ((match = aiRegex.exec(processedText)) !== null) {
            const aiPrompt = match[1];
            const aiResult = await fetchAIResponse(aiPrompt, `[Новый чат с пользователем ${chat.chatName}]`, auth.username, "generate");
            processedText = processedText.replace(match[0], aiResult.success ? aiResult.data : `[Ошибка AI]`);
        }

        const runnerPayload = {
            action: "chat_message",
            data: { node: chat.chatId, content: processedText }
        };

        const postResponse = await fetch('https://funpay.com/runner/', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
                'X-Requested-With': 'XMLHttpRequest',
                'cookie': `golden_key=${auth.golden_key}`
            },
            body: new URLSearchParams({
                request: JSON.stringify(runnerPayload),
                csrf_token: auth.csrf_token
            }).toString()
        });

        if (!postResponse.ok) throw new Error(`Ошибка сети при отправке приветствия: ${postResponse.status}`);
        const result = await postResponse.json();
        if (result.response && result.response.error) throw new Error(result.response.error);
        
        console.log(`FP Tools: Приветствие отправлено ${chat.chatName}.`);

    } catch (error) {
        console.error(`FP Tools: Не удалось отправить приветствие ${chat.chatName}:`, error);
    }
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

// Новый цикл проверки специально для Discord
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

        const response = await fetch("https://funpay.com/runner/", {
            method: "POST",
            headers: {
                "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
                "x-requested-with": "XMLHttpRequest",
                "cookie": `golden_key=${auth.golden_key}`
            },
            body: new URLSearchParams(runnerPayload).toString()
        });

        if (!response.ok) throw new Error(`Runner-запрос для Discord провалился: ${response.status}`);

        const data = await response.json();
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


// --- Главный обработчик сообщений ---
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.target === 'offscreen') {
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
                sendResponse(categories);
            } catch (e) {
                console.error("Error in getUserCategories:", e);
                sendResponse([]); 
            }
        })();
        return true;
    }
    
    // --- НОВЫЙ БЛОК: ANNOUNCEMENTS HANDLERS ---
    if (request.action === 'forceCheckAnnouncements') {
        checkAnnouncements(true).then(() => sendResponse({success: true}));
        return true;
    }
    if (request.action === 'markAnnouncementsAsRead') {
        (async () => {
            const { fpToolsAnnouncements } = await chrome.storage.local.get(['fpToolsAnnouncements']);
            if (fpToolsAnnouncements && fpToolsAnnouncements.length > 0) {
                await chrome.storage.local.set({ 
                    fpToolsLastReadAnnouncementId: fpToolsAnnouncements[0].id,
                    fpToolsUnreadCount: 0
                });
                updateContentScriptUI(0);
            }
            sendResponse({success: true});
        })();
        return true;
    }
    // --- КОНЕЦ НОВОГО БЛОКА ---


    // ACCOUNT & COOKIE HANDLERS
    if (request.action === 'getGoldenKey') {
        (async () => {
            const cookie = await chrome.cookies.get({ url: "https://funpay.com", name: "golden_key" });
            sendResponse({ success: !!cookie, key: cookie ? cookie.value : null });
        })();
        return true;
    }
    if (request.action === 'setGoldenKey') {
        chrome.cookies.set({
            url: "https://funpay.com", name: "golden_key", value: request.key, domain: "funpay.com",
            path: "/", secure: true, httpOnly: true, expirationDate: Math.floor(Date.now() / 1000) + (365 * 24 * 60 * 60)
        }).then(() => {
            chrome.tabs.reload(sender.tab.id);
            sendResponse({ success: true });
        });
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
    return false;
});

// --- Обработчики будильников ---
chrome.alarms.onAlarm.addListener(async (alarm) => {
    if (alarm.name === BUMP_ALARM_NAME) {
        await runBumpCycle();
    }
    if (alarm.name === EVENT_CHECK_ALARM_NAME) {
        await runEventCheckCycle();
    }
    if (alarm.name === DISCORD_LOG_ALARM_NAME) {
        await runDiscordCheckCycle();
    }
    if (alarm.name === ANNOUNCEMENT_CHECK_ALARM) { // Новый обработчик
        await checkAnnouncements();
    }
});

function setupInitialAlarms() {
    chrome.storage.local.get(['autoBumpEnabled', 'autoBumpCooldown', 'fpToolsGreetings', 'fpToolsDiscord'], (settings) => {
        if (settings.autoBumpEnabled && settings.autoBumpCooldown) {
            chrome.alarms.create(BUMP_ALARM_NAME, {
                delayInMinutes: 1,
                periodInMinutes: parseInt(settings.autoBumpCooldown, 10)
            });
            runBumpCycle();
        }
        const isGreetingsEnabled = settings.fpToolsGreetings && settings.fpToolsGreetings.enabled;
        if (isGreetingsEnabled) {
             chrome.alarms.create(EVENT_CHECK_ALARM_NAME, {
                delayInMinutes: 1,
                periodInMinutes: 1
            });
            runEventCheckCycle();
        }
        if (settings.fpToolsDiscord && settings.fpToolsDiscord.enabled && settings.fpToolsDiscord.webhookUrl) {
            chrome.alarms.create(DISCORD_LOG_ALARM_NAME, {
                delayInMinutes: 1,
                periodInMinutes: 1
            });
            runDiscordCheckCycle();
        }
    });
    // Новый аларм для объявлений
    chrome.alarms.create(ANNOUNCEMENT_CHECK_ALARM, {
        delayInMinutes: 1, // Проверить через минуту после запуска
        periodInMinutes: 15 // И затем каждые 15 минут
    });
    checkAnnouncements(); // И первая проверка сразу
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
            fpToolsGreetings: { enabled: false, text: '{welcome}, {buyername}!', cacheInitialChats: true },
            fpToolsDiscord: { enabled: false, webhookUrl: '', pingEveryone: false, pingHere: false }
        });
    } else if (details.reason === 'update') {
        chrome.storage.local.get(['fpToolsGreetings'], (settings) => {
            if (typeof settings.fpToolsGreetings?.cacheInitialChats === 'undefined') {
                const updatedGreetings = settings.fpToolsGreetings || { enabled: false, text: '{welcome}, {buyername}!' };
                updatedGreetings.cacheInitialChats = true;
                chrome.storage.local.set({ fpToolsGreetings: updatedGreetings });
            }
        });
    }
    
    setupInitialAlarms();
});


chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;

    if (changes.fpToolsGreetings) {
        chrome.storage.local.get(['fpToolsGreetings'], ({ fpToolsGreetings }) => {
            const isGreetingsEnabled = fpToolsGreetings && fpToolsGreetings.enabled;

            if (isGreetingsEnabled) {
                chrome.alarms.get(EVENT_CHECK_ALARM_NAME, (alarm) => {
                    if (!alarm) {
                        chrome.alarms.create(EVENT_CHECK_ALARM_NAME, { delayInMinutes: 1, periodInMinutes: 1 });
                        runEventCheckCycle();
                    }
                });
            } else {
                chrome.alarms.clear(EVENT_CHECK_ALARM_NAME);
            }
        });
    }

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
});

chrome.runtime.onUpdateAvailable.addListener(function(details) {
    console.log("FP Tools: доступно обновление до версии " + details.version + ". применение...");
    chrome.runtime.reload();
});