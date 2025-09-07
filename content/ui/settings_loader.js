let fpToolsAccounts = [];
let aiModeActive = false;

async function renderTemplateSettings() {
    const container = document.getElementById('template-settings-container');
    if (!container) return;
    container.innerHTML = '';

    const createItem = (key, config, isCustom = false) => {
        const item = createElement('div', { class: 'template-item' });
        if (!config.enabled) item.classList.add('disabled-in-settings');
        
        const colorPickerHtml = isCustom ? `<input type="color" class="template-color-picker" value="${config.color}" data-key="${key}" data-custom="true">` : '';
        const deleteBtnHtml = isCustom ? `<button class="delete-custom-template-btn" data-id="${config.id}">🗑️</button>` : '';

        item.innerHTML = `
            <div class="template-item-header">
                <input type="checkbox" class="template-toggle" data-key="${key}" data-custom="${isCustom}" ${config.enabled ? 'checked' : ''}>
                ${colorPickerHtml}
                <span class="template-label" contenteditable="true" data-key="${key}" data-custom="${isCustom}">${config.label}</span>
                ${deleteBtnHtml}
            </div>
            <textarea class="template-input template-text" data-key="${key}" data-custom="${isCustom}" placeholder="Текст шаблона...">${config.text}</textarea>
        `;
        container.appendChild(item);
    };

    for (const key in templateSettings.standard) {
        createItem(key, templateSettings.standard[key], false);
    }
    
    templateSettings.custom.forEach(config => {
        createItem(config.id, config, true);
    });
}

async function setupTemplateSettingsHandlers() {
    await loadTemplateSettings();
    await renderTemplateSettings();

    const container = document.getElementById('template-settings-container');
    const templatesPage = document.querySelector('.fp-tools-page-content[data-page="templates"]');
    if (!container || !templatesPage) return;
    
    const posRadio = templatesPage.querySelector(`input[name="templatePos"][value="${templateSettings.buttonPosition}"]`);
    if(posRadio) posRadio.checked = true;
    
    document.getElementById('sendTemplatesImmediately').checked = templateSettings.sendTemplatesImmediately;

    const handleInput = async (e) => {
        const target = e.target;
        const isCustom = target.dataset.custom === 'true';
        const key = target.dataset.key;

        if (isCustom) {
            const template = templateSettings.custom.find(t => t.id === key);
            if (!template) return;
            if (target.classList.contains('template-toggle')) template.enabled = target.checked;
            if (target.classList.contains('template-color-picker')) template.color = target.value;
            if (target.classList.contains('template-label')) template.label = target.textContent;
            if (target.classList.contains('template-text')) template.text = target.value;
        } else {
            const template = templateSettings.standard[key];
            if (!template) return;
            if (target.classList.contains('template-toggle')) template.enabled = target.checked;
            if (target.classList.contains('template-label')) template.label = target.textContent;
            if (target.classList.contains('template-text')) template.text = target.value;
        }

        if (target.classList.contains('template-toggle')) {
            target.closest('.template-item').classList.toggle('disabled-in-settings', !target.checked);
        }

        await saveTemplateSettings();
        await addChatTemplateButtons();
    };

    container.addEventListener('input', handleInput);
    container.addEventListener('change', handleInput);
    container.addEventListener('focusout', (e) => {
        if (e.target.classList.contains('template-label')) handleInput(e);
    });

    container.addEventListener('click', async (e) => {
        if (e.target.classList.contains('delete-custom-template-btn')) {
            const id = e.target.dataset.id;
            templateSettings.custom = templateSettings.custom.filter(t => t.id !== id);
            await saveTemplateSettings();
            await renderTemplateSettings();
            await addChatTemplateButtons();
        }
    });
    
    document.getElementById('addCustomTemplateBtn').onclick = async () => {
        templateSettings.custom.push({
            id: Date.now().toString(),
            label: 'Новый шаблон',
            text: '',
            color: '#3792cb',
            enabled: true
        });
        await saveTemplateSettings();
        await renderTemplateSettings();
        await setupTemplateSettingsHandlers();
    };

    templatesPage.querySelectorAll('input[name="templatePos"]').forEach(radio => {
        radio.onchange = async (e) => {
            templateSettings.buttonPosition = e.target.value;
            await saveTemplateSettings();
            await addChatTemplateButtons();
        };
    });

    document.getElementById('sendTemplatesImmediately').onchange = async (e) => {
        templateSettings.sendTemplatesImmediately = e.target.checked;
        await saveTemplateSettings();
    };
}


