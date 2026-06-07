// background/background.js - FunPay Tools 2.8

import { fetchAIResponse, fetchAILotGeneration, fetchAITranslation, fetchAIImageGeneration } from './ai.js';
import { BUMP_ALARM_NAME, startAutoBump, stopAutoBump, runBumpCycle } from './autobump.js';
import { runAutoResponderCycle, resetAutoResponderState } from './autoresponder.js';
import { startEngine, stopEngine, onHeartbeat, onKeepalivePing, ENGINE_HEARTBEAT_ALARM } from './fpt_engine.js';
import { startSmartBump, stopSmartBump, runSmartBumpCycle, SMART_BUMP_ALARM } from './smart_bump.js';
import {
    TELEGRAM_ALARM, telegramInit, telegramSyncAlarm, telegramPollOnce,
    telegramValidateAndResolve, telegramNotifyNewMessages, telegramNotifyNewOrders, tgSendMessage
} from './telegram.js';

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
            // 3.0: 429-aware retry. FunPay rate-limits stats pagination; on 429/5xx we back off
            // and retry instead of throwing and killing the whole cycle.
            let response;
            for (let attempt = 0; attempt < 4; attempt++) {
                response = await fetch(url, options);
                if (response.status === 429 || response.status >= 500) {
                    await new Promise(r => setTimeout(r, 3000 * (attempt + 1) + Math.random() * 1000));
                    continue;
                }
                break;
            }
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
                await new Promise(resolve => setTimeout(resolve, 1200)); // 3.0: slower to avoid 429
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
            await new Promise(resolve => setTimeout(resolve, 1200)); // 3.0: slower to avoid 429
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
// 3.0: Upload an image to FunPay and send it to a chat via the runner - all in background.
// Ported from FP Tools (Account.upload_image + Account.send_image).
async function sendChatImageInBackground(chatId, dataUrl, chatName) {
    const auth = await getAuthDetailsForBackground();
    if (!auth.golden_key || !auth.csrf_token) throw new Error('Нет авторизации для отправки изображения.');
    const cookieStr = auth.phpsessid
        ? `golden_key=${auth.golden_key}; PHPSESSID=${auth.phpsessid}`
        : `golden_key=${auth.golden_key}`;

    // 1) dataURL → Blob
    const blob = await (await fetch(dataUrl)).blob();

    // 2) Upload to FunPay (multipart) → fileId
    const fd = new FormData();
    fd.append('file', new File([blob], 'image.png', { type: blob.type || 'image/png' }));
    fd.append('file_id', '0');
    const upRes = await fetch('https://funpay.com/file/addChatImage', {
        method: 'POST',
        headers: { 'cookie': cookieStr, 'x-requested-with': 'XMLHttpRequest' },
        body: fd
    });
    if (!upRes.ok) throw new Error(`Загрузка изображения: HTTP ${upRes.status}`);
    const upJson = await upRes.json().catch(() => ({}));
    const fileId = upJson.fileId;
    if (!fileId) throw new Error('FunPay не вернул fileId: ' + (upJson.msg || 'неизвестная ошибка'));

    // 3) Send via runner with image_id (content empty), per FP Tools's protocol.
    const request = { action: 'chat_message', data: { node: chatId, last_message: -1, content: '', image_id: fileId } };
    const payload = {
        objects: JSON.stringify([{ type: 'chat_node', id: chatId, tag: '00000000', data: { node: chatId, last_message: -1, content: '' } }]),
        request: JSON.stringify(request),
        csrf_token: auth.csrf_token
    };
    const sendRes = await fetch('https://funpay.com/runner/', {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded; charset=UTF-8', 'x-requested-with': 'XMLHttpRequest', 'cookie': cookieStr },
        body: new URLSearchParams(payload)
    });
    if (!sendRes.ok) throw new Error(`Отправка изображения: HTTP ${sendRes.status}`);
    const sendJson = await sendRes.json().catch(() => null);
    if (sendJson?.error) throw new Error(`FunPay runner: ${sendJson.error}`);
    return { fileId };
}

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

// ── Telegram integration deps ─────────────────────────────────────────────────
// Получить последние заказы (детально) для уведомлений/команд.
async function tgFetchOrders(limit) {
    try {
        const auth = await getAuthDetailsForBackground();
        if (!auth.golden_key) return [];
        // credentials:'include' заставляет браузер приложить настоящие cookie
        // активной сессии (ручной заголовок Cookie браузер игнорирует — forbidden header).
        const resp = await fetch('https://funpay.com/orders/trade', {
            credentials: 'include',
            cache: 'no-store'
        });
        if (!resp.ok) return [];
        // Если нас разлогинило/редиректнуло на страницу входа — не считаем это заказами.
        if (/\/account\/login/.test(resp.url)) return [];
        const html = await resp.text();
        const orders = await parseHtmlViaOffscreen(html, 'parseOrdersDetailed');
        const arr = Array.isArray(orders) ? orders : [];
        return (limit && limit > 0) ? arr.slice(0, limit) : arr;
    } catch (e) {
        console.error('FP Tools: tgFetchOrders error:', e.message);
        return [];
    }
}

