// content/features/buyer_history.js

let _bhCache = {};

async function loadBuyerHistory(buyerUsername) {
    if (!buyerUsername) return [];
    const cached = _bhCache[buyerUsername];
    if (cached && Date.now() - cached.t < 5 * 60 * 1000) return cached.orders;

    try {
        const data = await chrome.storage.local.get('fpToolsSalesData');
        const allOrders = data.fpToolsSalesData ? Object.values(data.fpToolsSalesData) : [];
        const localOrders = allOrders
            .filter(o => o.buyerUsername && o.buyerUsername.toLowerCase() === buyerUsername.toLowerCase())
            .sort((a, b) => (b.orderDate || 0) - (a.orderDate || 0))
            .slice(0, 30)
            .map(o => ({
                orderId: o.orderId,
                desc: o.description || o.subcategoryName || '',
                price: o.price ? `${o.price} ${o.currency || '₽'}` : '',
                date: o.orderDateText || o.orderDate || ''
            }));
        if (localOrders.length > 0) {
            _bhCache[buyerUsername] = { orders: localOrders, t: Date.now() };
            return localOrders;
        }
    } catch (_) {}

    try {
        const url = `https://funpay.com/orders/trade?buyer=${encodeURIComponent(buyerUsername)}`;
        const res = await fetch(url, { method: 'GET', credentials: 'include' });
        if (!res.ok) return [];
        const html = await res.text();

        const orders = await Promise.race([
            new Promise(r => chrome.runtime.sendMessage(
                { target: 'offscreen', action: 'parseBuyerHistory', html, buyerUserId: buyerUsername },
                d => r(d || [])
            )),
            new Promise(r => setTimeout(() => r([]), 8000))
        ]);

        if (orders.length > 0) {
            _bhCache[buyerUsername] = { orders, t: Date.now() };
        }
        return orders;
    } catch (_) { return []; }
}

function renderHistoryPanel(orders, name, anchor) {
    document.getElementById('fp-buyer-hist-panel')?.remove();

    const total = orders.reduce((s, o) => {
        const num = parseFloat((o.price || '').replace(/[^\d.]/g, ''));
        return s + (isNaN(num) ? 0 : num);
    }, 0);

    const panel = document.createElement('div');
    panel.id = 'fp-buyer-hist-panel';
    panel.className = 'fp-buyer-hist-panel';

    panel.innerHTML = `
        <div class="fp-bh-header">
            <div class="fp-bh-title">
                <span class="fp-bh-icon">📦</span>
                <span>История покупок <strong>${name}</strong></span>
            </div>
            <button class="fp-bh-close" title="Закрыть">✕</button>
        </div>
        <div class="fp-bh-meta">${orders.length} заказ${orders.length === 1 ? '' : (orders.length < 5 ? 'а' : 'ов')} · ~${Math.round(total).toLocaleString('ru')} ₽</div>
        <div class="fp-bh-list">
            ${orders.slice(0, 20).map(o => `
                <a href="https://funpay.com/orders/${o.orderId}/" target="_blank" class="fp-bh-item">
                    <div class="fp-bh-item-desc">${o.desc || o.orderId}</div>
                    <div class="fp-bh-item-meta">
                        <span class="fp-bh-price">${o.price}</span>
                        <span class="fp-bh-dot">·</span>
                        <span class="fp-bh-date">${o.date}</span>
                    </div>
                </a>`).join('')}
        </div>`;

    panel.querySelector('.fp-bh-close').addEventListener('click', () => panel.remove());
    anchor.style.position = 'relative';
    anchor.appendChild(panel);

    setTimeout(() => {
        const handler = (e) => {
            if (!panel.contains(e.target) && !e.target.closest('#fp-buyer-hist-menu-btn')) {
                panel.remove();
                document.removeEventListener('click', handler);
            }
        };
        document.addEventListener('click', handler);
    }, 0);
}

// ─── Translation engine ────────────────────────────────────────────────────────

