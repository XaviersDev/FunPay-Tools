function initializeBlacklist() {
    const page = document.querySelector('.fp-tools-page-content[data-page="blacklist"]');
    if (!page || page.dataset.initialized) return;
    page.dataset.initialized = 'true';

    const listEl = document.getElementById('fp-bl-list');
    const usernameInput = document.getElementById('fp-bl-name-input');
    const noteInput = document.getElementById('fp-bl-note-input');
    const addBtn = document.getElementById('fp-bl-add-btn');

    if (!addBtn) return;

    async function render() {
        const { fpToolsBlacklist = [] } = await chrome.storage.local.get('fpToolsBlacklist');
        if (!listEl) return;

        if (!fpToolsBlacklist.length) {
            listEl.innerHTML = '<p class="template-info" style="text-align:center;">Список пуст.</p>';
            return;
        }

        listEl.innerHTML = fpToolsBlacklist.map((entry, i) => `
            <div style="display:flex;align-items:center;gap:10px;padding:10px 12px;background:#0e0f16;border:1px solid #1e2030;border-radius:7px;margin-bottom:6px;">
                <span style="flex:1;font-size:13px;color:#d8dae8;font-weight:600;">
                    ${entry.username}
                    ${entry.note ? `<span style="color:#7a7f9a; font-weight:normal; font-size:11px; margin-left:6px;">(${entry.note})</span>` : ''}
                </span>
                <label title="Блокировать авто-выдачу" style="display:flex;align-items:center;gap:4px;font-size:11px;color:#5a5f7a;cursor:pointer;">
                    <input type="checkbox" class="fp-bl-delivery" data-idx="${i}" ${entry.blockDelivery ? 'checked' : ''} style="accent-color:#e05252;"> Выдача
                </label>
                <label title="Блокировать авто-ответы" style="display:flex;align-items:center;gap:4px;font-size:11px;color:#5a5f7a;cursor:pointer;">
                    <input type="checkbox" class="fp-bl-response" data-idx="${i}" ${entry.blockResponse ? 'checked' : ''} style="accent-color:#e05252;"> Ответы
                </label>
                <label title="Блокировать уведомления" style="display:flex;align-items:center;gap:4px;font-size:11px;color:#5a5f7a;cursor:pointer;">
                    <input type="checkbox" class="fp-bl-notif" data-idx="${i}" ${entry.blockNotification ? 'checked' : ''} style="accent-color:#e05252;"> Уведом.
                </label>
                <button class="btn btn-default fp-bl-remove" data-idx="${i}" style="padding:3px 8px;font-size:11px;flex-shrink:0;">✕</button>
            </div>
        `).join('');

        listEl.querySelectorAll('.fp-bl-delivery, .fp-bl-response, .fp-bl-notif').forEach(cb => {
            cb.addEventListener('change', async () => {
                const { fpToolsBlacklist: bl = [] } = await chrome.storage.local.get('fpToolsBlacklist');
                const idx = parseInt(cb.dataset.idx, 10);
                if (!bl[idx]) return;
                if (cb.classList.contains('fp-bl-delivery'))  bl[idx].blockDelivery     = cb.checked;
                if (cb.classList.contains('fp-bl-response'))  bl[idx].blockResponse     = cb.checked;
                if (cb.classList.contains('fp-bl-notif'))     bl[idx].blockNotification = cb.checked;
                await chrome.storage.local.set({ fpToolsBlacklist: bl });
            });
        });

        listEl.querySelectorAll('.fp-bl-remove').forEach(btn => {
            btn.addEventListener('click', async () => {
                const { fpToolsBlacklist: bl = [] } = await chrome.storage.local.get('fpToolsBlacklist');
                const idx = parseInt(btn.dataset.idx, 10);
                bl.splice(idx, 1);
                await chrome.storage.local.set({ fpToolsBlacklist: bl });
                await render();
                showNotification('Удалено из чёрного списка');
            });
        });
    }

    addBtn.addEventListener('click', async () => {
        const username = usernameInput?.value.trim();
        const note = noteInput?.value.trim() || '';
        
        if (!username) { showNotification('Введите никнейм', true); return; }

        const { fpToolsBlacklist = [] } = await chrome.storage.local.get('fpToolsBlacklist');

        if (fpToolsBlacklist.some(e => e.username.toLowerCase() === username.toLowerCase())) {
            showNotification('Уже в списке', true);
            return;
        }

        fpToolsBlacklist.push({
            username,
            note,
            blockDelivery:     true,
            blockResponse:     true,
            blockNotification: false,
            addedAt: Date.now()
        });

        await chrome.storage.local.set({ fpToolsBlacklist });
        if (usernameInput) usernameInput.value = '';
        if (noteInput) noteInput.value = '';
        await render();
        showNotification(`${username} добавлен в чёрный список`);
    });

    usernameInput?.addEventListener('keydown', e => {
        if (e.key === 'Enter') addBtn.click();
    });
    
    noteInput?.addEventListener('keydown', e => {
        if (e.key === 'Enter') addBtn.click();
    });

    render();

    document.addEventListener('fpToolsBlacklistUpdated', () => {
        if (page.classList.contains('active')) render();
    });
}

async function addToBlacklistFromChat(username) {
    if (!username) return;
    const { fpToolsBlacklist = [] } = await chrome.storage.local.get('fpToolsBlacklist');
    if (fpToolsBlacklist.some(e => e.username.toLowerCase() === username.toLowerCase())) {
        showNotification(`${username} уже в чёрном списке`, true);
        return;
    }
    fpToolsBlacklist.push({ username, note: 'Добавлен из чата', blockDelivery: true, blockResponse: true, blockNotification: false, addedAt: Date.now() });
    await chrome.storage.local.set({ fpToolsBlacklist });
    showNotification(`${username} добавлен в чёрный список`);
    document.dispatchEvent(new Event('fpToolsBlacklistUpdated'));
}