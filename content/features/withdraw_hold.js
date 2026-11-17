// content/features/withdraw_hold.js - FunPay Tools
// Таймер 48-часового холда на /account/balance.
// FunPay показывает только общий баланс. Новые поступления у большинства продавцов выводятся через 48 часов:
// считаем, сколько можно вывести прямо сейчас, сколько в холде и во сколько (поминутно) оно освободится.

(function () {
  'use strict';
  if (window.top !== window || !location.pathname.startsWith('/account/balance')) return;

  const HOLD = 48 * 3600 * 1000;
  const MSK = 3 * 3600 * 1000;
  const MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
  const K_INSTANT = 'fptWithdrawInstant';
  const K_KEPT = 'fptWithdrawKept';
  const K_OFF = 'fptWithdrawHoldOff';
  const sget = async (k) => { try { return await chrome.storage.local.get(k); } catch { return {}; } };
  const sset = async (o) => { try { await chrome.storage.local.set(o); } catch {} };

  function app() { try { const d = JSON.parse(document.body.dataset.appData || '{}'); return Array.isArray(d) ? d[0] : d; } catch { return {}; } }

  function parseDate(text) {
    const t = String(text || '').trim().toLowerCase().replace(/\s+/g, ' ');
    const mskNow = new Date(Date.now() + MSK);
    let y = mskNow.getUTCFullYear(), mo, d, h, mi, m;
    if ((m = t.match(/(\d{1,2}) (\S+?) (\d{4}),? (\d{1,2}):(\d{2})/))) { d = +m[1]; mo = MONTHS.indexOf(m[2]); y = +m[3]; h = +m[4]; mi = +m[5]; }
    else if ((m = t.match(/(\d{1,2}) (\S+?),? (\d{1,2}):(\d{2})/)) && MONTHS.includes(m[2])) { d = +m[1]; mo = MONTHS.indexOf(m[2]); h = +m[3]; mi = +m[4]; }
    else if ((m = t.match(/сегодня,? (\d{1,2}):(\d{2})/))) { d = mskNow.getUTCDate(); mo = mskNow.getUTCMonth(); h = +m[1]; mi = +m[2]; }
    else if ((m = t.match(/вчера,? (\d{1,2}):(\d{2})/))) { const yd = new Date(mskNow - 86400000); y = yd.getUTCFullYear(); d = yd.getUTCDate(); mo = yd.getUTCMonth(); h = +m[1]; mi = +m[2]; }
    else return NaN;
    if (mo < 0) return NaN;
    let ts = Date.UTC(y, mo, d, h, mi) - MSK;
    if (ts > Date.now() + 86400000) ts = Date.UTC(y - 1, mo, d, h, mi) - MSK; // декабрь, увиденный в январе
    return ts;
  }

  async function txPage(filter, cont) {
    const body = new URLSearchParams({ user_id: String(app().userId || ''), filter });
    if (cont) body.set('continue', cont);
    const r = await fetch('/users/transactions', {
      method: 'POST', credentials: 'same-origin', body,
      headers: { 'content-type': 'application/x-www-form-urlencoded; charset=UTF-8', 'x-requested-with': 'XMLHttpRequest' },
    });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const doc = new DOMParser().parseFromString(await r.text(), 'text/html');
    const next = (doc.querySelector("input[name='continue']") || {}).value || '';
    const txns = [...doc.querySelectorAll('.tc-item[data-transaction]')].map((row) => {
      const title = (row.querySelector('.tc-title') || {}).textContent || '';
      const priceText = ((row.querySelector('.tc-price') || {}).textContent || '').replace(/ /g, ' ').trim();
      const amount = parseFloat(priceText.replace(/[^\d.,]/g, '').replace(',', '.')) || 0;
      let type = 'other';
      if (/^\s*Заказ/i.test(title)) type = 'order';
      else if (/^\s*Вывод денег/i.test(title)) type = 'withdraw';
      else if (/^\s*Пополнение/i.test(title)) type = 'payment';
      else if (/возврат/i.test(title)) type = 'refund';
      let status = 'complete';
      if (row.classList.contains('transaction-status-cancel')) status = 'cancel';
      else if (row.classList.contains('transaction-status-waiting')) status = 'waiting';
      return {
        id: row.getAttribute('data-transaction'), type, status,
        signed: /^[−-]/.test(priceText) ? -amount : amount,
        cur: priceText.includes('$') ? 'USD' : priceText.includes('€') ? 'EUR' : 'RUB',
        at: parseDate((row.querySelector('.tc-date-time') || {}).textContent),
      };
    });
    return { next, txns };
  }

  // Если последние выводы проходили за полчаса, холда у аккаунта нет: таймер не нужен.
  async function isInstant() {
    const c = (await sget(K_INSTANT))[K_INSTANT];
    if (c && Date.now() - c.t < 86400000) return c.v;
    let v = false;
    try {
      const { txns } = await txPage('withdraw');
      const done = txns.filter((t) => t.type === 'withdraw' && t.status === 'complete').slice(0, 3);
      let fast = 0;
      for (const t of done) {
        const r = await fetch('/users/transaction?id=' + encodeURIComponent(t.id), { credentials: 'same-origin', headers: { 'x-requested-with': 'XMLHttpRequest' } });
        const j = await r.json().catch(() => ({}));
        const doc = new DOMParser().parseFromString(j.html || '', 'text/html');
        const dates = [...doc.querySelectorAll('table.transaction-values td')].map((td) => parseDate(td.textContent)).filter(isFinite);
        if (dates.length >= 2 && Math.abs(Math.max(...dates) - Math.min(...dates)) <= 30 * 60 * 1000) fast++;
      }
      v = done.length > 0 && fast === done.length;
    } catch {}
    await sset({ [K_INSTANT]: { t: Date.now(), v } });
    return v;
  }

  async function inflows(force) {
    const c = (await sget(K_KEPT))[K_KEPT];
    if (!force && c && Date.now() - c.t < 5 * 60 * 1000) return c.list;
    const list = [];
    let cont = '';
    const since = Date.now() - HOLD;
    for (let page = 0; page < 8; page++) {
      const { next, txns } = await txPage('', cont);
      let reachedOld = false;
      for (const t of txns) {
        if (!isFinite(t.at)) continue;
        if (t.at <= since) { reachedOld = true; continue; }
        if (t.status === 'complete' && t.signed > 0 && ['order', 'payment', 'refund'].includes(t.type)) {
          list.push({ cents: Math.round(t.signed * 100), cur: t.cur, at: t.at });
        }
      }
      if (reachedOld || !next || next === cont || !txns.length) break;
      cont = next;
    }
    await sset({ [K_KEPT]: { t: Date.now(), list } });
    return list;
  }

  function balances() {
    const out = {};
    document.querySelectorAll('.balances-value').forEach((el) => {
      const t = el.textContent.replace(/ /g, ' ');
      const cur = t.includes('$') ? 'USD' : t.includes('€') ? 'EUR' : 'RUB';
      const v = parseFloat(t.replace(/[^\d.,]/g, '').replace(',', '.'));
      if (isFinite(v)) out[cur] = Math.round(v * 100);
    });
    return out;
  }

  const SIGN = { RUB: '₽', USD: '$', EUR: '€' };
  const fmt = (cents, cur) => `${(cents / 100).toLocaleString('ru-RU', { maximumFractionDigits: 2 })} ${SIGN[cur]}`;
  function inText(ms) {
    const mins = Math.max(0, Math.ceil(ms / 60000));
    const h = Math.floor(mins / 60), m = mins % 60;
    return h ? `через ${h} ч ${m} мин` : `через ${m} мин`;
  }

  function compute(list) {
    const bal = balances();
    const res = [];
    for (const cur of Object.keys(bal)) {
      const inc = list.filter((x) => x.cur === cur).sort((a, b) => b.at - a.at);  // свежие первыми
      const sum = inc.reduce((s, x) => s + x.cents, 0);
      const held = Math.min(bal[cur], sum);
      const groups = new Map();
      let left = held;
      for (const x of inc) {
        if (left <= 0) break;
        const part = Math.min(left, x.cents);
        left -= part;
        const at = Math.floor((x.at + HOLD) / 60000) * 60000;
        groups.set(at, (groups.get(at) || 0) + part);
      }
      res.push({ cur, balance: bal[cur], held, available: bal[cur] - held, unlocks: [...groups.entries()].sort((a, b) => a[0] - b[0]) });
    }
    return res;
  }

  let box = null;
  function render(list) {
    const data = compute(list).filter((d) => d.balance > 0);
    if (!box) {
      box = document.createElement('div');
      box.id = 'fptHoldBox';
      box.style.cssText = 'margin:14px 0;padding:14px 16px;border:1px solid rgba(27,117,187,.35);background:rgba(27,117,187,.05);font-size:13px;line-height:1.5';
      const anchor = document.querySelector('.balances-header') || document.querySelector('.balances-value');
      const host = anchor ? (anchor.closest('h1, .page-header') || anchor) : document.querySelector('.page-content');
      if (!host) return;
      host.after(box);
    }
    if (!data.length) { box.textContent = 'Холд 48 часов: на балансе пусто.'; return; }
    box.innerHTML = '';
    const title = document.createElement('div');
    title.style.cssText = 'font-weight:700;margin-bottom:8px';
    title.textContent = 'Вывод с учётом холда 48 часов';
    box.appendChild(title);
    for (const d of data) {
      const row = document.createElement('div');
      row.style.cssText = 'display:flex;gap:18px;flex-wrap:wrap;margin-bottom:6px';
      const a = document.createElement('span');
      a.innerHTML = '<span style="opacity:.7">Можно вывести сейчас:</span> ';
      const ab = document.createElement('b'); ab.style.color = '#2fa66a'; ab.textContent = fmt(d.available, d.cur); a.appendChild(ab);
      const h = document.createElement('span');
      h.innerHTML = '<span style="opacity:.7">В холде:</span> ';
      const hb = document.createElement('b'); hb.style.color = d.held ? '#d08a1e' : ''; hb.textContent = fmt(d.held, d.cur); h.appendChild(hb);
      row.append(a, h);
      box.appendChild(row);
      for (const [at, cents] of d.unlocks.slice(0, 12)) {
        const u = document.createElement('div');
        u.style.cssText = 'font-size:12px;opacity:.85;padding-left:10px';
        const when = new Date(at).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
        u.textContent = `+${fmt(cents, d.cur)} освободится ${inText(at - Date.now())} (${when})`;
        box.appendChild(u);
      }
      if (d.unlocks.length > 12) {
        const more = document.createElement('div');
        more.style.cssText = 'font-size:12px;opacity:.6;padding-left:10px';
        more.textContent = `и ещё ${d.unlocks.length - 12} поступлений`;
        box.appendChild(more);
      }
    }
    const foot = document.createElement('div');
    foot.style.cssText = 'margin-top:8px;font-size:11px;opacity:.6';
    foot.textContent = 'Считается по истории операций: поступления за последние 48 часов. ';
    const hide = document.createElement('a');
    hide.href = '#';
    hide.textContent = 'У меня нет холда, скрыть';
    hide.onclick = async (e) => { e.preventDefault(); await sset({ [K_OFF]: true }); box.remove(); };
    foot.appendChild(hide);
    box.appendChild(foot);
  }

  function note(text) {
    render([]);
    if (box) { box.textContent = text; }
  }
  async function run() {
    if ((await sget(K_OFF))[K_OFF]) return;
    if (!document.querySelector('.balances-value')) return;
    let list = [];
    try { list = await inflows(false); } catch (e) { note('Холд 48 часов: не удалось загрузить историю операций (' + (e && e.message || 'ошибка') + '). Обнови страницу.'); return; }
    render(list);
    if (await isInstant() && box) {
      const n = document.createElement('div');
      n.style.cssText = 'margin-top:6px;font-size:12px;opacity:.75';
      n.textContent = 'Похоже, твои последние выводы проходили сразу, без холда. Тогда выводить можно весь баланс.';
      box.insertBefore(n, box.lastChild);
    }
    setInterval(async () => { try { render(await inflows(false)); } catch {} }, 30000);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run); else run();
})();
