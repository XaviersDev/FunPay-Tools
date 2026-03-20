// content/features/order_enhancements.js — FunPay Tools 2.9
// Unconfirmed balance in stats • "Request review" button • Sales period filter • Order type labels

// ── 1. Unconfirmed balance display ──────────────────────────────────────────
async function initUnconfirmedBalance() {
    const { fpToolsShowUnconfirmed, fpToolsSalesData } = await chrome.storage.local.get([
        'fpToolsShowUnconfirmed', 'fpToolsSalesData'
    ]);
    if (fpToolsShowUnconfirmed === false) return;

    // Find the sales statistics block added by misc.js
    const statsBlock = document.getElementById('fp-tools-sales-stats-block');
    if (!statsBlock) return;

    // Calculate from stored data
    const orders = Object.values(fpToolsSalesData || {});
    const pending = orders.filter(o => o.orderStatus === 'paid');
    if (!pending.length) return;

    const pendingTotal = pending.reduce((s, o) => s + (o.price || 0), 0);
    const currency = pending[0]?.currency === 'USD' ? '$' : (pending[0]?.currency === 'EUR' ? '€' : '₽');

    // Find the "В ожидании" row and add the sum
    const rows = statsBlock.querySelectorAll('.fp-stat-row, .stat-row, [data-stat]');
    rows.forEach(row => {
        if (row.textContent.includes('В ожидании') || row.textContent.includes('ожидании')) {
            const sum = document.createElement('span');
            sum.style.cssText = 'color:#ff9800;font-size:11px;margin-left:6px;';
            sum.textContent = `(${Math.round(pendingTotal * 100) / 100} ${currency})`;
            row.appendChild(sum);
        }
    });

    // Also add standalone badge near balance in navbar
    const balEl = document.querySelector('.badge-balance, .navbar-balance, .user-balance-sum');
    if (balEl && pending.length > 0 && !document.getElementById('fp-pending-badge')) {
        const badge = document.createElement('span');
        badge.id = 'fp-pending-badge';
        badge.title = `${pending.length} неподтверждённых заказа(ов) на ${Math.round(pendingTotal)} ${currency}`;
        badge.style.cssText = 'font-size:11px;color:#ff9800;margin-left:4px;font-family:Inter,sans-serif;cursor:help;';
        badge.textContent = `+${Math.round(pendingTotal)} ${currency} ожид.`;
        balEl.parentElement?.insertBefore(badge, balEl.nextSibling);
    }
}

// ── 2. Sales period filter ───────────────────────────────────────────────────
function initSalesFilter() {
    // Only on /orders/trade page
    if (!window.location.pathname.includes('/orders/trade')) return;
    if (document.getElementById('fp-sales-filter')) return;

    // Wait for the FP Tools stats block to appear
    const statsBlock = document.getElementById('fp-tools-sales-block') ||
                       document.querySelector('.fp-tools-sales, [id*="sales"]');
    if (!statsBlock) return;

    const bar = document.createElement('div');
    bar.id = 'fp-sales-filter';
    bar.style.cssText = 'display:flex;gap:6px;margin-bottom:12px;flex-wrap:wrap;';

    const periods = [
        { label: 'Сегодня',  days: 1 },
        { label: 'Неделя',   days: 7 },
        { label: 'Месяц',    days: 30, default: true },
        { label: '3 месяца', days: 90 },
        { label: 'Год',      days: 365 },
        { label: 'Всё время',days: 99999 },
    ];

    periods.forEach(p => {
        const btn = document.createElement('button');
        btn.className = 'btn btn-default';
        btn.style.cssText = `padding:4px 10px;font-size:11px;font-weight:600;${p.default ? 'background:#252847;color:#a09ef8;border-color:#363a5a;' : ''}`;
        btn.textContent = p.label;
        btn.addEventListener('click', () => {
            bar.querySelectorAll('button').forEach(b => {
                b.style.background = ''; b.style.color = ''; b.style.borderColor = '';
            });
            btn.style.background = '#252847'; btn.style.color = '#a09ef8'; btn.style.borderColor = '#363a5a';
            applySalesPeriodFilter(p.days);
        });
        bar.appendChild(btn);
    });

    statsBlock.insertBefore(bar, statsBlock.firstChild);
    applySalesPeriodFilter(30); // Default: month
}

async function applySalesPeriodFilter(days) {
    const { fpToolsSalesData } = await chrome.storage.local.get('fpToolsSalesData');
    if (!fpToolsSalesData) return;

    const cutoff = days >= 99999 ? 0 : Date.now() - days * 86400000;
    const all    = Object.values(fpToolsSalesData);
    const filt   = all.filter(o => o.orderDate >= cutoff);

    const total    = filt.reduce((s, o) => s + (o.price || 0), 0);
    const closed   = filt.filter(o => o.orderStatus === 'closed').length;
    const pending  = filt.filter(o => o.orderStatus === 'paid');
    const refunded = filt.filter(o => o.orderStatus === 'refunded').length;
    const pendingAmt = pending.reduce((s, o) => s + (o.price || 0), 0);

    // Update stats display elements
    const elMap = {
        'fp-sales-total':    `${Math.round(total * 100) / 100} ₽`,
        'fp-sales-count':    String(filt.length),
        'fp-sales-closed':   String(closed),
        'fp-sales-pending':  `${pending.length} (${Math.round(pendingAmt)} ₽)`,
        'fp-sales-refunded': String(refunded),
    };

    Object.entries(elMap).forEach(([id, val]) => {
        const el = document.getElementById(id);
        if (el) el.textContent = val;
    });
}

