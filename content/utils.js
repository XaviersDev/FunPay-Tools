// 3.0: Image reference store. Instead of dumping a giant [image:data:...base64...] string
// into textareas (ugly, "in your face"), we insert a short readable token like {img:ab12cd}
// and keep the real data URL in chrome.storage under fpToolsImageStore. Senders resolve
// tokens → data URLs right before sending. Old [image:dataURL] tags still work too.
const FPT_IMG_STORE_KEY = 'fpToolsImageStore';
async function fptStoreImage(dataUrl) {
    const id = Math.random().toString(36).slice(2, 8);
    try {
        const { [FPT_IMG_STORE_KEY]: store = {} } = await chrome.storage.local.get(FPT_IMG_STORE_KEY);
        store[id] = dataUrl;
        const keys = Object.keys(store);
        if (keys.length > 200) delete store[keys[0]];
        await chrome.storage.local.set({ [FPT_IMG_STORE_KEY]: store });
    } catch (_) {}
    return id;
}

// 3.0: guards against "Extension context invalidated" errors. When the extension reloads or
// updates, old content-script contexts linger on the page; any chrome.* call from them throws.
// Use fptExtAlive() before chrome.* calls in observers/listeners, and fptSafe() to wrap them.
function fptExtAlive() {
    try { return !!(chrome && chrome.runtime && chrome.runtime.id); } catch (_) { return false; }
}
async function fptSafe(fn, fallback) {
    if (!fptExtAlive()) return fallback;
    try { return await fn(); } catch (e) {
        if (String(e && e.message || '').includes('Extension context invalidated')) return fallback;
        throw e;
    }
}

// 3.0: Preload the bundled Material Symbols font the moment the extension activates on the
// page, so icons are ready before the menu is ever opened. The woff2 is bundled in the
// extension and served from chrome-extension://, so the browser caches it on disk
// effectively forever (no network, instant on subsequent loads). We additionally warm the
// CSS Font Loading API cache here.
(function preloadMaterialIcons() {
    try {
        if (typeof chrome === 'undefined' || !chrome.runtime?.getURL) return;
        const url = chrome.runtime.getURL('fonts/material-symbols-rounded.woff2');
        const face = new FontFace(
            'Material Symbols Rounded',
            `url(${url}) format('woff2')`,
            { style: 'normal', weight: '400', display: 'block' }
        );
        face.load().then(loaded => {
            try { document.fonts.add(loaded); } catch (_) {}
        }).catch(() => { /* CSS @font-face fallback still applies */ });
    } catch (_) {}
})();

function throttle(func, limit) {
    let inThrottle;
    return function() {
        const args = arguments;
        const context = this;
        if (!inThrottle) {
            func.apply(context, args);
            inThrottle = true;
            setTimeout(() => inThrottle = false, limit);
        }
    }
}

function createElement(tag, attributes = {}, styles = {}, innerHTML = '') {
    const element = document.createElement(tag);
    for (const [key, value] of Object.entries(attributes)) {
        element.setAttribute(key, value);
    }
    for (const [key, value] of Object.entries(styles)) {
        element.style[key] = value;
    }
    element.innerHTML = innerHTML;
    return element;
}

function waitForElementToBeEnabled(element, timeout = 2000) {
    return new Promise((resolve) => {
        if (!element.disabled) {
            return resolve();
        }
        const interval = 50;
        let elapsedTime = 0;
        const checker = setInterval(() => {
            elapsedTime += interval;
            if (!element.disabled || elapsedTime >= timeout) {
                clearInterval(checker);
                resolve();
            }
        }, interval);
    });
}

/**
 * --- НОВАЯ ВЕРСИЯ УВЕДОМЛЕНИЙ V4 (Более масштабная анимация) ---
 * Показывает уведомление с предварительной анимацией частиц.
 * @param {string} message - Текст для отображения.
 * @param {boolean} isError - Если true, уведомление будет в стиле ошибки.
 */
