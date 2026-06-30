function initializeCalculatorLogic() {
    const calculator = document.querySelector('.calculator-container');
    if (!calculator || calculator.dataset.initialized) return;

    const display = calculator.querySelector('#calcDisplay');
    const keys = calculator.querySelector('.calculator-buttons');
    const operatorKeys = keys.querySelectorAll('[data-action="add"], [data-action="subtract"], [data-action="multiply"], [data-action="divide"]');

    const operatorSymbols = {
        add: '+',
        subtract: '−',
        multiply: '×',
        divide: '÷',
    };
    
    const state = {
        displayValue: '0',
        firstOperand: null,
        operator: null,
        waitingForSecondOperand: false,
    };

    // 3.0 FIX: при огромных числах дисплей раньше скроллился/обрезался - теперь
    // шрифт автоматически уменьшается по ширине (строка одна, высота фиксирована).
    const groupSep = /\B(?=(\d{3})+(?!\d))/g;
    let lastShown = null;
    function fitFont() {
        const box = display;
        let size = 64;
        box.style.fontSize = size + 'px';
        // уменьшаем, пока строка не влезет по ширине; обычно 0-3 итерации
        let guard = 0;
        while (box.scrollWidth > box.clientWidth && size > 14 && guard < 40) {
            size -= (size > 30 ? 4 : 2);
            box.style.fontSize = size + 'px';
            guard++;
        }
    }

    function updateDisplay() {
        const firstOperandFormatted = state.firstOperand !== null
            ? String(state.firstOperand).replace(groupSep, ' ')
            : '';
        const displayValueFormatted = state.displayValue.replace(groupSep, ' ');

        let textToShow;
        if (state.operator && !state.waitingForSecondOperand) {
            textToShow = `${firstOperandFormatted} ${operatorSymbols[state.operator]} ${displayValueFormatted}`;
        } else if (state.operator && state.waitingForSecondOperand) {
            textToShow = `${firstOperandFormatted} ${operatorSymbols[state.operator]}`;
        } else {
            textToShow = displayValueFormatted;
        }
        if (textToShow === lastShown) return; // ничего не изменилось - не трогаем DOM
        lastShown = textToShow;
        display.textContent = textToShow;
        fitFont();
    }

    function resetCalculator() {
        state.displayValue = '0';
        state.firstOperand = null;
        state.operator = null;
        state.waitingForSecondOperand = false;
        operatorKeys.forEach(key => key.classList.remove('is-depressed'));
        updateDisplay();
    }

    function inputDigit(digit) {
        if (state.waitingForSecondOperand) {
            state.displayValue = digit;
            state.waitingForSecondOperand = false;
        } else {
            state.displayValue = state.displayValue === '0' ? digit : state.displayValue + digit;
        }
    }

    function inputDecimal() {
        if (state.waitingForSecondOperand) {
            state.displayValue = '0.';
            state.waitingForSecondOperand = false;
            return;
        }
        if (!state.displayValue.includes('.')) {
            state.displayValue += '.';
        }
    }

    function handleOperator(nextOperator) {
        const inputValue = parseFloat(state.displayValue);

        if (state.operator && !state.waitingForSecondOperand) {
            const result = calculate(state.firstOperand, inputValue, state.operator);
            state.displayValue = fmtResult(result);
            state.firstOperand = result;
        } else {
            state.firstOperand = inputValue;
        }

        state.waitingForSecondOperand = true;
        state.operator = nextOperator;
    }

    function calculate(first, second, op) {
        if (op === 'add') return first + second;
        if (op === 'subtract') return first - second;
        if (op === 'multiply') return first * second;
        if (op === 'divide') return first / second;
        return second;
    }

    // 3.0: безопасно превращает результат в строку. Очень большие/маленькие числа
    // (которые раньше ломали дисплей) показываем в компактном виде, без мусорных нулей.
    function fmtResult(num) {
        if (!isFinite(num)) return 'Ошибка';
        const abs = Math.abs(num);
        if (abs !== 0 && (abs >= 1e15 || abs < 1e-7)) {
            return num.toExponential(6).replace(/\.?0+e/, 'e');
        }
        return `${parseFloat(num.toFixed(7))}`;
    }

    keys.addEventListener('click', (event) => {
        const { target } = event;
        if (!target.matches('button')) return;

        if (target.dataset.key) {
            inputDigit(target.dataset.key);
            updateDisplay();
            return;
        }
        if (target.dataset.action === 'decimal') {
            inputDecimal();
            updateDisplay();
            return;
        }
        if (target.dataset.action === 'clear') {
            resetCalculator();
            return;
        }

        if (target.dataset.action === 'add' || target.dataset.action === 'subtract' || target.dataset.action === 'multiply' || target.dataset.action === 'divide') {
            handleOperator(target.dataset.action);
            operatorKeys.forEach(key => key.classList.remove('is-depressed'));
            target.classList.add('is-depressed');
            updateDisplay();
            return;
        }

        if (target.dataset.action === 'calculate') {
            if (state.operator && !state.waitingForSecondOperand) {
                const result = calculate(state.firstOperand, parseFloat(state.displayValue), state.operator);
                state.displayValue = fmtResult(result);
                state.firstOperand = null;
                state.operator = null;
                state.waitingForSecondOperand = true;
                operatorKeys.forEach(key => key.classList.remove('is-depressed'));
                updateDisplay();
            }
            return;
        }
        
        if (target.dataset.action === 'toggle-sign') {
            state.displayValue = String(parseFloat(state.displayValue) * -1);
        }

        if (target.dataset.action === 'percentage') {
            state.displayValue = String(parseFloat(state.displayValue) / 100);
        }

        updateDisplay();
    });

    resetCalculator();
    calculator.dataset.initialized = 'true';

    initializeCalcSubtabs();
}

