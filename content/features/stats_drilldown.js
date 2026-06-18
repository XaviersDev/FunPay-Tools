// content/features/stats_drilldown.js
// Делает карточки статистики кликабельными: по клику открывается модалка со
// СПИСКОМ ВСЕХ заказов за этой цифрой (не топ-10), с суммой, статусами и
// ссылками на FunPay. Работает и для продаж (/orders/trade), и для покупок
// (/orders/), источник данных берётся из window.fptOrdersDB.

(function () {
    'use strict';

    const SYM = { RUB: '₽', USD: '$', EUR: '€' };
    const RATES = { RUB: 0.011, USD: 1, EUR: 1.08 }; // грубо к USD, для сортировки по «дороговизне»

    function esc(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, c => (
            { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
        ));
    }

    function cfg() { return window.fptStatsCfg || null; }
    function db() { return window.fptOrdersDB || window.FPTSalesDB; }

    // Те же фильтры статусов, что и в остальных режимах.
    function statusFilters() {
        try {
            if (typeof window.fptGetStatsFilters === 'function') return window.fptGetStatsFilters();
        } catch (_) {}
        const purchases = !!cfg();
        return { stClosed: true, stPaid: true, stRefunded: !purchases };
    }
    function statusAllowed(st, flt) {
        if (st === 'refunded') return flt.stRefunded !== false;
        if (st === 'paid') return flt.stPaid !== false;
        if (st === 'closed') return flt.stClosed !== false;
        return true;
    }

    // Диапазон периода из селектора (MSK-день, как в displaySalesStats).
    function periodRange() {
        const sel = document.getElementById('fpTools-stats-period');
        const period = sel ? sel.value : 'all';
        const oneDay = 24 * 3600 * 1000;
        const MSK = 3 * 3600 * 1000;
        const now = Date.now();
        const todayStart = Math.floor((now + MSK) / oneDay) * oneDay - MSK;
        let start = null, end = null;
        switch (period) {
            case 'today': start = todayStart; break;
            case 'yesterday': end = todayStart; start = end - oneDay; break;
            case '24h': start = now - oneDay; break;
            case '7d': start = now - 7 * oneDay; break;
            case '30d': start = now - 30 * oneDay; break;
            case '365d': start = now - 365 * oneDay; break;
        }
        return { start, end };
    }

    function inRange(o, r) {
        if (r.start && o.orderDate < r.start) return false;
        if (r.end && o.orderDate > r.end) return false;
        return true;
    }

    function money(n, cur) {
        return `${Math.round(n).toLocaleString('ru-RU')} ${SYM[cur] || cur || ''}`;
    }

    // Сумма по валютам -> строка «1 234 ₽ · 56 $»
    function sumByCurrency(list, onlyValid) {
        const acc = {};
        for (const o of list) {
            if (onlyValid && !(o.orderStatus === 'closed' || o.orderStatus === 'paid')) continue;
            acc[o.currency] = (acc[o.currency] || 0) + (o.price || 0);
        }
        const parts = Object.entries(acc).filter(([, v]) => v > 0)
            .map(([c, v]) => money(v, c));
        return parts.length ? parts.join(' · ') : '0 ₽';
    }

    function orderRow(o) {
        const st = { closed: 'Закрыт', paid: 'Оплачен', refunded: 'Возврат' }[o.orderStatus] || o.orderStatus || '';
        const d = o.orderDate ? new Date(o.orderDate) : null;
        const dateStr = d ? d.toLocaleDateString('ru-RU') + ' ' + d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }) : '';
        const price = o.price != null ? money(o.price, o.currency) : '';
        const link = o.orderId ? `https://funpay.com/orders/${o.orderId}/` : null;
        const party = esc(o.buyerUsername || '-'); // на покупках это продавец
        const inner = `
            <div class="fpt-dd-row-top">
                <span class="fpt-dd-row-title">${esc(o.description || o.subcategoryName || 'Заказ')}</span>
                ${price ? `<span class="fpt-dd-row-price">${esc(price)}</span>` : ''}
            </div>
            <div class="fpt-dd-row-meta">
                <span>${party}</span>
                <span>${esc(o.subcategoryName || '')}</span>
                <span class="fpt-dd-st fpt-dd-st-${esc(o.orderStatus || '')}">${esc(st)}</span>
                <span>${esc(dateStr)}</span>
            </div>`;
        return link
            ? `<a class="fpt-dd-row" href="${link}" target="_blank" rel="noopener">${inner}</a>`
            : `<div class="fpt-dd-row">${inner}</div>`;
    }

    function ensureStyles() {
        if (document.getElementById('fpt-dd-styles')) return;
        const css = document.createElement('style');
        css.id = 'fpt-dd-styles';
        css.textContent = `
        .fpt-dd-overlay{position:fixed;inset:0;z-index:2147483600;display:flex;align-items:center;
            justify-content:center;background:rgba(8,9,14,0.62);backdrop-filter:blur(3px);
            animation:fptDdFade .15s ease;}
        @keyframes fptDdFade{from{opacity:0}to{opacity:1}}
        .fpt-dd-modal{width:min(680px,94vw);max-height:86vh;display:flex;flex-direction:column;
            background:var(--fpt-surface,#171922);color:var(--fpt-text,#e7e9f3);
            border:1px solid var(--fpt-border,rgba(255,255,255,0.1));border-radius:16px;
            box-shadow:0 20px 60px rgba(0,0,0,0.5);overflow:hidden;}
        .fpt-custom-theme-off .fpt-dd-modal{background:#fff;color:#1a1a1a;border-color:rgba(0,0,0,0.12);}
        .fpt-dd-head{display:flex;align-items:center;justify-content:space-between;gap:12px;
            padding:16px 18px;border-bottom:1px solid var(--fpt-border,rgba(255,255,255,0.08));}
        .fpt-dd-title{font-size:15px;font-weight:700;}
        .fpt-dd-sub{font-size:12px;color:var(--fpt-text-muted,#9099b8);margin-top:2px;}
        .fpt-dd-close{background:none;border:none;color:inherit;font-size:22px;line-height:1;
            cursor:pointer;opacity:.7;}
        .fpt-dd-close:hover{opacity:1;}
        .fpt-dd-tools{display:flex;gap:8px;padding:10px 18px 0;}
        .fpt-dd-search{flex:1;padding:8px 10px;border-radius:8px;font-size:13px;
            background:var(--fpt-surface-2,#20222e);color:var(--fpt-text,#fff);
            border:1px solid var(--fpt-border,#22253a);}
        .fpt-custom-theme-off .fpt-dd-search{background:#f3f3f5;color:#1a1a1a;border-color:#ddd;}
        .fpt-dd-sort{padding:8px 10px;border-radius:8px;font-size:13px;
            background:var(--fpt-surface-2,#20222e);color:var(--fpt-text,#fff);
            border:1px solid var(--fpt-border,#22253a);cursor:pointer;}
        .fpt-custom-theme-off .fpt-dd-sort{background:#f3f3f5;color:#1a1a1a;border-color:#ddd;}
        .fpt-dd-list{padding:12px 18px 18px;overflow-y:auto;display:flex;flex-direction:column;gap:8px;}
        .fpt-dd-row{display:block;text-decoration:none;background:var(--fpt-surface-2,#20222e);
            border:1px solid var(--fpt-border,#22253a);border-radius:10px;padding:9px 11px;color:inherit;}
        .fpt-custom-theme-off .fpt-dd-row{background:#f7f7f9;border-color:#e3e3e8;}
        a.fpt-dd-row:hover{border-color:var(--fpt-accent,#ff6d15);}
        .fpt-dd-row-top{display:flex;justify-content:space-between;gap:8px;align-items:baseline;}
        .fpt-dd-row-title{font-size:12.5px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
        .fpt-dd-row-price{font-size:12.5px;font-weight:700;color:var(--fpt-accent,#ff6d15);white-space:nowrap;}
        .fpt-dd-row-meta{display:flex;flex-wrap:wrap;gap:4px 12px;margin-top:5px;font-size:11px;
            color:var(--fpt-text-muted,#9099b8);}
        .fpt-dd-st{font-weight:600;}
        .fpt-dd-st-closed{color:#3ad07a;} .fpt-dd-st-paid{color:#4aa3ff;} .fpt-dd-st-refunded{color:#ff6b6b;}
        .fpt-dd-empty{padding:24px;text-align:center;color:var(--fpt-text-muted,#9099b8);font-size:13px;}
        .fp-stat-card{cursor:pointer;transition:transform .08s ease,box-shadow .12s ease;}
        .fp-stat-card:hover{transform:translateY(-1px);box-shadow:0 6px 18px rgba(0,0,0,0.18);}
        .fpt-dd-hint{font-size:10px;color:var(--fpt-text-muted,#9099b8);opacity:.7;margin-top:6px;}
        `;
        document.head.appendChild(css);
    }

    let _list = []; // текущий показанный список (для сортировки/поиска)
    let _titleBase = '';

    function renderList(container, list, sortMode, query) {
        let arr = list.slice();
        if (query) {
            const q = query.toLowerCase();
            arr = arr.filter(o =>
                (o.description || '').toLowerCase().includes(q) ||
                (o.buyerUsername || '').toLowerCase().includes(q) ||
                (o.subcategoryName || '').toLowerCase().includes(q)
            );
        }
        const valUSD = o => (o.price || 0) * (RATES[o.currency] || 0);
        if (sortMode === 'price-desc') arr.sort((a, b) => valUSD(b) - valUSD(a));
        else if (sortMode === 'price-asc') arr.sort((a, b) => valUSD(a) - valUSD(b));
        else if (sortMode === 'date-asc') arr.sort((a, b) => (a.orderDate || 0) - (b.orderDate || 0));
        else arr.sort((a, b) => (b.orderDate || 0) - (a.orderDate || 0)); // date-desc
        container.innerHTML = arr.length
            ? arr.map(orderRow).join('')
            : `<div class="fpt-dd-empty">Ничего не найдено.</div>`;
    }

    function openModal(title, subtitle, list) {
        ensureStyles();
        _list = list;
        _titleBase = title;
        const old = document.getElementById('fpt-dd-overlay');
        if (old) old.remove();

        const overlay = document.createElement('div');
        overlay.id = 'fpt-dd-overlay';
        overlay.className = 'fpt-dd-overlay';
        overlay.innerHTML = `
            <div class="fpt-dd-modal" role="dialog" aria-modal="true">
                <div class="fpt-dd-head">
                    <div>
                        <div class="fpt-dd-title">${esc(title)}</div>
                        <div class="fpt-dd-sub">${esc(subtitle)}</div>
                    </div>
                    <button class="fpt-dd-close" title="Закрыть">×</button>
                </div>
                <div class="fpt-dd-tools">
                    <input class="fpt-dd-search" type="text" placeholder="Поиск: товар, продавец, категория…" autocomplete="off">
                    <select class="fpt-dd-sort">
                        <option value="date-desc">Сначала новые</option>
                        <option value="date-asc">Сначала старые</option>
                        <option value="price-desc">Дороже сверху</option>
                        <option value="price-asc">Дешевле сверху</option>
                    </select>
                </div>
                <div class="fpt-dd-list" id="fpt-dd-list"></div>
            </div>`;
        document.body.appendChild(overlay);

        const listEl = overlay.querySelector('#fpt-dd-list');
        const searchEl = overlay.querySelector('.fpt-dd-search');
        const sortEl = overlay.querySelector('.fpt-dd-sort');
        const rerender = () => renderList(listEl, _list, sortEl.value, searchEl.value.trim());
        rerender();

        searchEl.addEventListener('input', rerender);
        sortEl.addEventListener('change', rerender);

        const close = () => overlay.remove();
        overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
        overlay.querySelector('.fpt-dd-close').addEventListener('click', close);
        document.addEventListener('keydown', function onEsc(e) {
            if (e.key === 'Escape') { close(); document.removeEventListener('keydown', onEsc); }
        });
    }

    // Собирает заказы по предикату + период + (опц.) фильтры статусов.
    async function collect(predicate, applyStatusFilter) {
        const all = await db().getAllAsArray();
        const r = periodRange();
        const flt = statusFilters();
        return all.filter(o => {
            if (!inRange(o, r)) return false;
            if (applyStatusFilter && !statusAllowed(o.orderStatus, flt)) return false;
            return predicate(o);
        });
    }

    function periodLabel() {
        const sel = document.getElementById('fpTools-stats-period');
        const map = { today: 'за сегодня', yesterday: 'за вчера', '24h': 'за 24 часа',
            '7d': 'за неделю', '30d': 'за месяц', '365d': 'за год', all: 'за всё время' };
        return map[sel ? sel.value : 'all'] || '';
    }

    // Описание карточек: id -> { title, predicate, onlyValid, moneyMode }
    function cardDefs() {
        const c = cfg();
        const moneyWord = (c && c.totalMoneyLabel) || 'Всего заработано';
        const valid = o => o.orderStatus === 'closed' || o.orderStatus === 'paid';
        return {
            'fpTools-stats-total-revenue': {
                title: moneyWord,
                predicate: o => valid(o),
                applyStatusFilter: true,
                summary: list => `${list.length} заказ. · ${sumByCurrency(list, true)}`
            },
            'fpTools-stats-total-orders': {
                title: (c ? 'Все покупки' : 'Все заказы'),
                predicate: () => true,
                applyStatusFilter: true,
                summary: list => `${list.length} заказ. · ${sumByCurrency(list, true)}`
            },
            'fpTools-stats-average-sale-price': {
                title: 'Средний чек — все учтённые заказы',
                predicate: o => valid(o),
                applyStatusFilter: true,
                summary: list => `${list.length} заказ. · ${sumByCurrency(list, true)}`
            },
            'fpTools-stats-orders-closed': {
                title: 'Закрытые заказы',
                predicate: o => o.orderStatus === 'closed',
                applyStatusFilter: false,
                summary: list => `${list.length} заказ. · ${sumByCurrency(list, true)}`
            },
            'fpTools-stats-orders-pending': {
                title: 'В ожидании (оплачены, не подтверждены)',
                predicate: o => o.orderStatus === 'paid',
                applyStatusFilter: false,
                summary: list => `${list.length} заказ. · ${sumByCurrency(list, true)}`
            },
            'fpTools-stats-orders-refund': {
                title: 'Возвраты',
                predicate: o => o.orderStatus === 'refunded',
                applyStatusFilter: false,
                summary: list => `${list.length} заказ. · ${sumByCurrency(list, false)}`
            }
        };
    }

    async function openCard(id) {
        const defs = cardDefs();
        const def = defs[id];
        if (!def) return;
        const list = await collect(def.predicate, def.applyStatusFilter);
        const subtitle = `${periodLabel()} · ${def.summary(list)}`;
        openModal(def.title, subtitle, list);
    }

    function wire() {
        const cardsHost = document.getElementById('fpTools-stats-cards');
        if (!cardsHost || cardsHost.dataset.ddWired) return;
        cardsHost.dataset.ddWired = '1';
        ensureStyles();

        const defs = cardDefs();
        Object.keys(defs).forEach(valueId => {
            const valueEl = document.getElementById(valueId);
            if (!valueEl) return;
            const card = valueEl.closest('.fp-stat-card') || valueEl;
            card.style.cursor = 'pointer';
            card.title = 'Показать все заказы за этой цифрой';
            if (card.dataset.ddBound) return;
            card.dataset.ddBound = '1';
            card.addEventListener('click', () => openCard(valueId));
        });
    }

    // Карточки появляются асинхронно (displaySalesStats). Ждём их и привязываемся.
    function boot() {
        // первая попытка + наблюдатель за появлением/перерисовкой карточек
        const tryWire = () => { try { wire(); } catch (_) {} };
        tryWire();
        const host = document.getElementById('fpTools-stats-cards')
            || document.querySelector('.fp-tools-stats-container');
        if (host) {
            const mo = new MutationObserver(() => tryWire());
            mo.observe(document.body, { childList: true, subtree: true });
        }
        // подстраховка: периодически в первые секунды
        let n = 0;
        const iv = setInterval(() => { tryWire(); if (++n > 20) clearInterval(iv); }, 500);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot);
    } else {
        boot();
    }
})();
