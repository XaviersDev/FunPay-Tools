// content/features/magicstick.js

class MagicStickStyler {
    constructor() {
        this.isActive = false;
        this.hoveredEl = null;
        this.selectedEl = null;
        this.activeSelector = null;
        this.isClickThroughActive = false;
        this.savedStyles = {}; // { 'selector': { 'property': 'value' } }

        this.ui = {
            highlightEl: null,
            panelEl: null,
            exitBtn: null,
            myStylesModal: null,
            selectorModal: null,
            dynamicStyleTag: null,
            persistentStyleTag: null
        };

        this.bound = {
            handleMouseMove: this.handleMouseMove.bind(this),
            handleClick: this.handleClick.bind(this),
            handleKeyDown: this.handleKeyDown.bind(this)
        };

        this.throttledMouseMove = this.throttle(this.bound.handleMouseMove, 50);
    }

    async init() {
        await this.loadStyles();
        this.createUI();
        this.injectPersistentStyles();

        const magicStickBtn = document.getElementById('enableMagicStickBtn');
        if (magicStickBtn) {
            magicStickBtn.addEventListener('click', () => {
                this.toggle();
                const popup = document.querySelector('.fp-tools-popup');
                if (popup) popup.classList.remove('active');
            });
        }
        
        if (sessionStorage.getItem('fpToolsMagicStickActive') === 'true') {
            this.activate();
        }
    }

    toggle() {
        this.isActive ? this.deactivate() : this.activate();
    }

    activate() {
        this.isActive = true;
        document.body.classList.add('fp-tools-magic-stick-active');
        this.ui.exitBtn.style.display = 'flex';
        document.addEventListener('mousemove', this.throttledMouseMove);
        document.addEventListener('click', this.bound.handleClick, true);
        document.addEventListener('keydown', this.bound.handleKeyDown);
    }

    deactivate() {
        this.isActive = false;
        sessionStorage.removeItem('fpToolsMagicStickActive');
        document.body.classList.remove('fp-tools-magic-stick-active');
        this.ui.highlightEl.style.display = 'none';
        this.ui.panelEl.style.display = 'none';
        this.ui.exitBtn.style.display = 'none';
        this.ui.myStylesModal.style.display = 'none';
        this.ui.selectorModal.style.display = 'none';
        document.removeEventListener('mousemove', this.throttledMouseMove);
        document.removeEventListener('click', this.bound.handleClick, true);
        document.removeEventListener('keydown', this.bound.handleKeyDown);
        this.selectedEl = null;
        this.activeSelector = null;
    }

    handleKeyDown(e) {
        if (e.key === 'Escape') {
            this.deactivate();
        }
    }

    handleMouseMove(e) {
        if (!this.isActive || this.isClickThroughActive) return;
        const target = e.target;
        if (this.isStylerUI(target) || !target) {
            this.ui.highlightEl.style.display = 'none';
            return;
        }

        this.hoveredEl = target;
        const rect = target.getBoundingClientRect();
        Object.assign(this.ui.highlightEl.style, {
            display: 'block',
            width: `${rect.width}px`,
            height: `${rect.height}px`,
            top: `${rect.top}px`,
            left: `${rect.left}px`
        });
    }

    handleClick(e) {
        if (!this.isActive || this.isStylerUI(e.target)) return;

        if (this.isClickThroughActive) {
            sessionStorage.setItem('fpToolsMagicStickActive', 'true');
            this.isClickThroughActive = false;
            document.getElementById('ms-continue-click-btn').classList.remove('active');
            return;
        }

        e.preventDefault();
        e.stopPropagation();

        this.selectedEl = e.target;
        const selectors = this.generateSelectors(this.selectedEl);
        this.showSelectorModal(selectors);
    }

    showPanel() {
        this.ui.panelEl.style.display = 'flex';
        this.updatePanelValues();
    }

