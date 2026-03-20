// content/features/order_page_enhancements.js

function _throttle(fn, ms) {
    let t = 0;
    return (...args) => {
        const now = Date.now();
        if (now - t < ms) return;
        t = now;
        fn(...args);
    };
}

function addOrderStatusBadge() {
    const statusEl = document.querySelector('.order-status, .tc-status');
    if (!statusEl) return;
    const t = statusEl.textContent.trim().toLowerCase();
    let color = '';
    if (t.includes('оплачен'))    color = '#ff9800';
    if (t.includes('выполнен'))   color = '#4caf82';
    if (t.includes('возврат'))    color = '#e05252';
    if (color) statusEl.style.cssText += `;color:${color}!important;font-weight:700;`;
}

let _colorCodingActive = false;
function initChatListColorCoding() {
    if (!window.location.pathname.startsWith('/chat/')) return;

    if (!document.getElementById('fp-chat-colors')) {
        const style = document.createElement('style');
        style.id = 'fp-chat-colors';
        style.textContent = `
            .contact-item.fp-sc-paid    .media-user-name::after { content:' 🟠'; font-size:10px; }
            .contact-item.fp-sc-done    .media-user-name::after { content:' ✅'; font-size:10px; }
            .contact-item.fp-sc-refund  .media-user-name::after { content:' 🔴'; font-size:10px; }
        `;
        document.head.appendChild(style);
    }

    _colorItems();

    if (!_colorCodingActive) {
        _colorCodingActive = true;
        const list = document.querySelector('.contact-list, .chat-sidebar');
        if (list) {
            new MutationObserver(_throttle(_colorItems, 500))
                .observe(list, { childList: true, subtree: true });
        }
    }
}

function _colorItems() {
    document.querySelectorAll('.contact-item:not(.fp-sc)').forEach(item => {
        item.classList.add('fp-sc');
        const t = item.querySelector('.contact-item-message')?.textContent || '';
        if (/оплатил заказ/i.test(t))               item.classList.add('fp-sc-paid');
        else if (/подтвердил.*выполнение/i.test(t)) item.classList.add('fp-sc-done');
        else if (/вернул деньги/i.test(t))          item.classList.add('fp-sc-refund');
    });
}

function showDearVendorsBanner() {
    if (document.getElementById('fp-dear-vendors-banner')) return;
    const banner = document.createElement('div');
    banner.id = 'fp-dear-vendors-banner';
    banner.style.cssText = `
        position:fixed;top:70px;left:50%;transform:translateX(-50%);
        background:#2a1a1a;border:1px solid #e05252;border-radius:8px;
        padding:10px 18px;z-index:9999;font-family:Inter,sans-serif;
        font-size:13px;color:#ff8a80;display:flex;align-items:center;gap:10px;
        box-shadow:0 4px 16px rgba(0,0,0,0.5);max-width:600px;
    `;
    banner.innerHTML = `<span style="font-size:18px;">⚠️</span><span><strong>Системное сообщение FunPay</strong> — это предупреждение от администрации, не от покупателя.</span><button onclick="this.parentElement.remove()" style="background:none;border:none;color:#e05252;cursor:pointer;font-size:16px;margin-left:auto;padding:0 0 0 8px;">✕</button>`;
    document.body.appendChild(banner);
    setTimeout(() => banner?.remove(), 8000);
}

chrome.runtime.onMessage.addListener((request) => {
    if (request.action === 'fpToolsDearVendors') showDearVendorsBanner();
});

let _priceEditInit = false;
function initQuickPriceEdit() {
    if (!window.location.pathname.includes('/trade')) return;

    document.querySelectorAll('a.tc-item:not([data-fp-pe])').forEach(row => {
        row.setAttribute('data-fp-pe', '1');
        const priceEl = row.querySelector('.tc-price, .tc-price-inside');
        const offerMatch = row.getAttribute('href')?.match(/id=(\d+)/);
        if (!priceEl || !offerMatch) return;
        const offerId = offerMatch[1];

        const editBtn = document.createElement('span');
        editBtn.style.cssText = 'display:none;font-size:11px;color:#6B66FF;cursor:pointer;margin-left:4px;vertical-align:middle;user-select:none;';
        editBtn.textContent = '✎';
        editBtn.title = 'Быстро изменить цену';
        priceEl.appendChild(editBtn);

        row.addEventListener('mouseenter', () => editBtn.style.display = 'inline');
        row.addEventListener('mouseleave', (e) => { if (!e.relatedTarget?.closest('#fp-price-popup')) editBtn.style.display = 'none'; });

        editBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            row.setAttribute('data-fp-pe-editing', '1');
            openPricePopup(offerId, priceEl.textContent.replace(/[^\d.,]/g,'').trim(), row);
        });
        row.addEventListener('click', (e) => {
            if (row.getAttribute('data-fp-pe-editing')) {
                e.preventDefault();
                e.stopPropagation();
                row.removeAttribute('data-fp-pe-editing');
            }
        }, true);
    });
}

