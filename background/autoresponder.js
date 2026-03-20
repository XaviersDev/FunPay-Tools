const RX = {
    ORDER_PURCHASED:    /оплатил заказ #([A-Z0-9]{8})/i,
    ORDER_CONFIRMED:    /подтвердил успешное выполнение заказа #([A-Z0-9]{8})/i,
    NEW_FEEDBACK:       /написал отзыв к заказу #([A-Z0-9]{8})/i,
    FEEDBACK_CHANGED:   /изменил отзыв к заказу #([A-Z0-9]{8})/i,
    FEEDBACK_DELETED:   /удалил отзыв к заказу/i,
    ORDER_REOPENED:     /заказ #([A-Z0-9]{8}) открыт повторно/i,
    REFUND:             /вернул деньги покупателю/i,
    PARTIAL_REFUND:     /часть средств по заказу .+ возвращена/i,
    DEAR_VENDORS:       /уважаемые продавцы/i,
    ORDER_ID:           /#([A-Z0-9]{8})/,
};

function getMessageType(text) {
    if (!text) return 'NON_SYSTEM';
    if (RX.DEAR_VENDORS.test(text))     return 'DEAR_VENDORS';
    if (RX.ORDER_PURCHASED.test(text))  return 'ORDER_PURCHASED';
    if (RX.ORDER_CONFIRMED.test(text))  return 'ORDER_CONFIRMED';
    if (RX.NEW_FEEDBACK.test(text))     return 'NEW_FEEDBACK';
    if (RX.FEEDBACK_CHANGED.test(text)) return 'FEEDBACK_CHANGED';
    if (RX.FEEDBACK_DELETED.test(text)) return 'FEEDBACK_DELETED';
    if (RX.ORDER_REOPENED.test(text))   return 'ORDER_REOPENED';
    if (RX.REFUND.test(text))           return 'REFUND';
    if (RX.PARTIAL_REFUND.test(text))   return 'PARTIAL_REFUND';
    return 'NON_SYSTEM';
}

async function getAuth() {
    const goldenKeyCookie = await chrome.cookies.get({ url: 'https://funpay.com', name: 'golden_key' });
    if (!goldenKeyCookie?.value) return {};
    const golden_key = goldenKeyCookie.value;

    
    
    const phpSessIdCookie = await chrome.cookies.get({ url: 'https://funpay.com', name: 'PHPSESSID' });
    const phpsessid = phpSessIdCookie?.value || '';

    const tabs = await chrome.tabs.query({ url: 'https://funpay.com/*' });
    for (const tab of tabs) {
        if (tab.discarded) continue;
        try {
            const r = await chrome.tabs.sendMessage(tab.id, { action: 'getAppData' });
            if (r?.success) {
                const d = Array.isArray(r.data) ? r.data[0] : r.data;
                if (d?.['csrf-token'] && d.userId)
                    return { golden_key, phpsessid, csrf_token: d['csrf-token'], userId: d.userId, username: d.userName };
            }
        } catch (_) {}
    }

    try {
        const cookieStr = phpsessid
            ? `golden_key=${golden_key}; PHPSESSID=${phpsessid}`
            : `golden_key=${golden_key}`;
        const res = await fetch('https://funpay.com/', { headers: { cookie: cookieStr } });
        const text = await res.text();
        const m = text.match(/<body[^>]*data-app-data="([^"]+)"/);
        if (m) {
            const d = JSON.parse(m[1].replace(/&quot;/g, '"'));
            const u = Array.isArray(d) ? d[0] : d;
            if (u?.['csrf-token'] && u.userId)
                return { golden_key, phpsessid, csrf_token: u['csrf-token'], userId: u.userId, username: u.userName };
        }
    } catch (e) {}
    return { golden_key, phpsessid };
}