// 3.0: подвкладки калькулятора (Обычный / Временной) + «временной» режим.
// Подаётся как калькулятор: никаких упоминаний ИИ в интерфейсе.
function initializeCalcSubtabs() {
    const page = document.querySelector('.fp-tools-page-content[data-page="calculator"]');
    if (!page || page.dataset.subtabsInit) return;

    const tabs = page.querySelectorAll('.calc-subtab');
    const panes = page.querySelectorAll('.calc-pane');
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const mode = tab.dataset.calcMode;
            tabs.forEach(t => t.classList.toggle('is-active', t === tab));
            panes.forEach(p => { p.hidden = p.dataset.calcPane !== mode; });
        });
    });

    const input = page.querySelector('#calcTimeInput');
    const btn = page.querySelector('#calcTimeBtn');
    const resultBox = page.querySelector('#calcTimeResult');
    if (btn && input && resultBox) {
        const run = async () => {
            const text = input.value.trim();
            if (!text) { input.focus(); return; }
            btn.disabled = true;
            resultBox.hidden = false;
            resultBox.classList.remove('is-error');
            resultBox.innerHTML = '<div class="calc-time-head"><span class="calc-time-loader"></span> Считаю</div>';
            try {
                const res = await chrome.runtime.sendMessage({
                    action: 'getAIProcessedText',
                    text,
                    context: '',
                    myUsername: '',
                    type: 'time_calc'
                });
                if (res && res.success) {
                    resultBox.classList.remove('is-error');
                    resultBox.innerHTML =
                        '<div class="calc-time-head"><span class="material-symbols-rounded">schedule</span> Результат</div>' +
                        '<div class="calc-time-body"></div>';
                    resultBox.querySelector('.calc-time-body').textContent = res.data;
                } else {
                    resultBox.classList.add('is-error');
                    resultBox.innerHTML =
                        '<div class="calc-time-head"><span class="material-symbols-rounded">error</span> Ошибка</div>' +
                        '<div class="calc-time-body"></div>';
                    resultBox.querySelector('.calc-time-body').textContent =
                        (res && res.error) || 'Не удалось посчитать. Попробуйте ещё раз.';
                }
            } catch (e) {
                resultBox.classList.add('is-error');
                resultBox.innerHTML =
                    '<div class="calc-time-head"><span class="material-symbols-rounded">error</span> Ошибка</div>' +
                    '<div class="calc-time-body">Не удалось посчитать. Попробуйте ещё раз.</div>';
            } finally {
                btn.disabled = false;
            }
        };
        btn.addEventListener('click', run);
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); run(); }
        });
    }

    page.dataset.subtabsInit = 'true';
}


