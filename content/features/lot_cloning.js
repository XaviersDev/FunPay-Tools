// /features/lot_cloning.js
async function submitForm(formData) {
    const nodeId = new URLSearchParams(window.location.search).get('node');
    formData.set('node_id', nodeId); formData.set('offer_id', '0');
    try {
        const response = await fetch('https://funpay.com/lots/offerSave', { method: 'POST', body: new URLSearchParams(formData) });
        if (response.ok) showNotification('Лот успешно продублирован!');
        else { console.error('Ошибка при копировании лота', response); showNotification('Ошибка при копировании лота', true); }
    } catch (error) { console.error('Ошибка при выполнении запроса', error); showNotification('Ошибка при выполнении запроса', true); }
}

function initializeLotCloning() {
    const cloneButton = createElement('button', { class: 'btn btn-default' }, { marginLeft: '10px' }, 'Копировать');
    const header = Array.from(document.querySelectorAll('h1.page-header.page-header-no-hr')).find(h1 => h1.textContent.includes('Редактирование предложения'));
    if (!header) return;
    
    header.parentNode.insertBefore(cloneButton, header.nextSibling);

    const popupMenu = createElement('div', { class: 'fp-clone-popup' }, {}, `
        <h3>Клонирование лота</h3>
        <button id="fullClone">Скопировать полностью</button>
        <button id="changeCategoryClone">Поменять категорию и скопировать</button>
        <button id="closePopup" class="btn-default-custom" style="margin-top: 15px;">Закрыть</button>`);
    document.body.appendChild(popupMenu);

    cloneButton.addEventListener('click', () => { popupMenu.classList.add('active'); });

    document.getElementById('fullClone')?.addEventListener('click', () => {
        popupMenu.classList.remove('active');
        const form = document.querySelector('form.form-offer-editor');
        if (!form) { console.error('Форма не найдена'); showNotification('Форма редактирования лота не найдена!', true); return; }
        submitForm(new FormData(form));
    });

    document.getElementById('changeCategoryClone')?.addEventListener('click', () => {
        popupMenu.classList.remove('active');
        const selects = document.querySelectorAll('select.form-control.lot-field-input, select.form-control[name="server_id"]');
        const categoryData = {};
        selects.forEach(select => {
            const labelElement = select.closest('.form-group')?.querySelector('label');
            const label = labelElement ? labelElement.textContent.trim().replace('*', '') : (select.name === 'server_id' ? 'Сервер' : 'Категория');
            if (!categoryData[label]) categoryData[label] = { name: select.name, options: [] };
            select.querySelectorAll('option').forEach(option => { if(option.value) categoryData[label].options.push({ value: option.value, text: option.textContent.trim() }); });
        });

        const existingMenu = document.querySelector('.fp-category-clone-popup');
        if(existingMenu) existingMenu.remove();

        const categoryMenu = createElement('div', { class: 'fp-category-clone-popup' });
        let htmlContent = '<h4>Выберите категории для дублирования</h4>';
        for (const label in categoryData) {
            if (categoryData[label].options.length === 0) continue;
            htmlContent += `<div class="category-group">
                              <label><input type="checkbox" class="category-select-all" data-target="${categoryData[label].name}Select"> ${label} (Выбрать все)</label>`;
            htmlContent += `<select id="${categoryData[label].name}Select" name="${categoryData[label].name}" multiple>`;
            categoryData[label].options.forEach(option => { htmlContent += `<option value="${option.value}">${option.text}</option>`; });
            htmlContent += `</select></div>`;
        }
        htmlContent += `<div id="cloneWarning"></div>`;
        htmlContent += `<div class="actions-bar">
                            <button id="copyWithCategory">Копировать выбранные</button>
                            <button id="closeCategoryMenu" class="btn-default-custom">Закрыть</button>
                        </div>`;
        categoryMenu.innerHTML = htmlContent;
        document.body.appendChild(categoryMenu);
        categoryMenu.classList.add('active');

        function updateCloneWarningState(catMenu) {
            const warningDiv = catMenu.querySelector('#cloneWarning');
            const copyBtn = catMenu.querySelector('#copyWithCategory');
            if (!warningDiv || !copyBtn) return;
            let numCombinations = 1; let hasFieldsWithSelections = false;
            catMenu.querySelectorAll('select[multiple]').forEach(select => {
                const selectedCount = select.selectedOptions.length;
                if (selectedCount > 0) { numCombinations *= selectedCount; hasFieldsWithSelections = true; }
            });
            copyBtn.disabled = !hasFieldsWithSelections;
            if (!hasFieldsWithSelections) {
                warningDiv.textContent = 'Выберите хотя бы одну опцию для создания копий.';
                warningDiv.style.display = 'block'; copyBtn.textContent = "Копировать";
            } else if (numCombinations > 0) {
                warningDiv.textContent = `Будет создано ${numCombinations} копий лота.`;
                warningDiv.style.display = 'block'; copyBtn.textContent = `Копировать (${numCombinations})`;
            } else { warningDiv.style.display = 'none'; copyBtn.textContent = "Копировать"; }
        }

        updateCloneWarningState(categoryMenu);
        categoryMenu.querySelectorAll('.category-select-all, select[multiple]').forEach(el => el.addEventListener('change', () => updateCloneWarningState(categoryMenu)));
        categoryMenu.querySelectorAll('.category-select-all').forEach(checkbox => {
            checkbox.addEventListener('change', (event) => {
                const select = categoryMenu.querySelector(`#${event.target.dataset.target}`);
                if (select) Array.from(select.options).forEach(option => option.selected = event.target.checked);
                updateCloneWarningState(categoryMenu);
            });
        });

        document.getElementById('copyWithCategory')?.addEventListener('click', async () => {
            const form = document.querySelector('form.form-offer-editor');
            if (!form) { showNotification('Форма редактирования лота не найдена!', true); return; }
            const baseFormData = new FormData(form); let combinations = [{}]; let hasCategorySelections = false;
            for (const label in categoryData) {
                const selectName = categoryData[label].name;
                const selectElement = categoryMenu.querySelector(`select[name="${selectName}"]`);
                if (!selectElement) continue;
                const selectedOptions = Array.from(selectElement.selectedOptions).map(opt => opt.value);
                if (selectedOptions.length > 0) {
                    hasCategorySelections = true; const newCombinations = [];
                    combinations.forEach(existingCombo => { selectedOptions.forEach(optionValue => { newCombinations.push({ ...existingCombo, [selectName]: optionValue }); }); });
                    combinations = newCombinations;
                }
            }
            if (!hasCategorySelections) { showNotification('Не выбрано ни одной категории для копирования.', true); return; }
            categoryMenu.classList.remove('active');
            setTimeout(() => { if (document.body.contains(categoryMenu)) document.body.removeChild(categoryMenu); }, 500);
            showNotification(`Начинается копирование ${combinations.length} лотов...`, false);
            let count = 0;
            for (const combo of combinations) {
                count++; const clonedFormData = new FormData();
                for (const [key, value] of baseFormData.entries()) clonedFormData.append(key, value);
                for (const fieldName in combo) clonedFormData.set(fieldName, combo[fieldName]);
                await submitForm(clonedFormData);
                if (count < combinations.length) await new Promise(resolve => setTimeout(resolve, 1200));
            }
            showNotification(`Копирование ${combinations.length} лотов завершено!`, false);
        });
        document.getElementById('closeCategoryMenu')?.addEventListener('click', () => {
            categoryMenu.classList.remove('active');
            setTimeout(() => { if (document.body.contains(categoryMenu)) document.body.removeChild(categoryMenu); }, 500);
        });
    });
    document.getElementById('closePopup')?.addEventListener('click', () => { popupMenu.classList.remove('active'); });
}