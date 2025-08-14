import { fetchAIResponse, fetchAILotGeneration, fetchAITranslation, fetchAIReviewResponse } from './ai.js';
import { BUMP_ALARM_NAME, startAutoBump, stopAutoBump, runBumpCycle } from './autobump.js';

const OFFSCREEN_DOCUMENT_PATH = 'offscreen/offscreen.html';
const EVENT_CHECK_ALARM_NAME = 'fpToolsEventCheck';
const DISCORD_LOG_ALARM_NAME = 'fpToolsDiscordCheck';

let lastChatTag = null; 
const processedReviewMessages = new Set(); 
let knownChats = new Set();
let isFirstRun = true;

let lastDiscordChatTag = null;
const processedDiscordMessageIds = new Set();

async function parseHtmlViaOffscreen(html, action = 'parseSalesPage') {
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

async function runSalesUpdateCycle() {
    console.log("FP Tools: Starting sales update cycle.");
    try {
        const data = await chrome.storage.local.get(['fpToolsSalesData', 'fpToolsFirstOrderId', 'fpToolsLastOrderId']);
        let sales = data.fpToolsSalesData || {};
        let firstId = data.fpToolsFirstOrderId || null;
        let lastId = data.fpToolsLastOrderId || null;

        const goldenKeyCookie = await chrome.cookies.get({ url: 'https://funpay.com', name: 'golden_key' });
        if (!goldenKeyCookie) throw new Error("golden_key not found.");
        const headers = { 'Cookie': `golden_key=${goldenKeyCookie.value}` };

        const initialResponse = await fetch('https://funpay.com/orders/trade', { headers });
        if (!initialResponse.ok) throw new Error(`Initial fetch failed: ${initialResponse.status}`);
        const initialHtml = await initialResponse.text();
        const { orders: newestOrders } = await parseHtmlViaOffscreen(initialHtml, 'parseSalesPage');
        
        if (newestOrders && newestOrders.length > 0) {
            newestOrders.forEach(o => sales[o.orderId] = o);
            firstId = newestOrders[0].orderId;
            if (!lastId) {
                lastId = newestOrders[newestOrders.length - 1].orderId;
            }
        }
        
        let currentLastId = lastId;
        for (let i = 0; i < 200; i++) {
            if (!currentLastId) break;
            
            const postResponse = await fetch('https://funpay.com/orders/trade', { 
                method: 'POST', 
                headers: { ...headers, 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
                body: `continue=${currentLastId}`
            });
            if (!postResponse.ok) break;
            
            const postHtml = await postResponse.text();
            const { nextOrderId, orders } = await parseHtmlViaOffscreen(postHtml, 'parseSalesPage');

            if (!orders || orders.length === 0) break;
            
            let reachedExisting = false;
            orders.forEach(o => {
                if(sales[o.orderId] && o.orderId !== currentLastId) reachedExisting = true;
                sales[o.orderId] = o;
            });
            
            currentLastId = orders[orders.length - 1].orderId;
            if (reachedExisting || !nextOrderId) break;
        }

        await chrome.storage.local.set({
            fpToolsSalesData: sales,
            fpToolsFirstOrderId: firstId,
            fpToolsLastOrderId: currentLastId,
            fpToolsSalesLastUpdate: Date.now()
        });

    } catch (e) {
        // console.error("FP Tools: Error during sales update cycle:", e.message);
    } finally {
        console.log("FP Tools: Sales update cycle finished.");
        const existingContexts = await chrome.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT'] });
        if (existingContexts.length > 0) {
            await chrome.offscreen.closeDocument();
        }
    }
}

async function runEventCheckCycle() {
    console.log("FP Tools: Running event check cycle...");
    const { fpToolsAutoReview, fpToolsGreetings } = await chrome.storage.local.get(['fpToolsAutoReview', 'fpToolsGreetings']);

    const isAutoReviewEnabled = fpToolsAutoReview && fpToolsAutoReview.enabled;
    const isGreetingsEnabled = fpToolsGreetings && fpToolsGreetings.enabled;

    if (!isAutoReviewEnabled && !isGreetingsEnabled) {
        chrome.alarms.clear(EVENT_CHECK_ALARM_NAME);
        return;
    }

    try {
        const auth = await getAuthDetailsForBackground();
        if (!auth.golden_key || !auth.csrf_token || !auth.userId) throw new Error("Не удалось получить данные авторизации.");

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

        if (isFirstRun) {
            knownChats = new Set(parsedChats.map(c => c.chat_id));
            isFirstRun = false;
            console.log(`FP Tools: Initialized with ${knownChats.size} known chats.`);
            return;
        }

        for (const chat of parsedChats) {
            if (isGreetingsEnabled && !knownChats.has(chat.chat_id)) {
                console.log(`FP Tools: Found new chat with ${chat.chat_name} (ID: ${chat.chat_id}). Sending greeting.`);
                knownChats.add(chat.chat_id);
                processGreeting(chat, fpToolsGreetings, auth);
            }

            if (isAutoReviewEnabled) {
                const reviewRegex = /(написал отзыв к заказу|изменил отзыв к заказу) #([A-Z0-9]{8})/;
                const match = chat.last_message_text.match(reviewRegex);

                if (match && !processedReviewMessages.has(chat.node_msg_id)) {
                    const orderId = match[2];
                    console.log(`FP Tools: Found new review notification for order #${orderId}.`);
                    processedReviewMessages.add(chat.node_msg_id);
                    processReviewNotification(orderId, fpToolsAutoReview, auth.username);
                }
            }
        }

    } catch (e) {
        // console.error("FP Tools: Error during event check cycle:", e.message);
    }
}

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
            .replace(/{buyername}/g, chat.chat_name);
        
        const aiRegex = /\{ai:([^}]+)\}/g;
        let match;
        while ((match = aiRegex.exec(processedText)) !== null) {
            const aiPrompt = match[1];
            const aiResult = await fetchAIResponse(aiPrompt, "[Новый чат]", auth.username, "generate");
            processedText = processedText.replace(match[0], aiResult.success ? aiResult.data : `[Ошибка AI]`);
        }

        const runnerPayload = {
            action: "chat_message",
            data: { node: chat.chat_id, content: processedText }
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

        if (!postResponse.ok) throw new Error(`Network error on sending greeting: ${postResponse.status}`);
        const result = await postResponse.json();
        if (result.response && result.response.error) throw new Error(result.response.error);
        
        console.log(`FP Tools: Greeting sent to ${chat.chat_name}.`);

    } catch (error) {
        console.error(`FP Tools: Failed to send greeting to ${chat.chat_name}:`, error);
    }
}