function initializeToolsPopup() {
    const popup = document.querySelector('.fp-tools-popup');
    if (!popup || popup.dataset.initialized === 'true') {
        return;
    }
    const closeBtn = popup.querySelector('.close-btn');
    if (closeBtn) {
        closeBtn.addEventListener('click', () => {
            popup.classList.remove('active');
        });
    }
    const saveAllPopupSettings = async (silent = false) => {
        try {
            const selectedSound = document.querySelector('input[name="notificationSound"]:checked');
            
            // --- ИСПРАВЛЕНО: Добавлено считывание настроек авто-ответов ---
            const reviewTemplates = {
                '5': document.getElementById('fpt-review-5').value,
                '4': document.getElementById('fpt-review-4').value,
                '3': document.getElementById('fpt-review-3').value,
                '2': document.getElementById('fpt-review-2').value,
                '1': document.getElementById('fpt-review-1').value
            };

            // helper: read attached images from a textarea (stored on dataset by the chip UI)
            const readImgs = (id) => {
                const el = document.getElementById(id);
                if (!el || !el.dataset.fptImages) return [];
                try { return JSON.parse(el.dataset.fptImages) || []; } catch (_) { return []; }
            };
            // helper: read the per-field send order (text→image vs image→text)
            const readOrder = (id) => {
                const el = document.getElementById(id);
                return (el && el.dataset.fptSendOrder === 'image_first') ? 'image_first' : 'text_first';
            };
            const reviewTemplateImages = {
                '5': readImgs('fpt-review-5'), '4': readImgs('fpt-review-4'),
                '3': readImgs('fpt-review-3'), '2': readImgs('fpt-review-2'), '1': readImgs('fpt-review-1')
            };

            const settingsToSave = {
                // Общие настройки
                showSalesStats: document.getElementById('showSalesStatsCheckbox').checked,
                showFinanceStats: document.getElementById('showFinanceStatsCheckbox')?.checked !== false,
                hideBalance: document.getElementById('hideBalanceCheckbox').checked,
                viewSellersPromo: document.getElementById('viewSellersPromoCheckbox').checked,
                notificationSound: selectedSound ? selectedSound.value : 'default',
                notificationVolume: (function(){ const v = document.getElementById('notificationVolume'); return v ? (parseInt(v.value,10)/100) : 1; })(),

                // Авто-поднятие
                autoBumpEnabled: document.getElementById('autoBumpEnabled').checked,
                fpToolsSelectiveBumpEnabled: document.getElementById('selectiveBumpEnabled').checked,
                fpToolsBumpOnlyAutoDelivery: document.getElementById('bumpOnlyAutoDelivery').checked,

                // Авто-ответы (добавленный блок)
                autoReviewEnabled: document.getElementById('autoReviewEnabled').checked,
                reviewTemplates: reviewTemplates,
                reviewTemplateImages: reviewTemplateImages,
                greetingEnabled: document.getElementById('greetingEnabled').checked,
                greetingText: document.getElementById('greetingText').value,
                greetingImages: readImgs('greetingText'),
                greetingSendOrder: readOrder('greetingText'),
                keywordsEnabled: document.getElementById('keywordsEnabled').checked,
                // 'keywords' сохраняются отдельно при добавлении/удалении и здесь не нужны

                // 2.8: Identifier toggle
                fpToolsIdentifierEnabled: document.getElementById('fptIdentifierEnabled')?.checked !== false,

                // 2.9: New toggles
                fpToolsBuyerHistory:     document.getElementById('fpToolsBuyerHistory')?.checked !== false,
                fpToolsShowUnconfirmed:  document.getElementById('fpToolsShowUnconfirmed')?.checked !== false,

                // комиссия разделов и реальные цены лотов (по умолчанию ВЫКЛ)
                fptShowCommission:       document.getElementById('fptShowCommissionCheckbox')?.checked === true,
                fptShowRealPrices:       document.getElementById('fptShowRealPricesCheckbox')?.checked === true
            };

            // 3.0: Extended autoresponder settings
            const existingAR = (await chrome.storage.local.get('fpToolsAutoReplies')).fpToolsAutoReplies || {};
            const arExtras = {
                ...existingAR,
                newOrderReplyEnabled:    document.getElementById('newOrderReplyEnabled')?.checked ?? false,
                newOrderReplyText:       document.getElementById('newOrderReplyText')?.value || '',
                newOrderReplyImages:     readImgs('newOrderReplyText'),
                newOrderReplySendOrder:  readOrder('newOrderReplyText'),
                orderConfirmReplyEnabled: document.getElementById('orderConfirmReplyEnabled')?.checked ?? false,
                orderConfirmReplyText:   document.getElementById('orderConfirmReplyText')?.value || '',
                orderConfirmReplyImages: readImgs('orderConfirmReplyText'),
                orderConfirmReplySendOrder: readOrder('orderConfirmReplyText'),
                typingDelay:             document.getElementById('typingDelay')?.checked ?? false,
                onlyNewChats:            document.getElementById('onlyNewChats')?.checked ?? false,
                ignoreSystemMessages:    document.getElementById('ignoreSystemMessages')?.checked ?? false,
                greetingCooldownDays:    parseFloat(document.getElementById('greetingCooldownDays')?.value || '0'),
            };
            chrome.storage.local.set({ fpToolsAutoReplies: arExtras });

            // 3.0: Auto-restore/disable, review request template
            const reviewTpl = document.getElementById('reviewRequestTemplate')?.value || '';
            chrome.storage.local.set({
                fpToolsAutoRestoreEnabled: document.getElementById('fpAutoRestoreEnabled')?.checked ?? false,
                fpToolsAutoDisableEnabled: document.getElementById('fpAutoDisableEnabled')?.checked ?? false,
                fpToolsReviewRequestTemplate: reviewTpl
            });

            // Save review request template separately (it's in auto_review section)
            const rrTemplate = document.getElementById('fp-review-request-template')?.value?.trim();
            if (rrTemplate !== undefined) {
                const { fpToolsAutoReplies: curAR = {} } = await chrome.storage.local.get('fpToolsAutoReplies');
                curAR.reviewRequestTemplate = rrTemplate;
                await chrome.storage.local.set({ fpToolsAutoReplies: curAR });
            }

            settingsToSave.fpToolsDiscord = {
                enabled: document.getElementById('discordLogEnabled').checked,
                webhookUrl: document.getElementById('discordWebhookUrl').value.trim(),
                pingEveryone: document.getElementById('discordPingEveryone').checked,
                pingHere: document.getElementById('discordPingHere').checked
            };
            
            await chrome.storage.local.set(settingsToSave);

            applyNotificationSound();

            if (settingsToSave.autoBumpEnabled) {
                chrome.runtime.sendMessage({ action: 'startAutoBump' });
            } else {
                chrome.runtime.sendMessage({ action: 'stopAutoBump' });
            }
            
            // Перезапускаем мониторинг отзывов, если настройка изменилась
            if (typeof initializeAutoReview === 'function') {
                initializeAutoReview();
            }

            // 3.0: silent autosave must NOT close the menu or spam notifications.
            if (!silent) {
                popup.classList.remove('active');
                showNotification('Настройки сохранены!');
            }
        } catch (error) {
            console.error('FP Tools: Ошибка при сохранении настроек:', error);
            if (!silent) showNotification('Ошибка при сохранении настроек.', true);
        }
    };

    const saveBtn = document.getElementById('saveSettings');
    if (saveBtn) {
        saveBtn.addEventListener('click', () => saveAllPopupSettings(false));
    }

    // 3.0: GLOBAL AUTOSAVE. The save footer is removed; every change in the popup now persists
    // automatically (debounced). We listen at the popup root via delegation so dynamically
    // added controls are covered too.
    const popupRoot = document.querySelector('.fp-tools-popup');
    if (popupRoot && !popupRoot.dataset.fptAutosave) {
        popupRoot.dataset.fptAutosave = '1';
        let autosaveTimer = null;
        const queueAutosave = () => {
            if (!fptExtAlive || fptExtAlive()) {
                if (autosaveTimer) clearTimeout(autosaveTimer);
                autosaveTimer = setTimeout(() => { saveAllPopupSettings(true); }, 500);
            }
        };
        // 'change' covers checkboxes/radios/selects/color inputs; 'input' covers text/textarea/range.
        popupRoot.addEventListener('change', queueAutosave, true);
        popupRoot.addEventListener('input', queueAutosave, true);
        popupRoot.addEventListener('fpt-attachment-changed', queueAutosave, true);
    }
    
    const bgInfoToggle = document.getElementById('bgImageInfoToggle');
    if (bgInfoToggle) {
        bgInfoToggle.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            
            const content = document.getElementById('bgImageInfoContent');
            if (content) {
                const isVisible = content.style.display === 'block';
                content.style.display = isVisible ? 'none' : 'block';
            }
        });
    }

    const resetThemeBtn = document.getElementById('resetThemeBtn');
    if (resetThemeBtn) {
        resetThemeBtn.addEventListener('click', async () => {
            if (confirm('Вы уверены, что хотите сбросить все настройки темы и оформления?')) {
                await chrome.storage.local.remove('fpToolsTheme');
                await chrome.storage.local.set({ enableRedesignedHomepage: true });
                applyCustomTheme();
                applyHeaderPosition();
                await updateThemePreview();
                showNotification('Настройки темы сброшены. Страница будет перезагружена.');
                setTimeout(() => window.location.reload(), 1500);
            }
        });
    }
    
    const resetCursorFxBtn = document.getElementById('resetCursorFxBtn');
    if (resetCursorFxBtn) {
        resetCursorFxBtn.addEventListener('click', async () => {
             if (confirm('Вы уверены, что хотите сбросить настройки эффектов курсора?')) {
                await chrome.storage.local.remove('fpToolsCursorFx');
                await loadSavedSettings();
                showNotification('Настройки эффектов курсора сброшены.');
            }
        });
    }

    const configureBtn = document.getElementById('configureSelectiveBumpBtn');
    const modalOverlay = document.getElementById('autobump-category-modal-overlay');

    configureBtn.addEventListener('click', async () => {
        modalOverlay.style.display = 'flex';
        const listContainer = document.getElementById('autobump-category-list');
        listContainer.innerHTML = '<div class="fp-import-loader"></div>';

        try {
            const response = await chrome.runtime.sendMessage({ action: 'getUserCategories' });
            if (!response.success) throw new Error(response.error);
            const categories = response.data;
            const { fpToolsSelectedBumpCategories = [] } = await chrome.storage.local.get('fpToolsSelectedBumpCategories');
            
            if (categories && categories.length > 0) {
                listContainer.innerHTML = categories.map(cat => `
                    <label class="autobump-category-item">
                        <input type="checkbox" data-id="${cat.id}" ${fpToolsSelectedBumpCategories.includes(cat.id) ? 'checked' : ''}>
                        <span>${cat.name}</span>
                    </label>
                `).join('');
            } else {
                listContainer.innerHTML = '<div class="fp-import-empty">Не найдено категорий на вашем профиле.</div>';
            }
        } catch (error) {
            listContainer.innerHTML = `<div class="fp-import-empty">Ошибка загрузки: ${error.message}</div>`;
        }
    });

    modalOverlay.querySelector('.fp-tools-modal-close').addEventListener('click', () => {
        modalOverlay.style.display = 'none';
    });

    document.getElementById('autobump-select-all').addEventListener('click', () => {
        const firstVisibleCheckbox = document.querySelector('#autobump-category-list .autobump-category-item:not([style*="display: none"]) input');
        if (!firstVisibleCheckbox) return;
        const isChecked = !firstVisibleCheckbox.checked;
        document.querySelectorAll('#autobump-category-list input[type="checkbox"]').forEach(cb => {
            if (cb.closest('.autobump-category-item').style.display !== 'none') {
                cb.checked = isChecked;
            }
        });
    });

    document.getElementById('autobump-category-search').addEventListener('input', (e) => {
        const query = e.target.value.toLowerCase();
        document.querySelectorAll('.autobump-category-item').forEach(item => {
            const name = item.querySelector('span').textContent.toLowerCase();
            item.style.display = name.includes(query) ? 'flex' : 'none';
        });
    });

    document.getElementById('autobump-category-save').addEventListener('click', async () => {
        const selectedIds = Array.from(document.querySelectorAll('#autobump-category-list input:checked'))
                                .map(cb => cb.dataset.id);
        await chrome.storage.local.set({ fpToolsSelectedBumpCategories: selectedIds });
        modalOverlay.style.display = 'none';
        showNotification('Список категорий для поднятия сохранен!', false);
    });
    
    if (typeof renderCustomTemplatesList === 'function') renderCustomTemplatesList();
    if (typeof setupThemeCustomizationHandlers === 'function') setupThemeCustomizationHandlers();
    if (typeof updateThemePreview === 'function') updateThemePreview();
    if (typeof setupCursorFxHandlers === 'function') setupCursorFxHandlers();
    if (typeof renderAccountsList === 'function') renderAccountsList();
    
    if (typeof setupAccountManagementHandlers === 'function') setupAccountManagementHandlers();

    if (typeof setupTemplateSettingsHandlers === 'function') setupTemplateSettingsHandlers();
    if (typeof setupPopupNavigation === 'function') setupPopupNavigation();
    if (typeof initializeCalculatorLogic === 'function') initializeCalculatorLogic();
    if (typeof initializeNotes === 'function') initializeNotes();

    popup.dataset.initialized = 'true';
    console.log('FP Tools Popup Initialized.');
}