async function parseViaOffscreen(html, action) {
    const OFFSCREEN_PATH = 'offscreen/offscreen.html';
    const existing = await chrome.runtime.getContexts({
        contextTypes: ['OFFSCREEN_DOCUMENT'],
        documentUrls: [chrome.runtime.getURL(OFFSCREEN_PATH)]
    });
    if (!existing.length) {
        await chrome.offscreen.createDocument({ url: OFFSCREEN_PATH, reasons: ['DOM_PARSER'], justification: 'parse' });
    }
    return chrome.runtime.sendMessage({ target: 'offscreen', action, html });
}

async function sendChatMessage(chatId, text, auth) {
    // FIX: FunPay runner requires BOTH golden_key AND PHPSESSID cookies.
    // Without PHPSESSID the request returns 200 but message is silently dropped.
    const cookieStr = auth.phpsessid
        ? `golden_key=${auth.golden_key}; PHPSESSID=${auth.phpsessid}`
        : `golden_key=${auth.golden_key}`;

    // tag '00000000', last_message: -1 в обоих местах (objects.data и request.data)
    const payload = {
        objects: JSON.stringify([{ type: 'chat_node', id: chatId, tag: '00000000', data: { node: chatId, last_message: -1, content: '' } }]),
        request: JSON.stringify({ action: 'chat_message', data: { node: chatId, last_message: -1, content: text } }),
        csrf_token: auth.csrf_token
    };
    const res = await fetch('https://funpay.com/runner/', {
        method: 'POST',
        headers: {
            'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
            'x-requested-with': 'XMLHttpRequest',
            'cookie': cookieStr
        },
        body: new URLSearchParams(payload)
    });
    if (!res.ok) throw new Error(`sendMessage HTTP ${res.status}`);
    const json = await res.json().catch(() => null);
    if (json?.error) throw new Error(`FunPay runner error: ${json.error}`);
    console.log(`FP Tools AR: → чат ${chatId}`);
}

async function sendReviewReply(orderId, text, auth) {
    const payload = new URLSearchParams({ orderId, text, rating: 5, authorId: auth.userId, csrf_token: auth.csrf_token });
    const res = await fetch('https://funpay.com/orders/review', {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded; charset=UTF-8', 'x-requested-with': 'XMLHttpRequest', cookie: `golden_key=${auth.golden_key}` },
        body: payload
    });
    if (!res.ok) throw new Error(`sendReviewReply HTTP ${res.status}`);
}

function applyVariables(template, vars = {}) {
    const h = new Date().getHours();
    const greeting = h >= 5 && h < 12 ? 'Доброе утро!' : h >= 12 && h < 18 ? 'Добрый день!' : 'Добрый вечер!';
    const now = new Date();
    const pad = n => String(n).padStart(2, '0');
    const dateStr = `${pad(now.getDate())}.${pad(now.getMonth()+1)}.${now.getFullYear()}`;
    const timeStr = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
    const orderLink = vars.orderId ? `https://funpay.com/orders/${vars.orderId}/` : '';

    return template
        
        .replace(/{buyername}/gi,  vars.buyerName  || '')
        .replace(/{lotname}/gi,    vars.lotName    || '')
        .replace(/{orderid}/gi,    vars.orderId    || '')
        .replace(/{orderlink}/gi,  orderLink)
        .replace(/{welcome}/gi,    greeting)
        .replace(/{date}/gi,       `${dateStr} ${timeStr}`)
        
        .replace(/\$username/g,     vars.buyerName  || '')
        .replace(/\$order_id/g,     vars.orderId    || '')
        .replace(/\$order_link/g,   orderLink)
        .replace(/\$order_title/g,  vars.lotName    || '')
        .replace(/\$order_desc/g,   vars.lotName    || '')
        .replace(/\$game/g,         vars.game       || '')
        .replace(/\$category/g,     vars.category   || '')
        .replace(/\$date/g,         dateStr)
        .replace(/\$time/g,         timeStr)
        .replace(/\$chat_name/g,    vars.buyerName  || '');
}

