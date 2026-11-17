// content/navbar_early.js - FunPay Tools: настройки шапки сайта (document_start).
// Ширина (компактная / во всю ширину) и расстояние между кнопками задаются
// классом и CSS-переменной на <html>, стили - css/navbar_float.css.
(function () {
    'use strict';
    if (window.top !== window) return;

    const KEY = 'fpToolsNavbar';
    const DEFAULTS = { width: 'compact', gap: 6 };
    const clampGap = (g) => Math.min(15, Math.max(2, Math.round(Number(g)) || DEFAULTS.gap));

    function apply(cfg) {
        const c = Object.assign({}, DEFAULTS, cfg || {});
        const root = document.documentElement;
        root.style.setProperty('--fpt-nav-gap', clampGap(c.gap) + 'px');
        root.classList.toggle('fpt-nav-wide', c.width === 'wide');
    }

    apply();
    try {
        chrome.storage.local.get(KEY, (s) => apply(s && s[KEY]));
        chrome.storage.onChanged.addListener((changes, area) => {
            if (area === 'local' && changes[KEY]) apply(changes[KEY].newValue);
        });
    } catch (_) {}

    window.fptNavbarDefaults = DEFAULTS;
    window.fptApplyNavbar = apply;
    window.fptClampNavGap = clampGap;
})();