function logToAutoBumpConsole(message) {
    const consoleEl = document.getElementById('autoBumpConsole');
    if(consoleEl) {
        const logEntry = document.createElement('p');
        logEntry.textContent = message;
        consoleEl.prepend(logEntry);
        while (consoleEl.children.length > 100) {
            consoleEl.removeChild(consoleEl.lastChild);
        }
    }
}

async function initializeQuickGamesMenu() {
    const navMenu = document.querySelector('#navbar > .nav.navbar-nav');
    if (!navMenu || document.querySelector('.menu-item-fp-games')) {
        return;
    }

    const gameDropdownItem = createElement('li', { class: 'dropdown menu-item-fp-games' });
    gameDropdownItem.innerHTML = `
        <a href="#" class="dropdown-toggle" data-toggle="dropdown" role="button" aria-haspopup="true" aria-expanded="false">
            Игры <span class="caret"></span>
        </a>
        <ul class="dropdown-menu">
            <li class="info-text">Вставьте ссылку на категорию игры, и она добавится в этот список для быстрого доступа.</li>
            <li class="input-container">
                <input type="text" id="quickGameUrlInput" placeholder="https://funpay.com/lots/..."/>
            </li>
            <li role="separator" class="divider"></li>
            <div id="quickGamesListContainer"></div>
        </ul>
    `;

    const style = createElement('style', {}, {}, `
        .dropdown-menu .info-text { padding: 8px 15px; font-size: 12px; color: #999; white-space: normal; }
        .dropdown-menu .input-container { padding: 5px 15px; }
        #quickGameUrlInput { width: 100%; padding: 5px 8px; border: 1px solid #555; background-color: #333; color: #fff; border-radius: 4px; box-sizing: border-box; }
        #quickGamesListContainer a { color: #c3c3c3 !important; font-size: 13px !important; padding: 6px 15px !important; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; display: block; }
        #quickGamesListContainer a:hover { color: #fff !important; }
        #quickGamesListContainer .divider { height: 1px; margin: 4px 0 !important; overflow: hidden; background-color: #444 !important; }
    `);
    document.head.appendChild(style);

    navMenu.appendChild(gameDropdownItem);

    const listContainer = gameDropdownItem.querySelector('#quickGamesListContainer');
    const inputField = gameDropdownItem.querySelector('#quickGameUrlInput');

    const getSavedGames = async () => {
        const data = await chrome.storage.local.get('fpToolsQuickGames');
        return data.fpToolsQuickGames || [];
    };

    const saveGames = async (games) => {
        await chrome.storage.local.set({ fpToolsQuickGames: games });
    };

    const renderList = (games) => {
        listContainer.innerHTML = '';
        if (games.length === 0) {
            const emptyLi = createElement('li', { class: 'info-text' }, { padding: '8px 15px' }, 'Список пуст');
            listContainer.appendChild(emptyLi);
        } else {
            games.forEach((game, index) => {
                const gameLi = createElement('li');
                const gameLink = createElement('a', { href: game.url, target: '_blank', title: game.title });
                gameLink.textContent = game.title;

                gameLink.addEventListener('contextmenu', async (e) => {
                    e.preventDefault();
                    if (confirm(`Удалить "${game.title}" из быстрых игр?`)) {
                        const currentGames = await getSavedGames();
                        const updatedGames = currentGames.filter(g => g.url !== game.url);
                        await saveGames(updatedGames);
                        renderList(updatedGames);
                    }
                });
                gameLi.appendChild(gameLink);
                listContainer.appendChild(gameLi);

                if (index < games.length - 1) {
                    const divider = createElement('li', { role: 'separator', class: 'divider' });
                    listContainer.appendChild(divider);
                }
            });
        }
    };

    const addGame = async (url) => {
        const urlRegex = /^https:\/\/funpay\.com\/(lots|chips)\/\d+\/?$/;
        if (!urlRegex.test(url)) {
            showNotification('Неверная ссылка. Пример: https://funpay.com/lots/123/', true);
            return;
        }

        inputField.disabled = true;
        inputField.value = 'Загрузка...';

        try {
            const response = await fetch(url);
            if (!response.ok) throw new Error('Сетевая ошибка');
            const html = await response.text();
            const doc = new DOMParser().parseFromString(html, 'text/html');
            
            let title;
            const titleElement = doc.querySelector('.promo-game-item.active .game-title a, .nav-header .inside, h1.page-header .inside');
            
            if (titleElement) {
                title = titleElement.textContent.trim().replace('/ FunPay', '').trim();
            } else {
                const mainTitleElement = doc.querySelector('title');
                if (mainTitleElement) {
                    title = mainTitleElement.textContent.trim().replace('на FunPay', '').trim();
                } else {
                    throw new Error('Не удалось найти заголовок');
                }
            }
            
            const games = await getSavedGames();
            if (games.some(g => g.url === url)) {
                showNotification('Эта игра уже добавлена', true);
            } else {
                games.push({ title, url });
                await saveGames(games);
                renderList(games);
                showNotification(`Игра "${title}" добавлена!`);
            }
        } catch (error) {
            console.error('Ошибка при добавлении быстрой игры:', error);
            showNotification('Не удалось добавить игру. Проверьте ссылку и попробуйте снова.', true);
        } finally {
            inputField.disabled = false;
            inputField.value = '';
        }
    };

    inputField.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            addGame(inputField.value.trim());
        }
    });

    inputField.addEventListener('paste', (e) => {
        e.preventDefault();
        const pastedText = (e.clipboardData || window.clipboardData).getData('text');
        addGame(pastedText.trim());
    });

    const initialGames = await getSavedGames();
    renderList(initialGames);
} 

