async function submitForm(formData) {
    const nodeId = new URLSearchParams(window.location.search).get('node');
    formData.set('node_id', nodeId); formData.set('offer_id', '0');
    try {
        const response = await fetch('https://funpay.com/lots/offerSave', { method: 'POST', body: new URLSearchParams(formData) });
        if (response.ok) showNotification('Лот успешно продублирован!');
        else { console.error('Ошибка при копировании лота', response); showNotification('Ошибка при копировании лота', true); }
    } catch (error) { console.error('Ошибка при выполнении запроса', error); showNotification('Ошибка при выполнении запроса', true); }
}

async function fetchLotDataForImport(nodeId, offerId) {
    if (!nodeId || !offerId) {
        throw new Error('Не найден ID лота или категории.');
    }
    const editUrl = `https://funpay.com/lots/offerEdit?node=${nodeId}&offer=${offerId}&location=offer`;
    const response = await fetch(editUrl);
    if (!response.ok) {
        throw new Error(`Ошибка сети: ${response.status}`);
    }
    const html = await response.text();
    const doc = new DOMParser().parseFromString(html, 'text/html');

    const getValue = (selector) => doc.querySelector(selector)?.value || '';
        
    return {
        summary: {
            ru: getValue('input[name="fields[summary][ru]"]'),
            en: getValue('input[name="fields[summary][en]"]')
        },
        desc: {
            ru: getValue('textarea[name="fields[desc][ru]"]'),
            en: getValue('textarea[name="fields[desc][en]"]')
        },
        payment_msg: {
            ru: getValue('textarea[name="fields[payment_msg][ru]"]'),
            en: getValue('textarea[name="fields[payment_msg][en]"]')
        },
        secrets: getValue('textarea[name="secrets"]')
    };
}


