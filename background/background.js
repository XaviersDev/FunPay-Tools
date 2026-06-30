// background/background.js - FunPay Tools 2.8

import './sales_db.js'; // FP Tools: IndexedDB-хранилище заказов (self.FPTSalesDB)
import './purchases_db.js'; // FP Tools: IndexedDB-хранилище покупок (self.FPTPurchasesDB)
import './finance_db.js'; // FP Tools: IndexedDB-хранилище финансов (self.FPTFinanceDB)
import { fetchAIResponse, fetchAILotGeneration, fetchAITranslation, fetchAIImageGeneration } from './ai.js';
import { BUMP_ALARM_NAME, startAutoBump, stopAutoBump, runScheduledBump, runBumpCycle } from './autobump.js';
import { runAutoResponderCycle, resetAutoResponderState } from './autoresponder.js';
import { startEngine, stopEngine, onHeartbeat, onKeepalivePing, ENGINE_HEARTBEAT_ALARM } from './fpt_engine.js';
import {
    TELEGRAM_ALARM, telegramInit, telegramSyncAlarm, telegramPollOnce,
    telegramValidateAndResolve, telegramNotifyNewMessages, telegramNotifyNewOrders, tgSendMessage
} from './telegram.js';

// ─────────────────────────────────────────────────────────────────────────────
// FIX 2.8.1 - НАДЁЖНАЯ ОТПРАВКА КУКОВ.
// Браузер ИГНОРИРУЕТ заголовок Cookie, выставленный вручную в fetch() (forbidden
// header). Раньше многие запросы к funpay.com слали только ручной cookie и
// работали лишь у пользователей, чьи куки случайно подхватывались браузером -
// отсюда «у меня картинки/автоответы работают, а у людей нет».
// Оборачиваем глобальный fetch так, чтобы для ВСЕХ запросов к funpay.com по
// умолчанию подставлялись реальные куки активной сессии (credentials:'include').
// Прочие домены (api.telegram.org, *.workers.dev, CDN и т.д.) не затрагиваются.
// Совместимо с подменой golden_key в fptSnapshotForKey (она и так грузит главную
// с credentials:'include' из cookie-jar).
(function () {
    const _origFetch = self.fetch.bind(self);
    self.fetch = function (input, init) {
        try {
            const url = (typeof input === 'string') ? input
                      : (input && input.url) ? input.url : '';
            if (/^https:\/\/(?:[a-z0-9-]+\.)?funpay\.com\//i.test(url)) {
                init = init ? { ...init } : {};
                if (!init.credentials) init.credentials = 'include';
            }
        } catch (_) {}
        return _origFetch(input, init);
    };
})();

const OFFSCREEN_DOCUMENT_PATH = 'offscreen/offscreen.html';
const DISCORD_LOG_ALARM_NAME = 'fpToolsDiscordCheck';
const AUTO_RESPONDER_ALARM_NAME = 'fpToolsAutoResponder';
let lastDiscordChatTag = null;
const IMPORT_PROCESS_KEY = 'fpToolsLotImportProcess';
const RETRY_LIMIT = 5;
const RETRY_DELAY = 5000; // 5 секунд

// Защита от ПАРАЛЛЕЛЬНЫХ циклов сбора. Если открыть пару вкладок /orders/ или
// перезагрузить страницу, каждый запуск дёргал свой цикл — два цикла разом удваивают
// нагрузку. Эти флаги не дают запуститься второму циклу.
let _salesCycleRunning = false;
let _purchasesCycleRunning = false;
let _financeCycleRunning = false;

// fetch с мягким ретраем на серверные ошибки FunPay (502/503/504/429). Когда у FunPay
// «лежит» бэкенд (а это бывает — в чате жалуются, что сайт падает), один и тот же
// запрос через секунду часто проходит. Это НЕ замедляет обычную работу: ретрай
// включается только при ошибке сервера.
async function fptFetchResilient(url, options, { retries = 3, baseDelay = 700 } = {}) {
    let lastErr;
    for (let attempt = 0; attempt <= retries; attempt++) {
        try {
            const res = await fetch(url, options);
            if (res.status === 429 || res.status >= 500) {
                lastErr = new Error(`HTTP ${res.status}`);
            } else {
                return res;
            }
        } catch (e) {
            lastErr = e; // network error / Failed to fetch
        }
        if (attempt < retries) {
            await new Promise(r => setTimeout(r, baseDelay * Math.pow(2, attempt) + Math.random() * 300));
        }
    }
    throw lastErr || new Error('fptFetchResilient: исчерпаны попытки');
}

