// content/features/lot_offer_actions.js
// На странице покупки СВОЕГО лота (там есть нативная кнопка «Редактировать
// предложение») делаем её компактной и добавляем рядом маленькую красную кнопку
// с иконкой мусорки — быстрое удаление лота.
//
// Кнопка «Редактировать предложение» появляется ТОЛЬКО на собственных лотах,
// поэтому само её наличие = это наш лот, проверять владельца отдельно не нужно.

(function () {
    'use strict';

    function offerIdFromEditUrl(href) {
        const m = (href || '').match(/[?&]offer=(\d+)/);
        return m ? m[1] : null;
    }

    function enhance() {
        const editLink = document.querySelector('a.btn.btn-gray.btn-block[href*="offerEdit?node="][href*="offer="]');
        if (!editLink || editLink.dataset.fptActions) return;
        editLink.dataset.fptActions = '1';

        const offerId = offerIdFromEditUrl(editLink.getAttribute('href'));

        const wrap = editLink.parentElement; // .form-group.mb10
        // Превращаем контейнер в строку: компактная «Редактировать» + красная мусорка
        wrap.style.display = 'flex';
        wrap.style.gap = '8px';
        wrap.style.alignItems = 'stretch';

        // Кнопка «Редактировать» больше не на всю ширину
        editLink.classList.remove('btn-block');
        editLink.style.flex = '1 1 auto';
        editLink.style.marginBottom = '0';

        // Маленькая БЕЛАЯ кнопка заметки (та же форма, что и удаление) — иконка бумажки.
        const noteBtn = document.createElement('button');
        noteBtn.type = 'button';
        noteBtn.className = 'btn btn-default fpt-lot-note-btn';
        noteBtn.title = 'Заметка к лоту';
        noteBtn.style.cssText = 'flex:0 0 auto;padding:0 14px;display:inline-flex;align-items:center;justify-content:center;';
        noteBtn.innerHTML = '<i class="far fa-sticky-note"></i>';
        noteBtn.addEventListener('click', () => {
            if (!offerId) { showNotification?.('Не удалось определить ID лота.', true); return; }
            if (window.FPTNotes) {
                let title = '';
                document.querySelectorAll('.param-item').forEach(it => {
                    const h = it.querySelector('h5')?.textContent.trim().toLowerCase();
                    if (h === 'краткое описание' || h === 'short description') title = it.querySelector('div')?.textContent.trim() || title;
                });
                window.FPTNotes.openEditor(offerId, title);
            } else showNotification?.('Модуль заметок не загрузился', true);
        });
        wrap.appendChild(noteBtn);

        // Красная кнопка удаления
        const del = document.createElement('button');
        del.type = 'button';
        del.className = 'btn btn-danger fpt-lot-del-btn';
        del.title = 'Удалить лот';
        del.style.cssText = 'flex:0 0 auto;padding:0 14px;display:inline-flex;align-items:center;justify-content:center;';
        del.innerHTML = '<i class="fas fa-trash"></i>';
        wrap.appendChild(del);

        del.addEventListener('click', async () => {
            if (!offerId) { showNotification?.('Не удалось определить ID лота.', true); return; }
            if (!confirm('Удалить этот лот? Действие необратимо.')) return;
            del.disabled = true;
            const prev = del.innerHTML;
            del.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
            try {
                const res = await chrome.runtime.sendMessage({ action: 'cloneDeleteLot', offerId });
                if (res && res.success) {
                    showNotification?.('Лот удалён.', false);
                    // уводим со страницы удалённого лота — на свой профиль
                    setTimeout(() => {
                        const me = document.querySelector('.user-link-dropdown[href*="/users/"]');
                        location.href = me ? me.getAttribute('href') : 'https://funpay.com/';
                    }, 700);
                } else {
                    throw new Error((res && res.error) || 'неизвестная ошибка');
                }
            } catch (e) {
                showNotification?.('Не удалось удалить: ' + e.message, true);
                del.disabled = false;
                del.innerHTML = prev;
            }
        });
    }

    function init() {
        if (!/\/lots\/offer/.test(window.location.pathname)) return;
        enhance();
        const root = document.getElementById('content') || document.body;
        new MutationObserver(enhance).observe(root, { childList: true, subtree: true });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