async function atomicUpdate(updater) {
    const { fpToolsAutoReplies = {} } = await chrome.storage.local.get('fpToolsAutoReplies');
    updater(fpToolsAutoReplies);
    await chrome.storage.local.set({ fpToolsAutoReplies });
}

async function isBlacklisted(username, feature) {
    const { fpToolsBlacklist = [] } = await chrome.storage.local.get('fpToolsBlacklist');
    const entry = fpToolsBlacklist.find(e => e.username.toLowerCase() === username?.toLowerCase());
    if (!entry) return false;
    if (feature === 'delivery'     && entry.blockDelivery)     return true;
    if (feature === 'response'     && entry.blockResponse)     return true;
    if (feature === 'notification' && entry.blockNotification) return true;
    return false;
}

async function handleGreeting(msg, auth, settings) {
    if (!settings.greetingEnabled || !settings.greetingText) return;

    
    if (getMessageType(msg.messageText) === 'DEAR_VENDORS') return;

    
    if (settings.ignoreSystemMessages && getMessageType(msg.messageText) !== 'NON_SYSTEM') return;

    
    if (await isBlacklisted(msg.buyerName, 'response')) return;

    
    const cooldownDays = parseFloat(settings.greetingCooldownDays || 0);
    const greetedTimestamps = settings.greetedTimestamps || {};
    const lastGreeted = greetedTimestamps[msg.chatId] || 0;
    const cooldownMs = cooldownDays * 24 * 60 * 60 * 1000;

    if (cooldownDays > 0 && Date.now() - lastGreeted < cooldownMs) return;

    
    if (settings.onlyNewChats) {
        const greetedUsers = settings.greetedUsers || [];
        if (greetedUsers.includes(msg.chatId)) return;
    } else {
        const greetedUsers = settings.greetedUsers || [];
        if (greetedUsers.includes(msg.chatId) && cooldownDays === 0) return;
    }

    const text = applyVariables(settings.greetingText, { buyerName: msg.buyerName, chatId: msg.chatId });

    try {
        await sendChatMessage(msg.chatId, text, auth);
        await atomicUpdate(s => {
            const arr = s.greetedUsers || [];
            if (!arr.includes(msg.chatId)) arr.push(msg.chatId);
            s.greetedUsers = arr;
            const ts = s.greetedTimestamps || {};
            ts[msg.chatId] = Date.now();
            s.greetedTimestamps = ts;
        });
        console.log(`FP Tools AR: приветствие → ${msg.chatId}`);
    } catch (e) {
        console.error('FP Tools AR: ошибка приветствия', e.message);
    }
}

async function handleKeywords(msg, auth, settings) {
    if (!settings.keywordsEnabled || !settings.keywords?.length) return;
    if (getMessageType(msg.messageText) !== 'NON_SYSTEM') return;
    if (await isBlacklisted(msg.buyerName, 'response')) return;

    const lower = msg.messageText.toLowerCase().trim();
    for (const rule of settings.keywords) {
        const kw = rule.keyword.toLowerCase().trim();
        const matches = rule.matchMode === 'contains' ? lower.includes(kw) : lower === kw;
        if (matches) {
            const text = applyVariables(rule.response, { buyerName: msg.buyerName });
            try {
                        await sendChatMessage(msg.chatId, text, auth);
                return;
            } catch (e) {
                console.error('FP Tools AR: ошибка keyword', e.message);
            }
        }
    }
}