// Получить базовую информацию профиля (имя, баланс).
async function tgFetchProfileInfo() {
    try {
        const auth = await getAuthDetailsForBackground();
        if (!auth.golden_key) return null;
        const resp = await fetch('https://funpay.com/', { credentials: 'include', cache: 'no-store' });
        const html = await resp.text();
        const info = await parseHtmlViaOffscreen(html, 'parseProfileInfo');
        const orders = await tgFetchOrders(0);
        // "Активные" = заказы, требующие действия (оплачен/в работе), а не вся история.
        const activeStatuses = ['paid', 'active', 'pending', 'оплачен', 'в работе'];
        const activeCount = orders.filter(o => {
            const s = String(o.status || o.orderStatus || '').toLowerCase();
            if (!s) return false;
            return activeStatuses.some(a => s.includes(a));
        }).length;
        return {
            username: (info && info.username) || auth.username || '',
            balance: (info && info.balance) || '',
            activeOrders: activeCount
        };
    } catch (e) {
        return null;
    }
}

// Получить список чатов (для команды /chats) — переиспользуем runner как Discord.
async function tgFetchChatList() {
    try {
        const auth = await getAuthDetailsForBackground();
        if (!auth.golden_key || !auth.csrf_token || !auth.userId) return [];
        const payload = {
            objects: JSON.stringify([{ type: 'chat_bookmarks', id: auth.userId, tag: '0000000000', data: false }]),
            request: false,
            csrf_token: auth.csrf_token
        };
        const resp = await fetch('https://funpay.com/runner/', {
            method: 'POST',
            credentials: 'include',
            headers: {
                'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
                'x-requested-with': 'XMLHttpRequest'
            },
            body: new URLSearchParams(payload).toString()
        });
        if (!resp.ok) return [];
        const data = await resp.json();
        const chatObj = data.objects.find(o => o.type === 'chat_bookmarks');
        if (!chatObj || !chatObj.data || !chatObj.data.html) return [];
        const chats = await parseHtmlViaOffscreen(chatObj.data.html, 'parseChatList');
        return Array.isArray(chats) ? chats : [];
    } catch (e) {
        return [];
    }
}

// Запустить поднятие лотов по команде /bump.
async function tgRunBump() {
    try {
        const res = await runBumpCycle();
        if (res && typeof res === 'object') {
            return { raised: res.raised || 0, errors: res.errors || 0, skipped: res.skipped || 0 };
        }
        return { raised: 0, errors: 0 };
    } catch (e) {
        return { raised: 0, errors: 1 };
    }
}

// Сводка продаж для команды /sales.
async function tgSalesSummary() {
    try {
        const { fpToolsSalesData } = await chrome.storage.local.get('fpToolsSalesData');
        if (!fpToolsSalesData) return null;
        const all = Object.values(fpToolsSalesData);
        if (!all.length) return null;
        const now = Date.now(), day = 864e5;
        const t0 = new Date(); const todayStart = new Date(t0.getFullYear(), t0.getMonth(), t0.getDate()).getTime();
        const sym = { RUB: '₽', USD: '$', EUR: '€' };
        const bucket = (since) => {
            let count = 0; const rev = {};
            for (const o of all) {
                if (since && o.orderDate < since) continue;
                count++;
                if (o.orderStatus === 'closed' || o.orderStatus === 'paid') {
                    rev[o.currency] = (rev[o.currency] || 0) + (o.price || 0);
                }
            }
            const revStr = Object.entries(rev).map(([c, v]) => `${Math.round(v).toLocaleString('ru-RU')} ${sym[c] || c}`).join(' · ') || '0 ₽';
            return { count, revenue: revStr };
        };
        return {
            today: bucket(todayStart),
            week: bucket(now - 7 * day),
            month: bucket(now - 30 * day),
            all: bucket(null)
        };
    } catch (_) { return null; }
}

// Список лотов для команды /lots.
async function tgGetLots(limit) {
    try {
        const auth = await getAuthDetailsForBackground();
        if (!auth.golden_key || !auth.userId) return [];
        const resp = await fetch(`https://funpay.com/users/${auth.userId}/`, { credentials: 'include', cache: 'no-store' });
        if (!resp.ok) return [];
        const html = await resp.text();
        const lots = await parseHtmlViaOffscreen(html, 'parseUserLotsList').catch(() => null);
        if (Array.isArray(lots)) return limit ? lots.slice(0, limit) : lots;
        return [];
    } catch (_) { return []; }
}

// Поддержать онлайн для команды /online.
async function tgKeepOnline() {
    try {
        const auth = await getAuthDetailsForBackground();
        if (!auth.golden_key) return false;
        const resp = await fetch('https://funpay.com/', { credentials: 'include', cache: 'no-store' });
        return resp.ok;
    } catch (_) { return false; }
}

telegramInit({
    getOrders: tgFetchOrders,
    getProfileInfo: tgFetchProfileInfo,
    getChatList: tgFetchChatList,
    runBump: tgRunBump,
    getSalesSummary: tgSalesSummary,
    getLots: tgGetLots,
    keepOnline: tgKeepOnline
});

