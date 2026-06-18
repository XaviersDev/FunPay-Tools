// content/features/chat_lot_note.js
// В чате под панелью «Покупатель смотрит» показывает тонкую широкую кнопку «Заметка»,
// ЕСЛИ у лота, который смотрит покупатель, есть сохранённая заметка. Клик — открывает её.

(function () {
    'use strict';

    function offerIdFromPanel(panel) {
        const a = panel.querySelector('a[href*="lots/offer?id="]');
        if (!a) return null;
        const m = a.getAttribute('href').match(/[?&]id=(\d+)/);
        return m ? m[1] : null;
    }
    function lotTitleFromPanel(panel) {
        const a = panel.querySelector('a[href*="lots/offer?id="]');
        return a ? a.textContent.trim() : '';
    }

    let _busy = false;

    async function decorate(panel) {
        if (!window.FPTNotes) return;
        const offerId = offerIdFromPanel(panel);

        const existing = panel.querySelector('.fpt-chat-note-btn');
        if (existing && existing.dataset.offer === String(offerId)) return;

        // СИНХРОННО помечаем панель ДО await, иначе параллельные вызовы наплодят дубли.
        const stamp = String(offerId || '');
        if (panel.dataset.fptNoteStamp === stamp) return;
        panel.dataset.fptNoteStamp = stamp;

        if (existing) existing.remove();
        if (!offerId) return;

        const note = await window.FPTNotes.get(offerId);
        if (panel.dataset.fptNoteStamp !== stamp) return;
        if (panel.querySelector('.fpt-chat-note-btn')) return;
        if (!note) return; // кнопка только если заметка есть

        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'fpt-chat-note-btn';
        btn.dataset.offer = String(offerId);
        btn.textContent = 'заметка';
        btn.style.cssText = [
            'display:block', 'width:100%', 'margin-top:6px', 'padding:2px 10px',
            'font-size:11px', 'font-weight:600', 'cursor:pointer', 'line-height:1.4',
            'border:1px solid rgba(124,92,255,.45)', 'border-radius:6px',
            'background:rgba(124,92,255,.08)', 'color:#7c5cff', 'text-align:center',
            'transition:background .15s,border-color .15s', 'box-sizing:border-box'
        ].join(';');
        btn.addEventListener('mouseenter', () => { btn.style.background = 'rgba(124,92,255,.16)'; });
        btn.addEventListener('mouseleave', () => { btn.style.background = 'rgba(124,92,255,.08)'; });
        btn.addEventListener('click', () => window.FPTNotes.openEditor(offerId, lotTitleFromPanel(panel)));

        panel.appendChild(btn);
    }

    function scan() {
        if (_busy) return;
        _busy = true;
        try {
            document.querySelectorAll('.param-item.chat-panel[data-type="c-p-u"]').forEach(decorate);
        } finally {
            setTimeout(() => { _busy = false; }, 0);
        }
    }

    function init() {
        if (!/\/(chat|users)\//.test(window.location.pathname)) return;
        scan();
        const root = document.getElementById('content') || document.body;
        const obs = new MutationObserver((mutations) => {
            const onlyOurs = mutations.length && mutations.every(m =>
                Array.from(m.addedNodes).every(n => n.nodeType === 1 && n.classList && n.classList.contains('fpt-chat-note-btn')));
            if (onlyOurs) return;
            scan();
        });
        obs.observe(root, { childList: true, subtree: true });
        document.addEventListener('fpt-notes-changed', () => {
            document.querySelectorAll('.param-item.chat-panel[data-type="c-p-u"]').forEach(p => { delete p.dataset.fptNoteStamp; });
            scan();
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
