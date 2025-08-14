async function saveAccountsList() {
    await chrome.storage.local.set({ fpToolsAccounts: fpToolsAccounts });
    renderAccountsList();
}

async function renderAccountsList() {
    const listContainer = document.getElementById('fpToolsAccountsList');
    if (!listContainer) return;

    const currentUsernameEl = document.querySelector('.user-link-name');
    const currentUsername = currentUsernameEl ? currentUsernameEl.textContent.trim() : null;
    
    listContainer.innerHTML = '';
    if (fpToolsAccounts.length === 0) {
        listContainer.innerHTML = '<p style="font-size: 14px; color: #a0a0a0;">Нет сохраненных аккаунтов.</p>';
        return;
    }

    fpToolsAccounts.forEach((account, index) => {
        const isActive = account.name === currentUsername;
        const item = createElement('div', { class: `account-item ${isActive ? 'active' : ''}` });
        
        const nameSpan = createElement('span', { class: 'account-name' });
        nameSpan.textContent = account.name;
        
        const actionsDiv = createElement('div', { class: 'account-actions' });
        
        const switchBtn = createElement('button', { class: 'btn btn-primary switch-account-btn' });
        switchBtn.textContent = isActive ? 'Активен' : 'Войти';
        switchBtn.disabled = isActive;
        switchBtn.addEventListener('click', () => {
            showNotification(`Переключаюсь на аккаунт ${account.name}...`, false);
            chrome.runtime.sendMessage({ action: 'setGoldenKey', key: account.key });
        });

        const renameBtn = createElement('button', { class: 'btn btn-default rename-account-btn' });
        renameBtn.textContent = '✏️';
        renameBtn.addEventListener('click', () => {
            const newName = prompt('Введите новое имя для аккаунта:', account.name);
            if (newName && newName.trim() !== '') {
                fpToolsAccounts[index].name = newName.trim();
                saveAccountsList();
            }
        });

        const deleteBtn = createElement('button', { class: 'btn btn-default delete-account-btn' });
        deleteBtn.innerHTML = '🗑️';
        deleteBtn.addEventListener('click', () => {
            if (confirm(`Вы уверены, что хотите удалить аккаунт "${account.name}"?`)) {
                fpToolsAccounts.splice(index, 1);
                saveAccountsList();
            }
        });

        actionsDiv.append(renameBtn, deleteBtn, switchBtn);
        item.append(nameSpan, actionsDiv);
        listContainer.appendChild(item);
    });
}

function setupAccountManagementHandlers() {
    const addBtn = document.getElementById('addCurrentAccountBtn');
    // Проверяем, не был ли обработчик уже привязан
    if (!addBtn || addBtn.dataset.handlerAttached) return;

    addBtn.addEventListener('click', async () => {
        const currentUsernameEl = document.querySelector('.user-link-name');
        const currentUsername = currentUsernameEl ? currentUsernameEl.textContent.trim() : null;

        if (!currentUsername) {
            showNotification('Не удалось определить имя текущего пользователя.', true);
            return;
        }

        if (fpToolsAccounts.some(acc => acc.name === currentUsername)) {
            showNotification(`Аккаунт "${currentUsername}" уже добавлен.`, true);
            return;
        }
        
        try {
            const response = await chrome.runtime.sendMessage({ action: 'getGoldenKey' });
            if (response && response.success) {
                fpToolsAccounts.push({ name: currentUsername, key: response.key });
                await saveAccountsList();
                showNotification(`Аккаунт "${currentUsername}" успешно добавлен!`);
            } else {
                showNotification('Не удалось получить ключ сессии. Вы вошли в аккаунт?', true);
            }
        } catch (error) {
            showNotification(`Ошибка при добавлении аккаунта: ${error.message}`, true);
        }
    });

    // Помечаем, что обработчик привязан, чтобы избежать дублирования
    addBtn.dataset.handlerAttached = 'true';
}