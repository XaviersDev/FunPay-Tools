// background/plugins.js
// ---------------------------------------------------------------------------
// FunPay Cardinal plugin manager (background / service worker side).
//
// Owns the plugin store (chrome.storage.local.fpToolsPlugins), routes UI
// messages, boots the Python runtime in the offscreen document and dispatches
// Cardinal-compatible events to loaded plugins.
// ---------------------------------------------------------------------------

const OFFSCREEN_DOCUMENT_PATH = 'offscreen/offscreen.html';
const PLUGINS_KEY = 'fpToolsPlugins';
const PLUGIN_LOGS_KEY = 'fpToolsPluginLogs';
const LOG_CAP = 300;

// ─── storage helpers ────────────────────────────────────────────────────────
async function getPluginsMap() {
    const { [PLUGINS_KEY]: map = {} } = await chrome.storage.local.get(PLUGINS_KEY);
    return map || {};
}

async function setPluginsMap(map) {
    await chrome.storage.local.set({ [PLUGINS_KEY]: map });
}

async function appendLog(uuid, level, msg) {
    try {
        const { [PLUGIN_LOGS_KEY]: logs = {} } = await chrome.storage.local.get(PLUGIN_LOGS_KEY);
        const key = uuid || '_global';
        const arr = logs[key] || [];
        arr.push({ t: Date.now(), level: level || 'INFO', msg: String(msg).slice(0, 4000) });
        if (arr.length > LOG_CAP) arr.splice(0, arr.length - LOG_CAP);
        logs[key] = arr;
        await chrome.storage.local.set({ [PLUGIN_LOGS_KEY]: logs });
    } catch (_) { /* ignore */ }
}

// ─── offscreen runtime ──────────────────────────────────────────────────────
async function ensureOffscreen() {
    try {
        const existing = await chrome.runtime.getContexts({
            contextTypes: ['OFFSCREEN_DOCUMENT'],
            documentUrls: [chrome.runtime.getURL(OFFSCREEN_DOCUMENT_PATH)]
        });
        if (!existing.length) {
            await chrome.offscreen.createDocument({
                url: OFFSCREEN_DOCUMENT_PATH,
                reasons: ['DOM_PARSER'],
                justification: 'Python runtime for FunPay Cardinal plugins'
            });
        }
    } catch (e) {
        if (!String(e && e.message || '').includes('Only a single offscreen')) {
            console.warn('FP Tools plugins: ensureOffscreen', e && e.message || e);
        }
    }
}

function sendToOffscreen(message) {
    return chrome.runtime.sendMessage({ target: 'offscreen', ...message });
}

// The offscreen document may not have registered its message listener the
// instant it is created; retry a few times so callers don't see a spurious
// "Could not establish connection" error.
async function sendToOffscreenRetry(message, attempts = 4, delay = 400) {
    let lastErr;
    for (let i = 0; i < attempts; i++) {
        try {
            await ensureOffscreen();
        } catch (_) { /* ignore */ }
        try {
            return await sendToOffscreen(message);
        } catch (e) {
            lastErr = e;
            await new Promise(r => setTimeout(r, delay));
        }
    }
    throw lastErr || new Error('offscreen not available');
}

// Query the runtime without treating "not started yet" as an error. The
// offscreen document may not have registered its listener the instant it is
// created, so retry briefly before giving up.
async function queryRuntimeStatus() {
    const hasPlugins = await anyPluginsEnabled();
    try {
        await ensureOffscreen();
    } catch (_) { /* ignore */ }
    for (let attempt = 0; attempt < 3; attempt++) {
        try {
            const st = await sendToOffscreen({ action: 'fptPluginStatus' });
            if (st) return { ok: true, running: true, ...st };
        } catch (_) { /* listener not ready yet */ }
        await new Promise(r => setTimeout(r, 250));
    }
    // Offscreen not reachable → the engine simply hasn't been started.
    return { ok: true, ready: false, running: false, hasPlugins };
}

// Is the offscreen document currently alive? (never creates it)
async function offscreenExists() {
    try {
        const ctxs = await chrome.runtime.getContexts({
            contextTypes: ['OFFSCREEN_DOCUMENT'],
            documentUrls: [chrome.runtime.getURL(OFFSCREEN_DOCUMENT_PATH)],
        });
        return ctxs.length > 0;
    } catch (_) {
        return false;
    }
}

