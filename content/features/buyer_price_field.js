// content/features/buyer_price_field.js
// Живое поле «Цена покупателю» на странице создания/редактирования лота.
// Показывает, сколько заплатит покупатель, и обновляется сразу при вводе цены.
// Логика как в lite: знаем множитель комиссии и умножаем. Без кнопки «рассчитать».

(function () {
  'use strict';

  const TEST_PRICE = 100000;
  let multiplier = null; // 1 + комиссия/100 (рублёвая)

  function isEditPage() {
    const h = document.querySelector('h1.page-header');
    return !!h && (h.textContent.includes('Редактирование предложения') || h.textContent.includes('Добавление предложения'));
  }

  function getNodeId() {
    // на форме есть hidden input node_id
    const ni = document.querySelector('input[name="node_id"]');
    if (ni && ni.value) return ni.value;
    const m = (location.search.match(/node=(\d+)/) || location.pathname.match(/\/lots\/(\d+)\//));
    return m ? m[1] : null;
  }

  function parseMoney(v) {
    if (typeof v === 'number') return v;
    if (typeof v !== 'string') return NaN;
    return parseFloat(v.replace(/\s/g, '').replace(/[^\d.,]/g, '').replace(',', '.'));
  }

  async function fetchMultiplier(nodeId) {
    try {
      const body = new URLSearchParams();
      body.append('nodeId', String(nodeId));
      body.append('price', String(TEST_PRICE));
      const r = await fetch('/lots/calc', {
        method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8', 'Accept': 'application/json, text/javascript, */*; q=0.01', 'X-Requested-With': 'XMLHttpRequest' },
        body,
      });
      if (!r.ok) return null;
      const j = await r.json();
      const methods = Array.isArray(j.methods) ? j.methods : null;
      if (!methods) return null;
      const rub = methods.filter((x) => { const u = (x && x.unit ? String(x.unit) : '').trim(); return u === '₽' || /руб/i.test(u); });
      const pool = rub.length ? rub : methods;
      const prices = pool.map((x) => parseMoney(x && x.price)).filter((n) => Number.isFinite(n) && n > 0);
      if (!prices.length) return null;
      const minBuyer = Math.min(...prices);
      return minBuyer / TEST_PRICE; // множитель
    } catch { return null; }
  }

  function buildField(priceInput) {
    if (document.getElementById('fpt-buyer-price-group')) return;
    const group = document.createElement('div');
    group.className = 'form-group has-feedback w-200px';
    group.id = 'fpt-buyer-price-group';
    const label = document.createElement('label');
    label.className = 'control-label';
    label.textContent = 'Цена покупателю';
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'form-control';
    input.id = 'fpt-buyer-price-input';
    input.placeholder = '—';
    input.inputMode = 'decimal';
    input.autocomplete = 'off';
    const feedback = document.createElement('span');
    feedback.className = 'form-control-feedback';
    feedback.textContent = '₽';
    const help = document.createElement('p');
    help.className = 'help-block';
    help.textContent = 'Сколько заплатит покупатель.';

    group.appendChild(label);
    group.appendChild(input);
    group.appendChild(feedback);
    group.appendChild(help);

    // ставим сразу после блока с ценой продавца
    const priceGroup = priceInput.closest('.form-group') || priceInput.parentElement;
    priceGroup.parentElement.insertBefore(group, priceGroup.nextSibling);
    return input;
  }

  let syncing = false;

  // продавец ввёл цену → считаем цену покупателю
  function sellerToBuyer(priceInput, buyerInput) {
    if (multiplier == null || syncing) return;
    syncing = true;
    const seller = parseMoney(priceInput.value);
    if (!Number.isFinite(seller) || seller <= 0) buyerInput.value = '';
    else buyerInput.value = (Math.round(seller * multiplier * 100) / 100).toFixed(2).replace('.', ',');
    syncing = false;
  }

  // покупателю ввели цену → считаем цену продавца и пишем в поле цены (нативно)
  function buyerToSeller(priceInput, buyerInput) {
    if (multiplier == null || syncing) return;
    syncing = true;
    const buyer = parseMoney(buyerInput.value);
    if (Number.isFinite(buyer) && buyer > 0) {
      const seller = Math.round((buyer / multiplier) * 100) / 100;
      // пишем в поле цены и дёргаем событие input, чтобы FunPay пересчитал свою таблицу
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
      if (setter) setter.call(priceInput, String(seller)); else priceInput.value = String(seller);
      priceInput.dispatchEvent(new Event('input', { bubbles: true }));
      priceInput.dispatchEvent(new Event('change', { bubbles: true }));
    }
    syncing = false;
  }

  async function init() {
    if (!isEditPage()) return;
    const priceInput = document.querySelector('input[name="price"]');
    if (!priceInput || document.getElementById('fpt-buyer-price-group')) return;
    const nodeId = getNodeId();
    if (!nodeId) return;

    const buyerInput = buildField(priceInput);
    if (!buyerInput) return;

    multiplier = await fetchMultiplier(nodeId);
    if (multiplier == null) {
      const help = document.querySelector('#fpt-buyer-price-group .help-block');
      if (help) help.textContent = 'Не удалось узнать комиссию раздела.';
      return;
    }
    sellerToBuyer(priceInput, buyerInput);
    priceInput.addEventListener('input', () => sellerToBuyer(priceInput, buyerInput));
    priceInput.addEventListener('keyup', () => sellerToBuyer(priceInput, buyerInput));
    buyerInput.addEventListener('input', () => buyerToSeller(priceInput, buyerInput));
    buyerInput.addEventListener('keyup', () => buyerToSeller(priceInput, buyerInput));
  }

  function boot() {
    let tries = 0;
    const iv = setInterval(() => {
      tries++;
      if (isEditPage() && document.querySelector('input[name="price"]')) {
        init();
        clearInterval(iv);
      } else if (tries > 40) clearInterval(iv);
    }, 250);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
