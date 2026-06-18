// content/features/lot_note_buttons.js
// Кнопка «Заметка» на странице РЕДАКТИРОВАНИЯ своего лота и на странице ПОКУПКИ
// своего лота — чтобы можно было записать личную заметку к этому лоту.
// На странице редактирования стиль кнопки повторяет «Импорт» (btn btn-default).

(function () {
    'use strict';

    function offerIdFromEditForm() {
        const inp = document.querySelector('form.form-offer-editor input[name="offer_id"]');
        const v = inp && inp.value;
        return v && /^\d+$/.test(v) && v !== '0' ? v : null;
    }
    function lotTitleFromEditForm() {
        const s = document.querySelector('input[name="fields[summary][ru]"]');
        return (s && s.value) || '';
    }

    function offerIdFromOfferPage() {
        // на странице покупки своего лота есть ссылка/кнопка offerEdit?offer=NNN
        const a = document.querySelector('a[href*="offerEdit"][href*="offer="]');
        if (a) { const m = a.getAttribute('href').match(/[?&]offer=(\d+)/); if (m) return m[1]; }
        // запасной вариант: hidden input offer_id в форме заказа
        const inp = document.querySelector('input[name="offer_id"]');
        if (inp && /^\d+$/.test(inp.value)) return inp.value;
        return null;
    }
    function lotTitleFromOfferPage() {
        const h = document.querySelector('.param-item h5');
        // ищем «Краткое описание»
        const items = Array.from(document.querySelectorAll('.param-item'));
        for (const it of items) {
            const t = it.querySelector('h5')?.textContent.trim().toLowerCase();
            if (t === 'краткое описание' || t === 'short description') {
                return it.querySelector('div')?.textContent.trim() || '';
            }
        }
        const h1 = document.querySelector('h1.page-header');
        return h1 ? h1.textContent.trim() : '';
    }

    function makeBtn(label) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'btn btn-default fp-tools-note-btn';
        b.textContent = label;
        return b;
    }

    function addToEditPage() {
        const container = document.querySelector('.fp-tools-lot-edit-actions-container');
        if (!container || container.querySelector('.fp-tools-note-btn')) return;
        const offerId = offerIdFromEditForm();
        if (!offerId) return; // на создании нового лота (offer_id=0) заметку привязывать не к чему
        const btn = makeBtn('Заметка');
        btn.addEventListener('click', () => {
            if (window.FPTNotes) window.FPTNotes.openEditor(offerId, lotTitleFromEditForm());
            else showNotification?.('Модуль заметок не загрузился', true);
        });
        container.appendChild(btn);
    }

    function addToOfferPage() {
        // ставим рядом с кнопкой «Редактировать предложение» (только свой лот)
        const editLink = document.querySelector('a.btn.btn-gray.btn-block[href*="offerEdit?node="][href*="offer="], a.btn.btn-gray[href*="offerEdit"][href*="offer="]');
        if (!editLink) return;
        const host = editLink.parentElement;
        if (!host || host.parentElement?.querySelector('.fp-tools-note-btn')) return;
        const offerId = offerIdFromOfferPage();
        if (!offerId) return;
        const btn = makeBtn('📝 Заметка');
        btn.className = 'btn btn-default btn-block fp-tools-note-btn';
        btn.style.marginTop = '8px';
        btn.addEventListener('click', () => {
            if (window.FPTNotes) window.FPTNotes.openEditor(offerId, lotTitleFromOfferPage());
            else showNotification?.('Модуль заметок не загрузился', true);
        });
        // вставляем ПОСЛЕ блока с кнопкой редактирования (чтобы не ломать flex-ряд с мусоркой)
        host.parentElement.insertBefore(btn, host.nextSibling);
    }

    function run() {
        const isEdit = !!document.querySelector('form.form-offer-editor');
        if (isEdit) addToEditPage();
    }

    function init() {
        run();
        const root = document.getElementById('content') || document.body;
        new MutationObserver(run).observe(root, { childList: true, subtree: true });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
