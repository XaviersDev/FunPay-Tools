
const FPT_GC_WORKER = 'https://fpt-chat.starobinskiy01.workers.dev';
const FPT_BOT_USERNAME = 'FPToolsBot';
const FPT_GC_POLL_MS = 6000;   // как часто тянем новые сообщения
const FPT_GC_LINK_POLL_MS = 2500; // как часто проверяем подтверждение входа

let _fptGcInited = false;
let _fptGcSelfName = null;
let _fptGcSelfAvatar = '';
let _fptGcSelfUrl = '';
let _fptGcToken = null;
let _fptGcLastTs = 0;
let _fptGcFeedTimer = null;
let _fptGcLinkTimer = null;
let _fptGcRenderedIds = new Set();
let _fptGcFirstRenderAfterOpen = false; // FIX 2.8.2 (№11): скролл вниз при открытии

function _fptGcEl(id) { return document.getElementById(id); }

function _fptGcStatus(msg, isError) {
    const s = _fptGcEl('fpt-gc-status');
    if (!s) return;
    s.textContent = msg || '';
    s.classList.toggle('fpt-gc-status-err', !!isError);
}

function _fptGcEscape(str) {
    const d = document.createElement('div');
    d.textContent = str == null ? '' : String(str);
    return d.innerHTML;
}

// =============================================================================
// УДАЛЁННЫЙ КОНФИГ (public-chat.json на GitHub): active / display.
// Позволяет включать/выключать чат и прятать вкладку БЕЗ обновления расширения.
// =============================================================================
const FPT_GC_CFG_JSDELIVR = 'https://cdn.jsdelivr.net/gh/XaviersDev/FunPay-Tools@main/public-chat.json';
const FPT_GC_CFG_RAW      = 'https://raw.githubusercontent.com/XaviersDev/FunPay-Tools/main/public-chat.json';
const FPT_GC_CFG_TTL_MS   = 16 * 60 * 1000;

let _fptGcConfig = {
    active: true,
    display: true,
    disabledMessage: 'Общий чат временно недоступен. Ожидайте.'
};

function _fptGcApplyConfig(cfg) {
    if (!cfg || typeof cfg !== 'object') return;
    if (typeof cfg.active === 'boolean')  _fptGcConfig.active  = cfg.active;
    if (typeof cfg.display === 'boolean') _fptGcConfig.display = cfg.display;
    if (typeof cfg.disabledMessage === 'string' && cfg.disabledMessage.trim()) {
        _fptGcConfig.disabledMessage = cfg.disabledMessage;
    }
}

async function fptGcRefreshConfig(force) {
    try {
        if (!force) {
            const { fpToolsGCConfig, fpToolsGCConfigTs } = await chrome.storage.local.get(['fpToolsGCConfig', 'fpToolsGCConfigTs']);
            if (fpToolsGCConfig && fpToolsGCConfigTs && (Date.now() - fpToolsGCConfigTs) < FPT_GC_CFG_TTL_MS) {
                _fptGcApplyConfig(fpToolsGCConfig);
                return _fptGcConfig;
            }
        }
        const bust = '?t=' + Date.now();
        let cfg = null;
        for (const base of [FPT_GC_CFG_JSDELIVR, FPT_GC_CFG_RAW]) {
            try {
                const r = await fetch(base + bust, { cache: 'no-store' });
                if (!r.ok) continue;
                cfg = await r.json();
                if (cfg && typeof cfg === 'object') break;
            } catch (e) { /* next source */ }
        }
        if (cfg && typeof cfg === 'object') {
            _fptGcApplyConfig(cfg);
            await chrome.storage.local.set({ fpToolsGCConfig: cfg, fpToolsGCConfigTs: Date.now() });
        }
    } catch (e) { /* offline - keep defaults */ }
    return _fptGcConfig;
}

function fptGcApplyVisibility() {
    const navLi = document.querySelector('li[data-page="global_chat"]');
    if (navLi) navLi.style.display = _fptGcConfig.display ? '' : 'none';
}

