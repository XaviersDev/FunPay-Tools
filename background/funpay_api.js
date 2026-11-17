// background/funpay_api.js - FunPay Tools: клиент официального FunPay API.
//
// POST https://funpay.com/api/orders/get
//   body:    { order_uids: string[1..10], include?: ('details'|'users'|'review')[] }
//   headers: Accept-Language: ru|en|uk, Content-Type: application/json
//   auth:    cookie golden_key (браузер прикладывает сам, credentials:'include')
//
// Особенности, проверенные на живом API:
//   • > 10 UID в одном запросе → НЕ ошибка, а пустой результат. Поэтому режем на пачки по 10.
//   • пустой результат приходит как [] (PHP-массив), а не {}.
//   • заказы, к которым нет доступа / несуществующие, просто отсутствуют в data.
//   • без авторизации → 403 {"msg": "...", "error": 1}; кривое тело → 400 HTML.
//   • имена (game.name, buyer.name, ...) приходят только с include/Accept-Language.

const API_URL = 'https://funpay.com/api/orders/get';
const MAX_UIDS_PER_REQUEST = 10;
const CACHE_TTL_MS = 20000;          // один цикл автоответчика = одно обращение на заказ
const REQUEST_TIMEOUT_MS = 20000;
const UID_RE = /^[A-Z0-9]{8}$/;

export const FINAL_ORDER_STATUSES = new Set(['closed', 'refunded']);

export class FunPayApiError extends Error {
    constructor(message, { status = 0, auth = false } = {}) {
        super(message);
        this.name = 'FunPayApiError';
        this.status = status;
        this.auth = auth;            // true → не авторизован (golden_key невалиден)
    }
}

const _cache = new Map();            // `${lang}|${include}|${uid}` → { t, order|null }

function cacheKey(uid, include, lang) {
    return `${lang}|${include.join(',')}|${uid}`;
}

function normalizeUids(uids) {
    const out = [];
    const seen = new Set();
    for (const raw of uids || []) {
        const uid = String(raw || '').trim().replace(/^#/, '').toUpperCase();
        if (UID_RE.test(uid) && !seen.has(uid)) { seen.add(uid); out.push(uid); }
    }
    return out;
}

async function requestChunk(uids, include, lang) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS);
    let res;
    try {
        res = await fetch(API_URL, {
            method: 'POST',
            credentials: 'include',
            cache: 'no-store',
            signal: ctrl.signal,
            headers: { 'Content-Type': 'application/json', 'Accept-Language': lang, 'Accept': 'application/json' },
            body: JSON.stringify({ order_uids: uids, include })
        });
    } catch (e) {
        throw new FunPayApiError(e && e.name === 'AbortError' ? 'FunPay API: таймаут' : `FunPay API: сеть (${e && e.message})`);
    } finally {
        clearTimeout(timer);
    }

    let body = null;
    const text = await res.text();
    try { body = JSON.parse(text); } catch (_) {}

    if (res.status === 401 || res.status === 403) {
        throw new FunPayApiError((body && body.msg) || 'FunPay API: нужна авторизация', { status: res.status, auth: true });
    }
    if (!res.ok || !body) {
        throw new FunPayApiError(`FunPay API: HTTP ${res.status}`, { status: res.status });
    }
    if (body.status !== 'SUCCESS') {
        throw new FunPayApiError((body && body.msg) || 'FunPay API: неуспешный ответ', { status: res.status });
    }
    const data = body.data;
    return (data && typeof data === 'object' && !Array.isArray(data)) ? data : {};
}

/**
 * Заказы по UID. Возвращает Map uid → order (только доступные текущему аккаунту).
 * @param {string[]} uids
 * @param {{include?: string[], lang?: 'ru'|'en'|'uk', fresh?: boolean}} [opts]
 */
export async function getOrders(uids, { include = ['details', 'users', 'review'], lang = 'ru', fresh = false } = {}) {
    const list = normalizeUids(uids);
    const inc = [...new Set(include)].sort();
    const result = new Map();
    const missing = [];
    const now = Date.now();

    for (const uid of list) {
        const hit = !fresh && _cache.get(cacheKey(uid, inc, lang));
        if (hit && now - hit.t < CACHE_TTL_MS) {
            if (hit.order) result.set(uid, hit.order);
        } else {
            missing.push(uid);
        }
    }

    for (let i = 0; i < missing.length; i += MAX_UIDS_PER_REQUEST) {
        const chunk = missing.slice(i, i + MAX_UIDS_PER_REQUEST);
        const data = await requestChunk(chunk, inc, lang);
        const t = Date.now();
        for (const uid of chunk) {
            const order = data[uid] || null;
            _cache.set(cacheKey(uid, inc, lang), { t, order });
            if (order) result.set(uid, order);
        }
    }

    if (_cache.size > 2000) {
        for (const [k, v] of _cache) if (Date.now() - v.t > CACHE_TTL_MS) _cache.delete(k);
    }
    return result;
}

/** Один заказ или null (нет доступа / не существует). */
export async function getOrder(uid, opts) {
    const m = await getOrders([uid], opts);
    return m.get(normalizeUids([uid])[0]) || null;
}

export function clearOrdersCache() {
    _cache.clear();
}

function localized(v, lang = 'ru') {
    if (v == null) return '';
    if (typeof v === 'object') return String(v[lang] || v.ru || v.en || Object.values(v)[0] || '');
    return String(v);
}

/** Название товара заказа так, как его видит покупатель. */
export function orderTitle(order, lang = 'ru') {
    const td = order && order.type_data;
    if (!td) return '';
    if (td.fields) {
        const f = td.fields.summary || td.fields.title || td.fields.name;
        if (f) return localized(f.value, lang).trim();
    }
    if (td.chip) {
        const name = td.chip.name || '';
        return [name, td.amount ? `${td.amount} шт.` : ''].filter(Boolean).join(', ');
    }
    return '';
}

/** Товар из автовыдачи FunPay (secrets) одной строкой на позицию. */
export function orderSecretsText(order) {
    const s = order && order.type_data && order.type_data.secrets;
    if (!Array.isArray(s) || !s.length) return '';
    return s.map((x) => String(x && x.value != null ? x.value : '')).filter(Boolean).join('\n');
}

/** Статус API → статус записей статистики продаж ('paid' | 'closed' | 'refunded'). */
export function orderStatusForStats(order) {
    switch (order && order.status) {
        case 'closed': return 'closed';
        case 'refunded': return 'refunded';
        case 'partially_refunded': return 'closed';
        case 'paid':
        case 'unpaid':
        default: return 'paid';
    }
}
