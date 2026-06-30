// content/features/export_studio.js
// =============================================================================
// FP Tools — СТУДИЯ ЭКСПОРТА (Export Studio)
//
// Расширенный экспорт ПРОДАЖ, ПОКУПОК и ФИНАНСОВ в форматах XLSX, DOCX, PDF,
// CSV, JSON. Пользователь сам выбирает: формат, визуальный стиль (тему),
// период, валюту, набор колонок, сортировку, заголовок/подзаголовок и доп.
// опции (строка итогов, мини-сводка, водяной знак, нумерация).
//
// ВАЖНО: модуль полностью автономный — НЕ грузит внешних библиотек (это нарушило
// бы CSP MV3). XLSX и DOCX собираются как ZIP из OOXML-XML своими руками
// (zip без сжатия — валиден), PDF строится как нативный PDF-документ вручную.
//
// Кнопка «Экспорт» добавляется в панель статистики:
//   • /orders/trade      — продажи  (источник FPTSalesDB / window.fptOrdersDB)
//   • /orders/           — покупки  (источник FPTPurchasesDB / window.fptOrdersDB)
//   • /account/balance   — финансы  (источник FPTFinanceDB)
// =============================================================================

(function () {
    'use strict';

    // ──────────────────────────────────────────────────────────────────────────
    //  МАЛЕНЬКИЕ УТИЛИТЫ
    // ──────────────────────────────────────────────────────────────────────────
    const SYM = { RUB: '₽', USD: '$', EUR: '€', UNKNOWN: '' };
    function esc(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, c => (
            { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    }
    // экранирование для XML (XLSX/DOCX) — управляющие символы запрещены в OOXML
    function xml(s) {
        return String(s == null ? '' : s)
            .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '')
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
    }
    function pad(n) { return String(n).padStart(2, '0'); }
    function fmtDate(ts) {
        if (!ts) return '';
        const d = new Date(ts);
        return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`;
    }
    function fmtDateTime(ts) {
        if (!ts) return '';
        const d = new Date(ts);
        return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
    }
    function fmtMoney(v, cur) {
        const neg = v < 0;
        const s = Math.abs(Math.round((v || 0))).toLocaleString('ru-RU');
        return (neg ? '−' : '') + s + (cur ? ' ' + (SYM[cur] || cur) : '');
    }
    function nowStamp() {
        const d = new Date();
        return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}`;
    }
    function downloadBlob(bytes, mime, filename) {
        const blob = (bytes instanceof Blob) ? bytes : new Blob([bytes], { type: mime });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = filename;
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 4000);
    }

    // ──────────────────────────────────────────────────────────────────────────
    //  ZIP (store, без сжатия) — нужно для XLSX и DOCX
    //  Собираем валидный ZIP вручную: local headers + central dir + EOCD.
    // ──────────────────────────────────────────────────────────────────────────
    const CRC_TABLE = (() => {
        const t = new Uint32Array(256);
        for (let n = 0; n < 256; n++) {
            let c = n;
            for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
            t[n] = c >>> 0;
        }
        return t;
    })();
    function crc32(bytes) {
        let c = 0xFFFFFFFF;
        for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
        return (c ^ 0xFFFFFFFF) >>> 0;
    }
    const enc = new TextEncoder();
    function zipBuild(files) {
        // files: [{ name, data:Uint8Array }]
        const parts = [];
        const central = [];
        let offset = 0;
        const u16 = v => [v & 0xFF, (v >>> 8) & 0xFF];
        const u32 = v => [v & 0xFF, (v >>> 8) & 0xFF, (v >>> 16) & 0xFF, (v >>> 24) & 0xFF];
        for (const f of files) {
            const nameB = enc.encode(f.name);
            const data = f.data;
            const crc = crc32(data);
            const lh = [];
            lh.push(...u32(0x04034b50));     // local file header sig
            lh.push(...u16(20));             // version needed
            lh.push(...u16(0));              // flags
            lh.push(...u16(0));              // method = store
            lh.push(...u16(0), ...u16(0));   // mod time/date
            lh.push(...u32(crc));
            lh.push(...u32(data.length));    // comp size
            lh.push(...u32(data.length));    // uncomp size
            lh.push(...u16(nameB.length));
            lh.push(...u16(0));              // extra len
            const lhB = new Uint8Array(lh);
            parts.push(lhB, nameB, data);
            const ch = [];
            ch.push(...u32(0x02014b50));     // central dir sig
            ch.push(...u16(20), ...u16(20)); // version made/needed
            ch.push(...u16(0), ...u16(0));   // flags/method
            ch.push(...u16(0), ...u16(0));   // time/date
            ch.push(...u32(crc));
            ch.push(...u32(data.length), ...u32(data.length));
            ch.push(...u16(nameB.length), ...u16(0), ...u16(0)); // name/extra/comment len
            ch.push(...u16(0), ...u16(0));   // disk start / int attrs
            ch.push(...u32(0));              // ext attrs
            ch.push(...u32(offset));         // local header offset
            central.push(new Uint8Array(ch), nameB);
            offset += lhB.length + nameB.length + data.length;
        }
        const centralStart = offset;
        let centralSize = 0;
        for (const c of central) centralSize += c.length;
        const eocd = [];
        eocd.push(...u32(0x06054b50));
        eocd.push(...u16(0), ...u16(0));
        eocd.push(...u16(files.length), ...u16(files.length));
        eocd.push(...u32(centralSize), ...u32(centralStart));
        eocd.push(...u16(0));
        const all = [...parts, ...central, new Uint8Array(eocd)];
        let total = 0; for (const p of all) total += p.length;
        const out = new Uint8Array(total);
        let pos = 0;
        for (const p of all) { out.set(p, pos); pos += p.length; }
        return out;
    }
    function strBytes(s) { return enc.encode(s); }

    // ──────────────────────────────────────────────────────────────────────────
    //  ТЕМЫ / СТИЛИ (общая палитра для всех форматов)
    //  Каждая тема даёт цвета шапки, акцент, зебру, текст. HEX без #.
    // ──────────────────────────────────────────────────────────────────────────
    const THEMES = {
        funpay: { name: 'FunPay', accent: 'FF6D15', headerBg: 'FF6D15', headerText: 'FFFFFF', zebra: 'FFF3EB', text: '1A1A1A', total: 'FFE3D1', grid: 'F0D8C8' },
        midnight: { name: 'Тёмная ночь', accent: '7C5CFF', headerBg: '1E1B33', headerText: 'FFFFFF', zebra: 'F2F0FB', text: '15131F', total: 'E7E2FB', grid: 'D8D2F0' },
        emerald: { name: 'Изумруд', accent: '10B981', headerBg: '065F46', headerText: 'FFFFFF', zebra: 'ECFDF5', text: '0B1F17', total: 'D1FAE5', grid: 'BBE9D5' },
        ocean: { name: 'Океан', accent: '0EA5E9', headerBg: '075985', headerText: 'FFFFFF', zebra: 'EFF9FF', text: '0A1A24', total: 'D7EEFB', grid: 'C2E2F4' },
        ruby: { name: 'Рубин', accent: 'E11D48', headerBg: '881337', headerText: 'FFFFFF', zebra: 'FFF1F4', text: '24070E', total: 'FBD7DF', grid: 'F2C2CD' },
        gold: { name: 'Золото', accent: 'C79A2E', headerBg: '3A2E12', headerText: 'F8EFD6', zebra: 'FBF6E9', text: '2A2210', total: 'F0E2BE', grid: 'E5D6AC' },
        mono: { name: 'Минимал', accent: '111827', headerBg: '111827', headerText: 'FFFFFF', zebra: 'F4F4F5', text: '111827', total: 'E4E4E7', grid: 'D4D4D8' },
        candy: { name: 'Карамель', accent: 'EC4899', headerBg: '9D174D', headerText: 'FFFFFF', zebra: 'FDF2F8', text: '2A0A1B', total: 'FBD3E8', grid: 'F4BEDB' }
    };
    function hexToRgb(h) {
        h = h.replace('#', '');
        return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
    }
    function rgbToHex(r, g, b) {
        const c = v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
        return (c(r) + c(g) + c(b)).toUpperCase();
    }
    // смешать цвет с белым (t=0..1 → ближе к белому)
    function tint(hex, t) {
        const [r, g, b] = hexToRgb(hex);
        return rgbToHex(r + (255 - r) * t, g + (255 - g) * t, b + (255 - b) * t);
    }
    // затемнить цвет (t=0..1 → ближе к чёрному)
    function shade(hex, t) {
        const [r, g, b] = hexToRgb(hex);
        return rgbToHex(r * (1 - t), g * (1 - t), b * (1 - t));
    }
    // воспринимаемая яркость → выбираем контрастный текст шапки
    function luminance(hex) {
        const [r, g, b] = hexToRgb(hex);
        return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    }
    // Построить полную палитру отчёта из ОДНОГО акцентного цвета.
    function themeFromColor(hex) {
        hex = (hex || '#2563EB').replace('#', '');
        const accent = hex.toUpperCase();
        const headerBg = accent;
        const headerText = luminance(accent) > 0.6 ? '111827' : 'FFFFFF';
        return {
            name: 'custom',
            accent,
            headerBg,
            headerText,
            zebra: tint(accent, 0.90),   // очень светлый оттенок акцента
            text: '1A1A1A',
            total: tint(accent, 0.80),
            grid: tint(accent, 0.62)
        };
    }

    // (готовых цветов нет — цвет выбирается на спектре/пикере в UI)

    // expose namespace early
    const ES = {};
    window.FPTExportStudio = ES;
    function hslToHex(h, s, l) {
        s /= 100; l /= 100;
        const k = n => (n + h / 30) % 12;
        const a = s * Math.min(l, 1 - l);
        const f = n => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
        return rgbToHex(f(0) * 255, f(8) * 255, f(4) * 255);
    }
    function hexToHsl(hex) {
        let [r, g, b] = hexToRgb(hex); r /= 255; g /= 255; b /= 255;
        const max = Math.max(r, g, b), min = Math.min(r, g, b);
        let h = 0, s = 0, l = (max + min) / 2;
        if (max !== min) {
            const d = max - min;
            s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
            if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
            else if (max === g) h = (b - r) / d + 2;
            else h = (r - g) / d + 4;
            h *= 60;
        }
        return [Math.round(h), Math.round(s * 100), Math.round(l * 100)];
    }
    ES._util = { esc, xml, fmtDate, fmtDateTime, fmtMoney, downloadBlob, zipBuild, strBytes, THEMES, hexToRgb, SYM, nowStamp, themeFromColor, tint, shade, luminance, hslToHex, hexToHsl };
})();

