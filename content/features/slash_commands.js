// content/features/slash_commands.js
// =============================================================================
// СЛЭШ-КОМАНДЫ (как в Discord).
//   Пользователь печатает «/п» в поле чата → если есть команда «/привет»,
//   всплывает подсказка; Tab/Enter дописывает «/привет», а сам триггер «/привет»
//   разворачивается в заданный текст-ответ.
//
// Хранилище: chrome.storage.local
//   fpToolsSlashCommands = {
//       enabled: bool,
//       expandKey: 'tab' | 'enter' | 'both',   // чем разворачивать
//       autocomplete: bool,                      // показывать ли выпадающую подсказку
//       commands: [ { id, trigger:'/привет', response:'Привет, я тут...' }, ... ]
//   }
//
//   В response поддерживаются те же переменные, что и в других местах:
//     {buyername} / {username} — имя собеседника (если удаётся определить)
//     {date} {time}
//
// Работает и в диалоге (.chat-form-input .form-control), и в общем чате категории
// (.chat-form textarea[name="content"]), т.е. на любом textarea внутри .chat-form.
// =============================================================================

(function () {
    'use strict';

    const STORE_KEY = 'fpToolsSlashCommands';

    const DEFAULTS = {
        enabled: true,
        expandKey: 'both',     // tab | enter | both
        autocomplete: true,
        commands: []
    };

    let cfg = { ...DEFAULTS };
    let cfgLoaded = false;

    async function loadCfg() {
        try {
            const r = await chrome.storage.local.get(STORE_KEY);
            cfg = Object.assign({}, DEFAULTS, r[STORE_KEY] || {});
            if (!Array.isArray(cfg.commands)) cfg.commands = [];
        } catch (_) {
            cfg = { ...DEFAULTS };
        }
        cfgLoaded = true;
    }

    // Live-reload when the settings page saves new commands.
    if (chrome.storage && chrome.storage.onChanged) {
        chrome.storage.onChanged.addListener((changes, area) => {
            if (area !== 'local' || !changes[STORE_KEY]) return;
            cfg = Object.assign({}, DEFAULTS, changes[STORE_KEY].newValue || {});
            if (!Array.isArray(cfg.commands)) cfg.commands = [];
        });
    }

    // ── helpers ──────────────────────────────────────────────────────────────

    function getBuyerName() {
        // Открытый диалог: имя собеседника в шапке чата.
        const el = document.querySelector('.chat-header .media-user-name a, .chat-detail .media-user-name a, .chat-header .media-user-name');
        let name = el ? el.textContent.trim() : '';
        if (!name) {
            const alt = document.querySelector('.chat-header .media-user-name');
            if (alt) name = alt.textContent.trim();
        }
        return name || 'друг';
    }

    function applyVars(text) {
        const now = new Date();
        const name = getBuyerName();
        return String(text)
            .replace(/\{buyername\}/gi, name)
            .replace(/\{username\}/gi, name)
            .replace(/\{date\}/gi, now.toLocaleDateString('ru-RU'))
            .replace(/\{time\}/gi, now.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }));
    }

    // Возвращает «текущий слэш-токен» у каретки: текст от последнего «/» в начале
    // строки/слова до позиции каретки. Пустой результат — нет активного токена.
    function getActiveToken(input) {
        const pos = input.selectionStart;
        if (pos == null) return null;
        const value = input.value;
        const before = value.slice(0, pos);
        // токен начинается с «/», стоящего в начале текста или после пробела/переноса
        const m = before.match(/(^|[\s])(\/[^\s\/]*)$/);
        if (!m) return null;
        const token = m[2];                 // напр. «/п»
        const start = pos - token.length;   // индекс символа «/»
        return { token, start, end: pos };
    }

    function findMatches(token) {
        const q = token.toLowerCase();
        return cfg.commands.filter(c =>
            c && c.trigger && c.trigger.toLowerCase().startsWith(q)
        );
    }

    function findExact(token) {
        const q = token.toLowerCase();
        return cfg.commands.find(c => c && c.trigger && c.trigger.toLowerCase() === q) || null;
    }

    // Заменяет диапазон [start,end) в input на replacement, ставит каретку в конец.
    function replaceRange(input, start, end, replacement) {
        const value = input.value;
        const next = value.slice(0, start) + replacement + value.slice(end);
        input.value = next;
        const caret = start + replacement.length;
        try { input.setSelectionRange(caret, caret); } catch (_) {}
        // Помечаем как программный ввод, чтобы черновики/счётчики не сохраняли промежуточное.
        window.__fptProgrammaticInput = true;
        input.dispatchEvent(new Event('input', { bubbles: true }));
        window.__fptProgrammaticInput = false;
        input.focus();
    }

    // ── dropdown UI ──────────────────────────────────────────────────────────

    let dropdownEl = null;
    let activeInput = null;
    let dropItems = [];
    let dropIndex = -1;

    function ensureStyles() {
        if (document.getElementById('fpt-slash-styles')) return;
        const s = document.createElement('style');
        s.id = 'fpt-slash-styles';
        s.textContent = `
        .fpt-slash-dropdown{position:absolute;z-index:100000;min-width:240px;max-width:380px;max-height:260px;overflow-y:auto;
            background:var(--fpt-bg,#fff);border:1px solid var(--fpt-border,rgba(0,0,0,0.12));border-radius:10px;
            box-shadow:0 8px 22px var(--fpt-shadow,rgba(0,0,0,0.18));
            padding:6px;font-family:Inter,'Segoe UI',sans-serif;}
        .fpt-slash-item{display:flex;flex-direction:column;gap:2px;padding:8px 10px;border-radius:7px;cursor:pointer;}
        .fpt-slash-item .fpt-slash-trig{font-size:13px;font-weight:700;color:var(--fpt-accent,#C026D3);}
        .fpt-slash-item .fpt-slash-resp{font-size:11px;color:var(--fpt-text-muted,#888);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
        .fpt-slash-item.active,.fpt-slash-item:hover{background:var(--fpt-accent-soft,rgba(192,38,211,0.12));}
        .fpt-slash-hint{font-size:10px;color:var(--fpt-text-muted,#999);padding:4px 10px 2px;border-top:1px solid var(--fpt-border,rgba(0,0,0,0.1));margin-top:4px;}
        .fpt-slash-dropdown::-webkit-scrollbar{width:6px;}
        .fpt-slash-dropdown::-webkit-scrollbar-thumb{background:var(--fpt-border,#ccc);border-radius:6px;}
        `;
        (document.head || document.documentElement).appendChild(s);
    }

    function hideDropdown() {
        if (dropdownEl) { dropdownEl.remove(); dropdownEl = null; }
        dropItems = [];
        dropIndex = -1;
    }

    function positionDropdown(input) {
        if (!dropdownEl) return;
        const r = input.getBoundingClientRect();
        // Показываем НАД полем ввода (поле чата обычно внизу экрана).
        const dropH = Math.min(dropdownEl.offsetHeight || 200, 260);
        let top = r.top + window.scrollY - dropH - 6;
        if (top < window.scrollY + 6) top = r.bottom + window.scrollY + 6; // не влезло сверху — снизу
        dropdownEl.style.left = (r.left + window.scrollX) + 'px';
        dropdownEl.style.top = top + 'px';
        dropdownEl.style.width = Math.max(r.width, 240) + 'px';
    }

    function showDropdown(input, matches, token) {
        ensureStyles();
        if (!dropdownEl) {
            dropdownEl = document.createElement('div');
            dropdownEl.className = 'fpt-slash-dropdown';
            document.body.appendChild(dropdownEl);
        }
        activeInput = input;
        dropItems = matches;
        dropIndex = 0;

        const keyHint = cfg.expandKey === 'enter' ? 'Enter'
            : cfg.expandKey === 'tab' ? 'Tab' : 'Tab / Enter';

        dropdownEl.innerHTML = matches.map((c, i) => `
            <div class="fpt-slash-item ${i === 0 ? 'active' : ''}" data-i="${i}">
                <span class="fpt-slash-trig">${escapeHtml(c.trigger)}</span>
                <span class="fpt-slash-resp">${escapeHtml((c.response || '').replace(/\s+/g, ' ').slice(0, 90))}</span>
            </div>
        `).join('') + `<div class="fpt-slash-hint">${keyHint} — вставить - ↑↓ выбрать - Esc закрыть</div>`;

        dropdownEl.querySelectorAll('.fpt-slash-item').forEach(item => {
            item.addEventListener('mousedown', (e) => {
                e.preventDefault(); // не терять фокус поля
                const i = parseInt(item.dataset.i, 10);
                commitCommand(input, dropItems[i]);
            });
        });

        positionDropdown(input);
    }

    function escapeHtml(s) {
        return String(s).replace(/[&<>"']/g, ch => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        }[ch]));
    }

    function setDropIndex(i) {
        if (!dropdownEl || !dropItems.length) return;
        dropIndex = (i + dropItems.length) % dropItems.length;
        dropdownEl.querySelectorAll('.fpt-slash-item').forEach(el => {
            el.classList.toggle('active', parseInt(el.dataset.i, 10) === dropIndex);
        });
        const activeEl = dropdownEl.querySelector('.fpt-slash-item.active');
        if (activeEl) activeEl.scrollIntoView({ block: 'nearest' });
    }

    // Финальная замена: триггер → текст-ответ (с переменными).
    function commitCommand(input, command) {
        if (!command) return;
        const tok = getActiveToken(input);
        // Если каретка уже не на токене (редкий случай) — заменяем по последнему «/».
        let start, end;
        if (tok) { start = tok.start; end = tok.end; }
        else {
            const value = input.value;
            const idx = value.lastIndexOf(command.trigger);
            if (idx === -1) { hideDropdown(); return; }
            start = idx; end = idx + command.trigger.length;
        }
        replaceRange(input, start, end, applyVars(command.response || ''));
        hideDropdown();
    }

    // Первый Tab/Enter дописывает триггер целиком (как автодополнение),
    // второй — разворачивает в ответ. Но если уже введён полный триггер —
    // сразу разворачиваем.
    function handleExpand(input) {
        const tok = getActiveToken(input);
        if (!tok) return false;

        const exact = findExact(tok.token);
        if (exact) { commitCommand(input, exact); return true; }

        const matches = findMatches(tok.token);
        if (matches.length === 0) return false;

        // Берём выбранный в дропдауне или первый.
        const chosen = (dropdownEl && dropItems[dropIndex]) ? dropItems[dropIndex] : matches[0];

        // Если введён неполный триггер — сперва дополняем до полного триггера,
        // оставляя дропдаун (чтобы было видно «/привет»), а вставку делаем сразу
        // следующим нажатием. Для удобства: если совпадение ровно одно —
        // разворачиваем сразу.
        if (matches.length === 1) {
            commitCommand(input, chosen);
            return true;
        }

        // Несколько совпадений: дополняем до выбранного триггера.
        replaceRange(input, tok.start, tok.end, chosen.trigger);
        // После дополнения покажем, что теперь это точный триггер — обновим дропдаун.
        const after = getActiveToken(input);
        if (after) {
            const m = findMatches(after.token);
            if (m.length) showDropdown(input, m, after.token); else hideDropdown();
        }
        return true;
    }

    // ── input wiring ───────────────────────────────────────────────────────────

    function isChatInput(el) {
        if (!el || el.tagName !== 'TEXTAREA') return false;
        return !!el.closest('.chat-form, .chat-form-input, #comments');
    }

    function onInput(e) {
        if (!cfgLoaded || !cfg.enabled) { hideDropdown(); return; }
        const input = e.target;
        if (!isChatInput(input)) return;
        if (!cfg.autocomplete) { hideDropdown(); return; }

        const tok = getActiveToken(input);
        if (!tok || tok.token.length < 1) { hideDropdown(); return; }

        const matches = findMatches(tok.token);
        if (!matches.length) { hideDropdown(); return; }
        showDropdown(input, matches, tok.token);
    }

    function onKeyDown(e) {
        if (!cfgLoaded || !cfg.enabled) return;
        const input = e.target;
        if (!isChatInput(input)) return;

        const dropdownOpen = !!dropdownEl && dropItems.length > 0;

        // Навигация по дропдауну.
        if (dropdownOpen) {
            if (e.key === 'ArrowDown') { e.preventDefault(); setDropIndex(dropIndex + 1); return; }
            if (e.key === 'ArrowUp')   { e.preventDefault(); setDropIndex(dropIndex - 1); return; }
            if (e.key === 'Escape')    { e.preventDefault(); hideDropdown(); return; }
        }

        const wantTab   = (cfg.expandKey === 'tab'   || cfg.expandKey === 'both');
        const wantEnter = (cfg.expandKey === 'enter' || cfg.expandKey === 'both');

        // TAB: только если есть активный слэш-токен с совпадениями.
        if (e.key === 'Tab' && wantTab) {
            const tok = getActiveToken(input);
            if (tok && (findExact(tok.token) || findMatches(tok.token).length)) {
                e.preventDefault();
                handleExpand(input);
                return;
            }
        }

        // ENTER: разворачиваем ТОЛЬКО точный/единственный триггер, чтобы не мешать
        // обычной отправке сообщения. Если развернули — гасим отправку.
        if (e.key === 'Enter' && !e.shiftKey && wantEnter) {
            const tok = getActiveToken(input);
            if (tok) {
                const exact = findExact(tok.token);
                const matches = findMatches(tok.token);
                if (exact || matches.length === 1) {
                    e.preventDefault();
                    e.stopPropagation();
                    commitCommand(input, exact || matches[0]);
                    return;
                }
                // Если открыт дропдаун с несколькими — Enter выбирает подсвеченный.
                if (dropdownOpen) {
                    e.preventDefault();
                    e.stopPropagation();
                    commitCommand(input, dropItems[dropIndex]);
                    return;
                }
            }
        }
    }

    function onBlur(e) {
        // Небольшая задержка: клик по элементу дропдауна не должен пропадать.
        setTimeout(() => {
            if (document.activeElement !== activeInput) hideDropdown();
        }, 120);
    }

    function init() {
        loadCfg();
        // Делегирование на document — переживает SPA-перерисовки FunPay.
        document.addEventListener('input', onInput, true);
        document.addEventListener('keydown', onKeyDown, true);
        document.addEventListener('blur', onBlur, true);
        document.addEventListener('scroll', () => { if (dropdownEl && activeInput) positionDropdown(activeInput); }, true);
        window.addEventListener('resize', () => { if (dropdownEl && activeInput) positionDropdown(activeInput); });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // expose for settings page reload
    window.fptReloadSlashCommands = loadCfg;
})();
