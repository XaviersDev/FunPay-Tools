// content/features/profile_raise_all.js
// Кнопка «Поднять все лоты» на своём профиле — клон кнопки «Выбрать», стоит перед ней.

(function () {
  'use strict';

  function getMyUserId() {
    try {
      const a = document.querySelector('.user-link a[href*="/users/"]') ||
                document.querySelector('.user-link-dropdown[href*="/users/"]') ||
                document.querySelector('a.menu-item[href*="/users/"]');
      if (a) { const m = a.getAttribute('href').match(/\/users\/(\d+)\//); if (m) return m[1]; }
    } catch {}
    const appData = document.body && document.body.dataset && document.body.dataset.appData;
    if (appData) { try { const j = JSON.parse(appData); if (j && j.userId) return String(j.userId); } catch {} }
    return null;
  }

  function profileIdFromUrl() {
    const m = location.pathname.match(/\/users\/(\d+)\//);
    return m ? m[1] : null;
  }

  function run(btn) {
    if (btn.getAttribute('data-busy') === '1') return;
    btn.setAttribute('data-busy', '1');
    const orig = btn.textContent;
    btn.textContent = 'Поднимаю…';
    btn.classList.add('disabled');
    chrome.runtime.sendMessage({ action: 'fptRaiseAllNow' }, (res) => {
      btn.removeAttribute('data-busy');
      btn.classList.remove('disabled');
      btn.textContent = orig;
      let msg;
      if (chrome.runtime.lastError) msg = 'Ошибка связи с расширением';
      else if (!res || !res.ok) msg = 'Не удалось: ' + ((res && res.error) || 'ошибка');
      else {
        const s = res.summary || {};
        msg = 'Поднято: ' + (s.raised || 0);
        if (s.skipped) msg += ', пропущено: ' + s.skipped;
        if (s.errors) msg += ', ошибок: ' + s.errors;
      }
      if (typeof showNotification === 'function') { try { showNotification(msg, false); return; } catch {} }
      let tip = btn.parentElement.querySelector('.fpt-raise-result');
      if (!tip) { tip = document.createElement('span'); tip.className = 'fpt-raise-result'; tip.style.cssText = 'margin-left:8px;font-size:12px;opacity:.8;'; btn.parentElement.appendChild(tip); }
      tip.textContent = msg;
      setTimeout(() => { if (tip) tip.textContent = ''; }, 8000);
    });
  }

  function tryMount() {
    const pid = profileIdFromUrl();
    if (!pid) return false;
    const myId = getMyUserId();
    if (!myId || myId !== pid) return true; // не свой профиль — больше не пытаться
    if (document.getElementById('fpt-raise-all-btn')) return true; // уже стоит

    // Ждём, пока появится кнопка «Выбрать» от lot_management — клонируем её стиль и место.
    const selectBtn = document.getElementById('fp-tools-select-lots-btn');
    if (!selectBtn) return false; // ещё не создана — попробуем позже
    if (!selectBtn.parentElement) return false;

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.id = 'fpt-raise-all-btn';
    btn.className = selectBtn.className; // тот же вид
    btn.textContent = 'Поднять все лоты';
    btn.style.marginRight = '6px';
    btn.addEventListener('click', () => run(btn));

    // Вставляем ПЕРЕД «Выбрать», не трогая саму кнопку.
    selectBtn.parentElement.insertBefore(btn, selectBtn);
    return true;
  }

  function boot() {
    if (tryMount()) return;
    // ждём появления кнопки «Выбрать», максимум ~15 сек
    let tries = 0;
    const iv = setInterval(() => {
      tries++;
      if (tryMount() || tries > 60) clearInterval(iv);
    }, 250);
    // на смену страницы — перезапуск
    let last = location.pathname;
    setInterval(() => {
      if (location.pathname !== last) {
        last = location.pathname;
        let t = 0;
        const iv2 = setInterval(() => { t++; if (tryMount() || t > 60) clearInterval(iv2); }, 250);
      }
    }, 800);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
