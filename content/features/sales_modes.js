// content/features/sales_modes.js
// Несколько режимов отображения статистики продаж на /orders/trade:
//   cards (стандартные карточки - управляется ui_enhancements),
//   charts (линия выручки + столбцы заказов по дням),
//   diagrams (круговые: по категориям, по статусам, по валютам),
//   detailed (топ покупателей/товаров/категорий - таблицы),
//   full (всё сразу).
// Цвета - из живой палитры (--fpt-*).

(function () {
    'use strict';

    const MODE_KEY = 'fpToolsStatsViewMode';
    const PALETTE = ['#C026D3', '#7c3aed', '#2563eb', '#059669', '#d97706', '#dc2626', '#0891b2', '#db2777', '#65a30d', '#9333ea'];

    function esc(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, ch => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        }[ch]));
    }

    const SYMBOLS = { RUB: '₽', USD: '$', EUR: '€' };
    function money(v, cur) { return `${Math.round((v || 0)).toLocaleString('ru-RU')} ${SYMBOLS[cur] || cur || '₽'}`; }

    // период из выпадающего списка статистики
    function getPeriodRange() {
        const sel = document.getElementById('fpTools-stats-period');
        const period = sel ? sel.value : '7d';
        const now = Date.now();
        const oneDay = 24 * 3600 * 1000;
        const today = new Date(); const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
        switch (period) {
            case 'today': return { start: todayStart, end: null, label: 'сегодня' };
            case 'yesterday': return { start: todayStart - oneDay, end: todayStart, label: 'вчера' };
            case '24h': return { start: now - oneDay, end: null, label: '24 часа' };
            case '7d': return { start: now - 7 * oneDay, end: null, label: '7 дней' };
            case '30d': return { start: now - 30 * oneDay, end: null, label: '30 дней' };
            case '365d': return { start: now - 365 * oneDay, end: null, label: 'год' };
            default: return { start: null, end: null, label: 'всё время' };
        }
    }

    // Глобальное состояние фильтров/сортировки (применяется во ВСЕХ режимах).
    // У продаж и покупок РАЗНЫЕ ключи и разные дефолты: для покупок возвраты по
    // умолчанию выключены (возвращённые деньги ты по факту не тратил).
    const _cfg = (typeof window !== 'undefined' && window.fptStatsCfg) || null;
    const FILTER_KEY = (_cfg && _cfg.filterKey) || 'fpToolsStatsFilters';
    const _defRefunded = _cfg ? false : true; // покупки: по умолчанию без возвратов
    let filters = { stClosed: true, stPaid: true, stRefunded: _defRefunded, sort: 'date-desc' };
    function loadFilters() {
        try {
            const raw = localStorage.getItem(FILTER_KEY);
            if (raw) filters = Object.assign(filters, JSON.parse(raw));
        } catch (_) {}
    }
    function saveFilters() {
        try { localStorage.setItem(FILTER_KEY, JSON.stringify(filters)); } catch (_) {}
    }

    function statusAllowed(status) {
        if (status === 'refunded') return filters.stRefunded;
        if (status === 'paid') return filters.stPaid;
        if (status === 'closed') return filters.stClosed;
        return true; // неизвестные статусы не прячем
    }

    function sortOrders(arr) {
        const a = arr.slice();
        switch (filters.sort) {
            case 'date-asc': a.sort((x, y) => (x.orderDate || 0) - (y.orderDate || 0)); break;
            case 'price-desc': a.sort((x, y) => (y.price || 0) - (x.price || 0)); break;
            case 'price-asc': a.sort((x, y) => (x.price || 0) - (y.price || 0)); break;
            case 'date-desc':
            default: a.sort((x, y) => (y.orderDate || 0) - (x.orderDate || 0)); break;
        }
        return a;
    }

    function getOrders(range) {
        return new Promise(async resolve => {
            const all = await (window.fptOrdersDB || FPTSalesDB).getAllAsArray();
            {
                let filtered = all.filter(o => {
                    if (range.start && o.orderDate < range.start) return false;
                    if (range.end && o.orderDate > range.end) return false;
                    if (!statusAllowed(o.orderStatus)) return false;
                    return true;
                });
                filtered = sortOrders(filtered);
                resolve(filtered);
            }
        });
    }

    function countStoredOrders() {
        return new Promise(async resolve => {
            try { resolve(await (window.fptOrdersDB || FPTSalesDB).count()); } catch (_) { resolve(0); }
        });
    }

    let _salesUpdateTriggered = false;
    function triggerSalesUpdateOnce() {
        if (_salesUpdateTriggered) return;
        _salesUpdateTriggered = true;
        try {
            if (chrome.runtime && chrome.runtime.id) {
                chrome.runtime.sendMessage({ action: 'updateSales' });
            }
        } catch (_) {}
        // если за 8 сек данные так и не пришли - позволим повторить попытку позже
        setTimeout(() => { _salesUpdateTriggered = false; }, 8000);
    }

    // ── агрегаты ──────────────────────────────────────────────────────────────
    function aggregate(orders) {
        const rates = { RUB: 0.011, USD: 1, EUR: 1.08 }; // приблизит. к USD для сравнения
        const byDay = {};
        const byCategory = {};
        const byStatus = { closed: 0, paid: 0, refunded: 0 };
        const byCurrency = {};
        const byBuyer = {};
        const byProduct = {};
        let revenueUSD = 0, count = 0;

        for (const o of orders) {
            const valid = (o.orderStatus === 'closed' || o.orderStatus === 'paid');
            const d = new Date(o.orderDate);
            const dayKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
            if (!byDay[dayKey]) byDay[dayKey] = { count: 0, revenue: 0 };
            byDay[dayKey].count++;
            if (valid) byDay[dayKey].revenue += (o.price || 0) * (rates[o.currency] || 0) / rates.RUB; // в рублях прибл.

            const cat = o.subcategoryName || 'Без категории';
            byCategory[cat] = (byCategory[cat] || 0) + 1;

            if (byStatus[o.orderStatus] != null) byStatus[o.orderStatus]++;

            if (valid) {
                byCurrency[o.currency] = (byCurrency[o.currency] || 0) + (o.price || 0);
                revenueUSD += (o.price || 0) * (rates[o.currency] || 0);
                count++;
            }

            const buyer = o.buyerUsername || '-';
            if (!byBuyer[buyer]) byBuyer[buyer] = { count: 0, id: o.buyerId };
            byBuyer[buyer].count++;

            const prod = o.description || '-';
            byProduct[prod] = (byProduct[prod] || 0) + 1;
        }

        return { byDay, byCategory, byStatus, byCurrency, byBuyer, byProduct, revenueUSD, count, total: orders.length };
    }

    // ── line+bar chart (выручка линией, заказы столбцами) ──────────────────────
    // Один график = одна метрика = одна ось. Возвращает SVG со столбцами,
    // у каждого столбца data-атрибуты для интерактивной подсказки.
    function singleChart(title, days, getVal, fmt, color) {
        if (!days.length) return `<div class="fp-sm-card"><div class="fp-sm-card-title">${esc(title)}</div>${emptyHTML('Нет данных')}</div>`;
        const W = 560, H = 200, PAD = { t: 16, r: 14, b: 28, l: 52 };
        const cw = W - PAD.l - PAD.r, ch = H - PAD.t - PAD.b;
        const vals = days.map(getVal);
        const maxV = Math.max(1, ...vals);
        const slot = cw / days.length;
        const barW = Math.max(2, Math.min(26, slot - 4));

        let bars = '', xL = '', yL = '';
        // Подписи дат: копим по пиксельному интервалу, чтобы не накладывались.
        // Последнюю дату ("сегодня") ставим всегда и удаляем все предыдущие подписи,
        // которые к ней ближе порога - иначе две крайние даты налезали друг на друга.
        const MIN_GAP = 40;
        const xlParts = []; // { x, anchor, label }
        days.forEach((day, i) => {
            const v = vals[i];
            const x = PAD.l + slot * i + slot / 2;
            const bh = (v / maxV) * ch;
            const y = PAD.t + ch - bh;
            bars += `<rect class="fp-sm-bar" x="${x - barW / 2}" y="${y}" width="${barW}" height="${bh}" rx="2"
                fill="${color}" data-label="${esc(day)}" data-val="${esc(fmt(v))}" data-day="${esc(day)}"
                tabindex="0"></rect>`;

            const isLast = i === days.length - 1;
            if (isLast) {
                const tx = Math.min(x, W - PAD.r);
                while (xlParts.length && (tx - xlParts[xlParts.length - 1].x) < MIN_GAP) xlParts.pop();
                xlParts.push({ x: tx, anchor: 'end', label: day.slice(5) });
            } else if (!xlParts.length || (x - xlParts[xlParts.length - 1].x) >= MIN_GAP) {
                xlParts.push({ x, anchor: 'middle', label: day.slice(5) });
            }
        });
        xL = xlParts.map(p => `<text x="${p.x}" y="${H - 8}" text-anchor="${p.anchor}" font-size="9" fill="var(--fpt-text-muted)">${esc(p.label)}</text>`).join('');
        const steps = 4;
        for (let i = 0; i <= steps; i++) {
            const y = PAD.t + ch - (i / steps) * ch;
            const rv = (maxV / steps) * i;
            const lbl = rv >= 1000 ? Math.round(rv / 1000) + 'к' : Math.round(rv);
            yL += `<line x1="${PAD.l}" y1="${y}" x2="${W - PAD.r}" y2="${y}" stroke="var(--fpt-border)" stroke-width="1" opacity="0.5"/>`;
            yL += `<text x="${PAD.l - 6}" y="${y + 3}" text-anchor="end" font-size="9" fill="var(--fpt-text-muted)">${lbl}</text>`;
        }

        return `
        <div class="fp-sm-card">
            <div class="fp-sm-card-title">${esc(title)}</div>
            <svg class="fp-sm-chart" viewBox="0 0 ${W} ${H}" width="100%" style="display:block;overflow:visible;">
                ${yL}${bars}${xL}
            </svg>
        </div>`;
    }

    function chartHTML(agg) {
        const days = Object.keys(agg.byDay).sort();
        if (!days.length) return emptyHTML('Нет данных за период');
        const revChart = singleChart(((_cfg && _cfg.moneyByDayLabel) || 'Выручка по дням, ₽'), days, d => agg.byDay[d].revenue, v => money(v, 'RUB'), 'var(--fpt-accent)');
        const cntChart = singleChart('Заказы по дням, шт.', days, d => agg.byDay[d].count, v => v + ' заказ.', '#2563eb');
        return `<div class="fp-sm-charts-stack">${revChart}${cntChart}</div>`;
    }

    // ── pie/donut diagrams ──────────────────────────────────────────────────────
    function donut(title, entries, fmtVal) {
        const total = entries.reduce((s, e) => s + e.value, 0);
        if (!total) return `<div class="fp-sm-card"><div class="fp-sm-card-title">${esc(title)}</div>${emptyHTML('Нет данных')}</div>`;
        const cx = 70, cy = 70, r = 56, rin = 34;
        let acc = 0, paths = '', legend = '';
        const top = entries.slice(0, 8);
        top.forEach((e, i) => {
            const frac = e.value / total;
            const a0 = acc * 2 * Math.PI - Math.PI / 2;
            acc += frac;
            const a1 = acc * 2 * Math.PI - Math.PI / 2;
            const large = frac > 0.5 ? 1 : 0;
            const x0 = cx + r * Math.cos(a0), y0 = cy + r * Math.sin(a0);
            const x1 = cx + r * Math.cos(a1), y1 = cy + r * Math.sin(a1);
            const xi1 = cx + rin * Math.cos(a1), yi1 = cy + rin * Math.sin(a1);
            const xi0 = cx + rin * Math.cos(a0), yi0 = cy + rin * Math.sin(a0);
            const col = PALETTE[i % PALETTE.length];
            const valStr = fmtVal ? fmtVal(e.value) : String(e.value);
            const ttVal = `${valStr} (${Math.round(frac * 100)}%)`;
            paths += `<path class="fp-sm-seg" d="M${x0},${y0} A${r},${r} 0 ${large} 1 ${x1},${y1} L${xi1},${yi1} A${rin},${rin} 0 ${large} 0 ${xi0},${yi0} Z" fill="${col}" data-label="${esc(e.label)}" data-val="${esc(ttVal)}" tabindex="0"></path>`;
            legend += `<div class="fp-sm-leg"><span class="fp-sm-dot" style="background:${col}"></span><span class="fp-sm-leg-label">${esc(e.label)}</span><span class="fp-sm-leg-val">${Math.round(frac * 100)}%</span></div>`;
        });
        return `
        <div class="fp-sm-card">
            <div class="fp-sm-card-title">${esc(title)}</div>
            <div class="fp-sm-donut-row">
                <svg class="fp-sm-donut" viewBox="0 0 140 140" width="140" height="140" style="flex-shrink:0;overflow:visible;">${paths}<text x="70" y="74" text-anchor="middle" font-size="14" font-weight="700" fill="var(--fpt-text)">${total}</text></svg>
                <div class="fp-sm-legend">${legend}</div>
            </div>
        </div>`;
    }

    function diagramsHTML(agg) {
        const catEntries = Object.entries(agg.byCategory).map(([k, v]) => ({ label: k, value: v })).sort((a, b) => b.value - a.value);
        const statusLabels = { closed: 'Закрыто', paid: 'В ожидании', refunded: 'Возврат' };
        const statusEntries = Object.entries(agg.byStatus).filter(([, v]) => v > 0).map(([k, v]) => ({ label: statusLabels[k] || k, value: v }));
        const curEntries = Object.entries(agg.byCurrency).map(([k, v]) => ({ label: k, value: v })).sort((a, b) => b.value - a.value);

        return `<div class="fp-sm-grid">
            ${donut('Заказы по категориям', catEntries)}
            ${donut('Заказы по статусам', statusEntries)}
            ${donut(((_cfg && _cfg.moneyByCurLabel) || 'Выручка по валютам'), curEntries, (v) => Math.round(v).toLocaleString('ru-RU'))}
        </div>`;
    }

    // ── detailed tables ──────────────────────────────────────────────────────────
    // rows: { name, value, href?, filterType?, filterKey? }
    function tableHTML(title, rows) {
        if (!rows.length) return `<div class="fp-sm-card"><div class="fp-sm-card-title">${esc(title)}</div>${emptyHTML('Нет данных')}</div>`;
        const VISIBLE = 10; // показываем 10, остальное прячем под «Показать ещё»
        const rowHTML = (r, i) => {
            const nameInner = r.href
                ? `<a class="fp-sm-row-link" href="${esc(r.href)}" target="_blank" rel="noopener" title="Открыть профиль">${esc(r.name)}</a>`
                : `<span>${esc(r.name)}</span>`;
            const valInner = (r.filterType && r.filterKey != null)
                ? `<button type="button" class="fp-sm-row-val fp-sm-row-valbtn" data-filter-type="${esc(r.filterType)}" data-filter-key="${esc(r.filterKey)}" title="Показать эти заказы">${esc(r.value)}</button>`
                : `<span class="fp-sm-row-val">${esc(r.value)}</span>`;
            return `
            <div class="fp-sm-row">
                <span class="fp-sm-row-rank">${i + 1}</span>
                <span class="fp-sm-row-name">${nameInner}</span>
                ${valInner}
            </div>`;
        };
        const head = rows.slice(0, VISIBLE).map(rowHTML).join('');
        const restRows = rows.slice(VISIBLE);
        let moreBlock = '';
        if (restRows.length) {
            const hidden = restRows.map((r, i) => rowHTML(r, i + VISIBLE)).join('');
            moreBlock = `<div class="fp-sm-more-hidden" style="display:none;">${hidden}</div>` +
                `<button type="button" class="fp-sm-more-btn" data-fp-more="1" data-more-count="${restRows.length}">Показать ещё ${restRows.length}</button>`;
        }
        return `<div class="fp-sm-card"><div class="fp-sm-card-title">${esc(title)}</div>${head}${moreBlock}</div>`;
    }

    function detailedHTML(agg) {
        const topBuyers = Object.entries(agg.byBuyer).map(([name, v]) => ({ name, count: v.count, id: v.id }))
            .sort((a, b) => b.count - a.count).slice(0, 100)
            .map(b => ({
                name: b.name,
                value: `${b.count} зак.`,
                href: b.id ? `https://funpay.com/users/${b.id}/` : null,
                filterType: 'buyer', filterKey: b.name
            }));
        const topProducts = Object.entries(agg.byProduct).map(([name, c]) => ({ name, c }))
            .sort((a, b) => b.c - a.c).slice(0, 100)
            .map(p => ({ name: p.name, value: `${p.c} раз`, filterType: 'product', filterKey: p.name }));
        const topCats = Object.entries(agg.byCategory).map(([name, c]) => ({ name, c }))
            .sort((a, b) => b.c - a.c).slice(0, 100)
            .map(c => ({ name: c.name, value: `${c.c} зак.`, filterType: 'category', filterKey: c.name }));

        return `<div class="fp-sm-grid">
            ${tableHTML((_cfg && _cfg.topTableLabel) || 'Топ покупателей', topBuyers)}
            ${tableHTML('Топ товаров', topProducts)}
            ${tableHTML('Топ категорий', topCats)}
        </div>`;
    }

    function emptyHTML(msg) {
        return `<p style="color:var(--fpt-text-muted);font-size:12px;text-align:center;padding:18px;">${esc(msg)}</p>`;
    }

    // ── styles ──────────────────────────────────────────────────────────────────
    function ensureStyles() {
        if (document.getElementById('fp-sm-styles')) return;
        const s = document.createElement('style');
        s.id = 'fp-sm-styles';
        s.textContent = `
        .fp-stats-modebar{display:flex;gap:6px;flex-wrap:wrap;margin:14px 0 4px;}
        .fp-stats-mode-btn{display:inline-flex;align-items:center;gap:6px;background:var(--fpt-surface,#1a1c26);
            border:1px solid var(--fpt-border,#22253a);color:var(--fpt-text-muted,#9099b8);border-radius:8px;
            padding:6px 12px;font-size:12px;font-weight:600;cursor:pointer;transition:all .15s;font-family:inherit;}
        .fp-stats-mode-btn .material-symbols-rounded{font-size:16px;}
        .fp-stats-mode-btn:hover{border-color:var(--fpt-accent,#C026D3);color:var(--fpt-text,#d8dae8);}
        .fp-stats-mode-btn.active{background:var(--fpt-accent-soft,rgba(192,38,211,0.18));border-color:var(--fpt-accent,#C026D3);color:var(--fpt-accent,#C026D3);}
        #fpTools-stats-modeview{margin-top:12px;}
        .fp-sm-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:12px;}
        .fp-sm-card{background:var(--fpt-surface,#1a1c26);border:1px solid var(--fpt-border,#22253a);border-radius:10px;padding:14px;}
        .fp-sm-card-title{font-size:12px;font-weight:700;color:var(--fpt-text,#d8dae8);margin-bottom:10px;}
        .fp-sm-more-btn{margin-top:6px;padding:2px 0;background:none;border:none;cursor:pointer;
            font-size:11px;color:var(--fpt-text-muted,#9099b8);opacity:.85;width:auto;}
        .fp-sm-more-btn:hover{opacity:1;color:var(--fpt-accent,#C026D3);text-decoration:underline;}
        .fp-sm-donut-row{display:flex;align-items:center;gap:14px;}
        .fp-sm-legend{display:flex;flex-direction:column;gap:5px;flex:1;min-width:0;}
        .fp-sm-leg{display:flex;align-items:center;gap:7px;font-size:11px;color:var(--fpt-text-muted,#9099b8);}
        .fp-sm-dot{width:9px;height:9px;border-radius:2px;flex-shrink:0;}
        .fp-sm-leg-label{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
        .fp-sm-leg-val{color:var(--fpt-text,#d8dae8);font-weight:600;flex-shrink:0;}
        .fp-sm-row{display:flex;align-items:center;gap:10px;padding:6px 0;border-bottom:1px solid var(--fpt-border,#22253a);font-size:12px;}
        .fp-sm-row:last-child{border-bottom:none;}
        .fp-sm-row-rank{width:18px;text-align:center;color:var(--fpt-accent,#C026D3);font-weight:700;flex-shrink:0;}
        .fp-sm-row-name{flex:1;color:var(--fpt-text,#d8dae8);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
        .fp-sm-row-link{color:var(--fpt-text,#d8dae8);text-decoration:none;}
        .fp-sm-row-link:hover{color:var(--fpt-accent,#C026D3);text-decoration:underline;}
        .fp-sm-row-val{color:var(--fpt-text-muted,#9099b8);flex-shrink:0;}
        button.fp-sm-row-valbtn{background:transparent;border:none;font:inherit;cursor:pointer;
            color:var(--fpt-text-muted,#9099b8);padding:2px 6px;border-radius:6px;transition:color .12s,background .12s;}
        button.fp-sm-row-valbtn:hover{color:var(--fpt-accent,#C026D3);background:var(--fpt-accent-soft,rgba(192,38,211,0.12));text-decoration:underline;}
        .fp-sm-summary{display:flex;gap:18px;flex-wrap:wrap;margin-bottom:12px;font-size:12px;color:var(--fpt-text-muted,#9099b8);}
        .fp-sm-summary strong{color:var(--fpt-text,#d8dae8);}
        .fp-sm-charts-stack{display:flex;flex-direction:column;gap:12px;}
        .fp-sm-bar{cursor:pointer;transition:opacity .12s;outline:none;}
        .fp-sm-bar:hover,.fp-sm-bar:focus{opacity:0.78;}
        .fp-sm-seg{transition:opacity .12s;outline:none;}
        .fp-sm-seg:hover,.fp-sm-seg:focus{opacity:0.82;}
        #fp-sm-tooltip{position:fixed;z-index:100001;pointer-events:none;background:var(--fpt-bg,#13141a);
            border:1px solid var(--fpt-border,#22253a);border-radius:8px;padding:6px 10px;font-size:12px;
            color:var(--fpt-text,#d8dae8);box-shadow:0 6px 18px var(--fpt-shadow,rgba(0,0,0,0.4));
            font-family:Inter,'Segoe UI',sans-serif;white-space:nowrap;opacity:0;transition:opacity .1s;}
        #fp-sm-tooltip .fp-sm-tt-label{color:var(--fpt-text-muted,#9099b8);font-size:10px;margin-bottom:2px;}
        #fp-sm-tooltip .fp-sm-tt-val{font-weight:700;}
        .fp-stats-searchbar{display:flex;align-items:center;gap:8px;margin:10px 0 4px;position:relative;}
        .fp-stats-searchbar .fp-stats-search-ico{position:absolute;left:10px;font-size:18px;color:var(--fpt-text-muted,#9099b8);pointer-events:none;}
        #fpTools-stats-search{flex:1;padding:8px 10px 8px 34px;border-radius:8px;font-size:13px;
            background:var(--fpt-surface,#1a1c26);border:1px solid var(--fpt-border,#22253a);color:var(--fpt-text,#d8dae8);outline:none;}
        #fpTools-stats-search:focus{border-color:var(--fpt-accent,#C026D3);}
        #fpTools-stats-search-btn{padding:8px 14px;border-radius:8px;border:none;background:var(--fpt-accent,#C026D3);
            color:#fff;font-size:13px;font-weight:600;cursor:pointer;flex-shrink:0;}
        #fpTools-stats-search-btn:hover{filter:brightness(1.1);}
        #fpTools-stats-search-clear{width:34px;height:34px;border-radius:8px;border:1px solid var(--fpt-border,#22253a);
            background:var(--fpt-surface,#1a1c26);color:var(--fpt-text-muted,#9099b8);font-size:18px;cursor:pointer;flex-shrink:0;line-height:1;}
        #fpTools-stats-search-clear:hover{color:var(--fpt-text,#fff);border-color:var(--fpt-accent,#C026D3);}
        .fp-sm-sr-list{display:flex;flex-direction:column;gap:8px;}
        .fp-sm-sr-row{display:block;text-decoration:none;background:var(--fpt-surface-2,#20222e);
            border:1px solid var(--fpt-border,#22253a);border-radius:9px;padding:9px 11px;transition:border-color .15s;}
        a.fp-sm-sr-row:hover{border-color:var(--fpt-accent,#C026D3);}
        .fp-sm-sr-top{display:flex;justify-content:space-between;gap:8px;align-items:baseline;}
        .fp-sm-sr-title{font-size:12.5px;color:var(--fpt-text,#d8dae8);font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
        .fp-sm-sr-price{font-size:12.5px;font-weight:700;color:var(--fpt-accent,#C026D3);white-space:nowrap;}
        .fp-sm-sr-meta{display:flex;flex-wrap:wrap;gap:4px 12px;margin-top:5px;font-size:11px;color:var(--fpt-text-muted,#9099b8);}
        .fp-sm-sr-status{font-weight:600;}
        .fp-sm-st-closed{color:#4caf82;}
        .fp-sm-st-paid{color:#f4c84a;}
        .fp-sm-st-refunded{color:#ff6b6b;}
        .fp-sm-day-head{display:flex;align-items:center;gap:12px;margin-bottom:10px;flex-wrap:wrap;}
        .fp-sm-back{display:inline-flex;align-items:center;gap:4px;background:var(--fpt-surface-2,rgba(127,127,127,0.12));
            border:1px solid var(--fpt-border,rgba(127,127,127,0.25));color:var(--fpt-text,#d8dae8);
            border-radius:7px;padding:4px 10px;font-size:12px;cursor:pointer;}
        .fp-sm-back:hover{border-color:var(--fpt-accent,#C026D3);}
        .fp-sm-back .material-symbols-rounded{font-size:15px;}
        .fp-stats-search-toggle.active{color:var(--fpt-accent,#C026D3);}
        .fp-stats-filterbar{display:flex;flex-direction:column;gap:8px;margin:10px 0 4px;padding:10px 12px;
            background:var(--fpt-surface,#1a1c26);border:1px solid var(--fpt-border,#22253a);border-radius:9px;}
        .fp-stats-filter-row{display:flex;align-items:center;gap:12px;flex-wrap:wrap;}
        .fp-stats-filter-cap{font-size:12px;font-weight:700;color:var(--fpt-text,#d8dae8);}
        .fp-stats-status-btn{display:inline-flex;align-items:center;gap:5px;font-size:12px;font-weight:600;
            background:var(--fpt-surface-2,#20222e);border:1px solid var(--fpt-border,#22253a);
            color:var(--fpt-text-muted,#9099b8);border-radius:7px;padding:5px 12px;cursor:pointer;
            transition:color .12s,border-color .12s,background .12s;font-family:inherit;}
        .fp-stats-status-btn:hover{border-color:var(--fpt-text-muted,#8a8f9c);}
        .fp-stats-status-btn.active{color:#4caf82;border-color:#4caf82;background:rgba(76,175,130,0.12);}
        .fp-stats-status-btn::before{content:'';width:7px;height:7px;border-radius:50%;flex-shrink:0;
            background:var(--fpt-text-muted,#555);transition:background .12s;}
        .fp-stats-status-btn.active::before{background:#4caf82;}
        .fp-stats-sort-select{width:auto;min-width:150px;height:32px;padding:4px 8px;font-size:12px;
            background:var(--fpt-surface-2,#20222e);border:1px solid var(--fpt-border,#22253a);
            color:var(--fpt-text,#d8dae8);border-radius:7px;}
        .fp-stats-sort-select option{background:#1a1c26;color:#d8dae8;}
        .fp-stats-filter-reset{margin-left:auto;background:transparent;border:1px solid var(--fpt-border,#22253a);
            color:var(--fpt-text-muted,#9099b8);border-radius:7px;padding:5px 10px;font-size:12px;cursor:pointer;}
        .fp-stats-filter-reset:hover{color:var(--fpt-text,#fff);border-color:var(--fpt-accent,#C026D3);}

        /* === При включённой кастомной теме делаем все панели полупрозрачными,
              как карточки (glassmorphism), чтобы не было чёрных блоков. === */
        .fpt-custom-theme-on .fp-sm-card,
        .fpt-custom-theme-on .fp-stats-filterbar{
            background:rgba(255,255,255,0.05) !important;
            border:1px solid rgba(255,255,255,0.1) !important;
            backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);}
        .fpt-custom-theme-on .fp-stats-mode-btn,
        .fpt-custom-theme-on .fp-stats-status-btn,
        .fpt-custom-theme-on .fp-stats-sort-select,
        .fpt-custom-theme-on .fp-sm-back{
            background:rgba(255,255,255,0.06) !important;
            border:1px solid rgba(255,255,255,0.12) !important;}
        .fpt-custom-theme-on .fp-stats-sort-select option{background:#15161c !important;color:#e8eaf2 !important;}
        .fpt-custom-theme-on .fp-stats-mode-btn.active{
            background:var(--fpt-accent-soft,rgba(192,38,211,0.25)) !important;
            border-color:var(--fpt-accent,#C026D3) !important;}
        .fpt-custom-theme-on .fp-stats-status-btn.active{
            background:rgba(76,175,130,0.18) !important;border-color:#4caf82 !important;}
        .fpt-custom-theme-on .fp-sm-sr-row{
            background:rgba(255,255,255,0.05) !important;border:1px solid rgba(255,255,255,0.1) !important;}
        .fpt-custom-theme-on #fp-sm-tooltip{
            background:rgba(20,20,20,0.85) !important;border:1px solid rgba(255,255,255,0.15) !important;
            backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);}

        /* === Кастомная тема ВЫКЛЮЧЕНА → ФИКСИРОВАННЫЕ светлые значения.
              НЕ используем var(--fpt-*): палитра считается от фона страницы и может
              стать тёмной (например при перемещении меню) → чёрные блоки. === */
        .fpt-custom-theme-off .fp-sm-card,
        .fpt-custom-theme-off .fp-stats-filterbar{
            background:#ffffff !important;
            border:1px solid rgba(0,0,0,0.12) !important;
            backdrop-filter:none !important;-webkit-backdrop-filter:none !important;}
        .fpt-custom-theme-off .fp-stats-mode-btn,
        .fpt-custom-theme-off .fp-stats-status-btn,
        .fpt-custom-theme-off .fp-stats-sort-select,
        .fpt-custom-theme-off .fp-sm-back,
        .fpt-custom-theme-off .fp-sm-sr-row{
            background:#f4f4f6 !important;
            border:1px solid rgba(0,0,0,0.12) !important;
            color:#222 !important;}
        .fpt-custom-theme-off .fp-stats-sort-select option{background:#ffffff !important;color:#222 !important;}
        .fpt-custom-theme-off .fp-sm-card-title,
        .fpt-custom-theme-off .fp-sm-row-name,
        .fpt-custom-theme-off .fp-sm-row-link,
        .fpt-custom-theme-off .fp-sm-summary strong,
        .fpt-custom-theme-off .fp-sm-leg-val,
        .fpt-custom-theme-off .fp-sm-sr-title{color:#222 !important;}
        .fpt-custom-theme-off .fp-sm-summary,
        .fpt-custom-theme-off .fp-sm-row-val,
        .fpt-custom-theme-off .fp-sm-leg{color:#666 !important;}
        .fpt-custom-theme-off .fp-stats-mode-btn.active{
            background:rgba(192,38,211,0.12) !important;
            border-color:#C026D3 !important;color:#C026D3 !important;}
        .fpt-custom-theme-off .fp-stats-status-btn.active{
            background:rgba(76,175,130,0.12) !important;border-color:#3a9e6e !important;color:#2e7d54 !important;}
        .fpt-custom-theme-off #fp-sm-tooltip{
            background:#ffffff !important;border:1px solid rgba(0,0,0,0.15) !important;color:#222 !important;
            backdrop-filter:none !important;-webkit-backdrop-filter:none !important;}
        `;
        (document.head || document.documentElement).appendChild(s);
    }

    // ── render orchestrator ───────────────────────────────────────────────────────
    let currentMode = 'cards';
    let searchQuery = '';
    // Текущий «дрилл-даун» (просмотр заказов дня/покупателя/...). Если задан -
    // изменение фильтров/сортировки перерисовывает именно его, а не выкидывает в режим.
    let currentView = null; // { type:'day', key } | { type:'buyer'|'product'|'category', key } | null

    function orderMatches(o, q) {
        const hay = [
            o.buyerUsername, o.description, o.subcategoryName, o.orderId,
            o.price != null ? String(o.price) : ''
        ].join(' ').toLowerCase();
        return hay.includes(q);
    }

    function searchResultsHTML(orders, q) {
        const matched = orders.filter(o => orderMatches(o, q))
            .sort((a, b) => (b.orderDate || 0) - (a.orderDate || 0));
        if (!matched.length) {
            return `<div class="fp-sm-card">${emptyHTML('По запросу «' + esc(q) + '» ничего не найдено за выбранный период.')}</div>`;
        }
        const sym = { RUB: '₽', USD: '$', EUR: '€' };
        const rows = matched.slice(0, 200).map(o => {
            const d = o.orderDate ? new Date(o.orderDate) : null;
            const dateStr = d ? d.toLocaleDateString('ru-RU') + ' ' + d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }) : '';
            const price = o.price != null ? `${Math.round(o.price).toLocaleString('ru-RU')} ${sym[o.currency] || o.currency || ''}` : '';
            const stMap = { closed: 'Закрыт', paid: 'Оплачен', refunded: 'Возврат' };
            const st = stMap[o.orderStatus] || o.orderStatus || '';
            const link = o.orderId ? `https://funpay.com/orders/${o.orderId}/` : null;
            const inner = `
                <div class="fp-sm-sr-top">
                    <span class="fp-sm-sr-title">${esc(o.description || o.subcategoryName || 'Заказ')}</span>
                    ${price ? `<span class="fp-sm-sr-price">${esc(price)}</span>` : ''}
                </div>
                <div class="fp-sm-sr-meta">
                    <span>${esc(o.buyerUsername || '-')}</span>
                    <span>${esc(o.subcategoryName || '')}</span>
                    <span class="fp-sm-sr-status fp-sm-st-${esc(o.orderStatus || '')}">${esc(st)}</span>
                    <span>${esc(dateStr)}</span>
                </div>`;
            return link
                ? `<a class="fp-sm-sr-row" href="${link}" target="_blank" rel="noopener">${inner}</a>`
                : `<div class="fp-sm-sr-row">${inner}</div>`;
        }).join('');
        return `<div class="fp-sm-card">
            <div class="fp-sm-card-title">Найдено заказов: ${matched.length}${matched.length > 200 ? ' (показаны первые 200)' : ''}</div>
            <div class="fp-sm-sr-list">${rows}</div>
        </div>`;
    }

    async function render() {
        ensureStyles();
        currentView = null; // переход в режим/поиск всегда выходит из дрилл-дауна
        const view = document.getElementById('fpTools-stats-modeview');
        const cards = document.getElementById('fpTools-stats-cards');
        if (!view) return;

        // Режим поиска перекрывает всё: показываем список совпадений.
        if (searchQuery) {
            const range = getPeriodRange();
            const orders = await getOrders(range);
            view.innerHTML = searchResultsHTML(orders, searchQuery.toLowerCase());
            if (cards) cards.style.display = 'none'; // прячем ПОСЛЕ готовности контента
            return;
        }

        // карточки - показываем стандартный блок, очищаем доп. view
        if (currentMode === 'cards') {
            if (cards) cards.style.display = '';
            view.innerHTML = '';
            return;
        }

        const range = getPeriodRange();
        const orders = await getOrders(range);
        if (!orders.length) {
            // Определяем: данных нет ВООБЩЕ (ещё не загрузились) или нет за период/из-за фильтров.
            const totalStored = await countStoredOrders();
            if (totalStored === 0) {
                view.innerHTML = `<div class="fp-sm-card">${emptyHTML('Загрузка данных о продажах…')}</div>`;
                if (cards) cards.style.display = 'none';
                triggerSalesUpdateOnce(); // подтянем данные и перерисуемся по storage.onChanged
                return;
            }
            view.innerHTML = `<div class="fp-sm-card">${emptyHTML('Нет данных за период «' + range.label + '» (с учётом фильтров).')}</div>`;
            if (cards) cards.style.display = 'none';
            return;
        }
        const agg = aggregate(orders);

        const summary = `<div class="fp-sm-summary">
            <span>Период: <strong>${esc(range.label)}</strong></span>
            <span>Заказов: <strong>${agg.total}</strong></span>
            <span>${(_cfg && _cfg.countLabel) || "Продаж"}: <strong>${agg.count}</strong></span>
        </div>`;

        let html = summary;
        if (currentMode === 'charts') html += chartHTML(agg);
        else if (currentMode === 'diagrams') html += diagramsHTML(agg);
        else if (currentMode === 'detailed') html += detailedHTML(agg);
        else if (currentMode === 'full') {
            html += chartHTML(agg) + '<div style="height:12px;"></div>' + diagramsHTML(agg) + '<div style="height:12px;"></div>' + detailedHTML(agg);
        }
        // Сначала заполняем view готовым контентом, и только потом прячем карточки -
        // так между переключением вкладок не возникает пустого «провала» статистики.
        view.innerHTML = html;
        if (cards) cards.style.display = 'none';
        attachBarTooltips(view);
        // клики по «N зак.» в детальных таблицах → показать эти заказы
        view.querySelectorAll('.fp-sm-row-valbtn').forEach(btn => {
            btn.addEventListener('click', () => {
                const type = btn.getAttribute('data-filter-type');
                const key = btn.getAttribute('data-filter-key');
                if (type && key != null) showFilteredOrders(type, key);
            });
        });
        // «Показать ещё» / «Скрыть» в топ-таблицах — раскрывает и сворачивает на месте
        view.querySelectorAll('.fp-sm-more-btn').forEach(btn => {
            const totalMore = btn.getAttribute('data-more-count') || '';
            let bound = false;
            btn.addEventListener('click', () => {
                const hidden = btn.previousElementSibling;
                if (!hidden || !hidden.classList.contains('fp-sm-more-hidden')) return;
                const isOpen = hidden.style.display !== 'none';
                if (isOpen) {
                    hidden.style.display = 'none';
                    btn.textContent = `Показать ещё ${totalMore}`;
                } else {
                    hidden.style.display = '';
                    btn.textContent = 'Скрыть';
                    if (!bound) {
                        bound = true;
                        hidden.querySelectorAll('.fp-sm-row-valbtn').forEach(b => {
                            b.addEventListener('click', () => {
                                const t = b.getAttribute('data-filter-type');
                                const k = b.getAttribute('data-filter-key');
                                if (t && k != null) showFilteredOrders(t, k);
                            });
                        });
                    }
                }
            });
        });
    }

    // Перерисовать то, что сейчас открыто: дрилл-даун (день/покупатель/…) либо режим.
    function rerenderActive() {
        if (currentView) {
            const v = currentView;
            if (v.type === 'day') { showDayOrders(v.key); return; }
            showFilteredOrders(v.type, v.key);
            return;
        }
        render();
    }

    // Плавающая подсказка для столбцов графиков И сегментов диаграмм.
    function attachBarTooltips(root) {
        let tip = document.getElementById('fp-sm-tooltip');
        if (!tip) {
            tip = document.createElement('div');
            tip.id = 'fp-sm-tooltip';
            tip.innerHTML = '<div class="fp-sm-tt-label"></div><div class="fp-sm-tt-val"></div>';
            document.body.appendChild(tip);
        }
        const lbl = tip.querySelector('.fp-sm-tt-label');
        const val = tip.querySelector('.fp-sm-tt-val');
        const HOVER_SEL = '.fp-sm-bar, .fp-sm-seg';

        const show = (e) => {
            const el = e.target.closest(HOVER_SEL);
            if (!el) return;
            lbl.textContent = el.getAttribute('data-label') || '';
            val.textContent = el.getAttribute('data-val') || '';
            tip.style.opacity = '1';
            move(e);
        };
        const move = (e) => {
            const x = (e.touches ? e.touches[0].clientX : e.clientX);
            const y = (e.touches ? e.touches[0].clientY : e.clientY);
            const r = tip.getBoundingClientRect();
            let tx = x + 14, ty = y - r.height - 8;
            if (tx + r.width > window.innerWidth - 8) tx = x - r.width - 14;
            if (ty < 8) ty = y + 16;
            tip.style.left = tx + 'px';
            tip.style.top = ty + 'px';
        };
        const hide = () => { tip.style.opacity = '0'; };

        const wireSvg = (svg) => {
            svg.addEventListener('mouseover', show);
            svg.addEventListener('mousemove', (e) => { if (e.target.closest(HOVER_SEL)) move(e); });
            svg.addEventListener('mouseout', hide);
            svg.addEventListener('focusin', (e) => {
                const el = e.target.closest(HOVER_SEL);
                if (!el) return;
                lbl.textContent = el.getAttribute('data-label') || '';
                val.textContent = el.getAttribute('data-val') || '';
                const br = el.getBoundingClientRect();
                tip.style.opacity = '1';
                tip.style.left = (br.left + br.width / 2) + 'px';
                tip.style.top = (br.top - tip.offsetHeight - 6) + 'px';
            });
            svg.addEventListener('focusout', hide);
        };

        root.querySelectorAll('.fp-sm-chart').forEach(svg => {
            wireSvg(svg);
            // клик по столбцу - показать все заказы за этот день
            svg.style.cursor = 'default';
            svg.addEventListener('click', (e) => {
                const bar = e.target.closest('.fp-sm-bar');
                if (!bar) return;
                const day = bar.getAttribute('data-day');
                if (day) showDayOrders(day);
            });
        });
        root.querySelectorAll('.fp-sm-donut').forEach(wireSvg);
        root.querySelectorAll('.fp-sm-bar').forEach(b => { b.style.cursor = 'pointer'; });
        root.querySelectorAll('.fp-sm-seg').forEach(s => { s.style.cursor = 'default'; });
    }

    // Показать все заказы за конкретный день (клик по столбцу графика).
    async function showDayOrders(dayKey) {
        const view = document.getElementById('fpTools-stats-modeview');
        if (!view) return;
        currentView = { type: 'day', key: dayKey };
        const all = await getOrders({ start: null, end: null });
        const dayOrders = sortOrders(all.filter(o => {
            if (!o.orderDate) return false;
            const d = new Date(o.orderDate);
            const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
            return k === dayKey;
        }));

        const sym = { RUB: '₽', USD: '$', EUR: '€' };
        const stMap = { closed: 'Закрыт', paid: 'Оплачен', refunded: 'Возврат' };
        let revenue = 0;
        dayOrders.forEach(o => { if (o.orderStatus === 'closed' || o.orderStatus === 'paid') revenue += (o.price || 0); });

        const rows = dayOrders.map(o => {
            const d = o.orderDate ? new Date(o.orderDate) : null;
            const time = d ? d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }) : '';
            const price = o.price != null ? `${Math.round(o.price).toLocaleString('ru-RU')} ${sym[o.currency] || o.currency || ''}` : '';
            const link = o.orderId ? `https://funpay.com/orders/${o.orderId}/` : null;
            const inner = `
                <div class="fp-sm-sr-top">
                    <span class="fp-sm-sr-title">${esc(o.description || o.subcategoryName || 'Заказ')}</span>
                    ${price ? `<span class="fp-sm-sr-price">${esc(price)}</span>` : ''}
                </div>
                <div class="fp-sm-sr-meta">
                    <span>${esc(o.buyerUsername || '-')}</span>
                    <span>${esc(o.subcategoryName || '')}</span>
                    <span class="fp-sm-sr-status fp-sm-st-${esc(o.orderStatus || '')}">${esc(stMap[o.orderStatus] || o.orderStatus || '')}</span>
                    <span>${esc(time)}</span>
                </div>`;
            return link ? `<a class="fp-sm-sr-row" href="${link}" target="_blank" rel="noopener">${inner}</a>` : `<div class="fp-sm-sr-row">${inner}</div>`;
        }).join('');

        view.innerHTML = `
            <div class="fp-sm-card">
                <div class="fp-sm-day-head">
                    <button class="fp-sm-back" id="fp-sm-day-back"><span class="material-symbols-rounded">arrow_back</span> Назад</button>
                    <span class="fp-sm-card-title" style="margin:0;">${esc(dayKey)} · ${dayOrders.length} заказ. · ${Math.round(revenue).toLocaleString('ru-RU')} ₽</span>
                </div>
                <div class="fp-sm-sr-list">${rows || emptyHTML('Нет заказов за этот день.')}</div>
            </div>`;
        const back = document.getElementById('fp-sm-day-back');
        if (back) back.addEventListener('click', () => { currentView = null; render(); });
    }

    // Общий рендер строки заказа (используется в поиске, дне и фильтрах).
    function orderRowHTML(o, showDate) {
        const sym = { RUB: '₽', USD: '$', EUR: '€' };
        const stMap = { closed: 'Закрыт', paid: 'Оплачен', refunded: 'Возврат' };
        const d = o.orderDate ? new Date(o.orderDate) : null;
        const dateStr = d ? (showDate
            ? d.toLocaleDateString('ru-RU') + ' ' + d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
            : d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })) : '';
        const price = o.price != null ? `${Math.round(o.price).toLocaleString('ru-RU')} ${sym[o.currency] || o.currency || ''}` : '';
        const link = o.orderId ? `https://funpay.com/orders/${o.orderId}/` : null;
        const inner = `
            <div class="fp-sm-sr-top">
                <span class="fp-sm-sr-title">${esc(o.description || o.subcategoryName || 'Заказ')}</span>
                ${price ? `<span class="fp-sm-sr-price">${esc(price)}</span>` : ''}
            </div>
            <div class="fp-sm-sr-meta">
                <span>${esc(o.buyerUsername || '-')}</span>
                <span>${esc(o.subcategoryName || '')}</span>
                <span class="fp-sm-sr-status fp-sm-st-${esc(o.orderStatus || '')}">${esc(stMap[o.orderStatus] || o.orderStatus || '')}</span>
                <span>${esc(dateStr)}</span>
            </div>`;
        return link ? `<a class="fp-sm-sr-row" href="${link}" target="_blank" rel="noopener">${inner}</a>` : `<div class="fp-sm-sr-row">${inner}</div>`;
    }

    // Показать заказы конкретного покупателя/товара/категории (клик по «N зак.»).
    async function showFilteredOrders(type, key) {
        const view = document.getElementById('fpTools-stats-modeview');
        if (!view) return;
        currentView = { type, key };
        const range = getPeriodRange();
        const orders = await getOrders(range);
        const match = (o) => {
            if (type === 'buyer') return (o.buyerUsername || '-') === key;
            if (type === 'product') return (o.description || '-') === key;
            if (type === 'category') return (o.subcategoryName || 'Без категории') === key;
            return false;
        };
        const list = sortOrders(orders.filter(match));
        let revenue = 0;
        list.forEach(o => { if (o.orderStatus === 'closed' || o.orderStatus === 'paid') revenue += (o.price || 0); });
        const typeLabel = type === 'buyer' ? ((_cfg && _cfg.partyLabel) || 'Покупатель') : (type === 'product' ? 'Товар' : 'Категория');
        const rows = list.map(o => orderRowHTML(o, true)).join('');

        view.innerHTML = `
            <div class="fp-sm-card">
                <div class="fp-sm-day-head">
                    <button class="fp-sm-back" id="fp-sm-filter-back"><span class="material-symbols-rounded">arrow_back</span> Назад</button>
                    <span class="fp-sm-card-title" style="margin:0;">${esc(typeLabel)}: ${esc(key)} · ${list.length} зак. · ${Math.round(revenue).toLocaleString('ru-RU')} ₽</span>
                </div>
                <div class="fp-sm-sr-list">${rows || emptyHTML('Нет заказов.')}</div>
            </div>`;
        const back = document.getElementById('fp-sm-filter-back');
        if (back) back.addEventListener('click', () => { currentView = null; render(); });
    }

    function bindModeBar() {
        const bar = document.getElementById('fpTools-stats-modebar');
        if (!bar || bar.dataset.bound) return;
        bar.dataset.bound = '1';
        bar.querySelectorAll('.fp-stats-mode-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                currentMode = btn.dataset.mode;
                bar.querySelectorAll('.fp-stats-mode-btn').forEach(b => b.classList.toggle('active', b === btn));
                try { localStorage.setItem(MODE_KEY, currentMode); } catch (_) {}
                render();
            });
        });
        // период меняется - перерисуем активный режим
        const period = document.getElementById('fpTools-stats-period');
        if (period && !period.dataset.smBound) {
            period.dataset.smBound = '1';
            period.addEventListener('change', () => { if (currentMode !== 'cards' || searchQuery) render(); });
        }
        // обновление данных
        if (chrome.storage && chrome.storage.onChanged) {
            chrome.storage.onChanged.addListener((changes, area) => {
                const _luk = (window.fptStatsCfg && window.fptStatsCfg.lastUpdateKey) || 'fpToolsSalesLastUpdate';
                if (area === 'local' && changes[_luk] && (currentMode !== 'cards' || searchQuery)) render();
            });
        }

        // поиск по заказам (обновление по Enter / кнопке, чтобы не лагало)
        const searchBar = document.getElementById('fpTools-stats-searchbar');
        const searchToggle = document.getElementById('fpTools-stats-search-toggle');
        const searchInput = document.getElementById('fpTools-stats-search');
        const searchBtn = document.getElementById('fpTools-stats-search-btn');
        const searchClear = document.getElementById('fpTools-stats-search-clear');
        if (searchToggle && !searchToggle.dataset.bound) {
            searchToggle.dataset.bound = '1';
            searchToggle.addEventListener('click', () => {
                const open = searchBar && searchBar.style.display !== 'none';
                if (!searchBar) return;
                if (open) {
                    searchBar.style.display = 'none';
                    if (searchInput) searchInput.value = '';
                    if (searchQuery) { searchQuery = ''; render(); }
                    searchToggle.classList.remove('active');
                } else {
                    searchBar.style.display = 'flex';
                    searchToggle.classList.add('active');
                    if (searchInput) searchInput.focus();
                }
            });
        }
        const runSearch = () => {
            searchQuery = (searchInput && searchInput.value || '').trim();
            render();
        };
        if (searchInput && !searchInput.dataset.bound) {
            searchInput.dataset.bound = '1';
            searchInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); runSearch(); } });
        }
        searchBtn && searchBtn.addEventListener('click', runSearch);
        searchClear && searchClear.addEventListener('click', () => {
            // Крестик ПОЛНОСТЬЮ закрывает поиск: чистит ввод, сбрасывает запрос,
            // прячет панель поиска и снимает подсветку кнопки-переключателя.
            if (searchInput) searchInput.value = '';
            searchQuery = '';
            if (searchBar) searchBar.style.display = 'none';
            if (searchToggle) searchToggle.classList.remove('active');
            render();
        });

        // ── фильтры и сортировка ──────────────────────────────────────────────
        const filterBar = document.getElementById('fpTools-stats-filterbar');
        const filterToggle = document.getElementById('fpTools-stats-filter-toggle');
        const fClosed = document.getElementById('fpFilt-st-closed');
        const fPaid = document.getElementById('fpFilt-st-paid');
        const fRefunded = document.getElementById('fpFilt-st-refunded');
        const fSort = document.getElementById('fpFilt-sort');
        const fReset = document.getElementById('fpFilt-reset');

        const setBtn = (btn, on) => { if (btn) btn.classList.toggle('active', !!on); };
        // выставить контролы из сохранённого состояния
        setBtn(fClosed, filters.stClosed);
        setBtn(fPaid, filters.stPaid);
        setBtn(fRefunded, filters.stRefunded);
        if (fSort) fSort.value = filters.sort;

        if (filterToggle && !filterToggle.dataset.bound) {
            filterToggle.dataset.bound = '1';
            filterToggle.addEventListener('click', () => {
                if (!filterBar) return;
                const open = filterBar.style.display !== 'none';
                filterBar.style.display = open ? 'none' : 'flex';
            });
        }
        const applyFilterChange = () => {
            filters.stClosed = fClosed ? fClosed.classList.contains('active') : true;
            filters.stPaid = fPaid ? fPaid.classList.contains('active') : true;
            filters.stRefunded = fRefunded ? fRefunded.classList.contains('active') : true;
            filters.sort = fSort ? fSort.value : 'date-desc';
            saveFilters();
            rerenderActive();
            // обновить и стандартные карточки (их считает ui_enhancements)
            if (typeof window.fptRefreshStatsCards === 'function') {
                try { window.fptRefreshStatsCards(); } catch (_) {}
            }
        };
        [fClosed, fPaid, fRefunded].forEach(btn => {
            if (btn && !btn.dataset.bound) {
                btn.dataset.bound = '1';
                btn.addEventListener('click', () => { btn.classList.toggle('active'); applyFilterChange(); });
            }
        });
        if (fSort && !fSort.dataset.bound) { fSort.dataset.bound = '1'; fSort.addEventListener('change', applyFilterChange); }
        if (fReset && !fReset.dataset.bound) {
            fReset.dataset.bound = '1';
            fReset.addEventListener('click', () => {
                filters = { stClosed: true, stPaid: true, stRefunded: _defRefunded, sort: 'date-desc' };
                setBtn(fClosed, true); setBtn(fPaid, true); setBtn(fRefunded, _defRefunded);
                if (fSort) fSort.value = 'date-desc';
                applyFilterChange();
            });
        }
    }

    function refreshFilterToggleState(btn) {
        // Кнопка фильтров - простой клон кнопки поиска, без фиолетовой подсветки.
        // (оставлено как заглушка, чтобы не трогать места вызова)
    }

    // Экспортируем состояние фильтров, чтобы ui_enhancements мог учитывать его в карточках.
    function fptGetStatsFilters() { return Object.assign({}, filters); }
    if (typeof window !== 'undefined') window.fptGetStatsFilters = fptGetStatsFilters;

    function initSalesModes() {
        const bar = document.getElementById('fpTools-stats-modebar');
        if (!bar) return;
        loadFilters();
        // восстановить последний режим
        try { currentMode = localStorage.getItem(MODE_KEY) || 'cards'; } catch (_) { currentMode = 'cards'; }
        bar.querySelectorAll('.fp-stats-mode-btn').forEach(b => b.classList.toggle('active', b.dataset.mode === currentMode));
        bindModeBar();
        render();
    }

    if (typeof window !== 'undefined') {
        window.initSalesModes = initSalesModes;
    }
})();
