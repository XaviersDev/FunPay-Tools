// content/ui/header_button_styler.js

const BUTTON_STYLE_ID = 'fp-tools-header-button-styles';
const STORAGE_KEY = 'fpToolsHeaderButtonStyles';
let stylerDebounceTimer;

// --- Helper Functions for Color Manipulation ---
function hexToHsl(H) {
    let r = 0, g = 0, b = 0;
    if (H.length == 4) {
        r = "0x" + H[1] + H[1]; g = "0x" + H[2] + H[2]; b = "0x" + H[3] + H[3];
    } else if (H.length == 7) {
        r = "0x" + H[1] + H[2]; g = "0x" + H[3] + H[4]; b = "0x" + H[5] + H[6];
    }
    r /= 255; g /= 255; b /= 255;
    let cmin = Math.min(r,g,b), cmax = Math.max(r,g,b), delta = cmax - cmin, h = 0, s = 0, l = 0;
    if (delta == 0) h = 0;
    else if (cmax == r) h = ((g - b) / delta) % 6;
    else if (cmax == g) h = (b - r) / delta + 2;
    else h = (r - g) / delta + 4;
    h = Math.round(h * 60);
    if (h < 0) h += 360;
    l = (cmax + cmin) / 2;
    s = delta == 0 ? 0 : delta / (1 - Math.abs(2 * l - 1));
    s = +(s * 100).toFixed(1);
    l = +(l * 100).toFixed(1);
    return [h, s, l];
}

function hslToHex(h, s, l) {
    s /= 100; l /= 100;
    let c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs((h / 60) % 2 - 1)), m = l - c/2, r = 0, g = 0, b = 0;
    if (0 <= h && h < 60) { r = c; g = x; b = 0; } 
    else if (60 <= h && h < 120) { r = x; g = c; b = 0; } 
    else if (120 <= h && h < 180) { r = 0; g = c; b = x; } 
    else if (180 <= h && h < 240) { r = 0; g = x; b = c; } 
    else if (240 <= h && h < 300) { r = x; g = 0; b = c; } 
    else if (300 <= h && h < 360) { r = 0; g = 0; b = c; }
    r = Math.round((r + m) * 255).toString(16);
    g = Math.round((g + m) * 255).toString(16);
    b = Math.round((b + m) * 255).toString(16);
    if (r.length == 1) r = "0" + r;
    if (g.length == 1) g = "0" + g;
    if (b.length == 1) b = "0" + b;
    return "#" + r + g + b;
}

// --- Core Logic ---

async function saveButtonStyles(settings) {
    await chrome.storage.local.set({ [STORAGE_KEY]: settings });
}

async function loadAndApplyButtonStyles() {
    const data = await chrome.storage.local.get(STORAGE_KEY);
    const defaults = { color: '#6B66FF', size: 14, opacity: 100 };
    const settings = { ...defaults, ...(data[STORAGE_KEY] || {}) };
    applyButtonStyles(settings);
}

function applyButtonStyles(settings) {
    let styleTag = document.getElementById(BUTTON_STYLE_ID);
    if (!styleTag) {
        styleTag = document.createElement('style');
        styleTag.id = BUTTON_STYLE_ID;
        document.head.appendChild(styleTag);
    }

    const [h, s, l] = hexToHsl(settings.color);
    const colorStart = hslToHex(h, s, l);
    const colorEnd = hslToHex((h + 40) % 360, Math.min(100, s + 10), Math.min(100, l + 5));

    // ИСПРАВЛЕНИЕ: Добавлены `background-clip`, `-webkit-background-clip` и `color: transparent`
    styleTag.textContent = `
        #fpToolsButton {
            background: linear-gradient(45deg, ${colorStart}, ${colorEnd});
            -webkit-background-clip: text;
            background-clip: text;
            color: transparent;
            font-size: ${settings.size}px !important;
            opacity: ${settings.opacity / 100};
        }
        #fpToolsButton::before {
            background: linear-gradient(90deg, ${colorStart}, ${colorEnd});
        }
    `;

    // Update styler UI if it exists
    const styler = document.getElementById('fp-tools-button-styler');
    if (styler) {
        styler.querySelector('#styler-color').value = settings.color;
        styler.querySelector('#styler-size').value = settings.size;
        styler.querySelector('#styler-size-value').textContent = `${settings.size}px`;
        styler.querySelector('#styler-opacity').value = settings.opacity;
        styler.querySelector('#styler-opacity-value').textContent = `${settings.opacity}%`;
    }
}