function showNotification(message, isError = false) {
    const NOTIFICATION_DURATION = 7000;
    const PARTICLE_ANIMATION_DURATION = 1000;
    const NOTIFICATION_APPEAR_DELAY = 500;
    const PARTICLE_COUNT = 25;

    const particleContainer = createElement('div', { 'aria-hidden': 'true' });
    const animationId = `fpToolsParticleAnimation-${Date.now()}`;
    const styleTagId = `fp-tools-particle-style-${Date.now()}`;

    const startX = window.innerWidth / 2;
    const startY = window.innerHeight / 2;
    const targetX = window.innerWidth - 150;
    const targetY = window.innerHeight - 60;

    const keyframes = `
        @keyframes ${animationId} {
            0% {
                transform: translate(var(--startX), var(--startY)) scale(var(--startScale));
                opacity: 1;
            }
            70% {
                opacity: 1;
            }
            100% {
                transform: translate(${targetX - startX}px, ${targetY - startY}px) scale(0);
                opacity: 0;
            }
        }
    `;

    const styleTag = createElement('style', { id: styleTagId }, {}, keyframes);
    document.head.appendChild(styleTag);

    for (let i = 0; i < PARTICLE_COUNT; i++) {
        const angle = Math.random() * Math.PI * 2;
        const radius = Math.random() * 150 + 50;
        const particleSize = Math.random() * 8 + 6;

        const particle = createElement('div', {}, {
            '--startX': `${Math.cos(angle) * radius}px`,
            '--startY': `${Math.sin(angle) * radius}px`,
            '--startScale': `${Math.random() * 0.5 + 0.8}`,
            position: 'fixed',
            top: `${startY}px`,
            left: `${startX}px`,
            width: `${particleSize}px`,
            height: `${particleSize}px`,
            background: isError ? '#FF8A80' : '#A259FF',
            borderRadius: '50%',
            zIndex: '20001',
            pointerEvents: 'none',
            opacity: '0',
            transform: `translate(var(--startX), var(--startY)) scale(0)`,
            animation: `${animationId} ${PARTICLE_ANIMATION_DURATION}ms cubic-bezier(0.5, 0.05, 0.6, 1) forwards`,
            animationDelay: `${Math.random() * 200}ms`,
        });
        
        const tail = createElement('div', {}, {
             width: '150%', height: '150%', position: 'absolute', top: '-25%', left: '-25%',
             borderRadius: '50%', background: isError ? '#FF8A80' : '#A259FF',
             filter: 'blur(8px)', opacity: '0.7'
        });
        particle.appendChild(tail);

        particleContainer.appendChild(particle);
    }
    document.body.appendChild(particleContainer);
    
    requestAnimationFrame(() => {
        Array.from(particleContainer.children).forEach(p => {
            p.style.transition = 'transform 0.4s cubic-bezier(0.1, 0.8, 0.7, 1), opacity 0.3s ease';
            p.style.transform = `translate(var(--startX), var(--startY)) scale(var(--startScale))`;
            p.style.opacity = '1';
        });
    });

    setTimeout(() => {
        const FADE_OUT_DELAY = NOTIFICATION_DURATION - 500;

        const notification = createElement('div', {}, {
            position: 'fixed',
            bottom: '20px',
            right: '20px',
            background: isError ? 'rgba(194, 57, 42, 0.92)' : 'var(--fpt-surface-2, rgba(44, 47, 51, 0.9))',
            color: isError ? '#fff' : 'var(--fpt-text, #A259FF)',
            padding: '14px 22px',
            borderRadius: '8px',
            fontSize: '15px',
            fontWeight: '500',
            boxShadow: '0 5px 25px var(--fpt-shadow, rgba(0, 0, 0, 0.3))',
            border: '1px solid var(--fpt-border, rgba(255, 255, 255, 0.1))',
            backdropFilter: 'blur(8px)',
            webkitBackdropFilter: 'blur(8px)',
            zIndex: '20000',
            transform: 'scale(0.8)',
            opacity: '0',
            animation: `fpToolsEmerge 0.5s cubic-bezier(0.25, 1, 0.5, 1) forwards, fpToolsFadeOut 0.5s ${FADE_OUT_DELAY / 1000}s forwards`
        }, message);

        if (!document.querySelector('style[data-fp-tools-notify-keyframes]')) {
            const keyframesStyle = `
                @keyframes fpToolsEmerge {
                    from { opacity: 0; transform: scale(0.8); }
                    to { opacity: 1; transform: scale(1); }
                }
                @keyframes fpToolsFadeOut {
                    from { opacity: 1; transform: scale(1); } 
                    to { opacity: 0; transform: scale(0.9); }
                }
            `;
            const keyframesStyleSheet = createElement("style", { 'data-fp-tools-notify-keyframes': 'true' }, {}, keyframesStyle);
            document.head.appendChild(keyframesStyleSheet);
        }

        document.body.appendChild(notification);
        
        setTimeout(() => {
            if (document.body.contains(notification)) {
                document.body.removeChild(notification);
            }
        }, NOTIFICATION_DURATION);

    }, NOTIFICATION_APPEAR_DELAY);


    setTimeout(() => {
        if (document.body.contains(particleContainer)) {
            document.body.removeChild(particleContainer);
        }
        if (document.head.contains(styleTag)) {
            document.head.removeChild(styleTag);
        }
    }, PARTICLE_ANIMATION_DURATION + 300);
}