// Полный цикл Telegram: приём команд (getUpdates) + уведомления (сообщения/заказы).
let _tgChatTag = null;
async function runTelegramCheckCycle() {
    const { fpToolsTelegram } = await chrome.storage.local.get('fpToolsTelegram');
    const cfg = fpToolsTelegram || {};
    if (!cfg.enabled || !cfg.token) return;

    // 1) команды из бота
    try { await telegramPollOnce(); } catch (e) { console.error('FP Tools: TG poll:', e.message); }

    // 2) уведомления о новых сообщениях (если Discord-цикл не активен, тянем сами)
    if (cfg.notifyMessages) {
        try {
            const { fpToolsDiscord } = await chrome.storage.local.get('fpToolsDiscord');
            const discordActive = fpToolsDiscord && fpToolsDiscord.enabled && fpToolsDiscord.webhookUrl;
            // Если Discord активен — он уже кормит Telegram внутри runDiscordCheckCycle.
            if (!discordActive) {
                const chats = await tgFetchChatList();
                if (chats.length) await telegramNotifyNewMessages(chats);
            }
        } catch (e) { console.error('FP Tools: TG msg notify:', e.message); }
    }

    // 3) уведомления о новых заказах
    if (cfg.notifyOrders) {
        try {
            const orders = await tgFetchOrders(0);
            if (orders.length) await telegramNotifyNewOrders(orders);
        } catch (e) { console.error('FP Tools: TG order notify:', e.message); }
    }
}

// Функция для парсинга HTML через offscreen документ
async function parseHtmlViaOffscreen(html, action, extra = {}) {
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
        ...extra
    });
}

async function cloneBuildFieldsInternal(auth, nodeId, attributes) {
    if (!nodeId) throw new Error('Неизвестна подкатегория (node) лота.');
    
    const editUrl = `https://funpay.com/lots/offerEdit?node=${nodeId}&setlocale=en`;
    const resp = await fetch(editUrl, { headers: { 'Cookie': `golden_key=${auth.golden_key}` } });
    if (!resp.ok) throw new Error(`Не удалось открыть форму категории: ${resp.status}`);
    const html = await resp.text();
    
    // ВОЗВРАЩАЕМ русский язык вашему аккаунту
    await fetch(`https://funpay.com/?setlocale=ru`, { headers: { 'Cookie': `golden_key=${auth.golden_key}` } });
    
    const fields = await parseHtmlViaOffscreen(html, 'solveCloneForm', { attributes: attributes || [] });
    if (!fields) throw new Error('Не удалось разобрать форму категории.');
    fields.node_id = String(nodeId);
    fields.offer_id = '0';
    return fields;
}

