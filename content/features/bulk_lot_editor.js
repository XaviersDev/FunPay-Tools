// content/features/bulk_lot_editor.js - FunPay Tools 2.9
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
        <div class="fp-tools-modal-content" style="max-width:720px;width:95%;max-height:90vh;display:flex;flex-direction:column;background:#13141a;color:#d8dae8;border:1px solid #22253a;border-radius:10px;box-shadow:0 16px 40px rgba(0,0,0,0.6);">
            <div class="fp-tools-modal-header" style="padding:16px 20px;border-bottom:1px solid #1e2030;background:#13141a;border-radius:10px 10px 0 0;">
                <h3 style="margin:0;font-size:15px;color:#e8eaf0;">Массовое редактирование лотов</h3>
                <button class="fp-tools-modal-close" style="background:none;border:none;color:#9099b8;font-size:24px;cursor:pointer;line-height:1;">×</button>
            </div>
            <div class="fp-tools-modal-body" style="overflow-y:auto;padding:16px 20px;flex:1;background:#13141a;">
                <p class="template-info">Изменяются только заполненные поля. Переменные: <code>{current}</code> - текущее значение поля, <code>{lotname}</code> - название лота. Изменения применяются к русской версии полей.</p>

                <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px;">
                    <div>
                        <label style="font-size:12px;color:#5a5f7a;display:block;margin-bottom:4px;">Новое название (пусто - не менять)</label>
                        <input type="text" id="fp-bulk-new-name" placeholder="{current}" style="width:100%;background:#0e0f16;border:1px solid #22253a;border-radius:6px;padding:8px;color:#d8dae8;font-size:13px;">
                    </div>
                    <div>
                        <label style="font-size:12px;color:#5a5f7a;display:block;margin-bottom:4px;">Сообщение покупателю (пусто - не менять)</label>
                        <input type="text" id="fp-bulk-new-msg" placeholder="Не изменять" style="width:100%;background:#0e0f16;border:1px solid #22253a;border-radius:6px;padding:8px;color:#d8dae8;font-size:13px;">
                    </div>
                </div>

                <div style="margin-bottom:12px;">
                    <label style="font-size:12px;color:#5a5f7a;display:block;margin-bottom:4px;">Новое описание (пусто - не менять)</label>
                    <textarea id="fp-bulk-new-desc" placeholder="Не изменять" rows="3" style="width:100%;background:#0e0f16;border:1px solid #22253a;border-radius:6px;padding:8px;color:#d8dae8;font-size:13px;resize:vertical;"></textarea>
                </div>

                <div style="border:1px solid #1e2030;border-radius:8px;padding:12px;margin-bottom:16px;">
                    <label style="font-size:12px;color:#5a5f7a;display:block;margin-bottom:8px;font-weight:700;">Найти и заменить (точечно, без перезаписи всего)</label>
                    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px;">
                        <input type="text" id="fp-bulk-find" placeholder="Найти…" style="width:100%;background:#0e0f16;border:1px solid #22253a;border-radius:6px;padding:8px;color:#d8dae8;font-size:13px;">
                        <input type="text" id="fp-bulk-replace" placeholder="Заменить на…" style="width:100%;background:#0e0f16;border:1px solid #22253a;border-radius:6px;padding:8px;color:#d8dae8;font-size:13px;">
                    </div>
                    <div style="display:flex;flex-wrap:wrap;gap:12px;align-items:center;font-size:12px;color:#9099b8;">
                        <span style="color:#5a5f7a;">Применять к:</span>
                        <label style="display:flex;gap:5px;align-items:center;cursor:pointer;"><input type="checkbox" id="fp-bulk-fr-name" checked style="accent-color:#C026D3;"> названию</label>
                        <label style="display:flex;gap:5px;align-items:center;cursor:pointer;"><input type="checkbox" id="fp-bulk-fr-desc" checked style="accent-color:#C026D3;"> описанию</label>
                        <label style="display:flex;gap:5px;align-items:center;cursor:pointer;"><input type="checkbox" id="fp-bulk-fr-msg" style="accent-color:#C026D3;"> сообщению</label>
                    </div>
                    <div style="display:flex;flex-wrap:wrap;gap:12px;align-items:center;font-size:12px;color:#9099b8;margin-top:8px;">
                        <label style="display:flex;gap:5px;align-items:center;cursor:pointer;"><input type="checkbox" id="fp-bulk-fr-regex" style="accent-color:#C026D3;"> RegEx</label>
                        <label style="display:flex;gap:5px;align-items:center;cursor:pointer;"><input type="checkbox" id="fp-bulk-fr-case" style="accent-color:#C026D3;"> учитывать регистр</label>
                        <label style="display:flex;gap:5px;align-items:center;cursor:pointer;"><input type="checkbox" id="fp-bulk-fr-word" style="accent-color:#C026D3;"> только целые слова</label>
                        <label style="display:flex;gap:5px;align-items:center;cursor:pointer;"><input type="checkbox" id="fp-bulk-fr-all" checked style="accent-color:#C026D3;"> все совпадения</label>
                    </div>
                    <div style="font-size:11px;color:#5a5f7a;margin-top:8px;">Работает вместе с полями выше: сначала «найти-заменить», затем подстановка полных значений (если заданы). При RegEx в «Заменить на» доступны <code>$1</code>, <code>$2</code> и т.д.</div>
                </div>

                <div style="border:1px solid #1e2030;border-radius:8px;padding:12px;margin-bottom:16px;">
                    <label style="font-size:12px;color:#5a5f7a;display:block;margin-bottom:8px;font-weight:700;">Изменение цены</label>
                    <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
                        <select id="fp-bulk-price-mode" style="background:#0e0f16;border:1px solid #22253a;border-radius:6px;padding:8px;color:#d8dae8;font-size:13px;">
                            <option value="none">Не менять</option>
                            <option value="set">Установить =</option>
                            <option value="add">Прибавить +</option>
                            <option value="sub">Вычесть −</option>
                            <option value="pct_up">Поднять на %</option>
                            <option value="pct_down">Снизить на %</option>
                        </select>
                        <input type="number" id="fp-bulk-price-value" step="0.01" placeholder="0" disabled style="flex:1;min-width:120px;background:#0e0f16;border:1px solid #22253a;border-radius:6px;padding:8px;color:#d8dae8;font-size:13px;">
                        <span id="fp-bulk-price-unit" style="font-size:12px;color:#5a5f7a;min-width:14px;"></span>
                    </div>
                    <div style="display:flex;gap:14px;align-items:center;margin-top:8px;flex-wrap:wrap;">
                        <label style="font-size:12px;color:#9099b8;display:flex;align-items:center;gap:5px;cursor:pointer;"><input type="checkbox" id="fp-bulk-price-round" style="accent-color:#C026D3;"> Округлять до целого</label>
                        <label style="font-size:12px;color:#9099b8;display:flex;align-items:center;gap:5px;cursor:pointer;"><input type="number" id="fp-bulk-price-min" step="0.01" placeholder="мин." style="width:80px;background:#0e0f16;border:1px solid #22253a;border-radius:6px;padding:5px;color:#d8dae8;font-size:12px;"> не ниже</label>
                    </div>
                </div>

                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
                    <span style="font-size:12px;color:#5a5f7a;">Лоты (<span id="fp-bulk-count">${lots.length}</span> / выбрано <span id="fp-bulk-selected-count">0</span>):</span>
                    <div style="display:flex;gap:6px;align-items:center;">
                        <input type="text" id="fp-bulk-filter" placeholder="Фильтр…" style="background:#0e0f16;border:1px solid #22253a;border-radius:6px;padding:5px 8px;color:#d8dae8;font-size:12px;width:130px;">
                        <button id="fp-bulk-select-all" class="btn btn-default" style="padding:4px 10px;font-size:12px;">Выбрать все</button>
                    </div>
                </div>

                <div id="fp-bulk-lots-list" style="border:1px solid #1e2030;border-radius:8px;max-height:240px;overflow-y:auto;">
                    ${lots.map((lot) => `
                        <label class="fp-bulk-lot-row" data-title="${(lot.title || '').toLowerCase().replace(/"/g,'&quot;')}" style="display:flex;align-items:center;gap:10px;padding:8px 12px;border-bottom:1px solid #1e2030;cursor:pointer;font-size:13px;color:#9099b8;">
                            <input type="checkbox" class="fp-bulk-lot-check" data-offer-id="${lot.id}" data-node-id="${lot.nodeId}" style="accent-color:#C026D3;flex-shrink:0;">
                            <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${lot.title}</span>
                            <span style="font-size:11px;color:#4a4f68;flex-shrink:0;">${lot.categoryName}</span>
                        </label>
                    `).join('')}
                </div>

                <div id="fp-bulk-progress" style="display:none;margin-top:14px;">
                    <div style="height:4px;background:#1e2030;border-radius:2px;overflow:hidden;">
                        <div id="fp-bulk-progress-bar" style="height:100%;background:#C026D3;width:0;transition:width 0.3s;border-radius:2px;"></div>
                    </div>
                    <div id="fp-bulk-progress-text" style="font-size:12px;color:#5a5f7a;margin-top:6px;text-align:center;"></div>
                    <div id="fp-bulk-log" style="font-size:11px;color:#6b7194;margin-top:8px;max-height:90px;overflow-y:auto;font-family:monospace;line-height:1.5;"></div>
                </div>
            </div>
            <div class="fp-tools-modal-footer" style="padding:14px 20px;display:flex;gap:10px;background:#13141a;border-top:1px solid #1e2030;border-radius:0 0 10px 10px;">
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

    const $ = (id) => document.getElementById(id);

    // Live "selected" counter
    const updateSelectedCount = () => {
        const n = overlay.querySelectorAll('.fp-bulk-lot-check:checked').length;
        $('fp-bulk-selected-count').textContent = n;
    };
    overlay.addEventListener('change', (e) => {
        if (e.target.classList.contains('fp-bulk-lot-check')) updateSelectedCount();
    });

    // Filter the visible lot rows
    $('fp-bulk-filter').addEventListener('input', (e) => {
        const q = e.target.value.trim().toLowerCase();
        overlay.querySelectorAll('.fp-bulk-lot-row').forEach(row => {
            row.style.display = (!q || (row.dataset.title || '').includes(q)) ? '' : 'none';
        });
    });

    // Price mode enables/disables the value field and shows the unit
    const priceMode = $('fp-bulk-price-mode');
    const priceVal  = $('fp-bulk-price-value');
    const priceUnit = $('fp-bulk-price-unit');
    priceMode.addEventListener('change', () => {
        const m = priceMode.value;
        priceVal.disabled = (m === 'none');
        if (m === 'none') { priceVal.value = ''; priceUnit.textContent = ''; }
        else if (m === 'pct_up' || m === 'pct_down') priceUnit.textContent = '%';
        else priceUnit.textContent = '₽';
    });

    // Select all toggle (only toggles currently visible rows)
    let allSelected = false;
    $('fp-bulk-select-all').addEventListener('click', () => {
        allSelected = !allSelected;
        overlay.querySelectorAll('.fp-bulk-lot-row').forEach(row => {
            if (row.style.display === 'none') return;
            const cb = row.querySelector('.fp-bulk-lot-check');
            if (cb) cb.checked = allSelected;
        });
        $('fp-bulk-select-all').textContent = allSelected ? 'Снять все' : 'Выбрать все';
        updateSelectedCount();
    });

    const log = (msg, isErr = false) => {
        const el = $('fp-bulk-log');
        if (!el) return;
        const line = document.createElement('div');
        line.textContent = msg;
        if (isErr) line.style.color = '#e07070';
        el.appendChild(line);
        el.scrollTop = el.scrollHeight;
    };

    // Apply
    $('fp-bulk-apply-btn').addEventListener('click', async () => {
        const selected = Array.from(overlay.querySelectorAll('.fp-bulk-lot-check:checked'));
        if (!selected.length) {
            showNotification('Выберите хотя бы один лот', true);
            return;
        }

        const newName = $('fp-bulk-new-name').value.trim();
        const newDesc = $('fp-bulk-new-desc').value.trim();
        const newMsg  = $('fp-bulk-new-msg').value.trim();

        const pMode  = priceMode.value;
        const pVal   = parseFloat(priceVal.value);
        const pRound = $('fp-bulk-price-round').checked;
        const pMin   = parseFloat($('fp-bulk-price-min').value);
        const priceWanted = pMode !== 'none';

        // Find & replace settings
        const frFind    = $('fp-bulk-find').value;
        const frReplace = $('fp-bulk-replace').value;
        const frActive  = frFind.length > 0;
        const frFields  = {
            name: $('fp-bulk-fr-name').checked,
            desc: $('fp-bulk-fr-desc').checked,
            msg:  $('fp-bulk-fr-msg').checked,
        };
        const frRegex = $('fp-bulk-fr-regex').checked;
        const frCase  = $('fp-bulk-fr-case').checked;
        const frWord  = $('fp-bulk-fr-word').checked;
        const frAll   = $('fp-bulk-fr-all').checked;

        let frRe = null;
        if (frActive) {
            try {
                let pattern = frRegex ? frFind : frFind.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                if (frWord) pattern = `\\b${pattern}\\b`;
                let flags = frAll ? 'g' : '';
                if (!frCase) flags += 'i';
                frRe = new RegExp(pattern, flags);
            } catch (e) {
                showNotification('Ошибка в регулярном выражении: ' + e.message, true);
                return;
            }
        }

        if (priceWanted && (isNaN(pVal) || pVal < 0)) {
            showNotification('Укажите корректное значение цены', true);
            return;
        }
        if (!newName && !newDesc && !newMsg && !priceWanted && !frActive) {
            showNotification('Укажите хотя бы одно изменение', true);
            return;
        }

        const applyFindReplace = (text) => {
            if (!frActive || !frRe || text == null) return text;
            return text.replace(frRe, frReplace);
        };

        const applyBtn = $('fp-bulk-apply-btn');
        applyBtn.disabled = true;
        applyBtn.textContent = 'Применяем...';
        $('fp-bulk-progress').style.display = 'block';
        $('fp-bulk-log').innerHTML = '';

        let ok = 0, fail = 0;
        const total = selected.length;
        let processed = 0;

        // FunPay stores localized fields. We edit the RU variants (the primary ones);
        // we fall back to the non-localized key if the page didn't expose [ru].
        const setField = (data, base, value) => {
            if (`fields[${base}][ru]` in data) data[`fields[${base}][ru]`] = value;
            else if (`fields[${base}]` in data) data[`fields[${base}]`] = value;
            else data[`fields[${base}][ru]`] = value; // create if absent
        };
        const getField = (data, base) =>
            data[`fields[${base}][ru]`] ?? data[`fields[${base}]`] ?? '';

        const applyTemplate = (tpl, current, lotName) =>
            tpl.replace(/{current}/gi, current || '').replace(/{lotname}/gi, lotName || '');

        for (const cb of selected) {
            const offerId = cb.dataset.offerId;
            const nodeId  = cb.dataset.nodeId;
            const lotLabel = cb.closest('label')?.querySelector('span')?.textContent || offerId;

            $('fp-bulk-progress-text').textContent = `Обрабатываем ${processed + 1}/${total}: ${lotLabel}`;

            try {
                // 1. Load current full lot form (all hidden fields preserved)
                const editData = await new Promise((resolve, reject) => {
                    chrome.runtime.sendMessage(
                        { action: 'getLotForExport', nodeId, offerId },
                        (res) => {
                            if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
                            else if (res?.success) resolve(res.data);
                            else reject(new Error(res?.error || 'Ошибка загрузки лота'));
                        }
                    );
                });
                if (!editData || typeof editData !== 'object') throw new Error('Нет данных лота');

                // Build the POST body from the FULL form, then override only chosen fields,
                // using FunPay's real field names. The old version posted summary/desc/secrets
                // which FunPay ignores - so it reported success while changing nothing.
                const formData = { ...editData, offer_id: offerId };
                const currentTitle = getField(editData, 'summary');

                // Step 1: find & replace on existing field values (точечно).
                if (frActive) {
                    if (frFields.name) setField(formData, 'summary',     applyFindReplace(getField(editData, 'summary')));
                    if (frFields.desc) setField(formData, 'desc',        applyFindReplace(getField(editData, 'desc')));
                    if (frFields.msg)  setField(formData, 'payment_msg', applyFindReplace(getField(editData, 'payment_msg')));
                }

                // Step 2: full-value overrides (if provided) - applied on top of step 1.
                if (newName) setField(formData, 'summary', applyTemplate(newName, getField(formData, 'summary'), currentTitle));
                if (newDesc) setField(formData, 'desc', applyTemplate(newDesc, getField(formData, 'desc'), currentTitle));
                if (newMsg)  setField(formData, 'payment_msg', applyTemplate(newMsg, getField(formData, 'payment_msg'), currentTitle));

                if (priceWanted) {
                    const cur = parseFloat(editData.price);
                    if (isNaN(cur) && (pMode === 'add' || pMode === 'sub' || pMode === 'pct_up' || pMode === 'pct_down')) {
                        throw new Error('не удалось прочитать текущую цену');
                    }
                    let np;
                    switch (pMode) {
                        case 'set':      np = pVal; break;
                        case 'add':      np = cur + pVal; break;
                        case 'sub':      np = cur - pVal; break;
                        case 'pct_up':   np = cur * (1 + pVal / 100); break;
                        case 'pct_down': np = cur * (1 - pVal / 100); break;
                    }
                    np = Math.max(0, np);
                    if (!isNaN(pMin)) np = Math.max(pMin, np);
                    np = pRound ? Math.round(np) : Math.round(np * 100) / 100;
                    formData.price = String(np);
                }

                // 2. Save. saveSingleLot now reports real API errors.
                const saveRes = await new Promise((resolve) => {
                    chrome.runtime.sendMessage({ action: 'saveSingleLot', data: formData }, (res) => {
                        if (chrome.runtime.lastError) resolve({ success: false, error: chrome.runtime.lastError.message });
                        else resolve(res || { success: false, error: 'нет ответа' });
                    });
                });

                if (saveRes && saveRes.success) {
                    ok++;
                    log(`✓ ${lotLabel}`);
                } else {
                    fail++;
                    log(`✗ ${lotLabel}: ${saveRes?.error || 'ошибка сохранения'}`, true);
                }
            } catch (e) {
                fail++;
                log(`✗ ${lotLabel}: ${e.message}`, true);
            }

            processed++;
            $('fp-bulk-progress-bar').style.width = `${(processed / total) * 100}%`;
            // Rate limit between lots to avoid FunPay throttling
            await new Promise(r => setTimeout(r, 1200));
        }

        $('fp-bulk-progress-bar').style.width = '100%';
        $('fp-bulk-progress-bar').style.background = fail ? '#d99000' : '#4caf82';
        $('fp-bulk-progress-text').textContent = `Готово. Успешно: ${ok}, ошибок: ${fail}, всего: ${total}.`;
        showNotification(`Изменено: ${ok}/${total}${fail ? `, ошибок: ${fail}` : ''}`, fail > 0);

        applyBtn.disabled = false;
        applyBtn.textContent = 'Применить изменения';
    });
}
