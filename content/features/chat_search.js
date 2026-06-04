// content/features/chat_search.js
// =============================================================================
// FPT - ПОИСК СООБЩЕНИЙ В ЧАТЕ (телеграм-стиль)
//
// Кнопка-лупа в шапке диалога рядом с «Включены оповещения». По клику включает
// строку поиска ПО ТЕКУЩЕМУ ЧАТУ: подсвечивает совпадения в ленте, показывает
// счётчик «3 / 12», стрелки вверх/вниз для перехода между совпадениями.
//
// Поиск идёт ТОЛЬКО по уже загруженным сообщениям текущего чата (надёжно,
// без обращений к серверу). Всё клиентское, с дебаунсом ввода.
// =============================================================================

(function () {
    'use strict';

    let inChatActive = false;
    let inChatMatches = [];
    let inChatIndex = -1;

    // ───────────────────────── утилиты ─────────────────────────

    function debounce(fn, ms) {
        let t; return function (...a) { clearTimeout(t); t = setTimeout(() => fn.apply(this, a), ms); };
    }
    function norm(s) { return (s || '').toLowerCase().replace(/\u0451/g, '\u0435'); } // ё→е

    function getMessageNodes() {
        const list = document.querySelector('.chat-message-list');
        if (!list) return [];
        return Array.from(list.querySelectorAll('.chat-msg-item'));
    }
    function messageText(item) {
        const t = item.querySelector('.chat-msg-text');
        if (!t) return '';
        // только текст, без картинок
        return t.textContent.replace(/[\u200b-\u200d\uFEFF]/g, '').trim();
    }

    // ───────────────────────── 1. ПОИСК В ШАПКЕ ─────────────────────────

    function installHeaderButton() {
        const controls = document.querySelector('.chat-header-controls');
        if (!controls) return;
        if (controls.querySelector('.fpt-search-toggle')) return;

        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'btn btn-info-icon btn-info-sm btn-gray fpt-search-toggle';
        btn.title = 'Поиск по чату';
        btn.innerHTML = '<span class="material-symbols-rounded">search</span>';
        btn.addEventListener('click', toggleInChatSearch);

        // вставляем перед контейнером оповещений (слева от него)
        const notice = controls.querySelector('.notice-button-container');
        if (notice) controls.insertBefore(btn, notice);
        else controls.insertBefore(btn, controls.firstChild);
    }

    function toggleInChatSearch() {
        if (inChatActive) { closeInChatSearch(); return; }
        const header = document.querySelector('.chat-header');
        if (!header) return;
        inChatActive = true;

        const bar = document.createElement('div');
        bar.className = 'fpt-inchat-search';
        bar.innerHTML = `
            <span class="material-symbols-rounded fpt-ics-ico">search</span>
            <input type="text" class="fpt-ics-input" placeholder="Поиск по этому чату...">
            <span class="fpt-ics-count"></span>
            <button class="fpt-ics-nav" data-d="-1" title="Предыдущее"><span class="material-symbols-rounded">keyboard_arrow_up</span></button>
            <button class="fpt-ics-nav" data-d="1" title="Следующее"><span class="material-symbols-rounded">keyboard_arrow_down</span></button>
            <button class="fpt-ics-close" title="Закрыть"><span class="material-symbols-rounded">close</span></button>`;
        header.insertAdjacentElement('afterend', bar);
        requestAnimationFrame(() => bar.classList.add('open'));

        const input = bar.querySelector('.fpt-ics-input');
        input.addEventListener('input', debounce(() => runInChatSearch(input.value), 160));
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') { e.preventDefault(); stepMatch(e.shiftKey ? -1 : 1); }
            if (e.key === 'Escape') closeInChatSearch();
        });
        bar.querySelectorAll('.fpt-ics-nav').forEach(b =>
            b.addEventListener('click', () => stepMatch(+b.dataset.d)));
        bar.querySelector('.fpt-ics-close').addEventListener('click', closeInChatSearch);
        input.focus();
        document.querySelector('.fpt-search-toggle')?.classList.add('active');
    }

    function runInChatSearch(q) {
        clearInChatHighlights();
        inChatMatches = []; inChatIndex = -1;
        const query = norm(q.trim());
        const bar = document.querySelector('.fpt-inchat-search');
        const countEl = bar && bar.querySelector('.fpt-ics-count');
        if (!query) { if (countEl) countEl.textContent = ''; return; }

        getMessageNodes().forEach(item => {
            const txt = messageText(item);
            if (txt && norm(txt).includes(query)) {
                item.classList.add('fpt-ics-hit');
                inChatMatches.push(item);
            }
        });
        if (countEl) countEl.textContent = inChatMatches.length ? `1 / ${inChatMatches.length}` : 'нет';
        if (inChatMatches.length) { inChatIndex = 0; focusMatch(); }
    }

    function stepMatch(dir) {
        if (!inChatMatches.length) return;
        inChatIndex = (inChatIndex + dir + inChatMatches.length) % inChatMatches.length;
        focusMatch();
    }
    function focusMatch() {
        const bar = document.querySelector('.fpt-inchat-search');
        const countEl = bar && bar.querySelector('.fpt-ics-count');
        inChatMatches.forEach(m => m.classList.remove('fpt-ics-current'));
        const cur = inChatMatches[inChatIndex];
        if (!cur) return;
        cur.classList.add('fpt-ics-current');
        cur.scrollIntoView({ behavior: 'smooth', block: 'center' });
        if (countEl) countEl.textContent = `${inChatIndex + 1} / ${inChatMatches.length}`;
    }
    function clearInChatHighlights() {
        document.querySelectorAll('.fpt-ics-hit,.fpt-ics-current')
            .forEach(m => m.classList.remove('fpt-ics-hit', 'fpt-ics-current'));
    }
    function closeInChatSearch() {
        inChatActive = false;
        clearInChatHighlights();
        const bar = document.querySelector('.fpt-inchat-search');
        if (bar) { bar.classList.remove('open'); setTimeout(() => bar.remove(), 160); }
        document.querySelector('.fpt-search-toggle')?.classList.remove('active');
    }

    // ───────────────────────── init ─────────────────────────

    function tick() {
        installHeaderButton();
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', tick);
    else tick();

    const root = document.querySelector('.js-main-chat') || document.body;
    new MutationObserver(debounce(tick, 120)).observe(root, { childList: true, subtree: true });

})();
