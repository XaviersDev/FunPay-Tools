// offscreen/py_plugins.js
// ---------------------------------------------------------------------------
// Python (Pyodide) plugin runtime for FunPay Cardinal plugins.
//
// Runs inside the extension's OFFSCREEN document so that:
//   * the user's FunPay cookies are available (synchronous XHR with credentials),
//   * the runtime survives service-worker idle kills,
//   * WASM can be compiled ('wasm-unsafe-eval' in the extension CSP).
//
// Pyodide is loaded from a locally vendored copy (vendor/pyodide/) when present;
// otherwise it falls back to the jsdelivr CDN (works only if the extension CSP
// permits it - see scripts/vendor-pyodide.sh to install it locally).
//
// Exposed to Python (window globals consumed by plugins_runtime/cardinal_compat.py):
//   fptSyncFetch(url, optsJson) -> {status, text, ok}
//   fptSyncStorageGet(key) -> JSON string
//   fptSyncStorageSet(key, valueJson)
//   fptPluginLog(uuid, level, msg)
//   fptNotify(title, body)
//   fptTelegramSend(text)
// ---------------------------------------------------------------------------

const FPT_PYODIDE_CDN = 'https://cdn.jsdelivr.net/pyodide/v0.26.4/full/';
const FPT_SHIM_PATH = 'plugins_runtime/cardinal_compat.py';

const fptPyState = {
    pyodide: null,
    ready: false,
    loading: null,
    error: null,
    version: null,
    loadedPlugins: new Set(),
};

// ─── storage cache (synchronous access for Python) ──────────────────────────
const fptStorageCache = Object.create(null);
async function fptWarmStorageCache() {
    try {
        const all = await chrome.storage.local.get(null);
        Object.assign(fptStorageCache, all);
    } catch (_) { /* ignore */ }
    try {
        chrome.storage.onChanged.addListener((changes, area) => {
            if (area !== 'local') return;
            for (const [k, v] of Object.entries(changes)) {
                if (v.newValue === undefined) delete fptStorageCache[k];
                else fptStorageCache[k] = v.newValue;
            }
        });
    } catch (_) { /* ignore */ }
}
fptWarmStorageCache();

// ─── JS bridge for Python ───────────────────────────────────────────────────
window.fptSyncFetch = function (url, optsJson) {
    try {
        const opts = JSON.parse(optsJson || '{}');
        const xhr = new XMLHttpRequest();
        xhr.open(opts.method || 'GET', url, false); // synchronous on purpose
        xhr.withCredentials = true;
        try { xhr.timeout = 0; } catch (_) {}
        const headers = opts.headers || {};
        for (const k of Object.keys(headers)) {
            try { xhr.setRequestHeader(k, headers[k]); } catch (_) {}
        }
        xhr.send(opts.body != null ? opts.body : null);
        return JSON.stringify({
            status: xhr.status, ok: xhr.status >= 200 && xhr.status < 300,
            text: xhr.responseText || ''
        });
    } catch (e) {
        return JSON.stringify({ status: 0, ok: false, text: '', error: String(e && e.message || e) });
    }
};

window.fptSyncStorageGet = function (key) {
    try {
        const v = fptStorageCache[key];
        return v === undefined ? 'null' : JSON.stringify(v);
    } catch (_) { return 'null'; }
};

window.fptSyncStorageSet = function (key, valueJson) {
    try {
        const v = JSON.parse(valueJson);
        fptStorageCache[key] = v;
        chrome.storage.local.set({ [key]: v }).catch(() => {});
    } catch (_) {}
};

window.fptPluginLog = function (uuid, level, msg) {
    try {
        console[level === 'ERROR' ? 'error' : 'log'](`[FPC plugin ${uuid || '?'}] ${msg}`);
        chrome.runtime.sendMessage({ action: 'fptPluginLogStore', uuid, level, msg }).catch(() => {});
    } catch (_) {}
};

window.fptNotify = function (title, body) {
    try { chrome.runtime.sendMessage({ action: 'fptPluginNotify', title, body }).catch(() => {}); } catch (_) {}
};

window.fptTelegramSend = function (text) {
    try { chrome.runtime.sendMessage({ action: 'fptPluginTelegram', text }).catch(() => {}); } catch (_) {}
};

// ─── Pyodide boot ───────────────────────────────────────────────────────────
function fptInjectScript(src) {
    return new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = src;
        s.onload = () => resolve();
        s.onerror = () => reject(new Error('Не удалось загрузить ' + src));
        (document.head || document.documentElement).appendChild(s);
    });
}

async function fptResourceExists(url) {
    try {
        const r = await fetch(url, { method: 'HEAD', cache: 'no-store' });
        return r.ok;
    } catch (_) { return false; }
}

async function fptBootPyodide() {
    if (fptPyState.ready) return true;
    if (fptPyState.loading) return fptPyState.loading;

    fptPyState.loading = (async () => {
        const localBase = chrome.runtime.getURL('vendor/pyodide/');
        let base = localBase;
        if (!(await fptResourceExists(localBase + 'pyodide.js'))) {
            base = FPT_PYODIDE_CDN;
            console.warn('[FPC] Локальный Pyodide не найден (vendor/pyodide/), пробую CDN. ' +
                'Запустите scripts/vendor-pyodide.sh для оффлайн-работы.');
        }
        await fptInjectScript(base + 'pyodide.js');
        // eslint-disable-next-line no-undef
        const pyodide = await loadPyodide({ indexURL: base });

        const shimUrl = chrome.runtime.getURL(FPT_SHIM_PATH);
        const shimSource = await (await fetch(shimUrl)).text();
        await pyodide.runPythonAsync(shimSource);

        fptPyState.pyodide = pyodide;
        fptPyState.version = pyodide.version || null;
        fptPyState.ready = true;
        fptPyState.error = null;
        console.log('[FPC] Python runtime готов, Pyodide', fptPyState.version);
        return true;
    })().catch((e) => {
        fptPyState.error = String(e && e.message || e);
        fptPyState.loading = null;
        console.error('[FPC] Ошибка запуска Python runtime:', fptPyState.error);
        throw e;
    });

    return fptPyState.loading;
}

