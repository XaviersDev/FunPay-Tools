// content/features/global_chat.js
// =============================================================================
// FPT GLOBAL CHAT - «Общий чат»
//
// Общий чат для активных пользователей FP Tools. Технически это публичный узел
// чата FunPay (node=game-307), поэтому весь обмен сообщениями идёт штатными
// средствами самого FunPay: история тянется со страницы funpay.com/chat/?node=…,
// отправка - через уже существующий фоновый обработчик 'fptSendChatText'
// (тот же runner/chat_message, что и в остальном расширении).
//
// ВАЖНО: чат живёт на funpay.com и модерируется модераторами FunPay.
// FP Tools НЕ модерирует этот чат - это лишь удобная витрина уже существующего
// узла. Никакого собственного сервера сообщений у расширения нет.
// =============================================================================

// node/url по умолчанию (фолбэк, пока не подтянулся удалённый конфиг)
let FPT_GC_NODE = 'game-307';
let FPT_GC_URL = 'https://funpay.com/chat/?node=' + FPT_GC_NODE;
const FPT_GC_POLL_MS = 7000;

// =============================================================================
// УДАЛЁННЫЙ КОНФИГ (public-chat.json на GitHub).
// Позволяет включать/выключать чат и прятать вкладку БЕЗ обновления расширения.
// Основной источник - jsDelivr (CDN, быстро/стабильно), фолбэк - raw.githubusercontent.
// Опрашивается раз в 16 минут.
// =============================================================================
const FPT_GC_CFG_JSDELIVR = 'https://cdn.jsdelivr.net/gh/XaviersDev/FunPay-Tools@main/public-chat.json';
const FPT_GC_CFG_RAW      = 'https://raw.githubusercontent.com/XaviersDev/FunPay-Tools/main/public-chat.json';
const FPT_GC_CFG_TTL_MS   = 16 * 60 * 1000; // 16 минут

// Состояние по умолчанию: если конфиг недоступен - чат работает как раньше.
let _fptGcConfig = {
    active: true,
    display: true,
    url: FPT_GC_URL,
    node: FPT_GC_NODE,
    disabledMessage: 'Наш общий чат временно недоступен. Мы ждём официального одобрения FunPay чтобы включить этот чат. Ожидайте.'
};

function _fptGcApplyConfig(cfg) {
    if (!cfg || typeof cfg !== 'object') return;
    if (typeof cfg.active === 'boolean')  _fptGcConfig.active  = cfg.active;
    if (typeof cfg.display === 'boolean') _fptGcConfig.display = cfg.display;
    if (typeof cfg.disabledMessage === 'string' && cfg.disabledMessage.trim()) {
        _fptGcConfig.disabledMessage = cfg.disabledMessage;
    }
    if (typeof cfg.node === 'string' && cfg.node.trim()) {
        FPT_GC_NODE = cfg.node.trim();
        _fptGcConfig.node = FPT_GC_NODE;
    }
    if (typeof cfg.url === 'string' && cfg.url.trim()) {
        FPT_GC_URL = cfg.url.trim();
    } else {
        FPT_GC_URL = 'https://funpay.com/chat/?node=' + FPT_GC_NODE;
    }
    _fptGcConfig.url = FPT_GC_URL;
}

// Тянем конфиг с GitHub. Сначала jsDelivr, при неудаче - raw github.
// Результат кэшируем в chrome.storage.local на 16 минут.
async function fptGcRefreshConfig(force) {
    try {
        if (!force) {
            const { fpToolsGCConfig, fpToolsGCConfigTs } = await chrome.storage.local.get(['fpToolsGCConfig', 'fpToolsGCConfigTs']);
            if (fpToolsGCConfig && fpToolsGCConfigTs && (Date.now() - fpToolsGCConfigTs) < FPT_GC_CFG_TTL_MS) {
                _fptGcApplyConfig(fpToolsGCConfig);
                return _fptGcConfig;
            }
        }
        const bust = '?t=' + Date.now(); // обход CDN/прокси-кэша
        let cfg = null;
        for (const base of [FPT_GC_CFG_JSDELIVR, FPT_GC_CFG_RAW]) {
            try {
                const r = await fetch(base + bust, { cache: 'no-store' });
                if (!r.ok) continue;
                cfg = await r.json();
                if (cfg && typeof cfg === 'object') break;
            } catch (e) { /* пробуем следующий источник */ }
        }
        if (cfg && typeof cfg === 'object') {
            _fptGcApplyConfig(cfg);
            await chrome.storage.local.set({ fpToolsGCConfig: cfg, fpToolsGCConfigTs: Date.now() });
        }
    } catch (e) { /* офлайн / git недоступен - остаёмся на дефолтах/кэше */ }
    return _fptGcConfig;
}

