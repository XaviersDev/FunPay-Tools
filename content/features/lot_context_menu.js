(function () {
    'use strict';

    const MENU_ID  = 'fp-lot-ctx-menu';
    const CHAT_ID  = 'fp-lot-ctx-chat';
    let pinnedLots    = [];
    let _ctxInverted  = false; // When true: Shift+RMB = this menu, plain RMB = browser

    chrome.storage.local.get(['fpToolsPinnedLots', 'fpToolsCtxInverted'], d => {
        pinnedLots   = d.fpToolsPinnedLots   || [];
        _ctxInverted = d.fpToolsCtxInverted  || false;
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', waitForLotsAndRender);
        else waitForLotsAndRender();
    });

    function savePinned() { chrome.storage.local.set({ fpToolsPinnedLots: pinnedLots }); }

    function parseLot(el) {
        const a = el.closest('a.tc-item') || (el.tagName === 'A' ? el : null);
        if (!a) return null;
        const href       = a.getAttribute('href') || '';
        const offerMatch = href.match(/[?&]id=(\d+)/);
        const offerId    = offerMatch?.[1] || null;
        const titleEl    = a.querySelector('.tc-desc-text, .tc-desc');
        const title      = titleEl?.textContent.trim() || 'Лот';
        const selLink    = a.querySelector('.media-user-name a, .media-user-name span[data-href]');
        const selHref    = selLink?.getAttribute('href') || selLink?.getAttribute('data-href') || '';
        const selIdMatch = selHref.match(/\/users\/(\d+)/);
        const sellerId   = selIdMatch?.[1] || null;
        const selName    = selLink?.textContent.trim() || null;
        // Build public lot URL; href can be absolute or relative
        const hrefClean = href.startsWith('http') ? href : `https://funpay.com${href}`;
        // For 'offerEdit' links (own lots), extract offer id and make public URL
        const editIdMatch = href.match(/offer=(\d+)/);
        const lotUrl = offerId
            ? `https://funpay.com/lots/offer?id=${offerId}`
            : (editIdMatch ? `https://funpay.com/lots/offer?id=${editIdMatch[1]}` : hrefClean);
        return { offerId, title, sellerId, sellerName: selName, lotUrl };
    }

    function removeMenu()      { document.getElementById(MENU_ID)?.remove(); }
    function removeChatPanel() { document.getElementById(CHAT_ID)?.remove(); }

    
    function showMenu(x, y, lot) {
        removeMenu();
        const isPinned = pinnedLots.some(p => p.offerId === lot.offerId);

        const menu = document.createElement('div');
        menu.id = MENU_ID;
        menu.style.cssText = `position:fixed;left:${x}px;top:${y}px;background:#13141a;border:1px solid #22253a;border-radius:8px;box-shadow:0 8px 24px rgba(0,0,0,0.5);z-index:100000;min-width:210px;padding:4px 0;font-family:Inter,'Segoe UI',sans-serif;font-size:13px;color:#d8dae8;`;

        const items = [
            { icon: isPinned ? '📌' : '📍', label: isPinned ? 'Открепить из таблицы' : 'Закрепить в таблице', action: 'pin', enabled: !!lot.offerId },
            { icon: '✉️', label: lot.sellerName ? `Написать ${lot.sellerName}` : 'Написать', action: 'msg', enabled: !!lot.sellerId },
            { icon: '🔗', label: 'Скопировать ссылку', action: 'copy', enabled: true },
            { sep: true },
            {
                icon: '🔄',
                label: 'Переключить',
                action: 'toggle_ctx',
                enabled: true,
                tooltip: _ctxInverted
                    ? 'Сейчас: Shift+ПКМ = это меню, обычный ПКМ = браузер'
                    : 'Сейчас: ПКМ = это меню, Shift+ПКМ = браузер'
            },
        ];

        items.forEach(item => {
            if (item.sep) { const d = document.createElement('div'); d.style.cssText = 'height:1px;background:#1e2030;margin:4px 0;'; menu.appendChild(d); return; }
            const row = document.createElement('div');
            row.style.cssText = `display:flex;align-items:center;gap:10px;padding:8px 14px;border-radius:4px;margin:0 4px;${item.hint ? 'opacity:0.4;cursor:default;font-size:11px;' : item.enabled ? 'cursor:pointer;' : 'opacity:0.4;cursor:default;'}`;
            const tooltipHtml = item.tooltip ? `<span style="font-size:10px;color:#4a5070;margin-left:auto;max-width:120px;text-align:right;white-space:normal;line-height:1.3;">${item.tooltip}</span>` : '';
            row.innerHTML = `<span style="width:18px;text-align:center;">${item.icon}</span><span>${item.label}</span>${tooltipHtml}`;
            if (item.enabled) {
                row.addEventListener('mouseenter', () => row.style.background = '#1e2030');
                row.addEventListener('mouseleave', () => row.style.background = '');
                row.addEventListener('click', () => { removeMenu(); handleAction(item.action, lot); });
            }
            menu.appendChild(row);
        });

        if (!document.getElementById('fp-ctx-anim')) {
            const s = document.createElement('style');
            s.id = 'fp-ctx-anim';
            s.textContent = '@keyframes fpCtxIn{from{opacity:0;transform:scale(0.96) translateY(-4px)}to{opacity:1;transform:none}}';
            document.head.appendChild(s);
        }
        menu.style.animation = 'fpCtxIn 0.1s ease';
        document.body.appendChild(menu);

        const r = menu.getBoundingClientRect();
        if (r.right  > window.innerWidth)  menu.style.left = `${x - r.width}px`;
        if (r.bottom > window.innerHeight) menu.style.top  = `${y - r.height}px`;
    }

    
    function handleAction(action, lot) {
        if (action === 'pin') {
            const idx = pinnedLots.findIndex(p => p.offerId === lot.offerId);
            if (idx !== -1) { pinnedLots.splice(idx, 1); showNotification('Лот откреплён'); }
            else { pinnedLots.unshift({ ...lot, pinnedAt: Date.now() }); if (pinnedLots.length > 50) pinnedLots.length = 50; showNotification('Лот закреплён 📌'); }
            savePinned();
            renderPinnedInTable();
        }
        if (action === 'copy') {
            navigator.clipboard?.writeText(lot.lotUrl).then(() => showNotification('Ссылка скопирована 🔗')).catch(() => {
                const ta = document.createElement('textarea'); ta.value = lot.lotUrl; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove(); showNotification('Ссылка скопирована 🔗');
            });
        }
        if (action === 'msg') showInlineChat(lot);
        if (action === 'toggle_ctx') {
            _ctxInverted = !_ctxInverted;
            chrome.storage.local.set({ fpToolsCtxInverted: _ctxInverted });
            const msg = _ctxInverted
                ? 'Переключено: Shift+ПКМ = это меню'
                : 'Переключено: ПКМ = это меню';
            showNotification(msg);
        }
    }

    
    function showInlineChat(lot) {
        removeChatPanel();
        const panel = document.createElement('div');
        panel.id = CHAT_ID;
        panel.style.cssText = 'position:fixed;bottom:24px;right:24px;width:320px;background:#13141a;border:1px solid #22253a;border-radius:10px;box-shadow:0 12px 32px rgba(0,0,0,0.6);z-index:100001;overflow:hidden;font-family:Inter,sans-serif;font-size:13px;color:#d8dae8;animation:fpCtxIn 0.15s ease;';
        panel.innerHTML = `
            <div style="display:flex;align-items:center;justify-content:space-between;padding:12px 14px;border-bottom:1px solid #1e2030;background:#0e0f16;">
                <span style="font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${lot.sellerName ? `Написать ${lot.sellerName}` : 'Написать'}</span>
                <button id="fp-ctx-chat-close" style="background:none;border:none;color:#4a4f68;cursor:pointer;font-size:18px;padding:0 0 0 8px;line-height:1;">✕</button>
            </div>
            <div style="padding:10px 14px;">
                <div style="font-size:11px;color:#4a4f68;margin-bottom:6px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">Лот: ${lot.title}</div>
                <textarea id="fp-ctx-chat-text" placeholder="Сообщение... (Ctrl+Enter отправить)" style="width:100%;height:80px;background:#0e0f16;border:1px solid #22253a;border-radius:6px;color:#d8dae8;font-size:13px;padding:8px;resize:none;outline:none;font-family:inherit;box-sizing:border-box;"></textarea>
                <div style="display:flex;gap:8px;margin-top:8px;">
                    <button id="fp-ctx-chat-send" style="flex:1;background:#6B66FF;color:#fff;border:none;border-radius:6px;padding:9px;font-size:13px;font-weight:600;cursor:pointer;">Отправить</button>
                    <a href="https://funpay.com/chat/?node=" id="fp-ctx-open-chat-link" target="_blank" style="display:flex;align-items:center;padding:0 10px;background:#1e2030;border:1px solid #2a2d44;border-radius:6px;color:#9099b8;text-decoration:none;font-size:12px;white-space:nowrap;">Открыть чат</a>
                </div>
                <div id="fp-ctx-chat-status" style="font-size:11px;color:#5a5f7a;margin-top:6px;min-height:16px;"></div>
            </div>`;
        document.body.appendChild(panel);

        document.getElementById('fp-ctx-chat-close').addEventListener('click', removeChatPanel);
        const ta     = document.getElementById('fp-ctx-chat-text');
        // Fix open-chat link with correct node
        try {
            const _ad = JSON.parse(document.body.dataset.appData || '{}');
            const _myId = String((Array.isArray(_ad) ? _ad[0] : _ad).userId || '');
            const _link = document.getElementById('fp-ctx-open-chat-link');
            if (_link && _myId && lot.sellerId) _link.href = `https://funpay.com/chat/?node=users-${_myId}-${lot.sellerId}`;
        } catch(_) {}
        const sendBt = document.getElementById('fp-ctx-chat-send');
        const status = document.getElementById('fp-ctx-chat-status');

        sendBt.addEventListener('mouseenter', () => sendBt.style.background = '#5d58f0');
        sendBt.addEventListener('mouseleave', () => sendBt.style.background = '#6B66FF');
        ta.addEventListener('keydown', e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); sendBt.click(); } });
        ta.focus();

        sendBt.addEventListener('click', async () => {
            const text = ta.value.trim();
            if (!text) { status.textContent = 'Введите сообщение'; return; }
            if (!lot.sellerId) { status.textContent = 'Нет данных о продавце'; return; }
            sendBt.disabled = true; sendBt.textContent = '...';
            status.textContent = 'Отправляем...';
            try {
                const raw = document.body.dataset.appData;
                if (!raw) throw new Error('Нет данных авторизации');
                const d = JSON.parse(raw);
                const appObj = Array.isArray(d) ? d[0] : d;
                const csrf = appObj['csrf-token'];
                const myId = String(appObj.userId || appObj.id || '');
                if (!myId) throw new Error('Не удалось определить ваш ID');
                const keyRes = await chrome.runtime.sendMessage({ action: 'getGoldenKey' });
                if (!keyRes?.success) throw new Error('Нет golden_key');

                // FunPay chat node format: "users-MYID-THEIRID"
                const chatNodeId = `users-${myId}-${lot.sellerId}`;
                const payload = {
                    objects: JSON.stringify([{ type: 'chat_node', id: chatNodeId, tag: '0', data: { node: chatNodeId, last_message: -1, content: '' } }]),
                    request: JSON.stringify({ action: 'chat_message', data: { node: chatNodeId, content: text } }),
                    csrf_token: csrf
                };
                const res = await fetch('https://funpay.com/runner/', {
                    method: 'POST',
                    headers: { 'content-type': 'application/x-www-form-urlencoded; charset=UTF-8', 'x-requested-with': 'XMLHttpRequest', 'cookie': `golden_key=${keyRes.key}` },
                    body: new URLSearchParams(payload)
                });
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                const result = await res.json();
                
                const chatObj = result?.objects?.find(o => o.type === 'chat_node' || o.type === 'chat_message');
                if (result?.error) throw new Error(result.error);

                status.style.color = '#4caf82';
                status.textContent = 'Сообщение отправлено ✓';
                ta.value = '';
                setTimeout(removeChatPanel, 2000);
            } catch (e) {
                status.style.color = '#e05252';
                status.textContent = `Ошибка: ${e.message}`;
                sendBt.disabled = false; sendBt.textContent = 'Отправить';
            }
        });
    }

    
    // FIX: Each pinned lot appears at the TOP of its own category's .tc table,
    // not in a global container. If lot1 was pinned from category "Minecraft",
    // it appears pinned inside the Minecraft .tc table on the page.
    function renderPinnedInTable() {
        // Remove all previously inserted pinned rows
        document.querySelectorAll('a.tc-item.fp-pinned-row').forEach(el => el.remove());
        if (!pinnedLots.length) return;

        pinnedLots.forEach(lot => {
            if (!lot.offerId) return;

            // Find the category table this lot belongs to.
            // Strategy: find a .tc-item whose href contains our offerId,
            // then get its parent .tc table. If not found on this page, skip.
            let targetTable = null;

            // Look for ANY .tc-item row with this offer id (it might be the lot itself)
            const existingRow = document.querySelector(`a.tc-item[href*="id=${lot.offerId}"]`);
            if (existingRow) {
                targetTable = existingRow.closest('.tc, .showcase-table, .tc-b-main');
            }

            // Fallback: if we stored the nodeId (category), find the .offer block for it
            if (!targetTable && lot.nodeId) {
                const catLink = document.querySelector(`a[href*="/lots/${lot.nodeId}/"], a[href*="/chips/${lot.nodeId}/"]`);
                if (catLink) {
                    const offerBlock = catLink.closest('.offer');
                    if (offerBlock) targetTable = offerBlock.querySelector('.tc, .tc-b-main');
                }
            }

            if (!targetTable) return; // This lot's category is not on the current page

            // Don't duplicate
            if (targetTable.querySelector(`[data-pinned-id="${lot.offerId}"]`)) return;

            const row = document.createElement('a');
            row.className = 'tc-item fp-pinned-row';
            row.href = lot.lotUrl;
            row.setAttribute('data-pinned-id', lot.offerId);
            row.style.cssText = 'display:flex;align-items:center;padding:8px 12px;background:rgba(107,102,255,0.06);border-left:2px solid #6B66FF;';

            // Clone original row's structure if we can find it
            const origRow = document.querySelector(`a.tc-item[href*="id=${lot.offerId}"]`);
            if (origRow) {
                // Use the real row's content, just add pinned indicator
                const clone = origRow.cloneNode(true);
                clone.classList.add('fp-pinned-row');
                clone.setAttribute('data-pinned-id', lot.offerId);
                clone.style.cssText = 'border-left:2px solid #6B66FF;background:rgba(107,102,255,0.05);';
                // Remove any existing pinned clone to avoid duplication
                targetTable.querySelector(`[data-pinned-id="${lot.offerId}"]`)?.remove();
                // Add unpin button to cloned price cell
                const priceEl = clone.querySelector('.tc-price');
                if (priceEl) {
                    const unpinBtn = document.createElement('button');
                    unpinBtn.innerHTML = '📌';
                    unpinBtn.title = 'Открепить';
                    unpinBtn.style.cssText = 'background:none;border:none;cursor:pointer;font-size:12px;padding:0 2px;opacity:0.6;';
                    unpinBtn.addEventListener('click', (e) => {
                        e.preventDefault(); e.stopPropagation();
                        pinnedLots = pinnedLots.filter(p => p.offerId !== lot.offerId);
                        savePinned(); renderPinnedInTable();
                    });
                    priceEl.appendChild(unpinBtn);
                }
                // Insert at top of table (after header row if present)
                const firstItem = targetTable.querySelector('a.tc-item:not(.fp-pinned-row), .tc-item:not(.fp-pinned-row)');
                if (firstItem) targetTable.insertBefore(clone, firstItem);
                else targetTable.appendChild(clone);
                return;
            }

            // Fallback: minimal row
            row.innerHTML = `
                <div class="tc-desc" style="flex:1;"><div class="tc-desc-text" style="color:#a09ef8;">📌 ${lot.title}</div></div>
                <div class="tc-price"><button data-unpin="${lot.offerId}" style="background:none;border:none;color:#3a3d52;cursor:pointer;font-size:14px;padding:0 4px;" title="Открепить">✕</button></div>`;
            row.querySelector('button').addEventListener('click', (e) => {
                e.preventDefault(); e.stopPropagation();
                pinnedLots = pinnedLots.filter(p => p.offerId !== lot.offerId);
                savePinned(); renderPinnedInTable();
            });
            const firstItem = targetTable.querySelector('a.tc-item:not(.fp-pinned-row)');
            if (firstItem) targetTable.insertBefore(row, firstItem);
            else targetTable.appendChild(row);
        });
    }

    
    document.addEventListener('contextmenu', (e) => {
        // _ctxInverted: true  → Shift+RMB = this menu, plain RMB = browser
        //              false → plain RMB = this menu, Shift+RMB = browser (default)
        const wantsMenu = _ctxInverted ? e.shiftKey : !e.shiftKey;
        if (!wantsMenu) { removeMenu(); return; }
        const lotEl = e.target.closest('a.tc-item, .tc-item');
        if (!lotEl) { removeMenu(); return; }
        e.preventDefault(); e.stopPropagation();
        const lot = parseLot(lotEl);
        if (!lot) return;
        showMenu(e.clientX, e.clientY, lot);
    }, true);

    document.addEventListener('click', (e) => { if (!e.target.closest(`#${MENU_ID}`)) removeMenu(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { removeMenu(); removeChatPanel(); } });

    // FIX: Don't call renderPinnedInTable() immediately — the lot rows (.tc-item)
    // aren't in the DOM yet at script execution time (FunPay renders them later).
    // Wait until at least one .tc-item appears, then render, then keep watching.
    function waitForLotsAndRender() {
        if (document.querySelector('a.tc-item')) {
            renderPinnedInTable();
            return;
        }
        // Watch for first .tc-item to appear
        const obs = new MutationObserver(() => {
            if (document.querySelector('a.tc-item')) {
                obs.disconnect();
                renderPinnedInTable();
            }
        });
        obs.observe(document.getElementById('content') || document.body, {
            childList: true,
            subtree: true
        });
        // Also set a fallback timeout just in case
        setTimeout(() => { obs.disconnect(); renderPinnedInTable(); }, 5000);
    }

    // Also re-render after SPA-style navigation (page content swap)
    const _navObs = new MutationObserver(() => {
        // If pinned rows disappeared (page changed), re-render them
        if (pinnedLots.length && !document.querySelector('a.tc-item.fp-pinned-row')) {
            setTimeout(renderPinnedInTable, 300);
        }
    });
    _navObs.observe(document.getElementById('content') || document.body, {
        childList: true,
        subtree: false
    });

})();