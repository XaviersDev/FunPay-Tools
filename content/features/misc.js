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

    function updateDisplay() {
        const firstOperandFormatted = state.firstOperand !== null 
            ? String(state.firstOperand).replace(/\B(?=(\d{3})+(?!\d))/g, ' ') 
            : '';
        const displayValueFormatted = state.displayValue.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');

        let textToShow;
        if (state.operator && !state.waitingForSecondOperand) {
            textToShow = `${firstOperandFormatted} ${operatorSymbols[state.operator]} ${displayValueFormatted}`;
        } else if (state.operator && state.waitingForSecondOperand) {
            textToShow = `${firstOperandFormatted} ${operatorSymbols[state.operator]}`;
        } else {
            textToShow = displayValueFormatted;
        }
        display.textContent = textToShow;
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
            state.displayValue = `${parseFloat(result.toFixed(7))}`;
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
                state.displayValue = `${parseFloat(result.toFixed(7))}`;
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
    const saveAllPopupSettings = async () => {
        try {
            const selectedSound = document.querySelector('input[name="notificationSound"]:checked');
            
            const settingsToSave = {
                showSalesStats: document.getElementById('showSalesStatsCheckbox').checked,
                hideBalance: document.getElementById('hideBalanceCheckbox').checked,
                viewSellersPromo: document.getElementById('viewSellersPromoCheckbox').checked,
                notificationSound: selectedSound ? selectedSound.value : 'default',
                autoBumpEnabled: document.getElementById('autoBumpEnabled').checked,
                autoBumpCooldown: parseInt(document.getElementById('autoBumpCooldown').value, 10) || 245,
                fpToolsSelectiveBumpEnabled: document.getElementById('selectiveBumpEnabled').checked
            };

            settingsToSave.fpToolsDiscord = {
                enabled: document.getElementById('discordLogEnabled').checked,
                webhookUrl: document.getElementById('discordWebhookUrl').value.trim(),
                pingEveryone: document.getElementById('discordPingEveryone').checked,
                pingHere: document.getElementById('discordPingHere').checked
            };

            settingsToSave.fpToolsGreetings = {
                enabled: document.getElementById('enableGreetings').checked,
                text: document.getElementById('greetingsTemplate').value,
            };
            
            await chrome.storage.local.set(settingsToSave);

            applyNotificationSound();

            if (settingsToSave.autoBumpEnabled) {
                chrome.runtime.sendMessage({ action: 'startAutoBump', cooldown: settingsToSave.autoBumpCooldown });
            } else {
                chrome.runtime.sendMessage({ action: 'stopAutoBump' });
            }

            popup.classList.remove('active');
            showNotification('Настройки сохранены!');
        } catch (error) {
            console.error('FP Tools: Ошибка при сохранении настроек:', error);
            showNotification('Ошибка при сохранении настроек.', true);
        }
    };

    const saveBtn = document.getElementById('saveSettings');
    if (saveBtn) {
        saveBtn.addEventListener('click', saveAllPopupSettings);
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
            const categories = await chrome.runtime.sendMessage({ action: 'getUserCategories' });
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
        readAllBtn.innerHTML = '<span class="material-icons">mark_chat_read</span>';
        
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
            await chrome.storage.local.set({ fpToolsIsMarkedFilterActive: filterCheckbox.checked });
            applyMarkedFilter();
        });

        chrome.storage.local.get('fpToolsIsMarkedFilterActive').then(data => {
            if (data.fpToolsIsMarkedFilterActive) {
                filterCheckbox.checked = true;
                applyMarkedFilter();
            }
        });
        
        const contactList = document.querySelector('.contact-list');
        if (contactList) {
            const filterObserver = new MutationObserver(() => {
                setTimeout(applyMarkedFilter, 100); 
            });
            filterObserver.observe(contactList, { childList: true, subtree: true });
        }
    });

    observer.observe(document.body, { childList: true, subtree: true });
}