    updatePanelValues() {
        if (!this.selectedEl) return;
        const computed = window.getComputedStyle(this.selectedEl);
        const selector = this.activeSelector;
        const hoverSelector = selector + ':hover';

        const getCleanValue = (prop, unit = 'px') => {
            let val = computed.getPropertyValue(prop);
            if (unit) val = val.replace(unit, '');
            return parseFloat(val) || 0;
        };
        
        document.getElementById('ms-selected-element-name').textContent = selector || this.getElementDisplayName(this.selectedEl);
        document.getElementById('ms-color').value = this.rgbToHex(computed.color);
        document.getElementById('ms-font-size').value = getCleanValue('font-size');
        document.getElementById('ms-opacity').value = getCleanValue('opacity', '');
        document.getElementById('ms-border-radius').value = getCleanValue('border-radius');
        
        const bgColor = this.rgbToHex(computed.backgroundColor, true);
        document.getElementById('ms-bg-color').value = bgColor.hex;
        document.getElementById('ms-bg-opacity').value = bgColor.alpha;

        const hoverStyles = this.savedStyles[hoverSelector] || {};
        const underlineBtn = document.getElementById('ms-hover-underline');
        underlineBtn.classList.toggle('active', hoverStyles['text-decoration'] === 'underline');
        document.getElementById('ms-hover-color').value = hoverStyles['color'] || '#ffffff';
        document.getElementById('ms-hover-scale').value = parseFloat(hoverStyles['transform']?.replace('scale(', '')) || 1;
    }

    applyStyle(property, value, unit = '') {
        if (!this.activeSelector) return;
        const selector = this.activeSelector;
        
        if (!this.savedStyles[selector]) {
            this.savedStyles[selector] = {};
        }
        
        this.savedStyles[selector][property] = `${value}${unit}`;
        this.updateDynamicStyles();
    }
    
    // Применяет transition для плавности
    applyTransition(property) {
        if (!this.activeSelector) return;
        const selector = this.activeSelector;
        
        if (!this.savedStyles[selector]) {
            this.savedStyles[selector] = {};
        }

        let existingTransition = this.savedStyles[selector]['transition'] || '';
        let transitions = existingTransition.split(',').map(s => s.trim()).filter(Boolean);
        
        // Удаляем старый transition для этого свойства, если он есть
        transitions = transitions.filter(t => !t.startsWith(property));
        
        // Добавляем новый
        transitions.push(`${property} 0.2s ease`);
        
        this.savedStyles[selector]['transition'] = transitions.join(', ');
        this.updateDynamicStyles();
    }
    
    applyHoverStyle(property, value, unit = '') {
        if (!this.activeSelector) return;
        const hoverSelector = this.activeSelector + ':hover';

        if (!this.savedStyles[hoverSelector]) {
            this.savedStyles[hoverSelector] = {};
        }

        if (value === null || value === '') {
             delete this.savedStyles[hoverSelector][property];
             if (Object.keys(this.savedStyles[hoverSelector]).length === 0) {
                delete this.savedStyles[hoverSelector];
             }
        } else {
            this.savedStyles[hoverSelector][property] = `${value}${unit}`;
            // Добавляем плавность для этого свойства
            this.applyTransition(property);
        }

        this.updateDynamicStyles();
    }
    
    resetStyle(property) {
        if (!this.activeSelector) return;
        const selector = this.activeSelector;
        
        if (this.savedStyles[selector] && this.savedStyles[selector][property]) {
            delete this.savedStyles[selector][property];
            if (Object.keys(this.savedStyles[selector]).length === 0) {
                delete this.savedStyles[selector];
            }
            this.updateDynamicStyles();
            this.updatePanelValues();
        }
    }
    
    updateDynamicStyles() {
        let cssText = '';
        for (const selector in this.savedStyles) {
            cssText += `${selector} {\n`;
            for (const prop in this.savedStyles[selector]) {
                cssText += `  ${prop}: ${this.savedStyles[selector][prop]} !important;\n`;
            }
            cssText += '}\n';
        }
        this.ui.dynamicStyleTag.textContent = cssText;
    }