// =============================================================================
// Кто я на FunPay (ник, аватар, ссылка на профиль) - со страницы. Косметика.
// =============================================================================
function _fptGcDetectSelf() {
    try {
        // Ник: внутри .user-link-name может быть обёртка декорированного ника
        // (.fpt-epic-text) + canvas с частицами. Берём именно текстовый узел,
        // а не весь контейнер, иначе ник окажется пустым/кривым.
        let nameEl = document.querySelector('.user-link-name .fpt-epic-text');
        if (!nameEl) nameEl = document.querySelector('.user-link-name');
        if (nameEl && nameEl.textContent.trim()) _fptGcSelfName = nameEl.textContent.trim();

        // Ссылка на свой профиль: пункт меню "Профиль".
        const profA = document.querySelector('a.user-link-dropdown[href*="/users/"], .user-link-dropdown[href*="/users/"]');
        if (profA && profA.getAttribute('href')) {
            _fptGcSelfUrl = new URL(profA.getAttribute('href'), location.origin).href;
        }

        // Аватар: .user-link-photo img в шапке.
        const av = document.querySelector('.user-link-photo img[src], .navbar-header .user-link-photo img[src]');
        if (av) {
            const src = av.getAttribute('src');
            if (src && src.trim()) _fptGcSelfAvatar = new URL(src, location.origin).href;
        }

        const appData = document.body && document.body.dataset && document.body.dataset.appData;
        if (appData && !_fptGcSelfName) {
            const d = JSON.parse(appData);
            if (d && d.userName) _fptGcSelfName = d.userName;
        }
    } catch (e) { /* ignore */ }
}

// =============================================================================
// Worker API
// =============================================================================
async function _fptGcApi(payload) {
    const r = await fetch(FPT_GC_WORKER, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
    });
    let data = {};
    try { data = await r.json(); } catch (e) {}
    return { ok: r.ok, status: r.status, data };
}