// === ВЛОЖЕНИЯ ИЗОБРАЖЕНИЙ (отдельно от текста) ===
// Картинки больше НЕ вставляются в поле ввода. Вместо этого под полем появляется чип
// "Прикреплённая картинка" с возможностью посмотреть (👁) и убрать (✕). Сами данные хранятся
// отдельно и подставляются только в момент отправки - пользователь видит чистый текст.
const __fptAttachments = new Map(); // textarea (element) -> [{id, dataUrl}]

function fptGetAttachments(textarea) {
    return __fptAttachments.get(textarea) || [];
}

// Send order: 'text_first' = сообщение → картинка, 'image_first' = картинка → сообщение.
// Stored on the textarea dataset so senders/savers can read it without a separate map.
function fptGetSendOrder(textarea) {
    const v = textarea && textarea.dataset ? textarea.dataset.fptSendOrder : '';
    return v === 'image_first' ? 'image_first' : 'text_first';
}
function fptSetSendOrder(textarea, order) {
    if (!textarea || !textarea.dataset) return;
    textarea.dataset.fptSendOrder = (order === 'image_first') ? 'image_first' : 'text_first';
}

// Build the icon-only "order" mini-row markup (no words, just icons + arrow).
function fptOrderIconsHtml(order) {
    if (order === 'image_first') {
        return `<span class="material-symbols-rounded fpt-order-img">image</span>` +
               `<span class="fpt-order-arrow">→</span>` +
               `<span class="material-symbols-rounded fpt-order-msg">chat_bubble</span>`;
    }
    return `<span class="material-symbols-rounded fpt-order-msg">chat_bubble</span>` +
           `<span class="fpt-order-arrow">→</span>` +
           `<span class="material-symbols-rounded fpt-order-img">image</span>`;
}

// Icon-only popup that lets the user pick the send order. No text at all - the
// two rows are: 💬 → 🖼️  and  🖼️ → 💬. Returns nothing; calls onPick(order).
function fptShowOrderPopup(anchorEl, current, onPick) {
    document.querySelectorAll('.fpt-order-popup').forEach(p => p.remove());

    const popup = document.createElement('div');
    popup.className = 'fpt-order-popup';
    const mk = (order) => `
        <div class="fpt-order-opt${order === current ? ' active' : ''}" data-order="${order}" title="">
            ${fptOrderIconsHtml(order)}
            <span class="material-symbols-rounded fpt-order-check">check</span>
        </div>`;
    popup.innerHTML = mk('text_first') + mk('image_first');
    document.body.appendChild(popup);

    // position below the anchor, clamped to viewport
    const r = anchorEl.getBoundingClientRect();
    const pw = popup.offsetWidth || 160;
    let left = r.left + window.scrollX;
    if (left + pw > window.scrollX + window.innerWidth - 8) {
        left = window.scrollX + window.innerWidth - pw - 8;
    }
    popup.style.left = Math.max(8, left) + 'px';
    popup.style.top = (r.bottom + window.scrollY + 6) + 'px';

    popup.addEventListener('click', (e) => {
        const opt = e.target.closest('.fpt-order-opt');
        if (!opt) return;
        const order = opt.dataset.order;
        if (typeof onPick === 'function') onPick(order);
        popup.remove();
        document.removeEventListener('mousedown', outside, true);
    });

    const outside = (e) => {
        if (!popup.contains(e.target)) {
            popup.remove();
            document.removeEventListener('mousedown', outside, true);
        }
    };
    // defer so the opening click doesn't immediately close it
    setTimeout(() => document.addEventListener('mousedown', outside, true), 0);
}