async function translateText(text) {
    if (!text.trim()) return null;
    const url = 'https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=ru&dt=t&q=' + encodeURIComponent(text);
    try {
        const res = await fetch(url);
        const json = await res.json();
        const result = json[0].map(s => s[0]).join('');
        return result === text ? null : result;
    } catch (_) { return null; }
}

async function appendTranslation(msgTextEl) {
    if (msgTextEl.dataset.fpTransDone) return;
    msgTextEl.dataset.fpTransDone = '1';

    const orig = msgTextEl.innerText.trim();
    if (!orig || orig.length < 3) return;

    const translated = await translateText(orig);
    if (!translated) return;

    const wrap = document.createElement('div');
    wrap.className = 'fp-trans-wrap';
    wrap.innerHTML =
        '<div class="fp-trans-divider"></div>' +
        '<div class="fp-trans-text">' + translated + '</div>';

    msgTextEl.appendChild(wrap);
}

function removeAllTranslations() {
    document.querySelectorAll('.fp-trans-wrap').forEach(el => el.remove());
    document.querySelectorAll('[data-fp-trans-done]').forEach(el => delete el.dataset.fpTransDone);
}

let _translateMode = false;
let _chatObserver  = null;

function startRealtimeTranslation() {
    const list = document.querySelector('.chat-message-list');
    if (!list) return;

    list.querySelectorAll('.chat-msg-text').forEach(appendTranslation);

    _chatObserver = new MutationObserver((muts) => {
        for (const mut of muts) {
            for (const node of mut.addedNodes) {
                if (node.nodeType !== 1) continue;
                const els = node.matches?.('.chat-msg-text')
                    ? [node]
                    : [...(node.querySelectorAll?.('.chat-msg-text') || [])];
                els.forEach(appendTranslation);
            }
        }
    });
    _chatObserver.observe(list, { childList: true, subtree: true });
}

function stopRealtimeTranslation() {
    _chatObserver?.disconnect();
    _chatObserver = null;
    removeAllTranslations();
}

(function injectTranslateStyles() {
    if (document.getElementById('fp-trans-styles')) return;
    const s = document.createElement('style');
    s.id = 'fp-trans-styles';
    s.textContent = `
        .fp-trans-divider {
            margin: 5px 0 4px;
            border-top: 1px solid rgba(255,255,255,0.08);
        }
        .fp-trans-text {
            color: rgba(200,202,220,0.55);
            font-size: 0.92em;
            line-height: 1.4;
            word-break: break-word;
        }
    `;
    document.head.appendChild(s);
})();

// ─── Внедрение кнопок в НАСТОЯЩЕЕ ТРОЕТОЧИЕ FunPay ────────────────────────────

