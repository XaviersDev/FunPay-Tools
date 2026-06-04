// FP Tools-style random per-cycle tag. Importing lazily-safe value here keeps this module
// self-contained even if the engine module isn't loaded.
function randomTag() {
    return Math.floor(Math.random() * 0xffffffff).toString(16).padStart(8, '0');
}

// 3.0 FIX (Cardinal parity): every message the bot sends in the background is prefixed with
// an invisible marker character. When we later read the chat list, if the last message starts
// with this marker we KNOW it was sent by us and must NOT react to it. Without this the
// autoresponder could re-trigger on its own replies (the "spam 1000 times" symptom) whenever
// the per-chat id bookkeeping had any race. Cardinal uses U+2061; we use the same so messages
// stay invisible and consistent.
const BOT_MARKER = '\u2061';
const OLD_BOT_MARKER = '\u2064';
function markOutgoing(text) {
    const t = (text == null) ? '' : String(text);
    if (!t) return t;
    // don't double-mark
    if (t.startsWith(BOT_MARKER) || t.startsWith(OLD_BOT_MARKER)) return t;
    return BOT_MARKER + t;
}
function isBotMarked(text) {
    return typeof text === 'string' && (text.startsWith(BOT_MARKER) || text.startsWith(OLD_BOT_MARKER));
}

// 3.0: resilient fetch - retries transient failures (network blips, 429/5xx) with backoff.
// This is a major source of "send worked on the 3rd-4th try": a single transient failure
// used to drop the whole action. Now we retry before giving up.
async function fetchWithRetry(url, options, { retries = 4, baseDelay = 800 } = {}) {
    let lastErr;
    for (let attempt = 0; attempt <= retries; attempt++) {
        try {
            const res = await fetch(url, options);
            // Retry on rate-limit / server errors; return everything else to caller.
            if (res.status === 429 || res.status >= 500) {
                lastErr = new Error(`HTTP ${res.status}`);
            } else {
                return res;
            }
        } catch (e) {
            lastErr = e;
        }
        if (attempt < retries) {
            const delay = baseDelay * Math.pow(2, attempt) + Math.random() * 400;
            await new Promise(r => setTimeout(r, delay));
        }
    }
    throw lastErr || new Error('fetchWithRetry: exhausted');
}