function openPricePopup(offerId, currentPrice, anchor) {
    document.getElementById('fp-price-popup')?.remove();
    const popup = document.createElement('div');
    popup.id = 'fp-price-popup';
    const rect = anchor.getBoundingClientRect();
    popup.style.cssText = `position:fixed;left:${Math.min(rect.right+8, window.innerWidth-200)}px;top:${rect.top}px;background:#13141a;border:1px solid #22253a;border-radius:8px;padding:12px;z-index:10000;box-shadow:0 8px 24px rgba(0,0,0,0.5);font-family:Inter,sans-serif;width:176px;`;
    popup.innerHTML = `<div style="font-size:10px;color:#5a5f7a;margin-bottom:6px;font-weight:700;text-transform:uppercase;">Цена</div><input id="fp-pe-input" type="number" step="0.01" value="${parseFloat(currentPrice)||''}" style="width:100%;background:#0e0f16;border:1px solid #22253a;border-radius:5px;padding:6px;color:#d8dae8;font-size:13px;outline:none;font-family:inherit;margin-bottom:8px;"><div style="display:flex;gap:6px;"><button id="fp-pe-save" style="flex:1;background:#6B66FF;border:none;color:#fff;border-radius:5px;padding:6px;font-size:12px;cursor:pointer;font-weight:600;">Сохранить</button><button id="fp-pe-cancel" style="background:#1e2030;border:1px solid #2a2d44;color:#9099b8;border-radius:5px;padding:6px 8px;font-size:12px;cursor:pointer;">✕</button></div><div id="fp-pe-status" style="font-size:11px;margin-top:6px;min-height:14px;color:#5a5f7a;"></div>`;
    document.body.appendChild(popup);

    const input = popup.querySelector('#fp-pe-input');
    input.focus(); input.select();
    popup.querySelector('#fp-pe-cancel').addEventListener('click', () => popup.remove());

    const closeHandler = (e) => { if (!popup.contains(e.target) && !anchor.contains(e.target)) { popup.remove(); document.removeEventListener('click', closeHandler); } };
    setTimeout(() => document.addEventListener('click', closeHandler), 10);

    popup.querySelector('#fp-pe-save').addEventListener('click', async () => {
        const price = parseFloat(input.value);
        if (isNaN(price) || price <= 0) { popup.querySelector('#fp-pe-status').textContent = 'Неверная цена'; return; }
        const saveBtn = popup.querySelector('#fp-pe-save');
        saveBtn.textContent = '...'; saveBtn.disabled = true;
        popup.querySelector('#fp-pe-status').textContent = 'Сохраняем...';
        try {
            const res = await chrome.runtime.sendMessage({ action: 'saveSingleLot', data: { offer_id: offerId, price: String(price) } });
            if (res?.success) {
                popup.querySelector('#fp-pe-status').style.color = '#4caf82';
                popup.querySelector('#fp-pe-status').textContent = '✓ Сохранено';
                const priceNum = anchor.querySelector('.tc-price, .tc-price-inside');
                if (priceNum) {
                    const unit = priceNum.querySelector('.unit');
                    priceNum.textContent = `${price} `;
                    if (unit) priceNum.appendChild(unit);
                }
                setTimeout(() => popup.remove(), 1000);
            } else throw new Error(res?.error || 'Ошибка');
        } catch (e) {
            popup.querySelector('#fp-pe-status').style.color = '#e05252';
            popup.querySelector('#fp-pe-status').textContent = e.message;
            saveBtn.textContent = 'Сохранить'; saveBtn.disabled = false;
        }
    });
    input.addEventListener('keydown', e => { if (e.key === 'Enter') popup.querySelector('#fp-pe-save').click(); if (e.key === 'Escape') popup.remove(); });
}

function initOfferListFilter() {
    const offerBlocks = document.querySelectorAll('.offer');
    if (!offerBlocks.length || document.getElementById('fp-offer-filter')) return;

    const bar = document.createElement('div');
    bar.id = 'fp-offer-filter';
    bar.style.cssText = 'display:flex;gap:6px;margin:8px 0;flex-wrap:wrap;font-family:Inter,sans-serif;';

    const filters = [
        { label: 'Все',          fn: () => true },
        { label: '⚡ Автовыдача', fn: b => b.querySelectorAll('a.tc-item .auto-dlv-icon, a.tc-item i.auto-dlv-icon').length > 0 },
    ];

    let active = 0;
    filters.forEach(({ label, fn }, i) => {
        const btn = document.createElement('button');
        btn.className = 'btn btn-default';
        btn.style.cssText = 'padding:4px 10px;font-size:11px;font-weight:700;';
        btn.textContent = label;
        if (i === 0) { btn.style.background = '#252847'; btn.style.color = '#a09ef8'; }
        btn.addEventListener('click', () => {
            bar.querySelectorAll('button').forEach(b => { b.style.background=''; b.style.color=''; });
            btn.style.background = '#252847'; btn.style.color = '#a09ef8';
            active = i;
            offerBlocks.forEach(b => { b.style.display = fn(b) ? '' : 'none'; });
        });
        bar.appendChild(btn);
    });
    
    const parent = offerBlocks[0].parentElement;
    parent?.insertBefore(bar, offerBlocks[0]);
}

function initAllOrderEnhancements() {
    if (window.location.pathname.startsWith('/chat/') || window.location.pathname.includes('/orders/')) {
        addOrderStatusBadge();
        initChatListColorCoding();
    }
    if (window.location.pathname.match(/\/users\/\d+/) || window.location.pathname.startsWith('/lots/')) {
        initQuickPriceEdit();
        initOfferListFilter();
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAllOrderEnhancements);
} else {
    initAllOrderEnhancements();
}

const _oeContent = document.getElementById('content') || document.body;
new MutationObserver(_throttle(() => {
    initChatListColorCoding();
    initQuickPriceEdit();
    initOfferListFilter();
}, 800)).observe(_oeContent, { childList: true, subtree: false });