async function processReviewNotification(orderId, settings, myUsername) {
    try {
        const auth = await getAuthDetailsForBackground();
        if (!auth.golden_key || !auth.csrf_token || !auth.userId) throw new Error("Auth details unavailable for processing.");
        
        const orderPageResponse = await fetch(`https://funpay.com/orders/${orderId}/`, {
            headers: { "cookie": `golden_key=${auth.golden_key}` }
        });
        if (!orderPageResponse.ok) throw new Error(`Failed to fetch order page for ${orderId}`);
        const orderPageHtml = await orderPageResponse.text();

        const reviewDetails = await parseHtmlViaOffscreen(orderPageHtml, 'parseOrderPageForReview');
        if (!reviewDetails || !reviewDetails.stars) {
            console.log(`FP Tools: No review found on order page #${orderId} or parsing failed.`);
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

        if (!replyText.trim()) return;

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

        if (!postResponse.ok) throw new Error(`Network error on posting review: ${postResponse.status}`);
        const result = await postResponse.json();
        if (result.error) throw new Error(result.msg || 'Неизвестная ошибка API FunPay.');

        console.log(`FP Tools: Successfully posted auto-reply for order #${orderId}`);
        chrome.notifications.create(`review-${orderId}-${Date.now()}`, {
            type: 'basic',
            iconUrl: 'icons/icon128.png',
            title: 'FP Tools: Авто-ответ',
            message: `✅ Успешно отправлен ответ на ${'⭐'.repeat(stars)} отзыв к заказу #${orderId}`
        });

    } catch (error) {
        console.error(`FP Tools: Failed to process review for order #${orderId}:`, error);
        chrome.notifications.create(`review-error-${orderId}-${Date.now()}`,{
            type: 'basic',
            iconUrl: 'icons/icon128.png',
            title: 'FP Tools: Ошибка авто-ответа',
            message: `❌ Не удалось отправить ответ к заказу #${orderId}. Причина: ${error.message}`
        });
    }
}

async function getAuthDetailsForBackground() {
    const goldenKeyCookie = await chrome.cookies.get({ url: 'https://funpay.com', name: 'golden_key' });
    if (!goldenKeyCookie) return {};
    
    const tabs = await chrome.tabs.query({ url: "https://funpay.com/*" });
    for (const tab of tabs) {
        try {
            const response = await chrome.tabs.sendMessage(tab.id, { action: "getAppData" });
            if (response && response.success) {
                const appData = response.data[0] || response.data;
                return {
                    golden_key: goldenKeyCookie.value,
                    csrf_token: appData['csrf-token'],
                    userId: appData.userId,
                    username: appData.userName,
                };
            }
        } catch (e) {}
    }

    try {
        const mainPage = await fetch("https://funpay.com/", { headers: { "cookie": `golden_key=${goldenKeyCookie.value}` } });
        const text = await mainPage.text();
        const appDataMatch = text.match(/<body data-app-data="([^"]+)">/);
        if(appDataMatch) {
            const appData = JSON.parse(appDataMatch[1].replace(/&quot;/g, '"'))[0];
             return {
                golden_key: goldenKeyCookie.value,
                csrf_token: appData['csrf-token'],
                userId: appData.userId,
                username: appData.userName,
            };
        }
    } catch (e) {
        // console.error("FP Tools: Failed to fetch main page for auth details:", e);
    }
    return {};
}