function fptRenderAttachments(textarea) {
    // find or create the attachments container right after the textarea
    let box = textarea.parentNode && textarea.parentNode.querySelector(':scope > .fpt-attachments');
    if (!box) {
        box = document.createElement('div');
        box.className = 'fpt-attachments';
        textarea.insertAdjacentElement('afterend', box);
    }
    const list = fptGetAttachments(textarea);
    box.innerHTML = '';
    list.forEach((att) => {
        const order = fptGetSendOrder(textarea);
        const chip = document.createElement('div');
        chip.className = 'fpt-attachment-chip';
        chip.title = 'Нажмите, чтобы выбрать порядок отправки';
        // Whole chip is clickable → opens the icon-only order picker. The view/remove
        // buttons stop propagation so they still work independently.
        chip.innerHTML = `
            <span class="material-symbols-rounded fpt-att-ic">image</span>
            <span class="fpt-att-label">Прикреплённое изображение</span>
            <span class="fpt-order-mini" aria-hidden="true">${fptOrderIconsHtml(order)}</span>
            <span class="material-symbols-rounded fpt-att-hint">tune</span>
            <button type="button" class="fpt-att-view" title="Посмотреть"><span class="material-symbols-rounded">visibility</span></button>
            <button type="button" class="fpt-att-remove" title="Убрать"><span class="material-symbols-rounded">close</span></button>
        `;
        // click anywhere on the chip (except the action buttons) → order picker
        chip.addEventListener('click', (e) => {
            if (e.target.closest('.fpt-att-view') || e.target.closest('.fpt-att-remove')) return;
            e.preventDefault();
            fptShowOrderPopup(chip, fptGetSendOrder(textarea), (newOrder) => {
                fptSetSendOrder(textarea, newOrder);
                fptRenderAttachments(textarea);
                textarea.dispatchEvent(new CustomEvent('fpt-attachment-changed', { bubbles: true }));
            });
        });
        chip.querySelector('.fpt-att-view').addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            fptShowImagePreview(att.dataUrl);
        });
        chip.querySelector('.fpt-att-remove').addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            const arr = fptGetAttachments(textarea).filter(a => a.id !== att.id);
            if (arr.length) __fptAttachments.set(textarea, arr); else __fptAttachments.delete(textarea);
            fptRenderAttachments(textarea);
            // also persist on the element dataset so senders can read it
            textarea.dataset.fptImages = JSON.stringify(fptGetAttachments(textarea).map(a => a.dataUrl));
            textarea.dispatchEvent(new CustomEvent('fpt-attachment-changed', { bubbles: true }));
        });
        box.appendChild(chip);
    });
}

function fptShowImagePreview(dataUrl) {
    const overlay = document.createElement('div');
    overlay.className = 'fpt-img-preview-overlay';
    overlay.innerHTML = `<div class="fpt-img-preview-inner"><img src="${dataUrl}" alt="preview"><button type="button" class="fpt-img-preview-close"><span class="material-symbols-rounded">close</span></button></div>`;
    const close = () => { if (overlay.parentNode) overlay.parentNode.removeChild(overlay); };
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
    overlay.querySelector('.fpt-img-preview-close').addEventListener('click', close);
    document.body.appendChild(overlay);
}