// Boot the runtime once and load all enabled plugins into it.
export async function ensurePluginRuntime() {
    const map = await getPluginsMap();
    const enabled = Object.values(map)
        .filter(p => p && p.enabled && typeof p.code === 'string')
        .map(p => ({ uuid: p.uuid, name: p.name, code: p.code }));

    // Nothing enabled → don't spin up the (heavy) Python runtime, but if it is
    // already running make sure previously loaded plugins are unloaded.
    if (!enabled.length) {
        if (!(await offscreenExists())) return { ok: true, ready: false, skipped: true };
    }

    try {
        return await sendToOffscreenRetry({ action: 'fptPluginBoot', plugins: enabled });
    } catch (e) {
        return { ok: false, error: String(e && e.message || e) };
    }
}

// ─── event dispatch ─────────────────────────────────────────────────────────
// Fire-and-forget: never awaits the runtime so automation is not slowed down.
export function dispatchPluginEvent(event, payload) {
    try {
        sendToOffscreen({ action: 'fptPluginDispatch', event, payload: payload || {} })
            .catch(() => {});
    } catch (_) { /* offscreen not up yet */ }
}

export async function anyPluginsEnabled() {
    const map = await getPluginsMap();
    return Object.values(map).some(p => p && p.enabled);
}

// ─── UI message router ──────────────────────────────────────────────────────
// Returns true if `request` was a plugin action handled here.
export function handlePluginMessage(request, sendResponse) {
    if (!request || typeof request.action !== 'string' || !request.action.startsWith('fptPlugin')) {
        return false;
    }
    // Internal messages addressed to the offscreen doc are handled elsewhere.
    if (request.target === 'offscreen') return false;

    switch (request.action) {
        case 'fptPluginList':
            getPluginsMap().then(map => {
                const list = Object.values(map).map(p => ({
                    uuid: p.uuid, name: p.name, version: p.version, description: p.description,
                    credits: p.credits, settingsPage: p.settingsPage, enabled: p.enabled,
                    installedAt: p.installedAt, source: p.source, size: (p.code || '').length,
                }));
                sendResponse({ ok: true, plugins: list });
            });
            return true;

        case 'fptPluginStatus':
            queryRuntimeStatus()
                .then(st => sendResponse(st))
                .catch(e => sendResponse({ ok: true, ready: false, running: false, error: String(e && e.message || e) }));
            return true;

        case 'fptPluginStart':
            ensurePluginRuntime()
                .then(r => sendResponse({ ok: !!(r && r.ok), ready: !!(r && r.ok), error: r && r.error }))
                .catch(e => sendResponse({ ok: false, ready: false, error: String(e && e.message || e) }));
            return true;

        case 'fptPluginParse':
            (async () => {
                const res = await sendToOffscreenRetry({ action: 'fptPluginParse', name: request.name, code: request.code });
                sendResponse(res || { ok: false, error: 'no response' });
            })().catch(e => sendResponse({ ok: false, error: String(e && e.message || e) }));
            return true;

        case 'fptPluginAdd':
            (async () => {
                const parsed = await sendToOffscreenRetry({ action: 'fptPluginParse', name: request.name, code: request.code });
                if (!parsed || !parsed.ok) {
                    sendResponse({ ok: false, error: (parsed && parsed.error) || 'Не удалось разобрать плагин.' });
                    return;
                }
                const meta = parsed.meta || {};
                const uuid = meta.uuid || crypto.randomUUID();
                const map = await getPluginsMap();
                const overwrite = !!map[uuid];
                map[uuid] = {
                    uuid,
                    name: meta.name || request.name || 'Без имени',
                    version: meta.version || '',
                    description: meta.description || '',
                    credits: meta.credits || '',
                    settingsPage: !!meta.settingsPage,
                    enabled: true,
                    code: request.code,
                    installedAt: Date.now(),
                    source: request.source || 'file',
                };
                await setPluginsMap(map);

                const loadRes = await sendToOffscreenRetry({
                    action: 'fptPluginLoad', uuid, name: map[uuid].name, code: request.code
                }).catch(e => ({ ok: false, error: String(e && e.message || e) }));
                sendResponse({ ok: true, uuid, overwrite, loaded: !!(loadRes && loadRes.ok), error: loadRes && loadRes.error });
            })().catch(e => sendResponse({ ok: false, error: String(e && e.message || e) }));
            return true;

        case 'fptPluginToggle':
            (async () => {
                const map = await getPluginsMap();
                const p = map[request.uuid];
                if (!p) { sendResponse({ ok: false, error: 'Плагин не найден.' }); return; }
                p.enabled = !!request.enabled;
                await setPluginsMap(map);
                if (p.enabled) {
                    const res = await sendToOffscreenRetry({ action: 'fptPluginLoad', uuid: p.uuid, name: p.name, code: p.code })
                        .catch(e => ({ ok: false, error: String(e && e.message || e) }));
                    sendResponse({ ok: true, enabled: true, loaded: !!(res && res.ok), error: res && res.error });
                } else {
                    const res = await sendToOffscreenRetry({ action: 'fptPluginUnload', uuid: p.uuid }).catch(() => null);
                    sendResponse({ ok: true, enabled: false, unloaded: !!(res && res.ok) });
                }
            })().catch(e => sendResponse({ ok: false, error: String(e && e.message || e) }));
            return true;

        case 'fptPluginDelete':
            (async () => {
                const map = await getPluginsMap();
                const p = map[request.uuid];
                if (p) {
                    await sendToOffscreenRetry({ action: 'fptPluginUnload', uuid: p.uuid }).catch(() => {});
                    delete map[request.uuid];
                    await setPluginsMap(map);
                }
                const { [PLUGIN_LOGS_KEY]: logs = {} } = await chrome.storage.local.get(PLUGIN_LOGS_KEY);
                delete logs[request.uuid];
                await chrome.storage.local.set({ [PLUGIN_LOGS_KEY]: logs });
                sendResponse({ ok: true });
            })().catch(e => sendResponse({ ok: false, error: String(e && e.message || e) }));
            return true;

        case 'fptPluginGetCode':
            getPluginsMap().then(map => {
                const p = map[request.uuid];
                sendResponse(p ? { ok: true, code: p.code, name: p.name } : { ok: false, error: 'not found' });
            });
            return true;

        case 'fptPluginLogs':
            (async () => {
                const { [PLUGIN_LOGS_KEY]: logs = {} } = await chrome.storage.local.get(PLUGIN_LOGS_KEY);
                sendResponse({ ok: true, logs: logs[request.uuid] || logs['_global'] || [] });
            })();
            return true;

        case 'fptPluginClearLogs':
            (async () => {
                const { [PLUGIN_LOGS_KEY]: logs = {} } = await chrome.storage.local.get(PLUGIN_LOGS_KEY);
                delete logs[request.uuid];
                await chrome.storage.local.set({ [PLUGIN_LOGS_KEY]: logs });
                sendResponse({ ok: true });
            })();
            return true;

        case 'fptPluginRunCommand':
            sendToOffscreenRetry({
                action: 'fptPluginRunCommand',
                uuid: request.uuid, command: request.command, args: request.args || [],
            }).then(res => sendResponse(res || { ok: false, error: 'no response' }))
              .catch(e => sendResponse({ ok: false, error: String(e && e.message || e) }));
            return true;

        default:
            return false;
    }
}

// ─── log / notify ingestion from the runtime ─────────────────────────────────
export function handleRuntimeNotification(request) {
    if (!request) return;
    if (request.action === 'fptPluginLogStore') {
        appendLog(request.uuid, request.level, request.msg);
    } else if (request.action === 'fptPluginNotify') {
        try {
            chrome.notifications.create({
                type: 'basic',
                iconUrl: chrome.runtime.getURL('icons/icon128.png'),
                title: request.title || 'FunPay Cardinal plugin',
                message: request.body || '',
            });
        } catch (_) {}
    } else if (request.action === 'fptPluginTelegram') {
        try { chrome.storage.local.get('fpToolsTelegram').then(cfg => {
            // best-effort: reuse the extension's Telegram config if present
            const token = cfg && cfg.fpToolsTelegram && cfg.fpToolsTelegram.token;
            const chatId = cfg && cfg.fpToolsTelegram && cfg.fpToolsTelegram.chatId;
            if (!token || !chatId) return;
            fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ chat_id: chatId, text: request.text }),
            }).catch(() => {});
        }); } catch (_) {}
    }
}