function createButtonStyler() {
    if (document.getElementById('fp-tools-button-styler')) return;

    const styler = createElement('div', { id: 'fp-tools-button-styler' });
    styler.innerHTML = `
        <div class="fp-tools-styler-header">
            <h4>Настройка кнопки</h4>
            <button class="close-btn">&times;</button>
        </div>
        <div class="styler-control">
            <label for="styler-color">Основной цвет</label>
            <input type="color" id="styler-color">
        </div>
        <div class="styler-control">
            <label for="styler-size">Размер шрифта: <span id="styler-size-value">14px</span></label>
            <input type="range" id="styler-size" min="12" max="24" step="1">
        </div>
        <div class="styler-control">
            <label for="styler-opacity">Прозрачность: <span id="styler-opacity-value">100%</span></label>
            <input type="range" id="styler-opacity" min="20" max="100" step="5">
        </div>
    `;
    document.body.appendChild(styler);

    styler.querySelector('.close-btn').addEventListener('click', () => {
        styler.style.display = 'none';
    });
    
    document.addEventListener('click', (e) => {
        if (styler.style.display === 'block' && !styler.contains(e.target) && e.target.id !== 'fpToolsButton') {
             styler.style.display = 'none';
        }
    });

    styler.addEventListener('input', (e) => {
        const settings = {
            color: document.getElementById('styler-color').value,
            size: document.getElementById('styler-size').value,
            opacity: document.getElementById('styler-opacity').value,
        };
        applyButtonStyles(settings);
        
        clearTimeout(stylerDebounceTimer);
        stylerDebounceTimer = setTimeout(() => saveButtonStyles(settings), 300);
    });
}

function showButtonStyler(x, y) {
    const styler = document.getElementById('fp-tools-button-styler');
    if (!styler) return;
    
    styler.style.display = 'block';

    const rect = styler.getBoundingClientRect();
    let top = y + 15;
    let left = x - (rect.width / 2);

    if (left < 10) left = 10;
    if (left + rect.width > window.innerWidth - 10) left = window.innerWidth - 10 - rect.width;
    if (top + rect.height > window.innerHeight - 10) top = y - rect.height - 15;
    
    styler.style.top = `${top}px`;
    styler.style.left = `${left}px`;
}

function showHeaderButtonTooltip(buttonElement) {
    let tooltip = document.getElementById('fp-tools-header-button-tooltip');
    if (!tooltip) {
        tooltip = createElement('div', { id: 'fp-tools-header-button-tooltip' });
        // ИСПРАВЛЕНИЕ: Убрана лишняя скобка
        tooltip.textContent = "Нажми ПКМ для настройки значка";
        document.body.appendChild(tooltip);
    }
    
    const rect = buttonElement.getBoundingClientRect();
    // ИСПРАВЛЕНИЕ: Вместо `display` используем `visibility`, чтобы размеры элемента были доступны сразу
    tooltip.style.visibility = 'visible';
    tooltip.style.left = `${rect.left + rect.width / 2 - tooltip.offsetWidth / 2}px`;
    tooltip.style.top = `${rect.top - tooltip.offsetHeight - 8}px`;
    
    requestAnimationFrame(() => {
        tooltip.style.opacity = '1';
    });
}

function hideHeaderButtonTooltip() {
    const tooltip = document.getElementById('fp-tools-header-button-tooltip');
    if (tooltip) {
        tooltip.style.opacity = '0';
        // ИСПРАВЛЕНИЕ: Прячем элемент после завершения анимации
        tooltip.style.visibility = 'hidden';
    }
}

function initializeHeaderButtonStyler() {
    createButtonStyler();
    loadAndApplyButtonStyles();
}