async function handleReview(msg, auth, settings) {
    if (!settings.autoReviewEnabled && !settings.bonusForReviewEnabled) return;
    const msgType = getMessageType(msg.messageText);
    if (msgType !== 'NEW_FEEDBACK' && msgType !== 'FEEDBACK_CHANGED') return;

    const orderMatch = msg.messageText.match(RX.ORDER_ID);
    if (!orderMatch) return;
    const orderId = orderMatch[1];

    const alreadyReplied = (settings.repliedOrderIds || []).includes(orderId);
    if (alreadyReplied && msgType === 'NEW_FEEDBACK') return;

    try {
        const orderRes = await fetch(`https://funpay.com/orders/${orderId}/`, { headers: { cookie: `golden_key=${auth.golden_key}` } });
        if (!orderRes.ok) throw new Error(`HTTP ${orderRes.status}`);
        const orderHtml = await orderRes.text();
        const orderData = await parseViaOffscreen(orderHtml, 'parseOrderPageForReview');
        if (!orderData) return;

        const stars   = typeof orderData === 'object' ? orderData.stars   : orderData;
        const lotName = typeof orderData === 'object' ? (orderData.lotName || '') : '';
        const vars = { buyerName: msg.buyerName, lotName, orderId };

        if (settings.autoReviewEnabled && settings.reviewTemplates?.[stars]?.trim()) {
            const text = applyVariables(settings.reviewTemplates[stars], vars);
            try {
                await sendReviewReply(orderId, text, auth);
                await atomicUpdate(s => {
                    const ids = s.repliedOrderIds || [];
                    if (!ids.includes(orderId)) ids.push(orderId);
                    if (ids.length > 500) ids.splice(0, ids.length - 500);
                    s.repliedOrderIds = ids;
                });
            } catch (e) {
                console.error(`FP Tools AR: ошибка ответа на отзыв #${orderId}`, e.message);
            }
        }

        if (settings.bonusForReviewEnabled && stars === 5) {
            let bonusText = '';
            if (settings.bonusMode === 'single' && settings.singleBonusText) bonusText = settings.singleBonusText;
            else if (settings.bonusMode === 'random' && settings.randomBonuses?.length)
                bonusText = settings.randomBonuses[Math.floor(Math.random() * settings.randomBonuses.length)];
            if (bonusText?.trim()) {
                try { await sendChatMessage(msg.chatId, applyVariables(bonusText, vars), auth); }
                catch (e) { console.error(`FP Tools AR: ошибка бонуса #${orderId}`, e.message); }
            }
        }
    } catch (e) {
        console.error(`FP Tools AR: ошибка обработки отзыва #${orderId}`, e.message);
    }
}

async function handleOrderPurchased(msg, auth, settings) {
    if (!settings.newOrderReplyEnabled || !settings.newOrderReplyText) return;

    const orderMatch = msg.messageText.match(RX.ORDER_ID);
    const orderId = orderMatch ? orderMatch[1] : null;
    const vars = { buyerName: msg.buyerName, orderId, orderLink: orderId ? `https://funpay.com/orders/${orderId}/` : '' };
    const text = applyVariables(settings.newOrderReplyText, vars);

    
    if (await isBlacklisted(msg.buyerName, 'response')) return;

    
    const repliedOrders = settings.repliedNewOrders || [];
    if (orderId && repliedOrders.includes(orderId)) return;

    try {
        await sendChatMessage(msg.chatId, text, auth);
        if (orderId) {
            await atomicUpdate(s => {
                const arr = s.repliedNewOrders || [];
                if (!arr.includes(orderId)) arr.push(orderId);
                if (arr.length > 200) arr.splice(0, arr.length - 200);
                s.repliedNewOrders = arr;
            });
        }
        console.log(`FP Tools AR: ответ на новый заказ #${orderId} → чат ${msg.chatId}`);
    } catch (e) {
        console.error('FP Tools AR: ошибка ответа на новый заказ', e.message);
    }
}

async function handleOrderConfirmed(msg, auth, settings) {
    if (!settings.orderConfirmReplyEnabled || !settings.orderConfirmReplyText) return;

    const orderMatch = msg.messageText.match(RX.ORDER_ID);
    const orderId = orderMatch ? orderMatch[1] : null;
    const vars = { buyerName: msg.buyerName, orderId };
    const text = applyVariables(settings.orderConfirmReplyText, vars);

    
    const replied = settings.repliedConfirmedOrders || [];
    if (orderId && replied.includes(orderId)) return;

    if (await isBlacklisted(msg.buyerName, 'response')) return;

    try {
        await sendChatMessage(msg.chatId, text, auth);
        if (orderId) {
            await atomicUpdate(s => {
                const arr = s.repliedConfirmedOrders || [];
                if (!arr.includes(orderId)) arr.push(orderId);
                if (arr.length > 200) arr.splice(0, arr.length - 200);
                s.repliedConfirmedOrders = arr;
            });
        }
        console.log(`FP Tools AR: ответ на подтверждение заказа #${orderId}`);
    } catch (e) {
        console.error('FP Tools AR: ошибка ответа на подтверждение', e.message);
    }
}