const RX = {
    // 3.0: now match BOTH Russian and English FunPay system messages. Previously only Russian
    // was matched, so on English-language accounts every system message was misclassified as
    // NON_SYSTEM and wrongly got a greeting/keyword reply - i.e. "ignore system messages" did
    // nothing. Patterns mirror FP Tools's RegularExpressions.
    ORDER_PURCHASED:    /(оплатил заказ|has paid for order) #([A-Z0-9]{8})/i,
    ORDER_CONFIRMED:    /(подтвердил успешное выполнение заказа|has confirmed that order) #([A-Z0-9]{8})/i,
    NEW_FEEDBACK:       /(написал отзыв к заказу|has given feedback to the order) #([A-Z0-9]{8})/i,
    FEEDBACK_CHANGED:   /(изменил отзыв к заказу|has edited their feedback to the order) #([A-Z0-9]{8})/i,
    FEEDBACK_DELETED:   /(удалил отзыв к заказу|has deleted their feedback to the order)/i,
    ORDER_REOPENED:     /(заказ #([A-Z0-9]{8}) открыт повторно|order #([A-Z0-9]{8}) reopened)/i,
    REFUND:             /(вернул деньги покупателю|returned the money to the buyer|refund)/i,
    PARTIAL_REFUND:     /(часть средств по заказу .+ возвращена|part of the funds for order)/i,
    DEAR_VENDORS:       /(уважаемые продавцы|dear vendors|dear sellers)/i,
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
    const markedText = markOutgoing(text);
    const payload = {
        objects: JSON.stringify([{ type: 'chat_node', id: chatId, tag: '00000000', data: { node: chatId, last_message: -1, content: '' } }]),
        request: JSON.stringify({ action: 'chat_message', data: { node: chatId, last_message: -1, content: markedText } }),
        csrf_token: auth.csrf_token
    };
    const res = await fetchWithRetry('https://funpay.com/runner/', {
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

// 3.0: upload an image (data URL) to FunPay and send it to a chat, in the background.
async function sendChatImage(chatId, dataUrl, auth) {
    const cookieStr = auth.phpsessid
        ? `golden_key=${auth.golden_key}; PHPSESSID=${auth.phpsessid}`
        : `golden_key=${auth.golden_key}`;

    const blob = await (await fetch(dataUrl)).blob();
    const fd = new FormData();
    fd.append('file', new File([blob], 'image.png', { type: blob.type || 'image/png' }));
    fd.append('file_id', '0');

    const upRes = await fetchWithRetry('https://funpay.com/file/addChatImage', {
        method: 'POST',
        headers: { 'cookie': cookieStr, 'x-requested-with': 'XMLHttpRequest' },
        body: fd
    });
    if (!upRes.ok) throw new Error(`uploadImage HTTP ${upRes.status}`);
    const upJson = await upRes.json().catch(() => ({}));
    const fileId = upJson.fileId;
    if (!fileId) throw new Error('addChatImage: no fileId');

    const payload = {
        objects: JSON.stringify([{ type: 'chat_node', id: chatId, tag: '00000000', data: { node: chatId, last_message: -1, content: '' } }]),
        request: JSON.stringify({ action: 'chat_message', data: { node: chatId, last_message: -1, content: '', image_id: fileId } }),
        csrf_token: auth.csrf_token
    };
    const res = await fetchWithRetry('https://funpay.com/runner/', {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded; charset=UTF-8', 'x-requested-with': 'XMLHttpRequest', 'cookie': cookieStr },
        body: new URLSearchParams(payload)
    });
    if (!res.ok) throw new Error(`sendImage HTTP ${res.status}`);
    const json = await res.json().catch(() => null);
    if (json?.error) throw new Error(`FunPay runner error: ${json.error}`);
    console.log(`FP Tools AR: 🖼 → чат ${chatId}`);
}

// 3.0: send autoreply content that may contain [image:dataURL] tags. Pieces are sent in the
// SAME ORDER they appear in the text - so "text [image:...]" sends text then image, and
// "[image:...] text" sends image then text. This is the send-order control (order = position).
async function sendReplyContent(chatId, content, auth, images, sendOrder) {
    const imgs = Array.isArray(images) ? images.filter(Boolean) : [];
    const text = (content || '').trim();
    const order = (sendOrder === 'image_first') ? 'image_first' : 'text_first';

    const sendText = async () => { if (text) await sendChatMessage(chatId, text, auth); };
    const sendImages = async (delayFirst) => {
        for (let i = 0; i < imgs.length; i++) {
            try {
                if (delayFirst || i > 0) await new Promise(r => setTimeout(r, 400));
                await sendChatImage(chatId, imgs[i], auth);
            } catch (e) {
                console.error('FP Tools AR: ошибка отправки картинки автоответа', e.message);
            }
        }
    };

    // Send in the chosen order (text→image OR image→text), in the background.
    if (order === 'image_first') {
        await sendImages(false);
        if (text && imgs.length) await new Promise(r => setTimeout(r, 400));
        await sendText();
    } else {
        await sendText();
        await sendImages(!!text);
    }
}

async function sendReviewReply(orderId, text, auth, rating) {
    // Cardinal parity: pass the ACTUAL star rating (hardcoding 5 caused FunPay to reject
    // replies to non-5-star reviews → "auto-reviews work через раз"), and append the bot
    // marker so we never re-trigger on our own reply.
    const stars = (rating >= 1 && rating <= 5) ? rating : '';
    const markedText = text ? (text + BOT_MARKER) : text;
    const payload = new URLSearchParams({ orderId, text: markedText, rating: stars, authorId: auth.userId, csrf_token: auth.csrf_token });
    const res = await fetchWithRetry('https://funpay.com/orders/review', {
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
        await sendReplyContent(msg.chatId, text, auth, settings.greetingImages, settings.greetingSendOrder);
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

    // 3.0: strip zero-width identifier chars and collapse whitespace before matching.
    // Bug fix: exact-match ("точно") commands failed because incoming messages can carry
    // invisible zero-width chars (FunPay/identifier signatures) or trailing whitespace, so
    // `lower === kw` never matched even when the message WAS the command. "contains" survived
    // by accident. Now both modes compare against a cleaned string.
    const clean = msg.messageText
        .replace(/[\u200B\u200C\u200D\uFEFF\u2060]/g, '')  // zero-width chars
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase();

    for (const rule of settings.keywords) {
        const kw = rule.keyword
            .replace(/[\u200B\u200C\u200D\uFEFF\u2060]/g, '')
            .replace(/\s+/g, ' ')
            .trim()
            .toLowerCase();
        if (!kw) continue;
        const matches = rule.matchMode === 'contains' ? clean.includes(kw) : clean === kw;
        if (matches) {
            const text = applyVariables(rule.response, { buyerName: msg.buyerName });
            try {
                await sendReplyContent(msg.chatId, text, auth, rule.images, rule.sendOrder);
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
        const orderRes = await fetchWithRetry(`https://funpay.com/orders/${orderId}/`, { headers: { cookie: `golden_key=${auth.golden_key}` } });
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
                await sendReviewReply(orderId, text, auth, stars);
                await atomicUpdate(s => {
                    const ids = s.repliedOrderIds || [];
                    if (!ids.includes(orderId)) ids.push(orderId);
                    if (ids.length > 500) ids.splice(0, ids.length - 500);
                    s.repliedOrderIds = ids;
                });
                // attached review images go to the chat (the review endpoint can't carry images)
                const rImgs = settings.reviewTemplateImages && settings.reviewTemplateImages[stars];
                if (Array.isArray(rImgs) && rImgs.length) {
                    for (const dataUrl of rImgs) {
                        try { await sendChatImage(msg.chatId, dataUrl, auth); await new Promise(r => setTimeout(r, 400)); }
                        catch (e) { console.error('FP Tools AR: review image error', e.message); }
                    }
                }
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
                try { await sendReplyContent(msg.chatId, applyVariables(bonusText, vars), auth); }
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
        await sendReplyContent(msg.chatId, text, auth, settings.newOrderReplyImages, settings.newOrderReplySendOrder);
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
        await sendReplyContent(msg.chatId, text, auth, settings.orderConfirmReplyImages, settings.orderConfirmReplySendOrder);
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
        
        const orderRes = await fetchWithRetry(`https://funpay.com/orders/${orderId}/`, { headers: { cookie: `golden_key=${auth.golden_key}` } });
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

// 3.0 FIX (Cardinal __is_running parity): a hard reentrancy lock. The engine drives this from
// THREE layers (active loop, heartbeat alarm, watchdog). Without a lock, if one cycle is still
// sending replies (awaiting network + inter-message delays) when another layer fires, both read
// the SAME chat before lastSeenMsgIds is written at the end of the cycle - and both send. That
// is the root cause of "replied 1000000 times". The lock makes overlapping calls no-op instead.
let __arCycleRunning = false;

export async function runAutoResponderCycle() {
    if (__arCycleRunning) return;          // a cycle is already in flight - skip this trigger
    __arCycleRunning = true;
    try {
        await _runAutoResponderCycleInner();
    } finally {
        __arCycleRunning = false;
    }
}

async function _runAutoResponderCycleInner() {
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

    try {
        // FP Tools's approach: use a FRESH RANDOM tag every cycle. A single persisted tag
        // (the old behaviour) goes stale and FunPay stops returning chat updates - the
        // classic "autoresponder stops working until reload". We also request
        // orders_counters alongside chat_bookmarks so order events surface immediately.
        const msgTag = randomTag();
        const orderTag = randomTag();

        const runnerPayload = {
            objects: JSON.stringify([
                { type: 'chat_bookmarks',  id: auth.userId, tag: msgTag,   data: false },
                { type: 'orders_counters', id: auth.userId, tag: orderTag, data: false }
            ]),
            request: false,
            csrf_token: auth.csrf_token
        };

        // FunPay runner requires BOTH golden_key AND PHPSESSID - without PHPSESSID it
        // returns 200 but silently drops the request.
        const pollingCookieStr = auth.phpsessid
            ? `golden_key=${auth.golden_key}; PHPSESSID=${auth.phpsessid}`
            : `golden_key=${auth.golden_key}`;

        const res = await fetchWithRetry('https://funpay.com/runner/', {
            method: 'POST',
            headers: { 'content-type': 'application/x-www-form-urlencoded; charset=UTF-8', 'x-requested-with': 'XMLHttpRequest', cookie: pollingCookieStr },
            body: new URLSearchParams(runnerPayload)
        }, { retries: 2, baseDelay: 600 });

        if (!res.ok) throw new Error(`Runner HTTP ${res.status}`);
        const data = await res.json();
        const chatObj = data.objects?.find(o => o.type === 'chat_bookmarks');
        if (!chatObj || !chatObj.data?.html) return;

        const chats = await parseViaOffscreen(chatObj.data.html, 'parseChatList');
        const { fpToolsAutoReplies: fresh = {} } = await chrome.storage.local.get('fpToolsAutoReplies');

        // Cardinal-style per-chat tracking: lastSeenMsgIds[chatId] = highest message id we've
        // already handled for that chat. We only act when a chat's current last-message id is
        // STRICTLY GREATER than what we've seen - this prevents re-greeting the same chat every
        // 3s cycle (which also caused the "all chats get marked read" symptom, because each
        // bogus reply marked a chat read).
        const lastSeen = fresh.lastSeenMsgIds || {};

        // FIRST-RUN SEEDING: if we've never tracked anything yet, just record current state and
        // DO NOT act. Otherwise enabling the autoresponder would instantly greet/reply to every
        // existing unread chat at once (mass spam + mass read). Cardinal does the same on its
        // first request.
        const isFirstRun = !fresh.autoResponderSeeded;

        const updates = {}; // chatId -> newest msgId to persist
        const textUpdates = {}; // chatId -> last handled message text (Cardinal text guard)

        for (const chat of chats) {
            const nodeMsg = chat.nodeMsg;            // last message id in the chat
            const userMsg = chat.userMsg;            // last id the account has read
            const prevSeen = lastSeen[chat.chatId] || 0;

            // Determine if this chat has a genuinely new inbound message.
            // Cardinal parity: a message is "new" purely when its node_msg_id is higher than
            // what we last handled (runner_last_messages: `if node_msg_id <= prev: continue`).
            // We deliberately do NOT gate on user_msg here: if the seller happened to open/read
            // the chat before the cycle ran, FunPay bumps user_msg and the old `nodeMsg>userMsg`
            // check would suppress the reply - that was the real "autoreply works через раз".
            // Replying to our own message is prevented by the bot-marker (lastByBot) below, not
            // by user_msg.
            let hasNew;
            if (nodeMsg != null) {
                hasNew = nodeMsg > prevSeen;
            } else {
                hasNew = chat.isUnread && !( (fresh.processedMessageIds || []).includes(chat.msgId) );
            }

            // 3.0 FIX (Cardinal parity): if the chat's LAST message was sent by us (carries the
            // bot marker), never react - just advance the marker. This is the primary defence
            // against the autoresponder replying to its own messages / spamming a chat.
            if (chat.lastByBot) {
                if (nodeMsg != null) updates[chat.chatId] = Math.max(prevSeen, nodeMsg);
                continue;
            }

            if (!hasNew) continue;

            // Always advance our per-chat marker so we never re-handle this id, even on first run.
            if (nodeMsg != null) updates[chat.chatId] = Math.max(prevSeen, nodeMsg);

            if (isFirstRun) continue; // seed only, do not act on pre-existing messages

            // Cardinal parity (runner_last_messages text guard): defence-in-depth for keyword
            // replies, which - unlike orders/reviews - have no orderId to dedup on. If the chat's
            // last message text is IDENTICAL to the last text we already handled for this chat, we
            // skip. This catches the edge case where the id check or bot-marker fails (e.g. FunPay
            // strips the marker from the chat-list preview) and would otherwise let a keyword fire
            // twice on the same message.
            const lastText = (fresh.lastHandledText || {})[chat.chatId];
            const isSameText = lastText != null && lastText === chat.messageText;

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
            } else if (msgType === 'NON_SYSTEM' && !isSameText) {
                await handleGreeting(msg, auth, fresh);
                await handleKeywords(msg, auth, fresh);
            }

            // remember the text we just handled for this chat (text guard above)
            textUpdates[chat.chatId] = chat.messageText;
        }

        if (Object.keys(updates).length > 0 || Object.keys(textUpdates).length > 0 || isFirstRun) {
            await atomicUpdate(s => {
                const m = s.lastSeenMsgIds || {};
                for (const [cid, id] of Object.entries(updates)) {
                    m[cid] = Math.max(m[cid] || 0, id);
                }
                // cap size
                const keys = Object.keys(m);
                if (keys.length > 1000) {
                    // drop the lowest-id (oldest) entries
                    keys.sort((a, b) => m[a] - m[b]).slice(0, keys.length - 1000).forEach(k => delete m[k]);
                }
                s.lastSeenMsgIds = m;

                // text guard store (Cardinal runner_last_messages parity)
                const t = s.lastHandledText || {};
                for (const [cid, txt] of Object.entries(textUpdates)) t[cid] = txt;
                const tkeys = Object.keys(t);
                if (tkeys.length > 1000) {
                    // drop oldest by id ordering if available, else arbitrary
                    tkeys.slice(0, tkeys.length - 1000).forEach(k => delete t[k]);
                }
                s.lastHandledText = t;

                s.autoResponderSeeded = true;
            });
        }

    } catch (e) {
        console.error('FP Tools AR: ошибка цикла', e.message);
    }
}

export async function resetAutoResponderState() {
    await chrome.storage.local.remove(RUNNER_TAG_KEY);
    // also clear per-chat tracking so re-enabling re-seeds cleanly
    await chrome.storage.local.get('fpToolsAutoReplies').then(({ fpToolsAutoReplies = {} }) => {
        delete fpToolsAutoReplies.lastSeenMsgIds;
        delete fpToolsAutoReplies.lastHandledText;
        delete fpToolsAutoReplies.autoResponderSeeded;
        return chrome.storage.local.set({ fpToolsAutoReplies });
    });
}