function initializeLotCloning() {
    const header = Array.from(document.querySelectorAll('h1.page-header.page-header-no-hr')).find(h1 => h1.textContent.includes('Редактирование предложения') || h1.textContent.includes('Добавление предложения'));
    if (!header) return;

    let actionsContainer = document.querySelector('.fp-tools-lot-edit-actions-container');
    if (!actionsContainer) {
        actionsContainer = createElement('div', { class: 'fp-tools-lot-edit-actions-container' });
        header.parentNode.insertBefore(actionsContainer, header.nextSibling);
    }
    
    if (!document.querySelector('.fp-tools-clone-btn')) {
        const cloneButton = createElement('button', { class: 'btn btn-default fp-tools-clone-btn' }, {}, 'Копировать');
        actionsContainer.appendChild(cloneButton);

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
            if (!form) { showNotification('Форма редактирования лота не найдена!', true); return; }
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

    if (!document.querySelector('.fp-tools-import-btn')) {
        const importButton = createElement('button', { class: 'btn btn-default fp-tools-import-btn' }, {}, 'Импорт');
        actionsContainer.appendChild(importButton);
        createImportModal();

        importButton.addEventListener('click', async () => {
            const modal = document.getElementById('fp-tools-import-modal-overlay');
            modal.style.display = 'flex';
            const listContainer = document.getElementById('fp-import-lot-list');
            listContainer.innerHTML = '<div class="fp-import-loader"></div>';
            
            try {
                const appData = JSON.parse(document.body.dataset.appData);
                const userId = appData.userId;
                const lots = await chrome.runtime.sendMessage({ action: 'getUserLotsList', userId: userId });
                
                if (lots && lots.length > 0) {
                    let lotsHtml = '';
                    lots.forEach(lot => {
                        lotsHtml += `<div class="fp-import-lot-item" data-node-id="${lot.nodeId}" data-offer-id="${lot.id}">
                            <span class="fp-import-lot-title">${lot.title}</span>
                            <span class="fp-import-lot-id">#${lot.id}</span>
                        </div>`;
                    });
                    listContainer.innerHTML = lotsHtml;
                } else {
                    listContainer.innerHTML = '<div class="fp-import-empty">Не найдено лотов на вашем профиле.</div>';
                }
            } catch (error) {
                listContainer.innerHTML = `<div class="fp-import-empty">Ошибка загрузки лотов: ${error.message}</div>`;
            }
        });
    }
}

function createImportModal() {
    if (document.getElementById('fp-tools-import-modal-overlay')) return;

    const modalOverlay = createElement('div', { id: 'fp-tools-import-modal-overlay' });
    modalOverlay.innerHTML = `
        <div id="fp-tools-import-modal">
            <div class="fp-import-col-list">
                <h4>Выберите лот для импорта</h4>
                <input type="text" id="fp-import-search" placeholder="Поиск по названию...">
                <div id="fp-import-lot-list"></div>
            </div>
            <div class="fp-import-col-preview">
                <h4>Предпросмотр и опции</h4>
                <div id="fp-import-preview-content">
                    <div class="fp-import-empty">Выберите лот из списка слева</div>
                </div>
            </div>
        </div>
    `;
    document.body.appendChild(modalOverlay);

    modalOverlay.addEventListener('click', (e) => {
        if (e.target === modalOverlay) {
            modalOverlay.style.display = 'none';
        }
    });

    document.getElementById('fp-import-search').addEventListener('input', (e) => {
        const query = e.target.value.toLowerCase();
        document.querySelectorAll('.fp-import-lot-item').forEach(item => {
            const title = item.querySelector('.fp-import-lot-title').textContent.toLowerCase();
            item.style.display = title.includes(query) ? '' : 'none';
        });
    });

    document.getElementById('fp-import-lot-list').addEventListener('click', async (e) => {
        const item = e.target.closest('.fp-import-lot-item');
        if (!item) return;

        document.querySelectorAll('.fp-import-lot-item').forEach(el => el.classList.remove('active'));
        item.classList.add('active');
        
        const previewContainer = document.getElementById('fp-import-preview-content');
        previewContainer.innerHTML = '<div class="fp-import-loader"></div>';

        const nodeId = item.dataset.nodeId;
        const offerId = item.dataset.offerId;

        try {
            const lotData = await fetchLotDataForImport(nodeId, offerId);
            renderPreview(lotData);
        } catch (error) {
            previewContainer.innerHTML = `<div class="fp-import-empty">Ошибка: ${error.message}</div>`;
        }
    });
}

function renderPreview(data) {
    const previewContainer = document.getElementById('fp-import-preview-content');
    previewContainer.innerHTML = `
        <div class="fp-import-options">
            <label><input type="checkbox" data-field="summary" checked> Краткое описание</label>
            <label><input type="checkbox" data-field="desc" checked> Подробное описание</label>
            <label><input type="checkbox" data-field="payment_msg" checked> Сообщение покупателю</label>
            <label><input type="checkbox" data-field="secrets" checked> Автовыдача</label>
        </div>
        <div class="fp-import-preview-fields">
            <div class="fp-import-preview-field">
                <label>Краткое описание (RU):</label>
                <textarea readonly>${data.summary.ru}</textarea>
            </div>
            <div class="fp-import-preview-field">
                <label>Краткое описание (EN):</label>
                <textarea readonly>${data.summary.en}</textarea>
            </div>
             <div class="fp-import-preview-field">
                <label>Подробное описание (RU):</label>
                <textarea readonly>${data.desc.ru}</textarea>
            </div>
            <div class="fp-import-preview-field">
                <label>Подробное описание (EN):</label>
                <textarea readonly>${data.desc.en}</textarea>
            </div>
            <div class="fp-import-preview-field">
                <label>Сообщение покупателю (RU):</label>
                <textarea readonly>${data.payment_msg.ru}</textarea>
            </div>
            <div class="fp-import-preview-field">
                <label>Сообщение покупателю (EN):</label>
                <textarea readonly>${data.payment_msg.en}</textarea>
            </div>
            <div class="fp-import-preview-field">
                <label>Товары для автовыдачи (${data.secrets.split('\n').filter(Boolean).length} шт.):</label>
                <textarea readonly>${data.secrets}</textarea>
            </div>
        </div>
        <div class="fp-import-actions">
            <button id="fp-import-apply-btn" class="btn btn-primary">Импортировать</button>
        </div>
    `;
    
    document.getElementById('fp-import-apply-btn').addEventListener('click', () => {
        const checkedFields = Array.from(document.querySelectorAll('.fp-import-options input:checked')).map(cb => cb.dataset.field);

        const mappings = {
            summary: { ru: 'fields[summary][ru]', en: 'fields[summary][en]' },
            desc: { ru: 'fields[desc][ru]', en: 'fields[desc][en]' },
            payment_msg: { ru: 'fields[payment_msg][ru]', en: 'fields[payment_msg][en]' },
            secrets: 'secrets'
        };

        checkedFields.forEach(field => {
            if (field === 'secrets') {
                const el = document.querySelector(`textarea[name="${mappings.secrets}"]`);
                if(el) el.value = data.secrets;
            } else {
                const elRu = document.querySelector(`[name="${mappings[field].ru}"]`);
                const elEn = document.querySelector(`[name="${mappings[field].en}"]`);
                if (elRu) elRu.value = data[field].ru;
                if (elEn) elEn.value = data[field].en;
            }
        });
        
        document.querySelectorAll('.lot-field-input, textarea[name="secrets"]').forEach(el => el.dispatchEvent(new Event('input', { bubbles: true })));

        document.getElementById('fp-tools-import-modal-overlay').style.display = 'none';
        showNotification('Данные успешно импортированы!', false);
    });
}