// --- СБОР СТАТИСТИКИ ПРОДАЖ (IndexedDB) ---
// Данные хранятся в IndexedDB (self.FPTSalesDB), а не в chrome.storage.local,
// поэтому квота ~10 МБ больше не упирается на ~18800 заказах. Между страницами —
// небольшая вежливая пауза, чтобы FunPay не банил IP за флуд.
async function runSalesUpdateCycle() {
    if (_salesCycleRunning) { console.log("FP Tools: цикл продаж уже идёт — пропуск повторного запуска."); return; }
    _salesCycleRunning = true;
    console.log("FP Tools: Запуск полного цикла сбора статистики продаж...");
    try {
        await chrome.storage.local.set({ fpToolsSalesCollecting: true });
        // Однократно переносим старые данные из storage.local в IndexedDB
        // (и освобождаем квоту). Безопасно вызывать каждый раз — отработает один раз.
        await FPTSalesDB.migrateFromLocalStorage();

        const auth = await getAuthDetailsForBackground();
        if (!auth.golden_key) throw new Error("Не удалось получить golden_key для сбора статистики.");

        let firstOrderId = await FPTSalesDB.getMeta('firstOrderId');
        let lastOrderId = await FPTSalesDB.getMeta('lastOrderId');

        const fetchAndParseSales = async (continueToken = null) => {
            const url = 'https://funpay.com/orders/trade';
            const body = continueToken ? new URLSearchParams({ 'continue': continueToken }) : null;
            const options = {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8', 'Cookie': `golden_key=${auth.golden_key}` },
                body: body
            };
            // 429/5xx-aware retry: если FunPay всё-таки притормозит — откатываемся и
            // пробуем снова, но НЕ держим паузу на каждой успешной странице.
            let response;
            for (let attempt = 0; attempt < 5; attempt++) {
                response = await fetch(url, options);
                if (response.status === 429 || response.status >= 500) {
                    await new Promise(r => setTimeout(r, 1500 * (attempt + 1) + Math.random() * 500));
                    continue;
                }
                break;
            }
            if (!response.ok) throw new Error(`Ошибка сети: ${response.status}`);
            const html = await response.text();
            return await parseHtmlViaOffscreen(html, 'parseSalesPage');
        };

        const commitMeta = async (firstId, lastId) => {
            if (firstId !== undefined) await FPTSalesDB.setMeta('firstOrderId', firstId);
            if (lastId !== undefined) await FPTSalesDB.setMeta('lastOrderId', lastId);
            const now = Date.now();
            await FPTSalesDB.setMeta('lastUpdate', now);
            // Маленькое зеркало для UI, который читает дату из storage.local — это байты, не мегабайты.
            await chrome.storage.local.set({ fpToolsSalesLastUpdate: now });
        };

        // --- Догрузка НОВЫХ заказов сверху (инкрементально) ---
        if (firstOrderId) {
            let continueToken = null;
            let newOrdersFoundInCycle = true;
            while (newOrdersFoundInCycle) {
                const { nextOrderId, orders } = await fetchAndParseSales(continueToken);
                if (!orders || orders.length === 0) break;

                const knownOrderIndex = orders.findIndex(o => o.orderId === firstOrderId);
                const newOrders = (knownOrderIndex !== -1) ? orders.slice(0, knownOrderIndex) : orders;

                if (newOrders.length > 0) {
                    await FPTSalesDB.putOrders(newOrders);
                    firstOrderId = newOrders[0].orderId;
                    await commitMeta(firstOrderId, undefined);
                    console.log(`FP Tools: Добавлено ${newOrders.length} новых заказов сверху.`);
                } else {
                    newOrdersFoundInCycle = false;
                }

                if (knownOrderIndex !== -1 || !nextOrderId) break;
                continueToken = nextOrderId;
            }
        }

        // --- Догрузка СТАРЫХ заказов вниз / первичная инициализация ---
        let continueToken = lastOrderId;
        let _emptyPages = 0;
        const MAX_EMPTY_PAGES = 5;
        const _seenTokens = new Set();
        if (lastOrderId) _seenTokens.add(lastOrderId);

        if (!firstOrderId) {
            const { nextOrderId, orders } = await fetchAndParseSales(null);
            if (orders && orders.length > 0) {
                await FPTSalesDB.putOrders(orders);
                firstOrderId = orders[0].orderId;
                lastOrderId = orders[orders.length - 1].orderId;
                await commitMeta(firstOrderId, lastOrderId);
                console.log(`FP Tools: Инициализация статистики с ${orders.length} заказами.`);
                continueToken = nextOrderId;
            } else {
                continueToken = null;
            }
        }

        // Множество уже известных orderId грузим ОДИН раз в память (а не с диска
        // на каждой странице) — иначе на 65к заказов проверки тормозили бы.
        const _knownIds = new Set(Object.keys(await FPTSalesDB.getAllAsMap()));

        while (continueToken) {
            const { nextOrderId, orders } = await fetchAndParseSales(continueToken);
            if (!orders || orders.length === 0) {
                console.log("FP Tools: Достигнут конец истории заказов.");
                break;
            }

            // Какие из заказов на странице — новые для базы.
            let newOrdersOnPageCount = 0;
            const toPut = [];
            for (const order of orders) {
                if (!_knownIds.has(order.orderId)) { toPut.push(order); _knownIds.add(order.orderId); newOrdersOnPageCount++; }
            }

            if (newOrdersOnPageCount > 0) {
                await FPTSalesDB.putOrders(toPut);
                lastOrderId = orders[orders.length - 1].orderId;
                await commitMeta(undefined, lastOrderId);
                const total = await FPTSalesDB.count();
                console.log(`FP Tools: Добавлено ${newOrdersOnPageCount} старых заказов. Всего: ${total}.`);
                _emptyPages = 0;
            } else {
                _emptyPages++;
                lastOrderId = orders[orders.length - 1].orderId;
                await commitMeta(undefined, lastOrderId);
                console.log(`FP Tools: Страница без новых заказов (${_emptyPages}/${MAX_EMPTY_PAGES}).`);
                if (_emptyPages >= MAX_EMPTY_PAGES) {
                    console.log("FP Tools: Несколько страниц подряд без новых заказов - остановка.");
                    break;
                }
            }

            if (!nextOrderId || nextOrderId === continueToken || _seenTokens.has(nextOrderId)) {
                console.log("FP Tools: continue-токен не меняется/повторяется - конец пагинации.");
                break;
            }
            _seenTokens.add(nextOrderId);
            if (_seenTokens.size > 5000) _seenTokens.clear();

            continueToken = nextOrderId;
        }

    } catch (e) {
        console.error(`FP Tools: Ошибка в цикле сбора статистики: ${e.message}`);
    } finally {
        _salesCycleRunning = false;
        console.log("FP Tools: Сбор статистики продаж завершен.");
        await chrome.storage.local.set({
            fpToolsSalesLastUpdate: Date.now(),
            fpToolsSalesCollecting: false
        });
    }
}

