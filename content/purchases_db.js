/*
 * FP Tools — доступ к ПОКУПКАМ из CONTENT-скриптов.
 *
 * ВАЖНО про IndexedDB и origin:
 * IndexedDB изолирован по origin. Service worker расширения и страница funpay.com —
 * это РАЗНЫЕ origin, поэтому база, заполненная в background, недоступна напрямую
 * со страницы (и наоборот). Единственный владелец базы — background. Content
 * НЕ открывает IndexedDB сам, а спрашивает данные у background по сообщениям.
 *
 * Здесь FPTPurchasesDB — тонкий клиент: те же методы, что и серверная версия,
 * но внутри они шлют запрос в background. Сигнатуры совпадают, поэтому весь
 * читающий код работает без изменений.
 */
(function (root) {
    'use strict';

    function ask(action, extra) {
        return new Promise((resolve) => {
            try {
                chrome.runtime.sendMessage(Object.assign({ action }, extra || {}), (resp) => {
                    if (chrome.runtime.lastError) { resolve(null); return; }
                    resolve(resp);
                });
            } catch (_) { resolve(null); }
        });
    }

    async function getAllAsArray() {
        const resp = await ask('getPurchaseOrders');
        return (resp && resp.success && Array.isArray(resp.orders)) ? resp.orders : [];
    }

    async function getAllAsMap() {
        const arr = await getAllAsArray();
        const map = {};
        for (const o of arr) map[o.orderId] = o;
        return map;
    }

    async function count() {
        const resp = await ask('getPurchaseCount');
        return (resp && resp.success && typeof resp.count === 'number') ? resp.count : 0;
    }

    // Эти методы со стороны content не используются для записи, но оставлены
    // для совместимости сигнатур — они проксируются в background.
    async function putOrders() { /* запись только в background */ }
    async function setMeta() {}
    async function getMeta() { return null; }
    async function clearAll() { await ask('resetPurchasesStorage'); }
    async function migrateFromLocalStorage() { return 0; }

    root.FPTPurchasesDB = {
        putOrders, getAllAsArray, getAllAsMap, count,
        getMeta, setMeta, clearAll, migrateFromLocalStorage,
    };
})(typeof self !== 'undefined' ? self : this);
