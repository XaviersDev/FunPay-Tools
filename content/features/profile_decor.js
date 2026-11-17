// content/features/profile_decor.js - FunPay Tools
// Рамки для аватарок и баннеры за лотами. Кто что выбрал, лежит в decor.json (пишет воркер fpt-promo
// после проверки ботом: PRO или покупка). Картинки грузятся с funpay.tools только для тех, кто украшен.

(function () {
  'use strict';
  if (window.top !== window) return;

  const CATALOG = {"base": "https://funpay.tools/decor/", "frames": [{"id": 1, "name": "Красный неон", "file": "frames/f01.webp"}, {"id": 2, "name": "Голубой неон", "file": "frames/f02.webp"}, {"id": 3, "name": "Фиолетовый неон", "file": "frames/f03.webp"}, {"id": 4, "name": "Оранжевый неон", "file": "frames/f04.webp"}, {"id": 5, "name": "Неоновый градиент", "file": "frames/f05.webp"}, {"id": 6, "name": "Серебряная орбита", "file": "frames/f06.webp"}, {"id": 7, "name": "Солнечная вспышка", "file": "frames/f07.webp"}, {"id": 8, "name": "Нимб", "file": "frames/f08.webp"}, {"id": 9, "name": "Молния", "file": "frames/f09.webp"}, {"id": 10, "name": "Чёрные розы", "file": "frames/f10.webp"}, {"id": 11, "name": "Белые розы", "file": "frames/f11.webp"}, {"id": 12, "name": "Фиолетовые розы", "file": "frames/f12.webp"}, {"id": 13, "name": "Лисичка", "file": "frames/f13.webp"}, {"id": 14, "name": "Чёрная кошка", "file": "frames/f14.webp"}, {"id": 15, "name": "Белая кошка", "file": "frames/f15.webp"}, {"id": 16, "name": "Бирюзовый вихрь", "file": "frames/f16.webp"}, {"id": 17, "name": "Листва", "file": "frames/f17.webp"}, {"id": 18, "name": "Полумесяц", "file": "frames/f18.webp"}, {"id": 19, "name": "Крылья", "file": "frames/f19.webp"}, {"id": 20, "name": "Клыки", "file": "frames/f20.webp"}, {"id": 21, "name": "Бабочки", "file": "frames/f21.webp"}, {"id": 22, "name": "Галактика", "file": "frames/f22.webp"}, {"id": 23, "name": "Звёздная орбита", "file": "frames/f23.webp"}, {"id": 24, "name": "Планета", "file": "frames/f24.webp"}, {"id": 25, "name": "Комета", "file": "frames/f25.webp"}, {"id": 26, "name": "Сакура", "file": "frames/f26.webp"}, {"id": 27, "name": "Ветка с луной", "file": "frames/f27.webp"}, {"id": 28, "name": "Талисман", "file": "frames/f28.webp"}, {"id": 29, "name": "Лёд", "file": "frames/f29.webp"}, {"id": 30, "name": "Пламя", "file": "frames/f30.webp"}], "banners": [{"id": 1, "name": "Белые розы", "file": "banners/b01.webp", "ar": 13.68}, {"id": 2, "name": "Красный фонарь", "file": "banners/b02.webp", "ar": 13.3}, {"id": 3, "name": "Мотылёк", "file": "banners/b03.webp", "ar": 13.49}, {"id": 4, "name": "Лесное озеро", "file": "banners/b04.webp", "ar": 13.12}, {"id": 5, "name": "Ночное небо", "file": "banners/b05.webp", "ar": 13.12}, {"id": 6, "name": "Чёрные розы", "file": "banners/b06.webp", "ar": 13.12}, {"id": 7, "name": "Фиолетовая волна", "file": "banners/b07.webp", "ar": 13.49}, {"id": 8, "name": "Красная сакура", "file": "banners/b08.webp", "ar": 14.49}, {"id": 9, "name": "Светлячки", "file": "banners/b09.webp", "ar": 14.49}, {"id": 10, "name": "Розовая сакура", "file": "banners/b10.webp", "ar": 13.87}, {"id": 11, "name": "Пламя", "file": "banners/b11.webp", "ar": 14.71}, {"id": 12, "name": "Витраж", "file": "banners/b12.webp", "ar": 14.28}, {"id": 14, "name": "Паутина", "file": "banners/b14.webp", "ar": 13.87}, {"id": 15, "name": "Неоновые лучи", "file": "banners/b15.webp", "ar": 13.49}, {"id": 16, "name": "Бирюзовая сеть", "file": "banners/b16.webp", "ar": 13.68}, {"id": 17, "name": "Кровавая луна", "file": "banners/b17.webp", "ar": 13.04}, {"id": 18, "name": "Глаза", "file": "banners/b18.webp", "ar": 13.19}, {"id": 19, "name": "Сердце", "file": "banners/b19.webp", "ar": 13.69}, {"id": 20, "name": "Лунный замок", "file": "banners/b20.webp", "ar": 14.6}, {"id": 21, "name": "Вороны", "file": "banners/b21.webp", "ar": 15.87}, {"id": 22, "name": "Призрачная роза", "file": "banners/b22.webp", "ar": 16.34}, {"id": 23, "name": "Бабочки", "file": "banners/b23.webp", "ar": 16.34}, {"id": 24, "name": "Руки", "file": "banners/b24.webp", "ar": 15.42}, {"id": 25, "name": "Снежный барс", "file": "banners/b25.webp", "ar": 16.34}, {"id": 26, "name": "Алый взгляд", "file": "banners/b26.webp", "ar": 15.64}, {"id": 27, "name": "Белый волк", "file": "banners/b27.webp", "ar": 14.8}, {"id": 28, "name": "Когти", "file": "banners/b28.webp", "ar": 13.52}]};
  // геометрия кольца каждой рамки: [доля аватарки от размера картинки, сдвиг центра X, сдвиг центра Y]
  const RING = {1:[.682,.023,.059],2:[.674,.012,.055],3:[.682,.004,.059],4:[.682,.004,.059],5:[.682,.004,.059],6:[.728,-.004,.043],7:[.713,.027,.027],8:[.728,.016,.016],9:[.705,.004,.012],10:[.713,.012,.012],11:[.721,.008,.016],12:[.713,-.02,.004],13:[.658,.012,.031],14:[.674,.008,.031],15:[.674,0,.031],16:[.682,-.016,.008],17:[.713,-.004,.031],18:[.68,0,.03],19:[.585,0,-.053],20:[.658,-.008,.008],21:[.705,.004,0],22:[.666,.008,.012],23:[.682,.016,.035],24:[.705,-.027,.016],25:[.713,.027,-.055],26:[.713,.027,-.035],27:[.744,-.012,-.047],28:[.76,-.012,-.055],29:[.705,-.02,-.055],30:[.705,.02,-.051]};
  const CACHE_KEY = 'fptDecorCache';
  const LOCAL_KEY = 'fptDecorLocal';
  const ASSET_KEY = 'fptDA:';
  const CACHE_MS = 2 * 60 * 1000;
  const byId = (list, id) => list.find((x) => x.id === Number(id));
  const frameUrl = (id) => { const f = byId(CATALOG.frames, id); return f ? CATALOG.base + f.file : ''; };
  const bannerUrl = (id) => { const b = byId(CATALOG.banners, id); return b ? CATALOG.base + b.file : ''; };
  let map = {};
  let local = null;
  const frames = new Map();
  const hidden = new Set();

  // картинки украшений один раз скачиваются фоном и дальше берутся из хранилища расширения:
  // страница FunPay не ждёт funpay.tools и не перепроверяет их при каждом переходе
  const assets = {};
  const loading = {};
  function asset(file) {
    if (assets[file]) return assets[file];
    const pre = window.__fptDA && window.__fptDA[file];
    if (pre) return (assets[file] = pre);
    if (!loading[file]) loading[file] = loadAsset(file).then(() => later(0));
    return '';
  }
  async function loadAsset(file) {
    const k = ASSET_KEY + file;
    let data = '';
    try {
      const st = await chrome.storage.local.get([k, 'fptDAIndex']);
      data = st[k] || '';
      const idx = st.fptDAIndex || [];
      if (data && !idx.includes(file)) await chrome.storage.local.set({ fptDAIndex: idx.concat(file).slice(-60) });
    } catch {}
    if (!data) {
      const res = await new Promise((r) => { try { chrome.runtime.sendMessage({ action: 'fetchDecorAsset', file }, r); } catch { r(null); } });
      if (res && res.success && res.data) {
        data = res.data;
        try {
          const st = await chrome.storage.local.get('fptDAIndex');
          const idx = (st.fptDAIndex || []).filter((x) => x !== file).concat(file).slice(-60);
          await chrome.storage.local.set({ [k]: data, fptDAIndex: idx });
        } catch {}
      }
    }
    if (!data) { assets[file] = CATALOG.base + file; return; }
    try { assets[file] = URL.createObjectURL(await (await fetch(data)).blob()); } catch { assets[file] = data; }
  }

  function app() { try { const d = JSON.parse(document.body.dataset.appData || '{}'); return Array.isArray(d) ? d[0] : d; } catch { return {}; } }
  function entry(id) {
    id = String(id);
    if (local && local.id === id && Date.now() - local.t < 15 * 60 * 1000) return local;
    return map[id] || null;
  }
  function active(id) {
    const d = entry(id);
    if (!d) return null;
    const now = Date.now();
    const f = d.f && (!d.fu || d.fu > now) ? d.f : 0;
    const b = d.b && (!d.bu || d.bu > now) ? d.b : 0;
    return f || b ? { f, b } : null;
  }

  function injectStyles() {
    if (document.getElementById('fpt-decor-style')) return;
    const st = document.createElement('style');
    st.id = 'fpt-decor-style';
    st.textContent = `
      .fpt-tc-compact .tc-user, .fpt-tc-compact .tc-amount, .fpt-tc-compact .tc-price { width:1% !important; white-space:nowrap; }
      .fpt-tc-compact .tc-user { padding-left:6px !important; }
      .tc-user .media-user-name:has(.fpt-epic-wrap) { height:1.43em; line-height:1.43em; white-space:nowrap; overflow:visible; }
      .tc-user .media-user-name .fpt-epic-wrap { vertical-align:top !important; height:1.43em; max-height:none; align-items:center; }
      .fpt-row-banner { position:absolute; z-index:0; pointer-events:none; background-repeat:no-repeat; }
      .fpt-ava-big { position:absolute !important; z-index:2; transform:translate(-50%,-50%); pointer-events:none; }
      .fpt-ava-big .fpt-ava-pic { position:absolute; inset:0; border-radius:50%; background:#c9d2e3 center / cover no-repeat; }
      .fpt-ava-big .fpt-ava-dot { position:absolute; right:4%; bottom:4%; width:24%; height:24%; border-radius:50%; background:#5fc31f; border:2px solid #fff; box-sizing:border-box; }
      img.fpt-frame { position:absolute !important; pointer-events:none; z-index:3; transform:translate(-50%,-50%);
        max-width:none !important; max-height:none !important; border-radius:0 !important; margin:0 !important; padding:0 !important;
        border:0 !important; box-shadow:none !important; background:none !important; }
      img.fpt-frame.fpt-up { z-index:6; }
      .fpt-ava-glow { position:absolute; pointer-events:none; border-radius:50%; transform:translate(-50%,-50%); z-index:5; opacity:0; transition:opacity .25s; }
      .fpt-ava-glow.on { opacity:1; animation: fptRgbRim 2.4s linear infinite; }
      .fpt-own-ava { cursor:pointer; }
      .fpt-edit-ava { position:absolute !important; z-index:7; transform:translate(-50%,-50%); margin:0 !important; }
      .fpt-orig-hidden { visibility:hidden !important; }
      #fpt-cover-strip { position:absolute; left:0; z-index:1; pointer-events:none; border-radius:16px; background-size:cover; background-position:center; background-repeat:no-repeat; box-shadow:0 8px 24px rgba(15,20,35,.14); }
      .fpt-cover-off { background:none !important; box-shadow:none !important; border-color:transparent !important; }
      .fpt-cover-off::before, .fpt-cover-off::after { display:none !important; }
      @keyframes fptRgbRim {
        0%   { box-shadow: 0 0 0 3px #ff2f9a, 0 0 22px 4px rgba(255,47,154,.7); }
        25%  { box-shadow: 0 0 0 3px #7c4dff, 0 0 22px 4px rgba(124,77,255,.7); }
        50%  { box-shadow: 0 0 0 3px #00a8ff, 0 0 22px 4px rgba(0,168,255,.7); }
        75%  { box-shadow: 0 0 0 3px #00c27a, 0 0 22px 4px rgba(0,194,122,.7); }
        100% { box-shadow: 0 0 0 3px #ff2f9a, 0 0 22px 4px rgba(255,47,154,.7); }
      }
    `;
    document.head.appendChild(st);
  }

  const setStyle = (el, k, v) => { if (el.style[k] !== v) el.style[k] = v; };

  function idFromHref(h) { const m = String(h || '').match(/\/users\/(\d+)\//); return m ? m[1] : ''; }
  function userIdOf(box) {
    let id = idFromHref(box.getAttribute('data-href'));
    if (id) return id;
    const a = box.querySelector('a[href*="/users/"]') || box.closest('a[href*="/users/"]');
    if (a && (id = idFromHref(a.getAttribute('href')))) return id;
    const media = box.closest('.media');
    const nl = media && media.querySelector('.media-user-name [data-href*="/users/"], .media-user-name a[href*="/users/"]');
    if (nl && (id = idFromHref(nl.getAttribute('data-href') || nl.getAttribute('href')))) return id;
    if (box.closest('.profile-cover')) return idFromHref(location.pathname + '/');
    if (box.classList.contains('user-link-photo')) return String(app().userId || '');
    return '';
  }

  function circleRect(box) {
    const img = box.tagName === 'IMG' ? null : box.querySelector('img');
    if (img && getComputedStyle(box).overflow === 'visible') {
      const r = img.getBoundingClientRect();
      if (r.width && r.height) return r;
    }
    return box.getBoundingClientRect();
  }

  // куда класть рамку: выше всех предков, которые её обрезали бы (но не выходим из прокручиваемых списков)
  const hostCache = new WeakMap();
  function hostOf(box) {
    const c = hostCache.get(box);
    if (c && c.host.isConnected) return c;
    let host = box.parentElement, free = false;
    for (let n = box.parentElement, i = 0; n && n !== document.body && i < 6; n = n.parentElement, i++) {
      const o = getComputedStyle(n);
      const ov = o.overflow + ' ' + o.overflowX + ' ' + o.overflowY;
      if (/auto|scroll/.test(ov)) break;
      if (/hidden|clip/.test(ov) && n.parentElement) { host = n.parentElement; free = true; }
    }
    const cover = box.closest('.profile-cover');
    if (cover) { if (cover.parentElement && cover.contains(host)) host = cover.parentElement; free = true; }
    // ячейка таблицы лотов: кладём прямо в неё, тогда при фильтре и сортировке всё едет вместе со строкой
    else if (free && host && getComputedStyle(host).display === 'table-cell') free = false;
    const res = { host, free };
    hostCache.set(box, res);
    return res;
  }

  // переводит точку окна в координаты абсолютного элемента
  function localOffset(el, host, free) {
    if (!free) {
      if (getComputedStyle(host).position === 'static') host.style.position = 'relative';
      const hr = host.getBoundingClientRect();
      return [hr.left + host.clientLeft - host.scrollLeft, hr.top + host.clientTop - host.scrollTop];
    }
    const op = el.offsetParent;
    if (!op || (op === document.body && getComputedStyle(op).position === 'static')) return [-scrollX, -scrollY];
    const r = op.getBoundingClientRect();
    return [r.left + op.clientLeft - op.scrollLeft, r.top + op.clientTop - op.scrollTop];
  }
  function putAt(el, host, free, x, y) {
    if (el.parentElement !== host) host.appendChild(el);
    const [ox, oy] = localOffset(el, host, free);
    setStyle(el, 'left', Math.round((x - ox) * 10) / 10 + 'px');
    setStyle(el, 'top', Math.round((y - oy) * 10) / 10 + 'px');
  }

  function dropFrame(box) {
    const f = frames.get(box);
    if (f) { f.img.remove(); if (f.glow) f.glow.remove(); if (f.edit) f.edit.remove(); frames.delete(box); }
  }

  function placeFrame(box, id) {
    const fr = byId(CATALOG.frames, id);
    if (!fr) return dropFrame(box);
    const src = asset(fr.file);
    if (!src) return;
    const big = bigs.get(box);
    const r = big ? big.rect : circleRect(box);
    if (!r.width || !r.height) { hidden.add(box); return; }
    hidden.delete(box);
    const { host, free } = hostOf(box);
    if (!host) return;
    let f = frames.get(box);
    if (!f) {
      const img = document.createElement('img');
      img.className = 'fpt-frame'; img.alt = ''; img.decoding = 'async';
      f = { img }; frames.set(box, f);
    }
    const img = f.img;
    if (img.classList.contains('fpt-up') !== free) img.classList.toggle('fpt-up', free);
    if (img.getAttribute('src') !== src) img.src = src;
    setStyle(img, 'display', '');
    const [k, dx, dy] = RING[id] || [0.68, 0, 0];
    const size = Math.round(Math.min(r.width, r.height) / k);
    setStyle(img, 'width', size + 'px'); setStyle(img, 'height', size + 'px');
    putAt(img, host, free, r.left + r.width / 2 - dx * size, r.top + r.height / 2 - dy * size);
    f.size = size;
  }

  function bgColor(el) {
    for (let n = el; n && n !== document.documentElement; n = n.parentElement) {
      const c = getComputedStyle(n).backgroundColor;
      const m = c.match(/rgba?\(([^)]+)\)/);
      if (m) { const p = m[1].split(',').map((x) => parseFloat(x)); if (p.length < 4 || p[3] > 0.6) return p.slice(0, 3); }
    }
    return [255, 255, 255];
  }

  function textRight(el, left) {
    if (!el) return 0;
    try {
      const rg = document.createRange(); rg.selectNodeContents(el);
      let m = 0;
      for (const q of rg.getClientRects()) if (q.width > 1) m = Math.max(m, q.right - left);
      return m;
    } catch { return 0; }
  }

  function clearBanner(el) {
    if (!el.dataset.fptBanner) return;
    el.style.background = el.dataset.fptBgOrig || '';
    delete el.dataset.fptBanner; delete el.dataset.fptTone; delete el.dataset.fptBgRgb; delete el.dataset.fptKey;
  }

  function fadeGradient(W, alphaAt, rgb) {
    const step = Math.max(12, Math.round(W / 90));
    const stops = [];
    for (let x = 0; x <= W; x += step) stops.push(`rgba(${rgb},${alphaAt(x).toFixed(3)}) ${x}px`);
    stops.push(`rgba(${rgb},${alphaAt(W).toFixed(3)}) ${W}px`);
    return `linear-gradient(to right, ${stops.join(', ')})`;
  }
  const sm = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));

  // общий баннер-фон: картинка прижата вправо, слева плавно растворяется в цвет фона
  // общий баннер-фон: слева плавно растворяется в цвет фона, справа (если задано) мягко обрывается
  // o: { s0, end, tr, cut, pos, size, shade }
  function paintBanner(el, b, W, o) {
    const src = asset(b.file);
    if (!src) return;
    let p = 1;
    const tt = (o.tr - o.s0) / (o.end - o.s0);
    if (tt > 0.05 && tt < 0.98) p = Math.log(0.42) / Math.log(1 - sm(tt));
    p = Math.min(1, Math.max(0.55, p));
    const key = [b.id, W, o.s0, o.end, Math.round(o.tr), o.cut, o.soft, o.pos, o.size, o.shade, src].join('|');
    if (el.dataset.fptKey === key) return;
    el.dataset.fptKey = key;
    const left = (x) => Math.pow(1 - sm((x - o.s0) / (o.end - o.s0)), p);
    const sf = o.soft || 46;
    const right = (x) => (o.cut ? sm((x - (o.cut - sf)) / sf) : 0);
    const layers = [fadeGradient(W, (x) => Math.max(left(x), right(x)), el.dataset.fptBgRgb)];
    if (o.shade) layers.push(`linear-gradient(to right, rgba(0,0,0,0) ${Math.max(0, o.end - 200)}px, rgba(0,0,0,${o.shade}) ${o.end + 30}px, rgba(0,0,0,${o.shade}) ${Math.max(o.end + 31, (o.cut || W) - 46)}px, rgba(0,0,0,0) ${o.cut || W}px)`);
    layers.push(`url("${src}") ${o.pos} / ${o.size} no-repeat`);
    el.style.background = layers.join(', ');
  }

  // аватарка продавца в строке с украшением: рисуем свою копию крупнее и ровно по центру строки,
  // поверх таблицы (вне её раскладки), оригинал прячем. Высота строки и колонки не меняются.
  const bigs = new Map();
  function dropBig(av) {
    const g = bigs.get(av);
    if (!g) return;
    g.el.remove(); bigs.delete(av);
    av.classList.remove('fpt-orig-hidden');
  }
  function bigAvatar(row, on) {
    const av = row.querySelector('.tc-user .avatar-photo');
    if (!av) return;
    if (!on) return dropBig(av);
    const rr = row.getBoundingClientRect();
    const r = av.getBoundingClientRect();
    if (!r.width || !rr.height) return;
    let g = bigs.get(av);
    if (!g) {
      const el = document.createElement('div');
      el.className = 'fpt-ava-big';
      el.innerHTML = '<i class="fpt-ava-pic"></i><i class="fpt-ava-dot"></i>';
      g = { el }; bigs.set(av, g);
    }
    const img = av.tagName === 'IMG' ? av : av.querySelector('img');
    const bgi = img ? `url("${img.currentSrc || img.src}")` : getComputedStyle(av).backgroundImage;
    const pic = g.el.firstChild, dot = g.el.lastChild;
    if (bgi && bgi !== 'none') { if (pic.style.backgroundImage !== bgi) pic.style.backgroundImage = bgi; }
    else { const bc = getComputedStyle(av).backgroundColor; if (pic.style.backgroundColor !== bc) pic.style.backgroundColor = bc; }
    const online = !!av.closest('.online');
    if (dot.style.display !== (online ? '' : 'none')) dot.style.display = online ? '' : 'none';
    const d = Math.round(Math.min(r.width * 1.5, Math.max(r.width, rr.height * 0.74)));
    setStyle(g.el, 'width', d + 'px'); setStyle(g.el, 'height', d + 'px');
    const { host, free } = hostOf(av);
    putAt(g.el, host, free, r.right - d / 2, rr.top + rr.height / 2);
    if (!av.classList.contains('fpt-orig-hidden')) av.classList.add('fpt-orig-hidden');
    g.rect = { left: r.right - d, right: r.right, top: rr.top + rr.height / 2 - d / 2, width: d, height: d };
  }

  // фон лота рисуем в каждой ячейке (а не на строке таблицы): так он всегда ровно во всю высоту
  function paintCells(row, layers) {
    const rr = row.getBoundingClientRect();
    for (const c of row.children) {
      if (/fpt-/.test(c.className)) continue;
      const cr = c.getBoundingClientRect();
      if (!cr.width) continue;
      const off = cr.left - rr.left, top = cr.top - rr.top;
      if (c.dataset.fptBgOrig === undefined) c.dataset.fptBgOrig = c.style.background || '';
      c.style.background = layers.map((l) => `${l.img} ${Math.round(l.x - off)}px ${Math.round((l.y || 0) - top)}px / ${l.w} ${l.h} no-repeat`).join(', ');
    }
  }
  function clearCells(row) {
    for (const c of row.children) if (c.dataset.fptBgOrig !== undefined) { c.style.background = c.dataset.fptBgOrig; delete c.dataset.fptBgOrig; }
  }

  // лот, как в концепте: картинка во всю высоту строки и заканчивается на аватарке продавца,
  // влево очень плавно растворяется, у аватарки верх и низ гаснут ещё мягче, поверх лёгкая пастельная дымка
  function placeBanner(row, id) {
    const b = byId(CATALOG.banners, id);
    if (!b) { if (row.dataset.fptBanner) { clearCells(row); const o = row.querySelector('.fpt-row-banner'); if (o) o.remove(); delete row.dataset.fptBanner; delete row.dataset.fptKey; } return; }
    const rr = row.getBoundingClientRect();
    const user = row.querySelector('.tc-user');
    if (!rr.width || !user) return;
    const src = asset(b.file);
    if (!src) return;
    if (!row.dataset.fptBgRgb) row.dataset.fptBgRgb = bgColor(row.parentElement || row).join(',');
    row.dataset.fptBanner = String(id);
    const W = Math.round(rr.width), h = Math.round(rr.height);
    const avEl = user.querySelector('.avatar-photo');
    const g = avEl && bigs.get(avEl);
    const ar = g ? g.rect : (avEl || user).getBoundingClientRect();
    const avL = Math.round(ar.left - rr.left), avC = Math.round(ar.left + ar.width / 2 - rr.left);
    const cut = Math.min(W, avC + 40);
    const full = avL - 10;
    const s0 = Math.max(0, Math.min(Math.round(W * 0.04), full - 760));
    const desc = row.querySelector('.tc-desc-text') || row.querySelector('.tc-desc');
    const tr = Math.min(textRight(desc, rr.left), full);
    let p = 1;
    const tt = (tr - s0) / (full - s0);
    if (tt > 0.05 && tt < 0.98) p = Math.log(0.45) / Math.log(1 - sm(tt));
    p = Math.min(1, Math.max(0.5, p));
    const key = [b.id, W, h, s0, full, avC, cut, Math.round(tr), src, row.children.length].join('|');
    if (row.dataset.fptKey === key) return;
    row.dataset.fptKey = key;
    const haze = 0.22;
    const alphaAt = (x) => {
      const l = Math.pow(1 - sm((x - s0) / (full - s0)), p);
      const r = x >= cut ? 1 : sm((x - (avL - 16)) / Math.max(20, cut - avL + 16));
      return Math.min(1, Math.max(l, r, haze));
    };
    const iw = Math.round(h * (b.ar || 14));
    const ex = avL - 420, rx = 520, ry = Math.round(h * 0.78);
    // баннер отдельным слоем с маской прозрачности: растворяется в любой фон, в том числе в кастомных темах
    const host = [...row.children].find((c) => !/fpt-/.test(c.className));
    if (!host) return;
    let el = row.querySelector(':scope > * > .fpt-row-banner');
    if (!el || el.parentElement !== host) { if (el) el.remove(); el = document.createElement('div'); el.className = 'fpt-row-banner'; host.prepend(el); }
    if (getComputedStyle(host).position === 'static') host.style.position = 'relative';
    for (const c of row.children) for (const k of c.children) {
      if (/fpt-/.test(k.className)) continue;
      if (getComputedStyle(k).position === 'static') { k.style.position = 'relative'; k.style.zIndex = '1'; }
    }
    const hr = host.getBoundingClientRect();
    el.style.left = Math.round(rr.left - hr.left - host.clientLeft) + 'px';
    el.style.top = Math.round(rr.top - hr.top - host.clientTop) + 'px';
    el.style.width = W + 'px'; el.style.height = h + 'px';
    el.style.backgroundImage = `url("${src}")`;
    el.style.backgroundPosition = `${cut - iw}px center`;
    el.style.backgroundSize = `${iw}px 100%`;
    const inv = (x) => `rgba(0,0,0,${(1 - alphaAt(x)).toFixed(3)})`;
    const step = Math.max(12, Math.round(W / 90)), st = [];
    for (let x = 0; x <= W; x += step) st.push(`${inv(x)} ${x}px`);
    st.push(`${inv(W)} ${W}px`);
    const mask = [
      `linear-gradient(to right, ${st.join(', ')})`,
      `radial-gradient(ellipse ${rx}px ${ry}px at ${ex}px 50%, #000 0%, #000 55%, rgba(0,0,0,.4) 80%, transparent 100%)`,
      'linear-gradient(to bottom, rgba(0,0,0,.4) 0, rgba(0,0,0,.82) 14%, #000 30%, #000 70%, rgba(0,0,0,.82) 86%, rgba(0,0,0,.4) 100%)',
    ].join(', ');
    el.style.webkitMaskImage = mask; el.style.maskImage = mask;
    el.style.webkitMaskComposite = 'source-in, source-in'; el.style.maskComposite = 'intersect';
  }

  // плашка «Открыть чат»: ник остаётся на обычном фоне, баннер проявляется к кнопке
  function placeChatPromo(box, id) {
    const b = byId(CATALOG.banners, id);
    if (!b) return clearBanner(box);
    const rr = box.getBoundingClientRect();
    const user = box.querySelector('.chat-promo-user');
    if (!rr.width || !user) { hidden.add(box); return; }
    hidden.delete(box);
    if (!box.dataset.fptBanner) { box.dataset.fptBgOrig = box.style.background || ''; box.dataset.fptBgRgb = bgColor(box).join(','); }
    box.dataset.fptBanner = String(id);
    const W = Math.round(rr.width);
    const ue = Math.round(user.getBoundingClientRect().right - rr.left);
    const desc = box.querySelector('.chat-promo-desc');
    const tr = desc ? textRight(desc, rr.left) : ue;
    const s0 = Math.min(W * 0.4, ue + 20);
    const end = Math.max(s0 + 220, Math.min(W - 60, Math.max(tr + 80, W * 0.6)));
    paintBanner(box, b, W, { s0, end, tr: Math.max(tr, s0), cut: 0, pos: 'right center', size: 'cover', shade: 0 });
  }

  // профиль: баннер скруглённой полосой по ширине контента, аватарка чуть заходит на него снизу
  function placeCover(id) {
    const cover = document.querySelector('.profile-cover');
    const img = cover && (cover.querySelector('.profile-cover-img') || cover);
    let strip = document.getElementById('fpt-cover-strip');
    const b = id && byId(CATALOG.banners, id);
    const src = b && asset(b.file);
    if (!cover || !b) {
      if (strip) strip.remove();
      if (img) img.classList.remove('fpt-cover-off');
      document.documentElement.classList.remove('fpt-cover-early');
      return;
    }
    if (!img.classList.contains('fpt-cover-off')) img.classList.add('fpt-cover-off');
    if (!src) return;
    if (!strip) { strip = document.createElement('div'); strip.id = 'fpt-cover-strip'; document.body.insertBefore(strip, document.body.firstChild); }
    const box = cover.closest('.container') || cover.parentElement || cover;
    const br = box.getBoundingClientRect();
    const cs = getComputedStyle(box);
    const L = br.left + parseFloat(cs.paddingLeft || 0), R = br.right - parseFloat(cs.paddingRight || 0);
    const w = Math.max(200, Math.round(R - L));
    const h = Math.min(150, Math.round(w / (b.ar || 14)));
    const header = document.getElementById('header');
    const hb = header ? header.getBoundingClientRect().bottom : 0;
    const av = cover.querySelector('.avatar') || cover.querySelector('.avatar-photo');
    const ar = av && av.getBoundingClientRect();
    let top = ar && ar.height ? ar.top + ar.height * 0.2 - h : cover.getBoundingClientRect().top + 14;
    top = Math.max(top, hb + 14);
    const [ox, oy] = localOffset(strip, null, true);
    setStyle(strip, 'top', Math.round(top - oy) + 'px');
    setStyle(strip, 'left', Math.round(L - ox) + 'px');
    setStyle(strip, 'width', w + 'px');
    setStyle(strip, 'height', h + 'px');
    const bg = `url("${src}")`;
    if (strip.style.backgroundImage !== bg) strip.style.backgroundImage = bg;
    if (av && !av.dataset.fptLift) {
      av.dataset.fptLift = '1';
      if (getComputedStyle(av).position === 'static') av.style.position = 'relative';
      av.style.zIndex = '2';
    }
  }

  function isOwnProfile() {
    const pid = idFromHref(location.pathname + '/');
    return !!pid && String(app().userId) === pid;
  }

  function ownAvatar() {
    if (!isOwnProfile()) return;
    const av = document.querySelector('.profile-cover .avatar .avatar-photo, .profile-cover .avatar-photo');
    if (!av) return;
    if (!av.classList.contains('fpt-own-ava')) {
      av.classList.add('fpt-own-ava');
      av.title = 'Украсить профиль: рамка и баннер';
      av.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); if (window.fptOpenAccountTab) window.fptOpenAccountTab('decor'); });
      av.addEventListener('mouseenter', () => { const g = glowFor(av); if (g) g.classList.add('on'); });
      av.addEventListener('mouseleave', () => { const g = glowFor(av); if (g) g.classList.remove('on'); });
    }
    const r = circleRect(av);
    if (!r.width) return;
    const { host, free } = hostOf(av);
    let f = frames.get(av);
    if (!f) { f = { img: document.createElement('img') }; f.img.className = 'fpt-frame'; f.img.style.display = 'none'; frames.set(av, f); host.appendChild(f.img); }
    if (!f.glow) { f.glow = document.createElement('div'); f.glow.className = 'fpt-ava-glow'; }
    const d = Math.round(Math.min(r.width, r.height)) + 'px';
    setStyle(f.glow, 'width', d); setStyle(f.glow, 'height', d);
    putAt(f.glow, host, free, r.left + r.width / 2, r.top + r.height / 2);
    editButton(f, host, free, r);
  }
  function glowFor(av) { const f = frames.get(av); return f && f.glow; }

  function editButton(f, host, free, r) {
    const orig = document.querySelector('.profile-cover .js-edit-avatar, .js-edit-avatar');
    if (!orig) return;
    const framed = f.img.style.display !== 'none' && f.img.getAttribute('src');
    let p = f.edit;
    if (!framed) { if (p) { p.remove(); f.edit = null; } orig.classList.remove('fpt-orig-hidden'); return; }
    if (!p) {
      p = document.createElement('a');
      p.href = 'javascript:void(0)';
      p.className = [...orig.classList].filter((c) => c !== 'js-edit-avatar' && c !== 'edit-avatar' && c !== 'fpt-orig-hidden').join(' ') + ' fpt-edit-ava';
      p.innerHTML = orig.innerHTML;
      p.title = 'Сменить аватарку';
      p.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); orig.click(); });
      f.edit = p;
      const cs = getComputedStyle(orig);
      ['background-color', 'background-image', 'color', 'border', 'border-radius', 'font-size', 'line-height', 'padding', 'box-shadow', 'text-align']
        .forEach((k) => p.style.setProperty(k, cs.getPropertyValue(k)));
      p.style.display = 'flex'; p.style.alignItems = 'center'; p.style.justifyContent = 'center';
      const os = orig.getBoundingClientRect();
      if (os.width) { p.style.width = os.width + 'px'; p.style.height = os.height + 'px'; }
    }
    if (!orig.classList.contains('fpt-orig-hidden')) orig.classList.add('fpt-orig-hidden');
    const rad = (f.size || r.width * 1.45) * 0.5 * 0.95;
    putAt(p, host, free, r.left + r.width / 2 + rad * 0.7071, r.top + r.height / 2 + rad * 0.7071);
  }

  function scan() {
    injectStyles();
    for (const [box, f] of frames) if (!box.isConnected) { f.img.remove(); if (f.glow) f.glow.remove(); if (f.edit) f.edit.remove(); frames.delete(box); }
    for (const box of hidden) if (!box.isConnected) hidden.delete(box);
    for (const [av, g] of bigs) if (!av.isConnected) { g.el.remove(); bigs.delete(av); }
    document.querySelectorAll('a.tc-item').forEach((row) => {
      const av = row.querySelector('.tc-user .avatar-photo, .tc-user [data-href*="/users/"]');
      const id = av && userIdOf(av);
      const d = id && active(id);
      const big = !!(d && (d.f || d.b));
      if (row.classList.contains('fpt-big-ava') !== big) row.classList.toggle('fpt-big-ava', big);
      if (big) { const tc = row.closest('.tc'); if (tc && !tc.classList.contains('fpt-tc-compact') && getComputedStyle(row).display === 'table-row') tc.classList.add('fpt-tc-compact'); }
      bigAvatar(row, big);
      placeBanner(row, d && d.b ? d.b : 0);
    });
    document.querySelectorAll('.avatar-photo, .user-link-photo').forEach((box) => {
      const id = userIdOf(box);
      const d = id && active(id);
      if (d && d.f) placeFrame(box, d.f);
      else {
        hidden.delete(box);
        const f = frames.get(box);
        if (f) { if (f.glow || f.edit) { f.img.style.display = 'none'; f.img.removeAttribute('src'); } else dropFrame(box); }
      }
    });
    ownAvatar();
    document.querySelectorAll('.chat-promo').forEach((box) => {
      const a = box.querySelector('.chat-promo-user a[href*="/users/"], .chat-promo-user [data-href*="/users/"]');
      const id = a && idFromHref(a.getAttribute('href') || a.getAttribute('data-href'));
      const d = id && active(id);
      placeChatPromo(box, d && d.b ? d.b : 0);
    });
    const pid = idFromHref(location.pathname + '/');
    if (pid) { const d = active(pid); placeCover(d && d.b ? d.b : 0); }
  }

  async function load(force) {
    let st = {};
    try { st = await chrome.storage.local.get([CACHE_KEY, LOCAL_KEY]); } catch {}
    const cache = st[CACHE_KEY] || {};
    local = st[LOCAL_KEY] || null;
    if (cache.data) map = cache.data;
    scan();
    if (!force && cache.t && Date.now() - cache.t < CACHE_MS) return;
    const res = await new Promise((r) => { try { chrome.runtime.sendMessage({ action: 'fetchDecor' }, r); } catch { r(null); } });
    if (res && res.success && res.data) {
      map = res.data;
      try { await chrome.storage.local.set({ [CACHE_KEY]: { t: Date.now(), data: map } }); } catch {}
      scan();
    }
  }

  async function setLocal(id, f, b) {
    local = { id: String(id), f: f || 0, b: b || 0, t: Date.now() };
    try { await chrome.storage.local.set({ [LOCAL_KEY]: local }); } catch {}
    scan();
  }

  let t = null, raf = 0;
  function later(ms) { if (!t) t = setTimeout(() => { t = null; scan(); }, ms); }
  function now() { if (!raf) raf = requestAnimationFrame(() => { raf = 0; scan(); }); }
  const ours = (n) => n.nodeType !== 1 || n.classList.contains('fpt-frame') || n.classList.contains('fpt-ava-glow') || n.classList.contains('fpt-edit-ava') || n.classList.contains('fpt-ava-big') || n.classList.contains('fpt-row-banner') || n.id === 'fpt-cover-strip';
  const strip = (c) => String(c || '').split(/\s+/).filter((x) => x && !x.startsWith('fpt-')).sort().join(' ');
  const obs = new MutationObserver((muts) => {
    const real = muts.some((m) => {
      if (m.type === 'attributes') return m.target.nodeType === 1 && !!m.target.closest('.tc, .chat-promo, .chat, .profile-cover') && strip(m.oldValue) !== strip(m.target.getAttribute('class'));
      return ![...m.addedNodes].every(ours) || ![...m.removedNodes].every(ours);
    });
    if (real) later(120);
  });
  function start() {
    load(false);
    obs.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'], attributeOldValue: true });
    document.addEventListener('input', () => { later(80); setTimeout(() => later(0), 400); }, true);
    // масштаб и размер окна: пересчёт в тот же кадр, чтобы рамка не съезжала
    addEventListener('resize', now);
    if (window.visualViewport) visualViewport.addEventListener('resize', now);
    addEventListener('load', () => later(50));
    document.addEventListener('load', (e) => { if (e.target && e.target.tagName === 'IMG' && !e.target.classList.contains('fpt-frame')) later(120); }, true);
    // скрытые блоки (свёрнутый чат и т.п.) проверяем по клику и изредка по таймеру, только если такие есть
    document.addEventListener('click', () => { setTimeout(() => later(0), 120); setTimeout(() => later(0), 600); }, true);
    setInterval(() => {
      for (const box of hidden) { if (box.isConnected && box.getClientRects().length && box.getBoundingClientRect().width) { later(0); break; } }
    }, 1000);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();

  window.fptDecor = { catalog: CATALOG, ring: RING, frameUrl, bannerUrl, reload: () => load(true), get: (id) => entry(id), active, setLocal };
})();