async function runFinanceUpdateCycle() {
    if (_financeCycleRunning) { console.log("FP Tools: цикл финансов уже идёт — пропуск."); return; }
    _financeCycleRunning = true;
    console.log("FP Tools: Запуск сбора статистики финансов...");
    try {
        await chrome.storage.local.set({ fpToolsFinanceCollecting: true });
        const auth = await getAuthDetailsForBackground();
        if (!auth.golden_key) throw new Error("Не удалось получить golden_key для сбора финансов.");
        const userId = auth.userId;

        const fetchPage = async (continueToken) => {
            const url = 'https://funpay.com/users/transactions';
            const params = new URLSearchParams();
            if (userId) params.set('user_id', String(userId));
            params.set('filter', ''); // все операции
            if (continueToken) params.set('continue', continueToken);
            const options = {
                method: 'POST',
                credentials: 'include',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
                    'X-Requested-With': 'XMLHttpRequest',
                    'Cookie': `golden_key=${auth.golden_key}`
                },
                body: params
            };
            let response;
            for (let attempt = 0; attempt < 5; attempt++) {
                response = await fetch(url, options);
                if (response.status === 429 || response.status >= 500) {
                    await new Promise(r => setTimeout(r, 1500 * (attempt + 1) + Math.random() * 500));
                    continue;
                }
                break;
            }
            if (!response.ok) throw new Error(`Ошибка сети (финансы): ${response.status}`);
            const html = await response.text();
            return await parseHtmlViaOffscreen(html, 'parseFinancePage');
        };

        // Финансовых операций немного — собираем целиком заново каждый раз.
        await FPTFinanceDB.clearAll();
        let continueToken = null;
        const seenIds = new Set();        // все id операций, что уже сохранили
        const seenTokens = new Set();     // continue-токены, что уже использовали
        let lastFirstId = null;           // id первой операции прошлой страницы (детект зацикливания)
        const MAX_PAGES = 600;            // жёсткий предохранитель

        for (let page = 0; page < MAX_PAGES; page++) {
            // защита от повторного использования того же токена (зацикливание)
            if (continueToken && seenTokens.has(continueToken)) {
                console.log("FP Tools: финансы — повтор continue-токена, останавливаемся.");
                break;
            }
            if (continueToken) seenTokens.add(continueToken);

            const { nextId, txns } = await fetchPage(continueToken);
            if (!txns || txns.length === 0) break;

            // оставляем только НОВЫЕ операции (которых ещё не видели)
            const fresh = txns.filter(t => t.id && !seenIds.has(t.id));
            for (const t of fresh) seenIds.add(t.id);

            if (fresh.length > 0) {
                await FPTFinanceDB.putOrders(fresh);
                await chrome.storage.local.set({ fpToolsFinanceCount: seenIds.size });
                const dts = txns.map(t => t.date).filter(Boolean);
                if (dts.length) {
                    const newest = new Date(Math.max(...dts)).toISOString().slice(0, 10);
                    const oldest = new Date(Math.min(...dts)).toISOString().slice(0, 10);
                    console.log(`FP Tools: финансы стр.${page + 1} — ${txns.length} операц. (новых ${fresh.length}), ${newest}…${oldest}, всего уникальных ${seenIds.size}`);
                }
            }

            // Если страница не принесла ни одной новой операции — дальше идти бессмысленно.
            if (fresh.length === 0) {
                console.log("FP Tools: финансы — страница без новых операций, конец.");
                break;
            }

            // Детект зацикливания по содержимому: та же «первая» операция, что и раньше.
            const firstId = txns[0].id;
            if (firstId && firstId === lastFirstId) {
                console.log("FP Tools: финансы — та же страница повторилась, конец.");
                break;
            }
            lastFirstId = firstId;

            // нет следующего токена ИЛИ он совпал с текущим → конец
            if (!nextId || nextId === continueToken) break;
            continueToken = nextId;
        }

        const total = seenIds.size;

        const now = Date.now();
        await FPTFinanceDB.setMeta('lastUpdate', now);
        await chrome.storage.local.set({ fpToolsFinanceLastUpdate: now });
        console.log(`FP Tools: Финансы собраны, операций: ${total}.`);
    } catch (e) {
        console.error(`FP Tools: Ошибка в цикле сбора финансов: ${e.message}`);
    } finally {
        _financeCycleRunning = false;
        await chrome.storage.local.set({
            fpToolsFinanceLastUpdate: Date.now(),
            fpToolsFinanceCollecting: false
        });
    }
}

