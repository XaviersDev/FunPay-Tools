let templateSettings = {
    buttonPosition: "bottom",
    sendTemplatesImmediately: true,
    standard: {},
    custom: []
};

const DEFAULT_STANDARD_TEMPLATES = {
    greeting: { enabled: true, label: 'Приветствие', color: '#6B66FF', text: '{welcome}, {buyername}! Чем могу помочь?' },
    completed: { enabled: true, label: 'Заказ выполнен', color: '#6B66FF', text: 'Заказ выполнен. Пожалуйста, зайдите в раздел «Покупки», выберите его в списке и нажмите кнопку «Подтвердить выполнение заказа».' },
    review: { enabled: true, label: 'Попросить отзыв', color: '#FF6B6B', text: 'Спасибо за покупку! Буду очень благодарен, если вы оставите отзыв о сделке.' },
    thanks: { enabled: true, label: 'Спасибо за заказ', color: '#FF6B6B', text: 'Спасибо за заказ, {buyername}! Обращайтесь еще. {date}' },
    reviewResponse: { enabled: true, label: 'Ответ на отзыв', color: '#6B66FF', text: 'Спасибо за ваш отзыв! Рады, что вам все понравилось.' }
};

async function loadTemplateSettings() {
    const data = await chrome.storage.local.get(['fpToolsTemplateSettings']);
    const saved = data.fpToolsTemplateSettings || {};
    
    templateSettings.buttonPosition = saved.buttonPosition || 'bottom';
    templateSettings.sendTemplatesImmediately = saved.sendTemplatesImmediately !== false;
    templateSettings.custom = saved.custom || [];
    
    templateSettings.standard = {};
    for (const key in DEFAULT_STANDARD_TEMPLATES) {
        templateSettings.standard[key] = {
            ...DEFAULT_STANDARD_TEMPLATES[key],
            ...(saved.standard ? saved.standard[key] : {})
        };
    }
}

async function saveTemplateSettings() {
    if (!chrome.runtime?.id) return;
    await chrome.storage.local.set({ fpToolsTemplateSettings: templateSettings });
}

function getWelcomeMessage() {
    const hour = new Date().getHours();
    if (hour >= 5 && hour < 12) return "Доброе утро!";
    if (hour >= 12 && hour < 18) return "Добрый день!";
    return "Добрый вечер!";
}