    injectPersistentStyles() {
        let cssText = '';
        for (const selector in this.savedStyles) {
            cssText += `${selector} {\n`;
            for (const prop in this.savedStyles[selector]) {
                cssText += `  ${prop}: ${this.savedStyles[selector][prop]} !important;\n`;
            }
            cssText += '}\n';
        }
        this.ui.persistentStyleTag.textContent = cssText;
    }

    async saveStylesToStorage() {
        await chrome.storage.local.set({ fpToolsLiveStyles: this.savedStyles });
        this.injectPersistentStyles();
        showNotification('Стили сохранены!', false);
    }
    
    async loadStyles() {
        const data = await chrome.storage.local.get('fpToolsLiveStyles');
        this.savedStyles = data.fpToolsLiveStyles || {};
    }
    
    showMyStyles() {
        const list = this.ui.myStylesModal.querySelector('.ms-styles-list');
        list.innerHTML = '';
        
        if (Object.keys(this.savedStyles).length === 0) {
            list.innerHTML = '<div class="ms-styles-empty">Нет сохраненных стилей.</div>';
        } else {
            for (const selector in this.savedStyles) {
                const item = createElement('div', { class: 'ms-style-item' });
                let propsHTML = '';
                for (const prop in this.savedStyles[selector]) {
                    propsHTML += `<div><code>${prop}:</code> ${this.savedStyles[selector][prop]}</div>`;
                }
                
                item.innerHTML = `
                    <div class="ms-style-selector">${selector}</div>
                    <div class="ms-style-props">${propsHTML}</div>
                    <button class="ms-style-delete-btn" data-selector="${encodeURIComponent(selector)}">&times;</button>
                `;
                list.appendChild(item);
            }
        }
        this.ui.myStylesModal.style.display = 'flex';
    }
    
    deleteStyle(selector) {
        delete this.savedStyles[selector];
        delete this.savedStyles[selector + ':hover'];
        this.updateDynamicStyles();
        this.saveStylesToStorage();
        this.showMyStyles();
    }

    getElementDisplayName(el) {
        if (!el) return '...';
        let name = el.tagName.toUpperCase();
        if (el.id) {
            name += `#${el.id}`;
        }
        if (el.className && typeof el.className === 'string') {
            const cleanClasses = el.className.trim().split(' ').filter(Boolean).join('.');
            if (cleanClasses) name += `.${cleanClasses}`;
        }
        return name;
    }
    
    generateSelectors(element) {
        if (!element) return [];
        const selectors = new Set();
        let el = element;

        const tagName = el.tagName.toLowerCase();
        if (el.id) {
            selectors.add(`#${el.id}`);
        }
        if (el.className && typeof el.className === 'string') {
            const classes = el.className.trim().split(/\s+/).filter(Boolean);
            if (classes.length > 0) {
                selectors.add(`.${classes.join('.')}`);
            }
        }

        let currentSelector = '';
        for (let i = 0; i < 4 && el; i++) {
            const elTag = el.tagName.toLowerCase();
            let simpleSelector = elTag;
            if (el.id) {
                simpleSelector = `#${el.id}`;
            } else if (el.className && typeof el.className === 'string') {
                const classes = el.className.trim().split(/\s+/).filter(Boolean);
                if (classes.length > 0) {
                    simpleSelector = `.${classes.join('.')}`;
                }
            }
            
            currentSelector = currentSelector ? `${simpleSelector} > ${currentSelector}` : simpleSelector;
            if (i > 0) {
                selectors.add(currentSelector);
            }
            
            el = el.parentElement;
            if (!el || el.tagName === 'BODY' || el.tagName === 'HTML') break;
        }

        if (element.className && typeof element.className === 'string') {
            const classes = element.className.trim().split(/\s+/).filter(Boolean);
            classes.forEach(c => selectors.add(`.${c}`));
        }
        
        selectors.add(tagName);

        return Array.from(selectors);
    }