async function runPurchasesUpdateCycle() {
    if (_purchasesCycleRunning) { console.log("FP Tools: цикл покупок уже идёт — пропуск."); return; }
    _purchasesCycleRunning = true;
    console.log("FP Tools: Запуск полного цикла сбора статистики покупок...");
    try {
        await chrome.storage.local.set({ fpToolsPurchasesCollecting: true });
        // Однократно переносим старые данные из storage.local в IndexedDB
        // (и освобождаем квоту). Безопасно вызывать каждый раз — отработает один раз.
        await FPTPurchasesDB.migrateFromLocalStorage();

        const auth = await getAuthDetailsForBackground();
        if (!auth.golden_key) throw new Error("Не удалось получить golden_key для сбора статистики.");

        let firstOrderId = await FPTPurchasesDB.getMeta('firstOrderId');
        let lastOrderId = await FPTPurchasesDB.getMeta('lastOrderId');

        const fetchAndParseSales = async (continueToken = null) => {
            const url = 'https://funpay.com/orders/';
            const body = continueToken ? new URLSearchParams({ 'continue': continueToken }) : null;
            const options = {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8', 'Cookie': `golden_key=${auth.golden_key}` },
                body: body
            };
            // 429/5xx-aware retry: если FunPay всё-таки притормозит — откатываемся и
            // пробуем снова, но НЕ держим паузу на каждой успешной странице.
            let response;
            for (let attempt = 0; attempt < 5; attempt++) {
                response = await fetch(url, options);
                if (response.status === 429 || response.status >= 500) {
                    await new Promise(r => setTimeout(r, 1500 * (attempt + 1) + Math.random() * 500));
                    continue;
                }
                break;
            }
            if (!response.ok) throw new Error(`Ошибка сети: ${response.status}`);
            const html = await response.text();
            return await parseHtmlViaOffscreen(html, 'parseSalesPage');
        };

        const commitMeta = async (firstId, lastId) => {
            if (firstId !== undefined) await FPTPurchasesDB.setMeta('firstOrderId', firstId);
            if (lastId !== undefined) await FPTPurchasesDB.setMeta('lastOrderId', lastId);
            const now = Date.now();
            await FPTPurchasesDB.setMeta('lastUpdate', now);
            // Маленькое зеркало для UI, который читает дату из storage.local — это байты, не мегабайты.
            await chrome.storage.local.set({ fpToolsPurchasesLastUpdate: now });
        };

        // --- Догрузка НОВЫХ покупок сверху (инкрементально) ---
        if (firstOrderId) {
            let continueToken = null;
            let newOrdersFoundInCycle = true;
            while (newOrdersFoundInCycle) {
                const { nextOrderId, orders } = await fetchAndParseSales(continueToken);
                if (!orders || orders.length === 0) break;

                const knownOrderIndex = orders.findIndex(o => o.orderId === firstOrderId);
                const newOrders = (knownOrderIndex !== -1) ? orders.slice(0, knownOrderIndex) : orders;

                if (newOrders.length > 0) {
                    await FPTPurchasesDB.putOrders(newOrders);
                    firstOrderId = newOrders[0].orderId;
                    await commitMeta(firstOrderId, undefined);
                    console.log(`FP Tools: Добавлено ${newOrders.length} новых покупок сверху.`);
                } else {
                    newOrdersFoundInCycle = false;
                }

                if (knownOrderIndex !== -1 || !nextOrderId) break;
                continueToken = nextOrderId;
            }
        }

        // --- Догрузка СТАРЫХ заказов вниз / первичная инициализация ---
        let continueToken = lastOrderId;
        let _emptyPages = 0;
        const MAX_EMPTY_PAGES = 5;
        const _seenTokens = new Set();
        if (lastOrderId) _seenTokens.add(lastOrderId);

        if (!firstOrderId) {
            const { nextOrderId, orders } = await fetchAndParseSales(null);
            if (orders && orders.length > 0) {
                await FPTPurchasesDB.putOrders(orders);
                firstOrderId = orders[0].orderId;
                lastOrderId = orders[orders.length - 1].orderId;
                await commitMeta(firstOrderId, lastOrderId);
                console.log(`FP Tools: Инициализация статистики с ${orders.length} заказами.`);
                continueToken = nextOrderId;
            } else {
                continueToken = null;
            }
        }

        // Множество уже известных orderId грузим ОДИН раз в память (а не с диска
        // на каждой странице) — иначе на 65к заказов проверки тормозили бы.
        const _knownIds = new Set(Object.keys(await FPTPurchasesDB.getAllAsMap()));

        while (continueToken) {
            const { nextOrderId, orders } = await fetchAndParseSales(continueToken);
            if (!orders || orders.length === 0) {
                console.log("FP Tools: Достигнут конец истории заказов.");
                break;
            }

            // Какие из заказов на странице — новые для базы.
            let newOrdersOnPageCount = 0;
            const toPut = [];
            for (const order of orders) {
                if (!_knownIds.has(order.orderId)) { toPut.push(order); _knownIds.add(order.orderId); newOrdersOnPageCount++; }
            }

            if (newOrdersOnPageCount > 0) {
                await FPTPurchasesDB.putOrders(toPut);
                lastOrderId = orders[orders.length - 1].orderId;
                await commitMeta(undefined, lastOrderId);
                const total = await FPTPurchasesDB.count();
                console.log(`FP Tools: Добавлено ${newOrdersOnPageCount} старых покупок. Всего: ${total}.`);
                _emptyPages = 0;
            } else {
                _emptyPages++;
                lastOrderId = orders[orders.length - 1].orderId;
                await commitMeta(undefined, lastOrderId);
                console.log(`FP Tools: Страница без новых покупок (${_emptyPages}/${MAX_EMPTY_PAGES}).`);
                if (_emptyPages >= MAX_EMPTY_PAGES) {
                    console.log("FP Tools: Несколько страниц подряд без новых покупок - остановка.");
                    break;
                }
            }

            if (!nextOrderId || nextOrderId === continueToken || _seenTokens.has(nextOrderId)) {
                console.log("FP Tools: continue-токен не меняется/повторяется - конец пагинации.");
                break;
            }
            _seenTokens.add(nextOrderId);
            if (_seenTokens.size > 5000) _seenTokens.clear();

            continueToken = nextOrderId;
        }

    } catch (e) {
        console.error(`FP Tools: Ошибка в цикле сбора статистики: ${e.message}`);
    } finally {
        _purchasesCycleRunning = false;
        console.log("FP Tools: Сбор статистики покупок завершен.");
        await chrome.storage.local.set({
            fpToolsPurchasesLastUpdate: Date.now(),
            fpToolsPurchasesCollecting: false
        });
    }
}



// --- НИЖЕ ИДЕТ ОСТАЛЬНОЙ КОД ФАЙЛА, ОН ОСТАЕТСЯ БЕЗ ИЗМЕНЕНИЙ ---

// --- НАДЁЖНАЯ ФУНКЦИЯ АУТЕНТИФИКАЦИИ ---
// 3.0: Upload an image to FunPay and send it to a chat via the runner - all in background.
// Ported from FP Tools (Account.upload_image + Account.send_image).
async function fetchFreshCsrf() {
    const response = await fetch('https://funpay.com/', { credentials: 'include' });
    if (!response.ok) throw new Error(`csrf fetch: HTTP ${response.status}`);
    const text = await response.text();
    const m = text.match(/<body[^>]*data-app-data="([^"]+)"/);
    if (!m) throw new Error('csrf: data-app-data not found');
    const appData = JSON.parse(m[1].replace(/&quot;/g, '"'));
    const u = Array.isArray(appData) ? appData[0] : appData;
    if (!u || !u['csrf-token']) throw new Error('csrf: token missing');
    return { csrf_token: u['csrf-token'], userId: u.userId, username: u.userName };
}

async function checkGoldenSeal() {
    const seal = await chrome.cookies.get({ url: 'https://funpay.com', name: 'golden_seal' });
    if (!seal || !seal.value) return { present: false };
    const parts = seal.value.split('.');
    const exp = parts.length >= 4 ? parseInt(parts[3], 10) : 0;
    const valid = exp > Math.floor(Date.now() / 1000);
    return { present: true, expiresAt: exp, valid };
}

async function sendChatImageInBackground(chatId, dataUrl, chatName) {
    const blob = await (await fetch(dataUrl)).blob();

    async function attempt(force) {
        const auth = await getAuthDetailsForBackground(force);
        if (!auth.golden_key || !auth.csrf_token) {
            throw new Error('Нет авторизации для отправки изображения.');
        }

        const seal = await checkGoldenSeal();
        if (seal.present && !seal.valid) {
            console.warn('FP Tools: golden_seal истекла, обновите страницу FunPay.');
        }

        const fd = new FormData();
        fd.append('file', new File([blob], 'image.png', { type: blob.type || 'image/png' }));
        fd.append('file_id', '0');
        const upRes = await fetch('https://funpay.com/file/addChatImage', {
            method: 'POST',
            credentials: 'include',
            headers: { 'x-requested-with': 'XMLHttpRequest' },
            body: fd
        });
        if (upRes.status === 400) return { retry: true, where: 'upload' };
        if (!upRes.ok) throw new Error(`Загрузка изображения: HTTP ${upRes.status}`);
        const upJson = await upRes.json().catch(() => ({}));
        const fileId = upJson.fileId;
        if (!fileId) throw new Error('FunPay не вернул fileId: ' + (upJson.msg || 'неизвестная ошибка'));

        const request = { action: 'chat_message', data: { node: chatId, last_message: -1, content: '', image_id: fileId } };
        const payload = {
            objects: JSON.stringify([{ type: 'chat_node', id: chatId, tag: '00000000', data: { node: chatId, last_message: -1, content: '' } }]),
            request: JSON.stringify(request),
            csrf_token: auth.csrf_token
        };
        const sendRes = await fetch('https://funpay.com/runner/', {
            method: 'POST',
            credentials: 'include',
            headers: { 'content-type': 'application/x-www-form-urlencoded; charset=UTF-8', 'x-requested-with': 'XMLHttpRequest' },
            body: new URLSearchParams(payload)
        });
        if (sendRes.status === 400) return { retry: true, where: 'runner' };
        if (!sendRes.ok) throw new Error(`Отправка изображения: HTTP ${sendRes.status}`);
        const sendJson = await sendRes.json().catch(() => null);
        const errMsg = sendJson?.error || sendJson?.response?.error;
        if (errMsg) {
            if (/csrf|обнов|refresh/i.test(String(errMsg))) return { retry: true, where: 'runner-err' };
            throw new Error(`FunPay runner: ${errMsg}`);
        }
        return { ok: true, fileId };
    }

    let res = await attempt(false);
    if (res && res.retry) {
        console.warn(`FP Tools: 400 на этапе "${res.where}", обновляю csrf и повторяю.`);
        res = await attempt(true);
        if (res && res.retry) {
            throw new Error('FunPay вернул 400 даже после обновления csrf.');
        }
    }
    return { fileId: res.fileId };
}

