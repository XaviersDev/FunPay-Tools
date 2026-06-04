// background/smart_bump.js - FunPay Tools 3.0
// "Smart" auto-raise mode, ported from FP Tools's FP Tools.raise_lots().
//
// The old autobump just raised every category on a fixed interval (e.g. every 245 min) and
// ate FunPay's "wait N minutes" errors. Smart mode instead:
//   - reads FunPay's actual response after each raise attempt,
//   - parses the exact remaining wait time per category (parseWaitTime, ported 1:1 from
//     FP Tools's utils.parse_wait_time),
//   - stores a per-category nextRaiseAt timestamp,
//   - only raises categories that are actually due,
//   - reschedules its heartbeat to fire right when the soonest category becomes due.
//
// Result: each category is raised as early as FunPay allows, with no wasted requests and no
// rate-limit spam - exactly FP Tools's behaviour, adapted to MV3.

export const SMART_BUMP_ALARM = 'fpToolsSmartBump';
const STATE_KEY = 'fpToolsSmartBumpState'; // { [categoryUrl]: { nextRaiseAt, name } }
const OFFSCREEN_PATH = 'offscreen/offscreen.html';

// Ported 1:1 from FP Tools utils.parse_wait_time - returns seconds to wait.
function parseWaitTime(msg) {
    const s = String(msg || '');
    const digits = (s.match(/\d/g) || []).join('');
    const n = digits ? parseInt(digits, 10) : 0;
    if (/секунд|second/i.test(s)) return n || 2;
    if (/минут|хвилин|minute/i.test(s)) return ((n || 2) - 1) * 60;
    if (/час|годин|hour/i.test(s)) return Math.round(((n || 1) - 0.5) * 3600);
    return 10;
}

async function parseHtmlViaOffscreen(html, action) {
    const existing = await chrome.runtime.getContexts({
        contextTypes: ['OFFSCREEN_DOCUMENT'],
        documentUrls: [chrome.runtime.getURL(OFFSCREEN_PATH)]
    });
    if (!existing.length) {
        await chrome.offscreen.createDocument({ url: OFFSCREEN_PATH, reasons: ['DOM_PARSER'], justification: 'parse' });
    }
    return chrome.runtime.sendMessage({ target: 'offscreen', action, html });
}

async function getAuth() {
    const gk = await chrome.cookies.get({ url: 'https://funpay.com', name: 'golden_key' });
    if (!gk?.value) return null;
    const ps = await chrome.cookies.get({ url: 'https://funpay.com', name: 'PHPSESSID' });
    const cookies = ps?.value ? `golden_key=${gk.value}; PHPSESSID=${ps.value}` : `golden_key=${gk.value}`;

    const tabs = await chrome.tabs.query({ url: 'https://funpay.com/*' });
    for (const tab of tabs) {
        if (tab.discarded) continue;
        try {
            const r = await chrome.tabs.sendMessage(tab.id, { action: 'getAppData' });
            if (r?.success) {
                const d = Array.isArray(r.data) ? r.data[0] : r.data;
                if (d?.['csrf-token'] && d.userId) return { cookies, csrfToken: d['csrf-token'], userId: d.userId };
            }
        } catch (_) {}
    }
    // fallback: scrape main page
    try {
        const res = await fetch('https://funpay.com/', { headers: { cookie: cookies } });
        const text = await res.text();
        const m = text.match(/<body[^>]*data-app-data="([^"]+)"/);
        if (m) {
            const d = JSON.parse(m[1].replace(/&quot;/g, '"'));
            const u = Array.isArray(d) ? d[0] : d;
            if (u?.['csrf-token'] && u.userId) return { cookies, csrfToken: u['csrf-token'], userId: u.userId };
        }
    } catch (_) {}
    return null;
}

// Raise one category. Returns { ok, waitSec, name } - waitSec is when to try again.
async function raiseCategory(categoryUrl, auth) {
    const headers = {
        'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'cookie': auth.cookies,
        'x-requested-with': 'XMLHttpRequest',
        'x-csrf-token': auth.csrfToken
    };

    // Load category page to discover game_id / node_id and name.
    const pageRes = await fetch(categoryUrl, { headers: { cookie: auth.cookies } });
    if (!pageRes.ok) return { ok: false, waitSec: 600, name: categoryUrl };
    const pageHtml = await pageRes.text();
    const nameMatch = pageHtml.match(/<span class="inside">([^<]+)<\/span>/);
    const name = nameMatch ? nameMatch[1].trim() : categoryUrl;
    const btn = pageHtml.match(/<button[^>]+class="[^"]*js-lot-raise[^"]*"[^>]*data-game="(\d+)"[^>]*data-node="([^"]+)"/);
    if (!btn) return { ok: false, waitSec: 600, name };

    const gameId = btn[1], nodeId = btn[2];

    // First attempt (single node).
    let body = new URLSearchParams({ game_id: gameId, node_id: nodeId });
    let res = await fetch('https://funpay.com/lots/raise', { method: 'POST', headers, body: body.toString() });
    let json = await res.json().catch(() => ({}));

    // FunPay may ask to confirm multiple subcategories via a modal.
    if (json.modal) {
        const ids = Array.from(json.modal.matchAll(/<input[^>]*value="(\d+)"/g), m => m[1]);
        if (ids.length) {
            body = new URLSearchParams();
            body.append('game_id', gameId);
            body.append('node_id', nodeId);
            ids.forEach(id => body.append('node_ids[]', id));
            res = await fetch('https://funpay.com/lots/raise', { method: 'POST', headers, body: body.toString() });
            json = await res.json().catch(() => ({}));
        }
    }

    // FP Tools logic: success when no error and no url; url => 2h; "wait" msg => parse it.
    if (!json.error && !json.url) {
        return { ok: true, waitSec: 4 * 3600, name }; // default FunPay cooldown ~4h
    }
    if (json.url) {
        return { ok: false, waitSec: 7200, name };
    }
    if (json.msg && /(Подожди|Please wait|Зачекай)/i.test(json.msg)) {
        return { ok: false, waitSec: parseWaitTime(json.msg), name };
    }
    return { ok: false, waitSec: 600, name };
}

