/*
 * FP Tools — доступ к ФИНАНСАМ из CONTENT-скриптов.
 * IndexedDB изолирован по origin, поэтому единственный владелец базы — background.
 * FPTFinanceDB здесь — тонкий клиент: шлёт запросы в background по сообщениям.
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
        const resp = await ask('getFinanceTxns');
        return (resp && resp.success && Array.isArray(resp.txns)) ? resp.txns : [];
    }

    async function count() {
        const resp = await ask('getFinanceCount');
        return (resp && resp.success) ? (resp.count || 0) : 0;
    }

    async function update() { return await ask('updateFinance'); }
    async function reset() { return await ask('resetFinanceStorage'); }

    root.FPTFinanceDB = { getAllAsArray, count, update, reset };
})(typeof window !== 'undefined' ? window : this);