    showSelectorModal(selectors) {
        const list = this.ui.selectorModal.querySelector('.ms-selector-list');
        list.innerHTML = '';
        selectors.forEach(selector => {
            const item = createElement('button', { class: 'ms-selector-option' });
            item.textContent = selector;
            item.addEventListener('click', () => {
                this.activeSelector = selector;
                this.ui.selectorModal.style.display = 'none';
                this.showPanel();
            });
            list.appendChild(item);
        });
        this.ui.selectorModal.style.display = 'flex';
    }

    createUI() {
        const uiHtml = this.getUIHtml();
        const container = document.createElement('div');
        container.innerHTML = uiHtml;
        
        this.ui.highlightEl = container.querySelector('#ms-highlight');
        this.ui.panelEl = container.querySelector('#ms-panel');
        this.ui.exitBtn = container.querySelector('#ms-exit-btn');
        this.ui.myStylesModal = container.querySelector('#ms-my-styles-modal');
        this.ui.selectorModal = container.querySelector('#ms-selector-modal');
        
        this.ui.dynamicStyleTag = document.createElement('style');
        this.ui.dynamicStyleTag.id = 'fp-tools-magic-stick-dynamic-styles';
        document.head.appendChild(this.ui.dynamicStyleTag);
        
        this.ui.persistentStyleTag = document.createElement('style');
        this.ui.persistentStyleTag.id = 'fp-tools-magic-stick-persistent-styles';
        document.head.appendChild(this.ui.persistentStyleTag);
        
        document.body.appendChild(this.ui.highlightEl);
        document.body.appendChild(this.ui.panelEl);
        document.body.appendChild(this.ui.exitBtn);
        document.body.appendChild(this.ui.myStylesModal);
        document.body.appendChild(this.ui.selectorModal);

        this.setupPanelListeners();
    }
    
    setupPanelListeners() {
        this.ui.exitBtn.addEventListener('click', () => this.deactivate());
        document.getElementById('ms-exit-panel-btn').addEventListener('click', () => this.deactivate());
        
        const createHandler = (id, prop, unit = '') => {
            const el = document.getElementById(id);
            el.addEventListener('input', e => this.applyStyle(prop, e.target.value, unit));
            
            const resetBtn = el.closest('.ms-control').querySelector('.ms-reset-btn');
            if(resetBtn) resetBtn.addEventListener('click', () => this.resetStyle(prop));
        };

        createHandler('ms-color', 'color');
        createHandler('ms-font-size', 'font-size', 'px');
        createHandler('ms-opacity', 'opacity', '');
        createHandler('ms-border-radius', 'border-radius', 'px');
        
        const applyBackgroundColor = () => {
            const color = document.getElementById('ms-bg-color').value;
            const opacity = document.getElementById('ms-bg-opacity').value;
            this.applyStyle('background-color', this.hexToRgba(color, opacity));
        };
        document.getElementById('ms-bg-color').addEventListener('input', applyBackgroundColor);
        document.getElementById('ms-bg-opacity').addEventListener('input', applyBackgroundColor);
        document.getElementById('ms-bg-reset').addEventListener('click', () => this.resetStyle('background-color'));
        
        const underlineBtn = document.getElementById('ms-hover-underline');
        underlineBtn.addEventListener('click', () => {
            underlineBtn.classList.toggle('active');
            if (underlineBtn.classList.contains('active')) {
                this.applyHoverStyle('text-decoration', 'underline');
            } else {
                this.applyHoverStyle('text-decoration', 'none');
            }
        });

        document.getElementById('ms-hover-color').addEventListener('input', e => this.applyHoverStyle('color', e.target.value));
        document.getElementById('ms-hover-scale').addEventListener('input', e => {
            const scaleValue = e.target.value;
            if (scaleValue === '1') {
                this.applyHoverStyle('transform', null);
            } else {
                this.applyHoverStyle('transform', `scale(${scaleValue})`);
            }
        });

        document.getElementById('ms-hover-reset').addEventListener('click', () => {
            if (!this.activeSelector) return;
            const hoverSelector = this.activeSelector + ':hover';
            delete this.savedStyles[hoverSelector];
            this.resetStyle('transition'); // Сбрасываем и плавность
            this.updateDynamicStyles();
            this.updatePanelValues(); 
        });

        document.getElementById('ms-continue-click-btn').addEventListener('click', (e) => {
            this.isClickThroughActive = !this.isClickThroughActive;
            e.currentTarget.classList.toggle('active', this.isClickThroughActive);
            if(this.isClickThroughActive) {
                showNotification('Режим нажатия включен. Следующий клик будет обычным.');
                this.ui.highlightEl.style.display = 'none';
            } else {
                showNotification('Режим нажатия выключен.');
            }
        });

        document.getElementById('ms-hide-btn').addEventListener('click', () => {
            if (this.activeSelector) {
                this.applyStyle('display', 'none');
                this.ui.panelEl.style.display = 'none';
                this.ui.highlightEl.style.display = 'none';
            }
        });
        
        document.getElementById('ms-save-btn').addEventListener('click', () => this.saveStylesToStorage());
        
        document.getElementById('ms-my-styles-btn').addEventListener('click', () => this.showMyStyles());
        this.ui.myStylesModal.querySelector('.ms-modal-close').addEventListener('click', () => this.ui.myStylesModal.style.display = 'none');
        this.ui.selectorModal.querySelector('.ms-modal-close').addEventListener('click', () => this.ui.selectorModal.style.display = 'none');
        
        this.ui.myStylesModal.addEventListener('click', e => {
            if (e.target.closest('.ms-style-delete-btn')) {
                const selector = decodeURIComponent(e.target.closest('.ms-style-delete-btn').dataset.selector);
                this.deleteStyle(selector);
            }
        });
    }