// Применить display: спрятать/показать пункт меню «Общий чат».
function fptGcApplyVisibility() {
    const navLi = document.querySelector('li[data-page="global_chat"]');
    if (navLi) navLi.style.display = _fptGcConfig.display ? '' : 'none';
}

let _fptGcTimer = null;
let _fptGcLastIds = new Set();
let _fptGcInited = false;
let _fptGcSelfName = null;

function _fptGcEl(id) { return document.getElementById(id); }

function _fptGcStatus(msg, isError) {
    const s = _fptGcEl('fpt-gc-status');
    if (!s) return;
    s.textContent = msg || '';
    s.classList.toggle('fpt-gc-status-err', !!isError);
}

// Узнаём свой ник, чтобы подсвечивать собственные сообщения.
function _fptGcDetectSelf() {
    try {
        const link = document.querySelector('.user-link-name, .menu-item-account .menu-item-name, .user-link-dropdown .user-link-name');
        if (link && link.textContent.trim()) { _fptGcSelfName = link.textContent.trim(); return; }
        const appData = document.body && document.body.dataset && document.body.dataset.appData;
        if (appData) {
            const d = JSON.parse(appData);
            if (d && d.userName) _fptGcSelfName = d.userName;
        }
    } catch (e) { /* ignore */ }
}

function _fptGcEscape(str) {
    const d = document.createElement('div');
    d.textContent = str == null ? '' : String(str);
    return d.innerHTML;
}

// Разбор HTML страницы чата FunPay в массив сообщений.
function _fptGcParse(html) {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const items = doc.querySelectorAll('.chat-message-list .chat-msg-item');
    const out = [];
    let lastAuthor = null;
    let lastAuthorUrl = null;
    items.forEach(item => {
        const id = (item.id || '').replace('message-', '') || null;
        const msgEl = item.querySelector('.chat-message');
        const blocked = msgEl && msgEl.classList.contains('blocked');
        const authorLink = item.querySelector('.media-user-name .chat-msg-author-link');
        let author = authorLink ? authorLink.textContent.trim() : null;
        let authorUrl = authorLink ? authorLink.getAttribute('href') : null;
        // FunPay не дублирует автора у подряд идущих сообщений одного человека.
        if (!author) { author = lastAuthor; authorUrl = lastAuthorUrl; }
        else { lastAuthor = author; lastAuthorUrl = authorUrl; }
        const dateEl = item.querySelector('.chat-msg-date');
        const date = dateEl ? (dateEl.getAttribute('title') || dateEl.textContent.trim()) : '';
        const textEl = item.querySelector('.chat-msg-text');
        const text = textEl ? textEl.textContent : '';
        if (!text && !blocked) return;
        out.push({ id, author: author || '???', authorUrl, date, text: blocked ? 'Сообщение скрыто.' : text, blocked: !!blocked });
    });
    return out;
}

function _fptGcRender(messages, append) {
    const feed = _fptGcEl('fpt-gc-feed');
    if (!feed) return;
    const wasNearBottom = feed.scrollHeight - feed.scrollTop - feed.clientHeight < 80;

    if (!append) { feed.innerHTML = ''; _fptGcLastIds = new Set(); }

    let added = 0;
    messages.forEach(m => {
        if (m.id && _fptGcLastIds.has(m.id)) return;
        if (m.id) _fptGcLastIds.add(m.id);
        added++;
        const mine = _fptGcSelfName && m.author === _fptGcSelfName;
        const row = document.createElement('div');
        row.className = 'fpt-gc-msg' + (mine ? ' fpt-gc-msg-mine' : '') + (m.blocked ? ' fpt-gc-msg-blocked' : '');
        
        // --- ПРОВЕРКА НА РАЗРАБОТЧИКА ---
        let devBadge = '';
        if (m.author === 'sDImosX') {
            devBadge = `<span class="fpt-gc-dev-badge" title="Создатель FP Tools"><span class="material-symbols-rounded">verified</span>Разработчик расширения</span>`;
        }

        const nameHtml = m.authorUrl
            ? `<a href="${_fptGcEscape(m.authorUrl)}" target="_blank" class="fpt-gc-author">${_fptGcEscape(m.author)}</a>${devBadge}`
            : `<span class="fpt-gc-author">${_fptGcEscape(m.author)}</span>${devBadge}`;
            
        row.innerHTML =
            `<div class="fpt-gc-head">${nameHtml}<span class="fpt-gc-date">${_fptGcEscape(m.date)}</span></div>` +
            `<div class="fpt-gc-text">${_fptGcEscape(m.text)}</div>`;
        feed.appendChild(row);
    });

    if (!append) {
        feed.scrollTop = feed.scrollHeight;
    } else if (added && wasNearBottom) {
        feed.scrollTop = feed.scrollHeight;
    }
    return added;
}