let __fptImagePickerOpen = false;
function handleImageAddClick(targetTextarea) {
    if (__fptImagePickerOpen) return;
    __fptImagePickerOpen = true;

    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'image/png, image/jpeg, image/gif, image/webp';
    fileInput.style.display = 'none';

    const cleanup = () => {
        __fptImagePickerOpen = false;
        if (fileInput.parentNode) fileInput.parentNode.removeChild(fileInput);
    };
    fileInput.addEventListener('cancel', cleanup, { once: true });

    fileInput.addEventListener('change', (event) => {
        const file = event.target.files && event.target.files[0];
        if (!file) { cleanup(); return; }
        if (file.size > 1 * 1024 * 1024) {
            showNotification('Файл слишком большой. Выберите изображение до 1 МБ.', true);
            cleanup();
            return;
        }
        const reader = new FileReader();
        reader.onload = (e) => {
            const dataUrl = e.target.result;
            const id = Math.random().toString(36).slice(2, 8);
            const arr = fptGetAttachments(targetTextarea);
            arr.push({ id, dataUrl });
            __fptAttachments.set(targetTextarea, arr);
            // store on the element so the sender can pick them up (separate from text value)
            targetTextarea.dataset.fptImages = JSON.stringify(arr.map(a => a.dataUrl));
            fptRenderAttachments(targetTextarea);
            // Trigger autosave ONCE via a non-bubbling custom event (avoids re-render loops /
            // flicker that a bubbling 'input' caused on the whole popup).
            targetTextarea.dispatchEvent(new CustomEvent('fpt-attachment-changed', { bubbles: true }));
            if (typeof showNotification === 'function') showNotification('Картинка прикреплена.');
            cleanup();
        };
        reader.onerror = () => { showNotification('Не удалось прочитать файл.', true); cleanup(); };
        reader.readAsDataURL(file);
    }, { once: true });

    document.body.appendChild(fileInput);
    fileInput.click();
}

// ════════════════════════════════════════════════════════════════════════════
// 3.0: ОБЩИЙ ДВИЖОК ТЕМЫ (парсинг цветов со страницы)
// Многие наши окна (системные уведомления, глобальный импорт, аналитика рынка,
// статистика продаж и т.д.) раньше были захардкожены под тёмно-фиолетовую палитру
// и «шакалили» на светлой/кастомной теме FunPay. Этот движок ОДИН РАЗ парсит реальные
// цвета страницы и выставляет CSS-переменные --fpt-* на :root. Фичи ссылаются на эти
// переменные вместо фиксированных цветов — и автоматически совпадают с любой темой.
// ════════════════════════════════════════════════════════════════════════════

// rgb(a) / hex → [r,g,b,a]
function fptParseRGB(str) {
    if (!str) return null;
    str = String(str).trim();
    let m = str.match(/rgba?\(([^)]+)\)/i);
    if (m) {
        const p = m[1].split(',').map(s => parseFloat(s.trim()));
        return [p[0] || 0, p[1] || 0, p[2] || 0, p[3] == null ? 1 : p[3]];
    }
    m = str.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
    if (m) {
        let h = m[1];
        if (h.length === 3) h = h.split('').map(c => c + c).join('');
        return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16), 1];
    }
    return null;
}
function fptRgbStr(rgb, a) { return `rgba(${Math.round(rgb[0])}, ${Math.round(rgb[1])}, ${Math.round(rgb[2])}, ${a == null ? (rgb[3] == null ? 1 : rgb[3]) : a})`; }
function fptLuma(rgb) { return (0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]) / 255; }
// смешать цвет к белому/чёрному на долю t (0..1)
function fptMix(rgb, toward, t) {
    const tgt = toward === 'white' ? [255, 255, 255] : [0, 0, 0];
    return [rgb[0] + (tgt[0] - rgb[0]) * t, rgb[1] + (tgt[1] - rgb[1]) * t, rgb[2] + (tgt[2] - rgb[2]) * t, 1];
}

// Находит ближайший НЕпрозрачный фон. Идём по широкому списку реальных контейнеров
// FunPay и поднимаемся к <html>. Если у элемента фон прозрачный - берём вычисленный
// фон через родителей. Это критично: на белой теме фон часто покрашен на .content/html,
// а не на body, и раньше детект ошибочно считал тему тёмной.
function fptResolveBg() {
    const sel = [
        '.content-with-cd-wide', '.content-with-cd', '.content',
        '.page-content', '.chat-contacts', '.chat',
        'main', '#content', '.container'
    ];
    const candidates = [];
    for (const s of sel) { const el = document.querySelector(s); if (el) candidates.push(el); }
    candidates.push(document.body, document.documentElement);

    for (const start of candidates) {
        let el = start;
        // поднимаемся по дереву, пока не найдём непрозрачный фон
        for (let i = 0; el && i < 12; i++, el = el.parentElement) {
            const rgb = fptParseRGB(getComputedStyle(el).backgroundColor);
            if (rgb && rgb[3] > 0.2) return rgb;
        }
    }
    // последний шанс - фон html/body даже если бледный
    const bodyBg = fptParseRGB(getComputedStyle(document.body).backgroundColor);
    if (bodyBg && bodyBg[3] > 0) return bodyBg;
    return [255, 255, 255, 1]; // дефолт - СВЕТЛЫЙ (белая тема FunPay по умолчанию)
}

