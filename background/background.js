// background/background.js

import { fetchAIResponse, fetchAILotGeneration, fetchAITranslation, fetchAIReviewResponse } from './ai.js';
import { BUMP_ALARM_NAME, startAutoBump, stopAutoBump, runBumpCycle } from './autobump.js';

const OFFSCREEN_DOCUMENT_PATH = 'offscreen/offscreen.html';
const EVENT_CHECK_ALARM_NAME = 'fpToolsEventCheck';
const DISCORD_LOG_ALARM_NAME = 'fpToolsDiscordCheck';

// "Память" фонового скрипта для отслеживания событий
let lastChatTag = null;
const processedReviewMessages = new Set();

// --- НОВАЯ "ПАМЯТЬ" СПЕЦИАЛЬНО ДЛЯ DISCORD ---
let lastDiscordChatTag = null;
// const processedDiscordMessageIds = new Set(); // <--- УДАЛЯЕМ ЭТУ СТРОКУ

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
    const settings = await chrome.storage.local.get(['fpToolsAutoReview', 'fpToolsGreetings', 'knownChatIds', 'initialGreetingRunDoneFor']);

    const isAutoReviewEnabled = settings.fpToolsAutoReview && settings.fpToolsAutoReview.enabled;
    const isGreetingsEnabled = settings.fpToolsGreetings && settings.fpToolsGreetings.enabled;

    if (!isAutoReviewEnabled && !isGreetingsEnabled) {
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

            if (isAutoReviewEnabled) {
                const reviewRegex = /(написал отзыв к заказу|изменил отзыв к заказу) #([A-Z0-9]{8})/;
                const match = chat.messageText.match(reviewRegex);
                if (match && !processedReviewMessages.has(chat.msgId)) {
                    const orderId = match[2];
                    console.log(`FP Tools: Обнаружено уведомление об отзыве для заказа #${orderId}.`);
                    processedReviewMessages.add(chat.msgId);
                    processReviewNotification(orderId, settings.fpToolsAutoReview, auth.username);
                }
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

// Функция для обработки отзывов
async function processReviewNotification(orderId, settings, myUsername) {
    try {
        const auth = await getAuthDetailsForBackground();
        if (!auth.golden_key || !auth.csrf_token || !auth.userId) throw new Error("Данные для авторизации недоступны.");

        const orderPageResponse = await fetch(`https://funpay.com/orders/${orderId}/`, {
            headers: { "cookie": `golden_key=${auth.golden_key}` }
        });
        if (!orderPageResponse.ok) throw new Error(`Не удалось загрузить страницу заказа #${orderId}`);
        const orderPageHtml = await orderPageResponse.text();

        const reviewDetails = await parseHtmlViaOffscreen(orderPageHtml, 'parseOrderPageForReview');

        if (reviewDetails && reviewDetails.sellerName && reviewDetails.sellerName !== myUsername) {
            console.log(`FP Tools: Пропуск отзыва к заказу #${orderId}. Пользователь не является продавцом. (Продавец: ${reviewDetails.sellerName}, Пользователь: ${myUsername})`);
            return;
        }

        if (!reviewDetails || !reviewDetails.stars) {
            console.log(`FP Tools: Отзыв на странице заказа #${orderId} не найден или произошла ошибка парсинга.`);
            return;
        }

        const { stars, lotName } = reviewDetails;
        let replyText = '';

        if (settings.mode === 'ai') {
            const prompt = settings.aiPrompt || "Напиши вежливую благодарность за {stars} звездочку. Товар: {lotname}.";
            const finalPrompt = prompt.replace('{stars}', stars).replace('{lotname}', lotName);

            const aiResponse = await fetchAIReviewResponse({
                prompt: finalPrompt, stars, lotName, myUsername
            });

            if (aiResponse && aiResponse.success) {
                replyText = aiResponse.data;
            } else {
                throw new Error(aiResponse.error || 'Ошибка генерации ответа ИИ.');
            }
        } else if (settings.mode === 'manual') {
            replyText = settings.manualReplies[stars] || '';
        } else if (settings.mode === 'random') {
            const options = settings.randomReplies[stars] || [];
            if (options.length > 0) {
                replyText = options[Math.floor(Math.random() * options.length)];
            }
        }

        if (!replyText.trim()) {
            console.log(`FP Tools: Текст ответа для ${stars}⭐ пуст. Пропуск.`);
            return;
        }

        const now = new Date();
        const dateStr = `${now.getDate().toString().padStart(2, '0')}.${(now.getMonth() + 1).toString().padStart(2, '0')}.${now.getFullYear()}`;
        replyText = replyText.replace(/{lotname}/g, lotName).replace(/{date}/g, dateStr);

        const formData = new URLSearchParams();
        formData.append('authorId', auth.userId);
        formData.append('text', replyText);
        formData.append('rating', stars);
        formData.append('csrf_token', auth.csrf_token);
        formData.append('orderId', orderId);

        const postResponse = await fetch('https://funpay.com/orders/review', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
                'X-Requested-With': 'XMLHttpRequest',
                'cookie': `golden_key=${auth.golden_key}`
            },
            body: formData.toString()
        });

        if (!postResponse.ok) throw new Error(`Ошибка сети при публикации ответа: ${postResponse.status}`);
        const result = await postResponse.json();
        if (result.error) throw new Error(result.msg || 'Неизвестная ошибка API FunPay.');

        console.log(`FP Tools: Успешно опубликован авто-ответ для заказа #${orderId}`);
        chrome.notifications.create(`review-${orderId}-${Date.now()}`, {
            type: 'basic',
            iconUrl: 'icons/icon128.png',
            title: 'FP Tools: Авто-ответ',
            message: `✅ Успешно отправлен ответ на ${'⭐'.repeat(stars)} отзыв к заказу #${orderId}`
        });

    } catch (error) {
        console.error(`FP Tools: Не удалось обработать отзыв к заказу #${orderId}:`, error);
        chrome.notifications.create(`review-error-${orderId}-${Date.now()}`, {
            type: 'basic',
            iconUrl: 'icons/icon128.png',
            title: 'FP Tools: Ошибка авто-ответа',
            message: `❌ Не удалось отправить ответ к заказу #${orderId}. Причина: ${error.message}`
        });
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
    // ИЗМЕНЕНИЕ: Загружаем хранилище отправленных сообщений вместе с настройками
    const { fpToolsDiscord, fpToolsProcessedDiscordIds } = await chrome.storage.local.get(['fpToolsDiscord', 'fpToolsProcessedDiscordIds']);

    if (!fpToolsDiscord || !fpToolsDiscord.enabled || !fpToolsDiscord.webhookUrl) {
        chrome.alarms.clear(DISCORD_LOG_ALARM_NAME);
        return;
    }
    
    // ИЗМЕНЕНИЕ: Используем Set, инициализированный из хранилища
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
            // ИЗМЕНЕНИЕ: Проверяем по Set, как и раньше
            if (chat.isUnread && !processedDiscordMessageIds.has(chat.msgId)) {
                await sendDiscordNotification(chat, fpToolsDiscord);
                processedDiscordMessageIds.add(chat.msgId);
                newMessagesToSend = true;
            }
        }

        // ИЗМЕНЕНИЕ: Если были отправлены новые сообщения, сохраняем обновленный Set в хранилище
        if (newMessagesToSend) {
            let idsToStore = Array.from(processedDiscordMessageIds);
            // Ограничиваем размер хранилища, чтобы оно не росло бесконечно
            if (idsToStore.length > 200) {
                idsToStore = idsToStore.slice(-200); // Оставляем только 200 последних ID
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
        return;
    }

    if (request.action === "getAIProcessedText") {
        fetchAIResponse(request.text, request.context, request.myUsername, request.type).then(sendResponse);
        return true;
    }
    if (request.action === "getAIReviewResponse") {
        fetchAIReviewResponse(request).then(sendResponse);
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
    if (request.action === 'startAutoBump') {
        startAutoBump(request.cooldown).then(() => sendResponse({ success: true }));
        return true;
    }
    if (request.action === 'stopAutoBump') {
        stopAutoBump().then(() => sendResponse({ success: true }));
        return true;
    }
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
});

function setupInitialAlarms() {
    chrome.storage.local.get(['autoBumpEnabled', 'autoBumpCooldown', 'fpToolsAutoReview', 'fpToolsGreetings', 'fpToolsDiscord'], (settings) => {
        if (settings.autoBumpEnabled && settings.autoBumpCooldown) {
            chrome.alarms.create(BUMP_ALARM_NAME, {
                delayInMinutes: 1,
                periodInMinutes: parseInt(settings.autoBumpCooldown, 10)
            });
            runBumpCycle();
        }
        const isAutoReviewEnabled = settings.fpToolsAutoReview && settings.fpToolsAutoReview.enabled;
        const isGreetingsEnabled = settings.fpToolsGreetings && settings.fpToolsGreetings.enabled;
        if (isAutoReviewEnabled || isGreetingsEnabled) {
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
            fpToolsAutoReview: { enabled: false, mode: 'ai' },
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

    if (changes.fpToolsAutoReview || changes.fpToolsGreetings) {
        chrome.storage.local.get(['fpToolsAutoReview', 'fpToolsGreetings'], ({ fpToolsAutoReview, fpToolsGreetings }) => {
            const isAutoReviewEnabled = fpToolsAutoReview && fpToolsAutoReview.enabled;
            const isGreetingsEnabled = fpToolsGreetings && fpToolsGreetings.enabled;

            if (isAutoReviewEnabled || isGreetingsEnabled) {
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

// Пустая функция для совместимости
function runSalesUpdateCycle() {}