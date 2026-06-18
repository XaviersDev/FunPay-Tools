// content/features/category_peek_panel.js
// =============================================================================
// Кнопка на странице создания/редактирования лота, открывающая боковую панель:
//   • до 30 свежих лотов из той же категории (скролл внутри панели)
//   • если у категории есть чат - последние сообщения из него
//
// Цвета берём из живой палитры расширения (--fpt-*), как меню копирования/импорта
// (а не фиксированные). Парсинг категории и чата - по реальной разметке FunPay
// (.tc-item для лотов, .chat-msg-item для чата).
//
// Отключается переключателем в разделе «Что тебе нужно» (id: lot_category_peek).
// =============================================================================

(function () {
    'use strict';

    const FEATURE_ID = 'lot_category_peek';

    function isEditPage() {
        const p = window.location.pathname;
        return p.includes('/lots/offerEdit') || p.includes('/lots/offer/add');
    }

    async function isFeatureEnabled() {
        try {
            const { fpToolsDisabledFeatures = [] } = await chrome.storage.local.get('fpToolsDisabledFeatures');
            return !Array.isArray(fpToolsDisabledFeatures) || !fpToolsDisabledFeatures.includes(FEATURE_ID);
        } catch (_) { return true; }
    }

    // node категории берём из формы/ссылок/URL - так же, как делает клонирование лота.
    function getCategoryNode() {
        const back = document.querySelector('a.btn[href*="/lots/"], a[href*="/lots/"][href$="/trade"], .page-header a[href*="/lots/"]');
        if (back) {
            const m = back.getAttribute('href').match(/\/lots\/(\d+)/);
            if (m) return m[1];
        }
        const params = new URLSearchParams(window.location.search);
        if (params.get('node')) return params.get('node');
        const nodeInput = document.querySelector('input[name="node_id"]');
        if (nodeInput && nodeInput.value) return nodeInput.value;
        // запасной вариант - из любой ссылки вида /lots/123/ на странице
        const any = document.querySelector('a[href*="/lots/"]');
        if (any) { const m = any.getAttribute('href').match(/\/lots\/(\d+)/); if (m) return m[1]; }
        return null;
    }

    function ensureStyles() {
        if (document.getElementById('fpt-peek-styles')) return;
        const s = document.createElement('style');
        s.id = 'fpt-peek-styles';
        s.textContent = `
        .fpt-peek-panel{
            --pk-bg: var(--fpt-bg, #13141a);
            --pk-surface: var(--fpt-surface, #1a1c26);
            --pk-surface2: var(--fpt-surface-2, #20222e);
            --pk-border: var(--fpt-border, #22253a);
            --pk-text: var(--fpt-text, #d8dae8);
            --pk-muted: var(--fpt-text-muted, #9099b8);
            --pk-accent: var(--fpt-accent, #C026D3);
            --pk-shadow: var(--fpt-shadow, rgba(0,0,0,0.5));
            position:fixed; top:0; right:0; height:100vh; width:340px; max-width:92vw;
            background:var(--pk-bg); border-left:1px solid var(--pk-border);
            box-shadow:-4px 0 16px var(--pk-shadow); z-index:99998;
            display:flex; flex-direction:column; font-family:Inter,'Segoe UI',sans-serif;
            transform:translateX(102%); transition:transform .25s ease;
        }
        .fpt-peek-panel.open{ transform:translateX(0); }
        .fpt-peek-head{ display:flex; align-items:center; justify-content:space-between;
            padding:14px 16px; border-bottom:1px solid var(--pk-border); flex-shrink:0; }
        .fpt-peek-head h3{ margin:0; font-size:14px; color:var(--pk-text); font-weight:700; }
        .fpt-peek-close{ background:none; border:none; color:var(--pk-muted); font-size:22px; cursor:pointer; line-height:1; }
        .fpt-peek-close:hover{ color:var(--pk-text); }
        .fpt-peek-body{ flex:1; overflow-y:auto; padding:12px 14px; }
        .fpt-peek-section-title{ font-size:11px; text-transform:uppercase; letter-spacing:.6px;
            color:var(--pk-muted); font-weight:700; margin:4px 0 8px; display:flex; align-items:center; gap:6px; }
        /* список лотов: без ограничения видимых - весь скролл внутри панели */
        .fpt-peek-lots{ display:flex; flex-direction:column; gap:8px;
            padding-right:4px; margin-bottom:18px; }
        .fpt-peek-lot{ display:block; text-decoration:none; background:var(--pk-surface);
            border:1px solid var(--pk-border); border-radius:9px; padding:9px 11px; transition:border-color .15s, background .15s; }
        .fpt-peek-lot:hover{ border-color:var(--pk-accent); background:var(--pk-surface2); }
        .fpt-peek-lot-top{ display:flex; justify-content:space-between; gap:8px; align-items:baseline; }
        .fpt-peek-lot-title{ font-size:12.5px; color:var(--pk-text); line-height:1.35; flex:1;
            display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; }
        .fpt-peek-lot-price{ font-size:12px; font-weight:700; color:var(--pk-accent); white-space:nowrap; }
        .fpt-peek-lot-seller-row{ display:flex; align-items:center; gap:6px; margin-top:7px; font-size:11px; color:var(--pk-muted); }
        .fpt-peek-av{ width:18px; height:18px; border-radius:50%; background-size:cover; background-position:center;
            background-color:var(--pk-surface2); flex-shrink:0; position:relative;
            box-shadow:inset 0 0 0 1px var(--pk-border); }
        .fpt-peek-av.on::after{ content:''; position:absolute; right:-1px; bottom:-1px; width:7px; height:7px;
            border-radius:50%; background:#4caf50; box-shadow:0 0 0 2px var(--pk-bg); }
        .fpt-peek-lot-seller{ color:var(--pk-text); font-weight:600; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:120px; }
        .fpt-peek-stars{ color:#f4c84a; font-size:10px; letter-spacing:-1px; flex-shrink:0; }
        .fpt-peek-reviews{ color:var(--pk-muted); font-size:10px; flex-shrink:0; }
        .fpt-peek-lot-server{ margin-top:5px; font-size:10px; color:var(--pk-muted); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        /* чат */
        .fpt-peek-chat{ display:flex; flex-direction:column; gap:8px; }
        .fpt-peek-msg{ background:var(--pk-surface); border:1px solid var(--pk-border); border-radius:9px; padding:8px 10px; }
        .fpt-peek-msg-head{ display:flex; justify-content:space-between; gap:8px; margin-bottom:3px; }
        .fpt-peek-msg-author{ font-size:11.5px; font-weight:700; color:var(--pk-accent);
            text-decoration:none; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        .fpt-peek-msg-author:hover{ text-decoration:underline; }
        .fpt-peek-msg-time{ font-size:10px; color:var(--pk-muted); white-space:nowrap; flex-shrink:0; }
        .fpt-peek-msg-text{ font-size:12px; color:var(--pk-text); line-height:1.4; white-space:pre-wrap; word-break:break-word; }
        .fpt-peek-empty{ font-size:12px; color:var(--pk-muted); text-align:center; padding:14px 0; }
        .fpt-peek-loader{ font-size:12px; color:var(--pk-muted); text-align:center; padding:18px 0; }
        .fpt-peek-refresh{ background:none; border:1px solid var(--pk-border); color:var(--pk-muted);
            border-radius:6px; cursor:pointer; font-size:11px; padding:2px 8px; }
        .fpt-peek-refresh:hover{ color:var(--pk-text); border-color:var(--pk-accent); }
        .fpt-peek-body::-webkit-scrollbar,.fpt-peek-lots::-webkit-scrollbar{ width:6px; }
        .fpt-peek-body::-webkit-scrollbar-thumb,.fpt-peek-lots::-webkit-scrollbar-thumb{ background:var(--pk-border); border-radius:6px; }
        .fpt-peek-toggle-btn{ }
        `;
        (document.head || document.documentElement).appendChild(s);
    }

    function escapeHtml(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, ch => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        }[ch]));
    }

    // ── парсинг категории ──────────────────────────────────────────────────────
    function parseCategory(html) {
        const doc = new DOMParser().parseFromString(html, 'text/html');

        // Лоты: строки .tc-item внутри витрины. Берём первые 30.
        const lots = [];
        const rows = doc.querySelectorAll('.tc .tc-item, a.tc-item');
        for (const row of rows) {
            if (lots.length >= 30) break;
            const href = row.getAttribute('href') || '';
            const descEl = row.querySelector('.tc-desc-text');
            const title = descEl ? descEl.textContent.trim() : (row.querySelector('.tc-desc') ? row.querySelector('.tc-desc').textContent.trim() : '');
            if (!title) continue;
            const priceEl = row.querySelector('.tc-price > div, .tc-price');
            let price = '';
            if (priceEl) {
                price = priceEl.textContent.replace(/\s+/g, ' ').trim();
                const pm = price.match(/[\d.,]+\s*[^\d\s].*/);
                if (pm) price = pm[0].trim();
            }
            const seller = row.querySelector('.media-user-name');
            const sellerName = seller ? seller.textContent.trim() : '';

            // рейтинг: класс rating-N на .rating-stars
            let rating = 0;
            const stars = row.querySelector('.rating-stars');
            if (stars) {
                const rm = (stars.className || '').match(/rating-(\d)/);
                if (rm) rating = parseInt(rm[1], 10);
            }
            // кол-во отзывов
            const reviewsEl = row.querySelector('.rating-mini-count');
            const reviews = reviewsEl ? reviewsEl.textContent.trim() : '';

            // аватар продавца (background-image)
            let avatar = '';
            const avEl = row.querySelector('.avatar-photo');
            if (avEl) {
                const bg = (avEl.getAttribute('style') || '').match(/url\(([^)]+)\)/);
                if (bg) avatar = bg[1].replace(/['"]/g, '');
            }
            const online = !!row.querySelector('.media-user.online, .online');

            const server = row.querySelector('.tc-server');
            const serverName = server ? server.textContent.trim() : '';
            lots.push({ href, title, price, sellerName, rating, reviews, avatar, online, serverName });
        }

        // Чат категории (если есть).
        const chat = [];
        const msgItems = doc.querySelectorAll('.chat-message-list .chat-msg-item');
        let lastAuthor = '', lastAuthorHref = '', lastAvatar = '';
        for (const item of msgItems) {
            const textEl = item.querySelector('.chat-msg-text');
            if (!textEl) continue;
            const text = textEl.textContent;
            if (item.querySelector('.chat-message.blocked') || /Сообщение скрыто\./.test(text.trim())) {
                // пропускаем скрытые/заблокированные
                continue;
            }
            const authorEl = item.querySelector('.chat-msg-author-link');
            // у «слепленных» сообщений автора нет - наследуем предыдущего
            let author = authorEl ? authorEl.textContent.trim() : lastAuthor;
            let authorHref = authorEl ? (authorEl.getAttribute('href') || lastAuthorHref) : lastAuthorHref;
            if (authorEl) { lastAuthor = author; lastAuthorHref = authorHref; }
            const dateEl = item.querySelector('.chat-msg-date');
            const time = dateEl ? dateEl.textContent.trim() : '';
            chat.push({ author, authorHref, time, text: text.trim() });
        }
        // оставляем последние ~25
        const chatTrimmed = chat.slice(-25);

        return { lots, chat: chatTrimmed };
    }

    // ── рендер ──────────────────────────────────────────────────────────────────
    let panelEl = null;
    let currentNode = null;

    function buildPanel(node) {
        ensureStyles();
        if (panelEl) return panelEl;
        panelEl = document.createElement('div');
        panelEl.className = 'fpt-peek-panel';
        panelEl.innerHTML = `
            <div class="fpt-peek-head">
                <h3>Категория · свежее</h3>
                <div style="display:flex;align-items:center;gap:8px;">
                    <button class="fpt-peek-refresh" id="fpt-peek-refresh">Обновить</button>
                    <button class="fpt-peek-close" id="fpt-peek-close">×</button>
                </div>
            </div>
            <div class="fpt-peek-body" id="fpt-peek-body">
                <div class="fpt-peek-loader">Загрузка…</div>
            </div>
        `;
        document.body.appendChild(panelEl);
        panelEl.querySelector('#fpt-peek-close').addEventListener('click', closePanel);
        panelEl.querySelector('#fpt-peek-refresh').addEventListener('click', () => loadAndRender(node, true));
        return panelEl;
    }

    function renderContent(data) {
        const body = panelEl && panelEl.querySelector('#fpt-peek-body');
        if (!body) return;

        const lotsHtml = (data.lots && data.lots.length)
            ? `<div class="fpt-peek-lots">` + data.lots.map(l => {
                const stars = l.rating ? `<span class="fpt-peek-stars" title="${l.rating}/5">${'★'.repeat(l.rating)}${'☆'.repeat(5 - l.rating)}</span>` : '';
                const reviews = l.reviews ? `<span class="fpt-peek-reviews">${escapeHtml(l.reviews)}</span>` : '';
                const av = l.avatar
                    ? `<span class="fpt-peek-av${l.online ? ' on' : ''}" style="background-image:url('${escapeHtml(l.avatar)}')"></span>`
                    : `<span class="fpt-peek-av${l.online ? ' on' : ''}"></span>`;
                return `
                <a class="fpt-peek-lot" href="${escapeHtml(l.href)}" target="_blank" rel="noopener">
                    <div class="fpt-peek-lot-top">
                        <div class="fpt-peek-lot-title">${escapeHtml(l.title)}</div>
                        ${l.price ? `<div class="fpt-peek-lot-price">${escapeHtml(l.price)}</div>` : ''}
                    </div>
                    <div class="fpt-peek-lot-seller-row">
                        ${av}
                        <span class="fpt-peek-lot-seller">${escapeHtml(l.sellerName || '-')}</span>
                        ${stars}${reviews}
                    </div>
                    ${l.serverName ? `<div class="fpt-peek-lot-server">${escapeHtml(l.serverName)}</div>` : ''}
                </a>`;
            }).join('') + `</div>`
            : `<div class="fpt-peek-empty">Свежих лотов не найдено.</div>`;

        const chatHtml = (data.chat && data.chat.length)
            ? `<div class="fpt-peek-chat">` + data.chat.map(m => `
                <div class="fpt-peek-msg">
                    <div class="fpt-peek-msg-head">
                        ${m.authorHref
                            ? `<a class="fpt-peek-msg-author" href="${escapeHtml(m.authorHref)}" target="_blank" rel="noopener">${escapeHtml(m.author || 'Аноним')}</a>`
                            : `<span class="fpt-peek-msg-author">${escapeHtml(m.author || 'Аноним')}</span>`}
                        <span class="fpt-peek-msg-time">${escapeHtml(m.time)}</span>
                    </div>
                    <div class="fpt-peek-msg-text">${escapeHtml(m.text)}</div>
                </div>`).join('') + `</div>`
            : '';

        const chatSection = chatHtml
            ? `<div class="fpt-peek-section-title"><span class="material-symbols-rounded" style="font-size:15px;">forum</span> Чат категории</div>${chatHtml}`
            : '';

        body.innerHTML = `
            <div class="fpt-peek-section-title"><span class="material-symbols-rounded" style="font-size:15px;">inventory_2</span> 30 свежих лотов</div>
            ${lotsHtml}
            ${chatSection}
        `;
    }

    const _cache = new Map(); // node -> { ts, data }

    async function loadAndRender(node, force) {
        const body = panelEl && panelEl.querySelector('#fpt-peek-body');
        if (!body) return;

        if (!force && _cache.has(node) && (Date.now() - _cache.get(node).ts < 60 * 1000)) {
            renderContent(_cache.get(node).data);
            return;
        }

        body.innerHTML = `<div class="fpt-peek-loader">Загрузка…</div>`;
        try {
            // Контент-скрипт на funpay.com - запрос same-origin, куки идут автоматически.
            const resp = await fetch(`https://funpay.com/lots/${node}/`, { credentials: 'include' });
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
            const html = await resp.text();
            const data = parseCategory(html);
            _cache.set(node, { ts: Date.now(), data });
            renderContent(data);
        } catch (e) {
            body.innerHTML = `<div class="fpt-peek-empty">Не удалось загрузить категорию.<br>${escapeHtml(e.message)}</div>`;
        }
    }

    function openPanel(node) {
        buildPanel(node);
        panelEl.classList.add('open');
        loadAndRender(node, false);
    }
    function closePanel() {
        if (panelEl) panelEl.classList.remove('open');
    }
    function togglePanel(node) {
        if (panelEl && panelEl.classList.contains('open')) closePanel();
        else openPanel(node);
    }

    // ── кнопка-переключатель на странице редактора ───────────────────────────────
    async function init() {
        if (!isEditPage()) return;
        if (!(await isFeatureEnabled())) return;

        const node = getCategoryNode();
        if (!node) return;
        currentNode = node;

        // ждём появления контейнера действий (его создаёт lot_cloning); если нет -
        // создаём свой рядом с заголовком.
        const place = () => {
            if (document.getElementById('fpt-peek-toggle')) return true;
            let container = document.querySelector('.fp-tools-lot-edit-actions-container');
            if (!container) {
                const header = Array.from(document.querySelectorAll('h1.page-header'))
                    .find(h => /предложени/i.test(h.textContent)) || document.querySelector('h1.page-header');
                if (!header) return false;
                container = document.createElement('div');
                container.className = 'fp-tools-lot-edit-actions-container';
                header.parentNode.insertBefore(container, header.nextSibling);
            }
            const btn = createElementSafe('button', 'btn btn-default fpt-peek-toggle-btn', 'Свежее в категории');
            btn.id = 'fpt-peek-toggle';
            btn.addEventListener('click', (e) => { e.preventDefault(); togglePanel(node); });
            container.appendChild(btn);
            return true;
        };

        if (!place()) {
            // подождём отрисовку редактора
            let tries = 0;
            const iv = setInterval(() => {
                if (place() || ++tries > 40) clearInterval(iv);
            }, 250);
        }
    }

    function createElementSafe(tag, className, text) {
        // используем глобальный createElement если есть, иначе нативно
        if (typeof createElement === 'function') {
            return createElement(tag, { class: className }, {}, text);
        }
        const el = document.createElement(tag);
        el.className = className;
        el.textContent = text;
        return el;
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
