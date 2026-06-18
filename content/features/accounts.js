async function saveAccountsList() {
    await chrome.storage.local.set({ fpToolsAccounts: fpToolsAccounts });
    renderAccountsList();
}

const _fptAccSnapCache = {}; // key -> { ts, snapshot }

async function fptFetchAccountSnapshot(key) {
    try {
        const res = await chrome.runtime.sendMessage({ action: 'getAccountSnapshot', key });
        if (res && res.ok) {
            _fptAccSnapCache[key] = { ts: Date.now(), snapshot: res.snapshot || {} };
            return res.snapshot || {};
        }
    } catch (_) {}
    return null;
}

async function renderAccountsList() {
    const listContainer = document.getElementById('fpToolsAccountsList');
    if (!listContainer) return;

    const currentUsernameEl = document.querySelector('.user-link-name');
    const currentUsername = currentUsernameEl ? currentUsernameEl.textContent.trim() : null;

    listContainer.innerHTML = '';
    if (fpToolsAccounts.length === 0) {
        listContainer.innerHTML = '<p style="font-size: 14px; color: var(--fpt-text-muted,#a0a0a0);">Нет сохраненных аккаунтов.</p>';
        return;
    }

    fpToolsAccounts.forEach((account, index) => {
        const isActive = account.name === currentUsername;
        const item = createElement('div', { class: `fpt-acc-item ${isActive ? 'active' : ''}` });

        // аватар
        const avatar = createElement('div', { class: 'fpt-acc-avatar' });
        if (account.avatar) avatar.style.backgroundImage = `url('${account.avatar}')`;
        else avatar.innerHTML = '<span class="material-symbols-rounded">person</span>';

        // непрочитанные (бейдж поверх аватара) - только если > 0
        if (account.unread && account.unread > 0) {
            const badge = createElement('span', { class: 'fpt-acc-unread' });
            badge.textContent = account.unread > 99 ? '99+' : String(account.unread);
            badge.title = `Непрочитанных сообщений: ${account.unread}`;
            avatar.appendChild(badge);
        }

        // инфо: имя + баланс
        const info = createElement('div', { class: 'fpt-acc-info' });
        const nameSpan = createElement('div', { class: 'fpt-acc-name' });
        nameSpan.textContent = account.name;
        if (isActive) {
            const dot = createElement('span', { class: 'fpt-acc-active-dot' });
            dot.title = 'Активный аккаунт';
            nameSpan.appendChild(dot);
        }
        const balSpan = createElement('div', { class: 'fpt-acc-balance' });
        balSpan.textContent = account.balance || '-';
        info.append(nameSpan, balSpan);

        // действия
        const actionsDiv = createElement('div', { class: 'fpt-acc-actions' });

        // кнопка "Войти" (текстовая) - как просили вернуть
        const switchBtn = createElement('button', { class: `fpt-acc-login-btn ${isActive ? 'active' : ''}` });
        switchBtn.textContent = isActive ? 'Активен' : 'Войти';
        switchBtn.disabled = isActive;
        switchBtn.addEventListener('click', async () => {
            if (isActive) return;
            switchBtn.disabled = true;
            showNotification(`Переключаюсь на аккаунт ${account.name}...`, false);
            try {
                const res = await chrome.runtime.sendMessage({ action: 'setGoldenKey', key: account.key });
                if (!res || !res.success) {
                    switchBtn.disabled = false;
                    showNotification(`Не удалось войти: ${res && res.error ? res.error : 'неизвестная ошибка'}`, true);
                }
            } catch (e) {
                switchBtn.disabled = false;
                showNotification(`Ошибка переключения: ${e.message}`, true);
            }
        });

        const renameBtn = createElement('button', { class: 'fpt-acc-btn fpt-acc-btn-edit', title: 'Переименовать' });
        renameBtn.innerHTML = '<span class="material-symbols-rounded">edit</span>';
        renameBtn.addEventListener('click', () => {
            const newName = prompt('Введите новое имя для аккаунта:', account.name);
            if (newName && newName.trim() !== '') {
                fpToolsAccounts[index].name = newName.trim();
                saveAccountsList();
            }
        });

        const deleteBtn = createElement('button', { class: 'fpt-acc-btn fpt-acc-btn-delete', title: 'Удалить' });
        deleteBtn.innerHTML = '<span class="material-symbols-rounded">delete</span>';
        deleteBtn.addEventListener('click', () => {
            if (confirm(`Вы уверены, что хотите удалить аккаунт "${account.name}"?`)) {
                fpToolsAccounts.splice(index, 1);
                saveAccountsList();
            }
        });

        actionsDiv.append(switchBtn, renameBtn, deleteBtn);
        item.append(avatar, info, actionsDiv);
        listContainer.appendChild(item);
    });

    // авто-обновление снимков раз в ~55 минут (если давно не обновляли)
    maybeAutoRefreshAccounts();
}

// Автообновление аватар/баланс/непрочитанных не чаще раза в 55 минут.
let _fptAccAutoRefreshing = false;
async function maybeAutoRefreshAccounts() {
    if (_fptAccAutoRefreshing) return;
    const STALE = 55 * 60 * 1000;
    const now = Date.now();
    const needsUpdate = fpToolsAccounts.some(a => a.key && (!a._snapTs || (now - a._snapTs) > STALE));
    if (!needsUpdate) return;
    _fptAccAutoRefreshing = true;
    try {
        let changed = false;
        for (const account of fpToolsAccounts) {
            if (!account.key) continue;
            if (account._snapTs && (now - account._snapTs) <= STALE) continue;
            const snap = await fptFetchAccountSnapshot(account.key);
            if (snap) {
                account.avatar = snap.avatar || account.avatar || '';
                account.balance = snap.balance || account.balance || '';
                account.unread = typeof snap.unread === 'number' ? snap.unread : (account.unread || 0);
                account._snapTs = Date.now();
                changed = true;
            }
        }
        if (changed) await chrome.storage.local.set({ fpToolsAccounts });
        if (changed) renderAccountsList();
    } finally {
        _fptAccAutoRefreshing = false;
    }
}

// Кнопка ручного обновления данных всех аккаунтов (аватар/баланс/непрочитанные).
async function fptRefreshAllAccounts() {
    showNotification('Обновляю данные аккаунтов…');
    for (const account of fpToolsAccounts) {
        if (!account.key) continue;
        const snap = await fptFetchAccountSnapshot(account.key);
        if (snap) {
            account.avatar = snap.avatar || account.avatar || '';
            account.balance = snap.balance || account.balance || '';
            account.unread = typeof snap.unread === 'number' ? snap.unread : (account.unread || 0);
            account._snapTs = Date.now();
        }
    }
    await chrome.storage.local.set({ fpToolsAccounts });
    renderAccountsList();
    showNotification('Данные аккаунтов обновлены.');
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

    const refreshBtn = document.getElementById('fptRefreshAccountsBtn');
    if (refreshBtn && !refreshBtn.dataset.handlerAttached) {
        refreshBtn.dataset.handlerAttached = 'true';
        refreshBtn.addEventListener('click', async () => {
            refreshBtn.disabled = true;
            try { await fptRefreshAllAccounts(); } finally { refreshBtn.disabled = false; }
        });
    }
}