// 3.0: «чистая» цена продавца с учётом комиссии - повторяет Account.calc()+commission_coefficient.
// calc(price=100) возвращает методы оплаты с ценой ПОКУПАТЕЛЯ в разных валютах. Коэффициент =
// (минимальная цена покупателя в нужной валюте) / 100. Чистая цена = желаемая цена / коэффициент.
// Валюта берётся из списка лотов продавца (rub/usd/eur), как в get_coefficient(account_currency).
async function cloneCalcNetPrice(auth, nodeId, buyerPrice, currencyCode) {
    if (!buyerPrice || buyerPrice <= 0) return null;
    const headers = {
        'accept': '*/*',
        'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'x-requested-with': 'XMLHttpRequest',
        'Cookie': `golden_key=${auth.golden_key}`
    };
    const base = 100; // как в плагине
    const body = new URLSearchParams({ nodeId: String(nodeId), price: String(base) });
    const r = await fetch('https://funpay.com/lots/calc', { method: 'POST', headers, body });
    if (!r.ok) return null;
    const j = await r.json();
    if (!j || j.error) return null;

    const want = (currencyCode || '').toLowerCase(); // 'rub' | 'usd' | 'eur' | ''
    const symFor = (c) => c === 'rub' ? '₽' : c === 'usd' ? '$' : c === 'eur' ? '€' : '';

    // Собираем цены методов с их валютой (по unit или data-cy).
    let buyerForBase = Infinity;
    if (Array.isArray(j.methods)) {
        for (const m of j.methods) {
            const p = parseFloat(String(m.price).replace(/\s/g, '').replace(',', '.'));
            if (Number.isNaN(p)) continue;
            const unit = String(m.unit || '');
            let mcur = '';
            if (unit.includes('₽')) mcur = 'rub';
            else if (unit.includes('$')) mcur = 'usd';
            else if (unit.includes('€')) mcur = 'eur';
            // если знаем нужную валюту - берём только методы в ней; иначе минимум по всем
            if (want && mcur && mcur !== want) continue;
            buyerForBase = Math.min(buyerForBase, p);
        }
    }
    // если по нужной валюте ничего не нашли - пробуем minPrice
    if (!Number.isFinite(buyerForBase) && typeof j.minPrice === 'string') {
        const mp = parseFloat(j.minPrice.replace(/\s/g, '').replace(',', '.'));
        if (!Number.isNaN(mp)) buyerForBase = mp;
    }
    if (!Number.isFinite(buyerForBase) || buyerForBase <= 0) return null;

    const coeff = buyerForBase / base;     // commission_coefficient в нужной валюте
    if (coeff <= 0) return null;
    const net = buyerPrice / coeff;
    return Math.round(net * 100) / 100;
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

        // Telegram: уведомления о новых сообщениях (тот же источник, что и Discord).
        try { await telegramNotifyNewMessages(parsedChats); } catch (e) { console.error('FP Tools: TG notify msgs:', e.message); }

        // 3.0: stop Discord spam. Two fixes:
        //  (1) First-run seeding - if we've never recorded ids, just record current unread ids
        //      and DON'T notify (otherwise enabling Discord blasts every existing unread chat).
        //  (2) Only notify when the chat's last message is genuinely new inbound
        //      (nodeMsg > userMsg), not merely flagged unread.
        const { fpToolsDiscordSeeded } = await chrome.storage.local.get('fpToolsDiscordSeeded');
        const isFirstDiscordRun = !fpToolsDiscordSeeded;

        let newMessagesToSend = false;
        for (const chat of parsedChats) {
            const genuinelyNew = (chat.nodeMsg != null && chat.userMsg != null)
                ? (chat.nodeMsg > chat.userMsg)
                : chat.isUnread;
            if (!genuinelyNew) continue;
            if (processedDiscordMessageIds.has(chat.msgId)) continue;

            if (!isFirstDiscordRun) {
                await sendDiscordNotification(chat, fpToolsDiscord);
            }
            processedDiscordMessageIds.add(chat.msgId);
            newMessagesToSend = true;
        }

        if (newMessagesToSend || isFirstDiscordRun) {
            let idsToStore = Array.from(processedDiscordMessageIds);
            if (idsToStore.length > 200) {
                idsToStore = idsToStore.slice(-200);
            }
            await chrome.storage.local.set({ fpToolsProcessedDiscordIds: idsToStore, fpToolsDiscordSeeded: true });
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

// =====================================================================
// Снимок аккаунта (аватар/баланс/непрочитанные) для вкладки мультиаккаунтов.
//
// ВАЖНО: браузер игнорирует заголовок Cookie, выставленный вручную в fetch()
// (это forbidden header). Поэтому единственный надёжный способ получить главную
// страницу ПОД КОНКРЕТНЫМ аккаунтом — временно подменить cookie golden_key,
// сделать запрос с credentials:'include', затем вернуть исходную cookie.
//
// Все вызовы сериализуются (очередь), чтобы параллельные снимки не затирали
// cookie друг друга и не разлогинивали активную сессию.
// =====================================================================
let _fptSnapChain = Promise.resolve();

function fptSnapshotForKey(key) {
    const run = async () => {
        // 1) Запоминаем текущую golden_key, чтобы вернуть её после запроса.
        let original = null;
        try { original = await chrome.cookies.get({ url: 'https://funpay.com', name: 'golden_key' }); } catch (_) {}

        // Если ключ совпадает с активным — просто грузим главную как есть.
        if (original && original.value === key) {
            try {
                const resp = await fetch('https://funpay.com/', { credentials: 'include', cache: 'no-store' });
                const html = await resp.text();
                return await parseHtmlViaOffscreen(html, 'parseAccountSnapshot');
            } catch (e) { return null; }
        }

        const setKey = async (value) => {
            return chrome.cookies.set({
                url: 'https://funpay.com',
                name: 'golden_key',
                value,
                domain: '.funpay.com',
                path: '/',
                secure: true,
                sameSite: 'lax',
                expirationDate: Math.floor(Date.now() / 1000) + (365 * 24 * 60 * 60)
            });
        };

        try {
            // 2) Ставим cookie целевого аккаунта.
            await setKey(key);
            // 3) Грузим главную под этим аккаунтом.
            const resp = await fetch('https://funpay.com/', { credentials: 'include', cache: 'no-store' });
            const html = await resp.text();
            const snap = await parseHtmlViaOffscreen(html, 'parseAccountSnapshot');
            return snap;
        } catch (e) {
            return null;
        } finally {
            // 4) ВСЕГДА возвращаем исходную golden_key (или удаляем, если её не было).
            try {
                if (original && original.value) await setKey(original.value);
                else await chrome.cookies.remove({ url: 'https://funpay.com', name: 'golden_key' });
            } catch (_) {}
        }
    };
    // сериализация
    const next = _fptSnapChain.then(run, run);
    _fptSnapChain = next.catch(() => {});
    return next;
}


// --- Главный обработчик сообщений ---
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    // 3.0: offscreen keepalive ping - receiving it resets the worker idle timer.
    if (request && request.target === 'background' && request.action === 'fptEngineKeepalive') {
        onKeepalivePing();
        sendResponse({ ok: true });
        return true;
    }
    // Relay parse requests from content scripts to the offscreen document
    if (request.target === 'offscreen') {
        parseHtmlViaOffscreen(request.html, request.action)
            .then(result => sendResponse(result))
            .catch(() => sendResponse(null));
        return true;
    }

    // 3.0: Background image send (ported from FP Tools upload_image + send_image).
    // Uploads the image to FunPay, then sends it via the runner with image_id - entirely
    // in the background, so it never touches the visible chat input.
    if (request.action === 'fptSendImage') {
        (async () => {
            try {
                const result = await sendChatImageInBackground(request.chatId, request.dataUrl, request.chatName);
                sendResponse({ ok: true, result });
            } catch (e) {
                sendResponse({ ok: false, error: e.message });
            }
        })();
        return true;
    }

    // 3.0: send plain text to a chat in the background (used for ordered template parts).
    if (request.action === 'fptSendChatText') {
        (async () => {
            try {
                const auth = await getAuthDetailsForBackground();
                if (!auth.golden_key || !auth.csrf_token) throw new Error('Нет авторизации.');
                const cookieStr = auth.phpsessid
                    ? `golden_key=${auth.golden_key}; PHPSESSID=${auth.phpsessid}`
                    : `golden_key=${auth.golden_key}`;
                const payload = {
                    objects: JSON.stringify([{ type: 'chat_node', id: request.chatId, tag: '00000000', data: { node: request.chatId, last_message: -1, content: '' } }]),
                    request: JSON.stringify({ action: 'chat_message', data: { node: request.chatId, last_message: -1, content: request.text } }),
                    csrf_token: auth.csrf_token
                };
                const res = await fetch('https://funpay.com/runner/', {
                    method: 'POST',
                    headers: { 'content-type': 'application/x-www-form-urlencoded; charset=UTF-8', 'x-requested-with': 'XMLHttpRequest', 'cookie': cookieStr },
                    body: new URLSearchParams(payload)
                });
                const json = await res.json().catch(() => null);
                if (json?.error) throw new Error(json.error);
                sendResponse({ ok: res.ok });
            } catch (e) {
                sendResponse({ ok: false, error: e.message });
            }
        })();
        return true;
    }

    // RMTHUB PROXY (bypasses CORS - content scripts can't fetch cross-origin)
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

    if (request.action === 'fetchDonaters') {
        (async () => {
            try {
                // Пытаемся получить через API сайта
                let res = await fetch('https://cdn.jsdelivr.net/gh/XaviersDev/FunPay-Tools@main/donaters.json');
                
                // Если API вдруг недоступно (например, 404/405), берем напрямую из GitHub Raw
                if (!res.ok) {
                    res = await fetch('https://raw.githubusercontent.com/XaviersDev/FunPayTools-Site/main/donaters.json');
                }
                
                if (!res.ok) throw new Error(`HTTP Error: ${res.status}`);
                const json = await res.json();
                sendResponse({ success: true, data: json });
            } catch (e) {
                sendResponse({ success: false, error: String(e) });
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

    // =====================================================================================
    // 3.0 SERVER-SIDE LOT CLONING - фоновые обработчики
    // -------------------------------------------------------------------------------------
    // cloneGetSource:  читает публичную страницу чужого лота и (если найден node) сразу
    //                  строит черновик полей на основе НАШЕЙ пустой формы offerEdit?node=...
    // cloneBuildFields: то же построение полей отдельно (если node меняется в UI).
    // cloneCreateLot:  собирает финальный payload и постит lots/offerSave (offer_id=0).
    // =====================================================================================
    if (request.action === 'cloneGetSource') {
        (async () => {
            try {
                const auth = await getAuthDetailsForBackground();
                if (!auth.golden_key) throw new Error('Не авторизован (нет golden_key).');

                const offerId = request.offerId;
                if (!offerId) throw new Error('Не передан ID лота.');

                const ck = { 'Cookie': `golden_key=${auth.golden_key}` };

                // 1) ФОРСИРУЕМ РУССКИЙ язык для сбора названий и описаний
                const ruResp = await fetch(`https://funpay.com/lots/offer?id=${offerId}&setlocale=ru`, { headers: ck });
                if (!ruResp.ok) throw new Error(`Ошибка загрузки лота: ${ruResp.status}`);
                const ruHtml = await ruResp.text();
                const ru = await parseHtmlViaOffscreen(ruHtml, 'parsePublicLotForClone');
                if (!ru) throw new Error('Не удалось разобрать страницу лота.');
                if (ru.notFound) throw new Error('Предложение не найдено.');

                let en = null;
                try {
                    // ФОРСИРУЕМ АНГЛИЙСКИЙ язык для сбора атрибутов для формы
                    const enResp = await fetch(`https://funpay.com/lots/offer?id=${offerId}&setlocale=en`, { headers: ck });
                    if (enResp.ok) {
                        const enHtml = await enResp.text();
                        en = await parseHtmlViaOffscreen(enHtml, 'parsePublicLotForClone');
                        if (en && en.notFound) en = null;
                    }
                } catch (_) { /* en необязателен */ }

                // ВОЗВРАЩАЕМ РУССКИЙ ЯЗЫК НА АККАУНТ, чтобы не сломать юзеру сайт
                await fetch(`https://funpay.com/?setlocale=ru`, { headers: ck });

                // Цена берётся ИЗ СПИСКА ЛОТОВ ПРОДАВЦА...
                let rawPrice = '';
                let priceCurrency = '';
                if (ru.sellerId) {
                    try {
                        const upResp = await fetch(`https://funpay.com/users/${ru.sellerId}/`, { headers: ck });
                        if (upResp.ok) {
                            const upHtml = await upResp.text();
                            const pr = await parseHtmlViaOffscreen(upHtml, 'parseSellerLotPrice', { offerId });
                            if (pr && pr.price) { rawPrice = pr.price; priceCurrency = pr.currency || ''; }
                        }
                    } catch (_) {}
                }

                const source = {
                    ...ru,
                    summary_ru: ru.summary || '',
                    desc_ru: ru.description || '',
                    summary_en: (en && en.summary) || '',
                    desc_en: (en && en.description) || '',
                    enDiffers: !!((en && en.summary && en.summary !== ru.summary) || (en && en.description && en.description !== ru.description)),
                    rawPrice,
                    priceCurrency,
                    matchAttributes: (en && en.attributes && en.attributes.length) ? en.attributes : ru.attributes
                };

                let fields = null;
                let formError = null;
                if (source.nodeId && !source.isChips) {
                    try {
                        fields = await cloneBuildFieldsInternal(auth, source.nodeId, source.matchAttributes);

                        if (rawPrice) {
                            try {
                                const net = await cloneCalcNetPrice(auth, source.nodeId, parseFloat(rawPrice), priceCurrency);
                                source.finalPrice = (net != null && !Number.isNaN(net)) ? net : parseFloat(rawPrice);
                            } catch (_) {
                                source.finalPrice = parseFloat(rawPrice);
                            }
                        }
                    } catch (e) {
                        formError = e.message;
                    }
                }

                sendResponse({ success: true, source, fields, formError, csrf: auth.csrf_token });
            } catch (e) {
                sendResponse({ success: false, error: e.message });
            }
        })();
        return true;
    }

    if (request.action === 'cloneBuildFields') {
        (async () => {
            try {
                const auth = await getAuthDetailsForBackground();
                if (!auth.golden_key) throw new Error('Не авторизован.');
                const fields = await cloneBuildFieldsInternal(auth, request.nodeId, request.attributes || []);
                sendResponse({ success: true, fields });
            } catch (e) {
                sendResponse({ success: false, error: e.message });
            }
        })();
        return true;
    }

    if (request.action === 'cloneUploadImages') {
        (async () => {
            try {
                const auth = await getAuthDetailsForBackground();
                if (!auth.golden_key) throw new Error('Не авторизован.');
                const urls = Array.isArray(request.urls) ? request.urls : [];
                if (!urls.length) { sendResponse({ success: true, ids: [] }); return; }

                const ids = [];
                const errors = [];
                for (const url of urls) {
                    try {
                        // 1) скачиваем картинку (публичный sfunpay.com)
                        const imgResp = await fetch(url, { headers: { 'Cookie': `golden_key=${auth.golden_key}` } });
                        if (!imgResp.ok) throw new Error(`download ${imgResp.status}`);
                        const blob = await imgResp.blob();

                        // 2) перезаливаем на FunPay как изображение лота - file/addOfferImage,
                        //    поля file + file_id=0, как в Account.upload_image(type_="offer").
                        const fd = new FormData();
                        const ext = (blob.type && blob.type.includes('png')) ? 'png' : 'jpg';
                        fd.append('file', blob, `image.${ext}`);
                        fd.append('file_id', '0');

                        const upResp = await fetch('https://funpay.com/file/addOfferImage', {
                            method: 'POST',
                            headers: {
                                'Accept': '*/*',
                                'X-Requested-With': 'XMLHttpRequest',
                                'Cookie': `golden_key=${auth.golden_key}`
                            },
                            body: fd
                        });
                        if (!upResp.ok) {
                            let m = `upload ${upResp.status}`;
                            try { const j = await upResp.json(); if (j.msg) m = j.msg; } catch (_) {}
                            throw new Error(m);
                        }
                        const j = await upResp.json();
                        const fileId = j && j.fileId;
                        if (!fileId) throw new Error('нет fileId в ответе');
                        ids.push(parseInt(fileId, 10));
                    } catch (e) {
                        errors.push(`${url}: ${e.message}`);
                    }
                }
                sendResponse({ success: true, ids, errors });
            } catch (e) {
                sendResponse({ success: false, error: e.message });
            }
        })();
        return true;
    }

    if (request.action === 'cloneCreateLot') {
        (async () => {
            try {
                const auth = await getAuthDetailsForBackground();
                if (!auth.csrf_token) throw new Error('Нет CSRF-токена.');

                const payload = { ...(request.fields || {}) };
                payload.offer_id = '0';
                payload.csrf_token = auth.csrf_token;
                if (request.location) payload.location = request.location;

                const body = new URLSearchParams(payload);
                // POST в EN-локали - ровно как в плагине: method("post", "lots/offerSave", ..., locale="en")
                const response = await fetch('https://funpay.com/en/lots/offerSave', {
                    method: 'POST',
                    headers: {
                        'X-Requested-With': 'XMLHttpRequest',
                        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
                        'Accept': 'application/json, text/javascript, */*; q=0.01',
                        'Cookie': `golden_key=${auth.golden_key}`
                    },
                    body
                });
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                const rawText = await response.text();
                let result;
                try { result = JSON.parse(rawText); }
                catch { throw new Error('FunPay вернул не-JSON ответ (возможно, требуется повторный вход).'); }

                const hasError = result && (result.error === 1 || result.error === true ||
                    (result.errors && (Array.isArray(result.errors) ? result.errors.length : Object.keys(result.errors).length)));

                if (result && !hasError) {
                    // пробуем вытащить ID нового лота
                    let newId = null;
                    const txt = JSON.stringify(result);
                    let m = txt.match(/"offer_id"\s*:\s*"?(\d+)"?/) || txt.match(/id=(\d+)/);
                    if (m) newId = m[1];
                    if (!newId && result.url) {
                        const um = String(result.url).match(/id=(\d+)/);
                        if (um) newId = um[1];
                    }
                    sendResponse({ success: true, newId });
                } else {
                    let msg = result.msg || 'Ошибка сохранения лота';
                    if (result.errors) {
                        const parts = Array.isArray(result.errors)
                            ? result.errors.map(e => Array.isArray(e) ? e[1] : e)
                            : Object.values(result.errors);
                        if (parts.length) msg = parts.join('; ');
                    }
                    throw new Error(msg);
                }
            } catch (e) {
                sendResponse({ success: false, error: e.message });
            }
        })();
        return true;
    }

    if (request.action === 'cloneDeleteLot') {
        (async () => {
            try {
                const auth = await getAuthDetailsForBackground();
                if (!auth.csrf_token) throw new Error('Нет CSRF-токена.');
                if (!request.offerId) throw new Error('Не передан ID лота.');
                const body = new URLSearchParams({
                    offer_id: String(request.offerId),
                    deleted: '1',
                    csrf_token: auth.csrf_token
                });
                const response = await fetch('https://funpay.com/lots/offerSave', {
                    method: 'POST',
                    headers: {
                        'X-Requested-With': 'XMLHttpRequest',
                        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
                        'Cookie': `golden_key=${auth.golden_key}`
                    },
                    body
                });
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                sendResponse({ success: true });
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

                let payload = { ...request.data };

                // If the caller only sent a partial payload (e.g. the inline price editor
                // sends just { offer_id, price }), FunPay's offerSave would blank every
                // field that isn't present. Detect that and merge onto the full current
                // form so we only change what was intended.
                const looksPartial = !Object.keys(payload).some(k => k.startsWith('fields['));
                if (looksPartial && payload.offer_id && payload.offer_id !== '0') {
                    try {
                        let nodeId = request.nodeId || payload.node_id;
                        // node is needed for offerEdit; try to discover it if absent
                        const editUrl = nodeId
                            ? `https://funpay.com/lots/offerEdit?node=${nodeId}&offer=${payload.offer_id}`
                            : `https://funpay.com/lots/offerEdit?offer=${payload.offer_id}`;
                        const r = await fetch(editUrl, { headers: { 'Cookie': `golden_key=${auth.golden_key}` } });
                        if (r.ok) {
                            const html = await r.text();
                            const full = await parseHtmlViaOffscreen(html, 'parseLotEditPage');
                            if (full && typeof full === 'object') {
                                payload = { ...full, ...payload }; // overrides win
                            }
                        }
                    } catch (mergeErr) {
                        // fall through with partial payload if the edit page can't be loaded
                        console.warn('saveSingleLot: could not merge full form:', mergeErr.message);
                    }
                }

                const formData = new URLSearchParams(payload);
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

                // FunPay returns { error: 0 } on success, or { error: 1, errors: {...} }
                // / { msg: "..." } on failure. The old check treated any non-true error as
                // success in some cases; now we explicitly require error to be falsy AND
                // surface field-level errors so the bulk editor can show why nothing changed.
                const hasError = result && (result.error === 1 || result.error === true ||
                    (result.errors && (Array.isArray(result.errors) ? result.errors.length : Object.keys(result.errors).length)));

                if (result && !hasError && (result.error === 0 || result.error === false || result.error === undefined)) {
                    sendResponse({ success: true });
                } else {
                    let msg = result.msg || 'Неизвестная ошибка API';
                    if (result.errors) {
                        const parts = Array.isArray(result.errors)
                            ? result.errors.map(e => Array.isArray(e) ? e[1] : e)
                            : Object.values(result.errors);
                        if (parts.length) msg = parts.join('; ');
                    }
                    throw new Error(msg);
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
            try {
                if (!request.key) throw new Error('Пустой ключ аккаунта.');

                // --- FIX (multi-account login) ---
                // Прежняя реализация ломала вход по нескольким причинам:
                //   1. chrome.cookies.set НЕ умеет ставить httpOnly — этот флаг
                //      нельзя задать через API, и его передача приводит к тому, что
                //      запись куки молча проваливается (или ведёт себя непредсказуемо).
                //   2. FunPay ставит golden_key на домен ".funpay.com" (host-wide,
                //      с ведущей точкой). Запись с domain:"funpay.com" создаёт ОТДЕЛЬНУЮ
                //      host-only куку, которая конфликтует с уже существующей доменной.
                //      В итоге сервер видит рассинхрон и разлогинивает пользователя.
                // Решение: сначала полностью удаляем все варианты golden_key и сессию,
                // затем ставим новый golden_key на домен ".funpay.com" БЕЗ httpOnly.

                // 1) Удаляем PHPSESSID — пусть FunPay выдаст свежую сессию под новый ключ.
                for (const url of ['https://funpay.com', 'https://funpay.com/']) {
                    try { await chrome.cookies.remove({ url, name: 'PHPSESSID' }); } catch (_) {}
                }

                // 2) Удаляем ВСЕ существующие golden_key (и host-only, и доменные варианты),
                //    чтобы не было конфликта двух кук с одинаковым именем.
                try {
                    const existing = await chrome.cookies.getAll({ name: 'golden_key', domain: 'funpay.com' });
                    for (const c of existing) {
                        const proto = c.secure ? 'https' : 'http';
                        const host = c.domain.replace(/^\./, '');
                        try {
                            await chrome.cookies.remove({
                                url: `${proto}://${host}${c.path || '/'}`,
                                name: 'golden_key',
                                storeId: c.storeId
                            });
                        } catch (_) {}
                    }
                } catch (_) {}

                // 3) Ставим новый golden_key так же, как это делает сам FunPay:
                //    domain ".funpay.com" (host-wide), secure, без httpOnly.
                const setResult = await chrome.cookies.set({
                    url: 'https://funpay.com',
                    name: 'golden_key',
                    value: request.key,
                    domain: '.funpay.com',
                    path: '/',
                    secure: true,
                    sameSite: 'lax',
                    expirationDate: Math.floor(Date.now() / 1000) + (365 * 24 * 60 * 60)
                });

                if (!setResult) {
                    throw new Error('Не удалось записать куку аккаунта (cookies.set вернул null).');
                }

                // 4) Перезагружаем вкладку, на которой нажали «Войти».
                const tabId = sender.tab && sender.tab.id;
                if (tabId != null) chrome.tabs.reload(tabId);
                sendResponse({ success: true });
            } catch (e) {
                console.error('FP Tools: setGoldenKey error:', e);
                sendResponse({ success: false, error: e.message });
            }
        })();
        return true;
    }
    // ACCOUNT SNAPSHOT (avatar / balance / unread) для вкладки мультиаккаунтов
    if (request.action === 'getAccountSnapshot') {
        (async () => {
            try {
                const key = request.key;
                if (!key) { sendResponse({ ok: false, error: 'no key' }); return; }
                const snap = await fptSnapshotForKey(key);
                sendResponse({ ok: true, snapshot: snap || {} });
            } catch (e) {
                sendResponse({ ok: false, error: e.message });
            }
        })();
        return true;
    }

    // TELEGRAM HANDLERS
    if (request.action === 'telegramValidate') {
        (async () => {
            const res = await telegramValidateAndResolve(request.token);
            sendResponse(res);
        })();
        return true;
    }
    if (request.action === 'telegramTest') {
        (async () => {
            try {
                const r = await tgSendMessage('✅ FP Tools подключён к этому чату. Уведомления и управление работают.');
                sendResponse({ ok: !!(r && r.ok), error: r && r.description });
            } catch (e) {
                sendResponse({ ok: false, error: e.message });
            }
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
    if (alarm.name === TELEGRAM_ALARM) {
        await runTelegramCheckCycle();
    }
    // <-- НОВЫЙ ОБРАБОТЧИК -->
    if (alarm.name === AUTO_RESPONDER_ALARM_NAME) {
        await runAutoResponderCycle();
    }
    // 3.0: engine heartbeat - resurrects the active polling loop after the worker is killed
    if (alarm.name === ENGINE_HEARTBEAT_ALARM) {
        await onHeartbeat();
    }
    // 3.0: smart auto-raise - self-schedules its next run based on FunPay's wait times
    if (alarm.name === SMART_BUMP_ALARM) {
        await runSmartBumpCycle();
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
    chrome.storage.local.get(['autoBumpEnabled', 'autoBumpCooldown', 'fpToolsDiscord', 'fpToolsAutoReplies', 'fpToolsSmartBumpEnabled'], (settings) => {
        if (settings.fpToolsSmartBumpEnabled) {
            // 3.0: smart raise takes over; the fixed-interval bump is disabled to avoid double-raising.
            chrome.alarms.clear(BUMP_ALARM_NAME);
            startSmartBump();
        } else if (settings.autoBumpEnabled && settings.autoBumpCooldown) {
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
        // Telegram: запускаем опрос, если включён и есть токен.
        telegramSyncAlarm();
        // <-- НОВЫЙ БЛОК ДЛЯ АВТООТВЕТЧИКА -->
        const autoReplies = settings.fpToolsAutoReplies || {};
        const arAnyEnabled = autoReplies.greetingEnabled || autoReplies.keywordsEnabled ||
            autoReplies.autoReviewEnabled || autoReplies.bonusForReviewEnabled ||
            autoReplies.newOrderReplyEnabled || autoReplies.orderConfirmReplyEnabled ||
            autoReplies.autoDeliveryEnabled;
        if (arAnyEnabled) {
            // 3.0: start the MV3-safe active loop instead of the broken 0.25-min alarm.
            startEngine();
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
            fpToolsDisabledFeatures: [],
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

    // Telegram: включение/выключение и смена токена → пересоздаём/убираем опрос.
    if (changes.fpToolsTelegram) {
        telegramSyncAlarm();
    }

    // <-- НОВЫЙ БЛОК ДЛЯ УПРАВЛЕНИЯ БУДИЛЬНИКОМ АВТООТВЕТЧИКА -->
    if (changes.fpToolsAutoReplies) {
        const newSettings = changes.fpToolsAutoReplies.newValue || {};
        const isEnabled = newSettings.greetingEnabled || newSettings.keywordsEnabled || newSettings.autoReviewEnabled || newSettings.bonusForReviewEnabled ||
            newSettings.newOrderReplyEnabled || newSettings.orderConfirmReplyEnabled || newSettings.autoDeliveryEnabled;

        // 3.0: drive the engine instead of the broken alarm
        if (isEnabled) {
            startEngine();
        } else {
            stopEngine();
            chrome.alarms.clear(AUTO_RESPONDER_ALARM_NAME);
            resetAutoResponderState();
        }
    }
    // 3.0: smart auto-raise toggle
    if (changes.fpToolsSmartBumpEnabled) {
        const enabled = changes.fpToolsSmartBumpEnabled.newValue;
        if (enabled) {
            chrome.alarms.clear(BUMP_ALARM_NAME); // stop fixed-interval bump
            startSmartBump();
        } else {
            stopSmartBump();
            // re-arm the classic bump if it's still enabled
            chrome.storage.local.get(['autoBumpEnabled', 'autoBumpCooldown'], (s) => {
                if (s.autoBumpEnabled && s.autoBumpCooldown) {
                    chrome.alarms.create(BUMP_ALARM_NAME, { delayInMinutes: 1, periodInMinutes: parseInt(s.autoBumpCooldown, 10) });
                }
            });
        }
    }
});

chrome.runtime.onUpdateAvailable.addListener(function(details) {
    console.log("FP Tools: доступно обновление до версии " + details.version + ". применение...");
    chrome.runtime.reload();
});