function initializeAutoDeliveryManager() {
    if (document.getElementById('ad-manager-placeholder')) return;

    const autoDeliveryBox = document.querySelector('.auto-delivery-box');
    const secretsTextarea = autoDeliveryBox?.querySelector('textarea.textarea-lot-secrets');
    const amountInput = document.querySelector('input[name="amount"]');
    if (!autoDeliveryBox || !secretsTextarea || !amountInput) return;

    const ITEM_CHAR_LIMIT = 140;

    const placeholder = createElement('div', { id: 'ad-manager-placeholder' });
    placeholder.innerHTML = `
        <button type="button" id="ad-open-manager-btn" class="btn btn-primary">Управлять товарами</button>
        <span id="ad-item-count-display"></span>`;

    const originalHelpBlock = secretsTextarea.nextElementSibling;
    if(originalHelpBlock) originalHelpBlock.style.display = 'none';
    secretsTextarea.style.display = 'none';
    autoDeliveryBox.appendChild(placeholder);

    const managerPopup = createElement('div', { id: 'fp-tools-ad-manager-popup' });
    managerPopup.innerHTML = `
        <div class="ad-manager-popup-header">
            <h3>Менеджер товаров для автовыдачи</h3>
            <button type="button" class="close-btn" id="ad-manager-close-btn">×</button>
        </div>
        <div class="ad-manager-popup-body">
            <div class="ad-manager-toolbar">
                <button type="button" id="ad-add-item-btn" class="btn">+ Добавить товар</button>
                <button type="button" id="ad-mass-add-btn" class="btn">Массовое добавление</button>
                <button type="button" id="ad-duplicate-btn" class="btn">Дублировать</button>
                <button type="button" id="ad-clear-all-btn" class="btn btn-default">Очистить всё</button>
                <span id="ad-item-count">Товаров: 0</span>
            </div>
            <div class="ad-items-list" id="ad-items-list-popup"></div>
        </div>
        <div class="ad-manager-popup-footer">
            <button type="button" id="ad-manager-cancel-btn" class="btn btn-default">Отмена</button>
            <button type="button" id="ad-manager-save-btn" class="btn btn-primary">Сохранить и закрыть</button>
        </div>`;
    document.body.appendChild(managerPopup);

    const massAddPopup = createElement('div', { id: 'ad-mass-add-popup', class: 'fp-tools-ad-popup' });
    massAddPopup.innerHTML = `<h4>Массовое добавление</h4><p style="font-size: 14px; color: #ccc; margin-top: -10px; margin-bottom: 15px;">Вставьте список товаров, каждый с новой строки.</p><textarea id="ad-mass-add-textarea" class="template-input" placeholder="Товар 1\nТовар 2\nТовар 3..."></textarea><div class="popup-actions"><button type="button" id="ad-mass-add-cancel" class="btn btn-default">Отмена</button><button type="button" id="ad-mass-add-confirm" class="btn">Добавить</button></div>`;
    document.body.appendChild(massAddPopup);

    const duplicatePopup = createElement('div', { id: 'ad-duplicate-popup', class: 'fp-tools-ad-popup' });
    duplicatePopup.innerHTML = `<h4>Дублирование товара</h4><p style="font-size: 14px; color: #ccc; margin-top: -10px; margin-bottom: 15px;">Введите текст товара (можно многострочный) и количество копий.</p><textarea id="ad-duplicate-textarea" class="template-input" placeholder="Текст товара..."></textarea><input type="number" id="ad-duplicate-amount" class="template-input" placeholder="Количество" min="1" value="10"><div class="popup-actions"><button type="button" id="ad-duplicate-cancel" class="btn btn-default">Отмена</button><button type="button" id="ad-duplicate-confirm" class="btn">Создать</button></div>`;
    document.body.appendChild(duplicatePopup);

    const openBtn = document.getElementById('ad-open-manager-btn');
    const countDisplay = document.getElementById('ad-item-count-display');
    const popupItemList = document.getElementById('ad-items-list-popup');
    const popupItemCount = managerPopup.querySelector('#ad-item-count');

    const updateItemCount = () => {
        const count = popupItemList.children.length;
        popupItemCount.textContent = `Товаров: ${count}`;
    };

    const updateCharCounter = (inputEl, counterEl) => {
        const len = inputEl.value.replace(/\n/g, '\\n').length;
        counterEl.textContent = `${len}/${ITEM_CHAR_LIMIT}`;
        counterEl.classList.toggle('limit-exceeded', len > ITEM_CHAR_LIMIT);
    };

    const createItemRow = (content = '') => {
        const row = createElement('div', { class: 'ad-item-row' });
        const input = createElement('textarea', { class: 'ad-item-input', rows: '1' });
        input.value = content;

        const autoResize = () => { input.style.height = 'auto'; input.style.height = `${input.scrollHeight}px`; };
        input.addEventListener('input', () => { autoResize(); updateCharCounter(input, counter); });

        const controls = createElement('div', { class: 'ad-item-controls' });
        const counter = createElement('div', { class: 'ad-char-counter' });
        const removeBtn = createElement('button', { type: 'button', class: 'ad-remove-item-btn', title: 'Удалить' }, {}, '×');

        removeBtn.addEventListener('click', () => { row.remove(); updateItemCount(); });

        controls.append(removeBtn, counter);
        row.append(input, controls);
        popupItemList.appendChild(row);

        autoResize();
        updateCharCounter(input, counter);
        return row;
    };

    const populatePopupFromTextarea = () => {
        popupItemList.innerHTML = '';
        const rawValue = secretsTextarea.value.trim();
        if (rawValue) {
            const items = rawValue.split('\n');
            items.forEach(item => {
                const displayValue = item.replace(/\\n/g, '\n');
                createItemRow(displayValue);
            });
        }
        updateItemCount();
    };

    const syncToTextarea = () => {
        const itemInputs = popupItemList.querySelectorAll('.ad-item-input');
        const values = Array.from(itemInputs).map(input => input.value.replace(/\n/g, '\\n'));
        secretsTextarea.value = values.join('\n');
        amountInput.value = values.length;
        countDisplay.textContent = `Загружено товаров: ${values.length}`;
        secretsTextarea.dispatchEvent(new Event('input', { bubbles: true }));
    };

    const updateInitialCount = () => {
         const count = secretsTextarea.value.trim() ? secretsTextarea.value.trim().split('\n').length : 0;
         countDisplay.textContent = `Загружено товаров: ${count}`;
    };

    openBtn.addEventListener('click', () => {
        populatePopupFromTextarea();
        managerPopup.style.display = 'flex';
    });

    const closeWithoutSaving = () => managerPopup.style.display = 'none';

    const saveAndCloseManager = () => {
        syncToTextarea();
        closeWithoutSaving();
        showNotification('Товары обновлены. Не забудьте сохранить сам лот.', false);
    };

    managerPopup.querySelector('#ad-manager-close-btn').addEventListener('click', saveAndCloseManager);
    managerPopup.querySelector('#ad-manager-save-btn').addEventListener('click', saveAndCloseManager);
    managerPopup.querySelector('#ad-manager-cancel-btn').addEventListener('click', closeWithoutSaving);


    managerPopup.querySelector('#ad-add-item-btn').addEventListener('click', () => {
        const newRow = createItemRow();
        updateItemCount();
        newRow.querySelector('textarea').focus();
    });

    managerPopup.querySelector('#ad-clear-all-btn').addEventListener('click', () => {
        if (confirm('Вы уверены, что хотите удалить все товары?')) {
            popupItemList.innerHTML = '';
            updateItemCount();
        }
    });

    const showPopup = (popupEl) => popupEl.style.display = 'block';
    const hidePopup = (popupEl) => popupEl.style.display = 'none';

    managerPopup.querySelector('#ad-mass-add-btn').addEventListener('click', () => showPopup(massAddPopup));
    document.getElementById('ad-mass-add-cancel').addEventListener('click', () => hidePopup(massAddPopup));
    document.getElementById('ad-mass-add-confirm').addEventListener('click', () => {
        const textarea = document.getElementById('ad-mass-add-textarea');
        const newItems = textarea.value.trim().split('\n').filter(line => line.trim() !== '');
        newItems.forEach(item => createItemRow(item));
        updateItemCount();
        textarea.value = '';
        hidePopup(massAddPopup);
    });

    managerPopup.querySelector('#ad-duplicate-btn').addEventListener('click', () => showPopup(duplicatePopup));
    document.getElementById('ad-duplicate-cancel').addEventListener('click', () => hidePopup(duplicatePopup));
    document.getElementById('ad-duplicate-confirm').addEventListener('click', () => {
        const textarea = document.getElementById('ad-duplicate-textarea');
        const amount = parseInt(document.getElementById('ad-duplicate-amount').value, 10);
        const content = textarea.value;
        if (content && amount > 0) {
            for (let i = 0; i < amount; i++) createItemRow(content);
            updateItemCount();
        }
        textarea.value = '';
        hidePopup(duplicatePopup);
    });

    updateInitialCount();
}