// Главная функция: парсит палитру и возвращает набор производных цветов.
function fptComputePalette() {
    const bg = fptResolveBg();
    const textRaw = fptParseRGB(getComputedStyle(document.body).color) || [224, 224, 224, 1];
    const dark = fptLuma(bg) < 0.5; // тёмная тема?

    // поверхности: чуть светлее (на тёмной) или чуть темнее (на светлой) основного фона
    const surface  = fptMix(bg, dark ? 'white' : 'black', dark ? 0.05 : 0.03);
    const surface2 = fptMix(bg, dark ? 'white' : 'black', dark ? 0.10 : 0.06);
    const border   = fptMix(bg, dark ? 'white' : 'black', dark ? 0.16 : 0.12);
    const hover    = fptMix(bg, dark ? 'white' : 'black', dark ? 0.14 : 0.08);
    const text     = textRaw;
    const textMuted = dark ? fptMix(textRaw, 'black', 0.35) : fptMix(textRaw, 'white', 0.35);
    // акцент берём фирменный фанпеевский, но это можно переопределить
    const accent = [193, 38, 211, 1]; // #C026D3 — но используем умеренно

    return {
        dark,
        bg:        fptRgbStr(bg),
        surface:   fptRgbStr(surface),
        surface2:  fptRgbStr(surface2),
        border:    fptRgbStr(border),
        hover:     fptRgbStr(hover),
        text:      fptRgbStr(text),
        textMuted: fptRgbStr(textMuted),
        accent:    fptRgbStr(accent),
        accentSoft: fptRgbStr(accent, dark ? 0.18 : 0.12),
        shadow:    dark ? 'rgba(0,0,0,0.5)' : 'rgba(0,0,0,0.18)'
    };
}

// Выставляет CSS-переменные --fpt-* на :root.
function fptApplyThemeVars() {
    try {
        const p = fptComputePalette();
        const r = document.documentElement.style;
        r.setProperty('--fpt-bg',         p.bg);
        r.setProperty('--fpt-surface',    p.surface);
        r.setProperty('--fpt-surface-2',  p.surface2);
        r.setProperty('--fpt-border',     p.border);
        r.setProperty('--fpt-hover',      p.hover);
        r.setProperty('--fpt-text',       p.text);
        r.setProperty('--fpt-text-muted', p.textMuted);
        r.setProperty('--fpt-accent',     p.accent);
        r.setProperty('--fpt-accent-soft',p.accentSoft);
        r.setProperty('--fpt-shadow',     p.shadow);
        document.documentElement.classList.toggle('fpt-theme-dark', p.dark);
        document.documentElement.classList.toggle('fpt-theme-light', !p.dark);
    } catch (e) { /* noop */ }
}

// Инициализация + реакция на смену темы (FunPay-тема, наша кастомная тема, смена страницы).
let __fptThemeInited = false;
function fptInitThemeEngine() {
    if (__fptThemeInited) return;
    __fptThemeInited = true;
    fptApplyThemeVars();
    // повтор после полной загрузки (на случай если фон применяется позже)
    if (document.readyState !== 'complete') {
        window.addEventListener('load', fptApplyThemeVars, { once: true });
    }
    // следим за сменой темы: класс/стиль на <html>/<body>
    try {
        const mo = new MutationObserver(() => {
            clearTimeout(window.__fptThemeT);
            window.__fptThemeT = setTimeout(fptApplyThemeVars, 80);
        });
        mo.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'style'] });
        mo.observe(document.body, { attributes: true, attributeFilter: ['class', 'style'] });
    } catch (_) {}
}

// запуск как можно раньше
if (document.body) fptInitThemeEngine();
else document.addEventListener('DOMContentLoaded', fptInitThemeEngine, { once: true });