// =============================================================================
//  FP Tools — Export Studio :: ГЕНЕРАТОРЫ ФОРМАТОВ + ДАТАСЕТЫ
// =============================================================================
(function () {
    'use strict';
    const ES = window.FPTExportStudio;
    const { xml, fmtDate, fmtDateTime, fmtMoney, downloadBlob, zipBuild, strBytes, THEMES, hexToRgb, SYM, nowStamp } = ES._util;

    // ──────────────────────────────────────────────────────────────────────────
    //  СХЕМЫ ДАННЫХ: какие колонки доступны для каждого источника
    //  key — поле; label — заголовок; w — ширина (символы, для xlsx/pdf);
    //  align — 'l'|'r'|'c'; get — извлечение значения (raw); disp — текст для вывода.
    // ──────────────────────────────────────────────────────────────────────────
    const ST_SALES = { closed: 'Закрыт', paid: 'Оплачен', refunded: 'Возврат' };
    const FIN_TYPES = { order: 'Заказ', payment: 'Пополнение', withdraw: 'Вывод', withdraw_cancel: 'Отмена вывода', other: 'Другое' };
    const FIN_STATUS = { complete: 'Завершено', cancel: 'Отменено', waiting: 'Ожидание' };

    function ordersSchema(isPurchases) {
        const party = isPurchases ? 'Продавец' : 'Покупатель';
        return [
            { key: 'orderId', label: '№ заказа', w: 12, align: 'l', get: o => o.orderId || '', disp: o => o.orderId ? '#' + o.orderId : '' },
            { key: 'date', label: 'Дата', w: 17, align: 'l', get: o => o.orderDate || 0, disp: o => fmtDateTime(o.orderDate), num: false },
            { key: 'description', label: 'Товар / описание', w: 40, align: 'l', get: o => o.description || '', disp: o => o.description || o.subcategoryName || 'Заказ' },
            { key: 'category', label: 'Категория', w: 22, align: 'l', get: o => o.subcategoryName || '', disp: o => o.subcategoryName || '' },
            { key: 'party', label: party, w: 18, align: 'l', get: o => o.buyerUsername || '', disp: o => o.buyerUsername || '' },
            { key: 'status', label: 'Статус', w: 12, align: 'c', get: o => o.orderStatus || '', disp: o => ST_SALES[o.orderStatus] || o.orderStatus || '' },
            { key: 'price', label: 'Сумма', w: 12, align: 'r', get: o => (o.price || 0), disp: o => fmtMoney(o.price, o.currency), num: true },
            { key: 'currency', label: 'Валюта', w: 8, align: 'c', get: o => o.currency || '', disp: o => o.currency || '' },
            { key: 'link', label: 'Ссылка', w: 34, align: 'l', get: o => o.orderId ? 'https://funpay.com/orders/' + o.orderId + '/' : '', disp: o => o.orderId ? 'https://funpay.com/orders/' + o.orderId + '/' : '' }
        ];
    }
    function financeSchema() {
        return [
            { key: 'date', label: 'Дата', w: 17, align: 'l', get: t => t.date || 0, disp: t => fmtDateTime(t.date) },
            { key: 'title', label: 'Операция', w: 40, align: 'l', get: t => t.title || '', disp: t => t.title || FIN_TYPES[t.type] || 'Операция' },
            { key: 'type', label: 'Тип', w: 16, align: 'l', get: t => t.type || '', disp: t => FIN_TYPES[t.type] || t.type || '' },
            { key: 'status', label: 'Статус', w: 12, align: 'c', get: t => t.status || '', disp: t => FIN_STATUS[t.status] || t.status || '' },
            { key: 'amount', label: 'Сумма', w: 14, align: 'r', get: t => (t.signed || 0), disp: t => (t.signed >= 0 ? '+ ' : '− ') + fmtMoney(Math.abs(t.signed), t.currency), num: true },
            { key: 'currency', label: 'Валюта', w: 8, align: 'c', get: t => t.currency || '', disp: t => t.currency || '' }
        ];
    }

    ES.schemaFor = function (kind, isPurchases) {
        return kind === 'finance' ? financeSchema() : ordersSchema(isPurchases);
    };

    // ──────────────────────────────────────────────────────────────────────────
    //  АГРЕГАТЫ ИТОГОВ (для строки «Итого» и мини-сводки)
    // ──────────────────────────────────────────────────────────────────────────
    ES.summarize = function (kind, rows) {
        if (kind === 'finance') {
            const inByCur = {}, outByCur = {};
            for (const t of rows) {
                if (t.status !== 'complete') continue;
                const cur = t.currency || 'UNKNOWN';
                if (t.signed >= 0) inByCur[cur] = (inByCur[cur] || 0) + Math.abs(t.signed);
                else outByCur[cur] = (outByCur[cur] || 0) + Math.abs(t.signed);
            }
            const curs = new Set([...Object.keys(inByCur), ...Object.keys(outByCur)]);
            const net = {};
            curs.forEach(c => { if (c !== 'UNKNOWN') net[c] = (inByCur[c] || 0) - (outByCur[c] || 0); });
            return { kind, count: rows.length, inByCur, outByCur, net };
        }
        const byCur = {};
        let valid = 0;
        for (const o of rows) {
            if (o.orderStatus === 'closed' || o.orderStatus === 'paid') {
                const c = o.currency || 'UNKNOWN';
                byCur[c] = (byCur[c] || 0) + (o.price || 0);
                valid++;
            }
        }
        return { kind, count: rows.length, valid, byCur };
    };
    function summaryLines(sum) {
        const lines = [];
        if (sum.kind === 'finance') {
            const join = o => Object.entries(o).filter(([c, v]) => c !== 'UNKNOWN' && Math.abs(v) > 0.5).map(([c, v]) => fmtMoney(v, c)).join(' · ') || '0';
            lines.push(['Операций', String(sum.count)]);
            lines.push(['Поступления', join(sum.inByCur)]);
            lines.push(['Расходы', join(sum.outByCur)]);
            lines.push(['Чистый поток', join(sum.net)]);
        } else {
            const join = o => Object.entries(o).filter(([c, v]) => c !== 'UNKNOWN').map(([c, v]) => fmtMoney(v, c)).join(' · ') || '0';
            lines.push(['Всего записей', String(sum.count)]);
            lines.push(['Учтено (закрыт/оплачен)', String(sum.valid)]);
            lines.push(['Оборот', join(sum.byCur)]);
        }
        return lines;
    }
    ES._summaryLines = summaryLines;

    // ──────────────────────────────────────────────────────────────────────────
    //  CSV
    // ──────────────────────────────────────────────────────────────────────────
    ES.buildCSV = function (cols, rows, opt) {
        const sep = opt.csvSep || ';';
        const q = s => {
            s = String(s == null ? '' : s);
            return /[";\n\r,]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
        };
        const lines = [];
        lines.push(cols.map(c => q(c.label)).join(sep));
        for (const r of rows) lines.push(cols.map(c => q(c.disp(r))).join(sep));
        if (opt.totals) {
            const sum = ES.summarize(opt.kind, rows);
            lines.push('');
            ES._summaryLines(sum).forEach(([k, v]) => lines.push(q(k) + sep + q(v)));
        }
        // BOM для корректной кириллицы в Excel
        return new Blob(['\uFEFF' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
    };

    // ──────────────────────────────────────────────────────────────────────────
    //  JSON
    // ──────────────────────────────────────────────────────────────────────────
    ES.buildJSON = function (cols, rows, opt) {
        const out = {
            meta: {
                title: opt.title, subtitle: opt.subtitle, kind: opt.kind,
                generated: new Date().toISOString(), period: opt.periodLabel, count: rows.length,
                source: 'FunPay Tools — Export Studio'
            },
            columns: cols.map(c => ({ key: c.key, label: c.label })),
            rows: rows.map(r => {
                const o = {};
                cols.forEach(c => { o[c.key] = c.num ? Number(c.get(r)) : c.get(r); });
                return o;
            })
        };
        if (opt.totals) out.summary = ES.summarize(opt.kind, rows);
        return new Blob([JSON.stringify(out, null, 2)], { type: 'application/json' });
    };

    // ──────────────────────────────────────────────────────────────────────────
    //  XLSX (OOXML SpreadsheetML, собранный вручную в ZIP)
    //  Стили: тема задаёт цвет шапки/зебры; деньги — числовой формат; заголовок
    //  и подзаголовок над таблицей; закрепление строки заголовков; авто-ширины.
    // ──────────────────────────────────────────────────────────────────────────
    function colLetter(n) { // 1->A
        let s = '';
        while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = (n - m - 1) / 26; }
        return s;
    }
    ES.buildXLSX = function (cols, rows, opt) {
        const th = opt.themeObj || ES._util.themeFromColor(opt.color || '#2563EB');
        const titleRows = (opt.title ? 1 : 0) + (opt.subtitle ? 1 : 0) + 1; // +1 пустая
        const headerRowIdx = titleRows + 1;

        // ── styles.xml ──
        // числовой формат денег
        const numFmt = '#,##0\\ "' + (SYM.RUB) + '";[Red]\\-#,##0\\ "' + SYM.RUB + '"';
        const fills = [
            '<fill><patternFill patternType="none"/></fill>',
            '<fill><patternFill patternType="gray125"/></fill>',
            `<fill><patternFill patternType="solid"><fgColor rgb="FF${th.headerBg}"/><bgColor indexed="64"/></patternFill></fill>`, // 2 header
            `<fill><patternFill patternType="solid"><fgColor rgb="FF${th.zebra}"/><bgColor indexed="64"/></patternFill></fill>`,    // 3 zebra
            `<fill><patternFill patternType="solid"><fgColor rgb="FF${th.total}"/><bgColor indexed="64"/></patternFill></fill>`     // 4 total
        ];
        const fonts = [
            '<font><sz val="11"/><name val="Calibri"/><color theme="1"/></font>',                         // 0 default
            `<font><b/><sz val="11"/><name val="Calibri"/><color rgb="FF${th.headerText}"/></font>`,        // 1 header
            `<font><b/><sz val="18"/><name val="Calibri"/><color rgb="FF${th.accent}"/></font>`,            // 2 title
            `<font><sz val="11"/><name val="Calibri"/><color rgb="FF808080"/></font>`,                      // 3 subtitle
            '<font><b/><sz val="11"/><name val="Calibri"/><color theme="1"/></font>'                        // 4 total bold
        ];
        const border = `<border><left style="thin"><color rgb="FF${th.grid}"/></left><right style="thin"><color rgb="FF${th.grid}"/></right><top style="thin"><color rgb="FF${th.grid}"/></top><bottom style="thin"><color rgb="FF${th.grid}"/></bottom></border>`;
        const borders = ['<border/>', border];
        // cellXfs: 0 default,1 header,2 zebra,3 money,4 money-zebra,5 title,6 subtitle,7 total,8 total-money,9 center,10 center-zebra
        const xf = (o) => `<xf numFmtId="${o.n || 0}" fontId="${o.f || 0}" fillId="${o.fl || 0}" borderId="${o.b || 0}" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="${o.a || 'left'}" vertical="center" wrapText="${o.w ? 1 : 0}"/></xf>`;
        const cellXfs = [
            xf({}),                                   // 0 default left
            xf({ f: 1, fl: 2, b: 1, a: 'left' }),     // 1 header
            xf({ fl: 3, b: 1 }),                      // 2 zebra left
            xf({ n: 164, b: 1, a: 'right' }),         // 3 money
            xf({ n: 164, fl: 3, b: 1, a: 'right' }),  // 4 money zebra
            xf({ f: 2 }),                             // 5 title
            xf({ f: 3 }),                             // 6 subtitle
            xf({ f: 4, fl: 4, b: 1 }),                // 7 total left
            xf({ n: 164, f: 4, fl: 4, b: 1, a: 'right' }), // 8 total money
            xf({ b: 1, a: 'center' }),                // 9 center
            xf({ fl: 3, b: 1, a: 'center' })          // 10 center zebra
        ];
        const stylesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="1"><numFmt numFmtId="164" formatCode="${xml(numFmt)}"/></numFmts>
<fonts count="${fonts.length}">${fonts.join('')}</fonts>
<fills count="${fills.length}">${fills.join('')}</fills>
<borders count="${borders.length}">${borders.join('')}</borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="${cellXfs.length}">${cellXfs.join('')}</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;

        // ── sheet1.xml ──
        const lastCol = colLetter(cols.length);
        const sheetRows = [];
        let rIdx = 1;
        const cell = (col, r, styleId, type, val) => {
            const ref = colLetter(col) + r;
            if (type === 'n') return `<c r="${ref}" s="${styleId}"><v>${val}</v></c>`;
            if (val === '' || val == null) return `<c r="${ref}" s="${styleId}"/>`;
            return `<c r="${ref}" s="${styleId}" t="inlineStr"><is><t xml:space="preserve">${xml(val)}</t></is></c>`;
        };
        // title / subtitle
        if (opt.title) { sheetRows.push(`<row r="${rIdx}" ht="26" customHeight="1">${cell(1, rIdx, 5, 's', opt.title)}</row>`); rIdx++; }
        if (opt.subtitle) { sheetRows.push(`<row r="${rIdx}" ht="16" customHeight="1">${cell(1, rIdx, 6, 's', opt.subtitle)}</row>`); rIdx++; }
        sheetRows.push(`<row r="${rIdx}"></row>`); rIdx++; // spacer
        // header
        let hc = '';
        cols.forEach((c, i) => { hc += cell(i + 1, rIdx, 1, 's', c.label); });
        sheetRows.push(`<row r="${rIdx}" ht="22" customHeight="1">${hc}</row>`); rIdx++;
        const headerRow = rIdx - 1;
        // data
        rows.forEach((rec, n) => {
            const zebra = opt.zebra && (n % 2 === 1);
            let rc = '';
            cols.forEach((c, i) => {
                const v = c.get(rec);
                if (c.num) {
                    rc += cell(i + 1, rIdx, zebra ? 4 : 3, 'n', Number(v) || 0);
                } else {
                    const styleId = c.align === 'c' ? (zebra ? 10 : 9) : (zebra ? 2 : 0);
                    rc += cell(i + 1, rIdx, styleId, 's', c.disp(rec));
                }
            });
            sheetRows.push(`<row r="${rIdx}">${rc}</row>`); rIdx++;
        });
        // totals
        if (opt.totals) {
            sheetRows.push(`<row r="${rIdx}"></row>`); rIdx++;
            ES._summaryLines(ES.summarize(opt.kind, rows)).forEach(([k, v]) => {
                let rc = cell(1, rIdx, 7, 's', k);
                rc += cell(2, rIdx, 7, 's', v);
                for (let i = 2; i < cols.length; i++) rc += cell(i + 1, rIdx, 7, 's', '');
                sheetRows.push(`<row r="${rIdx}">${rc}</row>`); rIdx++;
            });
        }
        // column widths
        let colsXml = '<cols>';
        cols.forEach((c, i) => { colsXml += `<col min="${i + 1}" max="${i + 1}" width="${Math.max(8, c.w || 14)}" customWidth="1"/>`; });
        colsXml += '</cols>';
        // merge title across columns
        const merges = [];
        if (opt.title) merges.push(`A1:${lastCol}1`);
        if (opt.subtitle) merges.push(`A2:${lastCol}2`);
        const mergeXml = merges.length ? `<mergeCells count="${merges.length}">${merges.map(m => `<mergeCell ref="${m}"/>`).join('')}</mergeCells>` : '';
        const freeze = `<sheetView workbookViewId="0"><pane ySplit="${headerRow}" topLeftCell="A${headerRow + 1}" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A${headerRow + 1}" sqref="A${headerRow + 1}"/></sheetView>`;
        const sheetXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews>${freeze}</sheetViews>${colsXml}<sheetData>${sheetRows.join('')}</sheetData>${mergeXml}<pageMargins left="0.4" right="0.4" top="0.5" bottom="0.5" header="0.3" footer="0.3"/></worksheet>`;

        const sheetName = (opt.kind === 'finance' ? 'Финансы' : (opt.isPurchases ? 'Покупки' : 'Продажи'));
        const files = [
            { name: '[Content_Types].xml', data: strBytes(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`) },
            { name: '_rels/.rels', data: strBytes(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`) },
            { name: 'xl/workbook.xml', data: strBytes(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${xml(sheetName)}" sheetId="1" r:id="rId1"/></sheets></workbook>`) },
            { name: 'xl/_rels/workbook.xml.rels', data: strBytes(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`) },
            { name: 'xl/styles.xml', data: strBytes(stylesXml) },
            { name: 'xl/worksheets/sheet1.xml', data: strBytes(sheetXml) }
        ];
        return new Blob([zipBuild(files)], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    };

    // ──────────────────────────────────────────────────────────────────────────
    //  DOCX (WordprocessingML, собранный вручную в ZIP)
    //  Заголовок крупным акцентным цветом, подзаголовок серым, цветная таблица
    //  с шапкой темы и зеброй, строки итогов.
    // ──────────────────────────────────────────────────────────────────────────
    function wpText(t, opt) {
        opt = opt || {};
        const rpr = [];
        if (opt.b) rpr.push('<w:b/>');
        if (opt.color) rpr.push(`<w:color w:val="${opt.color}"/>`);
        if (opt.sz) rpr.push(`<w:sz w:val="${opt.sz}"/>`);
        rpr.push('<w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/>');
        return `<w:r><w:rPr>${rpr.join('')}</w:rPr><w:t xml:space="preserve">${xml(t)}</w:t></w:r>`;
    }
    function wpPara(runs, opt) {
        opt = opt || {};
        const ppr = [];
        const jc = opt.align === 'r' ? 'right' : opt.align === 'c' ? 'center' : 'left';
        ppr.push(`<w:jc w:val="${jc}"/>`);
        if (opt.spacing) ppr.push(`<w:spacing w:after="${opt.spacing}" w:line="240" w:lineRule="auto"/>`);
        else ppr.push('<w:spacing w:after="40" w:line="240" w:lineRule="auto"/>');
        if (opt.shade) ppr.push(`<w:shd w:val="clear" w:color="auto" w:fill="${opt.shade}"/>`);
        return `<w:p><w:pPr>${ppr.join('')}</w:pPr>${runs}</w:p>`;
    }
    function tcell(text, opt) {
        opt = opt || {};
        const tcPr = [];
        if (opt.w) tcPr.push(`<w:tcW w:w="${opt.w}" w:type="dxa"/>`);
        if (opt.fill) tcPr.push(`<w:shd w:val="clear" w:color="auto" w:fill="${opt.fill}"/>`);
        tcPr.push('<w:vAlign w:val="center"/>');
        tcPr.push('<w:tcMar><w:top w:w="40" w:type="dxa"/><w:left w:w="80" w:type="dxa"/><w:bottom w:w="40" w:type="dxa"/><w:right w:w="80" w:type="dxa"/></w:tcMar>');
        const run = wpText(text, { b: opt.b, color: opt.color, sz: opt.sz || 18 });
        return `<w:tc><w:tcPr>${tcPr.join('')}</w:tcPr>${wpPara(run, { align: opt.align, spacing: 0 })}</w:tc>`;
    }
    ES.buildDOCX = function (cols, rows, opt) {
        const th = opt.themeObj || ES._util.themeFromColor(opt.color || '#2563EB');
        const totalW = 9600; // twips, A4 landscape usable ~ 14400; portrait ~9360
        const land = opt.orientation === 'landscape';
        const usable = land ? 14400 : 9360;
        const sumW = cols.reduce((s, c) => s + (c.w || 14), 0);
        const colW = cols.map(c => Math.round(usable * (c.w || 14) / sumW));

        const body = [];
        if (opt.title) body.push(wpPara(wpText(opt.title, { b: true, sz: 40, color: th.accent }), { spacing: 60 }));
        if (opt.subtitle) body.push(wpPara(wpText(opt.subtitle, { sz: 20, color: '808080' }), { spacing: 160 }));

        // table
        const gridCols = colW.map(w => `<w:gridCol w:w="${w}"/>`).join('');
        const rowsXml = [];
        // header
        const hcells = cols.map((c, i) => tcell(c.label, { w: colW[i], fill: th.headerBg, color: th.headerText, b: true, align: c.align === 'r' ? 'r' : c.align === 'c' ? 'c' : 'l' })).join('');
        rowsXml.push(`<w:tr><w:trPr><w:tblHeader/></w:trPr>${hcells}</w:tr>`);
        // data
        rows.forEach((rec, n) => {
            const fill = (opt.zebra && n % 2 === 1) ? th.zebra : null;
            const cells = cols.map((c, i) => tcell(c.disp(rec), { w: colW[i], fill, align: c.align === 'r' ? 'r' : c.align === 'c' ? 'c' : 'l' })).join('');
            rowsXml.push(`<w:tr>${cells}</w:tr>`);
        });
        const borders = `<w:tblBorders><w:top w:val="single" w:sz="4" w:color="${th.grid}"/><w:left w:val="single" w:sz="4" w:color="${th.grid}"/><w:bottom w:val="single" w:sz="4" w:color="${th.grid}"/><w:right w:val="single" w:sz="4" w:color="${th.grid}"/><w:insideH w:val="single" w:sz="4" w:color="${th.grid}"/><w:insideV w:val="single" w:sz="4" w:color="${th.grid}"/></w:tblBorders>`;
        const table = `<w:tbl><w:tblPr><w:tblW w:w="${usable}" w:type="dxa"/>${borders}<w:tblLayout w:type="fixed"/></w:tblPr><w:tblGrid>${gridCols}</w:tblGrid>${rowsXml.join('')}</w:tbl>`;
        body.push(table);

        if (opt.totals) {
            body.push(wpPara(wpText('', {}), { spacing: 120 }));
            body.push(wpPara(wpText('Итоги', { b: true, sz: 24, color: th.accent }), { spacing: 80 }));
            ES._summaryLines(ES.summarize(opt.kind, rows)).forEach(([k, v]) => {
                body.push(wpPara(wpText(k + ':  ', { b: true, sz: 20 }) + wpText(v, { sz: 20 }), { spacing: 40 }));
            });
        }
        if (opt.watermark) {
            body.push(wpPara(wpText('Сгенерировано в FunPay Tools · Export Studio · ' + fmtDateTime(Date.now()), { sz: 16, color: 'A0A0A0' }), { spacing: 0, align: 'c' }));
        }

        const sect = land
            ? '<w:sectPr><w:pgSz w:w="16838" w:h="11906" w:orient="landscape"/><w:pgMar w:top="720" w:right="720" w:bottom="720" w:left="720"/></w:sectPr>'
            : '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1000" w:right="1000" w:bottom="1000" w:left="1000"/></w:sectPr>';

        const docXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body.join('')}${sect}</w:body></w:document>`;

        const files = [
            { name: '[Content_Types].xml', data: strBytes(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`) },
            { name: '_rels/.rels', data: strBytes(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`) },
            { name: 'word/document.xml', data: strBytes(docXml) }
        ];
        return new Blob([zipBuild(files)], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
    };

    // ──────────────────────────────────────────────────────────────────────────
    //  PDF — рисуем страницы на <canvas> (идеальная кириллица + любой стиль),
    //  каждую страницу вставляем PNG-картинкой в нативный PDF. Без библиотек.
    // ──────────────────────────────────────────────────────────────────────────
    function canvasPages(cols, rows, opt) {
        const th = opt.themeObj || ES._util.themeFromColor(opt.color || '#2563EB');
        const land = opt.orientation === 'landscape';
        const scale = 2; // ретина
        // размеры страницы в "точках" (pt) при 72dpi: A4 = 595x842
        const PW = (land ? 842 : 595);
        const PH = (land ? 595 : 842);
        const W = PW * scale, H = PH * scale;
        const M = 36 * scale; // поля
        const accent = '#' + th.accent, headBg = '#' + th.headerBg, headTx = '#' + th.headerText;
        const zebra = '#' + th.zebra, textCol = '#' + th.text, gridCol = '#' + th.grid, totalBg = '#' + th.total;

        // ── авто-подбор: измеряем реальную ширину текста в каждой колонке и
        //    подбираем размер шрифта так, чтобы ВСЁ влезло без обрезки «…» ──
        const innerW = W - M * 2;
        const padX = 10 * scale;      // отступ текста внутри ячейки
        const headH = 26 * scale;
        const FS_MAX = 11 * scale;    // желаемый кегль
        const FS_MIN = 5.5 * scale;   // минимальный, ниже не опускаемся

        // измеритель: максимальная ширина контента колонки при заданном кегле
        const _mcv = document.createElement('canvas');
        const _mctx = _mcv.getContext('2d');
        function colContentWidth(c, fs) {
            _mctx.font = `bold ${fs}px Inter, Arial, sans-serif`;
            let max = _mctx.measureText(String(c.label)).width;
            _mctx.font = `${fs}px Inter, Arial, sans-serif`;
            for (const rec of rows) {
                const t = String(c.disp(rec) == null ? '' : c.disp(rec));
                const w = _mctx.measureText(t).width;
                if (w > max) max = w;
            }
            return max;
        }
        // ищем самый большой кегль, при котором сумма колонок ≤ доступной ширины
        let fontBase = FS_MAX, colW = null;
        for (let fs = FS_MAX; fs >= FS_MIN; fs -= 0.5 * scale) {
            const widths = cols.map(c => colContentWidth(c, fs) + padX * 2);
            const total = widths.reduce((s, w) => s + w, 0);
            if (total <= innerW) {
                // влезает: распределим остаток пропорционально, чтобы заполнить ширину
                const extra = innerW - total;
                colW = widths.map(w => w + extra * (w / total));
                fontBase = fs;
                break;
            }
        }
        // если даже на минимальном кегле не влезло — масштабируем ширины вниз
        // (текст всё равно рисуем целиком; на практике айди/суммы помещаются)
        if (!colW) {
            fontBase = FS_MIN;
            const widths = cols.map(c => colContentWidth(c, FS_MIN) + padX * 2);
            const total = widths.reduce((s, w) => s + w, 0);
            const k = innerW / total;
            colW = widths.map(w => w * k);
        }

        const rowH = Math.max(16 * scale, fontBase + 9 * scale);
        const pages = [];
        let cv, ctx, y;

        function newPage(withTitle) {
            cv = document.createElement('canvas');
            cv.width = W; cv.height = H;
            ctx = cv.getContext('2d');
            ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, W, H);
            ctx.textBaseline = 'middle';
            y = M;
            if (withTitle && opt.title) {
                ctx.fillStyle = accent;
                ctx.font = `bold ${20 * scale}px Inter, Arial, sans-serif`;
                ctx.textAlign = 'left';
                ctx.fillText(opt.title, M, y + 14 * scale);
                y += 30 * scale;
                if (opt.subtitle) {
                    ctx.fillStyle = '#8a8a94';
                    ctx.font = `${11 * scale}px Inter, Arial, sans-serif`;
                    ctx.fillText(opt.subtitle, M, y + 8 * scale);
                    y += 22 * scale;
                }
                y += 6 * scale;
            }
        }
        function drawHeader() {
            ctx.fillStyle = headBg;
            roundRect(ctx, M, y, innerW, headH, 6 * scale); ctx.fill();
            let x = M;
            ctx.font = `bold ${fontBase}px Inter, Arial, sans-serif`;
            ctx.fillStyle = headTx;
            cols.forEach((c, i) => {
                const w = colW[i];
                ctx.textAlign = c.align === 'r' ? 'right' : c.align === 'c' ? 'center' : 'left';
                const tx = c.align === 'r' ? x + w - padX : c.align === 'c' ? x + w / 2 : x + padX;
                ctx.fillText(String(c.label), tx, y + headH / 2);
                x += w;
            });
            y += headH;
        }
        function roundRect(c, x, yy, w, h, r) {
            c.beginPath();
            c.moveTo(x + r, yy); c.arcTo(x + w, yy, x + w, yy + h, r);
            c.arcTo(x + w, yy + h, x, yy + h, r); c.arcTo(x, yy + h, x, yy, r);
            c.arcTo(x, yy, x + w, yy, r); c.closePath();
        }
        function drawRow(rec, n) {
            if (opt.zebra && n % 2 === 1) { ctx.fillStyle = zebra; ctx.fillRect(M, y, innerW, rowH); }
            ctx.strokeStyle = gridCol; ctx.lineWidth = 1;
            ctx.beginPath(); ctx.moveTo(M, y + rowH); ctx.lineTo(M + innerW, y + rowH); ctx.stroke();
            let x = M;
            ctx.font = `${fontBase}px Inter, Arial, sans-serif`;
            cols.forEach((c, i) => {
                const w = colW[i];
                const isMoney = c.num;
                ctx.fillStyle = isMoney ? (Number(c.get(rec)) < 0 ? '#dc2626' : textCol) : textCol;
                ctx.textAlign = c.align === 'r' ? 'right' : c.align === 'c' ? 'center' : 'left';
                const tx = c.align === 'r' ? x + w - padX : c.align === 'c' ? x + w / 2 : x + padX;
                ctx.fillText(String(c.disp(rec) == null ? '' : c.disp(rec)), tx, y + rowH / 2);
                x += w;
            });
            y += rowH;
        }
        function footerStamp() {
            if (!opt.watermark && !opt.pageNumbers) return;
            ctx.fillStyle = '#b8b8c0';
            ctx.font = `${9 * scale}px Inter, Arial, sans-serif`;
            if (opt.watermark) { ctx.textAlign = 'left'; ctx.fillText('FunPay Tools · Export Studio', M, H - 18 * scale); }
            if (opt.pageNumbers) { ctx.textAlign = 'right'; ctx.fillText('стр. ' + (pages.length + 1), W - M, H - 18 * scale); }
        }

        // paginate
        newPage(true); drawHeader();
        rows.forEach((rec, n) => {
            if (y + rowH > H - M - 30 * scale) {
                footerStamp(); pages.push(cv);
                newPage(false); drawHeader();
            }
            drawRow(rec, n);
        });
        // totals block
        if (opt.totals) {
            const lines = ES._summaryLines(ES.summarize(opt.kind, rows));
            const blockH = (lines.length + 1) * (20 * scale) + 16 * scale;
            if (y + blockH > H - M - 30 * scale) { footerStamp(); pages.push(cv); newPage(false); }
            y += 14 * scale;
            ctx.fillStyle = totalBg; roundRect(ctx, M, y, innerW, blockH, 8 * scale); ctx.fill();
            let ty = y + 14 * scale;
            ctx.textAlign = 'left';
            ctx.fillStyle = accent; ctx.font = `bold ${13 * scale}px Inter, Arial, sans-serif`;
            ctx.fillText('Итоги', M + 14 * scale, ty + 6 * scale); ty += 24 * scale;
            ctx.font = `${11 * scale}px Inter, Arial, sans-serif`;
            lines.forEach(([k, v]) => {
                ctx.fillStyle = '#555'; ctx.fillText(k, M + 14 * scale, ty + 6 * scale);
                ctx.fillStyle = textCol; ctx.font = `bold ${11 * scale}px Inter, Arial, sans-serif`;
                ctx.textAlign = 'right'; ctx.fillText(v, M + innerW - 14 * scale, ty + 6 * scale);
                ctx.textAlign = 'left'; ctx.font = `${11 * scale}px Inter, Arial, sans-serif`;
                ty += 20 * scale;
            });
            y += blockH;
        }
        footerStamp(); pages.push(cv);
        return { pages, PW, PH, scale };
    }

    ES.buildPDF = async function (cols, rows, opt) {
        const { pages, PW, PH } = canvasPages(cols, rows, opt);
        // каждую страницу кодируем в JPEG (PDF /DCTDecode принимает JPEG напрямую)
        const images = [];
        for (const cv of pages) {
            const dataUrl = cv.toDataURL('image/jpeg', 0.92);
            const b64 = dataUrl.split(',')[1];
            const bin = atob(b64);
            const bytes = new Uint8Array(bin.length);
            for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
            images.push({ bytes, w: cv.width, h: cv.height });
        }
        return assemblePDF(images, PW, PH);
    };

    // Собираем минимальный валидный PDF: каждая страница = полноразмерное PNG.
    function assemblePDF(images, PW, PH) {
        const enc = new TextEncoder();
        const objects = []; // {bytes}
        const chunks = [];
        let length = 0;
        const offsets = [];
        function push(bytes) { chunks.push(bytes); length += bytes.length; }
        function pushStr(s) { push(enc.encode(s)); }

        const n = images.length;
        // Объекты: 1 Catalog, 2 Pages, затем для каждой стр: Page, XObject(image), Content
        // Нумерация: 1 catalog, 2 pages,
        //   page i -> obj id: 3 + i*3, content -> 4 + i*3, image -> 5 + i*3
        const pageIds = [], contentIds = [], imageIds = [];
        for (let i = 0; i < n; i++) { pageIds.push(3 + i * 3); contentIds.push(4 + i * 3); imageIds.push(5 + i * 3); }
        const totalObjs = 2 + n * 3;

        const objOffset = {};
        function beginObj(id) { objOffset[id] = length; pushStr(id + ' 0 obj\n'); }
        function endObj() { pushStr('endobj\n'); }

        pushStr('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');

        // 1 Catalog
        beginObj(1); pushStr('<< /Type /Catalog /Pages 2 0 R >>\n'); endObj();
        // 2 Pages
        beginObj(2);
        pushStr('<< /Type /Pages /Count ' + n + ' /Kids [' + pageIds.map(id => id + ' 0 R').join(' ') + '] >>\n');
        endObj();

        for (let i = 0; i < n; i++) {
            const pid = pageIds[i], cid = contentIds[i], iid = imageIds[i];
            // Page
            beginObj(pid);
            pushStr('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ' + PW + ' ' + PH + '] '
                + '/Resources << /XObject << /Im0 ' + iid + ' 0 R >> >> '
                + '/Contents ' + cid + ' 0 R >>\n');
            endObj();
            // Content stream: рисуем картинку на весь лист
            const content = 'q\n' + PW + ' 0 0 ' + PH + ' 0 0 cm\n/Im0 Do\nQ\n';
            const cbytes = enc.encode(content);
            beginObj(cid);
            pushStr('<< /Length ' + cbytes.length + ' >>\nstream\n');
            push(cbytes);
            pushStr('\nendstream\n');
            endObj();
            // Image XObject — страница как JPEG (DCTDecode)
            beginObj(iid);
            const img = images[i];
            pushStr('<< /Type /XObject /Subtype /Image /Width ' + img.w + ' /Height ' + img.h
                + ' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ' + img.bytes.length + ' >>\nstream\n');
            push(img.bytes);
            pushStr('\nendstream\n');
            endObj();
        }

        // xref
        const xrefStart = length;
        pushStr('xref\n0 ' + (totalObjs + 1) + '\n');
        pushStr('0000000000 65535 f \n');
        for (let id = 1; id <= totalObjs; id++) {
            const off = String(objOffset[id] || 0).padStart(10, '0');
            pushStr(off + ' 00000 n \n');
        }
        pushStr('trailer\n<< /Size ' + (totalObjs + 1) + ' /Root 1 0 R >>\nstartxref\n' + xrefStart + '\n%%EOF');

        const out = new Uint8Array(length);
        let pos = 0;
        for (const c of chunks) { out.set(c, pos); pos += c.length; }
        return new Blob([out], { type: 'application/pdf' });
    }
    ES._assemblePDF = assemblePDF;
})();

// =============================================================================
//  FP Tools — Export Studio :: UI (модалка, кнопки, сбор данных)
// =============================================================================
(function () {
    'use strict';
    const ES = window.FPTExportStudio;
    const { esc, fmtDate, fmtDateTime, downloadBlob, nowStamp, SYM, themeFromColor, hslToHex, hexToHsl } = ES._util;

    // ── определяем контекст страницы: что экспортируем и откуда брать данные ──
    function detectContext() {
        const p = window.location.pathname;
        if (/^\/orders\/trade\/?$/.test(p)) {
            return { kind: 'sales', isPurchases: false, db: () => (window.fptOrdersDB || window.FPTSalesDB), titleDefault: 'Отчёт по продажам' };
        }
        if (/^\/orders\/?$/.test(p)) {
            return { kind: 'sales', isPurchases: true, db: () => (window.fptOrdersDB || window.FPTPurchasesDB), titleDefault: 'Отчёт по покупкам' };
        }
        if (/^\/account\/balance\/?$/.test(p)) {
            return { kind: 'finance', isPurchases: false, db: () => window.FPTFinanceDB, titleDefault: 'Финансовый отчёт' };
        }
        return null;
    }

    // ── период ──
    const PERIODS = [
        { v: 'all', l: 'Всё время' },
        { v: 'today', l: 'Сегодня' },
        { v: '7d', l: '7 дней' },
        { v: '30d', l: '30 дней' },
        { v: '90d', l: '90 дней' },
        { v: '365d', l: 'Год' },
        { v: 'custom', l: 'Свой диапазон' }
    ];
    function periodRange(v, from, to) {
        const day = 86400000, now = Date.now();
        const d = new Date(); const todayStart = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
        switch (v) {
            case 'today': return { start: todayStart, end: null };
            case '7d': return { start: now - 7 * day, end: null };
            case '30d': return { start: now - 30 * day, end: null };
            case '90d': return { start: now - 90 * day, end: null };
            case '365d': return { start: now - 365 * day, end: null };
            case 'custom': return {
                start: from ? new Date(from).getTime() : null,
                end: to ? (new Date(to).getTime() + day - 1) : null
            };
            default: return { start: null, end: null };
        }
    }
    function periodLabel(v, from, to) {
        if (v === 'custom') return (from ? fmtDate(new Date(from).getTime()) : '…') + ' — ' + (to ? fmtDate(new Date(to).getTime()) : '…');
        return (PERIODS.find(p => p.v === v) || {}).l || '';
    }

    // ── собираем строки данных с учётом фильтров ──
    async function gatherRows(ctx, cfg) {
        const db = ctx.db();
        let rows = await db.getAllAsArray();
        const r = periodRange(cfg.period, cfg.from, cfg.to);
        if (ctx.kind === 'finance') {
            rows = rows.filter(t => {
                if (r.start && t.date < r.start) return false;
                if (r.end && t.date > r.end) return false;
                if (cfg.finStatus !== 'all' && t.status !== cfg.finStatus) return false;
                if (cfg.finType !== 'all' && t.type !== cfg.finType) return false;
                if (cfg.currency !== 'all' && (t.currency || 'UNKNOWN') !== cfg.currency) return false;
                return true;
            });
            rows.sort((a, b) => cfg.sort === 'date-asc' ? a.date - b.date
                : cfg.sort === 'amt-desc' ? Math.abs(b.signed) - Math.abs(a.signed)
                    : cfg.sort === 'amt-asc' ? Math.abs(a.signed) - Math.abs(b.signed)
                        : b.date - a.date);
        } else {
            rows = rows.filter(o => {
                if (r.start && o.orderDate < r.start) return false;
                if (r.end && o.orderDate > r.end) return false;
                if (!cfg.stClosed && o.orderStatus === 'closed') return false;
                if (!cfg.stPaid && o.orderStatus === 'paid') return false;
                if (!cfg.stRefunded && o.orderStatus === 'refunded') return false;
                if (cfg.currency !== 'all' && (o.currency || 'UNKNOWN') !== cfg.currency) return false;
                return true;
            });
            rows.sort((a, b) => cfg.sort === 'date-asc' ? (a.orderDate || 0) - (b.orderDate || 0)
                : cfg.sort === 'price-desc' ? (b.price || 0) - (a.price || 0)
                    : cfg.sort === 'price-asc' ? (a.price || 0) - (b.price || 0)
                        : (b.orderDate || 0) - (a.orderDate || 0));
        }
        return rows;
    }

    // ── доступные валюты в данных (для выпадашки) ──
    async function detectCurrencies(ctx) {
        try {
            const rows = await ctx.db().getAllAsArray();
            const set = new Set();
            rows.forEach(x => { const c = ctx.kind === 'finance' ? x.currency : x.currency; if (c) set.add(c); });
            return Array.from(set);
        } catch (_) { return []; }
    }

    // ── СТИЛИ модалки ──
    function ensureStyles() {
        if (document.getElementById('fpt-es-styles')) return;
        const s = document.createElement('style');
        s.id = 'fpt-es-styles';
        s.textContent = `
        .fpt-es-ov{position:fixed;inset:0;z-index:2147483600;display:flex;align-items:center;justify-content:center;
            background:rgba(8,9,14,.55);font-family:Inter,'Segoe UI',sans-serif;}
        .fpt-es-modal{width:min(860px,95vw);max-height:92vh;display:flex;flex-direction:column;overflow:hidden;
            background:var(--fpt-surface,#fff);color:var(--fpt-text,#16181d);border:1px solid var(--fpt-border,#e4e4ec);
            border-radius:18px;}
        .fpt-es-head{display:flex;align-items:center;gap:12px;padding:18px 22px;border-bottom:1px solid var(--fpt-border,#ececf2);}
        .fpt-es-head h2{font-size:18px;font-weight:800;margin:0;flex:1;letter-spacing:-.3px;}
        .fpt-es-head .fpt-es-sub{font-size:12px;color:var(--fpt-text-muted,#8a8a96);font-weight:500;margin-top:1px;}
        .fpt-es-x{background:none;border:none;font-size:24px;line-height:1;cursor:pointer;color:inherit;opacity:.6;}
        .fpt-es-x:hover{opacity:1;}
        .fpt-es-body{padding:20px 22px;overflow-y:auto;display:flex;flex-direction:column;gap:20px;}
        .fpt-es-sec-t{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.4px;
            color:var(--fpt-text-muted,#9298a6);margin:0 0 10px;}
        .fpt-es-hint{font-size:11px;font-weight:500;color:var(--fpt-text-muted,#a0a4b0);text-transform:none;letter-spacing:0;margin-left:6px;}
        .fpt-es-fmts{display:grid;grid-template-columns:repeat(5,1fr);gap:9px;}
        @media(max-width:640px){.fpt-es-fmts{grid-template-columns:repeat(3,1fr);}}
        .fpt-es-fmt{border:1.5px solid var(--fpt-border,#e6e6ee);border-radius:13px;padding:13px 8px;cursor:pointer;
            text-align:center;transition:border-color .14s,background .14s;background:var(--fpt-surface-2,#fafafd);position:relative;}
        .fpt-es-fmt:hover{border-color:#2563eb;}
        .fpt-es-fmt.sel{border-color:#2563eb;background:rgba(37,99,235,.10);}
        .fpt-es-fmt.sel .ext{color:#2563eb;}
        .fpt-es-fmt .ext{font-size:14px;font-weight:800;letter-spacing:.3px;}
        .fpt-es-fmt .ds{font-size:10px;color:var(--fpt-text-muted,#9298a6);margin-top:2px;}
        /* палитра быстрых цветов + полноразмерный выбор цвета */
        .fpt-es-colorrow{display:flex;align-items:center;gap:14px;}
        .fpt-es-swatch-big{position:relative;width:46px;height:46px;flex-shrink:0;cursor:pointer;border-radius:12px;overflow:hidden;
            border:1px solid var(--fpt-border,#dcdce4);}
        .fpt-es-swatch-big input[type=color]{position:absolute;inset:0;opacity:0;width:100%;height:100%;cursor:pointer;border:none;padding:0;}
        .fpt-es-swatch-big-fill{display:block;width:100%;height:100%;}
        .fpt-es-sliders{flex:1;display:flex;flex-direction:column;gap:12px;min-width:0;}
        .fpt-es-spectrum{position:relative;height:18px;border-radius:9px;cursor:pointer;
            background:linear-gradient(to right,#f00 0%,#ff0 17%,#0f0 33%,#0ff 50%,#00f 67%,#f0f 83%,#f00 100%);
            box-shadow:inset 0 0 0 1px rgba(0,0,0,.08);}
        .fpt-es-light{position:relative;height:18px;border-radius:9px;cursor:pointer;box-shadow:inset 0 0 0 1px rgba(0,0,0,.08);}
        .fpt-es-spec-knob,.fpt-es-light-knob{position:absolute;top:50%;width:16px;height:16px;border-radius:50%;
            background:#fff;border:2px solid rgba(0,0,0,.35);transform:translate(-50%,-50%);pointer-events:none;
            box-shadow:0 1px 3px rgba(0,0,0,.3);}
        .fpt-es-grid2{display:grid;grid-template-columns:1fr 1fr;gap:14px;}
        @media(max-width:640px){.fpt-es-grid2{grid-template-columns:1fr;}}
        .fpt-es-field{display:flex;flex-direction:column;gap:5px;}
        .fpt-es-field label{font-size:11.5px;font-weight:600;color:var(--fpt-text-muted,#7d8290);}
        .fpt-es-inp,.fpt-es-sel{padding:9px 11px;border-radius:10px;border:1px solid var(--fpt-border,#e0e0e8);
            background:var(--fpt-surface-2,#fff);color:inherit;font-size:13px;font-family:inherit;width:100%;box-sizing:border-box;}
        .fpt-es-inp:focus,.fpt-es-sel:focus{outline:none;border-color:#2563eb;}
        .fpt-es-cols{display:flex;flex-wrap:wrap;gap:7px;}
        .fpt-es-chip{font-size:12px;padding:6px 11px;border-radius:20px;border:1.5px solid var(--fpt-border,#e0e0e8);
            cursor:pointer;user-select:none;transition:background .12s,border-color .12s,color .12s;background:var(--fpt-surface-2,#fafafd);}
        .fpt-es-chip.on{background:#2563eb;border-color:#2563eb;color:#fff;}
        /* ── свои чекбоксы: не зависят от стилей страницы FunPay (нативные input ломались) ── */
        .fpt-es-opts{display:grid;grid-template-columns:1fr 1fr;gap:8px 16px;}
        @media(max-width:640px){.fpt-es-opts{grid-template-columns:1fr;}}
        .fpt-es-opt{display:flex;align-items:center;gap:10px;font-size:13px;cursor:pointer;padding:4px 0;user-select:none;}
        .fpt-es-check{width:18px;height:18px;flex-shrink:0;border-radius:5px;border:1.5px solid var(--fpt-border,#c8ccd8);
            background:var(--fpt-surface-2,#fff);position:relative;transition:background .12s,border-color .12s;box-sizing:border-box;}
        .fpt-es-opt.on .fpt-es-check{background:#2563eb;border-color:#2563eb;}
        .fpt-es-check::after{content:'';position:absolute;left:5px;top:1px;width:5px;height:10px;
            border:solid #fff;border-width:0 2px 2px 0;transform:rotate(45deg) scale(0);transition:transform .12s;}
        .fpt-es-opt.on .fpt-es-check::after{transform:rotate(45deg) scale(1);}
        .fpt-es-opt.dim{opacity:.4;}
        .fpt-es-rowflt{display:flex;flex-wrap:wrap;gap:7px;align-items:center;}
        .fpt-es-tgl{font-size:12px;padding:6px 12px;border-radius:9px;border:1.5px solid var(--fpt-border,#e0e0e8);
            cursor:pointer;background:var(--fpt-surface-2,#fafafd);transition:background .12s,border-color .12s,color .12s;user-select:none;}
        .fpt-es-tgl.on{background:rgba(37,99,235,.12);border-color:#2563eb;
            color:#2563eb;font-weight:600;}
        .fpt-es-foot{display:flex;align-items:center;gap:12px;padding:15px 22px;border-top:1px solid var(--fpt-border,#ececf2);
            background:var(--fpt-surface-2,#fafafd);}
        .fpt-es-count{font-size:12.5px;color:var(--fpt-text-muted,#8a8a96);flex:1;}
        .fpt-es-count b{color:var(--fpt-text,#16181d);}
        .fpt-es-btn{padding:11px 22px;border-radius:12px;border:none;font-size:14px;font-weight:700;cursor:pointer;
            background:#2563eb;color:#fff;transition:filter .15s;}
        .fpt-es-btn:hover{filter:brightness(1.08);}
        .fpt-es-btn:disabled{opacity:.6;cursor:default;filter:none;}
        .fpt-es-btn2{padding:11px 18px;border-radius:12px;border:1px solid var(--fpt-border,#dcdce4);
            background:var(--fpt-surface,#fff);color:inherit;font-size:14px;font-weight:600;cursor:pointer;}
        .fpt-es-btn2:hover{border-color:var(--fpt-text-muted,#b6b6c2);}
        .fpt-es-launch{margin-left:6px;}
        .fpt-es-spin{width:16px;height:16px;border:2.5px solid rgba(255,255,255,.4);border-top-color:#fff;
            border-radius:50%;animation:fptEsSpin .7s linear infinite;display:inline-block;vertical-align:-3px;margin-right:7px;}
        @keyframes fptEsSpin{to{transform:rotate(360deg)}}
        `;
        document.head.appendChild(s);
    }

    // ── конфиг по умолчанию (запоминаем в localStorage) ──
    const CFG_KEY = 'fpToolsExportStudioCfg';
    function loadCfg(ctx) {
        const def = {
            formats: ['xlsx'], color: '#2563EB', period: 'all', from: '', to: '',
            currency: 'all', sort: ctx.kind === 'finance' ? 'date-desc' : 'date-desc',
            title: ctx.titleDefault, subtitle: '',
            zebra: true, totals: true, watermark: true, pageNumbers: true,
            orientation: 'landscape', csvSep: ';',
            stClosed: true, stPaid: true, stRefunded: ctx.isPurchases ? false : true,
            finStatus: 'all', finType: 'all',
            cols: null
        };
        try {
            const raw = localStorage.getItem(CFG_KEY + ':' + ctx.kind + (ctx.isPurchases ? ':p' : ''));
            if (raw) Object.assign(def, JSON.parse(raw));
        } catch (_) {}
        // миграция со старого одиночного формата
        if (typeof def.format === 'string') { def.formats = [def.format]; delete def.format; }
        if (!Array.isArray(def.formats) || !def.formats.length) def.formats = ['xlsx'];
        // миграция со старых пресет-тем → один цвет
        if (def.theme) {
            const map = { funpay: '#FF6D15', midnight: '#7C5CFF', emerald: '#10B981', ocean: '#0EA5E9', ruby: '#E11D48', gold: '#C79A2E', mono: '#111827', candy: '#EC4899' };
            def.color = map[def.theme] || '#2563EB';
            delete def.theme;
        }
        if (!def.color) def.color = '#2563EB';
        // дефолтный набор колонок
        if (!def.cols) {
            const all = ES.schemaFor(ctx.kind, ctx.isPurchases).map(c => c.key);
            def.cols = all.filter(k => k !== 'link' && k !== 'currency');
        }
        return def;
    }
    function saveCfg(ctx, cfg) {
        try { localStorage.setItem(CFG_KEY + ':' + ctx.kind + (ctx.isPurchases ? ':p' : ''), JSON.stringify(cfg)); } catch (_) {}
    }

    const FORMATS = [
        { v: 'xlsx', ext: 'XLSX', ds: 'Excel-таблица' },
        { v: 'docx', ext: 'DOCX', ds: 'Word-документ' },
        { v: 'pdf', ext: 'PDF', ds: 'Готов к печати' },
        { v: 'csv', ext: 'CSV', ds: 'Для импорта' },
        { v: 'json', ext: 'JSON', ds: 'Сырые данные' }
    ];

    async function openStudio(ctx) {
        ensureStyles();
        const old = document.getElementById('fpt-es-ov');
        if (old) old.remove();
        const cfg = loadCfg(ctx);
        if (cfg.color && !/^#/.test(cfg.color)) cfg.color = '#' + cfg.color;
        const schema = ES.schemaFor(ctx.kind, ctx.isPurchases);
        const currencies = await detectCurrencies(ctx);

        const ov = document.createElement('div');
        ov.id = 'fpt-es-ov';
        ov.className = 'fpt-es-ov';
        ov.innerHTML = `
        <div class="fpt-es-modal">
            <div class="fpt-es-head">
                <div style="flex:1;">
                    <h2>Студия экспорта</h2>
                    <div class="fpt-es-sub">${esc(ctx.kind === 'finance' ? 'Финансы' : ctx.isPurchases ? 'Покупки' : 'Продажи')} · настрой формат, стиль и содержимое</div>
                </div>
                <button class="fpt-es-x" title="Закрыть">×</button>
            </div>
            <div class="fpt-es-body">
                <div>
                    <p class="fpt-es-sec-t">Формат файла<span class="fpt-es-hint">можно выбрать несколько</span></p>
                    <div class="fpt-es-fmts" id="es-fmts">
                        ${FORMATS.map(f => `<div class="fpt-es-fmt ${cfg.formats.includes(f.v) ? 'sel' : ''}" data-fmt="${f.v}"><div class="ext">${f.ext}</div><div class="ds">${f.ds}</div></div>`).join('')}
                    </div>
                </div>

                <div id="es-theme-wrap">
                    <p class="fpt-es-sec-t">Цвет оформления</p>
                    <div class="fpt-es-colorrow">
                        <label class="fpt-es-swatch-big" title="Выбрать точный цвет">
                            <input type="color" id="es-color" value="${esc(cfg.color)}">
                            <span class="fpt-es-swatch-big-fill" id="es-color-swatch" style="background:${esc(cfg.color)}"></span>
                        </label>
                        <div class="fpt-es-sliders">
                            <div class="fpt-es-spectrum" id="es-spectrum"><span class="fpt-es-spec-knob" id="es-spec-knob"></span></div>
                            <div class="fpt-es-light" id="es-light"><span class="fpt-es-light-knob" id="es-light-knob"></span></div>
                        </div>
                    </div>
                </div>

                <div>
                    <p class="fpt-es-sec-t">Заголовок документа</p>
                    <div class="fpt-es-grid2">
                        <div class="fpt-es-field"><label>Заголовок</label><input class="fpt-es-inp" id="es-title" value="${esc(cfg.title)}" placeholder="Например: Отчёт по продажам"></div>
                        <div class="fpt-es-field"><label>Подзаголовок (необязательно)</label><input class="fpt-es-inp" id="es-subtitle" value="${esc(cfg.subtitle)}" placeholder="Например: магазин XYZ"></div>
                    </div>
                </div>

                <div>
                    <p class="fpt-es-sec-t">Период и фильтры</p>
                    <div class="fpt-es-grid2">
                        <div class="fpt-es-field"><label>Период</label>
                            <select class="fpt-es-sel" id="es-period">${PERIODS.map(p => `<option value="${p.v}" ${cfg.period === p.v ? 'selected' : ''}>${p.l}</option>`).join('')}</select>
                        </div>
                        <div class="fpt-es-field"><label>Валюта</label>
                            <select class="fpt-es-sel" id="es-currency"><option value="all" ${cfg.currency === 'all' ? 'selected' : ''}>Все валюты</option>${currencies.map(c => `<option value="${c}" ${cfg.currency === c ? 'selected' : ''}>${c} ${SYM[c] || ''}</option>`).join('')}</select>
                        </div>
                    </div>
                    <div class="fpt-es-grid2" id="es-custom-range" style="margin-top:10px;display:${cfg.period === 'custom' ? 'grid' : 'none'};">
                        <div class="fpt-es-field"><label>С даты</label><input type="date" class="fpt-es-inp" id="es-from" value="${esc(cfg.from)}"></div>
                        <div class="fpt-es-field"><label>По дату</label><input type="date" class="fpt-es-inp" id="es-to" value="${esc(cfg.to)}"></div>
                    </div>
                    <div style="margin-top:12px;" class="fpt-es-rowflt" id="es-statusflt"></div>
                    <div style="margin-top:10px;" class="fpt-es-field">
                        <label>Сортировка</label>
                        <select class="fpt-es-sel" id="es-sort" style="max-width:280px;">
                            ${ctx.kind === 'finance'
                ? `<option value="date-desc">Сначала новые</option><option value="date-asc">Сначала старые</option><option value="amt-desc">Больше сумма</option><option value="amt-asc">Меньше сумма</option>`
                : `<option value="date-desc">Сначала новые</option><option value="date-asc">Сначала старые</option><option value="price-desc">Дороже сверху</option><option value="price-asc">Дешевле сверху</option>`}
                        </select>
                    </div>
                </div>

                <div>
                    <p class="fpt-es-sec-t">Колонки</p>
                    <div class="fpt-es-cols" id="es-cols">
                        ${schema.map(c => `<span class="fpt-es-chip ${cfg.cols.includes(c.key) ? 'on' : ''}" data-col="${c.key}">${esc(c.label)}</span>`).join('')}
                    </div>
                </div>

                <div>
                    <p class="fpt-es-sec-t">Дополнительно</p>
                    <div class="fpt-es-opts">
                        <div class="fpt-es-opt on" data-opt="zebra"><span class="fpt-es-check"></span>Чередование строк (зебра)</div>
                        <div class="fpt-es-opt on" data-opt="totals"><span class="fpt-es-check"></span>Блок итогов</div>
                        <div class="fpt-es-opt on" data-opt="watermark"><span class="fpt-es-check"></span>Подпись FunPay Tools</div>
                        <div class="fpt-es-opt on" data-opt="pageNumbers" id="es-opt-pagenum"><span class="fpt-es-check"></span>Номера страниц (PDF)</div>
                    </div>
                    <div style="margin-top:10px;" class="fpt-es-rowflt" id="es-orient-wrap">
                        <span style="font-size:11.5px;color:var(--fpt-text-muted,#7d8290);">Ориентация (PDF/DOCX):</span>
                        <span class="fpt-es-tgl ${cfg.orientation === 'portrait' ? 'on' : ''}" data-orient="portrait">Книжная</span>
                        <span class="fpt-es-tgl ${cfg.orientation === 'landscape' ? 'on' : ''}" data-orient="landscape">Альбомная</span>
                    </div>
                </div>
            </div>
            <div class="fpt-es-foot">
                <div class="fpt-es-count" id="es-count">Считаем записи…</div>
                <button class="fpt-es-btn2" id="es-cancel">Отмена</button>
                <button class="fpt-es-btn fpt-es-launch" id="es-go">Экспортировать</button>
            </div>
        </div>`;
        document.body.appendChild(ov);

        // ── состояние формы ──
        const state = Object.assign({}, cfg);

        // статус-фильтры
        function renderStatusFlt() {
            const wrap = ov.querySelector('#es-statusflt');
            if (ctx.kind === 'finance') {
                const stOpts = [['all', 'Все статусы'], ['complete', 'Завершённые'], ['cancel', 'Отменённые'], ['waiting', 'Ожидание']];
                const tyOpts = [['all', 'Все типы'], ['order', 'Заказы'], ['payment', 'Пополнения'], ['withdraw', 'Выводы'], ['withdraw_cancel', 'Отмены выводов'], ['other', 'Другое']];
                wrap.innerHTML = `<span style="font-size:11.5px;color:var(--fpt-text-muted,#7d8290);">Статус:</span>` +
                    stOpts.map(([v, l]) => `<span class="fpt-es-tgl ${state.finStatus === v ? 'on' : ''}" data-finst="${v}">${l}</span>`).join('') +
                    `<span style="font-size:11.5px;color:var(--fpt-text-muted,#7d8290);margin-left:8px;">Тип:</span>` +
                    tyOpts.map(([v, l]) => `<span class="fpt-es-tgl ${state.finType === v ? 'on' : ''}" data-finty="${v}">${l}</span>`).join('');
                wrap.querySelectorAll('[data-finst]').forEach(b => b.onclick = () => { state.finStatus = b.dataset.finst; renderStatusFlt(); refreshCount(); });
                wrap.querySelectorAll('[data-finty]').forEach(b => b.onclick = () => { state.finType = b.dataset.finty; renderStatusFlt(); refreshCount(); });
            } else {
                wrap.innerHTML = `<span style="font-size:11.5px;color:var(--fpt-text-muted,#7d8290);">Статусы:</span>` +
                    `<span class="fpt-es-tgl ${state.stClosed ? 'on' : ''}" data-st="stClosed">Закрытые</span>` +
                    `<span class="fpt-es-tgl ${state.stPaid ? 'on' : ''}" data-st="stPaid">Оплаченные</span>` +
                    `<span class="fpt-es-tgl ${state.stRefunded ? 'on' : ''}" data-st="stRefunded">Возвраты</span>`;
                wrap.querySelectorAll('[data-st]').forEach(b => b.onclick = () => { state[b.dataset.st] = !state[b.dataset.st]; renderStatusFlt(); refreshCount(); });
            }
        }
        renderStatusFlt();

        // selectors / inputs
        ov.querySelector('#es-sort').value = state.sort;

        // какие форматы используют тему / ориентацию / номера страниц
        const STYLED = new Set(['xlsx', 'docx', 'pdf']);
        const PAGED = new Set(['pdf']);
        const ORIENTED = new Set(['pdf', 'docx']);
        function applyConditionalVisibility() {
            const anyStyled = state.formats.some(f => STYLED.has(f));
            const anyPaged = state.formats.some(f => PAGED.has(f));
            const anyOriented = state.formats.some(f => ORIENTED.has(f));
            ov.querySelector('#es-theme-wrap').style.display = anyStyled ? '' : 'none';
            ov.querySelector('#es-opt-pagenum').style.display = anyPaged ? 'flex' : 'none';
            ov.querySelector('#es-orient-wrap').style.display = anyOriented ? 'flex' : 'none';
        }

        ov.querySelectorAll('#es-fmts .fpt-es-fmt').forEach(el => el.onclick = () => {
            const f = el.dataset.fmt;
            if (state.formats.includes(f)) {
                if (state.formats.length > 1) state.formats = state.formats.filter(x => x !== f); // нельзя снять последний
            } else {
                state.formats.push(f);
            }
            el.classList.toggle('sel', state.formats.includes(f));
            applyConditionalVisibility();
        });
        applyConditionalVisibility();

        // ── выбор цвета: спектр (hue) + ползунок яркости + точный пикер ──
        let _hsl = hexToHsl(state.color); // [h,s,l]
        if (_hsl[1] < 25) _hsl[1] = 70;   // не даём «серому» съесть насыщенность
        const specEl = ov.querySelector('#es-spectrum');
        const specKnob = ov.querySelector('#es-spec-knob');
        const lightEl = ov.querySelector('#es-light');
        const lightKnob = ov.querySelector('#es-light-knob');
        const swatch = ov.querySelector('#es-color-swatch');
        const picker = ov.querySelector('#es-color');

        function syncFromHsl(fromPicker) {
            const hex = hslToHex(_hsl[0], _hsl[1], _hsl[2]);
            state.color = hex;
            if (swatch) swatch.style.background = '#' + hex;
            if (picker && !fromPicker) picker.value = '#' + hex;
            // позиции бегунков
            specKnob.style.left = (_hsl[0] / 360 * 100) + '%';
            lightKnob.style.left = (_hsl[2]) + '%';
            // фон ползунка яркости: от чёрного через текущий тон к белому
            const pure = hslToHex(_hsl[0], _hsl[1], 50);
            lightEl.style.background = `linear-gradient(to right,#000,#${pure} 50%,#fff)`;
        }
        function dragHandler(el, onPos) {
            const move = (e) => {
                const r = el.getBoundingClientRect();
                const cx = (e.touches ? e.touches[0].clientX : e.clientX);
                let p = (cx - r.left) / r.width;
                p = Math.max(0, Math.min(1, p));
                onPos(p);
            };
            const up = () => { document.removeEventListener('mousemove', move); document.removeEventListener('mouseup', up); document.removeEventListener('touchmove', move); document.removeEventListener('touchend', up); };
            el.addEventListener('mousedown', (e) => { move(e); document.addEventListener('mousemove', move); document.addEventListener('mouseup', up); });
            el.addEventListener('touchstart', (e) => { move(e); document.addEventListener('touchmove', move, { passive: false }); document.addEventListener('touchend', up); });
        }
        dragHandler(specEl, p => { _hsl[0] = Math.round(p * 360); syncFromHsl(); });
        dragHandler(lightEl, p => { _hsl[2] = Math.round(p * 100); syncFromHsl(); });
        picker.oninput = e => { _hsl = hexToHsl(e.target.value); syncFromHsl(true); };
        syncFromHsl();

        ov.querySelectorAll('#es-cols .fpt-es-chip').forEach(el => el.onclick = () => {
            el.classList.toggle('on');
            const k = el.dataset.col;
            if (el.classList.contains('on')) { if (!state.cols.includes(k)) state.cols.push(k); }
            else state.cols = state.cols.filter(x => x !== k);
        });
        // свои чекбоксы (надёжнее нативных input на странице FunPay)
        ov.querySelectorAll('.fpt-es-opt[data-opt]').forEach(el => {
            const key = el.dataset.opt;
            el.classList.toggle('on', !!state[key]);
            el.onclick = () => {
                state[key] = !state[key];
                el.classList.toggle('on', state[key]);
            };
        });
        ov.querySelectorAll('[data-orient]').forEach(el => el.onclick = () => {
            state.orientation = el.dataset.orient;
            ov.querySelectorAll('[data-orient]').forEach(x => x.classList.toggle('on', x === el));
        });
        const periodSel = ov.querySelector('#es-period');
        periodSel.onchange = () => {
            state.period = periodSel.value;
            ov.querySelector('#es-custom-range').style.display = state.period === 'custom' ? 'grid' : 'none';
            refreshCount();
        };
        ov.querySelector('#es-currency').onchange = e => { state.currency = e.target.value; refreshCount(); };
        ov.querySelector('#es-from').onchange = e => { state.from = e.target.value; refreshCount(); };
        ov.querySelector('#es-to').onchange = e => { state.to = e.target.value; refreshCount(); };
        ov.querySelector('#es-sort').onchange = e => { state.sort = e.target.value; };

        // count
        async function refreshCount() {
            syncSimple();
            const rows = await gatherRows(ctx, state);
            const el = ov.querySelector('#es-count');
            if (el) el.innerHTML = `Будет выгружено: <b>${rows.length}</b> ${ctx.kind === 'finance' ? 'операц.' : 'записей'} · ${esc(periodLabel(state.period, state.from, state.to))}`;
            return rows;
        }
        function syncSimple() {
            state.title = ov.querySelector('#es-title').value;
            state.subtitle = ov.querySelector('#es-subtitle').value;
            // чекбоксы (zebra/totals/watermark/pageNumbers) уже в state через свои тогглы
        }
        refreshCount();

        // close
        const close = () => ov.remove();
        ov.querySelector('.fpt-es-x').onclick = close;
        ov.querySelector('#es-cancel').onclick = close;
        ov.onclick = e => { if (e.target === ov) close(); };
        document.addEventListener('keydown', function onEsc(e) { if (e.key === 'Escape') { close(); document.removeEventListener('keydown', onEsc); } });

        // GO
        ov.querySelector('#es-go').onclick = async () => {
            const btn = ov.querySelector('#es-go');
            syncSimple();
            if (!state.cols.length) { alert('Выберите хотя бы одну колонку.'); return; }
            if (!state.formats.length) { alert('Выберите хотя бы один формат.'); return; }
            btn.disabled = true;
            const orig = btn.innerHTML;
            btn.innerHTML = '<span class="fpt-es-spin"></span>Готовим файлы…';
            try {
                const rows = await gatherRows(ctx, state);
                if (!rows.length) { alert('Нет данных для выбранных фильтров.'); btn.disabled = false; btn.innerHTML = orig; return; }
                const schemaAll = ES.schemaFor(ctx.kind, ctx.isPurchases);
                const cols = state.cols.map(k => schemaAll.find(c => c.key === k)).filter(Boolean);
                const opt = {
                    kind: ctx.kind, isPurchases: ctx.isPurchases,
                    color: state.color, themeObj: themeFromColor(state.color),
                    title: state.title, subtitle: state.subtitle || (periodLabel(state.period, state.from, state.to) + ' · ' + fmtDateTime(Date.now())),
                    periodLabel: periodLabel(state.period, state.from, state.to),
                    zebra: state.zebra, totals: state.totals, watermark: state.watermark, pageNumbers: state.pageNumbers,
                    orientation: state.orientation, csvSep: state.csvSep
                };
                const base = (ctx.kind === 'finance' ? 'finance' : ctx.isPurchases ? 'purchases' : 'sales') + '_' + nowStamp();
                // порядок: тяжёлые PDF в конце; небольшая пауза между скачиваниями,
                // чтобы браузер не «склеил» несколько файлов в один диалог.
                const order = ['xlsx', 'docx', 'csv', 'json', 'pdf'].filter(f => state.formats.includes(f));
                let done = 0;
                for (const fmt of order) {
                    btn.innerHTML = `<span class="fpt-es-spin"></span>Формат ${fmt.toUpperCase()} (${done + 1}/${order.length})…`;
                    let blob;
                    if (fmt === 'xlsx') blob = ES.buildXLSX(cols, rows, opt);
                    else if (fmt === 'docx') blob = ES.buildDOCX(cols, rows, opt);
                    else if (fmt === 'pdf') blob = await ES.buildPDF(cols, rows, opt);
                    else if (fmt === 'csv') blob = ES.buildCSV(cols, rows, opt);
                    else blob = ES.buildJSON(cols, rows, opt);
                    downloadBlob(blob, blob.type, base + '.' + fmt);
                    done++;
                    if (done < order.length) await new Promise(r => setTimeout(r, 450));
                }
                saveCfg(ctx, state);
                btn.innerHTML = 'Готово!' + (order.length > 1 ? ` (${order.length} файла)` : '');
                setTimeout(() => { btn.disabled = false; btn.innerHTML = orig; }, 1500);
            } catch (err) {
                console.error('[ExportStudio] ошибка генерации:', err);
                alert('Не удалось сформировать файл: ' + (err && err.message ? err.message : err));
                btn.disabled = false; btn.innerHTML = orig;
            }
        };
    }
    ES.open = openStudio;

    // ──────────────────────────────────────────────────────────────────────────
    //  ВСТАВКА КНОПКИ «ЭКСПОРТ» В ПАНЕЛЬ СТАТИСТИКИ
    //  • продажи/покупки: в .fp-stats-controls (рядом с «Обновить»/фильтрами)
    //  • финансы: в .fpt-fin-head (рядом с «Обновить»)
    // ──────────────────────────────────────────────────────────────────────────
    function makeBtnSales() {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'btn btn-default fpt-es-trigger';
        b.id = 'fpt-es-open';
        b.title = 'Студия экспорта — XLSX, DOCX, PDF, CSV, JSON';
        b.textContent = 'Экспорт';
        return b;
    }
    function makeBtnFinance() {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'fpt-fin-btn fpt-es-trigger';
        b.id = 'fpt-es-open';
        b.title = 'Студия экспорта — XLSX, DOCX, PDF, CSV, JSON';
        b.textContent = 'Экспорт';
        return b;
    }

    function tryMount(ctx) {
        if (document.getElementById('fpt-es-open')) return true;
        if (ctx.kind === 'finance') {
            const head = document.querySelector('.fpt-fin-head');
            const refresh = document.getElementById('fpt-fin-refresh');
            if (!head) return false;
            const btn = makeBtnFinance();
            btn.onclick = () => openStudio(ctx);
            if (refresh && refresh.parentElement === head) head.insertBefore(btn, refresh.nextSibling);
            else head.appendChild(btn);
            return true;
        } else {
            const controls = document.querySelector('.fp-stats-controls');
            if (!controls) return false;
            const btn = makeBtnSales();
            btn.onclick = () => openStudio(ctx);
            // ставим первым, чтобы был заметен
            controls.insertBefore(btn, controls.firstChild);
            return true;
        }
    }

    function init() {
        const ctx = detectContext();
        if (!ctx) return;
        // для покупок/продаж тумблер показа статистики не блокирует экспорт-кнопку,
        // но панель появляется только если статистика смонтирована — ждём её.
        if (tryMount(ctx)) return;
        let tries = 0;
        const obs = new MutationObserver(() => {
            if (tryMount(ctx) || ++tries > 240) obs.disconnect();
        });
        obs.observe(document.body, { childList: true, subtree: true });
        // подстраховка по таймеру (вдруг панель уже была до запуска наблюдателя)
        const iv = setInterval(() => { if (tryMount(ctx) || ++tries > 240) clearInterval(iv); }, 500);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