    getUIHtml() {
        return `
            <div id="ms-highlight"></div>
            <div id="ms-exit-btn" data-title="Выйти из режима (Esc)">
                <span class="material-icons">close</span>
            </div>
            <div id="ms-panel">
                <div class="ms-panel-section ms-target-info">
                    <div id="ms-selected-element-name">Элемент не выбран</div>
                </div>
                
                <div class="ms-panel-section ms-panel-main-controls">
                    ${this.createControl('ms-color', 'format_color_text', 'Цвет текста', 'color')}
                     <div class="ms-control-group">
                        ${this.createControl('ms-bg-color', 'palette', 'Цвет фона', 'color', {}, 'ms-bg-reset')}
                        ${this.createControl('ms-bg-opacity', 'opacity', 'Прозрачность фона', 'range', {min: 0, max: 1, step: 0.05, value: 1})}
                    </div>
                    ${this.createControl('ms-font-size', 'format_size', 'Размер шрифта', 'range', {min: 8, max: 48, step: 1})}
                    ${this.createControl('ms-border-radius', 'rounded_corner', 'Скругление', 'range', {min: 0, max: 50, step: 1})}
                    ${this.createControl('ms-opacity', 'blur_on', 'Общая прозр.', 'range', {min: 0, max: 1, step: 0.05})}
                </div>
                
                 <div class="ms-panel-section ms-hover-controls">
                    <div class="ms-section-title">
                        <span>Эффекты наведения</span>
                        <button id="ms-hover-reset" class="ms-reset-btn" data-title="Сбросить все эффекты наведения"><span class="material-icons">refresh</span></button>
                    </div>
                    <div class="ms-hover-grid">
                         ${this.createHoverButton('ms-hover-underline', 'format_underlined', 'Подчеркивание')}
                         ${this.createControl('ms-hover-color', 'format_color_text', 'Цвет текста', 'color')}
                         ${this.createControl('ms-hover-scale', 'zoom_in_map', 'Увеличение', 'range', {min:0.8, max: 1.5, step: 0.05, value: 1})}
                    </div>
                </div>

                <div class="ms-panel-section ms-actions">
                    <button id="ms-continue-click-btn" data-title="Продолжить нажатие"><span class="material-icons">ads_click</span></button>
                    <button id="ms-hide-btn" data-title="Скрыть элемент"><span class="material-icons">visibility_off</span></button>
                    <button id="ms-save-btn" data-title="Сохранить стили"><span class="material-icons">save</span></button>
                    <button id="ms-my-styles-btn" data-title="Мои стили"><span class="material-icons">style</span></button>
                    <button id="ms-exit-panel-btn" data-title="Выйти из режима"><span class="material-icons">logout</span></button>
                </div>
            </div>
            <div id="ms-selector-modal">
                <div class="ms-modal-content">
                    <div class="ms-modal-header">
                        <h3>Выберите селектор для стилизации</h3>
                        <button class="ms-modal-close">&times;</button>
                    </div>
                    <div class="ms-selector-list"></div>
                </div>
            </div>
            <div id="ms-my-styles-modal">
                <div class="ms-modal-content">
                    <div class="ms-modal-header">
                        <h3>Мои стили</h3>
                        <button class="ms-modal-close">&times;</button>
                    </div>
                    <div class="ms-styles-list"></div>
                </div>
            </div>
        `;
    }