// ── 3. "Request review" button on closed orders ──────────────────────────────
function initReviewRequestButtons() {
    if (!window.location.pathname.includes('/orders/')) return;

    const addButtons = () => {
        document.querySelectorAll('a.tc-item.success:not(.fp-rev-btn-added), a.tc-item:not(.fp-rev-btn-added)').forEach(row => {
            // Only for closed orders
            const statusEl = row.querySelector('.tc-status, [class*="status"]');
            const isClosed = row.classList.contains('success') ||
                (statusEl && statusEl.textContent.includes('Закрыт'));
            if (!isClosed) return;

            row.classList.add('fp-rev-btn-added');

            const btn = document.createElement('button');
            btn.style.cssText = `
                background:none;border:1px solid #22253a;border-radius:4px;
                color:#6B66FF;cursor:pointer;padding:2px 8px;font-size:11px;
                margin-left:6px;font-family:Inter,sans-serif;transition:background .15s;
                white-space:nowrap;flex-shrink:0;
            `;
            btn.textContent = '⭐ Попросить отзыв';
            btn.title = 'Отправить покупателю сообщение с просьбой оставить отзыв';
            btn.addEventListener('mouseenter', () => btn.style.background = '#1e2030');
            btn.addEventListener('mouseleave', () => btn.style.background = '');

            btn.addEventListener('click', async (e) => {
                e.preventDefault(); e.stopPropagation();

                const orderId = row.querySelector('.tc-order')?.textContent?.replace('#','') || '';
                const buyerEl = row.querySelector('.media-user-name span[data-href], .media-user-name a');
                const buyerHref = buyerEl?.getAttribute('data-href') || buyerEl?.getAttribute('href') || '';
                const buyerIdM = buyerHref.match(/\/users\/(\d+)/);
                const buyerId  = buyerIdM ? buyerIdM[1] : null;

                if (!buyerId || !orderId) {
                    showNotification('Не удалось найти данные заказа', true);
                    return;
                }

                const { fpToolsAutoReplies = {} } = await chrome.storage.local.get('fpToolsAutoReplies');
                const template = fpToolsAutoReplies.reviewRequestTemplate ||
                    `Привет! Буду рад, если оставите отзыв на наш заказ #${orderId} 🙏 Это займёт 10 секунд и очень поможет!`;

                if (!confirm(`Отправить покупателю:\n"${template}"`)) return;

                btn.textContent = '⏳'; btn.disabled = true;

                try {
                    const raw = document.body.dataset.appData;
                    const d = JSON.parse(raw);
                    const u = Array.isArray(d) ? d[0] : d;

                    const payload = {
                        objects: JSON.stringify([{
                            type: 'chat_node', id: buyerId, tag: '0',
                            data: { node: buyerId, last_message: -1, content: '' }
                        }]),
                        request: JSON.stringify({
                            action: 'chat_message',
                            data: { node: buyerId, content: template }
                        }),
                        csrf_token: u['csrf-token']
                    };

                    const res = await fetch('https://funpay.com/runner/', {
                        method: 'POST', credentials: 'include',
                        headers: {
                            'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
                            'X-Requested-With': 'XMLHttpRequest'
                        },
                        body: new URLSearchParams(payload)
                    });

                    if (!res.ok) throw new Error(`HTTP ${res.status}`);
                    showNotification('✓ Запрос на отзыв отправлен!');
                    btn.textContent = '✓ Отправлено';

                } catch (err) {
                    showNotification(`Ошибка: ${err.message}`, true);
                    btn.textContent = '⭐ Попросить отзыв';
                    btn.disabled = false;
                }
            });

            // Find a good place to put the button
            const priceEl = row.querySelector('.tc-price');
            if (priceEl) priceEl.parentElement?.insertBefore(btn, priceEl.nextSibling);
        });
    };

    addButtons();
    const obs = new MutationObserver(addButtons);
    obs.observe(document.getElementById('content') || document.body, { childList: true, subtree: true });
}

// ── 4. Payment type labels — handled by content_script.js initializePaymentTypeBadges ──

// ── Init all ─────────────────────────────────────────────────────────────────
function initOrderEnhancements() {
    if (window.location.pathname.includes('/orders/trade')) {
        setTimeout(initUnconfirmedBalance, 2000);
        setTimeout(initSalesFilter, 1000);
    }
    initReviewRequestButtons();
}

initOrderEnhancements();
