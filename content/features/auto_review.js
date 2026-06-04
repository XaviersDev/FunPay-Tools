// content/features/auto_review.js

/**
 * Инициализирует UI для всех функций авто-ответов в настройках FP Tools
 */
async function initializeAutoReviewUI() {
    const page = document.querySelector('.fp-tools-page-content[data-page="auto_review"]');
    if (!page || page.dataset.initialized) return;

    const { fpToolsAutoReplies = {} } = await chrome.storage.local.get('fpToolsAutoReplies');
    
    const settings = {
        autoReviewEnabled: fpToolsAutoReplies.autoReviewEnabled || false,
        reviewTemplates: fpToolsAutoReplies.reviewTemplates || {},
        greetingEnabled: fpToolsAutoReplies.greetingEnabled || false,
        greetingText: fpToolsAutoReplies.greetingText || 'Здравствуйте! Чем могу помочь?',
        keywordsEnabled: fpToolsAutoReplies.keywordsEnabled || false,
        keywords: fpToolsAutoReplies.keywords || [],
        bonusForReviewEnabled: fpToolsAutoReplies.bonusForReviewEnabled || false,
        bonusMode: fpToolsAutoReplies.bonusMode || 'single',
        singleBonusText: fpToolsAutoReplies.singleBonusText || '',
        randomBonuses: fpToolsAutoReplies.randomBonuses || []
    };

    document.getElementById('bonusForReviewEnabled').checked = settings.bonusForReviewEnabled;
    const bonusModeRadio = document.querySelector(`input[name="bonusMode"][value="${settings.bonusMode}"]`);
    if (bonusModeRadio) bonusModeRadio.checked = true;
    document.getElementById('singleBonusText').value = settings.singleBonusText;
    
    const singleBonusContainer = document.getElementById('singleBonusContainer');
    const randomBonusContainer = document.getElementById('randomBonusContainer');
    
    const toggleBonusContainers = () => {
        const mode = document.querySelector('input[name="bonusMode"]:checked').value;
        singleBonusContainer.style.display = mode === 'single' ? 'block' : 'none';
        randomBonusContainer.style.display = mode === 'random' ? 'block' : 'none';
    };
    
    document.querySelectorAll('input[name="bonusMode"]').forEach(radio => {
        radio.addEventListener('change', toggleBonusContainers);
    });
    
    toggleBonusContainers();
    renderBonusesList(settings.randomBonuses);

    const setCheck = (id, val) => { const el = document.getElementById(id); if (el) el.checked = !!val; };
    const setVal   = (id, val) => { const el = document.getElementById(id); if (el) el.value  = val || ''; };

    setCheck('autoReviewEnabled', settings.autoReviewEnabled);
    for (let i = 1; i <= 5; i++) setVal(`fpt-review-${i}`, settings.reviewTemplates?.[i]);
    setCheck('greetingEnabled',       settings.greetingEnabled);
    setVal('greetingText',            settings.greetingText || 'Здравствуйте! Чем могу помочь?');
    setCheck('onlyNewChats',          settings.onlyNewChats);
    setCheck('ignoreSystemMessages',  settings.ignoreSystemMessages);
    setVal('greetingCooldownDays',    settings.greetingCooldownDays ?? 0);
    setCheck('keywordsEnabled',       settings.keywordsEnabled);
    // 3.0: New fields
    setCheck('newOrderReplyEnabled',     settings.newOrderReplyEnabled);
    setVal('newOrderReplyText',          settings.newOrderReplyText);
    setCheck('orderConfirmReplyEnabled', settings.orderConfirmReplyEnabled);
    setVal('orderConfirmReplyText',      settings.orderConfirmReplyText);
    setCheck('typingDelay',              settings.typingDelay);
    
    renderKeywordsList(settings.keywords);

    let saveTimeout;
    const saveOnChange = async () => {
        clearTimeout(saveTimeout);
        saveTimeout = setTimeout(async () => {
            const storedData = await chrome.storage.local.get('fpToolsAutoReplies');
            const currentSettings = storedData.fpToolsAutoReplies || {};
            
            const getChecked = id => document.getElementById(id)?.checked ?? false;
            const getVal = id => document.getElementById(id)?.value || '';

            const newSettings = {
                ...currentSettings,
                // Review replies
                autoReviewEnabled: getChecked('autoReviewEnabled'),
                reviewTemplates: {
                    '5': getVal('fpt-review-5'),
                    '4': getVal('fpt-review-4'),
                    '3': getVal('fpt-review-3'),
                    '2': getVal('fpt-review-2'),
                    '1': getVal('fpt-review-1')
                },
                // Greeting
                greetingEnabled:       getChecked('greetingEnabled'),
                greetingText:          getVal('greetingText'),
                onlyNewChats:          getChecked('onlyNewChats'),
                ignoreSystemMessages:  getChecked('ignoreSystemMessages'),
                greetingCooldownDays:  parseFloat(getVal('greetingCooldownDays') || '0'),
                // Keywords
                keywordsEnabled: getChecked('keywordsEnabled'),
                // Bonus
                bonusForReviewEnabled: getChecked('bonusForReviewEnabled'),
                bonusMode:             document.querySelector('input[name="bonusMode"]:checked')?.value || 'single',
                singleBonusText:       getVal('singleBonusText'),
                // 3.0: New order / confirm replies
                newOrderReplyEnabled:     getChecked('newOrderReplyEnabled'),
                newOrderReplyText:        getVal('newOrderReplyText'),
                orderConfirmReplyEnabled: getChecked('orderConfirmReplyEnabled'),
                orderConfirmReplyText:    getVal('orderConfirmReplyText'),
            };
            await chrome.storage.local.set({ fpToolsAutoReplies: newSettings });
            console.log("FP Tools: Auto-reply settings saved.");
        }, 500);
    };

    page.querySelectorAll('input[type="checkbox"], textarea, input[name="bonusMode"]').forEach(el => {
        el.addEventListener('change', saveOnChange);
        el.addEventListener('input', saveOnChange);
    });

    // === НОВАЯ ЛОГИКА ДЛЯ КНОПОК ИЗОБРАЖЕНИЙ ===
    page.addEventListener('click', (e) => {
        if (e.target.classList.contains('add-image-btn')) {
            const textarea = e.target.previousElementSibling;
            if (textarea && textarea.tagName === 'TEXTAREA') {
                handleImageAddClick(textarea);
            }
        }
    });
    // === КОНЕЦ НОВОЙ ЛОГИКИ ===

    // Edit state: which existing rule (if any) the add-form is currently editing.
    let editingKeywordIndex = -1;
    const addKeywordBtn = document.getElementById('addKeywordBtn');
    const kwInput = document.getElementById('newKeyword');
    const kwResponse = document.getElementById('newKeywordResponse');

    const resetKeywordForm = () => {
        editingKeywordIndex = -1;
        kwInput.value = '';
        kwResponse.value = '';
        const exactRadio = document.querySelector('input[name="newKeywordMatchMode"][value="exact"]');
        if (exactRadio) exactRadio.checked = true;
        addKeywordBtn.textContent = 'Добавить правило';
        addKeywordBtn.classList.remove('fpt-editing-rule');
        // clear any attached image from the response field
        if (typeof __fptAttachments !== 'undefined') __fptAttachments.delete(kwResponse);
        delete kwResponse.dataset.fptImages;
        delete kwResponse.dataset.fptSendOrder;
        if (typeof fptRenderAttachments === 'function') fptRenderAttachments(kwResponse);
    };

    addKeywordBtn.addEventListener('click', async () => {
        const keyword = kwInput.value.trim().toLowerCase();
        const response = kwResponse.value.trim();
        const matchModeEl = document.querySelector('input[name="newKeywordMatchMode"]:checked');
        const matchMode = matchModeEl ? matchModeEl.value : 'exact';

        // read any image attached to the response field
        let images = [];
        if (kwResponse.dataset.fptImages) { try { images = JSON.parse(kwResponse.dataset.fptImages); } catch(_){} }
        const sendOrder = kwResponse.dataset.fptSendOrder === 'image_first' ? 'image_first' : 'text_first';

        if (!keyword || (!response && !images.length)) {
            showNotification('Заполните ключевое слово и ответ (текст или картинку).', true);
            return;
        }

        const { fpToolsAutoReplies = {} } = await chrome.storage.local.get('fpToolsAutoReplies');
        const keywords = fpToolsAutoReplies.keywords || [];
        const rule = { keyword, response, matchMode };
        if (images.length) rule.images = images;
        if (images.length) rule.sendOrder = sendOrder;

        if (editingKeywordIndex >= 0 && editingKeywordIndex < keywords.length) {
            keywords[editingKeywordIndex] = rule;   // overwrite existing rule
            showNotification('Правило обновлено!');
        } else {
            keywords.push(rule);                     // add new rule
        }
        fpToolsAutoReplies.keywords = keywords;

        await chrome.storage.local.set({ fpToolsAutoReplies });
        renderKeywordsList(keywords);
        resetKeywordForm();
    });
    
    document.getElementById('addBonusBtn').addEventListener('click', async () => {
        const bonusText = document.getElementById('newBonusText').value.trim();
        if (!bonusText) {
            showNotification('Текст бонуса не может быть пустым.', true);
            return;
        }
        
        const { fpToolsAutoReplies = {} } = await chrome.storage.local.get('fpToolsAutoReplies');
        const bonuses = fpToolsAutoReplies.randomBonuses || [];
        bonuses.push(bonusText);
        fpToolsAutoReplies.randomBonuses = bonuses;

        await chrome.storage.local.set({ fpToolsAutoReplies });
        renderBonusesList(bonuses);
        document.getElementById('newBonusText').value = '';
    });

    document.getElementById('bonus-list-container').addEventListener('click', async (e) => {
        if (e.target.classList.contains('delete-bonus-btn')) {
            const index = parseInt(e.target.dataset.index, 10);
            const { fpToolsAutoReplies = {} } = await chrome.storage.local.get('fpToolsAutoReplies');
            const bonuses = fpToolsAutoReplies.randomBonuses || [];
            bonuses.splice(index, 1);
            fpToolsAutoReplies.randomBonuses = bonuses;
            
            await chrome.storage.local.set({ fpToolsAutoReplies });
            renderBonusesList(bonuses);
        }
    });

    document.getElementById('keywords-list-container').addEventListener('click', async (e) => {
        const editBtn = e.target.closest('.fpt-edit-keyword-btn');
        if (editBtn) {
            const index = parseInt(editBtn.dataset.index, 10);
            const { fpToolsAutoReplies = {} } = await chrome.storage.local.get('fpToolsAutoReplies');
            const keywords = fpToolsAutoReplies.keywords || [];
            const rule = keywords[index];
            if (!rule) return;

            // load the rule into the add-form for editing
            editingKeywordIndex = index;
            kwInput.value = rule.keyword || '';
            kwResponse.value = rule.response || '';
            const modeRadio = document.querySelector(`input[name="newKeywordMatchMode"][value="${rule.matchMode || 'exact'}"]`);
            if (modeRadio) modeRadio.checked = true;

            // restore attached image (if any) onto the response field
            if (typeof __fptAttachments !== 'undefined') __fptAttachments.delete(kwResponse);
            delete kwResponse.dataset.fptImages;
            delete kwResponse.dataset.fptSendOrder;
            if (Array.isArray(rule.images) && rule.images.length) {
                const arr = rule.images.map(d => ({ id: Math.random().toString(36).slice(2, 8), dataUrl: d }));
                if (typeof __fptAttachments !== 'undefined') __fptAttachments.set(kwResponse, arr);
                kwResponse.dataset.fptImages = JSON.stringify(rule.images);
                if (rule.sendOrder) kwResponse.dataset.fptSendOrder = rule.sendOrder;
            }
            if (typeof fptRenderAttachments === 'function') fptRenderAttachments(kwResponse);

            addKeywordBtn.textContent = 'Сохранить изменения';
            addKeywordBtn.classList.add('fpt-editing-rule');
            // highlight the row being edited
            document.querySelectorAll('.keyword-item.fpt-editing').forEach(el => el.classList.remove('fpt-editing'));
            editBtn.closest('.keyword-item')?.classList.add('fpt-editing');
            kwInput.focus();
            kwInput.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            return;
        }

        const delBtn = e.target.closest('.delete-keyword-btn');
        if (delBtn) {
            const index = parseInt(delBtn.dataset.index, 10);
            const { fpToolsAutoReplies = {} } = await chrome.storage.local.get('fpToolsAutoReplies');
            const keywords = fpToolsAutoReplies.keywords || [];
            keywords.splice(index, 1);
            fpToolsAutoReplies.keywords = keywords;
            
            await chrome.storage.local.set({ fpToolsAutoReplies });
            renderKeywordsList(keywords);
            // if we were editing the deleted (or a shifted) rule, reset the form
            if (editingKeywordIndex === index) resetKeywordForm();
        }
    });

    page.dataset.initialized = 'true';
}

