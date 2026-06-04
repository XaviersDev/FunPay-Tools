// content/features/support_theme.js
// Кастомная тема FP Tools для сайта поддержки (support.funpay.com).
// Сайт на Bootstrap 5 с переменными --bs-*. Вместо борьбы с классами
// переопределяем переменные Bootstrap под цвета темы - это убирает
// лишние обводки и делает всё консистентным.

(function () {
    'use strict';

    const STYLE_ID = 'fp-tools-support-theme';
    const FONT_ID  = 'fp-tools-support-fonts';

    const DEFAULTS = {
        bgColor1: '#ff6d15',
        bgColor2: '#f4cf78',
        containerBgColor: '#0b0b0b',
        containerBgOpacity: 1,
        textColor: '#f0f0f0',
        linkColor: '#2d6bb3',
        bgImage: null,
        font: 'Helvetica Neue',
        bgBlur: 0,
        bgBrightness: 100,
        borderRadius: 8
    };

    const GOOGLE_FONTS = [
        'Roboto', 'Open Sans', 'Lato', 'Montserrat', 'Oswald', 'Raleway',
        'Poppins', 'Nunito', 'Inter', 'Ubuntu', 'Rubik', 'Manrope', 'PT Sans'
    ];

    function toRgb(hex) {
        let r = 0, g = 0, b = 0;
        if (!hex) return '11,11,11';
        if (hex.length === 4) {
            r = parseInt(hex[1] + hex[1], 16);
            g = parseInt(hex[2] + hex[2], 16);
            b = parseInt(hex[3] + hex[3], 16);
        } else if (hex.length === 7) {
            r = parseInt(hex.slice(1, 3), 16);
            g = parseInt(hex.slice(3, 5), 16);
            b = parseInt(hex.slice(5, 7), 16);
        }
        return `${r},${g},${b}`;
    }
    function hexToRgba(hex, a) { return `rgba(${toRgb(hex)},${a})`; }

    // Осветлить/затемнить hex на величину amt (-255..255)
    function shade(hex, amt) {
        const [r, g, b] = toRgb(hex).split(',').map(Number);
        const cl = v => Math.max(0, Math.min(255, v + amt));
        const h = v => cl(v).toString(16).padStart(2, '0');
        return `#${h(r)}${h(g)}${h(b)}`;
    }

    function manageFont(font) {
        let el = document.getElementById(FONT_ID);
        const isGoogle = GOOGLE_FONTS.includes(font);
        const content = isGoogle
            ? `@import url('https://fonts.googleapis.com/css2?family=${font.replace(/ /g, '+')}:wght@400;600;700&display=swap');`
            : '';
        if (!el) {
            el = document.createElement('style');
            el.id = FONT_ID;
            (document.head || document.documentElement).appendChild(el);
        }
        if (el.textContent !== content) el.textContent = content;
    }

    function buildCss(s) {
        const bgImageUrl = s.bgImage ? `url(${s.bgImage})` : 'url(https://i.ibb.co/ZpS0d56R/PH6-UEvp-Kn-KI.jpg)';
        const op = s.containerBgOpacity;

        // Поверхности на основе цвета контейнера
        const surface     = s.containerBgColor;                 // основной фон карточек
        const surfaceUp    = shade(s.containerBgColor, 18);      // приподнятый (поля, кнопки)
        const surfaceUp2   = shade(s.containerBgColor, 30);      // ещё выше (ховеры)
        const textRgb      = toRgb(s.textColor);
        const accent       = s.bgColor1;
        const accentRgb    = toRgb(s.bgColor1);
        const link         = s.linkColor;
        const linkRgb      = toRgb(s.linkColor);
        const rr           = `${s.borderRadius}px`;

        // Полупрозрачные панели поверх обоев
        const panel     = hexToRgba(s.containerBgColor, Math.min(1, op * 0.85 + 0.1));
        const panelSoft = hexToRgba(s.containerBgColor, Math.min(1, op * 0.55 + 0.2));

        return `
        /* ── Обои ── */
        html, body { background: transparent !important; }
        body::before {
            content: ''; position: fixed; inset: 0; width: 100vw; height: 100vh;
            background: ${bgImageUrl} no-repeat center center fixed; background-size: cover;
            filter: blur(${s.bgBlur}px) brightness(${s.bgBrightness}%);
            z-index: -1; transform: translateZ(0);
        }

        /* ── ГЛАВНОЕ: переопределяем переменные Bootstrap ──
           Так перекрашивается ВСЁ разом, а обводки исчезают, т.к. они
           берут цвет из --bs-border-color. */
        :root, [data-bs-theme=light], [data-bs-theme=dark], html[data-bs-theme=dark] {
            --bs-body-color: ${s.textColor};
            --bs-body-color-rgb: ${textRgb};
            --bs-body-bg: ${surface};
            --bs-body-bg-rgb: ${toRgb(surface)};
            --bs-emphasis-color: ${s.textColor};
            --bs-emphasis-color-rgb: ${textRgb};
            --bs-secondary-color: ${hexToRgba(s.textColor, .65)};
            --bs-secondary-bg: ${surfaceUp};
            --bs-secondary-bg-rgb: ${toRgb(surfaceUp)};
            --bs-tertiary-color: ${hexToRgba(s.textColor, .5)};
            --bs-tertiary-bg: ${surfaceUp};
            --bs-tertiary-bg-rgb: ${toRgb(surfaceUp)};
            --bs-heading-color: ${s.textColor};

            --bs-link-color: ${link};
            --bs-link-color-rgb: ${linkRgb};
            --bs-link-hover-color: ${shade(s.linkColor, 30)};
            --bs-link-hover-color-rgb: ${toRgb(shade(s.linkColor, 30))};

            --bs-primary: ${accent};
            --bs-primary-rgb: ${accentRgb};
            --bs-primary-text-emphasis: ${shade(s.bgColor1, 60)};
            --bs-primary-bg-subtle: ${panelSoft};
            --bs-primary-border-subtle: ${hexToRgba(s.textColor, .12)};

            /* Тонкие, ненавязчивые границы вместо ярких обводок */
            --bs-border-color: ${hexToRgba(s.textColor, .10)};
            --bs-border-color-translucent: ${hexToRgba(s.textColor, .10)};
            --bs-border-radius: ${rr};
            --bs-border-radius-sm: ${Math.max(4, s.borderRadius - 2)}px;
            --bs-border-radius-lg: ${s.borderRadius + 4}px;

            --bs-box-shadow: 0 .5rem 1.5rem rgba(0,0,0,.35);
            --bs-box-shadow-sm: 0 .25rem .5rem rgba(0,0,0,.3);

            --bs-secondary-color-rgb: ${textRgb};
            --bs-tertiary-color-rgb: ${textRgb};
            color-scheme: dark;
        }

        body {
            font-family: '${s.font}', 'Helvetica Neue', Helvetica, Arial, sans-serif !important;
            color: ${s.textColor};
        }

        /* ── Навбар ── */
        .navbar.navbar-dark, nav.navbar { background: ${panelSoft} !important; backdrop-filter: blur(8px); }
        .navbar .nav-link, .navbar .navbar-brand, .navbar span { color: ${s.textColor} !important; }
        .navbar .nav-link.active { color: ${accent} !important; }
        .navbar .logo-image > path { fill: ${s.textColor} !important; }
        .navbar .btn-light, .nav-button.btn-light {
            --bs-btn-bg: ${accent}; --bs-btn-border-color: ${accent}; --bs-btn-color: #fff;
            --bs-btn-hover-bg: ${shade(s.bgColor1, -20)}; --bs-btn-hover-border-color: ${shade(s.bgColor1, -20)}; --bs-btn-hover-color: #fff;
        }

        /* ── Карточки / панели: панели полупрозрачные поверх обоев ── */
        .ticket-card { background: ${panel} !important; box-shadow: 0 .5rem 1.5rem rgba(0,0,0,.35) !important; outline: none !important; }
        .ticket-info-panel, .ticket-search-panel { background: ${hexToRgba(s.containerBgColor, Math.min(1, op * 0.4 + 0.15))} !important; }
        .comment-form-wrapper { background: transparent !important; }

        /* ── Комментарии тикета ── */
        .comment-body, .bg-light-subtle { background: ${surfaceUp} !important; }
        .bg-primary-subtle { background: ${hexToRgba(s.linkColor, .15)} !important; }
        .comment-username .username { color: ${accent} !important; }
        blockquote { border-left: .25em solid ${accent} !important; }

        /* ── Summernote редактор ── */
        .note-editor.note-frame { background: ${surfaceUp} !important; }
        .note-toolbar.card-header { background: ${surfaceUp2} !important; }
        .note-editing-area, .note-editable, .note-codable { background: ${surfaceUp} !important; color: ${s.textColor} !important; }
        .note-btn { --bs-btn-bg: ${surfaceUp2}; --bs-btn-color: ${s.textColor}; }

        /* ── Вложения ── */
        .attachment-item > * { border-color: ${hexToRgba(s.textColor, .1)} !important; }

        /* ── Алерты: мягкие, без резких рамок ── */
        .alert {
            background: ${surfaceUp} !important;
            color: ${s.textColor} !important;
            border: 1px solid ${hexToRgba(s.textColor, .08)} !important;
            border-radius: ${rr} !important;
        }
        .alert-secondary { background: ${surfaceUp} !important; }
        .alert-warning { background: ${hexToRgba('#f5a623', .12)} !important; border-color: ${hexToRgba('#f5a623', .3)} !important; }
        .alert-danger  { background: ${hexToRgba('#dd4b39', .12)} !important; border-color: ${hexToRgba('#dd4b39', .3)} !important; }
        .alert-info    { background: ${hexToRgba(s.linkColor, .12)} !important; border-color: ${hexToRgba(s.linkColor, .3)} !important; }
        .alert .alert-icon, .alert i, .alert svg { fill: ${hexToRgba(s.textColor, .7)} !important; color: ${hexToRgba(s.textColor, .7)} !important; }

        /* ── Кнопка закрытия модалки видимой на тёмном ── */
        .btn-close { filter: invert(1) grayscale(1) brightness(1.6); }

        /* ── Тултипы ── */
        .tooltip { --bs-tooltip-bg: ${surfaceUp2}; --bs-tooltip-color: ${s.textColor}; }
        .tooltip .tooltip-inner { border-color: ${hexToRgba(s.textColor, .12)}; }

        /* ── Скроллбар ── */
        ::-webkit-scrollbar { width: 8px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: ${hexToRgba(s.containerBgColor, .8)}; border-radius: 8px; }
        `;
    }

    function ensureStyle() {
        let el = document.getElementById(STYLE_ID);
        if (!el) {
            el = document.createElement('style');
            el.id = STYLE_ID;
            (document.head || document.documentElement).appendChild(el);
        }
        return el;
    }

    async function apply() {
        let data = {};
        try { data = await chrome.storage.local.get(['enableCustomTheme', 'fpToolsTheme']); }
        catch { return; }

        const styleEl = ensureStyle();
        if (data.enableCustomTheme === false) {
            styleEl.textContent = '';
            const f = document.getElementById(FONT_ID);
            if (f) f.textContent = '';
            return;
        }
        const s = { ...DEFAULTS, ...(data.fpToolsTheme || {}) };
        manageFont(s.font);
        styleEl.textContent = buildCss(s);
    }

    apply();
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', apply);
    }
    if (chrome?.storage?.onChanged) {
        chrome.storage.onChanged.addListener((changes, area) => {
            if (area !== 'local') return;
            if (changes.fpToolsTheme || changes.enableCustomTheme) apply();
        });
    }
})();
