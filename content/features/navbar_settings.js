// content/features/navbar_settings.js - FunPay Tools: настройки шапки + golden_key.
//
//  • «Общие → Шапка сайта»: ширина и расстояние между кнопками, применяются сразу.
//  • «Аккаунты»: предпросмотр golden_key в виде abcd1234•••••••• и копирование целиком.

(function () {
    'use strict';
    const KEY = 'fpToolsNavbar';

    // ── Шапка сайта ────────────────────────────────────────────────────────────
    function initNavbarSettings(root) {
        const box = root.querySelector('#fptNavbarSettings');
        if (!box || box.dataset.ready) return;
        box.dataset.ready = '1';

        const defaults = window.fptNavbarDefaults || { width: 'compact', gap: 6 };
        const clamp = window.fptClampNavGap || ((g) => Math.min(15, Math.max(2, Math.round(Number(g)) || 6)));
        const segBtns = [...box.querySelectorAll('[data-width]')];
        const gap = box.querySelector('#fptNavGap');
        const gapVal = box.querySelector('#fptNavGapVal');
        let cfg = { ...defaults };
        let saveTimer = null;

        const render = () => {
            segBtns.forEach((b) => {
                const on = b.dataset.width === cfg.width;
                b.classList.toggle('active', on);
                b.setAttribute('aria-checked', on ? 'true' : 'false');
            });
            gap.value = String(cfg.gap);
            gapVal.textContent = cfg.gap + ' px';
        };
        const save = (immediate) => {
            if (window.fptApplyNavbar) window.fptApplyNavbar(cfg);     // мгновенное превью
            clearTimeout(saveTimer);
            const run = () => chrome.storage.local.set({ [KEY]: { ...cfg } });
            if (immediate) run(); else saveTimer = setTimeout(run, 250);
        };

        chrome.storage.local.get(KEY, (s) => {
            cfg = { ...defaults, ...((s && s[KEY]) || {}) };
            cfg.gap = clamp(cfg.gap);
            render();
        });

        segBtns.forEach((b) => b.addEventListener('click', () => {
            cfg.width = b.dataset.width === 'wide' ? 'wide' : 'compact';
            render(); save(true);
        }));
        gap.addEventListener('input', () => { cfg.gap = clamp(gap.value); render(); save(false); });
        gap.addEventListener('change', () => save(true));
        box.querySelector('#fptNavReset').addEventListener('click', () => {
            cfg = { ...defaults }; render(); save(true);
        });
    }

    // ── golden_key ─────────────────────────────────────────────────────────────
    const maskKey = (k) => {
        const s = String(k || '');
        if (s.length <= 8) return '•'.repeat(s.length || 8);
        return s.slice(0, 7) + '•'.repeat(Math.min(12, s.length - 7));
    };

    async function copyText(text) {
        try { await navigator.clipboard.writeText(text); return true; } catch (_) {}
        try {
            const ta = document.createElement('textarea');
            ta.value = text; ta.setAttribute('readonly', '');
            ta.style.cssText = 'position:fixed;top:-1000px;opacity:0';
            document.body.appendChild(ta); ta.select();
            const ok = document.execCommand('copy');
            ta.remove();
            return ok;
        } catch (_) { return false; }
    }

    function initGoldenKey(root) {
        const card = root.querySelector('#fptGoldenKeyCard');
        if (!card || card.dataset.ready) return;
        card.dataset.ready = '1';
        const preview = card.querySelector('#fptGoldenKeyPreview');
        const btn = card.querySelector('#fptGoldenKeyCopy');
        const btnText = btn.querySelector('.fpt-gk-btn-text');

        const refresh = async () => {
            let key = null;
            try {
                const r = await chrome.runtime.sendMessage({ action: 'getGoldenKey' });
                key = r && r.success ? r.key : null;
            } catch (_) {}
            preview.textContent = key ? maskKey(key) : 'не найден - войдите в аккаунт';
            preview.classList.toggle('empty', !key);
            btn.disabled = !key;
            return key;
        };

        btn.addEventListener('click', async () => {
            const key = await refresh();            // всегда актуальный ключ, а не закэшированный
            if (!key) return;
            const ok = await copyText(key);
            btn.classList.toggle('done', ok);
            btnText.textContent = ok ? 'Скопировано' : 'Не удалось';
            if (typeof showNotification === 'function') {
                showNotification(ok ? 'golden_key скопирован в буфер обмена' : 'Не удалось скопировать golden_key', !ok);
            }
            setTimeout(() => { btn.classList.remove('done'); btnText.textContent = 'Копировать'; }, 1800);
        });

        refresh();
    }

    function init() {
        const root = document.querySelector('.fp-tools-popup') || document;
        initNavbarSettings(root);
        initGoldenKey(root);
    }

    // Попап настроек создаётся лениво - ждём его появления.
    const tryInit = () => {
        if (document.getElementById('fptNavbarSettings') || document.getElementById('fptGoldenKeyCard')) init();
    };
    tryInit();
    const mo = new MutationObserver(tryInit);
    const start = () => mo.observe(document.body, { childList: true, subtree: true });
    if (document.body) start(); else document.addEventListener('DOMContentLoaded', start, { once: true });

    // Компактная кнопка FP Tools для узких окон (и масштаба 150%+): у FunPay там
    // правая часть шапки прячется целиком, вместе с основной кнопкой.
    function ensureCompactButton() {
        const header = document.querySelector('#header .navbar-header');
        const main = document.getElementById('fpToolsButton');
        if (!header || !main || document.getElementById('fpToolsButtonCompact')) return;
        const b = document.createElement('a');
        b.id = 'fpToolsButtonCompact';
        b.setAttribute('role', 'button');
        b.setAttribute('aria-label', 'FP Tools');
        b.title = 'FP Tools';
        b.textContent = 'FP Tools';
        b.addEventListener('click', (e) => { e.preventDefault(); main.click(); });
        header.appendChild(b);
    }
    const mo2 = new MutationObserver(() => { ensureCompactButton(); if (document.getElementById('fpToolsButtonCompact')) mo2.disconnect(); });
    const start2 = () => { ensureCompactButton(); mo2.observe(document.body, { childList: true, subtree: true }); setTimeout(() => mo2.disconnect(), 20000); };
    if (document.body) start2(); else document.addEventListener('DOMContentLoaded', start2, { once: true });
})();
