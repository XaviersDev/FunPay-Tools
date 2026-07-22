(function () {
  'use strict';

  const SERVER = 'https://fpt-descs.starobinskiy01.workers.dev';
  const SHARED_KEY = 'fptoolsdim';
  const VERIFY_NODE_ID = '2046';
  const VERIFY_TITLE = 'FPT Verify';
  const VERIFY_PRICE = '1000';
  const DESCRIPTION_MAX = 250;
  const MAX_LINES = 4;
  const ROOT = 'fpt-pd';
  const ROW = 'fpt-pd-row';
  const TEXT = 'fpt-pd-text';
  const EDIT = 'fpt-pd-edit';
  const SESSION_KEY = 'fptProfileSession';
  const CACHE_KEY = 'fptProfileDescrCache';
  const PENDING_LOTS_KEY = 'fptPendingVerifyLots'; // отложенная очистка верификационных лотов
  const CLIENT_CACHE_TTL = 60 * 60 * 1000;
  const PROFILE_RE = /^\/users\/(\d+)\/?$/;

  function getAppData() {
    try {
      const raw = document.body?.dataset?.appData || document.body?.getAttribute('data-app-data');
      if (!raw) return null;
      const d = JSON.parse(raw);
      return Array.isArray(d) ? d[0] : d;
    } catch { return null; }
  }
  function getCsrf() { return getAppData()?.['csrf-token'] || ''; }
  function getMyUserId() {
    const v = Number(getAppData()?.userId);
    return Number.isFinite(v) && v > 0 ? v : null;
  }
  function profileIdFromUrl() {
    const m = location.pathname.match(PROFILE_RE);
    if (!m) return null;
    const n = Number(m[1]);
    return Number.isFinite(n) && n > 0 ? n : null;
  }
  function toast(msg, isError) {
    if (typeof showNotification === 'function') showNotification(msg, !!isError);
  }

  function waitFor(selector, timeout) {
    return new Promise((resolve) => {
      const found = document.querySelector(selector);
      if (found) return resolve(found);
      let done = false;
      const obs = new MutationObserver(() => {
        const el = document.querySelector(selector);
        if (el && !done) { done = true; obs.disconnect(); resolve(el); }
      });
      obs.observe(document.documentElement, { childList: true, subtree: true });
      setTimeout(() => { if (!done) { done = true; obs.disconnect(); resolve(document.querySelector(selector)); } }, timeout || 10000);
    });
  }

  function withTimeout(promise, ms, fallback) {
    return Promise.race([
      Promise.resolve(promise).catch(() => fallback),
      new Promise((res) => setTimeout(() => res(fallback), ms)),
    ]);
  }
  async function storageGet(keys) {
    try {
      const p = chrome.storage.local.get(keys);
      if (p && typeof p.then === 'function') return (await withTimeout(p, 2000, {})) || {};
      return await new Promise((res) => chrome.storage.local.get(keys, (r) => res(r || {})));
    } catch { return {}; }
  }
  async function storageSet(obj) {
    try {
      const p = chrome.storage.local.set(obj);
      if (p && typeof p.then === 'function') { await withTimeout(p, 2000, null); return; }
      await new Promise((res) => chrome.storage.local.set(obj, () => res()));
    } catch {}
  }
  function sessionKeyFor(id) { return SESSION_KEY + '_' + id; }
  async function loadSession(id) {
    const k = sessionKeyFor(id);
    const s = (await storageGet([k]))[k];
    if (s) return s;
    const legacy = (await storageGet([SESSION_KEY]))[SESSION_KEY];
    if (legacy && legacy.funpayUserId === id) return legacy;
    return null;
  }
  async function saveSession(s) { await storageSet({ [sessionKeyFor(s.funpayUserId)]: s }); }
  async function cacheRead(id) {
    const all = (await storageGet([CACHE_KEY]))[CACHE_KEY] || {};
    const e = all[id];
    if (e && Date.now() - e.t < CLIENT_CACHE_TTL) return e;
    return null;
  }
  async function cacheWrite(id, profile) {
    const all = (await storageGet([CACHE_KEY]))[CACHE_KEY] || {};
    all[id] = {
      description: profile && profile.description != null ? profile.description : null,
      bannerUrl: profile && profile.bannerUrl != null ? profile.bannerUrl : null,
      t: Date.now(),
    };
    const keys = Object.keys(all);
    if (keys.length > 300) {
      keys.sort((a, b) => all[a].t - all[b].t).slice(0, keys.length - 300).forEach((k) => delete all[k]);
    }
    await storageSet({ [CACHE_KEY]: all });
  }

  async function serverGetProfile(id) {
    const r = await fetch(SERVER + '/funpay/users/' + id + '/profile', {
      method: 'GET', cache: 'no-store',
    });
    if (!r.ok) return { description: null, bannerUrl: null };
    const j = await r.json();
    return {
      description: j && j.description != null ? j.description : null,
      bannerUrl: j && j.bannerUrl != null ? j.bannerUrl : null,
    };
  }
  async function serverLinkStart(id) {
    const r = await fetch(SERVER + '/me/funpay/link/start', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-FPT-Key': SHARED_KEY },
      body: JSON.stringify({ funpayUserId: id }),
    });
    if (!r.ok) throw new Error(await safeErr(r));
    return r.json();
  }
  async function serverSaveDescription(session, description) {
    const r = await fetch(SERVER + '/me/funpay/description', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'X-FPT-Key': SHARED_KEY, Authorization: 'Bearer ' + session },
      body: JSON.stringify({ description }),
    });
    if (!r.ok) { const c = await safeErr(r); const e = new Error(c); e.httpStatus = r.status; throw e; }
    return r.json();
  }
  // Кастомные баннеры профиля удалены. Функция оставлена как заглушка,
  // чтобы не трогать вызывающий код; сетевых запросов не делает.
  async function serverSaveBanner(_session, _bannerUrl) {
    return { ok: true, disabled: true };
  }
  async function safeErr(res) {
    try { const j = await res.json(); return (j && j.error && j.error.code) || ('HTTP_' + res.status); }
    catch { return 'HTTP_' + res.status; }
  }

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
    const cand = [obj && obj.id, obj && obj.offer_id, obj && obj.offerId];
    for (let i = 0; i < cand.length; i++) {
      const v = Number(cand[i]); if (Number.isFinite(v) && v > 0) return v;
    }
    if (obj && typeof obj.url === 'string') { const m = obj.url.match(/[?&]id=(\d+)/); if (m) return Number(m[1]); }
    return null;
  }
  async function findLotByCode(code) {
    try {
      const r = await fetch('/lots/' + VERIFY_NODE_ID + '/trade', { credentials: 'same-origin', headers: { accept: 'text/html' } });
      if (!r.ok) return null;
      const doc = new DOMParser().parseFromString(await r.text(), 'text/html');
      const ids = Array.from(doc.querySelectorAll('a.tc-item[data-offer]'))
        .filter((el) => { const t = el.querySelector('.tc-desc-text'); return (t ? t.textContent : '').includes(VERIFY_TITLE); })
        .map((el) => Number(el.getAttribute('data-offer')))
        .filter((n) => Number.isFinite(n) && n > 0);
      for (const id of ids.slice(0, 10)) {
        try {
          const a = await fetch('/lots/offer?id=' + id, { credentials: 'same-origin', headers: { accept: 'text/html' } });
          if (a.ok && (await a.text()).includes(code)) return id;
        } catch {}
      }
      if (ids.length === 1) return ids[0];
    } catch {}
    return null;
  }
  async function createVerificationLot(code) {
    const formRes = await fetch('/lots/offerEdit?node=' + VERIFY_NODE_ID, {
      credentials: 'same-origin', headers: { accept: 'text/html' },
    });
    if (!formRes.ok) throw new Error('FUNPAY_FORM_' + formRes.status);
    const doc = new DOMParser().parseFromString(await formRes.text(), 'text/html');
    const f = collectForm(doc);
    f.csrf_token = f.csrf_token || getCsrf();
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
      method: 'POST', credentials: 'same-origin',
      headers: { accept: '*/*', 'content-type': 'application/x-www-form-urlencoded; charset=UTF-8', 'x-requested-with': 'XMLHttpRequest' },
      body,
    });
    if (!saveRes.ok) throw new Error('FUNPAY_SAVE_' + saveRes.status);
    const json = await saveRes.json().catch(() => ({}));
    console.log('[FPT PD] offerSave response:', json);
    if (json && json.error) {
      const e = typeof json.error === 'string' ? json.error : JSON.stringify(json.error);
      throw new Error('FUNPAY_SAVE_ERROR: ' + e);
    }
    const offerId = pickOfferId(json) || (await findLotByCode(code));
    if (!offerId) throw new Error('OFFER_ID_NOT_FOUND');
    return offerId;
  }
  async function deleteVerificationLot(offerId) {
    const body = new URLSearchParams();
    body.append('offer_id', String(offerId));
    body.append('deleted', '1');
    body.append('csrf_token', getCsrf());
    const res = await fetch('/lots/offerSave', {
      method: 'POST', credentials: 'same-origin',
      headers: { accept: '*/*', 'content-type': 'application/x-www-form-urlencoded; charset=UTF-8', 'x-requested-with': 'XMLHttpRequest' },
      body,
    });
    if (!res.ok) throw new Error('FUNPAY_DELETE_' + res.status);
    const json = await res.json().catch(() => ({}));
    if (json && json.error) {
      const e = typeof json.error === 'string' ? json.error : JSON.stringify(json.error);
      throw new Error('FUNPAY_DELETE_ERROR: ' + e);
    }
  }

  // ── Надёжная очистка верификационных лотов ──────────────────────────────────
  // Проблема: если удаление лота падало из-за сети, лот оставался навсегда.
  // Решение: как только лот создан, записываем его id в chrome.storage. Удаление
  // снимает запись ТОЛЬКО при подтверждённом успехе. На каждом заходе (и по таймеру)
  // «подметаем» все оставшиеся id и дочищаем их с повторными попытками.
  async function trackPendingLot(offerId) {
    if (offerId == null) return;
    const cur = (await storageGet([PENDING_LOTS_KEY]))[PENDING_LOTS_KEY] || {};
    cur[String(offerId)] = Date.now();
    await storageSet({ [PENDING_LOTS_KEY]: cur });
  }
  async function untrackPendingLot(offerId) {
    const cur = (await storageGet([PENDING_LOTS_KEY]))[PENDING_LOTS_KEY] || {};
    if (String(offerId) in cur) {
      delete cur[String(offerId)];
      await storageSet({ [PENDING_LOTS_KEY]: cur });
    }
  }

  // Удаляет лот с несколькими попытками. Снимает из очереди только при успехе.
  async function cleanupVerificationLot(offerId, attempts) {
    const tries = attempts || 3;
    for (let i = 0; i < tries; i++) {
      try {
        await deleteVerificationLot(offerId);
        await untrackPendingLot(offerId);
        console.log('[FPT PD] verify lot deleted, offerId=', offerId);
        return true;
      } catch (e) {
        console.warn('[FPT PD] delete attempt', i + 1, 'failed for', offerId, e && e.message);
        // экспоненциальная пауза перед следующей попыткой (2s, 4s, 8s…)
        if (i < tries - 1) await new Promise((r) => setTimeout(r, 2000 * Math.pow(2, i)));
      }
    }
    // не удалось сейчас — id остаётся в очереди, дочистим при следующем sweep
    return false;
  }

  let _sweepRunning = false;
  // Проходит по всем незакрытым лотам и пытается их удалить.
  async function sweepPendingLots() {
    if (_sweepRunning) return;
    _sweepRunning = true;
    try {
      const cur = (await storageGet([PENDING_LOTS_KEY]))[PENDING_LOTS_KEY] || {};
      const ids = Object.keys(cur);
      if (!ids.length) return;
      // нужен валидный csrf на странице funpay, иначе delete всё равно не пройдёт
      if (!getCsrf()) return;
      console.log('[FPT PD] sweeping', ids.length, 'pending verify lot(s)…');
      for (const id of ids) {
        await cleanupVerificationLot(id, 2);
      }
    } catch (e) {
      console.warn('[FPT PD] sweep error:', e && e.message);
    } finally {
      _sweepRunning = false;
    }
  }
  async function pollConfirm(id, maxMs) {
    const deadline = Date.now() + (maxMs || 90000);
    while (Date.now() < deadline) {
      const r = await fetch(SERVER + '/me/funpay/link/confirm', {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'X-FPT-Key': SHARED_KEY },
        body: JSON.stringify({ funpayUserId: id }),
      });
      if (r.ok) {
        const j = await r.json();
        if (j && j.ok && j.session) return j;
      }
      await new Promise((res) => setTimeout(res, 3000));
    }
    throw new Error('VERIFY_TIMEOUT');
  }

  async function runVerification(id) {
    const lastVerify = Number((await storageGet(['fptLastVerifyAt']))['fptLastVerifyAt'] || 0);
    if (lastVerify && Date.now() - lastVerify < 60 * 1000) {
      const e = new Error('VERIFY_COOLDOWN');
      e.retryInSec = Math.ceil((60 * 1000 - (Date.now() - lastVerify)) / 1000);
      throw e;
    }
    await storageSet({ fptLastVerifyAt: Date.now() });

    const start = await serverLinkStart(id);
    let offerId = null;
    try {
      offerId = await createVerificationLot(start.code);
      // Сразу фиксируем id в хранилище — чтобы лот гарантированно удалился даже
      // если страницу закроют или упадёт сеть до штатного удаления.
      await trackPendingLot(offerId);
      console.log('[FPT PD] lot created, offerId=', offerId, '- ждём проверку сервером…');
      const conf = await pollConfirm(id, 90000);
      console.log('[FPT PD] confirmed by server');
      const session = { token: conf.session, funpayUserId: id, funpayUsername: conf.funpayUsername };
      await saveSession(session);
      return session;
    } finally {
      // Удаляем с повторными попытками; при неудаче id остаётся в очереди и будет
      // дочищен фоновым sweep при следующем заходе на профиль.
      if (offerId !== null) {
        cleanupVerificationLot(offerId).then((ok) => {
          if (!ok) console.warn('[FPT PD] lot', offerId, 'не удалён сейчас — дочистим позже');
        });
      }
    }
  }

  function injectStyles() {
    if (document.getElementById('fpt-pd-styles')) return;
    const s = document.createElement('style');
    s.id = 'fpt-pd-styles';
    s.textContent =
      '.' + ROW + '{display:flex;align-items:flex-start;gap:40px;flex-wrap:wrap;}' +
      '.' + ROW + ' > .profile-header-cols{flex:0 0 auto;}' +
      '.' + ROOT + '{flex:1 1 320px;min-width:280px;}' +
      '.' + ROOT + ' h5{margin:0 0 6px;}' +
      '.' + ROOT + ' h5.fpt-pd-h{font-weight:700;}' +
      '.' + TEXT + '{white-space:pre-wrap;word-break:break-word;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:' + MAX_LINES + ';line-clamp:' + MAX_LINES + ';overflow:hidden;}' +
      '.' + EDIT + '{border:0;background:transparent;color:var(--fpt-pd-primary,#f59e0b);cursor:pointer;font-size:12px;font-weight:600;padding:0;margin-top:6px;}' +
      '.' + EDIT + ':hover{color:var(--fpt-pd-primary-hover,var(--fpt-pd-primary,#f59e0b));text-decoration:underline;}' +
      '.' + ROOT + ' textarea{width:100%;max-width:520px;box-sizing:border-box;resize:none;margin-top:4px;padding:6px 8px;border:1px solid rgba(127,127,127,.35);border-radius:4px;background:transparent;color:inherit;font-family:inherit;font-size:13px;line-height:1.45;}' +
      '.' + ROOT + ' .fpt-pd-actions{display:flex;gap:8px;align-items:center;max-width:520px;margin-top:8px;}' +
      '.' + ROOT + ' .fpt-pd-counter{margin-left:auto;font-size:11px;opacity:.6;}' +
      '.' + ROOT + ' .btn{min-width:90px;}' +
      '.fpt-pd-dots{display:inline-block;line-height:1;}' +
      '.fpt-pd-dots > span{display:inline-block;width:5px;height:5px;margin:0 2px;border-radius:50%;background:currentColor;opacity:.35;animation:fpt-pd-bounce 1.2s infinite ease-in-out;}' +
      '.fpt-pd-dots > span:nth-child(2){animation-delay:.15s;}' +
      '.fpt-pd-dots > span:nth-child(3){animation-delay:.3s;}' +
      '@keyframes fpt-pd-bounce{0%,80%,100%{opacity:.25;transform:translateY(0);}40%{opacity:.9;transform:translateY(-4px);}}' +
      '.fpt-cover-host{position:relative !important;overflow:hidden !important;min-height:250px !important;border-radius:0 0 40px 40px !important;background:#0d1321 !important;}' +
      '.profile-cover-img.fpt-cover{position:absolute !important;top:0 !important;left:0 !important;width:100% !important;height:100% !important;overflow:hidden !important;border-radius:0 0 40px 40px !important;z-index:0 !important;}' +
      '.fpt-cover-host,.fpt-cover-host .profile-cover-img,.profile-cover-img.fpt-cover,.profile-cover-img.fpt-cover *{transform:none !important;filter:none !important;opacity:1 !important;}' +
      '.fpt-cover-pic{position:absolute !important;inset:0 !important;background-size:cover !important;background-position:center 25% !important;background-repeat:no-repeat !important;z-index:0 !important;}' +
      '.fpt-cover-gtop{position:absolute !important;inset:0 !important;background:linear-gradient(180deg,rgba(13,19,33,.22) 0%,transparent 35%,transparent 75%,rgba(13,19,33,.32) 100%) !important;z-index:1 !important;border-radius:0 0 40px 40px !important;pointer-events:none;}' +
      '.fpt-cover-gbottom{position:absolute !important;bottom:0 !important;left:0 !important;width:100% !important;height:160px !important;background:linear-gradient(0deg,rgba(13,19,33,.6) 0%,rgba(13,19,33,.25) 45%,transparent 100%) !important;z-index:1 !important;border-radius:0 0 40px 40px !important;pointer-events:none;}' +
      '.fpt-cover-gdark{position:absolute !important;inset:0 !important;background:rgba(0,0,0,.05) !important;z-index:1 !important;border-radius:0 0 40px 40px !important;pointer-events:none;}' +
      '.profile-cover-img.fpt-cover .avatar,.fpt-cover-host .avatar{position:relative !important;z-index:10 !important;}';
    document.head.appendChild(s);
  }

  function applyPrimaryColor(el) {
    try {
      const probe = document.createElement('a');
      probe.className = 'btn btn-primary';
      probe.style.cssText = 'position:absolute;left:-9999px;visibility:hidden;';
      document.body.appendChild(probe);
      const c = getComputedStyle(probe).backgroundColor;
      probe.remove();
      if (c && c !== 'transparent' && c !== 'rgba(0, 0, 0, 0)') el.style.setProperty('--fpt-pd-primary', c);
    } catch {}
  }

  function buildRoot(anchor) {
    const root = document.createElement('div');
    root.className = 'param-item ' + ROOT;
    applyPrimaryColor(root);
    if (anchor.classList.contains('profile-header-cols') && anchor.parentElement) {
      const row = document.createElement('div');
      row.className = ROW;
      anchor.parentElement.insertBefore(row, anchor);
      row.appendChild(anchor);
      row.appendChild(root);
      return root;
    }
    anchor.after(root);
    return root;
  }

  function renderLoading(root) {
    root.innerHTML = '';
    const h = document.createElement('h5');
    h.className = 'fpt-pd-h';
    h.textContent = 'Описание';
    root.appendChild(h);
    const dots = document.createElement('div');
    dots.className = 'fpt-pd-dots';
    dots.innerHTML = '<span></span><span></span><span></span>';
    root.appendChild(dots);
  }

  function renderView(root, state) {
    root.innerHTML = '';
    const h = document.createElement('h5');
    h.className = 'fpt-pd-h';
    h.textContent = 'Описание';
    root.appendChild(h);
    if (state.description) {
      const d = document.createElement('div');
      d.className = TEXT;
      d.textContent = state.description;
      root.appendChild(d);
    }
    if (!state.isOwn) return;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = EDIT;
    btn.textContent = state.description ? 'Редактировать описание' : 'Добавить описание';
    btn.addEventListener('click', () => renderEditor(root, state));
    if (state.description) {
      const wrap = document.createElement('div');
      wrap.style.marginTop = '6px';
      wrap.appendChild(btn);
      root.appendChild(wrap);
    } else {
      root.appendChild(btn);
    }
  }

  function renderEditor(root, state) {
    root.innerHTML = '';
    const h = document.createElement('h5');
    h.className = 'fpt-pd-h';
    h.textContent = 'Описание';
    root.appendChild(h);
    const ta = document.createElement('textarea');
    ta.rows = 4;
    ta.maxLength = DESCRIPTION_MAX;
    ta.value = state.description || '';
    ta.placeholder = 'Расскажите о себе - это описание видят все пользователи расширения.';
    root.appendChild(ta);
    const actions = document.createElement('div');
    actions.className = 'fpt-pd-actions';
    const save = document.createElement('button');
    save.type = 'button'; save.className = 'btn btn-primary'; save.textContent = 'Сохранить';
    const cancel = document.createElement('button');
    cancel.type = 'button'; cancel.className = 'btn btn-gray'; cancel.textContent = 'Отмена';
    let del = null;
    if (state.description) {
      del = document.createElement('button');
      del.type = 'button'; del.className = 'btn btn-danger'; del.textContent = 'Удалить описание';
    }
    const counter = document.createElement('span');
    counter.className = 'fpt-pd-counter';
    const upd = () => { counter.textContent = ta.value.length + ' / ' + DESCRIPTION_MAX; };
    upd();
    ta.addEventListener('input', upd);
    actions.appendChild(save);
    if (del) actions.appendChild(del);
    actions.appendChild(cancel); actions.appendChild(counter);
    root.appendChild(actions);
    cancel.addEventListener('click', () => renderView(root, state));

    function localHasContactInfo(text) {
      if (!text) return false;
      const t = String(text);
      const low = t.toLowerCase();

      if (/(^|[^a-zA-Zа-яА-Я0-9_@])@[a-zA-Z0-9_]{3,}/.test(t)) return true;

      if (/\b(t\.me|telegram\.me|wa\.me|vk\.com|vk\.cc|discord(app)?\.(gg|com)|instagram\.com|t\.co|wa\.link)\b/i.test(low)) return true;
      if (/https?:\/\/|www\./i.test(low)) return true;

      if (/\b(телеграм|телега|тг|тгк|whatsapp|ватсап|вотсап|вацап|viber|вайбер|discord|дискорд|диск|skype|скайп|instagram|инста|инстаграм|вконтакте|вк|vk)\b/i.test(low)) return true;

      if (/\b(в\s*лс|в\s*личк|в\s*личн|напиши\s*мне|пиши\s*мне|пишите\s*мне|вне\s*(сайта|фанпей|funpay)|мой\s*(тг|ник|контакт|телеграм)|мои\s*контакты|связь\s*вне)\b/i.test(low)) return true;

      const phone = t.replace(/[\s()\-]/g, '');
      if (/(\+?\d[\d]{9,14})/.test(phone)) return true;

      if (/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/.test(t)) return true;

      return false;
    }

    async function aiHasContactInfo(text) {
      try {
        const res = await new Promise((resolve) => {
          let done = false;
          const to = setTimeout(() => { if (!done) { done = true; resolve(null); } }, 15000);
          try {
            chrome.runtime.sendMessage(
              { action: 'getAIProcessedText', text, context: '', myUsername: '', type: 'contact_check' },
              (r) => { if (!done) { done = true; clearTimeout(to); resolve(r); } }
            );
          } catch (_) { if (!done) { done = true; clearTimeout(to); resolve(null); } }
        });
        console.log('[FPT PD] contact_check AI result:', res);
        if (!res || !res.success || typeof res.data !== 'string') return false;
        const ans = res.data.toLowerCase().trim();
        if (/\b(нет|no|отсутств|не\s*содерж|не\s*обнаруж)\b/.test(ans)) return false;
        if (/\b(есть|да|yes|обнаруж|содерж|найден|присутств|имеет)\b/.test(ans)) return true;
        return false;
      } catch (_) {
        return false;
      }
    }

    async function hasContactInfo(text) {
      if (localHasContactInfo(text)) return true;
      return await aiHasContactInfo(text);
    }

    async function persist(text, okMessage) {
      save.disabled = true; cancel.disabled = true; if (del) del.disabled = true;
      try {
        if (text && text.trim()) {
          toast('Проверяем описание…', false);
          const hasContact = await aiHasContactInfo(text);
          if (hasContact) {
            toast('В описании нельзя указывать контактные данные (Telegram, номер и т.п.). Уберите их и попробуйте снова.', true);
            save.disabled = false; cancel.disabled = false; if (del) del.disabled = false;
            return;
          }
        }
        let session = state.session || (await loadSession(state.funpayUserId));
        if (!session || session.funpayUserId !== state.funpayUserId) {
          console.log('[FPT PD] no session, starting verification for', state.funpayUserId);
          toast('Подтверждаем владение аккаунтом…', false);
          session = await runVerification(state.funpayUserId);
          console.log('[FPT PD] verification OK, got session');
        }
        let res;
        try { res = await serverSaveDescription(session.token, text); }
        catch (e) {
          if (e.httpStatus === 401) {
            console.log('[FPT PD] session expired, re-verifying');
            session = await runVerification(state.funpayUserId);
            res = await serverSaveDescription(session.token, text);
          }
          else throw e;
        }
        console.log('[FPT PD] saved:', res);
        const newDesc = res && res.description != null ? res.description : text;
        const newState = Object.assign({}, state, { description: newDesc, session });
        await cacheWrite(state.funpayUserId, { description: newDesc, bannerUrl: state.bannerUrl });
        renderView(root, newState);
        toast(okMessage, false);
      } catch (e) {
        console.error('[FPT PD] save failed:', e && e.message, e);
        toast(humanError(e && e.message), true);
        save.disabled = false; cancel.disabled = false; if (del) del.disabled = false;
      }
    }

    save.addEventListener('click', () => persist(ta.value, 'Описание сохранено'));
    if (del) {
      del.addEventListener('click', () => {
        if (!confirm('Удалить описание профиля?')) return;
        persist('', 'Описание удалено');
      });
    }
    ta.focus();
  }

  function humanError(code) {
    switch (code) {
      case 'VERIFY_TIMEOUT': return 'Проверка заняла слишком долго. Попробуйте ещё раз через минуту.';
      case 'VERIFY_COOLDOWN': return 'Подождите минуту перед повторной попыткой.';
      case 'WRITE_COOLDOWN': return 'Описание можно менять раз в 24 часа.';
      case 'BANNER_COOLDOWN': return 'Баннер можно менять раз в 15 минут.';
      case 'BANNER_URL_INVALID': return 'Ссылка должна начинаться с https://';
      case 'RATE_LIMITED': return 'Слишком много попыток. Подождите немного.';
      case 'BAD_KEY': return 'Ошибка доступа к серверу.';
      default:
        if (/^FUNPAY_SAVE_ERROR/.test(code)) return 'FunPay отклонил создание тестового лота.';
        return 'Не удалось сохранить.';
    }
  }

  function findCover() {
    return document.querySelector('.profile-cover');
  }


  // Грузит картинку с прогрессом. onProgress(percentOrNull).
  // Долгий таймаут (90с) — большие гифки на слабом инете успеют.
  // Кастомные баннеры профиля удалены полностью.
  function reattachEditor() { /* disabled */ }
  function applyBanner(_url) { /* disabled */ }

  // Кастомные баннеры профиля удалены — редактор баннера не монтируется.
  function mountBannerEditor(_profileId, _session, _currentBanner) { /* disabled */ }

  // Кастомные баннеры профиля удалены — форма ввода баннера отключена.
  function openBannerForm(_cover, _profileId, _state) { /* disabled */ }

  let mounted = false;

  async function mount() {
    if (mounted) return;
    const profileId = profileIdFromUrl();
    if (profileId === null) return;
    if (document.querySelector('.' + ROOT)) { mounted = true; return; }

    console.log('[FPT PD] mount() start, waiting for anchor…');
    const anchor = (await waitFor('.profile-header-cols', 10000))
      || document.querySelector('.profile-header')
      || document.querySelector('.profile-data-container');
    console.log('[FPT PD] anchor found:', !!anchor, anchor && anchor.className);
    if (!anchor) return;
    if (profileIdFromUrl() !== profileId) return;
    if (document.querySelector('.' + ROOT)) { mounted = true; return; }

    injectStyles();
    mounted = true;
    const root = buildRoot(anchor);
    renderLoading(root);
    console.log('[FPT PD] mounted, profileId=', profileId);

    const myId = getMyUserId();
    const isOwn = myId !== null && myId === profileId;
    console.log('[FPT PD] myId=', myId, 'isOwn=', isOwn);

    let description = null;
    let bannerUrl = null;
    const cached = await cacheRead(profileId);
    console.log('[FPT PD] cache:', cached);
    if (cached) { description = cached.description; bannerUrl = cached.bannerUrl; }
    else {
      console.log('[FPT PD] fetching from server…');
      const prof = await withTimeout(serverGetProfile(profileId), 8000, { description: null, bannerUrl: null });
      description = prof.description;
      bannerUrl = prof.bannerUrl;
      console.log('[FPT PD] server profile:', prof);
      await cacheWrite(profileId, prof);
    }

    const session = await loadSession(profileId);

    if (bannerUrl) applyBanner(bannerUrl);
    if (isOwn) mountBannerEditor(profileId, session, bannerUrl);

    if (!description && !isOwn) {
      console.log('[FPT PD] empty + not own → removing block');
      const row = root.closest('.' + ROW);
      if (row && row.firstElementChild && row.firstElementChild.classList.contains('profile-header-cols')) {
        row.parentElement.insertBefore(row.firstElementChild, row);
      }
      root.remove();
      if (row) row.remove();
      return;
    }
    console.log('[FPT PD] rendering view, isOwn=', isOwn);
    renderView(root, { funpayUserId: profileId, isOwn, description, bannerUrl, session });
  }

  function checkNav(getLast, setLast) {
    if (location.pathname !== getLast()) { setLast(location.pathname); mounted = false; mount(); }
  }

  // Кастомные баннеры профиля удалены — ранний показ баннера отключён.
  async function earlyBanner() { /* disabled */ }

  function boot() {
    console.log('[FPT PD] feature loaded, path=', location.pathname);
    earlyBanner();
    mount();
    // Дочистка «застрявших» верификационных лотов: сразу после загрузки (с задержкой,
    // чтобы на странице успел появиться csrf) и затем раз в 5 минут как страховка.
    setTimeout(() => { sweepPendingLots(); }, 4000);
    setInterval(() => { sweepPendingLots(); }, 5 * 60 * 1000);
    let lastPath = location.pathname;
    const get = () => lastPath, set = (p) => { lastPath = p; };
    setInterval(() => checkNav(get, set), 700);
    document.addEventListener('click', () => setTimeout(() => checkNav(get, set), 300), true);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