    createControl(id, icon, title, type, attrs = {}, resetId = null) {
        const attrString = Object.entries(attrs).map(([key, val]) => `${key}="${val}"`).join(' ');
        const resetButton = resetId ? `<button id="${resetId}" class="ms-reset-btn" data-title="Сбросить"><span class="material-icons">refresh</span></button>` : '';
        return `
            <div class="ms-control" data-title="${title}">
                <span class="material-icons">${icon}</span>
                <input type="${type}" id="${id}" ${attrString}>
                ${resetButton || ''}
            </div>
        `;
    }

    createHoverButton(id, icon, title) {
        return `
            <div class="ms-control" data-title="${title}">
                <span class="material-icons">${icon}</span>
                <button id="${id}" class="ms-toggle-btn"></button>
            </div>
        `
    }
    
    isStylerUI(el) {
        return el.closest('#ms-panel, #ms-exit-btn, #ms-my-styles-modal, #ms-selector-modal');
    }

    throttle(func, limit) {
        let inThrottle;
        return function() {
            const args = arguments;
            const context = this;
            if (!inThrottle) {
                func.apply(context, args);
                inThrottle = true;
                setTimeout(() => inThrottle = false, limit);
            }
        };
    }

    rgbToHex(rgb, returnAlpha = false) {
        if (!rgb || !rgb.startsWith('rgb')) {
            return returnAlpha ? { hex: '#000000', alpha: 0 } : '#000000';
        }
        let parts = rgb.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)$/);
        if (!parts) {
            return returnAlpha ? { hex: '#000000', alpha: 1 } : '#000000';
        }
        
        let r = parseInt(parts[1], 10);
        let g = parseInt(parts[2], 10);
        let b = parseInt(parts[3], 10);
        let a = parts[4] !== undefined ? parseFloat(parts[4]) : 1;

        if (a === 0 && returnAlpha) {
            return { hex: '#000000', alpha: 0 };
        }
        
        const hex = "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1).padStart(6, '0');
        
        return returnAlpha ? { hex: hex, alpha: a } : hex;
    }

    hexToRgba(hex, alpha) {
        let r = 0, g = 0, b = 0;
        if (hex.length == 4) {
            r = "0x" + hex[1] + hex[1]; g = "0x" + hex[2] + hex[2]; b = "0x" + hex[3] + hex[3];
        } else if (hex.length == 7) {
            r = "0x" + hex[1] + hex[2]; g = "0x" + hex[3] + hex[4]; b = "0x" + hex[5] + hex[6];
        }
        return `rgba(${+r},${+g},${+b},${alpha})`;
    }
}

function initializeMagicStickStyler() {
    if (!window.fpToolsMagicStickInstance) {
        window.fpToolsMagicStickInstance = new MagicStickStyler();
        window.fpToolsMagicStickInstance.init();
    }
}