async function runDiscordCheckCycle() {
    console.log("FP Tools: Running Discord check cycle...");
    const { fpToolsDiscord } = await chrome.storage.local.get('fpToolsDiscord');

    if (!fpToolsDiscord || !fpToolsDiscord.enabled || !fpToolsDiscord.webhookUrl) {
        chrome.alarms.clear(DISCORD_LOG_ALARM_NAME);
        return;
    }

    try {
        const auth = await getAuthDetailsForBackground();
        if (!auth.golden_key || !auth.csrf_token || !auth.userId) throw new Error("Не удалось получить данные авторизации.");

        const { lastTag, processedIds } = await chrome.storage.local.get({
            lastTag: '0000000000',
            processedIds: []
        });
        const processedSet = new Set(processedIds);

        const runnerPayload = {
            objects: JSON.stringify([{
                type: "chat_bookmarks",
                id: auth.userId,
                tag: lastTag,
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

        const newTag = chatObject.tag;
        await chrome.storage.local.set({ lastTag: newTag });

        const parsedChats = await parseHtmlViaOffscreen(chatObject.data.html, 'parseChatList');

        for (const chat of parsedChats) {
            if (chat.isUnread && !processedSet.has(chat.msgId)) {
                console.log(`FP Tools: Found new message from ${chat.chatName}, sending to Discord.`);
                sendDiscordNotification(chat, fpToolsDiscord);
                processedSet.add(chat.msgId);
            }
        }
        
        const updatedProcessedIds = Array.from(processedSet).slice(-200);
        await chrome.storage.local.set({ processedIds: updatedProcessedIds });

    } catch (e) {
        // console.error("FP Tools: Error during Discord check cycle:", e.message);
    }
}

async function sendDiscordNotification(chat, settings) {
    let content = "";
    if (settings.pingEveryone) content += "@everyone ";
    if (settings.pingHere) content += "@here ";

    const embed = {
        author: {
            name: chat.chatName,
            url: `https://funpay.com/chat/?node=${chat.chatId}`,
            icon_url: chat.avatarUrl || 'https://funpay.com/img/layout/avatar.png'
        },
        description: chat.messageText,
        color: 3447003,
        timestamp: new Date().toISOString(),
        footer: {
            text: "FunPay Tools"
        }
    };

    const payload = {
        content: content.trim(),
        embeds: [embed]
    };

    try {
        const response = await fetch(settings.webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        if (!response.ok) {
            const errorText = await response.text();
            console.error(`FP Tools: Discord webhook error: ${response.status}`, errorText);
            if (response.status === 404 || response.status === 401) {
                chrome.notifications.create(`discord-error-${Date.now()}`, {
                    type: 'basic', iconUrl: 'icons/icon128.png',
                    title: 'FP Tools: Ошибка Discord',
                    message: `Не удалось отправить уведомление. Пожалуйста, проверьте правильность Webhook URL.`
                });
            }
        }
    } catch (error) {
        console.error('FP Tools: Failed to send Discord notification:', error.message);
    }
}

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
    
    return false;
});

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
            fpToolsGreetings: { enabled: false, text: '{welcome}, {buyername}!' },
            fpToolsDiscord: { enabled: false, webhookUrl: '', pingEveryone: false, pingHere: false }
        });
    } else {
        setupInitialAlarms();
    }
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
                        isFirstRun = true;
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