async function handleAutoDelivery(msg, auth, settings) {
    if (!settings.autoDeliveryEnabled) return;

    const msgType = getMessageType(msg.messageText);
    if (msgType !== 'ORDER_PURCHASED') return;

    const orderMatch = msg.messageText.match(RX.ORDER_ID);
    if (!orderMatch) return;
    const orderId = orderMatch[1];

    
    if (await isBlacklisted(msg.buyerName, 'delivery')) return;

    
    const delivered = settings.deliveredOrderIds || [];
    if (delivered.includes(orderId)) return;

    try {
        
        const orderRes = await fetch(`https://funpay.com/orders/${orderId}/`, { headers: { cookie: `golden_key=${auth.golden_key}` } });
        if (!orderRes.ok) return;
        const orderHtml = await orderRes.text();

        
        const orderInfo = await parseViaOffscreen(orderHtml, 'parseOrderPageForDelivery');
        if (!orderInfo) return;

        const { secrets, lotId, nodeId, buyerChatId } = orderInfo;
        const chatId = msg.chatId || buyerChatId;

        
        const { fpToolsAutoDeliveryLots = {} } = await chrome.storage.local.get('fpToolsAutoDeliveryLots');
        const deliveryConfig = lotId ? fpToolsAutoDeliveryLots[String(lotId)] : null;

        let deliveryText = '';
        let deliveryMode = 'secrets'; 

        if (deliveryConfig?.mode === 'template' && deliveryConfig.text) {
            deliveryText = applyVariables(deliveryConfig.text, { buyerName: msg.buyerName, orderId });
            deliveryMode = 'template';
        } else if (deliveryConfig?.mode === 'secrets' && secrets) {
            deliveryText = secrets;
            deliveryMode = 'secrets';
        } else if (secrets && !deliveryConfig) {
            
            deliveryText = secrets;
        }

        if (!deliveryText?.trim() || !chatId) return;

        
        const parts = deliveryText.split(/\$sleep=(\d+\.?\d*)/i);
        for (let i = 0; i < parts.length; i++) {
            if (/^\d+\.?\d*$/.test(parts[i])) {
                const sleepSec = parseFloat(parts[i]);
                await new Promise(r => setTimeout(r, sleepSec * 1000));
            } else if (parts[i].trim()) {
                await sendChatMessage(chatId, parts[i].trim(), auth);
                if (i < parts.length - 1) await new Promise(r => setTimeout(r, 500));
            }
        }

        await atomicUpdate(s => {
            const arr = s.deliveredOrderIds || [];
            if (!arr.includes(orderId)) arr.push(orderId);
            if (arr.length > 200) arr.splice(0, arr.length - 200);
            s.deliveredOrderIds = arr;
        });
        console.log(`FP Tools AR: авто-выдача → заказ #${orderId}, чат ${chatId}`);

    } catch (e) {
        console.error(`FP Tools AR: ошибка авто-выдачи #${orderId}`, e.message);
    }
}

async function notifyDearVendors(msg) {
    const tabs = await chrome.tabs.query({ url: 'https://funpay.com/*' });
    tabs.forEach(tab => {
        chrome.tabs.sendMessage(tab.id, {
            action: 'fpToolsDearVendors',
            chatId: msg.chatId,
            buyerName: msg.buyerName
        }).catch(() => {});
    });
}

const RUNNER_TAG_KEY = 'fpToolsAutoResponderTag';