async function _fptGcFetch(append) {
    try {
        const res = await fetch(FPT_GC_URL, {
            credentials: 'include',
            headers: { 'x-requested-with': 'XMLHttpRequest' }
        });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const html = await res.text();
        const messages = _fptGcParse(html);
        if (!messages.length && !append) {
            const feed = _fptGcEl('fpt-gc-feed');
            if (feed) feed.innerHTML = '<div class="fpt-gc-loading">Пока нет сообщений. Будьте первым!</div>';
            return;
        }
        _fptGcRender(messages, append);
        _fptGcStatus('');
    } catch (e) {
        if (!append) {
            const feed = _fptGcEl('fpt-gc-feed');
            if (feed) feed.innerHTML = '<div class="fpt-gc-loading">Не удалось загрузить чат. Проверьте, что вы вошли на FunPay.</div>';
        }
        _fptGcStatus('Ошибка обновления: ' + e.message, true);
    }
}

async function _fptGcSend() {
    const input = _fptGcEl('fpt-gc-input');
    if (!input) return;
    const text = input.value.trim();
    if (!text) return;

    // Проверяем, соглашался ли пользователь с правилами
    const { fpToolsGCRulesAccepted } = await chrome.storage.local.get('fpToolsGCRulesAccepted');
    
    if (!fpToolsGCRulesAccepted) {
        _fptGcShowRulesModal(text);
        return;
    }

    await _actualSend(text);
}

// Фактическая отправка сообщения вынесена отдельно
async function _actualSend(text) {
    const input = _fptGcEl('fpt-gc-input');
    const btn = _fptGcEl('fpt-gc-send');
    
    btn && (btn.disabled = true);
    _fptGcStatus('Отправка…');
    try {
        const resp = await chrome.runtime.sendMessage({ action: 'fptSendChatText', chatId: FPT_GC_NODE, text });
        if (!resp || !resp.ok) throw new Error((resp && resp.error) || 'неизвестная ошибка');
        input.value = '';
        input.style.height = 'auto';
        _fptGcStatus('');
        // Подтянуть свежие сообщения сразу после отправки.
        await _fptGcFetch(true);
    } catch (e) {
        _fptGcStatus('Не удалось отправить: ' + e.message, true);
    } finally {
        btn && (btn.disabled = false);
        input.focus();
    }
}

// Модальное окно с правилами при первой отправке
function _fptGcShowRulesModal(pendingText) {
    if (document.getElementById('fpt-gc-rules-overlay')) return;

    const overlay = document.createElement('div');
    overlay.id = 'fpt-gc-rules-overlay';
    overlay.className = 'fp-tools-modal-overlay';
    overlay.style.zIndex = '100100'; // Поверх всего

    overlay.innerHTML = `
        <div class="fp-tools-modal-content" style="max-width: 480px; padding: 25px; text-align: left; animation: popIn 0.4s cubic-bezier(0.26, 0.53, 0.74, 1.48);">
            <div style="display:flex; align-items:center; gap: 10px; margin-bottom: 15px;">
                <span class="material-symbols-rounded" style="color:#e05252; font-size: 32px;">warning</span>
                <h3 style="margin:0; font-size: 20px; color: var(--fpt-text, #fff); border:none; padding:0;">Стой! Прочитай правила ✋</h3>
            </div>
            <p style="font-size: 13px; color: var(--fpt-text-muted, #ccc); margin-bottom: 15px; line-height: 1.5;">
                Перед тем как начать общаться, учти, что это <b>официальный общий игровой чат FunPay</b>,
                и на него действуют строгие правила площадки. За их нарушение твой аккаунт на FunPay может быть <b>заблокирован</b>!
            </p>
            <div style="background: var(--fpt-surface, rgba(0,0,0,0.3)); border: 1px solid var(--fpt-border, #333); padding: 12px; border-radius: 8px; font-size: 12.5px; color: var(--fpt-text, #d8dae8); margin-bottom: 15px; max-height: 220px; overflow-y: auto; font-family: monospace;">
                <div style="color: #ff6b6b; font-weight: bold; margin-bottom: 6px;">ЗАПРЕЩЕНО:</div>
                <ul style="padding-left: 20px; margin: 0; display: flex; flex-direction: column; gap: 6px;">
                    <li>сообщения о продаже/скупке чего-то;</li>
                    <li>ссылки на предложения;</li>
                    <li>реклама торговых площадок;</li>
                    <li>критика других продавцов и их предложений;</li>
                    <li>спам и флуд;</li>
                    <li>оскорбления;</li>
                    <li>политические обсуждения;</li>
                    <li>передавать Telegram, Discord, VK, номер телефона и другие контакты;</li>
                    <li>просить контакты другого пользователя;</li>
                    <li>использовать полученные контакты для связи вне FunPay;</li>
                    <li>любые незаконные сообщения.</li>
                </ul>
            </div>
            <p style="font-size: 12px; color: var(--fpt-text-muted, #888); margin-bottom: 20px;">
                Подробные правила площадки: <a href="https://funpay.com/trade/info" target="_blank" style="color: var(--fpt-accent, #E9A8FF); text-decoration: underline;">funpay.com/trade/info</a>
            </p>
            <button id="fpt-gc-rules-accept-btn" class="btn" disabled style="width: 100%; transition: all 0.3s ease; background: var(--fpt-surface-2, #333); color: var(--fpt-text-muted, #888); cursor: not-allowed; box-shadow: none;">
                Понял (<span id="fpt-gc-timer">24</span>)
            </button>
        </div>
    `;

    document.body.appendChild(overlay);

    const acceptBtn = overlay.querySelector('#fpt-gc-rules-accept-btn');
    const timerSpan = overlay.querySelector('#fpt-gc-timer');
    let timeLeft = 24;

    const timerInterval = setInterval(() => {
        timeLeft--;
        timerSpan.textContent = timeLeft;
        if (timeLeft <= 0) {
            clearInterval(timerInterval);
            acceptBtn.disabled = false;
            acceptBtn.innerHTML = 'Понял, отправить сообщение ✓';
            acceptBtn.style.background = '#4caf82'; // Зеленая кнопка после таймера
            acceptBtn.style.color = '#fff';
            acceptBtn.style.cursor = 'pointer';
            acceptBtn.style.boxShadow = '0 8px 15px rgba(76, 175, 130, 0.3)';
        }
    }, 1000);

    acceptBtn.addEventListener('click', async () => {
        if (timeLeft > 0) return;
        await chrome.storage.local.set({ fpToolsGCRulesAccepted: true });
        overlay.remove();
        // Отправляем сообщение, которое юзер пытался отправить
        await _actualSend(pendingText);
    });
}