function initializeMarkAllAsRead() {
    const observer = new MutationObserver(async (mutationsList, obs) => {
        const header = document.querySelector('.chat-full-header');
        if (!header || document.getElementById('fp-tools-read-all-btn')) {
            return;
        }

        const readAllBtn = createElement('button', {
            id: 'fp-tools-read-all-btn',
            class: 'fp-tooltip-host',
            'data-fp-tooltip': 'Прочитать все'
        });
        readAllBtn.innerHTML = '<span class="material-icons">done_all</span>';
        
        const filterMarkedBtn = createElement('label', {
            id: 'fp-tools-filter-marked-btn',
            class: 'fp-tooltip-host fp-tools-chat-toggle',
            'data-fp-tooltip': 'Только помеченные'
        });
        filterMarkedBtn.innerHTML = `
            <input type="checkbox" id="filter-marked-checkbox">
            <span class="fp-tools-chat-toggle-slider">
                 <span class="material-icons">label</span>
            </span>
        `;
        
        header.appendChild(readAllBtn);
        header.appendChild(filterMarkedBtn);

        readAllBtn.addEventListener('click', async () => {
            const unreadItems = Array.from(document.querySelectorAll('.contact-item.unread'));
            if (unreadItems.length === 0) {
                showNotification('Нет непрочитанных сообщений.', false);
                return;
            }

            // --- Start: Immediate visual update ---
            readAllBtn.classList.add('loading');
            readAllBtn.disabled = true;

            const nodeIdsToRead = [];
            unreadItems.forEach(item => {
                const nodeId = item.dataset.id;
                if (nodeId) {
                    nodeIdsToRead.push(nodeId);
                }
                item.classList.remove('unread'); // Visually mark as read immediately
            });

            const counter = document.querySelector('.chat-full-header .badge');
            if (counter) {
                counter.textContent = '0';
                counter.style.display = 'none';
            }
            
            showNotification(`Начинаю отмечать ${unreadItems.length} диалогов как прочитанные...`, false);
            // --- End: Immediate visual update ---

            let processedCount = 0;
            const intervalId = setInterval(async () => {
                // If the list of IDs is empty, we're done.
                if (nodeIdsToRead.length === 0) {
                    clearInterval(intervalId);
                    readAllBtn.classList.remove('loading');
                    readAllBtn.disabled = false;
                    showNotification(`Завершено: ${processedCount} диалогов отмечены прочитанными.`, false);
                    return;
                }

                const nodeId = nodeIdsToRead.shift();
                const chatUrl = `https://funpay.com/chat/?node=${nodeId}`;

                try {
                    // Just making the GET request is enough to mark it as read on the server
                    await fetch(chatUrl);
                    processedCount++;
                } catch (error) {
                    console.error(`FP Tools: Ошибка при "посещении" чата ${nodeId} для прочтения`, error);
                    // We don't re-add the nodeId to the list to avoid getting stuck on a failing one.
                }

            }, 800); // 0.8 second interval
        });
        
        const filterCheckbox = document.getElementById('filter-marked-checkbox');

        const applyMarkedFilter = () => {
            const isFilterActive = filterCheckbox.checked;
            const contactItems = document.querySelectorAll('.contact-list .contact-item');
            
            contactItems.forEach(item => {
                const hasMark = item.querySelector('.fp-tools-user-status[data-fp-tooltip]');
                if (isFilterActive) {
                    item.style.display = hasMark ? '' : 'none';
                } else {
                    item.style.display = '';
                }
            });
        };

        filterCheckbox.addEventListener('change', async () => {
            if (!fptExtAlive()) return;
            await fptSafe(() => chrome.storage.local.set({ fpToolsIsMarkedFilterActive: filterCheckbox.checked }));
            applyMarkedFilter();
        });

        if (fptExtAlive()) {
            fptSafe(() => chrome.storage.local.get('fpToolsIsMarkedFilterActive'), {}).then(data => {
                if (data && data.fpToolsIsMarkedFilterActive) {
                    filterCheckbox.checked = true;
                    applyMarkedFilter();
                }
            });
        }
        
        const contactList = document.querySelector('.contact-list');
        if (contactList) {
            const filterObserver = new MutationObserver(() => {
                setTimeout(applyMarkedFilter, 100); 
            });
            filterObserver.observe(contactList, { childList: true, subtree: true });
        }

        // 3.0: stop the outer observer once our controls exist - it observed the whole body
        // subtree forever, which was a constant performance drain on the chat page.
        obs.disconnect();
    });

    observer.observe(document.body, { childList: true, subtree: true });
}