// content/features/lot_reorder.js - FunPay Tools
// Порядок лотов перетаскиванием на /lots/<node>/trade.
// Новый лот на FunPay всегда встаёт наверх, поэтому "поднять" лот = создать его копию и удалить старый.
// Чтобы трогать как можно меньше лотов, переносим только верхнюю часть списка, которая поменялась,
// и создаём её снизу вверх: последний созданный окажется самым верхним.

(function () {
  'use strict';
  if (window.top !== window) return;
  const m = location.pathname.match(/^\/lots\/(\d+)\/trade\/?$/);
  if (!m) return;
  const NODE = m[1];
  const RECOVERY_KEY = 'fptReorderRecovery';
  const PAUSE = 400;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const esc = (s) => (window.fptEsc ? window.fptEsc(s) : String(s == null ? '' : s));

  function csrf() {
    try {
      const d = JSON.parse(document.body.dataset.appData || '{}');
      return (Array.isArray(d) ? d[0] : d)['csrf-token'] || '';
    } catch { return ''; }
  }
  const rows = () => [...document.querySelectorAll('a.tc-item[data-offer]')].filter((r) => /^\d+$/.test(r.dataset.offer));
  const notify = (t, err) => { if (typeof showNotification === 'function') showNotification(t, !!err); };

  // ───────────────────────── запросы к FunPay ─────────────────────────
  async function req(url, opts = {}) {
    for (let attempt = 0; attempt < 4; attempt++) {
      const r = await fetch(url, { credentials: 'same-origin', ...opts });
      if (r.status === 429) { await sleep(5000); continue; }
      return r;
    }
    throw new Error('FunPay просит подождать (429). Попробуй через минуту.');
  }
  async function knownIds() {
    const r = await req(`/lots/${NODE}/trade`);
    const doc = new DOMParser().parseFromString(await r.text(), 'text/html');
    return new Set([...doc.querySelectorAll('a.tc-item[data-offer]')].map((a) => a.dataset.offer));
  }
  async function loadForm(offerId) {
    const r = await req(`/lots/offerEdit?node=${NODE}&offer=${offerId}`);
    const doc = new DOMParser().parseFromString(await r.text(), 'text/html');
    const form = doc.querySelector('form.form-offer-editor') || doc.querySelector('form[action*="offerSave"]') || doc.querySelector('form');
    if (!form) throw new Error('не открылась форма лота');
    const pairs = [...new FormData(form).entries()].filter(([, v]) => typeof v === 'string');
    const get = (k) => (pairs.find(([n]) => n === k) || [])[1];
    // автовыдача включена, а товаров в форме нет: копия получится без товаров, лучше не трогать
    const auto = pairs.some(([n, v]) => n === 'auto_delivery' && v && v !== '0');
    const amount = Number(get('amount') || 0);
    const secrets = (get('secrets') || '').trim();
    if (auto && amount > 0 && !secrets) throw new Error('у лота включена автовыдача, но FunPay не отдал товары. Лот не тронут');
    return pairs;
  }
  async function save(pairs) {
    const body = new URLSearchParams();
    pairs.forEach(([k, v]) => body.append(k, v));
    const r = await req('/lots/offerSave', {
      method: 'POST', body,
      headers: { accept: 'application/json, */*', 'content-type': 'application/x-www-form-urlencoded; charset=UTF-8', 'x-requested-with': 'XMLHttpRequest' },
    });
    let j = {};
    try { j = await r.json(); } catch {}
    const text = JSON.stringify(j).toLowerCase();
    if ((r.redirected && /premium\/limit/.test(r.url)) || /premium\/limit|лимит|limit/.test(text)) return { limit: true };
    if (!r.ok || j.error) return { error: (j.msg || j.error || ('HTTP ' + r.status)).toString() };
    return { ok: true };
  }
  async function del(offerId) {
    const body = new URLSearchParams({ offer_id: String(offerId), deleted: '1', csrf_token: csrf() });
    const r = await req('/lots/offerSave', {
      method: 'POST', body,
      headers: { accept: '*/*', 'content-type': 'application/x-www-form-urlencoded; charset=UTF-8', 'x-requested-with': 'XMLHttpRequest' },
    });
    if (!r.ok) throw new Error('не удалился старый лот ' + offerId);
  }
  const asCopy = (pairs) => pairs.map(([k, v]) => [k, k === 'offer_id' ? '0' : k === 'csrf_token' ? (csrf() || v) : v])
    .concat(pairs.some(([k]) => k === 'offer_id') ? [] : [['offer_id', '0']])
    .concat(pairs.some(([k]) => k === 'node_id') ? [] : [['node_id', NODE]]);

  async function findNew(before) {
    for (let i = 0; i < 4; i++) {
      const now = await knownIds();
      const fresh = [...now].filter((id) => !before.has(id));
      if (fresh.length) return fresh[0];
      await sleep(800);
    }
    return null;
  }

  // ───────────────────────── перенос одного лота наверх ─────────────────────────
  async function moveToTop(offerId, allowDeleteFirst) {
    const pairs = await loadForm(offerId);
    const before = await knownIds();
    await sleep(PAUSE);
    const res = await save(asCopy(pairs));
    if (res.ok) {
      const nid = await findNew(before);
      if (!nid) throw new Error('копия создалась, но FunPay не показал её в списке. Старый лот оставлен');
      await sleep(PAUSE);
      await del(offerId);
      return nid;
    }
    if (!res.limit) throw new Error(res.error);
    if (!(await allowDeleteFirst())) throw new Error('упёрлись в лимит лотов, перенос остановлен');
    // лимит: сначала удаляем, потом создаём. Поля сохраняем, чтобы восстановить, если создание сорвётся
    await saveRecovery(offerId, pairs);
    await del(offerId);
    for (let attempt = 1; attempt <= 3; attempt++) {
      await sleep(2000 * attempt);
      const b2 = await knownIds();
      const r2 = await save(asCopy(pairs));
      if (r2.ok) {
        const nid = await findNew(b2);
        await dropRecovery(offerId);
        return nid;
      }
    }
    throw new Error('лот удалён, а новый не создался. Его можно восстановить кнопкой «Восстановить лот»');
  }

  async function saveRecovery(id, pairs) {
    const cur = (await chrome.storage.local.get(RECOVERY_KEY))[RECOVERY_KEY] || {};
    cur[id] = { node: NODE, pairs, t: Date.now() };
    await chrome.storage.local.set({ [RECOVERY_KEY]: cur });
  }
  async function dropRecovery(id) {
    const cur = (await chrome.storage.local.get(RECOVERY_KEY))[RECOVERY_KEY] || {};
    delete cur[id];
    await chrome.storage.local.set({ [RECOVERY_KEY]: cur });
  }

  // ───────────────────────── какие лоты переносить ─────────────────────────
  // Снизу ищем самый длинный хвост, который уже идёт в старом порядке: его не трогаем.
  // Всё выше переносим снизу вверх.
  function plan(baseOrder, newOrder) {
    const pos = new Map(baseOrder.map((id, i) => [id, i]));
    let k = newOrder.length - 1;
    while (k > 0 && pos.get(newOrder[k - 1]) < pos.get(newOrder[k])) k--;
    const prefix = newOrder.slice(0, k);
    return prefix.reverse();
  }

  // ───────────────────────── интерфейс ─────────────────────────
  let editing = false;
  let baseOrder = [];
  let bar = null;

  function injectStyles() {
    if (document.getElementById('fpt-reorder-style')) return;
    const st = document.createElement('style');
    st.id = 'fpt-reorder-style';
    st.textContent = `
      .fpt-ro-bar { display:flex; align-items:center; gap:8px; flex-wrap:wrap; margin:10px 0; padding:10px 12px; border:1px solid rgba(27,117,187,.35); background:rgba(27,117,187,.06); font-size:13px; }
      .fpt-ro-bar b { margin-right:auto; }
      .fpt-ro-btn { border:1px solid #1b75bb; background:#1b75bb; color:#fff; padding:6px 12px; font-weight:600; cursor:pointer; font-size:13px; }
      .fpt-ro-btn.ghost { background:transparent; color:#1b75bb; }
      .fpt-ro-btn[disabled] { opacity:.5; cursor:wait; }
      body.fpt-ro-on a.tc-item[data-offer] { cursor:grab; user-select:none; position:relative; transition: background .15s; }
      body.fpt-ro-on a.tc-item[data-offer]::before { content:'⠿'; position:absolute; left:-18px; top:50%; transform:translateY(-50%); color:#1b75bb; font-size:16px; touch-action:none; }
      body.fpt-ro-on a.tc-item.fpt-ro-drag { opacity:.55; background:rgba(27,117,187,.12) !important; cursor:grabbing; }
      body.fpt-ro-on a.tc-item.fpt-ro-moved { box-shadow: inset 3px 0 0 #1b75bb; }
      a.tc-item.fpt-ro-done { box-shadow: inset 3px 0 0 #2fa66a; }
    `;
    document.head.appendChild(st);
  }

  function mountButton() {
    if (document.getElementById('fptReorderBar') || rows().length < 2) return;
    injectStyles();
    const first = rows()[0];
    const table = first.closest('.tc') || first.parentElement;
    bar = document.createElement('div');
    bar.id = 'fptReorderBar';
    bar.className = 'fpt-ro-bar';
    table.parentElement.insertBefore(bar, table);
    renderIdle();
    checkRecovery();
  }

  function renderIdle() {
    bar.innerHTML = `<b>Порядок лотов</b><span>Перетащи лоты мышкой, как нужно, и сохрани.</span>
      <button class="fpt-ro-btn" id="fptRoStart">Изменить порядок</button>`;
    bar.querySelector('#fptRoStart').onclick = start;
  }

  function start() {
    editing = true;
    baseOrder = rows().map((r) => r.dataset.offer);
    document.body.classList.add('fpt-ro-on');
    bar.innerHTML = `<b>Тащи лоты вверх или вниз</b>
      <button class="fpt-ro-btn" id="fptRoSave">Сохранить порядок</button>
      <button class="fpt-ro-btn ghost" id="fptRoCancel">Отмена</button>`;
    bar.querySelector('#fptRoSave').onclick = apply;
    bar.querySelector('#fptRoCancel').onclick = cancel;
  }

  function cancel() {
    const parent = rows()[0].parentElement;
    const byId = new Map(rows().map((r) => [r.dataset.offer, r]));
    baseOrder.forEach((id) => { const r = byId.get(id); if (r) parent.appendChild(r); });
    stop();
  }
  function stop() {
    editing = false;
    document.body.classList.remove('fpt-ro-on');
    rows().forEach((r) => r.classList.remove('fpt-ro-moved'));
    renderIdle();
  }

  async function apply() {
    const newOrder = rows().map((r) => r.dataset.offer);
    const todo = plan(baseOrder, newOrder);
    if (!todo.length) { notify('Порядок не изменился'); return stop(); }
    if (!confirm(`Перенесу ${todo.length} лот(а): создам их копии и удалю старые, тексты, цены и товары автовыдачи переносятся. Продолжить?`)) return;
    document.body.classList.remove('fpt-ro-on');
    editing = false;
    let asked = null;
    const allowDeleteFirst = async () => {
      if (asked === null) asked = confirm('FunPay не даёт создать ещё один лот: достигнут лимит. Можно переносить по-другому: сначала удалить лот, потом создать заново (поля я сохраню на случай сбоя). Продолжить так?');
      return asked;
    };
    let done = 0;
    for (const id of todo) {
      bar.innerHTML = `<b>Переношу лоты: ${done}/${todo.length}</b><span>Не закрывай страницу.</span>`;
      try {
        const nid = await moveToTop(id, allowDeleteFirst);
        const row = rows().find((r) => r.dataset.offer === id);
        if (row && nid) {
          row.dataset.offer = nid;
          row.href = row.href.replace(/(offer=|id=)\d+/, '$1' + nid);
          row.classList.add('fpt-ro-done');
        }
        done++;
        await sleep(PAUSE);
      } catch (e) {
        notify('Порядок лотов: ' + e.message, true);
        break;
      }
    }
    notify(done === todo.length ? `Готово: порядок сохранён, перенесено ${done}` : `Перенесено ${done} из ${todo.length}. Обнови страницу и проверь порядок.`, done !== todo.length);
    renderIdle();
  }

  async function checkRecovery() {
    let cur = {};
    try { cur = (await chrome.storage.local.get(RECOVERY_KEY))[RECOVERY_KEY] || {}; } catch { return; }
    const mine = Object.entries(cur).filter(([, v]) => v.node === NODE);
    if (!mine.length) return;
    const note = document.createElement('div');
    note.className = 'fpt-ro-bar';
    note.style.borderColor = '#e0a040';
    note.innerHTML = `<b>Есть ${mine.length} несозданный лот(а) после переноса</b>
      <button class="fpt-ro-btn" id="fptRoRestore">Восстановить лот</button>
      <button class="fpt-ro-btn ghost" id="fptRoForget">Забыть</button>`;
    bar.after(note);
    note.querySelector('#fptRoForget').onclick = async () => {
      for (const [id] of mine) await dropRecovery(id);
      note.remove();
    };
    note.querySelector('#fptRoRestore').onclick = async () => {
      let ok = 0;
      for (const [id, v] of mine) {
        const r = await save(asCopy(v.pairs));
        if (r.ok) { ok++; await dropRecovery(id); } else notify('Не восстановился лот ' + id + ': ' + (r.error || 'лимит лотов'), true);
        await sleep(PAUSE);
      }
      if (ok) { notify(`Восстановлено: ${ok}. Обновляю страницу`); setTimeout(() => location.reload(), 1200); }
    };
  }

  // ───────────────────────── перетаскивание ─────────────────────────
  let drag = null;
  document.addEventListener('pointerdown', (e) => {
    if (!editing || e.button !== 0) return;
    const row = e.target.closest('a.tc-item[data-offer]');
    if (!row) return;
    drag = { row, y0: e.clientY, active: false, pid: e.pointerId };
  }, true);
  document.addEventListener('pointermove', (e) => {
    if (!drag) return;
    if (!drag.active) {
      if (Math.abs(e.clientY - drag.y0) < 5) return;
      drag.active = true;
      drag.row.classList.add('fpt-ro-drag');
    }
    e.preventDefault();
    const list = rows();
    for (const other of list) {
      if (other === drag.row) continue;
      const r = other.getBoundingClientRect();
      const mid = r.top + r.height / 2;
      if (e.clientY < mid && drag.row.compareDocumentPosition(other) & Node.DOCUMENT_POSITION_PRECEDING) {
        other.parentElement.insertBefore(drag.row, other);
        break;
      }
      if (e.clientY > mid && drag.row.compareDocumentPosition(other) & Node.DOCUMENT_POSITION_FOLLOWING) {
        const next = other.nextElementSibling;
        if (r.bottom > e.clientY) { other.parentElement.insertBefore(drag.row, next); break; }
      }
    }
    // автопрокрутка у краёв окна
    if (e.clientY < 60) scrollBy(0, -14);
    else if (e.clientY > innerHeight - 60) scrollBy(0, 14);
  }, { passive: false });
  const end = () => {
    if (!drag) return;
    if (drag.active) {
      drag.row.classList.remove('fpt-ro-drag');
      drag.row.classList.add('fpt-ro-moved');
      drag.justDragged = true;
      const r = drag.row;
      setTimeout(() => { r.dataset.fptRoClick = ''; }, 0);
      r.dataset.fptRoClick = '1';
    }
    drag = null;
  };
  document.addEventListener('pointerup', end, true);
  document.addEventListener('pointercancel', end, true);
  // в режиме сортировки клики по лотам не открывают их
  document.addEventListener('click', (e) => {
    if (!editing) return;
    if (e.target.closest('a.tc-item[data-offer]')) { e.preventDefault(); e.stopPropagation(); }
  }, true);
  document.addEventListener('dragstart', (e) => { if (editing && e.target.closest && e.target.closest('a.tc-item')) e.preventDefault(); }, true);

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mountButton);
  else mountButton();
  setTimeout(mountButton, 1500);

  window.__fptReorderPlan = plan; // для проверки
})();