async function replaceTemplateVariables(template, isReviewResponse = false) {
    const now = new Date();
    const dateStr = `${now.getDate().toString().padStart(2, '0')}.${(now.getMonth() + 1).toString().padStart(2, '0')}.${now.getFullYear()} ${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
    const buyerNameElement = document.querySelector('.media-user-name a');
    const balElement = document.querySelector('.badge-balance');
    const activeSellsElement = document.querySelector('.badge-trade');
    let result = template;
    result = result.replace(/{welcome}/g, getWelcomeMessage());
    result = result.replace(/{date}/g, dateStr);
    result = result.replace(/{buyername}/g, buyerNameElement ? buyerNameElement.textContent.trim() : 'покупатель');
    result = result.replace(/{bal}/g, balElement ? balElement.textContent.trim() : 'N/A');
    result = result.replace(/{activesells}/g, activeSellsElement ? activeSellsElement.textContent.trim() : 'N/A');

    let lotName = 'лот';
    if (isReviewResponse) {
        const reviewLotNameElements = Array.from(document.querySelectorAll('.param-item h5'));
        const reviewLotNameHeader = reviewLotNameElements.find(el => el.textContent.includes('Краткое описание'));
        const reviewLotNameElement = reviewLotNameHeader ? reviewLotNameHeader.nextElementSibling : null;
        if(reviewLotNameElement) lotName = reviewLotNameElement.textContent.trim();
    } else {
        const lotNameInChat = document.querySelector('.deal-desc-lot a');
        if(lotNameInChat) lotName = lotNameInChat.textContent.trim();
    }
    result = result.replace(/{lotname}/g, lotName);

    const aiRegex = /\{ai:([^}]+)\}/g;
    let match;
    const aiPromises = [];
    const aiPlaceholders = [];

    let tempResult = result;
    let placeholderIndex = 0;
    while ((match = aiRegex.exec(result)) !== null) {
        const aiPrompt = match[1];
        const placeholder = `__AI_PLACEHOLDER_${placeholderIndex++}__`;
        aiPlaceholders.push({ placeholder: placeholder, originalMatch: match[0] });
        aiPromises.push(getAIProcessedText(aiPrompt, "generate"));
        tempResult = tempResult.replace(match[0], placeholder);
    }

    result = tempResult;

    if (aiPromises.length > 0) {
        const chatInputForLoading = document.querySelector('.chat-form-input .form-control');
        if (chatInputForLoading) {
             chatInputForLoading.classList.add('ai-loading-textarea');
             chatInputForLoading.disabled = true;
        }
        try {
            const aiResults = await Promise.all(aiPromises);
            aiPlaceholders.forEach((ph, index) => {
                result = result.replace(ph.placeholder, aiResults[index] || "");
            });
        } catch (error) {
            console.error("Error processing one or more AI variables:", error);
            showNotification("Ошибка при обработке одной или нескольких AI переменных.", true);
            aiPlaceholders.forEach(ph => {
                result = result.replace(ph.placeholder, ph.originalMatch);
            });
        } finally {
             if (chatInputForLoading) {
                chatInputForLoading.classList.remove('ai-loading-textarea');
                chatInputForLoading.disabled = false;
             }
        }
    }
    return result;
}

async function applyTemplateToInput(chatInput, templateContent, isReview = false) {
    if (!chatInput || templateContent === undefined) return;
    const processedText = await replaceTemplateVariables(templateContent, isReview);
    chatInput.value = processedText;
    chatInput.focus();
    chatInput.dispatchEvent(new Event('input', { bubbles: true }));
    chatInput.selectionStart = chatInput.selectionEnd = chatInput.value.length;
}

function showEmptyTemplateModal(templateKey, isCustom) {
    const existingOverlay = document.querySelector('.fp-tools-empty-template-overlay');
    if (existingOverlay) existingOverlay.remove();

    const overlay = createElement('div', { class: 'fp-tools-empty-template-overlay' });
    const modal = createElement('div', { class: 'fp-tools-empty-template-modal' });
    
    modal.innerHTML = `
        <h4>Шаблон пуст</h4>
        <p>Хотите добавить текст для этой кнопки прямо сейчас?</p>
        <textarea class="template-input" placeholder="Введите текст шаблона..."></textarea>
        <div class="modal-actions">
            <button class="btn" id="empty-template-save">Сохранить</button>
            <button class="btn btn-default" id="empty-template-close">Закрыть</button>
        </div>
    `;
    
    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    const closeModal = () => overlay.remove();
    
    overlay.querySelector('#empty-template-close').addEventListener('click', closeModal);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) closeModal(); });

    overlay.querySelector('#empty-template-save').addEventListener('click', async () => {
        const newText = modal.querySelector('textarea').value;
        if (newText.trim()) {
            if (isCustom) {
                const template = templateSettings.custom.find(t => t.id === templateKey);
                if (template) template.text = newText;
            } else {
                if (templateSettings.standard[templateKey]) {
                    templateSettings.standard[templateKey].text = newText;
                }
            }
            await saveTemplateSettings();
            await addChatTemplateButtons();
            showNotification('Шаблон обновлен!', false);
            closeModal();
        } else {
            showNotification('Текст не может быть пустым', true);
        }
    });
}

async function useTemplate(templateConfig) {
    if (!templateConfig.text || templateConfig.text.trim() === '') {
        showEmptyTemplateModal(templateConfig.isCustom ? templateConfig.id : templateConfig.key, templateConfig.isCustom);
        return;
    }
    
    const data = await chrome.storage.local.get('fpToolsTemplateSettings');
    const sendTemplatesImmediately = data.fpToolsTemplateSettings?.sendTemplatesImmediately !== false;

    const chatInput = document.querySelector('.chat-form-input .form-control');
    if (!chatInput) return;

    await applyTemplateToInput(chatInput, templateConfig.text, false);

    if (!sendTemplatesImmediately) return;

    const chatForm = chatInput.closest('form');
    if (!chatForm) return;
    const submitButton = chatForm.querySelector('button[type="submit"]');
    if (!submitButton) return;

    await waitForElementToBeEnabled(submitButton);

    if (!submitButton.disabled) {
        submitButton.click();
    }
}

async function addReviewResponseButton() {
    const publishButton = Array.from(document.getElementsByTagName('button')).find(button => button.textContent.trim() === 'Опубликовать');
    if (publishButton && !document.querySelector('.review-response-btn')) {
        const reviewResponseTemplate = templateSettings.standard.reviewResponse;
        if (!reviewResponseTemplate || !reviewResponseTemplate.enabled) return;

        const responseButton = document.createElement('button');
        responseButton.type = 'button';
        responseButton.className = 'btn btn-default review-response-btn';
        responseButton.textContent = reviewResponseTemplate.label;
        responseButton.style.marginLeft = '10px';
        
        responseButton.addEventListener('click', async () => {
            const reviewEditor = document.querySelector('.review-editor-reply .form-control');
            if (!reviewResponseTemplate.text.trim()) {
                showEmptyTemplateModal('reviewResponse', false);
            } else {
                await applyTemplateToInput(reviewEditor, reviewResponseTemplate.text, true);
            }
        });
        publishButton.parentNode.insertBefore(responseButton, publishButton.nextSibling);
    }
}

function createTemplateButton(config) {
    const isSidebar = templateSettings.buttonPosition === 'sidebar';
    const btn = createElement('button', {
        type: 'button',
        class: isSidebar ? 'sidebar-template-btn' : (config.isCustom ? 'custom-chat-template-btn' : 'chat-template-btn')
    });
    
    if (isSidebar) {
        btn.style.setProperty('--template-color', config.color);
        btn.textContent = config.label;
    } else {
        btn.textContent = config.label;
        btn.style.backgroundColor = config.color;
    }

    btn.addEventListener('click', () => useTemplate(config));

    const preview = createElement('div', { class: 'fp-tools-template-preview' });
    preview.textContent = config.text || '(Пусто)';
    btn.appendChild(preview);

    return btn;
}

async function addChatTemplateButtons() {
    await loadTemplateSettings();
    const chatInput = document.querySelector('.chat-form-input .form-control');
    if (!chatInput) return;

    document.querySelectorAll('.chat-buttons-container, .fp-tools-template-sidebar').forEach(el => el.remove());

    let buttonsContainer;
    const position = templateSettings.buttonPosition;

    if (position === 'sidebar') {
        let chatDetail = document.querySelector('.chat-detail-list');
        if (!chatDetail) {
             const detailContainer = document.querySelector('.chat-detail');
             if(detailContainer) {
                chatDetail = createElement('div', {class: 'chat-detail-list custom-scroll'});
                detailContainer.appendChild(chatDetail);
             } else {
                return;
             }
        }
        buttonsContainer = createElement('div', { class: 'fp-tools-template-sidebar' });
        chatDetail.prepend(buttonsContainer);
    } else {
        buttonsContainer = createElement('div', { class: 'chat-buttons-container' });
        chatInput.parentElement.insertBefore(buttonsContainer, chatInput);
    }

    for (const key in templateSettings.standard) {
        const config = templateSettings.standard[key];
        if (key !== 'reviewResponse' && config.enabled) {
            const btn = createTemplateButton({ ...config, key: key, isCustom: false });
            buttonsContainer.appendChild(btn);
        }
    }

    templateSettings.custom.forEach(config => {
        if (config.enabled) {
            const btn = createTemplateButton({ ...config, isCustom: true });
            buttonsContainer.appendChild(btn);
        }
    });
}