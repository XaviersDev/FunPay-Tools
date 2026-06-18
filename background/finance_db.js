/*
 * FP Tools — хранилище заказов в IndexedDB.
 *
 * Зачем: раньше все заказы лежали одним объектом в chrome.storage.local,
 * который ограничен ~10 МБ. На ~18800 заказах квота кончалась
 * (Resource::kQuotaBytes quota exceeded) и сбор статистики падал.
 * IndexedDB такого лимита не имеет — туда влезают все 65к+ заказов.
 *
 * Экспортирует глобальный объект FPTFinanceDB со следующим API:
 *   await FPTFinanceDB.putOrders(arrayOfOrders)   — добавить/обновить заказы (ключ orderId)
 *   await FPTFinanceDB.getAllAsMap()              — { orderId: order, ... } (как старый fpToolsSalesData)
 *   await FPTFinanceDB.getAllAsArray()            — [order, ...]
 *   await FPTFinanceDB.count()                    — число заказов
 *   await FPTFinanceDB.getMeta(key)               — служебное значение (firstOrderId/lastOrderId/lastUpdate)
 *   await FPTFinanceDB.setMeta(key, value)
 *   await FPTFinanceDB.clearAll()                 — стереть всё
 *   (миграции нет — финансы раньше не хранились)
 */
(function (root) {
    'use strict';

    const DB_NAME = 'fpt-finance-db';
    const DB_VERSION = 1;
    const STORE_ORDERS = 'orders';
    const STORE_META = 'meta';

    let _dbPromise = null;

    function openDB() {
        if (_dbPromise) return _dbPromise;
        _dbPromise = new Promise((resolve, reject) => {
            const req = indexedDB.open(DB_NAME, DB_VERSION);
            req.onupgradeneeded = () => {
                const db = req.result;
                if (!db.objectStoreNames.contains(STORE_ORDERS)) {
                    const os = db.createObjectStore(STORE_ORDERS, { keyPath: 'id' });
                    os.createIndex('date', 'date', { unique: false });
                }
                if (!db.objectStoreNames.contains(STORE_META)) {
                    db.createObjectStore(STORE_META, { keyPath: 'k' });
                }
            };
            req.onsuccess = () => {
                const db = req.result;
                db.onversionchange = () => { db.close(); _dbPromise = null; };
                db.onclose = () => { _dbPromise = null; };
                resolve(db);
            };
            req.onerror = () => { _dbPromise = null; reject(req.error); };
            req.onblocked = () => { _dbPromise = null; reject(new Error('IndexedDB open blocked')); };
        });
        return _dbPromise;
    }

    function txDone(tx) {
        return new Promise((resolve, reject) => {
            tx.oncomplete = () => resolve();
            tx.onabort = () => reject(tx.error || new Error('tx aborted'));
            tx.onerror = () => reject(tx.error);
        });
    }

    async function putOrders(orders) {
        if (!orders || !orders.length) return;
        const db = await openDB();
        const tx = db.transaction(STORE_ORDERS, 'readwrite');
        const store = tx.objectStore(STORE_ORDERS);
        for (const o of orders) {
            if (o && o.id != null) store.put(o);
        }
        await txDone(tx);
    }

    async function getAllAsArray() {
        const db = await openDB();
        return new Promise((resolve, reject) => {
            const req = db.transaction(STORE_ORDERS, 'readonly').objectStore(STORE_ORDERS).getAll();
            req.onsuccess = () => resolve(req.result || []);
            req.onerror = () => reject(req.error);
        });
    }

    async function getAllAsMap() {
        const arr = await getAllAsArray();
        const map = {};
        for (const o of arr) map[o.id] = o;
        return map;
    }

    async function count() {
        const db = await openDB();
        return new Promise((resolve, reject) => {
            const req = db.transaction(STORE_ORDERS, 'readonly').objectStore(STORE_ORDERS).count();
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        });
    }

    async function getMeta(key) {
        const db = await openDB();
        return new Promise((resolve, reject) => {
            const req = db.transaction(STORE_META, 'readonly').objectStore(STORE_META).get(key);
            req.onsuccess = () => resolve(req.result ? req.result.v : null);
            req.onerror = () => reject(req.error);
        });
    }

    async function setMeta(key, value) {
        const db = await openDB();
        const tx = db.transaction(STORE_META, 'readwrite');
        tx.objectStore(STORE_META).put({ k: key, v: value });
        await txDone(tx);
    }

    async function clearAll() {
        const db = await openDB();
        const tx = db.transaction([STORE_ORDERS, STORE_META], 'readwrite');
        tx.objectStore(STORE_ORDERS).clear();
        tx.objectStore(STORE_META).clear();
        await txDone(tx);
    }

    // Однократный перенос старых данных из chrome.storage.local в IndexedDB.
    // Возвращает число перенесённых заказов. Если в IndexedDB уже что-то есть
    // или мигрировать нечего — возвращает 0 и ничего не трогает.
    async function migrateFromLocalStorage() {
        return 0; // у финансов нет старых данных
    }

    const api = {
        putOrders,
        getAllAsArray,
        getAllAsMap,
        count,
        getMeta,
        setMeta,
        clearAll,
        migrateFromLocalStorage,
    };

    root.FPTFinanceDB = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : this);