function attachChatMenuItems(chatHeader) {
    if (!chatHeader || chatHeader.dataset.fpHistAttached) return;

    const chatEl = chatHeader.closest(".chat") || chatHeader.parentElement?.closest(".chat");
    const buyerUserId = chatEl?.dataset?.user;
    if (!buyerUserId) return;

    const userLink = chatHeader.querySelector(".media-user-name a[href*=\"/users/\"]");
    const buyerName = userLink ? userLink.textContent.trim() : "Покупатель";

    const tryInject = () => {
        // Ищем родное выпадающее меню FunPay (находится в .chat-header-controls .dropdown-menu)
        const menu = chatHeader.querySelector('.dropdown-menu');
        if (!menu) { setTimeout(tryInject, 200); return; }
        if (menu.querySelector('#fp-buyer-hist-menu-btn')) return;

        chatHeader.dataset.fpHistAttached = 'true';

        menu.insertAdjacentHTML('beforeend', '<li class="divider" style="margin:4px 0;"></li>');

        // 1. История покупок
        const histLi = document.createElement('li');
        histLi.innerHTML = '<a href="#" id="fp-buyer-hist-menu-btn">📦 История покупок</a>';
        histLi.querySelector('a').addEventListener('click', async (e) => {
            e.preventDefault();
            const a = e.currentTarget;
            const _ulink = chatHeader.querySelector('.media-user-name a[href*="/users/"]');
            const _name = _ulink ? _ulink.textContent.trim() : '';
            if (!_name) { if (typeof showNotification === 'function') showNotification('Не удалось определить покупателя'); return; }
            document.getElementById('fp-buyer-hist-panel')?.remove();
            a.textContent = '⏳ Загрузка...';
            const orders = await loadBuyerHistory(_name);
            a.textContent = '📦 История покупок';
            if (!orders || !orders.length) {
                if (typeof showNotification === 'function') showNotification('Покупок у этого покупателя не найдено');
                return;
            }
            renderHistoryPanel(orders, _name, chatHeader);
        });
        menu.appendChild(histLi);

        // 2. Режим перевода
        const transLi = document.createElement('li');
        transLi.innerHTML = '<a href="#" id="fp-translate-menu-btn">🌐 Включить перевод</a>';
        transLi.querySelector('a').addEventListener('click', (e) => {
            e.preventDefault();
            const a = e.currentTarget;
            _translateMode = !_translateMode;
            if (_translateMode) {
                a.textContent = '🌐 Выключить перевод';
                startRealtimeTranslation();
            } else {
                a.textContent = '🌐 Включить перевод';
                stopRealtimeTranslation();
            }
        });
        menu.appendChild(transLi);

        // 3. Экспорт чата
        const exportLi = document.createElement('li');
        exportLi.innerHTML = '<a href="#" id="fp-export-chat-menu-btn">💾 Экспортировать чат</a>';
        exportLi.querySelector('a').addEventListener('click', (e) => {
            e.preventDefault();
            const msgs = [];
            document.querySelectorAll('.chat-msg-item').forEach(item => {
                const author = item.querySelector('.chat-msg-author-link')?.textContent.trim() || 'System';
                const text   = item.querySelector('.chat-msg-text')?.textContent.trim() || '';
                const date   = item.querySelector('.chat-msg-date')?.textContent.trim() || '';
                if (text) msgs.push(`[${date}] ${author}: ${text}`);
            });
            if (!msgs.length) { if (typeof showNotification === 'function') showNotification('Нет сообщений для экспорта', true); return; }
            const partner = chatHeader.querySelector('.media-user-name a')?.textContent.trim() || 'chat';
            const dateStr = new Date().toISOString().slice(0, 10);
            const blob = new Blob([msgs.join('\n')], { type: 'text/plain;charset=utf-8' });
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = `funpay_chat_${partner}_${dateStr}.txt`;
            a.click();
            URL.revokeObjectURL(a.href);
            if (typeof showNotification === 'function') showNotification('Чат экспортирован ✓');
        });
        menu.appendChild(exportLi);

        // 4. Добавить в ЧС
        const blLi = document.createElement('li');
        blLi.innerHTML = '<a href="#" id="fp-blacklist-menu-btn" style="color: #ff5c5c;">🚫 Добавить в ЧС</a>';
        blLi.querySelector('a').addEventListener('click', (e) => {
            e.preventDefault();
            if (typeof addToBlacklistFromChat === 'function') {
                addToBlacklistFromChat(buyerName);
            } else {
                if (typeof showNotification === 'function') showNotification('Модуль черного списка загружается...', true);
            }
        });
        menu.appendChild(blLi);
    };

    tryInject();
}

// ─── Init ─────────────────────────────────────────────────────────────────────

let _bhObsActive = false;
function initBuyerHistoryObserver() {
    if (_bhObsActive) return;
    _bhObsActive = true;

    document.querySelectorAll('#fp-buyer-hist-btn').forEach(el => el.remove());
    document.querySelectorAll('.chat-header, .chat-full-header').forEach(attachChatMenuItems);

    const root = document.getElementById('content') || document.body;
    new MutationObserver((muts) => {
        for (const mut of muts) {
            for (const node of mut.addedNodes) {
                if (node.nodeType !== 1) continue;
                const headers = node.matches?.('.chat-header, .chat-full-header')
                    ? [node]
                    : [...(node.querySelectorAll?.('.chat-header, .chat-full-header') || [])];
                headers.forEach(attachChatMenuItems);
            }
        }
    }).observe(root, { childList: true, subtree: true });
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initBuyerHistoryObserver);
} else {
    initBuyerHistoryObserver();
}