async function loadSavedSettings() {
    const settings = await chrome.storage.local.get([
        'fpToolsTemplateSettings', 'enableCustomTheme', 'fpToolsTheme', 'aiModeActive',
        'autoBumpEnabled', 'autoBumpCooldown', 'fpToolsCursorFx', 'fpToolsCustomCursor',
        'fpToolsPopupPosition', 'fpToolsPopupSize', 'enableRedesignedHomepage', 'fpToolsPopupDragged',
        'fpToolsAccounts', 'showSalesStats', 'hideBalance', 'viewSellersPromo', 'notificationSound',
        'fpToolsGreetings', 'fpToolsDiscord',
        // New settings for selective bump
        'fpToolsSelectiveBumpEnabled', 'fpToolsSelectedBumpCategories' 
    ]);
    
    fpToolsAccounts = settings.fpToolsAccounts || [];
    renderAccountsList();

    const logoutLink = document.querySelector('.menu-item-logout');
    if(logoutLink && !document.querySelector('.fp-tools-logout-clean')) {
        const cleanLogoutItem = document.createElement('li');
        cleanLogoutItem.innerHTML = `<a href="#" class="fp-tools-logout-clean" style="color: #ff6b6b !important;">Выйти (очистить куки)</a>`;
        logoutLink.parentElement.insertAdjacentElement('afterend', cleanLogoutItem);
        cleanLogoutItem.querySelector('a').addEventListener('click', (e) => {
            e.preventDefault();
            chrome.runtime.sendMessage({ action: 'deleteCookiesAndReload' });
        });
    }

    if (typeof initializePiggyBank === 'function') {
        initializePiggyBank();
    }
    
    const toolsPopup = document.querySelector('.fp-tools-popup');
    if (settings.fpToolsPopupDragged && settings.fpToolsPopupPosition) {
        toolsPopup.style.left = settings.fpToolsPopupPosition.left;
        toolsPopup.style.top = settings.fpToolsPopupPosition.top;
        toolsPopup.classList.add('no-transform');
    }
    if (settings.fpToolsPopupSize) {
        toolsPopup.style.width = settings.fpToolsPopupSize.width;
        toolsPopup.style.height = settings.fpToolsPopupSize.height;
    }

    const discordSettings = settings.fpToolsDiscord || { enabled: false, webhookUrl: '', pingEveryone: false, pingHere: false };
    const discordLogEnabledEl = document.getElementById('discordLogEnabled');
    const discordWebhookUrlEl = document.getElementById('discordWebhookUrl');
    const discordPingEveryoneEl = document.getElementById('discordPingEveryone');
    const discordPingHereEl = document.getElementById('discordPingHere');
    const discordSettingsContainer = document.getElementById('discordSettingsContainer');

    if (discordLogEnabledEl) discordLogEnabledEl.checked = discordSettings.enabled;
    if (discordWebhookUrlEl) discordWebhookUrlEl.value = discordSettings.webhookUrl;
    if (discordPingEveryoneEl) discordPingEveryoneEl.checked = discordSettings.pingEveryone;
    if (discordPingHereEl) discordPingHereEl.checked = discordSettings.pingHere;

    const toggleDiscordControls = () => {
        if (!discordLogEnabledEl) return;
        const enabled = discordLogEnabledEl.checked;
        if (discordSettingsContainer) discordSettingsContainer.style.display = enabled ? 'block' : 'none';
        if (discordPingEveryoneEl) discordPingEveryoneEl.disabled = !enabled;
        if (discordPingHereEl) discordPingHereEl.disabled = !enabled;
    };

    if (discordLogEnabledEl) {
        discordLogEnabledEl.addEventListener('change', toggleDiscordControls);
        toggleDiscordControls();
    }

    const greetingsSettings = settings.fpToolsGreetings || {};
    document.getElementById('enableGreetings').checked = greetingsSettings.enabled === true;
    document.getElementById('greetingsTemplate').value = greetingsSettings.text || '{welcome}, {buyername}!';

    await setupTemplateSettingsHandlers();

    aiModeActive = settings.aiModeActive === true;
    const aiButton = document.getElementById('aiModeToggleBtn');
    if(aiButton) {
        aiButton.classList.toggle('active', aiModeActive);
        aiButton.title = aiModeActive ? 'AI Режим АКТИВЕН (Enter для генерации/отправки)' : 'AI Режим (Enter для генерации/отправки)';
    }

    const enableCustomThemeCheckboxEl = document.getElementById('enableCustomThemeCheckbox');
    const isThemeEnabled = settings.enableCustomTheme !== false;
    if(enableCustomThemeCheckboxEl) {
        enableCustomThemeCheckboxEl.checked = isThemeEnabled;
        toggleThemeControls(!isThemeEnabled);
    }
    updateThemePreview();

    // Autobump settings
    document.getElementById('autoBumpEnabled').checked = settings.autoBumpEnabled === true;
    document.getElementById('autoBumpCooldown').value = settings.autoBumpCooldown || 245;
    document.getElementById('selectiveBumpEnabled').checked = settings.fpToolsSelectiveBumpEnabled === true;

    document.getElementById('enableRedesignedHomepage').checked = settings.enableRedesignedHomepage !== false;

    const cursorFxSettings = settings.fpToolsCursorFx || {};
    const cursorFxDefaults = { enabled: false, type: 'sparkle', color1: '#FF6B6B', color2: '#6B66FF', rgb: false, count: 50 };
    const finalCursorFxSettings = { ...cursorFxDefaults, ...cursorFxSettings };

    document.getElementById('cursorFxEnabled').checked = finalCursorFxSettings.enabled;
    document.getElementById('cursorFxType').value = finalCursorFxSettings.type;
    document.getElementById('cursorFxColor1').value = finalCursorFxSettings.color1;
    document.getElementById('cursorFxColor2').value = finalCursorFxSettings.color2;
    document.getElementById('cursorFxRgb').checked = finalCursorFxSettings.rgb;
    document.getElementById('cursorFxCount').value = finalCursorFxSettings.count;
    document.getElementById('cursorFxCountValue').textContent = `${finalCursorFxSettings.count}%`;
    cursorFx.updateConfig(finalCursorFxSettings);
    
    const customCursorSettings = settings.fpToolsCustomCursor || {};
    const customCursorDefaults = { enabled: false, image: null, size: 32, opacity: 100, hideSystem: true };
    const finalCustomCursorSettings = { ...customCursorDefaults, ...customCursorSettings };

    document.getElementById('customCursorEnabled').checked = finalCustomCursorSettings.enabled;
    const controlsDiv = document.getElementById('customCursorControls');
    if (controlsDiv) controlsDiv.style.display = finalCustomCursorSettings.enabled ? 'block' : 'none';
    
    document.getElementById('hideSystemCursor').checked = finalCustomCursorSettings.hideSystem;
    
    document.getElementById('customCursorSize').value = finalCustomCursorSettings.size;
    document.getElementById('customCursorSizeValue').textContent = `${finalCustomCursorSettings.size}px`;
    document.getElementById('customCursorOpacity').value = finalCustomCursorSettings.opacity;
    document.getElementById('customCursorOpacityValue').textContent = `${finalCustomCursorSettings.opacity}%`;
    
    const preview = document.getElementById('cursor-image-preview');
    if (finalCustomCursorSettings.image) {
        preview.style.backgroundImage = `url(${finalCustomCursorSettings.image})`;
        preview.textContent = '';
    } else {
        preview.style.backgroundImage = 'none';
        preview.textContent = 'Нет';
    }
    cursorFx.updateCustomCursor(finalCustomCursorSettings);

    document.getElementById('showSalesStatsCheckbox').checked = settings.showSalesStats !== false;
    document.getElementById('hideBalanceCheckbox').checked = settings.hideBalance === true;
    document.getElementById('viewSellersPromoCheckbox').checked = settings.viewSellersPromo !== false;

    const savedSound = settings.notificationSound || 'default';
    const soundRadio = document.querySelector(`input[name="notificationSound"][value="${savedSound}"]`);
    if (soundRadio) {
        soundRadio.checked = true;
    }
    
}