function renderKeywordsList(keywords) {
    const listContainer = document.getElementById('keywords-list-container');
    if (!listContainer) return;
    
    if (keywords.length === 0) {
        listContainer.innerHTML = '<p class="template-info" style="text-align:center;">Нет правил для ключевых слов.</p>';
        return;
    }

    const esc = (s) => String(s == null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    listContainer.innerHTML = keywords.map((item, index) => {
        const modeBadge = item.matchMode === 'contains'
            ? '<span style="font-size:10px;background:#1e2030;padding:1px 5px;border-radius:3px;color:#7a7f9a;margin-left:4px;">содержит</span>'
            : '<span style="font-size:10px;background:#1e2030;padding:1px 5px;border-radius:3px;color:#7a7f9a;margin-left:4px;">точно</span>';
        // show a small icon if the rule has an attached image
        const imgMarker = (Array.isArray(item.images) && item.images.length)
            ? '<span class="material-symbols-rounded fpt-kw-img-marker" title="К правилу прикреплено изображение">image</span>'
            : '';
        return `
        <div class="keyword-item" data-index="${index}">
            <div class="keyword-pair">
                <span class="keyword-key">${esc(item.keyword)}</span>${modeBadge}
                <span class="keyword-arrow">→</span>
                <span class="keyword-value">${esc(item.response)}</span>${imgMarker}
            </div>
            <div class="fpt-kw-actions">
                <button class="fpt-edit-keyword-btn" data-index="${index}" title="Редактировать"><span class="material-symbols-rounded">edit</span></button>
                <button class="btn btn-default delete-keyword-btn" data-index="${index}">Удалить</button>
            </div>
        </div>`;
    }).join('');
}

function renderBonusesList(bonuses) {
    const listContainer = document.getElementById('bonus-list-container');
    if (!listContainer) return;
    
    if (!bonuses || bonuses.length === 0) {
        listContainer.innerHTML = '<p class="template-info" style="text-align:center;">Добавьте хотя бы один бонус.</p>';
        return;
    }

    listContainer.innerHTML = bonuses.map((text, index) => `
        <div class="bonus-item">
            <span class="bonus-text">${text}</span>
            <button class="btn btn-default delete-bonus-btn" data-index="${index}">Удалить</button>
        </div>
    `).join('');
}

async function initializeAutoReview() {
    // This function is no longer needed as all logic is in background.js
}
