// content/features/section_commission.js
// Комиссия раздела + реальные цены лотов.
// Механизм: FunPay /lots/calc (POST nodeId+price) -> методы оплаты (что платит
// покупатель). Комиссия = min(ценаПокупателя)/тест - 1. Реальная цена лота = цена/(1+к).

(function () {
  'use strict';

  const TEST_PRICE = 100000;
  const CACHE_TTL = 10 * 60 * 1000;
  const cache = new Map();

  function log(...a) { try { console.log('[FPT Commission]', ...a); } catch {} }

  function getNodeId() {
    const m = location.pathname.match(/\/lots\/(\d+)\//);
    if (m) return m[1];
    const back = document.querySelector('a.js-back-link[href*="/lots/"], a[href*="/lots/"][class*="back"]');
    if (back) { const mm = back.getAttribute('href').match(/\/lots\/(\d+)\//); if (mm) return mm[1]; }
    return null;
  }

  function parseMoney(v) {
    if (typeof v === 'number') return v;
    if (typeof v !== 'string') return NaN;
    // убираем всё кроме цифр, точки, запятой; запятую -> точка; пробелы-разделители убираем
    const cleaned = v.replace(/\s/g, '').replace(/[^\d.,]/g, '').replace(',', '.');
    return parseFloat(cleaned);
  }

  async function fetchCalc(nodeId, price) {
    try {
      const body = new URLSearchParams();
      body.append('nodeId', String(nodeId));
      body.append('price', String(price));
      const r = await fetch('/lots/calc', {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
          'Accept': 'application/json, text/javascript, */*; q=0.01',
          'X-Requested-With': 'XMLHttpRequest',
        },
        body,
      });
      if (!r.ok) { log('calc HTTP', r.status); return null; }
      const j = await r.json();
      log('calc raw response:', j);
      return j;
    } catch (e) { log('calc error', e && e.message); return null; }
  }

  function percentFromCalc(j, testPrice) {
    if (!j) return null;
    const methods = Array.isArray(j.methods) ? j.methods : (Array.isArray(j) ? j : null);
    if (!methods || !methods.length) { log('no methods in response'); return null; }
    // ВАЖНО: берём только рублёвые методы (unit ₽), иначе min цепляет $/€ (их числа мельче)
    // и комиссия считается в чужой валюте → бред вроде -98%.
    const rub = methods.filter((x) => {
      const u = (x && x.unit ? String(x.unit) : '').trim();
      return u === '₽' || /руб/i.test(u);
    });
    const pool = rub.length ? rub : methods; // если вдруг рублей нет — что есть
    const prices = pool
      .map((x) => parseMoney(x && (x.price != null ? x.price : x)))
      .filter((n) => Number.isFinite(n) && n > 0);
    if (!prices.length) { log('no parseable prices'); return null; }
    const minBuyer = Math.min(...prices);
    const percent = (minBuyer / testPrice - 1) * 100;
    log('minBuyer=', minBuyer, 'testPrice=', testPrice, 'percent=', percent);
    return percent >= 0 ? percent : 0;
  }

  async function getPercent(nodeId) {
    const c = cache.get(nodeId);
    if (c && Date.now() - c.at < CACHE_TTL) return c.percent;
    const j = await fetchCalc(nodeId, TEST_PRICE);
    const percent = percentFromCalc(j, TEST_PRICE);
    if (percent == null) return null;
    cache.set(nodeId, { percent, at: Date.now() });
    return percent;
  }

  // --- комиссия рядом с заголовком (ванильный стиль FunPay) ---
  async function renderSectionCommission(nodeId) {
    const heading = document.querySelector('h1.page-header') || document.querySelector('.page-header') || document.querySelector('h1');
    if (!heading || heading.querySelector('.fpt-comm')) return;
    const percent = await getPercent(nodeId);
    if (percent == null) return;
    const span = document.createElement('small');
    span.className = 'fpt-comm text-muted';
    span.style.marginLeft = '10px';
    span.style.fontWeight = 'normal';
    span.textContent = 'Комиссия: ' + percent.toFixed(1).replace('.', ',') + '%';
    heading.appendChild(span);
    log('section commission rendered', percent.toFixed(2) + '%');
  }

  // --- реальные цены под каждым лотом (ванильный стиль) ---
  async function renderRealPrices(nodeId) {
    const rows = Array.from(document.querySelectorAll('a.tc-item'));
    if (!rows.length) return;
    const percent = await getPercent(nodeId);
    if (percent == null || percent <= 0) return; // 0% — нечего показывать
    const divisor = 1 + percent / 100;

    rows.forEach((row) => {
      const priceEl = row.querySelector('.tc-price');
      if (!priceEl || priceEl.querySelector('.fpt-realprice')) return;
      // берём ВИДИМУЮ цену (то, что показано юзеру), а не data-s —
      // на страницах валют/чипов data-s хранит цену за единицу с кучей знаков.
      const unit = (priceEl.querySelector('.unit')?.textContent || '').trim();
      // текст цены без .unit и без нашего блока
      let priceText = '';
      priceEl.childNodes.forEach((n) => {
        if (n.nodeType === 3) priceText += n.textContent; // только текстовые узлы
      });
      let price = parseFloat(priceText.replace(/\s/g, '').replace(/[^\d.,]/g, '').replace(',', '.'));
      if (!Number.isFinite(price) || price <= 0) {
        // запасной вариант — data-s
        const raw = priceEl.getAttribute('data-s');
        price = raw != null ? parseFloat(raw) : NaN;
      }
      if (!Number.isFinite(price) || price <= 0) return;
      const net = Math.round((price / divisor) * 100) / 100;
      const el = document.createElement('div');
      el.className = 'fpt-realprice text-muted';
      el.style.fontSize = '10px';
      el.style.lineHeight = '1.2';
      el.style.marginTop = '1px';
      el.style.opacity = '0.7';
      el.style.fontWeight = 'normal';
      el.textContent = net.toFixed(2).replace('.', ',') + (unit ? ' ' + unit : '');
      el.title = 'Сколько придёт после комиссии FunPay (' + percent.toFixed(1) + '%)';
      priceEl.appendChild(el);
    });
    log('real prices rendered for', rows.length, 'rows');
  }

  function isLotsPage() {
    if (!/\/lots\/\d+\//.test(location.pathname)) return false;
    return !!document.querySelector('a.tc-item') || !!document.querySelector('h1.page-header');
  }

  let running = false;
  async function run() {
    if (running) return;
    running = true;
    try {
      const nodeId = getNodeId();
      if (!nodeId) return;
      // настройки: по умолчанию ОБЕ выключены
      let showComm = false, showReal = false;
      try {
        const st = await chrome.storage.local.get(['fptShowCommission', 'fptShowRealPrices']);
        showComm = st.fptShowCommission === true;
        showReal = st.fptShowRealPrices === true;
      } catch {}
      if (!showComm && !showReal) return;
      if (showComm) await renderSectionCommission(nodeId);
      if (showReal) await renderRealPrices(nodeId);
    } catch (e) { log('run error', e && e.message); }
    finally { running = false; }
  }

  function boot() {
    if (isLotsPage()) run();
    function needsRun() {
      if (!isLotsPage()) return false;
      if (!document.querySelector('.fpt-comm')) return true;
      const prices = document.querySelectorAll('.tc-item .tc-price');
      for (const p of prices) { if (!p.querySelector('.fpt-realprice')) return true; }
      return false;
    }
    const obs = new MutationObserver(() => { if (needsRun()) run(); });
    try { obs.observe(document.body, { childList: true, subtree: true }); } catch {}
    let last = location.pathname;
    setInterval(() => { if (location.pathname !== last) { last = location.pathname; cache.clear(); if (isLotsPage()) run(); } }, 700);
  }

  // мгновенное применение при переключении галок в настройках (без перезагрузки)
  function removeCommission() { document.querySelectorAll('.fpt-comm').forEach(el => el.remove()); }
  function removeRealPrices() { document.querySelectorAll('.fpt-realprice').forEach(el => el.remove()); }
  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.onChanged) {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local') return;
      if (changes.fptShowCommission) {
        if (changes.fptShowCommission.newValue === true) { if (isLotsPage()) run(); }
        else removeCommission();
      }
      if (changes.fptShowRealPrices) {
        if (changes.fptShowRealPrices.newValue === true) { if (isLotsPage()) run(); }
        else removeRealPrices();
      }
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
