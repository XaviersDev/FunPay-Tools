// content/features/finance.js
// Статистика ФИНАНСОВ на странице /account/balance.
// Считает не только заказы, а ВСЕ операции: пополнения, выводы, отмены выводов,
// заказы, прочее. Показывает приход/расход/нетто по валютам, разбивку по типам,
// помесячную динамику и полный кликабельный список операций.
//
// Данные собираются в фоне (FPTFinanceDB.update -> background -> /users/transactions),
// хранятся в отдельной IndexedDB. Автосбор при заходе + кнопка «Обновить».

(function () {
    'use strict';

    if (!/^\/account\/balance\/?$/.test(window.location.pathname)) return;

    // Глобальный тумблер «Показывать статистику финансов» (Что тебе нужно).
    function mountIfEnabled() {
        try {
            chrome.storage.local.get('showFinanceStats', ({ showFinanceStats }) => {
                if (showFinanceStats === false) return;
                mount();
            });
        } catch (_) { mount(); }
    }

    const SYM = { RUB: '₽', USD: '$', EUR: '€', UNKNOWN: '' };
    const TYPE_LABELS = {
        order: 'Заказы',
        payment: 'Пополнения',
        withdraw: 'Выводы',
        withdraw_cancel: 'Отмены выводов',
        other: 'Другое'
    };

    function esc(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, c => (
            { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    }
    function fmt(n) {
        const neg = n < 0;
        const v = Math.abs(Math.round(n)).toLocaleString('ru-RU');
        return (neg ? '−' : '') + v;
    }
    function money(n, cur) { return `${fmt(n)} ${SYM[cur] || cur || ''}`.trim(); }

    let _txns = [];
    let _period = 'all';

    function periodRange() {
        const oneDay = 86400000, MSK = 3 * 3600000, now = Date.now();
        const todayStart = Math.floor((now + MSK) / oneDay) * oneDay - MSK;
        let start = null, end = null;
        switch (_period) {
            case 'today': start = todayStart; break;
            case '7d': start = now - 7 * oneDay; break;
            case '30d': start = now - 30 * oneDay; break;
            case '90d': start = now - 90 * oneDay; break;
            case '365d': start = now - 365 * oneDay; break;
        }
        return { start, end };
    }
    function inPeriod(t) {
        const r = periodRange();
        if (r.start && t.date < r.start) return false;
        if (r.end && t.date > r.end) return false;
        return true;
    }

    // Только завершённые операции учитываем в деньгах; отменённые — отдельно.
    function effective() {
        return _txns.filter(t => t.status === 'complete' && inPeriod(t));
    }

    function aggregate() {
        const list = effective();
        const inByCur = {}, outByCur = {};
        const byType = {}; // type -> { in:{}, out:{}, count }
        const byMonth = {}; // 'YYYY-MM' -> { in:rub, out:rub }
        const byDay = {};   // 'YYYY-MM-DD' -> { in:rub, out:rub }
        const rates = { RUB: 1, USD: 90, EUR: 98, UNKNOWN: 0 }; // грубая нормализация к ₽ для графика
        for (const t of list) {
            const cur = t.currency || 'UNKNOWN';
            const acc = t.signed >= 0 ? inByCur : outByCur;
            acc[cur] = (acc[cur] || 0) + Math.abs(t.signed);
            if (!byType[t.type]) byType[t.type] = { in: {}, out: {}, count: 0 };
            const tacc = t.signed >= 0 ? byType[t.type].in : byType[t.type].out;
            tacc[cur] = (tacc[cur] || 0) + Math.abs(t.signed);
            byType[t.type].count++;
            const d = new Date(t.date);
            const mk = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
            const dk = `${mk}-${String(d.getDate()).padStart(2, '0')}`;
            const rub = Math.abs(t.signed) * (rates[cur] || 0);
            if (!byMonth[mk]) byMonth[mk] = { in: 0, out: 0 };
            if (!byDay[dk]) byDay[dk] = { in: 0, out: 0 };
            if (t.signed >= 0) { byMonth[mk].in += rub; byDay[dk].in += rub; }
            else { byMonth[mk].out += rub; byDay[dk].out += rub; }
        }
        return { list, inByCur, outByCur, byType, byMonth, byDay, count: list.length };
    }

    function sumLine(obj) {
        const parts = Object.entries(obj).filter(([c, v]) => v > 0 && c !== 'UNKNOWN')
            .map(([c, v]) => money(v, c));
        return parts.length ? parts.join(' · ') : '0 ₽';
    }
    function netLine(inObj, outObj) {
        const curs = new Set([...Object.keys(inObj), ...Object.keys(outObj)]);
        const parts = [];
        for (const c of curs) {
            if (c === 'UNKNOWN') continue;
            const net = (inObj[c] || 0) - (outObj[c] || 0);
            if (Math.abs(net) > 0.005) parts.push(money(net, c));
        }
        return parts.length ? parts.join(' · ') : '0 ₽';
    }

    function ensureStyles() {
        if (document.getElementById('fpt-fin-styles')) return;
        const css = document.createElement('style');
        css.id = 'fpt-fin-styles';
        css.textContent = `
        .fpt-fin{margin:0 0 26px;font-family:Inter,'Segoe UI',sans-serif;}
        .fpt-fin-head{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:18px;}
        .fpt-fin-head h2{font-size:21px;font-weight:800;margin:0;flex:1;color:var(--fpt-text,inherit);letter-spacing:-0.3px;}
        .fpt-fin-period{padding:8px 12px;border-radius:10px;border:1px solid var(--fpt-border,#e3e3ea);
            background:var(--fpt-surface-2,#fff);color:inherit;font-size:13px;cursor:pointer;font-weight:500;transition:border-color .15s;}
        .fpt-fin-period:hover{border-color:var(--fpt-text-muted,#b0b4c0);}
        .fpt-fin-btn{padding:8px 16px;border-radius:10px;border:1px solid var(--fpt-border,#e3e3ea);
            background:var(--fpt-surface-2,#fff);color:inherit;font-size:13px;cursor:pointer;font-weight:600;transition:all .15s;}
        .fpt-fin-btn:hover{border-color:#7c5cff;color:#7c5cff;box-shadow:0 2px 10px rgba(124,92,255,.12);}
        .fpt-fin-cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:13px;margin-bottom:18px;}
        .fpt-fin-card{position:relative;background:var(--fpt-surface-2,#fbfbfd);border:1px solid var(--fpt-border,#edeef2);
            border-radius:16px;padding:16px 16px 15px;cursor:pointer;transition:transform .12s cubic-bezier(.2,.8,.2,1),box-shadow .15s;overflow:hidden;}
        .fpt-fin-card::before{content:'';position:absolute;left:0;top:0;bottom:0;width:3px;background:var(--fpt-text-muted,#c8ccd8);opacity:.55;}
        .fpt-fin-card[data-fin-card="in"]::before{background:linear-gradient(180deg,#22c55e,#16a34a);opacity:1;}
        .fpt-fin-card[data-fin-card="out"]::before{background:linear-gradient(180deg,#f87171,#ef4444);opacity:1;}
        .fpt-fin-card[data-fin-card="net"]::before{background:linear-gradient(180deg,#7c5cff,#6d28d9);opacity:1;}
        .fpt-fin-card[data-fin-card="all"]::before{background:linear-gradient(180deg,#38bdf8,#0ea5e9);opacity:1;}
        .fpt-fin-card:hover{transform:translateY(-2px);box-shadow:0 10px 26px rgba(20,22,40,0.10);border-color:var(--fpt-text-muted,#d4d7e2);}
        .fpt-fin-card-label{font-size:11px;letter-spacing:.2px;color:var(--fpt-text-muted,#8b90a0);font-weight:600;margin-bottom:8px;}
        .fpt-fin-card-val{font-size:20px;font-weight:800;line-height:1.2;color:var(--fpt-text,inherit);letter-spacing:-0.5px;}
        .fpt-fin-in{color:#16a34a;} .fpt-fin-out{color:#ef4444;}
        .fpt-fin-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:14px;}
        @media(max-width:680px){.fpt-fin-grid{grid-template-columns:1fr;}}
        .fpt-fin-block{background:var(--fpt-surface-2,#fbfbfd);border:1px solid var(--fpt-border,#edeef2);
            border-radius:16px;padding:16px 18px;}
        .fpt-fin-block h3{font-size:11.5px;font-weight:700;margin:0 0 12px;color:var(--fpt-text-muted,#8b90a0);
            letter-spacing:.3px;text-transform:uppercase;}
        .fpt-fin-trow{display:flex;justify-content:space-between;align-items:baseline;gap:10px;
            padding:8px 0;border-bottom:1px solid var(--fpt-border,#f0f1f5);font-size:13px;cursor:pointer;transition:padding-left .12s;}
        .fpt-fin-trow:hover{padding-left:4px;}
        .fpt-fin-trow:last-child{border-bottom:none;}
        .fpt-fin-trow:hover .fpt-fin-tname{color:var(--fpt-accent,#ff6d15);text-decoration:underline;}
        .fpt-fin-tname{color:var(--fpt-text,inherit);}
        .fpt-fin-tcount{font-size:11px;color:var(--fpt-text-muted,#8a8a94);margin-left:6px;}
        .fpt-fin-tval{font-weight:700;white-space:nowrap;text-align:right;}
        .fpt-fin-bars{display:flex;flex-direction:column;gap:8px;}
        .fpt-fin-svg{margin-top:4px;}
        .fpt-fin-svgbar{transition:opacity .1s;}
        .fpt-fin-svgbar:hover{opacity:.8;}
        .fpt-fin-donut-row{display:flex;gap:14px;align-items:center;}
        .fpt-fin-legend{display:flex;flex-direction:column;gap:5px;min-width:0;flex:1;}
        .fpt-fin-leg{display:flex;align-items:center;gap:7px;font-size:11.5px;}
        .fpt-fin-dot{width:10px;height:10px;border-radius:2px;flex-shrink:0;}
        .fpt-fin-leg-l{color:var(--fpt-text,inherit);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;}
        .fpt-fin-leg-v{color:var(--fpt-text-muted,#8a8a94);white-space:nowrap;}
        .fpt-fin-loading{padding:32px;text-align:center;color:var(--fpt-text-muted,#8a8a94);font-size:14px;}
        .fpt-fin-spin{width:30px;height:30px;border:3px solid var(--fpt-border,#ddd);
            border-top-color:var(--fpt-accent,#ff6d15);border-radius:50%;animation:fptFinSpin .8s linear infinite;margin:0 auto 12px;}
        @keyframes fptFinSpin{to{transform:rotate(360deg)}}
        /* модалка списка операций */
        .fpt-fin-ov{position:fixed;inset:0;z-index:2147483600;display:flex;align-items:center;justify-content:center;
            background:rgba(8,9,14,0.62);backdrop-filter:blur(3px);}
        .fpt-fin-modal{width:min(640px,94vw);max-height:86vh;display:flex;flex-direction:column;
            background:var(--fpt-surface,#fff);color:var(--fpt-text,#1a1a1a);border:1px solid var(--fpt-border,#e3e3e8);
            border-radius:16px;box-shadow:0 20px 60px rgba(0,0,0,0.5);overflow:hidden;}
        .fpt-fin-mhead{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:15px 18px;
            border-bottom:1px solid var(--fpt-border,#ececf0);}
        .fpt-fin-mtitle{font-size:15px;font-weight:700;}
        .fpt-fin-msub{font-size:12px;color:var(--fpt-text-muted,#8a8a94);margin-top:2px;}
        .fpt-fin-mclose{background:none;border:none;font-size:22px;line-height:1;cursor:pointer;color:inherit;opacity:.7;}
        .fpt-fin-mclose:hover{opacity:1;}
        .fpt-fin-mtools{display:flex;gap:8px;padding:10px 18px 0;}
        .fpt-fin-msearch{flex:1;padding:8px 10px;border-radius:8px;font-size:13px;
            background:var(--fpt-surface-2,#f3f3f5);color:inherit;border:1px solid var(--fpt-border,#ddd);}
        .fpt-fin-msort{padding:8px 10px;border-radius:8px;font-size:13px;background:var(--fpt-surface-2,#f3f3f5);
            color:inherit;border:1px solid var(--fpt-border,#ddd);cursor:pointer;}
        .fpt-fin-mlist{padding:12px 18px 18px;overflow-y:auto;display:flex;flex-direction:column;gap:7px;}
        .fpt-fin-row{display:flex;justify-content:space-between;gap:10px;align-items:baseline;
            background:var(--fpt-surface-2,#f7f7f9);border:1px solid var(--fpt-border,#ececf0);border-radius:9px;padding:8px 11px;}
        .fpt-fin-rtitle{font-size:12.5px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
        .fpt-fin-rmeta{font-size:11px;color:var(--fpt-text-muted,#8a8a94);margin-top:3px;}
        .fpt-fin-rval{font-size:13px;font-weight:700;white-space:nowrap;}
        .fpt-fin-empty{padding:24px;text-align:center;color:var(--fpt-text-muted,#8a8a94);font-size:13px;}
        `;
        document.head.appendChild(css);
    }

    function txnRow(t) {
        const cur = t.currency || 'UNKNOWN';
        const valCls = t.signed >= 0 ? 'fpt-fin-in' : 'fpt-fin-out';
        const sign = t.signed >= 0 ? '+ ' : '− ';
        const d = t.date ? new Date(t.date) : null;
        const ds = d ? d.toLocaleDateString('ru-RU') + ' ' + d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }) : '';
        const statusTxt = t.status === 'cancel' ? 'Отменено' : (t.status === 'waiting' ? 'Ожидание' : 'Завершено');
        return `<div class="fpt-fin-row">
            <div style="min-width:0;">
                <div class="fpt-fin-rtitle">${esc(t.title || TYPE_LABELS[t.type] || 'Операция')}</div>
                <div class="fpt-fin-rmeta">${esc(TYPE_LABELS[t.type] || t.type)} · ${esc(statusTxt)} · ${esc(ds)}</div>
            </div>
            <div class="fpt-fin-rval ${valCls}">${sign}${money(Math.abs(t.signed), cur)}</div>
        </div>`;
    }

    function openList(title, list) {
        ensureStyles();
        const old = document.getElementById('fpt-fin-ov');
        if (old) old.remove();
        const ov = document.createElement('div');
        ov.id = 'fpt-fin-ov';
        ov.className = 'fpt-fin-ov';
        ov.innerHTML = `
            <div class="fpt-fin-modal">
                <div class="fpt-fin-mhead">
                    <div><div class="fpt-fin-mtitle">${esc(title)}</div>
                    <div class="fpt-fin-msub">${list.length} операц.</div></div>
                    <button class="fpt-fin-mclose" title="Закрыть">×</button>
                </div>
                <div class="fpt-fin-mtools">
                    <input class="fpt-fin-msearch" type="text" placeholder="Поиск по операциям…" autocomplete="off">
                    <select class="fpt-fin-msort">
                        <option value="date-desc">Сначала новые</option>
                        <option value="date-asc">Сначала старые</option>
                        <option value="amt-desc">Больше сумма</option>
                        <option value="amt-asc">Меньше сумма</option>
                    </select>
                </div>
                <div class="fpt-fin-mlist"></div>
            </div>`;
        document.body.appendChild(ov);
        const listEl = ov.querySelector('.fpt-fin-mlist');
        const searchEl = ov.querySelector('.fpt-fin-msearch');
        const sortEl = ov.querySelector('.fpt-fin-msort');
        const render = () => {
            let arr = list.slice();
            const q = searchEl.value.trim().toLowerCase();
            if (q) arr = arr.filter(t => (t.title || '').toLowerCase().includes(q) ||
                (TYPE_LABELS[t.type] || '').toLowerCase().includes(q));
            const v = sortEl.value;
            if (v === 'amt-desc') arr.sort((a, b) => Math.abs(b.signed) - Math.abs(a.signed));
            else if (v === 'amt-asc') arr.sort((a, b) => Math.abs(a.signed) - Math.abs(b.signed));
            else if (v === 'date-asc') arr.sort((a, b) => a.date - b.date);
            else arr.sort((a, b) => b.date - a.date);
            listEl.innerHTML = arr.length ? arr.map(txnRow).join('') : `<div class="fpt-fin-empty">Ничего не найдено.</div>`;
        };
        render();
        searchEl.addEventListener('input', render);
        sortEl.addEventListener('change', render);
        const close = () => ov.remove();
        ov.addEventListener('click', e => { if (e.target === ov) close(); });
        ov.querySelector('.fpt-fin-mclose').addEventListener('click', close);
        document.addEventListener('keydown', function onEsc(e) {
            if (e.key === 'Escape') { close(); document.removeEventListener('keydown', onEsc); }
        });
    }

    function periodLabel() {
        return { all: 'за всё время', today: 'за сегодня', '7d': 'за неделю',
            '30d': 'за месяц', '90d': 'за 3 месяца', '365d': 'за год' }[_period] || '';
    }

    const PALETTE = ['#ff6d15', '#2563eb', '#22c55e', '#a855f7', '#ef4444', '#14b8a6', '#eab308', '#ec4899'];

    // Столбчатый SVG-график в стиле статистики продаж: приход (зелёный) над осью,
    // расход (красный) под осью. keys — отсортированные периоды (месяцы/дни).
    function barChart(title, keys, getIn, getOut, labelFmt) {
        if (!keys.length) return `<div class="fpt-fin-block"><h3>${esc(title)}</h3><div class="fpt-fin-empty">Нет данных.</div></div>`;
        const W = 560, H = 220, PAD = { t: 16, r: 14, b: 30, l: 54 };
        const cw = W - PAD.l - PAD.r, ch = H - PAD.t - PAD.b;
        const ins = keys.map(getIn), outs = keys.map(getOut);
        const maxV = Math.max(1, ...ins, ...outs);
        const slot = cw / keys.length;
        const barW = Math.max(2, Math.min(22, slot / 2 - 2));
        const zeroY = PAD.t + ch / 2; // ноль по центру: приход вверх, расход вниз
        const half = ch / 2;
        let bars = '', xL = '', grid = '';
        const MIN_GAP = 44; const xlParts = [];
        keys.forEach((k, i) => {
            const xc = PAD.l + slot * i + slot / 2;
            const ih = (ins[i] / maxV) * half;
            const oh = (outs[i] / maxV) * half;
            bars += `<rect class="fpt-fin-svgbar" x="${xc - barW - 1}" y="${zeroY - ih}" width="${barW}" height="${ih}" rx="2" fill="#22c55e" data-tip="${esc(labelFmt(k, ins[i], outs[i]))}" tabindex="0"></rect>`;
            bars += `<rect class="fpt-fin-svgbar" x="${xc + 1}" y="${zeroY}" width="${barW}" height="${oh}" rx="2" fill="#ef4444" data-tip="${esc(labelFmt(k, ins[i], outs[i]))}" tabindex="0"></rect>`;
            const isLast = i === keys.length - 1;
            const lbl = k.length === 7 ? k.slice(5) + '.' + k.slice(2, 4) : k.slice(5);
            if (isLast) {
                const tx = Math.min(xc, W - PAD.r);
                while (xlParts.length && (tx - xlParts[xlParts.length - 1].x) < MIN_GAP) xlParts.pop();
                xlParts.push({ x: tx, anchor: 'end', label: lbl });
            } else if (!xlParts.length || (xc - xlParts[xlParts.length - 1].x) >= MIN_GAP) {
                xlParts.push({ x: xc, anchor: 'middle', label: lbl });
            }
        });
        xL = xlParts.map(p => `<text x="${p.x}" y="${H - 8}" text-anchor="${p.anchor}" font-size="9" fill="var(--fpt-text-muted,#8a8a94)">${esc(p.label)}</text>`).join('');
        // линия нуля + пара ориентиров
        grid += `<line x1="${PAD.l}" y1="${zeroY}" x2="${W - PAD.r}" y2="${zeroY}" stroke="var(--fpt-border,#ddd)" stroke-width="1"/>`;
        const topLbl = maxV >= 1000 ? Math.round(maxV / 1000) + 'к' : Math.round(maxV);
        grid += `<text x="${PAD.l - 6}" y="${PAD.t + 4}" text-anchor="end" font-size="9" fill="var(--fpt-text-muted,#8a8a94)">${topLbl}</text>`;
        grid += `<text x="${PAD.l - 6}" y="${zeroY + 3}" text-anchor="end" font-size="9" fill="var(--fpt-text-muted,#8a8a94)">0</text>`;
        grid += `<text x="${PAD.l - 6}" y="${PAD.t + ch + 2}" text-anchor="end" font-size="9" fill="var(--fpt-text-muted,#8a8a94)">${topLbl}</text>`;
        return `<div class="fpt-fin-block">
            <h3>${esc(title)}</h3>
            <svg class="fpt-fin-svg" viewBox="0 0 ${W} ${H}" width="100%" style="display:block;overflow:visible;">${grid}${bars}${xL}</svg>
            <div style="margin-top:6px;font-size:10.5px;color:var(--fpt-text-muted,#8a8a94);">
                <span style="color:#22c55e;">▮</span> приход &nbsp; <span style="color:#ef4444;">▮</span> расход &nbsp;(нормализовано к ₽)</div>
        </div>`;
    }

    // Кольцевая диаграмма (как в продажах) — доли по типам операций.
    function donut(title, entries, fmtVal) {
        const total = entries.reduce((s, e) => s + e.value, 0);
        if (!total) return `<div class="fpt-fin-block"><h3>${esc(title)}</h3><div class="fpt-fin-empty">Нет данных.</div></div>`;
        const cx = 70, cy = 70, r = 56, rin = 34;
        let acc = 0, paths = '', legend = '';
        entries.slice(0, 8).forEach((e, i) => {
            const frac = e.value / total;
            const a0 = acc * 2 * Math.PI - Math.PI / 2; acc += frac;
            const a1 = acc * 2 * Math.PI - Math.PI / 2;
            const large = frac > 0.5 ? 1 : 0;
            const x0 = cx + r * Math.cos(a0), y0 = cy + r * Math.sin(a0);
            const x1 = cx + r * Math.cos(a1), y1 = cy + r * Math.sin(a1);
            const xi1 = cx + rin * Math.cos(a1), yi1 = cy + rin * Math.sin(a1);
            const xi0 = cx + rin * Math.cos(a0), yi0 = cy + rin * Math.sin(a0);
            const col = PALETTE[i % PALETTE.length];
            paths += `<path d="M${x0},${y0} A${r},${r} 0 ${large} 1 ${x1},${y1} L${xi1},${yi1} A${rin},${rin} 0 ${large} 0 ${xi0},${yi0} Z" fill="${col}"></path>`;
            const vstr = fmtVal ? fmtVal(e.value) : String(e.value);
            legend += `<div class="fpt-fin-leg"><span class="fpt-fin-dot" style="background:${col}"></span><span class="fpt-fin-leg-l">${esc(e.label)}</span><span class="fpt-fin-leg-v">${Math.round(frac * 100)}% · ${esc(vstr)}</span></div>`;
        });
        return `<div class="fpt-fin-block">
            <h3>${esc(title)}</h3>
            <div class="fpt-fin-donut-row">
                <svg viewBox="0 0 140 140" width="130" height="130" style="flex-shrink:0;overflow:visible;">${paths}<text x="70" y="74" text-anchor="middle" font-size="13" font-weight="700" fill="var(--fpt-text,inherit)">${total}</text></svg>
                <div class="fpt-fin-legend">${legend}</div>
            </div>
        </div>`;
    }

    function attachChartTips(root) {
        let tip = document.getElementById('fpt-fin-tip');
        if (!tip) {
            tip = document.createElement('div');
            tip.id = 'fpt-fin-tip';
            tip.style.cssText = 'position:fixed;z-index:2147483647;pointer-events:none;display:none;' +
                'background:#11131a;color:#fff;font-size:12px;padding:5px 8px;border-radius:6px;' +
                'box-shadow:0 4px 14px rgba(0,0,0,.4);white-space:nowrap;';
            document.body.appendChild(tip);
        }
        root.querySelectorAll('.fpt-fin-svgbar').forEach(bar => {
            const show = (e) => {
                tip.textContent = bar.getAttribute('data-tip') || '';
                tip.style.display = 'block';
                const x = (e.touches ? e.touches[0].clientX : e.clientX);
                const y = (e.touches ? e.touches[0].clientY : e.clientY);
                tip.style.left = (x + 12) + 'px';
                tip.style.top = (y - 8) + 'px';
            };
            bar.addEventListener('mouseenter', show);
            bar.addEventListener('mousemove', show);
            bar.addEventListener('mouseleave', () => { tip.style.display = 'none'; });
            bar.style.cursor = 'default';
        });
    }

    function render() {
        const host = document.getElementById('fpt-fin-root');
        if (!host) return;
        const agg = aggregate();

        const typeRows = Object.keys(TYPE_LABELS).filter(t => agg.byType[t]).map(t => {
            const b = agg.byType[t];
            const net = netLine(b.in, b.out);
            return `<div class="fpt-fin-trow" data-fin-type="${t}">
                <span class="fpt-fin-tname">${esc(TYPE_LABELS[t])}<span class="fpt-fin-tcount">${b.count}</span></span>
                <span class="fpt-fin-tval">${esc(net)}</span>
            </div>`;
        }).join('') || '<div class="fpt-fin-empty">Нет операций за период.</div>';

        // График потока: для коротких периодов — по дням, иначе — по месяцам
        const useDaily = (_period === 'today' || _period === '7d' || _period === '30d');
        let flowChart;
        if (useDaily) {
            const dk = Object.keys(agg.byDay).sort().slice(-31);
            flowChart = barChart('Поток по дням (приход / расход)', dk,
                k => agg.byDay[k].in, k => agg.byDay[k].out,
                (k, i, o) => `${k}: +${fmt(i)} ₽ / −${fmt(o)} ₽`);
        } else {
            const mk = Object.keys(agg.byMonth).sort().slice(-12);
            flowChart = barChart('Поток по месяцам (приход / расход)', mk,
                k => agg.byMonth[k].in, k => agg.byMonth[k].out,
                (k, i, o) => `${k}: +${fmt(i)} ₽ / −${fmt(o)} ₽`);
        }

        // Донат по типам операций (по количеству)
        const typeEntries = Object.keys(TYPE_LABELS).filter(t => agg.byType[t])
            .map(t => ({ label: TYPE_LABELS[t], value: agg.byType[t].count }))
            .sort((a, b) => b.value - a.value);
        const typeDonut = donut('Операции по типам', typeEntries, v => v + ' шт.');

        host.innerHTML = `
            <div class="fpt-fin-cards">
                <div class="fpt-fin-card" data-fin-card="in">
                    <div class="fpt-fin-card-label">Поступления</div>
                    <div class="fpt-fin-card-val fpt-fin-in">${esc(sumLine(agg.inByCur))}</div>
                </div>
                <div class="fpt-fin-card" data-fin-card="out">
                    <div class="fpt-fin-card-label">Расходы (выводы и пр.)</div>
                    <div class="fpt-fin-card-val fpt-fin-out">${esc(sumLine(agg.outByCur))}</div>
                </div>
                <div class="fpt-fin-card" data-fin-card="net">
                    <div class="fpt-fin-card-label">Чистый поток</div>
                    <div class="fpt-fin-card-val">${esc(netLine(agg.inByCur, agg.outByCur))}</div>
                </div>
                <div class="fpt-fin-card" data-fin-card="all">
                    <div class="fpt-fin-card-label">Всего операций</div>
                    <div class="fpt-fin-card-val">${agg.count}</div>
                </div>
            </div>
            <div class="fpt-fin-grid">
                <div class="fpt-fin-block">
                    <h3>По типам операций</h3>
                    ${typeRows}
                </div>
                ${typeDonut}
            </div>
            <div style="margin-top:14px;">${flowChart}</div>`;

        attachChartTips(host);

        // клики по карточкам
        host.querySelectorAll('[data-fin-card]').forEach(card => {
            card.addEventListener('click', () => {
                const kind = card.getAttribute('data-fin-card');
                const eff = effective();
                let list, title;
                if (kind === 'in') { list = eff.filter(t => t.signed >= 0); title = 'Поступления ' + periodLabel(); }
                else if (kind === 'out') { list = eff.filter(t => t.signed < 0); title = 'Расходы ' + periodLabel(); }
                else { list = eff.slice(); title = 'Все операции ' + periodLabel(); }
                openList(title, list);
            });
        });
        // клики по строкам типов
        host.querySelectorAll('[data-fin-type]').forEach(row => {
            row.addEventListener('click', () => {
                const t = row.getAttribute('data-fin-type');
                const list = effective().filter(x => x.type === t);
                openList(TYPE_LABELS[t] + ' ' + periodLabel(), list);
            });
        });
    }

    function showLoading() {
        const host = document.getElementById('fpt-fin-root');
        if (host) host.innerHTML = `<div class="fpt-fin-loading"><div class="fpt-fin-spin"></div>
            Собираем историю операций с FunPay…<div id="fpt-fin-count" style="margin-top:6px;font-size:12px;"></div></div>`;
    }

    async function load(forceUpdate) {
        ensureStyles();
        _txns = await FPTFinanceDB.getAllAsArray();
        if (forceUpdate || _txns.length === 0) {
            showLoading();
            // живой счётчик
            const tick = setInterval(async () => {
                try {
                    const st = await chrome.storage.local.get(['fpToolsFinanceCount', 'fpToolsFinanceCollecting']);
                    const el = document.getElementById('fpt-fin-count');
                    if (el && st.fpToolsFinanceCount) el.textContent = `Загружено: ${st.fpToolsFinanceCount}`;
                    if (st.fpToolsFinanceCollecting === false) clearInterval(tick);
                } catch (_) { clearInterval(tick); }
            }, 600);
            await FPTFinanceDB.update();
            clearInterval(tick);
            _txns = await FPTFinanceDB.getAllAsArray();
        }
        render();
    }

    function mount() {
        if (document.getElementById('fpt-fin')) return;
        const anchor = document.querySelector('.tc-finance') || document.querySelector('.page-content-full');
        if (!anchor) return;
        ensureStyles();
        const block = document.createElement('div');
        block.id = 'fpt-fin';
        block.className = 'fpt-fin';
        block.innerHTML = `
            <div class="fpt-fin-head">
                <h2>Статистика финансов</h2>
                <select class="fpt-fin-period" id="fpt-fin-period">
                    <option value="all">Всё время</option>
                    <option value="today">Сегодня</option>
                    <option value="7d">7 дней</option>
                    <option value="30d">30 дней</option>
                    <option value="90d">3 месяца</option>
                    <option value="365d">Год</option>
                </select>
                <button class="fpt-fin-btn" id="fpt-fin-refresh">Обновить</button>
            </div>
            <div id="fpt-fin-root"></div>`;
        // вставляем НАД таблицей операций
        const tableWrap = document.querySelector('.tc-finance');
        if (tableWrap && tableWrap.parentElement) {
            tableWrap.parentElement.insertBefore(block, tableWrap);
        } else {
            anchor.insertBefore(block, anchor.firstChild);
        }
        document.getElementById('fpt-fin-period').addEventListener('change', (e) => {
            _period = e.target.value; render();
        });
        document.getElementById('fpt-fin-refresh').addEventListener('click', () => load(true));
        load(false);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', mountIfEnabled);
    } else {
        mountIfEnabled();
    }
})();