function _fptGcStartPolling() {
    _fptGcStopPolling();
    _fptGcTimer = setInterval(() => {
        const page = document.querySelector('.fp-tools-page-content[data-page="global_chat"]');
        // Опрашиваем только пока вкладка реально открыта.
        if (page && page.classList.contains('active')) _fptGcFetch(true);
    }, FPT_GC_POLL_MS);
}

function _fptGcStopPolling() {
    if (_fptGcTimer) { clearInterval(_fptGcTimer); _fptGcTimer = null; }
}

async function initializeGlobalChat() {
    // Подтянуть удалённый конфиг (из кэша, если свежий).
    await fptGcRefreshConfig(false);
    fptGcApplyVisibility();

    const feed = _fptGcEl('fpt-gc-feed');
    const composer = document.querySelector('.fp-tools-page-content[data-page="global_chat"] .fpt-gc-composer');

    // Чат выключен удалённо - показываем заглушку вместо ленты/композера.
    if (!_fptGcConfig.active) {
        _fptGcStopPolling();
        if (composer) composer.style.display = 'none';
        _fptGcStatus('');
        if (feed) {
            feed.innerHTML =
                '<div class="fpt-gc-disabled" style="display:flex; flex-direction:column; align-items:center; justify-content:center; '
                + 'gap:12px; text-align:center; padding:40px 20px; color: var(--fpt-text-muted, #9aa0b5);">'
                + '<span class="material-symbols-rounded" style="font-size:48px; color: var(--fpt-accent, #E9A8FF);">hourglass_top</span>'
                + '<div style="font-size:14px; line-height:1.6; max-width:380px;">' + _fptGcEscape(_fptGcConfig.disabledMessage) + '</div>'
                + '</div>';
        }
        return;
    }

    // Чат включён - обычная работа.
    if (composer) composer.style.display = '';
    _fptGcDetectSelf();
    const input = _fptGcEl('fpt-gc-input');
    const btn = _fptGcEl('fpt-gc-send');

    if (!_fptGcInited) {
        _fptGcInited = true;
        if (btn) btn.addEventListener('click', _fptGcSend);
        if (input) {
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); _fptGcSend(); }
            });
            // авто-рост текстового поля
            input.addEventListener('input', () => {
                input.style.height = 'auto';
                input.style.height = Math.min(input.scrollHeight, 120) + 'px';
            });
        }
    }

    _fptGcFetch(false);
    _fptGcStartPolling();
}

if (typeof window !== 'undefined') {
    window.initializeGlobalChat = initializeGlobalChat;
    window.fptGcRefreshConfig = fptGcRefreshConfig;
    window.fptGcApplyVisibility = fptGcApplyVisibility;
}