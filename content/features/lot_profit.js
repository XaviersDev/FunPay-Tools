// content/features/lot_profit.js - FunPay Tools
// Себестоимость лота и чистая прибыль.
//   /lots/offerEdit  поле "Себестоимость" (в любой валюте) и живой расчёт "чистыми с продажи"
//   /orders/trade    под ценой каждого заказа плюс или минус после себестоимости и комиссии вывода
// Курсы валют берёт фон расширения (fptGetRates), себестоимость хранится локально.

(function () {
  'use strict';
  if (window.top !== window) return;
  const path = location.pathname;
  const onEdit = path.startsWith('/lots/offerEdit');
  const onOrders = path.startsWith('/orders/trade');
  if (!onEdit && !onOrders) return;

  const KEY = 'fptCost:';
  const FEE_KEY = 'fptWithdrawFee';
  const CURS = ['RUB', 'USD', 'EUR', 'TRY', 'UAH', 'KZT', 'CNY', 'GBP', 'PLN', 'BRL'];
  const SIGN = { RUB: '₽', USD: '$', EUR: '€', TRY: '₺', UAH: '₴', KZT: '₸', CNY: '¥', GBP: '£', PLN: 'zł', BRL: 'R$' };
  const BY_SIGN = { '₽': 'RUB', 'руб': 'RUB', '$': 'USD', '€': 'EUR', '₺': 'TRY', '₴': 'UAH', '₸': 'KZT', '¥': 'CNY', '£': 'GBP', 'zł': 'PLN', 'R$': 'BRL' };

  const sget = async (k) => { try { return await chrome.storage.local.get(k); } catch { return {}; } };
  const sset = async (o) => { try { await chrome.storage.local.set(o); } catch {} };
  const num = (t) => { const v = parseFloat(String(t || '').replace(/\s| /g, '').replace(',', '.').replace(/[^\d.-]/g, '')); return isFinite(v) ? v : NaN; };
  const money = (v, cur) => `${v >= 0 ? '+' : '−'}${Math.abs(v).toLocaleString('ru-RU', { maximumFractionDigits: 2 })} ${SIGN[cur] || cur}`;

  function getRates() {
    return new Promise((res) => {
      try {
        chrome.runtime.sendMessage({ action: 'fptGetRates' }, (r) => res((r && r.rates) || null));
      } catch { res(null); }
      setTimeout(() => res(null), 8000);
    });
  }
  // rates: сколько единиц валюты за 1 USD
  const convert = (amount, from, to, rates) => (from === to ? amount : rates && rates[from] && rates[to] ? amount * rates[to] / rates[from] : NaN);
  function curFromText(t) {
    t = String(t || '');
    for (const s of ['R$', 'zł', '₽', '$', '€', '₺', '₴', '₸', '¥', '£']) if (t.includes(s)) return BY_SIGN[s];
    if (/руб/i.test(t)) return 'RUB';
    return 'RUB';
  }

  // ───────────────────────── страница лота ─────────────────────────
  async function initEdit() {
    const price = document.querySelector('input[name="price"]');
    if (!price || document.getElementById('fptCostBox')) return;
    const qs = new URLSearchParams(location.search);
    const offer = qs.get('offer');
    const node = qs.get('node') || (document.querySelector('input[name="node_id"]') || {}).value || '';
    const summaryEl = document.querySelector('[name="fields[summary][ru]"]') || document.querySelector('[name="fields[summary]"]');
    const serverEl = [...document.querySelectorAll('select[name]')].find((s) => /server/i.test(s.name));
    const sellerCur = curFromText((price.closest('.form-group, .input-group') || price.parentElement).textContent);
    const key = () => KEY + (offer && offer !== '0' ? offer : `new:${node}:${(summaryEl && summaryEl.value || '').trim().slice(0, 80)}`);

    const st = await sget([key(), FEE_KEY]);
    const saved = st[key()] || {};
    const fee = st[FEE_KEY] ?? 6;

    const box = document.createElement('div');
    box.id = 'fptCostBox';
    box.className = 'form-group';
    box.innerHTML = `
      <style>
        #fptCostBox .fc-row{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
        #fptCostBox .fc-lbl{font-size:12px;opacity:.6;min-width:96px}
        #fptCostBox .fc-in{display:inline-flex;align-items:center;border:1px solid rgba(127,127,127,.3);border-radius:8px;overflow:hidden;height:32px}
        #fptCostBox .fc-in input,#fptCostBox .fc-in select{border:0;background:transparent;color:inherit;height:30px;outline:none;font:inherit;font-size:13px}
        #fptCostBox .fc-in input{width:90px;padding:0 10px}
        #fptCostBox .fc-in select{padding:0 6px;border-left:1px solid rgba(127,127,127,.25);cursor:pointer}
        #fptCostBox .fc-fee{border:0;background:transparent;color:inherit;opacity:.55;font-size:12px;cursor:pointer;padding:0}
        #fptCostBox .fc-out{font-size:13px;font-weight:600;margin-left:auto;white-space:nowrap}
      </style>
      <div class="fc-row">
        <span class="fc-lbl">Себестоимость</span>
        <span class="fc-in"><input type="text" inputmode="decimal" id="fptCostAmount" placeholder="0"><select id="fptCostCur">${CURS.map((c) => `<option value="${c}">${SIGN[c]}</option>`).join('')}</select></span>
        <span class="fc-lbl" style="min-width:0">вывод</span>
        <select class="fc-fee" id="fptCostFee" title="Комиссия вывода"><option value="0">0%</option><option value="3">3%</option><option value="6">6%</option></select>
        <span class="fc-out" id="fptCostOut"></span>
      </div>`;
    (price.closest('.form-group') || price.parentElement).after(box);
    const $ = (id) => box.querySelector('#' + id);
    $('fptCostAmount').value = saved.amount ?? '';
    $('fptCostCur').value = saved.currency || 'RUB';
    $('fptCostFee').value = String(fee);

    let rates = null;
    const calc = () => {
      const sp = num(price.value), cost = num($('fptCostAmount').value);
      const f = Number($('fptCostFee').value);
      const out = $('fptCostOut');
      if (!isFinite(sp)) { out.textContent = ''; return; }
      const costIn = isFinite(cost) ? convert(cost, $('fptCostCur').value, sellerCur, rates) : 0;
      if (!isFinite(costIn)) { out.textContent = 'курс загружается…'; out.style.color = ''; return; }
      const net = sp * (1 - f / 100) - costIn;
      out.textContent = `${money(net, sellerCur)} чистыми`;
      out.title = isFinite(cost) && $('fptCostCur').value !== sellerCur ? `себестоимость ≈ ${costIn.toFixed(2)} ${SIGN[sellerCur]}` : 'видишь только ты';
      out.style.color = net >= 0 ? '#2fa66a' : '#e05252';
    };
    const persist = async () => {
      const amount = num($('fptCostAmount').value);
      await sset({ [FEE_KEY]: Number($('fptCostFee').value) });
      if (!isFinite(amount)) return;
      await sset({ [key()]: {
        amount, currency: $('fptCostCur').value,
        name: (summaryEl && summaryEl.value || '').trim(),
        server: serverEl && serverEl.selectedOptions[0] ? serverEl.selectedOptions[0].textContent.trim() : '',
        node, t: Date.now(),
      } });
    };
    ['input', 'change'].forEach((ev) => {
      [price, $('fptCostAmount'), $('fptCostCur'), $('fptCostFee')].forEach((el) => el.addEventListener(ev, () => { calc(); persist(); }));
    });
    if (summaryEl) summaryEl.addEventListener('change', persist);
    calc();
    rates = await getRates();
    calc();
  }

  // ───────────────────────── продажи ─────────────────────────
  async function initOrders() {
    const all = await sget(null);
    const costs = Object.entries(all).filter(([k]) => k.startsWith(KEY)).map(([, v]) => v).filter((v) => v && v.name && isFinite(v.amount));
    if (!costs.length) return;
    const fee = all[FEE_KEY] ?? 6;
    const rates = await getRates();
    // длинные названия первыми: "Аккаунт Steam 50 игр" не должен совпасть с "Аккаунт Steam"
    costs.sort((a, b) => b.name.length - a.name.length);

    const render = () => {
      document.querySelectorAll('a.tc-item').forEach((row) => {
        if (row.dataset.fptProfit) return;
        const descEl = row.querySelector('.order-desc > div:first-child') || row.querySelector('.order-desc');
        const priceEl = row.querySelector('.tc-price');
        if (!descEl || !priceEl) return;
        row.dataset.fptProfit = '1';
        const status = (row.querySelector('.tc-status') || {}).textContent || '';
        if (row.classList.contains('warning') || /возврат/i.test(status)) return;   // warning = возврат
        const desc = descEl.textContent.trim();
        const rec = costs.find((c) => desc.includes(c.name) && (!c.server || desc.includes(c.server)));
        if (!rec) return;
        const rest = desc.replace(rec.name, '').replace(rec.server || '', '').split(',').map((s) => s.trim());
        let qty = 1;
        for (const part of rest) { const q = part.match(/^(\d+)\s*(?:шт|pcs?)\.?$/i); if (q) { qty = Number(q[1]); break; } }
        const price = num(priceEl.textContent);
        const cur = curFromText(priceEl.textContent);
        const costIn = convert(rec.amount, rec.currency, cur, rates) * qty;
        if (!isFinite(price) || !isFinite(costIn)) return;
        const net = price * (1 - fee / 100) - costIn;
        const tag = document.createElement('div');
        tag.className = 'fpt-profit';
        tag.style.cssText = `font-size:11px;font-weight:600;opacity:.85;color:${net >= 0 ? '#2fa66a' : '#e05252'};white-space:nowrap;margin-top:2px`;
        tag.textContent = money(net, cur);
        tag.title = `Чистыми: ${price} − ${fee}% вывода − себестоимость ${qty} × ${rec.amount} ${rec.currency} (≈ ${costIn.toFixed(2)} ${SIGN[cur]})`;
        priceEl.appendChild(tag);
      });
    };
    render();
    new MutationObserver(render).observe(document.body, { childList: true, subtree: true });
  }

  const go = () => (onEdit ? initEdit() : initOrders());
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', go); else go();
})();