async function getState() {
    const { [STATE_KEY]: st = {} } = await chrome.storage.local.get(STATE_KEY);
    return st;
}
async function setState(st) {
    await chrome.storage.local.set({ [STATE_KEY]: st });
}

function logToTabs(message) {
    const line = `[${new Date().toLocaleTimeString()}] ${message}`;
    chrome.tabs.query({ url: 'https://funpay.com/*' }).then(tabs => {
        tabs.forEach(t => chrome.tabs.sendMessage(t.id, { action: 'logToAutoBumpConsole', message: line }).catch(() => {}));
    });
    console.log('[FP Tools SmartBump]', line);
}

// Run one smart-bump pass. Raises only due categories, updates per-category nextRaiseAt,
// and arms the alarm for the soonest upcoming due time.
export async function runSmartBumpCycle() {
    const { fpToolsSelectiveBumpEnabled, fpToolsSelectedBumpCategories, fpToolsBumpOnlyAutoDelivery } =
        await chrome.storage.local.get(['fpToolsSelectiveBumpEnabled', 'fpToolsSelectedBumpCategories', 'fpToolsBumpOnlyAutoDelivery']);

    const auth = await getAuth();
    if (!auth) { logToTabs('Умное поднятие: нет авторизации (golden_key/csrf).'); return; }

    const userUrl = `https://funpay.com/users/${auth.userId}/`;
    const userHtml = await (await fetch(userUrl, { headers: { cookie: auth.cookies } })).text();
    let categories = await parseHtmlViaOffscreen(userHtml, 'parseUserCategories');
    if (!Array.isArray(categories)) categories = [];

    if (fpToolsBumpOnlyAutoDelivery) categories = categories.filter(c => c.hasAutoDelivery);
    if (fpToolsSelectiveBumpEnabled && fpToolsSelectedBumpCategories?.length) {
        categories = categories.filter(c => fpToolsSelectedBumpCategories.includes(c.id));
    } else if (fpToolsSelectiveBumpEnabled) {
        logToTabs('Умное поднятие: выборочный режим включён, но категории не выбраны.');
        return;
    }

    const state = await getState();
    const now = Date.now();
    let soonest = Infinity;

    for (const cat of categories) {
        const url = new URL(cat.id, 'https://funpay.com/').href;
        const entry = state[url];
        if (entry && entry.nextRaiseAt > now) {
            soonest = Math.min(soonest, entry.nextRaiseAt);
            continue; // not due yet
        }

        try {
            const { ok, waitSec, name } = await raiseCategory(url, auth);
            const nextRaiseAt = now + Math.max(waitSec, 30) * 1000;
            state[url] = { nextRaiseAt, name };
            soonest = Math.min(soonest, nextRaiseAt);
            logToTabs(ok ? `Поднято: ${name}. Следующее через ~${Math.round(waitSec / 60)} мин.`
                         : `Не поднято: ${name}. Повтор через ~${Math.round(waitSec / 60)} мин.`);
        } catch (e) {
            state[url] = { nextRaiseAt: now + 600000, name: url };
            soonest = Math.min(soonest, state[url].nextRaiseAt);
            logToTabs(`Ошибка поднятия ${url}: ${e.message}. Повтор через 10 мин.`);
        }
        await new Promise(r => setTimeout(r, 3000)); // pacing between categories
    }

    await setState(state);

    // Arm the alarm to fire when the soonest category becomes due (min 1 min - MV3 floor).
    if (soonest !== Infinity) {
        const delayMin = Math.max(1, Math.ceil((soonest - Date.now()) / 60000));
        await chrome.alarms.create(SMART_BUMP_ALARM, { delayInMinutes: delayMin });
        logToTabs(`Умное поднятие: следующая проверка через ~${delayMin} мин.`);
    } else {
        await chrome.alarms.create(SMART_BUMP_ALARM, { delayInMinutes: 5 });
    }
}

export async function startSmartBump() {
    await chrome.alarms.create(SMART_BUMP_ALARM, { delayInMinutes: 0.1 });
    await runSmartBumpCycle();
}

export async function stopSmartBump() {
    await chrome.alarms.clear(SMART_BUMP_ALARM);
    await chrome.storage.local.remove(STATE_KEY);
}