export async function runAutoResponderCycle() {
    const { fpToolsAutoReplies = {} } = await chrome.storage.local.get('fpToolsAutoReplies');

    const anyEnabled =
        fpToolsAutoReplies.greetingEnabled      ||
        fpToolsAutoReplies.keywordsEnabled      ||
        fpToolsAutoReplies.autoReviewEnabled    ||
        fpToolsAutoReplies.bonusForReviewEnabled||
        fpToolsAutoReplies.newOrderReplyEnabled ||
        fpToolsAutoReplies.orderConfirmReplyEnabled ||
        fpToolsAutoReplies.autoDeliveryEnabled;

    if (!anyEnabled) return;

    const auth = await getAuth();
    if (!auth.golden_key || !auth.csrf_token || !auth.userId) return;

    const { [RUNNER_TAG_KEY]: savedTag } = await chrome.storage.local.get(RUNNER_TAG_KEY);

    try {
        const runnerPayload = {
            objects: JSON.stringify([{ type: 'chat_bookmarks', id: auth.userId, tag: savedTag || '00000000', data: false }]),
            request: false,
            csrf_token: auth.csrf_token
        };

        
        const pollingCookieStr = auth.phpsessid
            ? `golden_key=${auth.golden_key}; PHPSESSID=${auth.phpsessid}`
            : `golden_key=${auth.golden_key}`;

        const res = await fetch('https://funpay.com/runner/', {
            method: 'POST',
            headers: { 'content-type': 'application/x-www-form-urlencoded; charset=UTF-8', 'x-requested-with': 'XMLHttpRequest', cookie: pollingCookieStr },
            body: new URLSearchParams(runnerPayload)
        });

        if (!res.ok) throw new Error(`Runner HTTP ${res.status}`);
        const data = await res.json();
        const chatObj = data.objects?.find(o => o.type === 'chat_bookmarks');
        if (!chatObj) return;

        if (chatObj.tag) await chrome.storage.local.set({ [RUNNER_TAG_KEY]: chatObj.tag });
        if (!chatObj.data?.html) return;

        const chats = await parseViaOffscreen(chatObj.data.html, 'parseChatList');
        const { fpToolsAutoReplies: fresh = {} } = await chrome.storage.local.get('fpToolsAutoReplies');
        const processedIds = new Set(fresh.processedMessageIds || []);
        const newIds = [];

        for (const chat of chats) {
            if (!chat.isUnread) continue;
            if (processedIds.has(chat.msgId)) continue;

            const msgType = getMessageType(chat.messageText);

            const msg = {
                chatId:      chat.chatId,
                messageId:   chat.msgId,
                messageText: chat.messageText,
                buyerName:   chat.chatName,
                msgType
            };

            
            if (msgType === 'DEAR_VENDORS') {
                await notifyDearVendors(msg);
            } else if (msgType === 'ORDER_PURCHASED') {
                await handleOrderPurchased(msg, auth, fresh);
                await handleAutoDelivery(msg, auth, fresh);
            } else if (msgType === 'ORDER_CONFIRMED') {
                await handleOrderConfirmed(msg, auth, fresh);
            } else if (msgType === 'NEW_FEEDBACK' || msgType === 'FEEDBACK_CHANGED') {
                await handleReview(msg, auth, fresh);
            } else if (msgType === 'NON_SYSTEM') {
                await handleGreeting(msg, auth, fresh);
                await handleKeywords(msg, auth, fresh);
            }
            

            newIds.push(chat.msgId);
        }

        if (newIds.length > 0) {
            await atomicUpdate(s => {
                let ids = s.processedMessageIds || [];
                ids = [...new Set([...ids, ...newIds])];
                if (ids.length > 500) ids = ids.slice(-500);
                s.processedMessageIds = ids;
            });
        }

    } catch (e) {
        console.error('FP Tools AR: ошибка цикла', e.message);
    }
}

export async function resetAutoResponderState() {
    await chrome.storage.local.remove(RUNNER_TAG_KEY);
}