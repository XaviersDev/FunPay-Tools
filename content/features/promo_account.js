// content/features/promo_account.js - FunPay Tools
// Вкладка "Аккаунт" и акция "цветной ник на 3 дня" (до 30 января).
// Сервер акции: Cloudflare Worker fpt-promo. Секретов в расширении нет.

(function () {
  'use strict';
  if (window.top !== window) return;

  const API = 'https://fpt-promo.starobinskiy01.workers.dev';
  const PROMO_END = Date.parse('2027-01-30T23:59:59+03:00');
  const GIFT_DAYS = 3;
  const CHECK_DELAY_MS = 26.52671488 * 1000; // столько ждём "проверку подписки"
  const CHANNEL = 'FPTools';
  const GROUP = 'funpay_community_chat';
  const DONATE_URL = 'https://funpay.tools/donate';
  const BOT_URL = 'https://t.me/FPToolsBot';

  const VERIFY_NODE_ID = '2046';
  const VERIFY_TITLE = 'FPT Verify';
  const VERIFY_PRICE = '1000';
  const PENDING_LOTS_KEY = 'fptPendingVerifyLots'; // общая очередь с описаниями профиля: недоудалённые лоты дочистятся

  const K_STATE = 'fptPromoState';        // { channelOk, ticket, groupOk }
  const K_CLAIM = 'fptPromoClaim';        // { fpid, name, until }
  const K_MODAL = 'fptPromoModal';        // { count, last }
  const K_NEW = 'fptAccountNewSince';
  const NEW_MS = 14 * 24 * 3600 * 1000;

  // ───────────────────────── утилиты ─────────────────────────
  const $ = (sel, root) => (root || document).querySelector(sel);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const promoActive = () => Date.now() < PROMO_END;

  async function sget(keys) { try { return (await chrome.storage.local.get(keys)) || {}; } catch { return {}; } }
  async function sset(obj) { try { await chrome.storage.local.set(obj); } catch {} }

  function appData() {
    try {
      const raw = document.body && (document.body.dataset.appData || document.body.getAttribute('data-app-data'));
      if (!raw) return null;
      const d = JSON.parse(raw);
      return Array.isArray(d) ? d[0] : d;
    } catch { return null; }
  }
  const myId = () => { const v = Number(appData() && appData().userId); return v > 0 ? v : null; };
  const csrf = () => (appData() && appData()['csrf-token']) || '';
  function myName() {
    const el = document.querySelector('.user-link-name');
    return el ? el.textContent.trim() : '';
  }
  // Аватарка из навбара FunPay: .user-link-photo, внутри <img src>, иначе background-image
  function myAvatar() {
    for (const el of document.querySelectorAll('.user-link-photo')) {
      const img = el.tagName === 'IMG' ? el : el.querySelector('img');
      let url = img && img.getAttribute('src');
      if (!url) {
        const m = (el.getAttribute('style') || getComputedStyle(el).backgroundImage || '').match(/url\(["']?([^"')]+)["']?\)/);
        url = m && m[1];
      }
      if (url) { try { return new URL(url, 'https://funpay.com/').href; } catch { return url; } }
    }
    return '';
  }
  function fmtDate(ts) {
    const d = new Date(ts);
    return d.toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  }
  function left(ts) {
    const ms = Math.max(0, ts - Date.now());
    const d = Math.floor(ms / 86400000), h = Math.floor(ms / 3600000) % 24, m = Math.floor(ms / 60000) % 60;
    return d ? `${d} д ${h} ч` : h ? `${h} ч ${m} мин` : `${m} мин`;
  }
  function toast(msg, isErr) { if (typeof showNotification === 'function') showNotification(msg, !!isErr); }

  async function api(path, body) {
    const r = await fetch(API + path, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}),
    });
    let j = {};
    try { j = await r.json(); } catch {}
    if (!r.ok && !j.error) j.error = 'HTTP_' + r.status;
    return j;
  }

  const ERRORS = {
    PROMO_ENDED: 'Акция закончилась.',
    ALREADY_CLAIMED: 'Подарок на этот аккаунт FunPay уже получен.',
    ALREADY_HAS_NICK: 'У тебя уже есть цветной ник, подарок не нужен.',
    TG_ALREADY_USED: 'С этого Telegram подарок уже забирали.',
    GROUP_NOT_CONFIRMED: 'Не подтвердилось вступление в чат. Пройди шаги заново.',
    BAD_KEY: 'Ключ не похож на FPT-STYLE. Скопируй его в генераторе ещё раз.',
    NO_SESSION: 'Нужно заново подтвердить аккаунт FunPay.',
    NOT_ACTIVE: 'Подарок уже закончился.',
    TOO_MANY_CHANGES: 'Стиль меняли слишком часто.',
    PAID_NICK: 'Ник уже куплен навсегда, меняй стиль через бота.',
    VERIFY_TIMEOUT: 'FunPay долго не показывает проверочный лот. Попробуй через минуту.',
    SERVER_ERROR: 'Сервер акции не ответил. Попробуй позже.',
  };
  const errText = (code) => ERRORS[code] || ('Ошибка: ' + code);

  // ───────────────────────── подтверждение аккаунта FunPay ─────────────────────────
  // Временный лот в разделе 2046 с кодом: сервер видит его на странице лота и понимает,
  // что аккаунт твой. Лот удаляется сразу после проверки.
  function collectForm(doc) {
    const out = {};
    doc.querySelectorAll('form input[name]').forEach((n) => {
      const t = (n.type || '').toLowerCase();
      if (t === 'checkbox' || t === 'radio') { if (n.checked) out[n.name] = n.value || 'on'; }
      else out[n.name] = n.value == null ? '' : n.value;
    });
    doc.querySelectorAll('form textarea[name]').forEach((n) => { out[n.name] = n.value == null ? '' : n.value; });
    doc.querySelectorAll('form select[name]').forEach((n) => {
      const opt = n.querySelector('option[selected]');
      let val = opt ? opt.value : (n.value == null ? '' : n.value);
      if (!val) {
        const first = Array.from(n.querySelectorAll('option')).find((o) => o.value.trim() !== '');
        if (first) val = first.value;
      }
      out[n.name] = val;
    });
    return out;
  }
  function pickOfferId(obj) {
    for (const v of [obj && obj.id, obj && obj.offer_id, obj && obj.offerId]) {
      const n = Number(v); if (Number.isFinite(n) && n > 0) return n;
    }
    if (obj && typeof obj.url === 'string') { const m = obj.url.match(/[?&]id=(\d+)/); if (m) return Number(m[1]); }
    return null;
  }
  async function findLotByCode(code) {
    try {
      const r = await fetch('/lots/' + VERIFY_NODE_ID + '/trade', { credentials: 'same-origin' });
      if (!r.ok) return null;
      const doc = new DOMParser().parseFromString(await r.text(), 'text/html');
      const ids = Array.from(doc.querySelectorAll('a.tc-item[data-offer]'))
        .filter((el) => (el.textContent || '').includes(code))
        .map((el) => Number(el.getAttribute('data-offer')))
        .filter((n) => n > 0);
      return ids[0] || null;
    } catch { return null; }
  }
  async function createLot(code) {
    const formRes = await fetch('/lots/offerEdit?node=' + VERIFY_NODE_ID, { credentials: 'same-origin' });
    if (!formRes.ok) throw new Error('FUNPAY_FORM_' + formRes.status);
    const doc = new DOMParser().parseFromString(await formRes.text(), 'text/html');
    const f = collectForm(doc);
    f.csrf_token = f.csrf_token || csrf();
    f.node_id = f.node_id || VERIFY_NODE_ID;
    f.offer_id = f.offer_id || '0';
    f.location = 'trade';
    if ('fields[summary][ru]' in f) f['fields[summary][ru]'] = VERIFY_TITLE + ' ' + code;
    if ('fields[summary][en]' in f) f['fields[summary][en]'] = VERIFY_TITLE + ' ' + code;
    f['fields[desc][ru]'] = code;
    f['fields[desc][en]'] = code;
    f.price = VERIFY_PRICE;
    f.active = 'on';
    if ('amount' in f) f.amount = f.amount || '1';
    const body = new URLSearchParams();
    for (const k in f) body.append(k, f[k] == null ? '' : f[k]);
    const saveRes = await fetch('/lots/offerSave', {
      method: 'POST', credentials: 'same-origin', body,
      headers: { accept: '*/*', 'content-type': 'application/x-www-form-urlencoded; charset=UTF-8', 'x-requested-with': 'XMLHttpRequest' },
    });
    if (!saveRes.ok) throw new Error('FUNPAY_SAVE_' + saveRes.status);
    const j = await saveRes.json().catch(() => ({}));
    if (j && j.error) throw new Error('FUNPAY_SAVE_ERROR');
    const id = pickOfferId(j) || (await findLotByCode(code));
    if (!id) throw new Error('OFFER_ID_NOT_FOUND');
    return id;
  }
  async function deleteLot(offerId) {
    const body = new URLSearchParams();
    body.append('offer_id', String(offerId));
    body.append('deleted', '1');
    body.append('csrf_token', csrf());
    const r = await fetch('/lots/offerSave', {
      method: 'POST', credentials: 'same-origin', body,
      headers: { accept: '*/*', 'content-type': 'application/x-www-form-urlencoded; charset=UTF-8', 'x-requested-with': 'XMLHttpRequest' },
    });
    if (!r.ok) throw new Error('DELETE_' + r.status);
  }
  async function trackLot(id, add) {
    const cur = (await sget([PENDING_LOTS_KEY]))[PENDING_LOTS_KEY] || {};
    if (add) cur[String(id)] = Date.now(); else delete cur[String(id)];
    await sset({ [PENDING_LOTS_KEY]: cur });
  }
  async function cleanupLot(id) {
    for (let i = 0; i < 4; i++) {
      try { await deleteLot(id); await trackLot(id, false); return; } catch { await sleep(1500 * (i + 1)); }
    }
  }

  async function getSession(fpid, onStep) {
    const key = 'fptPromoSession_' + fpid;
    const saved = (await sget([key]))[key];
    if (saved && saved.token) {
      const st = await api('/status', { session: saved.token });
      if (st.ok) return saved.token;
    }
    onStep && onStep('Подтверждаю аккаунт FunPay…');
    const start = await api('/link/start', { fpid });
    if (!start.ok) throw new Error(start.error || 'LINK_START');
    let offerId = null;
    try {
      offerId = await createLot(start.code);
      await trackLot(offerId, true);
      const deadline = Date.now() + 60000;
      while (Date.now() < deadline) {
        await sleep(3000);
        const c = await api('/link/confirm', { fpid, offerId });
        if (c.ok && c.session) {
          await sset({ [key]: { token: c.session, name: c.name } });
          return c.session;
        }
        if (c.error && c.error !== 'NOT_YET') throw new Error(c.error);
      }
      throw new Error('VERIFY_TIMEOUT');
    } finally {
      if (offerId) cleanupLot(offerId);
    }
  }

  // ───────────────────────── вкладка "Аккаунт" ─────────────────────────
  let busy = false;
  let tickTimer = null;

  function giftCardHTML(nick, title, sub) {
    return `
      <div class="fpt-gift">
        <div class="fpt-gift-glow"></div>
        <div class="fpt-gift-tile"><span class="fpt-gift-nick">${esc(nick || 'Твой ник')}</span></div>
        <div class="fpt-gift-text">
          <div class="fpt-gift-title">${title}</div>
          <div class="fpt-gift-sub">${sub}</div>
        </div>
      </div>`;
  }

  function stepHTML(n, state, title, desc, action) {
    return `
      <div class="fpt-step fpt-step-${state}">
        <div class="fpt-step-num">${state === 'done' ? '<span class="material-symbols-rounded">check</span>' : n}</div>
        <div class="fpt-step-body">
          <div class="fpt-step-title">${title}</div>
          ${desc ? `<div class="fpt-step-desc">${desc}</div>` : ''}
          ${action || ''}
        </div>
      </div>`;
  }

  function checkingHTML(id) {
    return `<div class="fpt-checking" id="${id}"><span>Проверяю подписку…</span><div class="fpt-checking-bar"><i></i></div></div>`;
  }

  async function render() {
    const root = document.getElementById('fptAccountRoot');
    if (!root) return;
    clearInterval(tickTimer);
    const fpid = myId();
    const nick = myName();
    const avatar = myAvatar();

    const head = `
      <div class="fpt-acc-head">
        ${avatar ? `<img class="fpt-acc-ava" src="${esc(avatar)}" alt="">` : '<div class="fpt-acc-ava"></div>'}
        <div>
          <div class="fpt-acc-name">${esc(nick || 'Гость')}</div>
          <div class="fpt-acc-sub">${fpid ? 'Аккаунт FunPay' : 'Войди в FunPay, чтобы пользоваться аккаунтом'}</div>
        </div>
      </div>`;

    const more = `<div id="fptTgRoot" class="fpt-tg"></div>`;

    if (!fpid) { root.innerHTML = head + more; renderTg(); return; }

    const st = (await sget([K_STATE]))[K_STATE] || {};
    const claim = (await sget([K_CLAIM]))[K_CLAIM];
    const mine = claim && claim.fpid === fpid ? claim : null;
    let gift = '';

    if (mine && Date.now() < mine.until) {
      gift = giftCardHTML(nick, 'Ник светится', `Ещё <b id="fptGiftLeft">${left(mine.until)}</b>, до ${fmtDate(mine.until)}. Его видят все, у кого стоит FunPay Tools.`) + `
        <div class="fpt-acc-block">
          <h4>Сменить стиль</h4>
          <p class="template-info">Собери новый стиль в генераторе, скопируй ключ и вставь сюда.</p>
          <div class="fpt-key-row">
            <input type="text" id="fptStyleKey" class="template-input" placeholder="FPT-STYLE-…" spellcheck="false" autocomplete="off">
            <button class="btn" id="fptStyleSave">Сохранить</button>
          </div>
          <a class="fpt-link" href="${DONATE_URL}" target="_blank" rel="noopener">Открыть генератор стилей</a>
          <div class="fpt-msg" id="fptPromoMsg"></div>
        </div>`;
    } else if (mine) {
      gift = giftCardHTML(nick, 'Подарок закончился', 'Понравилось? Цветной ник можно оставить навсегда, он продаётся в боте.');
    } else if (promoActive()) {
      const s1 = st.channelOk ? 'done' : 'todo';
      const s2 = st.groupOk ? 'done' : (st.channelOk ? 'todo' : 'locked');
      const s3 = st.groupOk ? 'todo' : 'locked';
      gift = giftCardHTML(nick, 'Подарок для тебя',
        `Спасибо, что пользуешься FunPay Tools! Держи цветной анимированный ник на ${GIFT_DAYS} дня. Его увидят все, у кого стоит расширение. Акция до 30 января.`) + `
        <div class="fpt-steps">
          ${stepHTML(1, s1, 'Подпишись на канал', '@' + CHANNEL,
            s1 === 'todo' ? `<button class="btn" id="fptStepChannel">Подписаться</button>` : '')}
          ${stepHTML(2, s2, 'Вступи в чат', '@' + GROUP + (s2 === 'todo' ? '. Если ты уже там, выйди и зайди снова.' : ''),
            s2 === 'todo' ? `<button class="btn" id="fptStepGroup">Вступить</button>` : '')}
          ${stepHTML(3, s3, 'Собери стиль и забери ник',
            s3 === 'todo' ? 'Открой генератор, настрой цвета и анимацию, скопируй ключ и вставь его сюда.' : '',
            s3 === 'todo' ? `
              <a class="btn btn-default" href="${DONATE_URL}" target="_blank" rel="noopener">Открыть генератор</a>
              <div class="fpt-key-row">
                <input type="text" id="fptStyleKey" class="template-input" placeholder="FPT-STYLE-…" spellcheck="false" autocomplete="off">
                <button class="btn" id="fptClaim">Забрать ник</button>
              </div>` : '')}
        </div>
        <div class="fpt-msg" id="fptPromoMsg"></div>`;
    }

    root.innerHTML = head + gift + more;
    bind(root, fpid);
    renderTg();
    if (mine && Date.now() < mine.until) {
      tickTimer = setInterval(() => {
        const el = document.getElementById('fptGiftLeft');
        if (!el) return clearInterval(tickTimer);
        if (Date.now() >= mine.until) { clearInterval(tickTimer); render(); return; }
        el.textContent = left(mine.until);
      }, 30000);
    }
  }

  function msg(text, isErr) {
    const el = document.getElementById('fptPromoMsg');
    if (!el) return;
    el.textContent = text || '';
    el.classList.toggle('fpt-msg-err', !!isErr);
  }

  async function runCheck(btn) {
    const holder = btn.parentElement;
    btn.remove();
    holder.insertAdjacentHTML('beforeend', checkingHTML('fptChecking'));
    const bar = holder.querySelector('.fpt-checking-bar i');
    bar.style.transition = `width ${CHECK_DELAY_MS}ms linear`;
    requestAnimationFrame(() => requestAnimationFrame(() => { bar.style.width = '100%'; }));
    await sleep(CHECK_DELAY_MS);
  }

  function bind(root, fpid) {
    const ch = $('#fptStepChannel', root);
    if (ch) ch.addEventListener('click', async () => {
      if (busy) return; busy = true;
      window.open('https://t.me/' + CHANNEL, '_blank', 'noopener');
      try {
        await runCheck(ch);
        const st = (await sget([K_STATE]))[K_STATE] || {};
        st.channelOk = true;
        await sset({ [K_STATE]: st });
      } finally { busy = false; render(); }
    });

    const gr = $('#fptStepGroup', root);
    if (gr) gr.addEventListener('click', async () => {
      if (busy) return; busy = true;
      let ok = false, err = '';
      const st = (await sget([K_STATE]))[K_STATE] || {};
      try {
        const t = await api('/group/start', {});
        window.open('https://t.me/' + GROUP, '_blank', 'noopener');
        if (!t.ok) throw new Error(t.error || 'GROUP_START');
        await runCheck(gr);
        const c = await api('/group/check', { ticket: t.ticket });
        ok = !!c.ok;
        if (ok) { st.groupOk = true; st.ticket = t.ticket; }
      } catch (e) { err = e.message; }
      if (!ok) { st.channelOk = false; st.groupOk = false; st.ticket = null; }
      await sset({ [K_STATE]: st });
      busy = false;
      await render();
      if (!ok) msg(err === 'HTTP_404' || err === 'SERVER_ERROR' || /fetch/i.test(err)
        ? 'Сервер акции не ответил. Попробуй ещё раз чуть позже.'
        : 'Не видим тебя в чате. Подпишись на канал и вступи в чат ещё раз.', true);
    });

    const claimBtn = $('#fptClaim', root);
    if (claimBtn) claimBtn.addEventListener('click', async () => {
      if (busy) return;
      const key = ($('#fptStyleKey', root).value || '').trim();
      if (!key.startsWith('FPT-STYLE-')) return msg(errText('BAD_KEY'), true);
      busy = true; claimBtn.disabled = true;
      try {
        const st = (await sget([K_STATE]))[K_STATE] || {};
        const session = await getSession(fpid, (t) => msg(t));
        msg('Включаю ник…');
        const r = await api('/claim', { session, ticket: st.ticket, key });
        if (!r.ok) {
          if (r.error === 'NO_SESSION') await sset({ ['fptPromoSession_' + fpid]: null });
          if (r.error === 'GROUP_NOT_CONFIRMED') await sset({ [K_STATE]: {} });
          throw new Error(r.error);
        }
        await sset({ [K_CLAIM]: { fpid, name: r.name, until: r.until }, [K_STATE]: {} });
        toast('Готово! Ник засветится у всех в течение пары минут.');
        busy = false;
        render();
      } catch (e) {
        busy = false; claimBtn.disabled = false;
        msg(errText(e.message), true);
        if (e.message === 'GROUP_NOT_CONFIRMED') setTimeout(render, 2500);
      }
    });

    const saveBtn = $('#fptStyleSave', root);
    if (saveBtn) saveBtn.addEventListener('click', async () => {
      if (busy) return;
      const key = ($('#fptStyleKey', root).value || '').trim();
      if (!key.startsWith('FPT-STYLE-')) return msg(errText('BAD_KEY'), true);
      busy = true; saveBtn.disabled = true;
      try {
        const session = await getSession(fpid, (t) => msg(t));
        const r = await api('/style', { session, key });
        if (!r.ok) throw new Error(r.error);
        msg(`Стиль сохранён. Осталось смен: ${r.changesLeft}. Обновится у всех в течение пары минут.`);
        $('#fptStyleKey', root).value = '';
      } catch (e) { msg(errText(e.message), true); }
      busy = false; saveBtn.disabled = false;
    });
  }

  // ───────────────────────── Telegram и покупки ─────────────────────────
  // Вход: воркер даёт ссылку на бота, человек жмёт Start, бот подтверждает.
  // Покупки: расширение ставит задачу, бот на сервере создаёт счёт и выдаёт покупку.
  const K_TG = 'fptTgSession';            // { session, user: { uid, name, username } }
  const METHODS = [['sbp', 'СБП'], ['card', 'Карта'], ['crypto', 'Крипта']];
  const PRODUCT_NAMES = { '1m': 'PRO на 1 месяц', '3m': 'PRO на 3 месяца', forever: 'PRO навсегда', nick: 'Цветной ник навсегда',
    frame: 'Рамка для аватарки навсегда', banner: 'Баннер для лотов навсегда' };
  const TG_ERRORS = {
    PAYMENT_METHOD_UNAVAILABLE: 'Этот способ оплаты сейчас недоступен, выбери другой.',
    NEED_PAYMENT: 'Сначала оплати ник: бесплатный ник положен только с PRO и только первый.',
    NICK_TAKEN: 'Этот ник уже украшен другим человеком. Напиши в поддержку @AlliSighs.',
    INVOICE_NOT_FOUND: 'Счёт не найден, создай новый.',
    NOT_YOUR_NICK: 'Этот ник записан не на твой Telegram.',
    TOO_FAST: 'Слишком быстро, подожди секунду.',
    BOT_TIMEOUT: 'Бот не ответил. Возможно, он перезапускается, попробуй через минуту.',
    NO_SESSION: 'Нужно заново подтвердить аккаунт FunPay.',
    BAD_KEY: 'Ключ не похож на FPT-STYLE. Скопируй его в генераторе ещё раз.',
  };
  const tgErr = (c) => TG_ERRORS[c] || (String(c).startsWith('DONATERS_') ? 'Сервер ников не принял стиль: ' + c.slice(9) : 'Ошибка: ' + c);
  let tgBusy = false;
  let tgProfile = null;
  let payTimer = null;

  async function tgSession() { return (await sget([K_TG]))[K_TG] || null; }

  async function job(type, payload) {
    const tg = await tgSession();
    if (!tg) throw new Error('NO_TG_SESSION');
    const c = await api('/job', { session: tg.session, type, payload });
    if (!c.ok) {
      if (c.error === 'NO_TG_SESSION') await sset({ [K_TG]: null });
      throw new Error(c.error || 'JOB');
    }
    const deadline = Date.now() + 40000;
    while (Date.now() < deadline) {
      await sleep(1200);
      const r = await api('/job/result', { session: tg.session, id: c.id });
      if (r.ok && r.pending) continue;
      if (!r.ok) throw new Error(r.error || 'JOB_RESULT');
      if (!r.result || !r.result.ok) throw new Error((r.result && r.result.error) || 'JOB_FAILED');
      return r.result;
    }
    throw new Error('BOT_TIMEOUT');
  }

  function tgMsg(text, isErr) {
    const el = document.getElementById('fptTgMsg');
    if (!el) return;
    el.textContent = text || '';
    el.classList.toggle('fpt-msg-err', !!isErr);
  }

  async function renderTg() {
    const box = document.getElementById('fptTgRoot');
    if (!box) return;
    const tg = await tgSession();
    if (!tg) {
      box.innerHTML = `
        <div class="fpt-acc-block">
          ${decorShowcase()}
          <h4>PRO, цветной ник, рамка и баннер прямо здесь</h4>
          <p class="template-info">Войди через нашего Telegram-бота один раз, и покупать и настраивать можно не выходя с FunPay. Ключ PRO и чек тоже придут в бота.</p>
          <button class="btn" id="fptTgLogin">Войти через Telegram</button>
          <div class="fpt-msg" id="fptTgMsg"></div>
        </div>`;
      $('#fptTgLogin', box).onclick = tgLogin;
      return;
    }
    const u = tg.user || {};
    box.innerHTML = `
      <div class="fpt-acc-block">
        <div class="fpt-tg-head">
          <div><h4 style="margin:0">Telegram</h4><div class="fpt-acc-sub">${esc(u.username ? '@' + u.username : u.name || 'подключён')}</div></div>
          <button class="fpt-link-btn" id="fptTgLogout">Выйти</button>
        </div>
        <div id="fptShop"><div class="fpt-acc-sub">Загружаю профиль…</div></div>
        <div class="fpt-msg" id="fptTgMsg"></div>
      </div>`;
    $('#fptTgLogout', box).onclick = async () => {
      await api('/tg/logout', { session: tg.session });
      await sset({ [K_TG]: null });
      tgProfile = null;
      renderTg();
    };
    try {
      tgProfile = await job('me', {});
      renderShop();
    } catch (e) {
      if (e.message === 'NO_TG_SESSION') return renderTg();
      const shop = document.getElementById('fptShop');
      if (shop) shop.innerHTML = `<div class="fpt-acc-sub">Не удалось загрузить профиль.</div>
        <button class="btn btn-default" id="fptShopRetry">Повторить</button>`;
      const rb = document.getElementById('fptShopRetry');
      if (rb) rb.onclick = renderTg;
      tgMsg(tgErr(e.message), true);
    }
  }

  async function tgLogin() {
    if (tgBusy) return;
    tgBusy = true;
    const btn = document.getElementById('fptTgLogin');
    if (btn) btn.disabled = true;
    try {
      const s = await api('/tg/start', {});
      if (!s.ok) throw new Error(s.error || 'TG_START');
      window.open(s.link, '_blank', 'noopener');
      tgMsg('Нажми Start в боте. Если бот попросит подписаться на канал, подпишись и нажми «Войти через Telegram» ещё раз.');
      const deadline = Date.now() + 5 * 60 * 1000;
      while (Date.now() < deadline) {
        await sleep(2500);
        if (!document.getElementById('fptTgRoot')) break;
        const p = await api('/tg/poll', { token: s.token });
        if (p.ok && p.session) {
          await sset({ [K_TG]: { session: p.session, user: p.user } });
          tgBusy = false;
          toast('Telegram подключён');
          return renderTg();
        }
        if (!p.ok && p.error !== 'NOT_YET') throw new Error(p.error);
      }
      throw new Error('LOGIN_TIMEOUT');
    } catch (e) {
      tgMsg(e.message === 'LOGIN_TIMEOUT' ? 'Не дождался подтверждения. Попробуй ещё раз.' : tgErr(e.message), true);
    } finally {
      tgBusy = false;
      const b = document.getElementById('fptTgLogin');
      if (b) b.disabled = false;
    }
  }

  function proText(p) {
    if (p.pro === 'forever') return 'навсегда';
    if (p.pro === 'temporary') return p.proUntil ? 'до ' + new Date(p.proUntil).toLocaleDateString('ru-RU') : 'активна';
    return 'нет';
  }

  function renderShop(selected) {
    const shop = document.getElementById('fptShop');
    if (!shop || !tgProfile) return;
    const p = tgProfile;
    const plans = p.plans || {};
    const nicks = p.nicks || [];
    const me = myName();
    const meOwned = nicks.some((n) => String(n.nickname).toLowerCase() === me.toLowerCase());
    const canAdd = !!me && !meOwned && (p.freeNick || p.nickCredits > 0);
    const card = (key, title, price, note) => `
      <button class="fpt-prod${selected === key ? ' fpt-prod-on' : ''}" data-prod="${key}">
        <span class="fpt-prod-title">${title}</span>
        <span class="fpt-prod-price">${price}</span>
        ${note ? `<span class="fpt-prod-note">${note}</span>` : ''}
      </button>`;
    const nickNote = nicks.length
      ? `ещё один ник. Первый ${p.nickPriceFirst || 499} ₽, каждый следующий ${p.nickPriceNext || 399} ₽`
      : `навсегда, без подписки. С PRO первый ник бесплатно`;

    shop.innerHTML = `
      <div class="fpt-shop-status">
        <div><span>PRO</span><b>${proText(p)}</b></div>
        <div><span>Цветные ники</span><b>${nicks.length || 'нет'}</b></div>
      </div>
      <div class="fpt-prods">
        ${['1m', '3m', 'forever'].filter((k) => plans[k]).map((k) =>
          card(k, plans[k].label, plans[k].rub + ' ₽', k === 'forever' ? 'выгоднее всего' : '')).join('')}
        ${canAdd ? '' : card('nick', 'Цветной ник', p.nickPrice + ' ₽', nickNote)}
      </div>
      <div id="fptPayBox"></div>

      ${canAdd ? `
        <div class="fpt-nick-set">
          <h4>Добавить ник ${esc(me)}</h4>
          <p class="template-info">${p.nickCredits > 0 ? 'Ник оплачен.' : 'С PRO первый ник бесплатно.'} Собери стиль в генераторе, скопируй ключ и вставь сюда.</p>
          <div class="fpt-key-row">
            <input type="text" id="fptShopKey" class="template-input" placeholder="FPT-STYLE-…" spellcheck="false" autocomplete="off">
            <button class="btn" id="fptShopNick">Добавить</button>
          </div>
        </div>` : ''}

      ${nicks.length ? `
        <div class="fpt-nick-set">
          <h4>Мои цветные ники</h4>
          <div class="fpt-nick-list">
            ${nicks.map((n, i) => `
              <div class="fpt-nick-row" data-i="${i}">
                <div class="fpt-nick-row-head">
                  <b>${esc(n.nickname)}</b>
                  <span class="fpt-acc-sub">${n.is_paid ? 'навсегда' : 'по подписке PRO'}</span>
                  <button class="fpt-link-btn" data-edit="${i}">Сменить стиль</button>
                </div>
                <div class="fpt-key-row" hidden>
                  <input type="text" class="template-input" placeholder="FPT-STYLE-…" spellcheck="false" autocomplete="off">
                  <button class="btn" data-save="${i}">Сохранить</button>
                </div>
              </div>`).join('')}
          </div>
        </div>` : ''}
      <a class="fpt-link" href="${DONATE_URL}" target="_blank" rel="noopener">Открыть генератор стилей</a>
      <div id="fptDecor" class="fpt-nick-set"></div>`;

    shop.querySelectorAll('.fpt-prod').forEach((b) => { b.onclick = () => renderShop(b.dataset.prod); });
    renderDecor();
    if (selected) renderPayBox(selected);
    const nb = document.getElementById('fptShopNick');
    if (nb) nb.onclick = () => setNick(nb);
    shop.querySelectorAll('[data-edit]').forEach((b) => {
      b.onclick = () => {
        const row = b.closest('.fpt-nick-row').querySelector('.fpt-key-row');
        row.hidden = !row.hidden;
        if (!row.hidden) {
          const inp = row.querySelector('input');
          const nick = (nicks[+b.dataset.edit] || {}).nickname;
          if (!inp.value && nick && window.fptNickGetKey) inp.value = window.fptNickGetKey(nick);
          inp.focus(); inp.select();
        }
      };
    });
    shop.querySelectorAll('[data-save]').forEach((b) => {
      b.onclick = () => saveStyle(b, nicks[Number(b.dataset.save)].nickname);
    });
  }

  // ───────────────────────── рамка и баннер ─────────────────────────
  const D = () => window.fptDecor;
  let decorPick = null;     // { f, b } выбранное, но ещё не сохранённое

  function decorShowcase() {
    const d = D();
    if (!d) return '';
    const fr = [1, 13, 19, 22, 26].map((id) => `<img src="${esc(d.frameUrl(id))}" alt="">`).join('');
    return `<div class="fpt-decor-show">
      <div class="fpt-decor-show-frames">${fr}</div>
      <div class="fpt-decor-show-banner" style="background-image:url('${esc(d.bannerUrl(10))}')"><span>${esc(myName() || 'Твой ник')}</span></div>
      <div class="fpt-decor-show-text"><b>Новое: рамки для аватарки и баннеры за лотами</b>
        <span>30 рамок и 27 баннеров. Их видят все, у кого стоит FunPay Tools. С PRO бесплатно.</span></div>
    </div>`;
  }

  function decorPreview(f, b) {
    const d = D();
    const ava = myAvatar();
    return `<div class="fpt-decor-pv">
      <div class="fpt-decor-pv-ava">
        ${ava ? `<img class="ava" src="${esc(ava)}" alt="">` : '<span class="ava"></span>'}
        ${f ? (() => { const g = (d.ring && d.ring[f]) || [0.68, 0, 0]; const sz = Math.round(56 / g[0]); return `<img class="frm" src="${esc(d.frameUrl(f))}" alt="" style="width:${sz}px !important;height:${sz}px !important;margin-left:${(-g[1] * sz).toFixed(1)}px;margin-top:${(-g[2] * sz).toFixed(1)}px">`; })() : ''}
      </div>
      <div class="fpt-decor-pv-row">
        ${b ? `<i style="background-image:url('${esc(d.bannerUrl(b))}')"></i>` : ''}
        <span class="nm">${esc(myName() || 'Твой ник')}</span><span class="st">★★★★★ 218</span>
      </div>
    </div>`;
  }

  function renderDecor() {
    const box = document.getElementById('fptDecor');
    const d = D();
    if (!box || !d || !tgProfile) return;
    const p = tgProfile;
    const rights = p.decor || {};
    const prices = p.decorPrices || { frame: 149, banner: 199 };
    const mine = d.get(myId()) || {};
    if (!decorPick) decorPick = { f: mine.f || 0, b: mine.b || 0 };
    const label = (k) => rights[k] === 'bought' ? 'куплено навсегда' : rights[k] === 'pro' ? 'входит в PRO' : 'не куплено';
    const thumb = (k, id, url, name) => `<button class="fpt-dc-${k}${(k === 'frame' ? decorPick.f : decorPick.b) === id ? ' on' : ''}" data-k="${k}" data-id="${id}" title="${esc(name)}">
        ${url ? (k === 'frame' ? `<img src="${esc(url)}" alt="" loading="lazy">` : `<i style="background-image:url('${esc(url)}')"></i>`) : '<span>Нет</span>'}</button>`;
    box.innerHTML = `
      <h4>Украшения профиля <span class="fpt-new-inline">NEW</span></h4>
      <p class="template-info">Рамка вокруг аватарки и баннер за твоими лотами в списках FunPay. Видят все, у кого стоит FunPay Tools.</p>
      ${decorPreview(decorPick.f, decorPick.b)}
      <div class="fpt-dc-head"><b>Рамка</b><span>${label('frame')}</span></div>
      <div class="fpt-dc-grid">${thumb('frame', 0, '', 'Без рамки')}${d.catalog.frames.map((f) => thumb('frame', f.id, d.frameUrl(f.id), f.name)).join('')}</div>
      ${rights.frame ? '' : `<button class="fpt-prod fpt-dc-buy" data-prod="frame"><span class="fpt-prod-title">Рамка навсегда</span><span class="fpt-prod-price">${prices.frame} ₽</span><span class="fpt-prod-note">любая из 30, менять можно сколько угодно. Или возьми PRO: там всё сразу</span></button>`}
      <div class="fpt-dc-head"><b>Баннер за лотами</b><span>${label('banner')}</span></div>
      <div class="fpt-dc-list">${thumb('banner', 0, '', 'Без баннера')}${d.catalog.banners.map((b) => thumb('banner', b.id, d.bannerUrl(b.id), b.name)).join('')}</div>
      ${rights.banner ? '' : `<button class="fpt-prod fpt-dc-buy" data-prod="banner"><span class="fpt-prod-title">Баннер навсегда</span><span class="fpt-prod-price">${prices.banner} ₽</span><span class="fpt-prod-note">любой из 27, менять можно сколько угодно. Или возьми PRO</span></button>`}
      <div class="fpt-key-row" style="margin-top:12px"><button class="btn" id="fptDecorSave">Сохранить украшения</button></div>
      <div class="fpt-msg" id="fptDecorMsg"></div>`;
    box.querySelectorAll('[data-k]').forEach((btn) => {
      btn.onclick = () => {
        if (btn.dataset.k === 'frame') decorPick.f = Number(btn.dataset.id); else decorPick.b = Number(btn.dataset.id);
        renderDecor();
      };
    });
    box.querySelectorAll('.fpt-dc-buy').forEach((b) => { b.onclick = () => { renderShop(b.dataset.prod); const pb = document.getElementById('fptPayBox'); if (pb) pb.scrollIntoView({ behavior: 'smooth', block: 'center' }); }; });
    const save = document.getElementById('fptDecorSave');
    save.onclick = () => saveDecor(save);
  }

  function decorMsg(t, err) {
    const el = document.getElementById('fptDecorMsg');
    if (!el) return;
    el.textContent = t || '';
    el.classList.toggle('fpt-msg-err', !!err);
  }

  async function saveDecor(btn) {
    if (tgBusy) return;
    const p = tgProfile || {};
    const rights = p.decor || {};
    if (decorPick.f && !rights.frame) return decorMsg('Рамку сначала нужно купить или взять PRO.', true);
    if (decorPick.b && !rights.banner) return decorMsg('Баннер сначала нужно купить или взять PRO.', true);
    const fpid = myId();
    if (!fpid) return decorMsg('Войди в аккаунт FunPay.', true);
    tgBusy = true; btn.disabled = true;
    try {
      const fpSession = await getSession(fpid, (t) => decorMsg(t));
      decorMsg('Сохраняю…');
      await job('decor', { fpSession, frame: decorPick.f, banner: decorPick.b });
      if (D() && D().setLocal) await D().setLocal(fpid, decorPick.f, decorPick.b);   // у себя сразу
      decorMsg('Готово! У тебя уже видно, у остальных обновится в течение пары минут.');
      setTimeout(() => D() && D().reload(), 90000);
    } catch (e) {
      if (e.message === 'NO_SESSION') await sset({ ['fptPromoSession_' + fpid]: null });
      const m = { NEED_FRAME: 'Рамка не куплена и PRO нет.', NEED_BANNER: 'Баннер не куплен и PRO нет.' }[e.message];
      decorMsg(m || tgErr(e.message), true);
    } finally { tgBusy = false; btn.disabled = false; }
  }

  async function saveStyle(btn, nickname) {
    if (tgBusy) return;
    const key = (btn.parentElement.querySelector('input').value || '').trim();
    if (!key.startsWith('FPT-STYLE-')) return tgMsg(tgErr('BAD_KEY'), true);
    tgBusy = true; btn.disabled = true;
    try {
      tgMsg('Меняю стиль…');
      await job('style', { nickname, key });
      btn.parentElement.hidden = true;
      if (window.fptNickSetLocal) await window.fptNickSetLocal(nickname, key);
      tgMsg(`Стиль ника ${nickname} обновлён. У тебя уже видно, у остальных поменяется в течение пары минут.`);
    } catch (e) { tgMsg(tgErr(e.message), true); }
    finally { tgBusy = false; btn.disabled = false; }
  }

  function renderPayBox(product) {
    const box = document.getElementById('fptPayBox');
    if (!box) return;
    box.innerHTML = `
      <div class="fpt-pay">
        <div class="fpt-pay-title">${PRODUCT_NAMES[product]}: чем оплатить?</div>
        <div class="fpt-pay-methods">${METHODS.map(([k, n]) => `<button class="btn btn-default" data-m="${k}">${n}</button>`).join('')}</div>
      </div>`;
    box.querySelectorAll('[data-m]').forEach((b) => { b.onclick = () => startPay(product, b.dataset.m); });
  }

  async function startPay(product, method) {
    if (tgBusy) return;
    tgBusy = true;
    const box = document.getElementById('fptPayBox');
    box.innerHTML = '<div class="fpt-pay"><div class="fpt-pay-title">Создаю счёт…</div></div>';
    try {
      const inv = await job('pay', { product, method });
      box.innerHTML = `
        <div class="fpt-pay">
          <div class="fpt-pay-title">${PRODUCT_NAMES[product]}: ${inv.amount} ₽</div>
          <p class="template-info">Оплата открылась в новой вкладке. Счёт действует ${esc(inv.expiresIn)}. Как только оплата пройдёт, всё включится само.</p>
          <div class="fpt-pay-methods">
            <a class="btn" href="${esc(inv.payUrl)}" target="_blank" rel="noopener">Открыть оплату</a>
            <button class="btn btn-default" id="fptPayCheck">Я оплатил</button>
          </div>
          <div class="fpt-checking"><span id="fptPayState">Жду оплату…</span></div>
        </div>`;
      if (inv.payUrl) window.open(inv.payUrl, '_blank', 'noopener');
      document.getElementById('fptPayCheck').onclick = () => checkPay(inv.tid, product, true);
      clearInterval(payTimer);
      const until = Date.now() + 20 * 60 * 1000;
      payTimer = setInterval(() => {
        if (!document.getElementById('fptPayState') || Date.now() > until) return clearInterval(payTimer);
        checkPay(inv.tid, product, false);
      }, 20000);
    } catch (e) {
      box.innerHTML = '';
      tgMsg(tgErr(e.message), true);
    } finally { tgBusy = false; }
  }

  let checking = false;
  async function checkPay(tid, product, manual) {
    if (checking) return;
    checking = true;
    const st = document.getElementById('fptPayState');
    if (manual && st) st.textContent = 'Проверяю оплату…';
    try {
      const r = await job('check', { tid });
      if (r.status === 'paid') {
        clearInterval(payTimer);
        const okText = product === 'nick' ? 'Оплата прошла. Вставь ключ стиля ниже.'
          : product === 'frame' || product === 'banner' ? 'Оплата прошла. Выбери украшение ниже и нажми «Сохранить украшения».'
          : 'Оплата прошла. Ключ PRO пришёл в бота @FPToolsBot.';
        toast(okText);
        tgProfile = await job('me', {});
        renderShop();
        tgMsg(okText);
        if (product === 'frame' || product === 'banner') { const dz = document.getElementById('fptDecor'); if (dz) dz.scrollIntoView({ behavior: 'smooth' }); }
      } else if (st) {
        st.textContent = r.status === 'canceled' ? 'Платёж отменён. Создай новый счёт.' : 'Оплата пока не пришла. Проверяю каждые 20 секунд.';
      }
    } catch (e) {
      if (manual) tgMsg(tgErr(e.message), true);
    } finally { checking = false; }
  }

  async function setNick(btn) {
    if (tgBusy) return;
    const key = (document.getElementById('fptShopKey').value || '').trim();
    if (!key.startsWith('FPT-STYLE-')) return tgMsg(tgErr('BAD_KEY'), true);
    const fpid = myId();
    if (!fpid) return tgMsg('Войди в аккаунт FunPay.', true);
    tgBusy = true; btn.disabled = true;
    try {
      const fpSession = await getSession(fpid, (t) => tgMsg(t));
      tgMsg('Ставлю ник…');
      const r = await job('nick', { fpSession, key });
      if (r && r.nickname && window.fptNickSetLocal) await window.fptNickSetLocal(r.nickname, key);
      tgProfile = await job('me', {});
      renderShop();
      tgMsg(`Готово! У тебя ник ${r.nickname} уже светится, у остальных в течение пары минут.`);
    } catch (e) {
      if (e.message === 'NO_SESSION') await sset({ ['fptPromoSession_' + fpid]: null });
      tgMsg(tgErr(e.message), true);
    } finally { tgBusy = false; btn.disabled = false; }
  }

  // ───────────────────────── пункт меню и бейдж NEW! ─────────────────────────
  async function navInit(popup) {
    const li = popup && popup.querySelector('.fp-tools-nav li[data-page="account"]');
    if (!li) return;
    let since = (await sget([K_NEW]))[K_NEW];
    if (!since) { since = Date.now(); await sset({ [K_NEW]: since }); }
    const badge = li.querySelector('.fpt-new-badge');
    if (badge) badge.hidden = Date.now() - since > NEW_MS;
  }

  async function openAccountTab(section) {
    if (typeof window.__fpEnsurePopup === 'function') await window.__fpEnsurePopup();
    const popup = document.querySelector('.fp-tools-popup');
    if (!popup) return;
    const li = popup.querySelector('.fp-tools-nav li[data-page="account"]');
    if (li) li.click();
    popup.classList.add('active');
    if (typeof applyFptMenuTransparency === 'function') applyFptMenuTransparency();
    if (section === 'decor') {
      // ждём, пока отрисуется профиль из бота, и прокручиваем к украшениям
      for (let i = 0; i < 40; i++) {
        const el = document.getElementById('fptDecor') || document.querySelector('.fpt-decor-show');
        if (el && el.offsetHeight) { el.scrollIntoView({ behavior: 'smooth', block: 'start' }); break; }
        await sleep(250);
      }
    }
  }

  // ───────────────────────── уведомление о подарке ─────────────────────────
  // Анонс рамок и баннеров: дважды (второй раз через 3 дня), если в этот заход не показали подарок
  async function maybeShowDecorModal() {
    if (!myId() || !window.fptDecor || document.getElementById('fptGiftModal')) return;
    const K = 'fptDecorAnnounce';
    const a = (await sget([K]))[K] || { count: 0, last: 0 };
    if (a.count >= 2 || (a.count && Date.now() - a.last < 3 * 86400000)) return;
    if (window.fptDecor.active(myId())) return;   // уже украсил профиль
    await sset({ [K]: { count: a.count + 1, last: Date.now() } });
    const wrap = document.createElement('div');
    wrap.id = 'fptGiftModal';
    wrap.className = 'fpt-gift-modal';
    wrap.innerHTML = `
      <div class="fpt-gift-modal-box" role="dialog" aria-label="Новое в FunPay Tools">
        <div class="fpt-gift-glow"></div>
        <button class="fpt-gift-x" aria-label="Закрыть">×</button>
        <div class="fpt-gift" style="flex-direction:column;align-items:stretch;gap:14px">
          <div class="fpt-gift-title">Рамки и баннеры</div>
          <div class="fpt-gift-sub" style="max-width:none">Выделяйся в списках лотов: рамка вокруг аватарки и баннер за твоими лотами, как у топовых продавцов. Видят все, у кого стоит FunPay Tools. С PRO бесплатно.</div>
          ${decorShowcase().replace('fpt-decor-show-text', 'fpt-decor-show-text" hidden data-x="')}
        </div>
        <div class="fpt-gift-actions">
          <button class="fpt-gift-go">Выбрать рамку и баннер</button>
          <button class="fpt-gift-later">Позже</button>
        </div>
      </div>`;
    document.body.appendChild(wrap);
    requestAnimationFrame(() => wrap.classList.add('show'));
    const close = () => { wrap.classList.remove('show'); setTimeout(() => wrap.remove(), 250); };
    wrap.querySelector('.fpt-gift-x').onclick = close;
    wrap.querySelector('.fpt-gift-later').onclick = close;
    wrap.addEventListener('click', (e) => { if (e.target === wrap) close(); });
    wrap.querySelector('.fpt-gift-go').onclick = async () => { close(); await openAccountTab('decor'); };
  }

  async function maybeShowGiftModal() {
    if (!promoActive() || !myId()) return maybeShowDecorModal();
    const data = await sget([K_CLAIM, K_MODAL]);
    if (data[K_CLAIM]) return maybeShowDecorModal();
    const m = data[K_MODAL] || { count: 0, last: 0 };
    if (m.count >= 4) return maybeShowDecorModal();
    if (m.count > 0 && Date.now() - m.last < 24 * 3600 * 1000) return maybeShowDecorModal();
    if (document.getElementById('fptGiftModal')) return;

    const wrap = document.createElement('div');
    wrap.id = 'fptGiftModal';
    wrap.className = 'fpt-gift-modal';
    wrap.innerHTML = `
      <div class="fpt-gift-modal-box" role="dialog" aria-label="Подарок от FunPay Tools">
        <div class="fpt-gift-glow"></div>
        <button class="fpt-gift-x" aria-label="Закрыть">×</button>
        ${giftCardHTML(myName(), 'Подарок для тебя',
          `Спасибо, что пользуешься FunPay Tools! Дарим цветной анимированный ник на ${GIFT_DAYS} дня: его увидят все, у кого стоит расширение. Забери, пока акция идёт, она до 30 января.`)}
        <div class="fpt-gift-actions">
          <button class="fpt-gift-go">Забрать подарок</button>
          <button class="fpt-gift-later">Позже</button>
        </div>
      </div>`;
    document.body.appendChild(wrap);
    requestAnimationFrame(() => wrap.classList.add('show'));
    await sset({ [K_MODAL]: { count: m.count + 1, last: Date.now() } });

    const close = () => { wrap.classList.remove('show'); setTimeout(() => wrap.remove(), 250); };
    wrap.querySelector('.fpt-gift-x').onclick = close;
    wrap.querySelector('.fpt-gift-later').onclick = close;
    wrap.addEventListener('click', (e) => { if (e.target === wrap) close(); });
    wrap.querySelector('.fpt-gift-go').onclick = async () => { close(); await openAccountTab(); };
  }

  window.fptInitAccountTab = render;
  window.fptAccountNavInit = navInit;
  window.fptOpenAccountTab = openAccountTab;

  if (document.readyState === 'complete') setTimeout(maybeShowGiftModal, 3000);
  else window.addEventListener('load', () => setTimeout(maybeShowGiftModal, 3000));
})();
