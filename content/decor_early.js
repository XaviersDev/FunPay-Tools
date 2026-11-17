(function () {
  'use strict';
  if (window.top !== window) return;
  const toBlob = (d) => {
    try {
      const i = d.indexOf(',');
      const bin = atob(d.slice(i + 1));
      const u = new Uint8Array(bin.length);
      for (let k = 0; k < bin.length; k++) u[k] = bin.charCodeAt(k);
      return URL.createObjectURL(new Blob([u], { type: 'image/webp' }));
    } catch (_) { return d; }
  };
  window.__fptDA = window.__fptDA || {};
  try {
    chrome.storage.local.get(['fptDecorCache', 'fptDecorLocal', 'fptDAIndex'], (st) => {
      st = st || {};
      const m = location.pathname.match(/^\/users\/(\d+)\/?$/);
      if (m) {
        const id = m[1], now = Date.now();
        const loc = st.fptDecorLocal;
        const d = loc && loc.id === id && now - loc.t < 15 * 60 * 1000 ? loc : ((st.fptDecorCache && st.fptDecorCache.data) || {})[id];
        if (d && d.b && (!d.bu || d.bu > now)) document.documentElement.classList.add('fpt-cover-early');
      }
      const files = st.fptDAIndex || [];
      if (!files.length) return;
      chrome.storage.local.get(files.map((f) => 'fptDA:' + f), (s2) => {
        for (const f of files) { const v = s2 && s2['fptDA:' + f]; if (v && !window.__fptDA[f]) window.__fptDA[f] = toBlob(v); }
      });
    });
  } catch (_) {}
})();