async function getAuthDetailsForBackground(force) {
    const goldenKeyCookie = await chrome.cookies.get({ url: 'https://funpay.com', name: 'golden_key' });
    if (!goldenKeyCookie || !goldenKeyCookie.value) {
        console.error("FP Tools: golden_key не найден.");
        return {};
    }
    const golden_key = goldenKeyCookie.value;
    const phpSessIdCookie = await chrome.cookies.get({ url: 'https://funpay.com', name: 'PHPSESSID' });
    const phpsessid = phpSessIdCookie?.value || '';

    if (!force) {
        const tabs = await chrome.tabs.query({ url: "https://funpay.com/*" });
        for (const tab of tabs) {
            try {
                if (tab.discarded) continue;
                const response = await chrome.tabs.sendMessage(tab.id, { action: "getAppData" });
                if (response && response.success) {
                    const appData = Array.isArray(response.data) ? response.data[0] : response.data;
                    if (appData && appData['csrf-token'] && appData.userId) {
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
                console.warn(`FP Tools: appData из вкладки ${tab.id} недоступна.`);
            }
        }
    }

    try {
        const fresh = await fetchFreshCsrf();
        return { golden_key, phpsessid, ...fresh };
    } catch (e) {
        console.error("FP Tools: свежий csrf недоступен.", e.message);
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
        // активной сессии (ручной заголовок Cookie браузер игнорирует - forbidden header).
        const resp = await fetch('https://funpay.com/orders/trade', {
            credentials: 'include',
            cache: 'no-store'
        });
        if (!resp.ok) return [];
        // Если нас разлогинило/редиректнуло на страницу входа - не считаем это заказами.
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

// Получить список чатов (для команды /chats) - переиспользуем runner как Discord.
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
        const all = await FPTSalesDB.getAllAsArray();
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
            // Если Discord активен - он уже кормит Telegram внутри runDiscordCheckCycle.
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

async function cloneBuildFieldsInternal(auth, nodeId, attributes, attributePairs) {
    if (!nodeId) throw new Error('Неизвестна подкатегория (node) лота.');
    
    const editUrl = `https://funpay.com/lots/offerEdit?node=${nodeId}&setlocale=en`;
    const resp = await fetch(editUrl, { headers: { 'Cookie': `golden_key=${auth.golden_key}` } });
    if (!resp.ok) throw new Error(`Не удалось открыть форму категории: ${resp.status}`);
    const html = await resp.text();
    
    // ВОЗВРАЩАЕМ русский язык вашему аккаунту
    await fetch(`https://funpay.com/?setlocale=ru`, { headers: { 'Cookie': `golden_key=${auth.golden_key}` } });
    
    const fields = await parseHtmlViaOffscreen(html, 'solveCloneForm', { attributes: attributes || [], attributePairs: attributePairs || [] });
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
    const r = await fptFetchResilient('https://funpay.com/lots/calc', { method: 'POST', headers, body });
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
            credentials: 'include',
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
// страницу ПОД КОНКРЕТНЫМ аккаунтом - временно подменить cookie golden_key,
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

        // Если ключ совпадает с активным - просто грузим главную как есть.
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
    // Поднять все лоты по кнопке с профиля
    if (request && request.action === 'fptRaiseAllNow') {
        runBumpCycle()
            .then(res => sendResponse({ ok: true, summary: res || {} }))
            .catch(e => sendResponse({ ok: false, error: e && e.message }));
        return true;
    }
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
                    credentials: 'include',
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
            // Уникальный bust на каждый запрос: пробивает и HTTP-кэш браузера,
            // и залипший edge-кэш jsdelivr по @main.
            const bust = Date.now() + '_' + Math.random().toString(36).slice(2);

            // Несколько источников по очереди. raw github отдаёт актуальное
            // сразу после коммита и не кэшируется как CDN, поэтому он первый.
            // Дальше - оба репозитория через оба способа, на всякий случай.
            const sources = [
                `https://raw.githubusercontent.com/XaviersDev/FunPayTools-Site/main/donaters.json?t=${bust}`,
                `https://raw.githubusercontent.com/XaviersDev/FunPay-Tools/main/donaters.json?t=${bust}`,
                `https://cdn.jsdelivr.net/gh/XaviersDev/FunPayTools-Site@main/donaters.json?t=${bust}`,
                `https://cdn.jsdelivr.net/gh/XaviersDev/FunPay-Tools@main/donaters.json?t=${bust}`
            ];

            const fetchOpts = {
                method: 'GET',
                cache: 'no-store',          // запрет HTTP-кэша браузера
                headers: { 'Cache-Control': 'no-cache', 'Pragma': 'no-cache' }
            };

            let lastErr = null;
            for (const url of sources) {
                try {
                    const res = await fetch(url, fetchOpts);
                    if (!res.ok) { lastErr = new Error(`HTTP ${res.status} @ ${url}`); continue; }
                    const json = await res.json();
                    // Принимаем только непустой объект - отсекаем битые/пустые ответы.
                    if (json && typeof json === 'object' && Object.keys(json).length > 0) {
                        sendResponse({ success: true, data: json });
                        return;
                    }
                    lastErr = new Error(`Empty/invalid JSON @ ${url}`);
                } catch (e) {
                    lastErr = e;
                }
            }
            sendResponse({ success: false, error: String(lastErr) });
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
        startAutoBump().then(() => sendResponse({ success: true }));
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

    // FIX 2.9.1: импорт СВОИХ лотов. Раньше превью своих лотов шло через cloneGetSource,
    // который читает ПУБЛИЧНУЮ страницу (без payment_msg/secrets) и переключает локаль.
    // Здесь читаем форму offerEdit владельца НАПРЯМУЮ (одна загрузка, без смены локали) -
    // там есть ВСЁ: цена, сообщение покупателю (ru/en), товары автовыдачи, галка автовыдачи.
    if (request.action === 'getOwnLotFull') {
        (async () => {
            try {
                const auth = await getAuthDetailsForBackground();
                if (!auth.golden_key) throw new Error('Не авторизован (нет golden_key).');
                const offerId = request.offerId;
                if (!offerId) throw new Error('Не передан ID лота.');

                // node не обязателен: offerEdit?offer=ID сам отдаёт нужную форму
                const editUrl = request.nodeId
                    ? `https://funpay.com/lots/offerEdit?node=${request.nodeId}&offer=${offerId}`
                    : `https://funpay.com/lots/offerEdit?offer=${offerId}`;
                const resp = await fetch(editUrl, { headers: { 'Cookie': `golden_key=${auth.golden_key}` } });
                if (!resp.ok) throw new Error(`Ошибка загрузки лота: ${resp.status}`);
                const html = await resp.text();
                const data = await parseHtmlViaOffscreen(html, 'parseLotEditPage');
                if (!data) throw new Error('Не удалось разобрать форму лота.');

                // Формируем source для превью импорта из полного набора полей формы.
                const g = (k) => (data[k] != null ? data[k] : '');
                const source = {
                    isOwn: true,
                    offerId: String(offerId),
                    nodeId: data.node_id || request.nodeId || '',
                    summary_ru: g('fields[summary][ru]'),
                    summary_en: g('fields[summary][en]'),
                    desc_ru: g('fields[desc][ru]'),
                    desc_en: g('fields[desc][en]'),
                    payment_msg_ru: g('fields[payment_msg][ru]'),
                    payment_msg_en: g('fields[payment_msg][en]'),
                    rawPrice: g('price'),
                    amount: g('amount'),
                    secrets: g('secrets'),
                    autoDelivery: !!data.auto_delivery,
                    fullData: data    // полный набор для вставки/импорта без потерь
                };
                sendResponse({ success: true, source });
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
                let ruResp;
                try {
                    ruResp = await fptFetchResilient(`https://funpay.com/lots/offer?id=${offerId}&setlocale=ru`, { headers: ck });
                } catch (_) {
                    throw new Error('FunPay не отвечает (похоже, временные неполадки сайта — 502/таймаут). Попробуйте ещё раз через минуту.');
                }
                if (ruResp.status >= 500) throw new Error(`FunPay вернул ошибку сервера (${ruResp.status}) — это со стороны FunPay. Повторите позже.`);
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

                // Цена.
                // 1) ЛУЧШИЙ источник: data-factors на странице покупки (цена продавца нетто).
                //    parsePublicLotForClone уже положил её в ru.price + ru.priceIsSellerNet.
                let rawPrice = '';
                let priceCurrency = '';
                let priceAlreadyNet = false;
                if (ru.price && ru.priceIsSellerNet) {
                    rawPrice = String(ru.price);
                    priceCurrency = ru.priceCurrencyHint || 'rub';
                    priceAlreadyNet = true;
                }

                // 2) Иначе — цена из списка лотов продавца (это цена ПОКУПАТЕЛЯ, нужен пересчёт).
                if (!rawPrice && ru.sellerId) {
                    try {
                        const upResp = await fetch(`https://funpay.com/users/${ru.sellerId}/`, { headers: ck });
                        if (upResp.ok) {
                            const upHtml = await upResp.text();
                            const pr = await parseHtmlViaOffscreen(upHtml, 'parseSellerLotPrice', { offerId });
                            if (pr && pr.price) { rawPrice = pr.price; priceCurrency = pr.currency || ''; }
                        }
                    } catch (_) {}
                }

                // 3) FALLBACK для СВОИХ лотов: цена из формы offerEdit (input[name=price]) —
                //    это тоже цена продавца нетто. И заодно точный node_id формы.
                if (!rawPrice || true) { // всегда пробуем offerEdit ради точного node_id
                    try {
                        const edResp = await fptFetchResilient(
                            `https://funpay.com/lots/offerEdit?offer=${offerId}&location=offer&setlocale=ru`,
                            { headers: ck });
                        if (edResp.ok) {
                            const edHtml = await edResp.text();
                            const pr = await parseHtmlViaOffscreen(edHtml, 'parseOfferEditPrice');
                            if (pr) {
                                if (!rawPrice && pr.price) { rawPrice = pr.price; priceCurrency = pr.currency || priceCurrency; priceAlreadyNet = true; }
                                if (pr.nodeId && /^\d+$/.test(pr.nodeId)) ru.nodeId = pr.nodeId;
                            }
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
                    matchAttributes: Array.from(new Set([
                        ...((en && en.attributes) || []),
                        ...(ru.attributes || [])
                    ].map(a => String(a).toLowerCase()))),
                    // пары заголовок→значение для заполнения свободных текстовых полей
                    // (RU-пары приоритетнее: на RU-форме заголовки полей по-русски)
                    matchPairs: [
                        ...((ru && ru.attributePairs) || []),
                        ...((en && en.attributePairs) || [])
                    ]
                };

                let fields = null;
                let formError = null;
                if (source.nodeId && !source.isChips) {
                    try {
                        fields = await cloneBuildFieldsInternal(auth, source.nodeId, source.matchAttributes, source.matchPairs);

                        if (rawPrice) {
                            const rawNum = parseFloat(String(rawPrice).replace(',', '.'));
                            if (priceAlreadyNet) {
                                // цена уже нетто (продавца) — берём как есть
                                source.finalPrice = (!Number.isNaN(rawNum) && rawNum > 0) ? rawNum : null;
                            } else {
                                try {
                                    const net = await cloneCalcNetPrice(auth, source.nodeId, rawNum, priceCurrency);
                                    // если пересчёт дал мусор (<=0 или NaN) — используем исходную цену
                                    source.finalPrice = (net != null && !Number.isNaN(net) && net > 0) ? net : ((!Number.isNaN(rawNum) && rawNum > 0) ? rawNum : null);
                                } catch (_) {
                                    source.finalPrice = (!Number.isNaN(rawNum) && rawNum > 0) ? rawNum : null;
                                }
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

    // FP Tools: построить форму создания лота из данных страницы КУПЛЕННОГО заказа.
    // На странице заказа нет offerId исходного лота, но есть nodeId (категория) и
    // тексты/автовыдача. Строим ту же форму категории, что и обычное клонирование,
    // и возвращаем { source, fields, csrf } в формате визарда openCloneWizard.
    if (request.action === 'orderBuildClone') {
        (async () => {
            try {
                const auth = await getAuthDetailsForBackground();
                if (!auth.golden_key) throw new Error('Не авторизован (golden_key).');
                const d = request.data || {};
                const nodeId = String(d.nodeId || '').trim();
                if (!nodeId || !/^\d+$/.test(nodeId)) throw new Error('Не удалось определить категорию (node) лота.');

                // строим пустую форму категории (с CSRF, обяз. полями и т.д.)
                const fields = await cloneBuildFieldsInternal(auth, nodeId, [], []);

                // секреты автовыдачи: кладём в форму + включаем авто-выдачу
                if (d.secrets) {
                    fields['secrets'] = d.secrets;
                    fields['auto_delivery'] = 'on';
                }

                const source = {
                    nodeId,
                    isChips: false,
                    summary_ru: d.summary_ru || '',
                    desc_ru: d.desc_ru || '',
                    summary_en: d.summary_en || '',
                    desc_en: d.desc_en || '',
                    enDiffers: !!((d.summary_en && d.summary_en !== d.summary_ru) || (d.desc_en && d.desc_en !== d.desc_ru)),
                    categoryName: d.categoryName || '',
                    sellerName: d.sellerName || '',
                    sellerId: d.sellerId || '',
                    images: [],
                    secrets: d.secrets || '',
                    rawPrice: d.rawPrice || null,
                    priceCurrency: d.priceCurrency || '',
                    finalPrice: null,
                    attributePairs: d.attributePairs || []
                };

                // цена: на странице заказа это цена ПОКУПАТЕЛЯ — пересчитаем в нетто продавца
                if (d.rawPrice) {
                    const rawNum = parseFloat(String(d.rawPrice).replace(',', '.'));
                    if (!Number.isNaN(rawNum) && rawNum > 0) {
                        try {
                            const net = await cloneCalcNetPrice(auth, nodeId, rawNum, d.priceCurrency);
                            source.finalPrice = (net != null && net > 0) ? net : rawNum;
                        } catch (_) { source.finalPrice = rawNum; }
                    }
                }

                sendResponse({ success: true, source, fields, csrf: auth.csrf_token });
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
                let response;
                try {
                    response = await fptFetchResilient('https://funpay.com/en/lots/offerSave', {
                        method: 'POST',
                        headers: {
                            'X-Requested-With': 'XMLHttpRequest',
                            'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
                            'Accept': 'application/json, text/javascript, */*; q=0.01',
                            'Cookie': `golden_key=${auth.golden_key}`
                        },
                        body
                    });
                } catch (netErr) {
                    throw new Error('FunPay не отвечает (возможно, у сайта временные неполадки — 502/таймаут). Лот мог НЕ создаться. Подождите минуту и проверьте список лотов перед повторной попыткой.');
                }
                if (response.status >= 500) {
                    throw new Error(`FunPay вернул ошибку сервера (${response.status}). Это проблема на стороне FunPay, не расширения. Лот мог не создаться — проверьте список лотов перед повтором.`);
                }
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

                // --- Логика входа повторяет то, что делает cookie-editor ---
                // Кук-эдитор просто МЕНЯЕТ значение golden_key и НЕ трогает PHPSESSID —
                // FunPay сам перепривязывает сессию к новому ключу на следующем запросе.
                // Прошлые версии УДАЛЯЛИ PHPSESSID и так роняли в пустую сессию.
                //
                // Важные детали, без которых вход не срабатывал:
                //  1. FunPay ставит golden_key как httpOnly на домен ".funpay.com".
                //     chrome.cookies.set НЕ может пометить куку httpOnly, поэтому если
                //     просто записать новую — она будет ОТДЕЛЬНОЙ (non-httpOnly), а сервер
                //     продолжит видеть старую httpOnly → пустая/старая сессия.
                //     Поэтому СНАЧАЛА удаляем все существующие golden_key (remove умеет
                //     убирать и httpOnly-куки), и только потом ставим новую.
                //  2. domain ставим как у FunPay — с ведущей точкой ".funpay.com".

                // 1) Снимаем все варианты golden_key (host-only и доменные, вкл. httpOnly).
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

                // 2) Ставим новый golden_key так же, как FunPay: domain ".funpay.com",
                //    secure, path "/", долгий срок. PHPSESSID НЕ трогаем — пусть FunPay
                //    перепривяжет сессию сам (как при смене ключа в cookie-editor).
                let setResult = await chrome.cookies.set({
                    url: 'https://funpay.com/',
                    name: 'golden_key',
                    value: request.key,
                    domain: '.funpay.com',
                    path: '/',
                    secure: true,
                    sameSite: 'lax',
                    expirationDate: Math.floor(Date.now() / 1000) + (365 * 24 * 60 * 60)
                });

                // Подстраховка: некоторые сборки Chrome капризничают с domain+url.
                // Пробуем host-only вариант, если доменный не записался.
                if (!setResult) {
                    setResult = await chrome.cookies.set({
                        url: 'https://funpay.com/',
                        name: 'golden_key',
                        value: request.key,
                        path: '/',
                        secure: true,
                        sameSite: 'lax',
                        expirationDate: Math.floor(Date.now() / 1000) + (365 * 24 * 60 * 60)
                    });
                }

                if (!setResult) {
                    throw new Error('Не удалось записать куку аккаунта (cookies.set вернул null).');
                }

                // 3) Перезагружаем вкладку — FunPay выдаст/перепривяжет сессию под новый ключ.
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
    if (request.action === 'getSalesOrders') {
        (async () => {
            try {
                await FPTSalesDB.migrateFromLocalStorage(); // на случай первого запуска
                const orders = await FPTSalesDB.getAllAsArray();
                sendResponse({ success: true, orders });
            } catch (e) {
                sendResponse({ success: false, error: e.message, orders: [] });
            }
        })();
        return true;
    }
    if (request.action === 'getSalesCount') {
        (async () => {
            try {
                await FPTSalesDB.migrateFromLocalStorage();
                const c = await FPTSalesDB.count();
                sendResponse({ success: true, count: c });
            } catch (e) {
                sendResponse({ success: false, error: e.message, count: 0 });
            }
        })();
        return true;
    }
    if (request.action === 'updateSales') {
        runSalesUpdateCycle().then(() => sendResponse({success: true})).catch(e => sendResponse({success: false, error: e.message}));
        return true;
    }
    if (request.action === 'resetSalesStorage') {
        (async () => {
            try {
                await FPTSalesDB.clearAll();
                await FPTSalesDB.setMeta('migratedFromLocal', true); // не тянуть старьё обратно
                await chrome.storage.local.remove([
                    'fpToolsSalesData', 'fpToolsFirstOrderId', 'fpToolsLastOrderId', 'fpToolsSalesLastUpdate'
                ]);
                sendResponse({ success: true });
            } catch (e) {
                sendResponse({ success: false, error: e.message });
            }
        })();
        return true;
    }

    // PURCHASES STATS HANDLERS (зеркало продаж, отдельная база покупок)
    if (request.action === 'getPurchaseOrders') {
        (async () => {
            try {
                const orders = await FPTPurchasesDB.getAllAsArray();
                sendResponse({ success: true, orders });
            } catch (e) {
                sendResponse({ success: false, error: e.message, orders: [] });
            }
        })();
        return true;
    }
    if (request.action === 'getPurchaseCount') {
        (async () => {
            try {
                const c = await FPTPurchasesDB.count();
                sendResponse({ success: true, count: c });
            } catch (e) {
                sendResponse({ success: false, error: e.message, count: 0 });
            }
        })();
        return true;
    }
    if (request.action === 'updatePurchases') {
        runPurchasesUpdateCycle().then(() => sendResponse({success: true})).catch(e => sendResponse({success: false, error: e.message}));
        return true;
    }
    if (request.action === 'resetPurchasesStorage') {
        (async () => {
            try {
                await FPTPurchasesDB.clearAll();
                await chrome.storage.local.remove(['fpToolsPurchasesLastUpdate']);
                sendResponse({ success: true });
            } catch (e) {
                sendResponse({ success: false, error: e.message });
            }
        })();
        return true;
    }

    // FINANCE STATS HANDLERS (отдельная база финансов)
    if (request.action === 'getFinanceTxns') {
        (async () => {
            try {
                const txns = await FPTFinanceDB.getAllAsArray();
                sendResponse({ success: true, txns });
            } catch (e) {
                sendResponse({ success: false, error: e.message, txns: [] });
            }
        })();
        return true;
    }
    if (request.action === 'getFinanceCount') {
        (async () => {
            try {
                const c = await FPTFinanceDB.count();
                sendResponse({ success: true, count: c });
            } catch (e) {
                sendResponse({ success: false, error: e.message, count: 0 });
            }
        })();
        return true;
    }
    if (request.action === 'updateFinance') {
        runFinanceUpdateCycle().then(() => sendResponse({ success: true })).catch(e => sendResponse({ success: false, error: e.message }));
        return true;
    }
    if (request.action === 'resetFinanceStorage') {
        (async () => {
            try {
                await FPTFinanceDB.clearAll();
                await chrome.storage.local.remove(['fpToolsFinanceLastUpdate', 'fpToolsFinanceCount']);
                sendResponse({ success: true });
            } catch (e) {
                sendResponse({ success: false, error: e.message });
            }
        })();
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
                    // FIX 2.9.1: грузим заявки ДВУМЯ наборами - status=all И status=active,
                    // постранично, затем объединяем по id. Причина: в выдаче status=all
                    // FunPay может показывать открытые заявки не на первой странице
                    // (порядок last_answered), и при ранней остановке пагинации активная
                    // заявка терялась - фильтр "Актуальные" оказывался пустым. Отдельная
                    // загрузка status=active гарантирует, что все открытые заявки в кэше.
                    const all = [];
                    const seen = new Set();
                    const MAX_PAGES = 30;

                    const loadStatus = async (status) => {
                        for (let page = 1; page <= MAX_PAGES; page++) {
                            let pageTickets = null;
                            try {
                                const r = await sfetchSupport(`${supportBase}/tickets?status=${status}&order=last_answered&page=${page}`);
                                const html = await r.text();
                                pageTickets = await parseHtmlViaOffscreen(html, 'parseSupportTickets');
                            } catch (pageErr) {
                                if (page === 1 && status === 'all') throw pageErr;
                                break;
                            }
                            if (!pageTickets || !pageTickets.length) break;
                            let added = 0;
                            for (const t of pageTickets) {
                                if (t && t.id != null && !seen.has(t.id)) {
                                    seen.add(t.id);
                                    all.push(t);
                                    added++;
                                }
                            }
                            if (added === 0) break;
                        }
                    };

                    await loadStatus('all');
                    // активные догружаем отдельно (их обычно немного - 1-2 страницы)
                    try { await loadStatus('active'); } catch (_) {}

                    sendResponse({ success: true, tickets: all });
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
        await runScheduledBump();
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
    if (alarm.name === 'fpToolsAutoRestore') {
        // Notify all FunPay tabs to check and restore/disable lots
        const tabs = await chrome.tabs.query({ url: "https://funpay.com/*" });
        tabs.forEach(tab => {
            chrome.tabs.sendMessage(tab.id, { action: 'fpToolsCheckRestoreLots' }).catch(() => {});
        });
    }
});

function setupInitialAlarms() {
    chrome.storage.local.get(['autoBumpEnabled', 'fpToolsDiscord', 'fpToolsAutoReplies'], (settings) => {
        if (settings.autoBumpEnabled) {
            runScheduledBump();
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
    if (changes.autoBumpEnabled) {
        if (changes.autoBumpEnabled.newValue) {
            runScheduledBump();
        } else {
            chrome.alarms.clear(BUMP_ALARM_NAME);
        }
    }
});

chrome.runtime.onUpdateAvailable.addListener(function(details) {
    console.log("FP Tools: доступно обновление до версии " + details.version + ". применение...");
    chrome.runtime.reload();
});