function fptRequireReady() {
    if (!fptPyState.ready || !fptPyState.pyodide) {
        throw new Error('Python runtime не запущен: ' + (fptPyState.error || 'boot не вызван'));
    }
    return fptPyState.pyodide;
}

// ─── plugin operations ──────────────────────────────────────────────────────
function fptPyLoadPlugin(uuid, name, code) {
    const py = fptRequireReady();
    py.globals.set('__fpt_src', code);
    py.globals.set('__fpt_uuid', uuid);
    py.globals.set('__fpt_name', name);
    const raw = py.runPython('_fpt_load_plugin(__fpt_uuid, __fpt_name, __fpt_src)');
    try { py.globals.delete('__fpt_src'); } catch (_) {}
    const res = JSON.parse(raw);
    if (res.ok) fptPyState.loadedPlugins.add(uuid);
    return res;
}

function fptPyUnloadPlugin(uuid) {
    const py = fptRequireReady();
    const raw = py.runPython(`_fpt_unload_plugin(${JSON.stringify(uuid)})`);
    fptPyState.loadedPlugins.delete(uuid);
    return JSON.parse(raw);
}

function fptPyParsePlugin(name, code) {
    const py = fptRequireReady();
    py.globals.set('__fpt_src', code);
    py.globals.set('__fpt_name', name);
    const raw = py.runPython('_fpt_parse_plugin(__fpt_name, __fpt_src)');
    try { py.globals.delete('__fpt_src'); } catch (_) {}
    return JSON.parse(raw);
}

async function fptPyDispatch(event, payload) {
    const py = fptRequireReady();
    py.globals.set('__fpt_payload', JSON.stringify(payload || {}));
    const raw = await py.runPythonAsync(
        `await _fpt_dispatch(${JSON.stringify(event)}, __fpt_payload)`);
    try { py.globals.delete('__fpt_payload'); } catch (_) {}
    return JSON.parse(raw);
}

// ─── messaging with background ──────────────────────────────────────────────
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!message || message.target !== 'offscreen' || !message.action) return;
    if (!message.action.startsWith('fptPlugin')) return;

    (async () => {
        switch (message.action) {
            case 'fptPluginBoot': {
                try {
                    await fptBootPyodide();
                    const loaded = [];
                    for (const pl of (message.plugins || [])) {
                        try {
                            const r = fptPyLoadPlugin(pl.uuid, pl.name, pl.code);
                            if (r.ok) loaded.push({ uuid: pl.uuid, meta: r.meta });
                            else console.warn('[FPC] плагин не загружен', pl.name, r.error);
                        } catch (e) {
                            console.warn('[FPC] плагин не загружен', pl.name, e.message);
                        }
                    }
                    sendResponse({ ok: true, version: fptPyState.version, loaded });
                } catch (e) {
                    sendResponse({ ok: false, error: String(e && e.message || e) });
                }
                break;
            }
            case 'fptPluginLoad':
                try { sendResponse({ ok: true, ...fptPyLoadPlugin(message.uuid, message.name, message.code) }); }
                catch (e) { sendResponse({ ok: false, error: String(e && e.message || e) }); }
                break;
            case 'fptPluginUnload':
                try { sendResponse({ ok: true, ...fptPyUnloadPlugin(message.uuid) }); }
                catch (e) { sendResponse({ ok: false, error: String(e && e.message || e) }); }
                break;
            case 'fptPluginParse':
                try { await fptBootPyodide(); sendResponse({ ok: true, meta: fptPyParsePlugin(message.name, message.code) }); }
                catch (e) { sendResponse({ ok: false, error: String(e && e.message || e) }); }
                break;
            case 'fptPluginDispatch':
                try { sendResponse({ ok: true, ...(await fptPyDispatch(message.event, message.payload)) }); }
                catch (e) { sendResponse({ ok: false, error: String(e && e.message || e) }); }
                break;
            case 'fptPluginStatus':
                sendResponse({
                    ok: true, ready: fptPyState.ready, version: fptPyState.version,
                    error: fptPyState.error, loaded: Array.from(fptPyState.loadedPlugins),
                });
                break;
            case 'fptPluginRunCommand':
                try {
                    const py = fptRequireReady();
                    py.globals.set('__fpt_args', JSON.stringify(message.args || []));
                    const raw = py.runPython(
                        `_fpt_run_command(${JSON.stringify(message.uuid)}, ${JSON.stringify(message.command)}, __fpt_args)`);
                    try { py.globals.delete('__fpt_args'); } catch (_) {}
                    sendResponse(JSON.parse(raw));
                } catch (e) {
                    sendResponse({ ok: false, error: String(e && e.message || e) });
                }
                break;
            default:
                sendResponse({ ok: false, error: 'unknown action' });
        }
    })();

    return true; // async response
});

// warm up the runtime in the background once the offscreen doc exists
setTimeout(() => { fptBootPyodide().catch(() => {}); }, 1500);
