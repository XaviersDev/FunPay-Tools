// content/features/inline_price_editor.js
// Inline price editing directly on the /trade page

(function () {
    'use strict';

    function getAppData() {
        try {
            const raw = document.body.dataset.appData;
            if (!raw) return {};
            const parsed = JSON.parse(raw);
            return Array.isArray(parsed) ? parsed[0] : parsed;
        } catch (_) { return {}; }
    }

    function getCurrentUserId() {
        try {
            const raw = document.body?.dataset?.appData;
            if (!raw) return null;
            const d = JSON.parse(raw);
            return String((Array.isArray(d) ? d[0] : d)?.userId || '');
        } catch (_) { return null; }
    }

    // ── Popup anchored to body to escape <a> click bubbling ──────────────────

    let _activePopup = null;

    function closeActivePopup() {
        if (_activePopup) { _activePopup.remove(); _activePopup = null; }
    }

    function createPopup(anchorEl, currentPrice, onSave) {
        closeActivePopup();

        const popup = document.createElement('div');
        popup.className = 'fp-ipe-popup';
        popup.innerHTML = `
            <span class="fp-ipe-label">Новая цена</span>
            <input type="number" class="fp-ipe-input" value="${currentPrice.toFixed(2)}" step="0.01" min="0.01">
            <button class="fp-ipe-save" title="Сохранить">✓</button>
            <button class="fp-ipe-cancel" title="Отмена">✕</button>
        `;

        const input = popup.querySelector('.fp-ipe-input');

        // Position under the anchor element
        function reposition() {
            const rect = anchorEl.getBoundingClientRect();
            popup.style.top  = (rect.bottom + window.scrollY + 4) + 'px';
            popup.style.left = Math.max(8, rect.left + window.scrollX - 10) + 'px';
        }

        document.body.appendChild(popup);
        reposition();
        _activePopup = popup;

        input.focus();
        input.select();

        popup.querySelector('.fp-ipe-cancel').addEventListener('click', (e) => {
            e.stopPropagation();
            closeActivePopup();
        });

        const doSave = async () => {
            const newPrice = parseFloat(input.value);
            if (isNaN(newPrice) || newPrice <= 0) {
                input.classList.add('fp-ipe-error');
                input.focus(); return;
            }
            const saveBtn = popup.querySelector('.fp-ipe-save');
            saveBtn.textContent = '…'; saveBtn.disabled = true;
            input.disabled = true;
            const ok = await onSave(newPrice);
            if (!ok) {
                saveBtn.textContent = '✓'; saveBtn.disabled = false;
                input.disabled = false; input.focus();
            } else {
                closeActivePopup();
            }
        };

        popup.querySelector('.fp-ipe-save').addEventListener('click', (e) => {
            e.stopPropagation();
            doSave();
        });

        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter')  { e.preventDefault(); doSave(); }
            if (e.key === 'Escape') { e.preventDefault(); closeActivePopup(); }
        });

        // Prevent popup clicks from bubbling to document
        popup.addEventListener('click', e => e.stopPropagation());
        popup.addEventListener('mousedown', e => e.stopPropagation());

        return popup;
    }

    // ── Chip attachment ───────────────────────────────────────────────────────

    function createPriceChip(lotLink) {
        if (lotLink.dataset.fpInlinePrice) return;
        const offerId = lotLink.getAttribute('data-offer') ||
            (lotLink.getAttribute('href') || '').match(/offer=(\d+)/)?.[1];
        if (!offerId) return;

        const priceEl = lotLink.querySelector('.tc-price');
        if (!priceEl) return;
        const priceDiv = priceEl.querySelector('div');
        if (!priceDiv) return;

        const priceMatch = priceDiv.textContent.replace(/\s+/g, ' ').trim().match(/([\d.,]+)/);
        if (!priceMatch) return;

        lotLink.dataset.fpInlinePrice = '1';

        // Make price cell look interactive
        priceEl.classList.add('fp-ipe-trigger');
        priceEl.title = 'Нажмите для редактирования цены';

        priceEl.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();

            const currentText = priceDiv.textContent.replace(/\s+/g, ' ').trim();
            const match = currentText.match(/([\d.,]+)/);
            const currentPrice = match ? parseFloat(match[1].replace(',', '.')) : 0;

            createPopup(priceEl, currentPrice, async (newPrice) => {
                return await saveLotPrice(offerId, newPrice, priceEl);
            });
        });
    }

    // ── Save ──────────────────────────────────────────────────────────────────

    async function saveLotPrice(offerId, newPrice, priceEl) {
        try {
            const lotEditUrl = `https://funpay.com/lots/offerEdit?offer=${offerId}`;
            const editResp = await fetch(lotEditUrl, { credentials: 'include' });
            if (!editResp.ok) throw new Error('Не удалось загрузить форму');
            const editHtml = await editResp.text();

            const formData = await new Promise(r =>
                chrome.runtime.sendMessage({ target: 'offscreen', action: 'parseLotEditPage', html: editHtml }, d => r(d))
            );
            if (!formData) throw new Error('Не удалось разобрать форму лота');

            formData.price = newPrice.toFixed(2);

            const appData = getAppData();
            const csrf = formData.csrf_token || appData.csrf_token ||
                document.cookie.match(/csrftoken=([^;]+)/)?.[1];
            if (!csrf) throw new Error('CSRF-токен не найден');
            formData.csrf_token = csrf;

            const saveResp = await fetch('https://funpay.com/lots/offerSave', {
                method: 'POST',
                credentials: 'include',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
                    'X-Requested-With': 'XMLHttpRequest'
                },
                body: new URLSearchParams(formData).toString()
            });

            if (!saveResp.ok) throw new Error(`Ошибка сервера: ${saveResp.status}`);
            const result = await saveResp.json().catch(() => ({}));
            if (result.error) throw new Error(result.error);

            // Update displayed price
            const priceDiv = priceEl.querySelector('div');
            if (priceDiv) {
                const unitSpan = priceDiv.querySelector('.unit');
                const unitHtml = unitSpan ? unitSpan.outerHTML : '<span class="unit">₽</span>';
                priceDiv.innerHTML = `${newPrice.toFixed(2)} ${unitHtml}`;
            }

            showNotification(`Цена обновлена: ${newPrice.toFixed(2)} ₽`);
            return true;
        } catch (err) {
            showNotification(`Ошибка: ${err.message}`, true);
            return false;
        }
    }

    // ── Init ──────────────────────────────────────────────────────────────────

    function attachChipsToPage() {
        document.querySelectorAll('a.tc-item[data-offer]').forEach(createPriceChip);
    }

    function initInlinePriceEditor() {
        if (!window.location.pathname.includes('/trade')) return;

        attachChipsToPage();

        const root = document.getElementById('content') || document.body;
        new MutationObserver(() => attachChipsToPage())
            .observe(root, { childList: true, subtree: true });

        // Close popup on outside click
        document.addEventListener('click', (e) => {
            if (_activePopup && !_activePopup.contains(e.target)) {
                closeActivePopup();
            }
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initInlinePriceEditor);
    } else {
        initInlinePriceEditor();
    }
})();