// =============================================================================
// Рендер ленты
// =============================================================================
function _fptGcRender(messages) {
    const feed = _fptGcEl('fpt-gc-feed');
    if (!feed) return;
    const loading = feed.querySelector('.fpt-gc-loading');
    if (loading) loading.remove();

    let appended = false;
    (messages || []).forEach(m => {
        if (!m || !m.id || _fptGcRenderedIds.has(m.id)) return;
        _fptGcRenderedIds.add(m.id);
        appended = true;
        if (m.ts && m.ts > _fptGcLastTs) _fptGcLastTs = m.ts;

        const mine = _fptGcSelfName && m.nick === _fptGcSelfName;
        const avatar = m.avatar
            ? `<img class="fpt-gc-avatar" src="${_fptGcEscape(m.avatar)}" alt="">`
            : '<span class="fpt-gc-avatar fpt-gc-avatar-empty"></span>';
        const nameHtml = m.url
            ? `<a href="${_fptGcEscape(m.url)}" target="_blank" rel="noopener" class="fpt-gc-author">${_fptGcEscape(m.nick)}</a>`
            : `<span class="fpt-gc-author">${_fptGcEscape(m.nick)}</span>`;
        const time = m.ts ? new Date(m.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';

        const row = document.createElement('div');
        row.className = 'fpt-gc-msg' + (mine ? ' fpt-gc-msg-mine' : '');
        row.innerHTML =
            avatar +
            '<div class="fpt-gc-body">' +
                `<div class="fpt-gc-head">${nameHtml}<span class="fpt-gc-date">${time}</span></div>` +
                `<div class="fpt-gc-text">${_fptGcEscape(m.text)}</div>` +
            '</div>';
        feed.appendChild(row);
    });

    if (appended) {
        // FIX 2.8.2 (№11): при ПЕРВОМ рендере после открытия панели всегда
        // прокручиваем к самым свежим сообщениям, чтобы не приходилось скроллить
        // вниз вручную. Дальше - только если пользователь и так внизу.
        if (_fptGcFirstRenderAfterOpen) {
            _fptGcFirstRenderAfterOpen = false;
            feed.scrollTop = feed.scrollHeight;
        } else {
            const nearBottom = feed.scrollHeight - feed.scrollTop - feed.clientHeight < 150;
            if (nearBottom) feed.scrollTop = feed.scrollHeight;
        }
    }
}

// =============================================================================
// Тянем ленту
// =============================================================================
async function _fptGcFetch() {
    try {
        const { ok, data } = await _fptGcApi({ action: 'fetch', since: _fptGcLastTs });
        if (ok && data && Array.isArray(data.messages)) _fptGcRender(data.messages);
    } catch (e) { /* network blip - ignore */ }
}

function _fptGcStartFeed() {
    _fptGcStopFeed();
    _fptGcFeedTimer = setInterval(() => {
        const page = document.querySelector('.fp-tools-page-content[data-page="global_chat"]');
        if (page && page.classList.contains('active')) _fptGcFetch();
    }, FPT_GC_POLL_MS);
}
function _fptGcStopFeed() {
    if (_fptGcFeedTimer) { clearInterval(_fptGcFeedTimer); _fptGcFeedTimer = null; }
}

// =============================================================================
// Отправка
// =============================================================================
async function _fptGcSend() {
    const input = _fptGcEl('fpt-gc-input');
    const btn = _fptGcEl('fpt-gc-send');
    if (!input) return;
    const text = (input.value || '').trim();
    if (!text) return;
    if (text.length > 300) {
        _fptGcStatus('Слишком длинное сообщение (максимум 300 символов)', true);
        return;
    }

    if (!_fptGcToken) { _fptGcShowGate(); return; }

    btn && (btn.disabled = true);
    _fptGcStatus('Отправка…');
    try {
        const { ok, status, data } = await _fptGcApi({
            action: 'send',
            token: _fptGcToken,
            nick: _fptGcSelfName || 'FunPay user',
            avatar: _fptGcSelfAvatar || '',
            url: _fptGcSelfUrl || '',
            text,
        });
        if (ok && data && data.ok) {
            input.value = '';
            input.style.height = 'auto';
            _fptGcStatus('');
            await _fptGcFetch();
        } else if (status === 429 && data && data.error === 'cooldown') {
            const sec = Math.ceil((data.wait || 5000) / 1000);
            _fptGcStatus(`Подожди ${sec} сек перед следующим сообщением`, true);
        } else if (status === 401) {
            // токен протух/невалиден - сбрасываем, просим войти заново
            _fptGcToken = null;
            await chrome.storage.local.remove('fpToolsGCToken');
            _fptGcShowGate();
        } else if (status === 403) {
            _fptGcStatus('Доступ ограничен.', true);
        } else {
            _fptGcStatus('Не удалось отправить: ' + ((data && data.error) || 'ошибка'), true);
        }
    } catch (e) {
        _fptGcStatus('Сеть недоступна, попробуй ещё раз', true);
    } finally {
        btn && (btn.disabled = false);
        input.focus();
    }
}

// =============================================================================
// «Калитка»: показываем форму входа, если токена нет
// =============================================================================
function _fptGcShowGate() {
    const composer = document.querySelector('.fp-tools-page-content[data-page="global_chat"] .fpt-gc-composer');
    if (composer) composer.style.display = 'none';

    let gate = _fptGcEl('fpt-gc-gate');
    if (!gate) {
        const page = document.querySelector('.fp-tools-page-content[data-page="global_chat"]');
        if (!page) return;
        gate = document.createElement('div');
        gate.id = 'fpt-gc-gate';
        gate.className = 'fpt-gc-gate';
        page.appendChild(gate);
    }
    gate.style.display = '';
    gate.innerHTML =
        '<div class="fpt-gc-gate-inner">' +
            '<div class="fpt-gc-gate-title">Писать в общий чат можно только авторизованным пользователям</div>' +
            '<div class="fpt-gc-gate-sub">Подтверди вход один раз через нашего Telegram-бота. Чтение чата доступно и без этого.</div>' +
            '<button id="fpt-gc-gate-btn" class="btn">Войти в чат</button>' +
            '<div id="fpt-gc-gate-status" class="fpt-gc-gate-status"></div>' +
        '</div>';
    const gbtn = _fptGcEl('fpt-gc-gate-btn');
    if (gbtn) gbtn.addEventListener('click', _fptGcStartLink);
}

function _fptGcHideGate() {
    const gate = _fptGcEl('fpt-gc-gate');
    if (gate) gate.style.display = 'none';
    const composer = document.querySelector('.fp-tools-page-content[data-page="global_chat"] .fpt-gc-composer');
    if (composer) composer.style.display = '';
}

function _fptGcGateStatus(t) {
    const s = _fptGcEl('fpt-gc-gate-status');
    if (s) s.textContent = t || '';
}

// Запрос кода у Worker → показ кнопки-диплинка → опрос подтверждения
async function _fptGcStartLink() {
    const gbtn = _fptGcEl('fpt-gc-gate-btn');
    gbtn && (gbtn.disabled = true);
    _fptGcGateStatus('Готовлю вход…');
    try {
        const { ok, data } = await _fptGcApi({ action: 'start' });
        if (!ok || !data || !data.code) { _fptGcGateStatus('Не удалось начать. Попробуй ещё раз.'); gbtn && (gbtn.disabled = false); return; }
        const code = data.code;
        const deeplink = `https://t.me/${FPT_BOT_USERNAME}?start=fptchat_${code}`;

        const gate = _fptGcEl('fpt-gc-gate');
        if (gate) {
            gate.querySelector('.fpt-gc-gate-inner').innerHTML =
                '<div class="fpt-gc-gate-title">Подтверди вход в Telegram</div>' +
                '<div class="fpt-gc-gate-sub">Нажми кнопку и откроется наш бот и автоматические верифицирует вас. Вы можете скопировать код ниже и написать в @FPToolsBot, если не можете открыть ссылку.</div>' +
                `<a href="${deeplink}" target="_blank" class="btn" id="fpt-gc-open-bot">Открыть бота и подтвердить</a>` +
                `<div class="fpt-gc-code">Если у вас нет Telegram на компьютере, введите код с телефона в бота @FPToolsBot: <b>${_fptGcEscape(code)}</b></div>` +
                '<div id="fpt-gc-gate-status" class="fpt-gc-gate-status">Ожидаю подтверждения…</div>';
        }
        _fptGcPollLink(code);
    } catch (e) {
        _fptGcGateStatus('Сеть недоступна.');
        gbtn && (gbtn.disabled = false);
    }
}

function _fptGcStopLink() {
    if (_fptGcLinkTimer) { clearInterval(_fptGcLinkTimer); _fptGcLinkTimer = null; }
}

function _fptGcPollLink(code) {
    _fptGcStopLink();
    let tries = 0;
    _fptGcLinkTimer = setInterval(async () => {
        tries++;
        if (tries > 160) { _fptGcStopLink(); _fptGcGateStatus('Время вышло. Нажми «Войти в чат» заново.'); return; }
        try {
            const { data } = await _fptGcApi({ action: 'poll', code });
            if (data && data.token) {
                _fptGcStopLink();
                _fptGcToken = data.token;
                await chrome.storage.local.set({ fpToolsGCToken: data.token });
                _fptGcHideGate();
                _fptGcStatus('');
                const input = _fptGcEl('fpt-gc-input');
                if (input) input.focus();
            }
        } catch (e) { /* keep polling */ }
    }, FPT_GC_LINK_POLL_MS);
}

// =============================================================================
// Инициализация вкладки
// =============================================================================
async function initializeGlobalChat() {
    await fptGcRefreshConfig(false);
    fptGcApplyVisibility();

    const feed = _fptGcEl('fpt-gc-feed');
    const composer = document.querySelector('.fp-tools-page-content[data-page="global_chat"] .fpt-gc-composer');

    // Чат выключен удалённо.
    if (!_fptGcConfig.active) {
        _fptGcStopFeed();
        _fptGcStopLink();
        if (composer) composer.style.display = 'none';
        const gate = _fptGcEl('fpt-gc-gate'); if (gate) gate.style.display = 'none';
        if (feed) {
            feed.innerHTML =
                '<div class="fpt-gc-disabled" style="display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;text-align:center;padding:40px 20px;color:var(--fpt-text-muted,#9aa0b5);">' +
                '<span class="material-symbols-rounded" style="font-size:48px;color:var(--fpt-accent,#E9A8FF);">hourglass_top</span>' +
                '<div style="font-size:14px;line-height:1.6;max-width:380px;">' + _fptGcEscape(_fptGcConfig.disabledMessage) + '</div>' +
                '</div>';
        }
        return;
    }

    _fptGcDetectSelf();

    // Восстанавливаем токен из хранилища.
    if (!_fptGcToken) {
        try {
            const { fpToolsGCToken } = await chrome.storage.local.get('fpToolsGCToken');
            if (fpToolsGCToken) _fptGcToken = fpToolsGCToken;
        } catch (e) {}
    }

    // Однократная привязка обработчиков ввода.
    if (!_fptGcInited) {
        _fptGcInited = true;
        const btn = _fptGcEl('fpt-gc-send');
        const input = _fptGcEl('fpt-gc-input');
        if (btn) btn.addEventListener('click', _fptGcSend);
        if (input) {
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); _fptGcSend(); }
            });
            input.addEventListener('input', () => {
                input.style.height = 'auto';
                input.style.height = Math.min(input.scrollHeight, 120) + 'px';
            });
        }
    }

    // Чтение ленты доступно всем; писать - только при наличии токена.
    if (_fptGcToken) _fptGcHideGate(); else _fptGcShowGate();

    _fptGcRenderedIds = new Set();
    _fptGcLastTs = 0;
    _fptGcFirstRenderAfterOpen = true;
    const feedEl = _fptGcEl('fpt-gc-feed');
    if (feedEl) feedEl.innerHTML = '<div class="fpt-gc-loading">Загрузка сообщений…</div>';
    _fptGcFetch();
    _fptGcStartFeed();
}

if (typeof window !== 'undefined') {
    window.initializeGlobalChat = initializeGlobalChat;
    window.fptGcRefreshConfig = fptGcRefreshConfig;
    window.fptGcApplyVisibility = fptGcApplyVisibility;
}
