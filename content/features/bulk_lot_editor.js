// content/features/bulk_lot_editor.js — FunPay Tools 2.9
// Массовое редактирование: название, описание, сообщение покупателю
// Активируется кнопкой "Массово изменить" в разделе Лоты

function initBulkLotEditor() {
    const page = document.querySelector('.fp-tools-page-content[data-page="lot_io"]');
    if (!page || page.dataset.bulkEditorInit) return;
    page.dataset.bulkEditorInit = 'true';

    const btn = document.getElementById('fp-bulk-edit-btn');
    if (!btn) return;

    btn.addEventListener('click', openBulkEditor);
}

async function openBulkEditor() {
    const existing = document.getElementById('fp-bulk-editor-overlay');
    if (existing) { existing.remove(); return; }

    // Show loading
    showNotification('Загружаем список лотов...');

    let lots = [];
    try {
        const appData = JSON.parse(document.body.dataset.appData || '{}');
        const d = Array.isArray(appData) ? appData[0] : appData;
        const userId = d.userId;
        if (!userId) throw new Error('Нет userId');

        lots = await new Promise((resolve, reject) => {
            chrome.runtime.sendMessage({ action: 'getUserLotsList', userId }, (res) => {
                if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
                else resolve(res || []);
            });
        });
    } catch (e) {
        showNotification(`Ошибка: ${e.message}`, true);
        return;
    }

    if (!lots.length) {
        showNotification('Лоты не найдены', true);
        return;
    }

    const overlay = document.createElement('div');
    overlay.id = 'fp-bulk-editor-overlay';
    overlay.className = 'fp-tools-modal-overlay';
    overlay.style.display = 'flex';

    overlay.innerHTML = `
        <div class="fp-tools-modal-content" style="max-width:700px;width:95%;max-height:90vh;display:flex;flex-direction:column;">
            <div class="fp-tools-modal-header" style="padding:16px 20px;">
                <h3 style="margin:0;font-size:15px;">Массовое редактирование лотов</h3>
                <button class="fp-tools-modal-close">×</button>
            </div>
            <div class="fp-tools-modal-body" style="overflow-y:auto;padding:16px 20px;flex:1;">
                <p class="template-info">Выберите лоты и задайте новое значение. Пустое поле — без изменений. Используйте переменные: <code>{current}</code> — текущее значение, <code>{lotname}</code> — название лота.</p>

                <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px;">
                    <div>
                        <label style="font-size:12px;color:#5a5f7a;display:block;margin-bottom:4px;">Новое название (оставьте пустым — не менять)</label>
                        <input type="text" id="fp-bulk-new-name" placeholder="{current}" style="width:100%;background:#0e0f16;border:1px solid #22253a;border-radius:6px;padding:8px;color:#d8dae8;font-size:13px;">
                    </div>
                    <div>
                        <label style="font-size:12px;color:#5a5f7a;display:block;margin-bottom:4px;">Сообщение покупателю (секреты)</label>
                        <input type="text" id="fp-bulk-new-secrets" placeholder="Не изменять" style="width:100%;background:#0e0f16;border:1px solid #22253a;border-radius:6px;padding:8px;color:#d8dae8;font-size:13px;">
                    </div>
                </div>

                <div style="margin-bottom:16px;">
                    <label style="font-size:12px;color:#5a5f7a;display:block;margin-bottom:4px;">Новое описание (оставьте пустым — не менять)</label>
                    <textarea id="fp-bulk-new-desc" placeholder="Не изменять" rows="3" style="width:100%;background:#0e0f16;border:1px solid #22253a;border-radius:6px;padding:8px;color:#d8dae8;font-size:13px;resize:vertical;"></textarea>
                </div>

                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
                    <span style="font-size:12px;color:#5a5f7a;">Лоты (${lots.length}):</span>
                    <button id="fp-bulk-select-all" class="btn btn-default" style="padding:4px 10px;font-size:12px;">Выбрать все</button>
                </div>

                <div id="fp-bulk-lots-list" style="border:1px solid #1e2030;border-radius:8px;max-height:240px;overflow-y:auto;">
                    ${lots.map((lot, i) => `
                        <label style="display:flex;align-items:center;gap:10px;padding:8px 12px;border-bottom:1px solid #1e2030;cursor:pointer;font-size:13px;color:#9099b8;" onmouseenter="this.style.background='#1a1c2e'" onmouseleave="this.style.background=''">
                            <input type="checkbox" class="fp-bulk-lot-check" data-offer-id="${lot.id}" data-node-id="${lot.nodeId}" style="accent-color:#6B66FF;flex-shrink:0;">
                            <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${lot.title}</span>
                            <span style="font-size:11px;color:#4a4f68;flex-shrink:0;">${lot.categoryName}</span>
                        </label>
                    `).join('')}
                </div>

                <div id="fp-bulk-progress" style="display:none;margin-top:14px;">
                    <div style="height:4px;background:#1e2030;border-radius:2px;overflow:hidden;">
                        <div id="fp-bulk-progress-bar" style="height:100%;background:#6B66FF;width:0;transition:width 0.3s;border-radius:2px;"></div>
                    </div>
                    <div id="fp-bulk-progress-text" style="font-size:12px;color:#5a5f7a;margin-top:6px;text-align:center;"></div>
                </div>
            </div>
            <div class="fp-tools-modal-footer" style="padding:14px 20px;display:flex;gap:10px;">
                <button id="fp-bulk-apply-btn" class="btn" style="flex:1;">Применить изменения</button>
                <button class="fp-tools-modal-close btn btn-default">Отмена</button>
            </div>
        </div>
    `;

    document.body.appendChild(overlay);

    overlay.querySelectorAll('.fp-tools-modal-close').forEach(b =>
        b.addEventListener('click', () => overlay.remove())
    );
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) overlay.remove();
    });

    // Select all toggle
    let allSelected = false;
    document.getElementById('fp-bulk-select-all').addEventListener('click', () => {
        allSelected = !allSelected;
        overlay.querySelectorAll('.fp-bulk-lot-check').forEach(cb => cb.checked = allSelected);
        document.getElementById('fp-bulk-select-all').textContent = allSelected ? 'Снять все' : 'Выбрать все';
    });

    // Apply
    document.getElementById('fp-bulk-apply-btn').addEventListener('click', async () => {
        const selected = Array.from(overlay.querySelectorAll('.fp-bulk-lot-check:checked'));
        if (!selected.length) {
            showNotification('Выберите хотя бы один лот', true);
            return;
        }

        const newName    = document.getElementById('fp-bulk-new-name').value.trim();
        const newDesc    = document.getElementById('fp-bulk-new-desc').value.trim();
        const newSecrets = document.getElementById('fp-bulk-new-secrets').value.trim();

        if (!newName && !newDesc && !newSecrets) {
            showNotification('Укажите хотя бы одно поле для изменения', true);
            return;
        }

        const applyBtn = document.getElementById('fp-bulk-apply-btn');
        applyBtn.disabled = true;
        applyBtn.textContent = 'Применяем...';
        document.getElementById('fp-bulk-progress').style.display = 'block';

        let done = 0;
        const total = selected.length;

        for (const cb of selected) {
            const offerId = cb.dataset.offerId;
            const nodeId  = cb.dataset.nodeId;
            const lotLabel = cb.closest('label')?.querySelector('span')?.textContent || offerId;

            document.getElementById('fp-bulk-progress-text').textContent =
                `Обрабатываем ${done+1}/${total}: ${lotLabel}`;

            try {
                // 1. Load current lot data
                const editData = await new Promise((resolve, reject) => {
                    chrome.runtime.sendMessage(
                        { action: 'getLotForExport', nodeId, offerId },
                        (res) => {
                            if (res?.success) resolve(res.data);
                            else reject(new Error(res?.error || 'Ошибка загрузки лота'));
                        }
                    );
                });

                if (!editData) throw new Error('Нет данных лота');

                // 2. Apply changes
                const formData = { ...editData, offer_id: offerId };

                const applyTemplate = (tpl, current) => {
                    if (!tpl) return current;
                    return tpl.replace(/{current}/gi, current || '').replace(/{lotname}/gi, editData.summary || '');
                };

                if (newName)    formData.summary  = applyTemplate(newName,    editData.summary);
                if (newDesc)    formData.desc      = applyTemplate(newDesc,    editData.desc);
                if (newSecrets) formData.secrets   = applyTemplate(newSecrets, editData.secrets);

                // 3. Save via import mechanism
                await new Promise((resolve, reject) => {
                    chrome.runtime.sendMessage(
                        { action: 'saveSingleLot', data: formData },
                        (res) => {
                            if (res?.success) resolve();
                            else reject(new Error(res?.error || 'Ошибка сохранения'));
                        }
                    );
                });

                done++;
                document.getElementById('fp-bulk-progress-bar').style.width = `${(done/total)*100}%`;

            } catch (e) {
                console.error(`FP Tools BulkEdit: ошибка для лота ${offerId}:`, e.message);
                done++;
            }

            // Rate limit: 2s between lots
            await new Promise(r => setTimeout(r, 2000));
        }

        document.getElementById('fp-bulk-progress-text').textContent = `Готово! Обработано ${done}/${total} лотов.`;
        document.getElementById('fp-bulk-progress-bar').style.width = '100%';
        document.getElementById('fp-bulk-progress-bar').style.background = '#4caf82';
        showNotification(`Массовое редактирование завершено: ${done}/${total}`);

        setTimeout(() => overlay.remove(), 2500);
    });
}
