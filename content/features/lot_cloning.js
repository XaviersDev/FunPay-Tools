// content/features/lot_cloning.js

const COPIED_LOT_STORAGE_KEY = 'fpToolsCopiedLotData';
let __fpCloneState = null;

async function handlePublicLotCopy() {
    const offerId = new URLSearchParams(window.location.search).get('id');
    if (!offerId) {
        showNotification('Не удалось найти ID лота на странице.', true);
        return;
    }
    openCloneWizard(offerId);
}

function ensureCloneWizardModal() {
    let overlay = document.getElementById('fp-clone-wizard-overlay');
    if (overlay) return overlay;

    overlay = createElement('div', { id: 'fp-clone-wizard-overlay' });
    overlay.innerHTML = `
        <div id="fp-clone-wizard" class="fp-wizard-container">
            <div class="fp-cw-header">
                <h3>Копирование лота</h3>
                <button class="fp-cw-close" id="fp-cw-close">×</button>
            </div>
            <div class="fp-cw-body" id="fp-cw-body">
                <div class="fp-cw-loader"></div>
            </div>
        </div>`;
    document.body.appendChild(overlay);

    overlay.addEventListener('click', (e) => { if (e.target === overlay) closeCloneWizard(); });
    overlay.querySelector('#fp-cw-close').addEventListener('click', closeCloneWizard);
    return overlay;
}

function closeCloneWizard() {
    const overlay = document.getElementById('fp-clone-wizard-overlay');
    if (overlay) overlay.style.display = 'none';
    __fpCloneState = null;
}

function cloneSurfaceColors() {
    const pick = (sel) => document.querySelector(sel);
    const candidates = [pick('.content-account'), pick('.content'), pick('.container'), document.body].filter(Boolean);
    let bg = '', color = '';
    for (const el of candidates) {
        const cs = getComputedStyle(el);
        if (!color) color = cs.color;
        const b = cs.backgroundColor;
        if (b && b !== 'rgba(0, 0, 0, 0)' && b !== 'transparent') { bg = b; break; }
    }
    if (!bg) bg = getComputedStyle(document.body).backgroundColor || '#1e1e1e';
    if (!color) color = getComputedStyle(document.body).color || '#222';
    let accent = '';
    const btn = document.querySelector('.btn-primary');
    if (btn) {
        const bc = getComputedStyle(btn).backgroundColor;
        if (bc && bc !== 'rgba(0, 0, 0, 0)' && bc !== 'transparent') accent = bc;
    }
    if (!accent) accent = '#1b75bb';
    const rgb = bg.match(/\d+/g);
    const lum = rgb ? (0.299 * +rgb[0] + 0.587 * +rgb[1] + 0.114 * +rgb[2]) : 30;
    const isLight = lum > 140;
    return { bg, color, accent, isLight };
}

function applyWizardTheme(rootId) {
    const root = document.getElementById(rootId);
    if (!root) return;
    const { bg, color, accent, isLight } = cloneSurfaceColors();
    const border = isLight ? 'rgba(0,0,0,0.12)' : 'rgba(255,255,255,0.12)';
    const subtle = isLight ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.05)';
    const muted = isLight ? 'rgba(0,0,0,0.55)' : 'rgba(255,255,255,0.55)';
    
    if (!document.getElementById('fp-wizard-shared-css')) {
        const s = document.createElement('style');
        s.id = 'fp-wizard-shared-css';
        s.textContent = `
            .fp-wizard-overlay { display:none; position:fixed; inset:0; background:rgba(0,0,0,0.6); backdrop-filter:blur(3px); z-index:10010; justify-content:center; align-items:center; font-family:inherit; }
            .fp-wizard-container { width:92%; max-width:960px; max-height:90vh; display:flex; flex-direction:column; background:var(--cw-bg); color:var(--cw-color); border:1px solid var(--cw-border); border-radius:14px; box-shadow:0 12px 48px rgba(0,0,0,0.45); overflow:hidden; animation:fpCwPopIn 0.24s cubic-bezier(0.26,0.53,0.74,1.3); }
        `;
        document.head.appendChild(s);
    }

    root.style.setProperty('--cw-bg', bg);
    root.style.setProperty('--cw-color', color);
    root.style.setProperty('--cw-accent', accent);
    root.style.setProperty('--cw-border', border);
    root.style.setProperty('--cw-subtle', subtle);
    root.style.setProperty('--cw-muted', muted);
    root.style.setProperty('--cw-field-bg', isLight ? '#fff' : 'rgba(255,255,255,0.04)');
}

async function openCloneWizard(offerId) {
    const overlay = ensureCloneWizardModal();
    overlay.className = 'fp-wizard-overlay';
    overlay.style.display = 'flex';
    applyWizardTheme('fp-clone-wizard');
    const body = document.getElementById('fp-cw-body');
    body.innerHTML = '<div class="fp-cw-loader"></div><p class="fp-cw-muted" style="text-align:center;">Читаю лот с сервера (RU + EN + цена)…</p>';

    try {
        const resp = await chrome.runtime.sendMessage({ action: 'cloneGetSource', offerId });
        if (!resp || !resp.success) throw new Error(resp?.error || 'Не удалось получить данные лота.');

        __fpCloneState = {
            offerId,
            source: resp.source,
            fields: resp.fields || null,
            formError: resp.formError || null,
            csrf: resp.csrf,
            createdIds: []
        };
        renderCloneReview();
    } catch (e) {
        body.innerHTML = `<div class="fp-cw-error">Ошибка: ${escapeHtmlClone(e.message)}</div>
            <div class="fp-cw-actions" style="justify-content:center; margin-top:20px;"><button class="fp-cw-btn-secondary" id="fp-cw-retry">Повторить</button></div>`;
        document.getElementById('fp-cw-retry')?.addEventListener('click', () => openCloneWizard(offerId));
    }
}

function escapeHtmlClone(str) {
    return String(str ?? '').replace(/[&<>"']/g, s => (
        { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[s]
    ));
}

function renderCloneReview() {
    const st = __fpCloneState;
    if (!st) return;
    const body = document.getElementById('fp-cw-body');
    const src = st.source;

    const attrRows = (src.attributePairs || []).map(p => `
        <div class="fp-cw-attr">
            <span class="fp-cw-attr-k">${escapeHtmlClone(p.label)}</span>
            <span class="fp-cw-attr-v">${escapeHtmlClone(p.value)}</span>
        </div>`).join('') || '<div class="fp-cw-muted">Параметров категории не обнаружено.</div>';

    let formWarn = '';
    if (st.source.isChips) {
        formWarn = `<div class="fp-cw-warn">Лот из раздела валюты/чипов - другая форма, серверное создание не поддерживается. Доступно копирование текстов.</div>`;
    } else if (!st.source.nodeId) {
        formWarn = `<div class="fp-cw-warn">Не удалось определить категорию (node). Создание на сервере недоступно.</div>`;
    } else if (!st.fields) {
        formWarn = `<div class="fp-cw-warn">Не удалось построить форму категории${st.formError ? ': ' + escapeHtmlClone(st.formError) : ''}.</div>`;
    }
    if (!st.source.enDiffers && (st.source.summary_ru || st.source.desc_ru)) {
        formWarn += `<div class="fp-cw-warn">У лота нет отдельного английского текста - вкладка EN заполнена русским. Если категория требует валидный английский, FunPay может отклонить - отредактируйте EN или оставьте пустым.</div>`;
    }

    const canCreate = !!st.fields && !st.source.isChips && !!st.source.nodeId;
    const invincibleCheckbox = `-webkit-appearance: checkbox !important; appearance: checkbox !important; width: 16px !important; height: 16px !important; margin: 0 !important; display: inline-block !important; position: static !important; opacity: 1 !important; visibility: visible !important; pointer-events: auto !important;`;

    body.innerHTML = `
        <div class="fp-cw-grid">
            <div class="fp-cw-col">
                <div class="fp-cw-section-title">Содержимое лота</div>
                ${formWarn}

                <div class="fp-cw-tabs">
                    <button class="fp-cw-tab active" data-tab="ru">RU</button>
                    <button class="fp-cw-tab" data-tab="en">EN</button>
                </div>

                <div class="fp-cw-tabpane" data-pane="ru">
                    <label class="fp-cw-mini">Название</label>
                    <textarea class="fp-cw-input" id="fp-cw-summary-ru" rows="2">${escapeHtmlClone(src.summary_ru || '')}</textarea>
                    <label class="fp-cw-mini">Описание</label>
                    <textarea class="fp-cw-input" id="fp-cw-desc-ru" rows="7">${escapeHtmlClone(src.desc_ru || '')}</textarea>
                </div>
                <div class="fp-cw-tabpane" data-pane="en" style="display:none;">
                    <label class="fp-cw-mini">Title</label>
                    <textarea class="fp-cw-input" id="fp-cw-summary-en" rows="2">${escapeHtmlClone(src.summary_en || '')}</textarea>
                    <label class="fp-cw-mini">Description</label>
                    <textarea class="fp-cw-input" id="fp-cw-desc-en" rows="7">${escapeHtmlClone(src.desc_en || '')}</textarea>
                </div>
            </div>

            <div class="fp-cw-col">
                <div class="fp-cw-section-title">Параметры категории</div>
                <div class="fp-cw-attrs">${attrRows}</div>

                ${(src.images && src.images.length) ? `
                <div class="fp-cw-section-title" style="margin-top:18px;">Картинки</div>
                <label class="fp-cw-imgtoggle" style="cursor: pointer; display: flex; align-items: center; gap: 8px;">
                    <input type="checkbox" id="fp-cw-opt-images" checked style="${invincibleCheckbox}"> 
                    Перенести картинки лота (${src.images.length})
                </label>
                <div class="fp-cw-thumbs">
                    ${src.images.map(u => `<span class="fp-cw-thumb" style="background-image:url('${escapeHtmlClone(u)}')"></span>`).join('')}
                </div>` : '<div class="fp-cw-muted" style="margin-top:14px;font-size:12px;">У лота нет картинок.</div>'}
                <div class="fp-cw-section-title" style="margin-top:18px;">Замена текста</div>
                <div class="fp-cw-row">
                    <input type="text" class="fp-cw-input" id="fp-cw-find" placeholder="найти…">
                    <input type="text" class="fp-cw-input" id="fp-cw-replace" placeholder="заменить…">
                </div>
                <button class="fp-cw-btn-secondary fp-cw-apply-replace" id="fp-cw-apply-replace">Применить к текстам</button>

                <div class="fp-cw-meta">
                    <div><span class="fp-cw-muted">Категория:</span> ${escapeHtmlClone(src.categoryName || '-')}</div>
                    <div><span class="fp-cw-muted">Продавец:</span> ${escapeHtmlClone(src.sellerName || ('#' + (src.sellerId || '-')))}</div>
                </div>
            </div>
        </div>

        <div class="fp-cw-footer">
            <div class="fp-cw-status" id="fp-cw-status"></div>
            <div class="fp-cw-actions">
                <button class="fp-cw-btn-secondary" id="fp-cw-copy-text">Только тексты</button>
                <button class="fp-cw-btn-primary" id="fp-cw-create" ${canCreate ? '' : 'disabled'}>Создать лот</button>
            </div>
        </div>
    `;

    body.querySelectorAll('.fp-cw-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            body.querySelectorAll('.fp-cw-tab').forEach(t => t.classList.toggle('active', t === tab));
            const which = tab.dataset.tab;
            body.querySelectorAll('.fp-cw-tabpane').forEach(p => {
                p.style.display = (p.dataset.pane === which) ? '' : 'none';
            });
        });
    });

    document.getElementById('fp-cw-apply-replace').addEventListener('click', () => {
        const find = document.getElementById('fp-cw-find').value;
        if (!find) { showNotification('Введите текст для поиска.', true); return; }
        const repl = document.getElementById('fp-cw-replace').value || '';
        ['fp-cw-summary-ru', 'fp-cw-summary-en', 'fp-cw-desc-ru', 'fp-cw-desc-en'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.value = el.value.split(find).join(repl);
        });
        showNotification('Замена применена.', false);
    });

    document.getElementById('fp-cw-copy-text').addEventListener('click', async () => {
        const data = {
            summary: document.getElementById('fp-cw-summary-ru').value,
            description: document.getElementById('fp-cw-desc-ru').value,
            timestamp: Date.now()
        };
        await chrome.storage.local.set({ [COPIED_LOT_STORAGE_KEY]: data });
        showNotification('Тексты сохранены. Откройте форму создания лота - появится кнопка вставки.', false);
        closeCloneWizard();
    });

    const createBtn = document.getElementById('fp-cw-create');
    if (createBtn && canCreate) createBtn.addEventListener('click', executeCloneCreate);
}

async function executeCloneCreate() {
    const st = __fpCloneState;
    if (!st || !st.fields) return;

    const createBtn = document.getElementById('fp-cw-create');
    const statusEl = document.getElementById('fp-cw-status');
    createBtn.disabled = true;

    const summaryRu = document.getElementById('fp-cw-summary-ru').value;
    const descRu = document.getElementById('fp-cw-desc-ru').value;
    const summaryEnRaw = (document.getElementById('fp-cw-summary-en')?.value || '').trim();
    const descEnRaw = (document.getElementById('fp-cw-desc-en')?.value || '').trim();
    const enReal = st.source.enDiffers;
    const summaryEn = enReal ? summaryEnRaw : (summaryEnRaw && summaryEnRaw !== summaryRu ? summaryEnRaw : '');
    const descEn = enReal ? descEnRaw : (descEnRaw && descEnRaw !== descRu ? descEnRaw : '');

    const optImages = document.getElementById('fp-cw-opt-images');
    const wantImages = optImages ? optImages.checked : false;

    let imageIds = [];
    if (wantImages && st.source.images && st.source.images.length) {
        statusEl.innerHTML = `<span class="fp-cw-spin"></span> Переношу картинки (${st.source.images.length})…`;
        try {
            const imgResp = await chrome.runtime.sendMessage({ action: 'cloneUploadImages', urls: st.source.images });
            if (imgResp && imgResp.success) {
                imageIds = imgResp.ids || [];
                if (imgResp.errors && imgResp.errors.length) {
                    showNotification(`Часть картинок не перенеслась (${imgResp.errors.length}).`, true);
                }
            } else {
                showNotification('Картинки не перенеслись: ' + (imgResp?.error || ''), true);
            }
        } catch (e) {
            showNotification('Не удалось перенести картинки: ' + e.message, true);
        }
    }

    const fields = { ...st.fields };
    fields['offer_id'] = '0';
    fields['fields[summary][ru]'] = summaryRu;
    fields['fields[summary][en]'] = summaryEn;
    fields['fields[desc][ru]'] = descRu;
    fields['fields[desc][en]'] = descEn;
    
    const fp = st.source.finalPrice;
    if (fp != null && !Number.isNaN(fp) && fp > 0) {
        fields['price'] = String(fp);
    } else if (st.source.rawPrice) {
        fields['price'] = String(st.source.rawPrice);
    }
    fields['amount'] = (st.source.amount && /^\d+$/.test(st.source.amount)) ? st.source.amount : (fields['amount'] || '1');
    fields['active'] = 'on';
    fields['secrets'] = fields['secrets'] || '';
    fields['fields[images]'] = imageIds.length ? imageIds.join(',') : (fields['fields[images]'] || '');

    statusEl.innerHTML = '<span class="fp-cw-spin"></span> Создаю лот на сервере…';

    try {
        const resp = await chrome.runtime.sendMessage({ action: 'cloneCreateLot', fields, location: 'trade' });
        if (!resp || !resp.success) throw new Error(resp?.error || 'Ошибка создания.');

        if (resp.newId) st.createdIds.push(resp.newId);
        const link = resp.newId
            ? `<a href="https://funpay.com/lots/offerEdit?offer=${resp.newId}" target="_blank">Открыть лот →</a>`
            : '';
        statusEl.innerHTML = `<span class="fp-cw-ok">✓ Лот создан!</span> ${link}`;
        showNotification('Лот успешно создан на сервере!', false);

        const actions = document.querySelector('#fp-clone-wizard .fp-cw-actions');
        if (resp.newId && actions && !document.getElementById('fp-cw-undo')) {
            const undo = createElement('button', { class: 'fp-cw-btn-secondary', id: 'fp-cw-undo' }, {}, 'Удалить созданный');
            actions.prepend(undo);
            undo.addEventListener('click', async () => {
                undo.disabled = true;
                const del = await chrome.runtime.sendMessage({ action: 'cloneDeleteLot', offerId: resp.newId });
                if (del && del.success) {
                    showNotification('Созданный лот удалён.', false);
                    undo.remove();
                    statusEl.innerHTML = '<span class="fp-cw-muted">Лот удалён.</span>';
                } else {
                    undo.disabled = false;
                    showNotification('Не удалось удалить лот: ' + (del?.error || ''), true);
                }
            });
        }
        createBtn.disabled = false;
        createBtn.textContent = 'Создать ещё копию';
    } catch (e) {
        statusEl.innerHTML = `<span class="fp-cw-err">✗ ${escapeHtmlClone(e.message)}</span>`;
        showNotification('Ошибка: ' + e.message, true);
        createBtn.disabled = false;
    }
}

async function checkForCopiedLotData() {
    const isEditPage = window.location.pathname.includes('/lots/offerEdit');
    const isAddPage = window.location.pathname.includes('/lots/offer/add');

    if (!isEditPage && !isAddPage) {
        return;
    }

    const result = await chrome.storage.local.get(COPIED_LOT_STORAGE_KEY);
    const copiedData = result[COPIED_LOT_STORAGE_KEY];

    if (!copiedData || (Date.now() - copiedData.timestamp > 10 * 60 * 1000)) {
        await chrome.storage.local.remove(COPIED_LOT_STORAGE_KEY);
        return;
    }

    const pasteBar = createElement('div', { id: 'fp-tools-paste-bar' });
    pasteBar.innerHTML = `
        <span class="paste-bar-icon">📋</span>
        <span class="paste-bar-text">Найдены скопированные данные лота. Вставить их в форму?</span>
        <div class="paste-bar-actions">
            <button id="paste-lot-data-btn" class="btn btn-sm btn-primary">Вставить</button>
            <button id="decline-paste-btn" class="btn btn-sm btn-default">&times;</button>
        </div>
    `;
    
    const header = document.querySelector('h1.page-header');
    if (header) {
        header.insertAdjacentElement('afterend', pasteBar);
    }

    document.getElementById('paste-lot-data-btn').addEventListener('click', () => {
        setFormField('summary', copiedData.summary, '');
        setFormField('desc', copiedData.description, '');

        showNotification('Данные вставлены!', false);
        chrome.storage.local.remove(COPIED_LOT_STORAGE_KEY);
        pasteBar.remove();
    });

    document.getElementById('decline-paste-btn').addEventListener('click', () => {
        chrome.storage.local.remove(COPIED_LOT_STORAGE_KEY);
        pasteBar.remove();
    });
}

function setFormField(baseName, valueRu, valueEn) {
    const _n = (v) => typeof v === 'string'
        ? v.replace(/\r\n?/g, '\n').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim()
        : v;
    valueRu = _n(valueRu); valueEn = _n(valueEn);

    const ru = document.querySelector(`[name="fields[${baseName}][ru]"]`);
    const en = document.querySelector(`[name="fields[${baseName}][en]"]`);
    const base = document.querySelector(`[name="fields[${baseName}]"]`);

    if (ru) { 
        ru.value = valueRu || ''; 
        ru.dispatchEvent(new Event('input', { bubbles: true })); 
    } else if (base) { 
        base.value = valueRu || ''; 
        base.dispatchEvent(new Event('input', { bubbles: true })); 
    }

    if (en && valueEn) { 
        en.value = valueEn; 
        en.dispatchEvent(new Event('input', { bubbles: true })); 
    }
}

// =====================================================================================
// НОВЫЙ ГЛОБАЛЬНЫЙ ИМПОРТ ЛОТА
// =====================================================================================

function ensureImportWizardModal() {
    let overlay = document.getElementById('fp-import-wizard-overlay');
    if (overlay) return overlay;

    if (!document.getElementById('fp-iw-list-css')) {
        const s = document.createElement('style');
        s.id = 'fp-iw-list-css';
        s.textContent = `
            .fp-iw-list-item { padding:10px 12px; border-radius:8px; cursor:pointer; display:flex; flex-direction:column; gap:4px; border:1px solid transparent; transition: background 0.15s; color:var(--cw-color); }
            .fp-iw-list-item:hover { background: var(--cw-subtle); }
            .fp-iw-list-item-title { font-size:13px; font-weight:600; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
            .fp-iw-list-item-meta { font-size:11px; color:var(--cw-muted); display:flex; justify-content:space-between; }
            .fp-iw-list-item.active { background: color-mix(in srgb, var(--cw-accent) 15%, transparent); border-color: var(--cw-accent); }
            .fp-iw-search-wrap { padding:15px; border-bottom:1px solid var(--cw-border); background:rgba(0,0,0,0.1); }
            .fp-iw-pane { animation: fpCwPopIn 0.15s ease-out; }
            .fp-iw-btn-paste { padding:10px 24px; font-size:14px; }
        `;
        document.head.appendChild(s);
    }

    overlay = createElement('div', { id: 'fp-import-wizard-overlay' });
    overlay.className = 'fp-wizard-overlay';
    
    overlay.innerHTML = `
        <div id="fp-import-wizard" class="fp-wizard-container" style="max-width: 1000px; height: 80vh;">
            <div class="fp-cw-header">
                <h3>Глобальный импорт данных лота</h3>
                <button class="fp-cw-close" id="fp-iw-close">×</button>
            </div>
            <div class="fp-cw-body" style="padding:0; display:flex; flex:1; min-height:0; overflow:hidden;">
                <!-- Левая колонка: Поиск и Список -->
                <div style="width: 330px; border-right: 1px solid var(--cw-border); display: flex; flex-direction: column; flex-shrink: 0; background: var(--cw-field-bg);">
                    <div class="fp-iw-search-wrap">
                        <div class="fp-cw-tabs" style="display:flex; width:100%; margin-bottom:12px; box-sizing:border-box;">
                            <button class="fp-cw-tab active" id="fp-iw-tab-my" style="flex:1;">Мои лоты</button>
                            <button class="fp-cw-tab" id="fp-iw-tab-global" style="flex:1;">Поиск</button>
                        </div>
                        <button id="fp-iw-back-btn" class="fp-cw-btn-secondary" style="display:none; width:100%; margin-bottom:10px; padding: 6px;">← Назад</button>
                        <input type="text" class="fp-cw-input" id="fp-iw-search" placeholder="Поиск по моим лотам...">
                        <button id="fp-iw-current-cat-btn" class="fp-cw-btn-secondary" style="display:none; width:100%; margin-top:10px; padding: 6px; font-size:12px;">Искать в текущей категории</button>
                    </div>
                    <div id="fp-iw-list" style="flex:1; overflow-y:auto; padding: 10px; display:flex; flex-direction:column; gap:4px;"></div>
                </div>

                <!-- Правая колонка: Предпросмотр -->
                <div id="fp-iw-preview" style="flex:1; display:flex; flex-direction:column; padding: 20px; overflow-y:auto; background: var(--cw-bg);">
                    <div class="fp-cw-muted" style="margin:auto; text-align:center;">Выберите лот из списка слева</div>
                </div>
            </div>
        </div>
    `;
    
    document.body.appendChild(overlay);

    overlay.addEventListener('click', (e) => { if (e.target === overlay) closeImportWizard(); });
    overlay.querySelector('#fp-iw-close').addEventListener('click', closeImportWizard);

    setupImportWizardLogic(overlay);

    return overlay;
}

function openImportWizard() {
    const overlay = ensureImportWizardModal();
    overlay.style.display = 'flex';
    applyWizardTheme('fp-import-wizard');
    
    document.getElementById('fp-iw-tab-my')?.click();
}

function closeImportWizard() {
    const overlay = document.getElementById('fp-import-wizard-overlay');
    if (overlay) overlay.style.display = 'none';
}

function setupImportWizardLogic(overlay) {
    const tabMy = overlay.querySelector('#fp-iw-tab-my');
    const tabGlobal = overlay.querySelector('#fp-iw-tab-global');
    const searchInput = overlay.querySelector('#fp-iw-search');
    const backBtn = overlay.querySelector('#fp-iw-back-btn');
    const currentCatBtn = overlay.querySelector('#fp-iw-current-cat-btn');
    const listEl = overlay.querySelector('#fp-iw-list');
    const previewEl = overlay.querySelector('#fp-iw-preview');

    let currentTab = 'my';
    let globalStep = 'game'; // game -> category -> lot
    let globalGameUrl = null;
    let globalCategoryUrl = null;
    let searchDebounceTimer = null;
    let myLotsCache = [];

    // Извлечение текущей категории для кнопки "Искать в этой категории"
    let currentNodeId = null;
    const backLink = document.querySelector('a.js-back-link');
    if (backLink) {
        const m = backLink.href.match(/\/(?:lots|chips)\/(\d+)/);
        if (m) currentNodeId = m[1];
    }
    if (!currentNodeId) {
        const m = window.location.pathname.match(/\/(?:lots|chips)\/(\d+)/);
        if (m) currentNodeId = m[1];
    }
    if (!currentNodeId) {
        const nodeInput = document.querySelector('input[name="node_id"]');
        if (nodeInput) currentNodeId = nodeInput.value;
    }

    tabMy.addEventListener('click', async () => {
        currentTab = 'my';
        tabMy.classList.add('active'); tabGlobal.classList.remove('active');
        searchInput.placeholder = 'Поиск по моим лотам...';
        searchInput.value = '';
        searchInput.style.display = 'block';
        backBtn.style.display = 'none';
        currentCatBtn.style.display = 'none';
        
        listEl.innerHTML = '<div class="fp-cw-loader"></div>';
        previewEl.innerHTML = '<div class="fp-cw-muted" style="margin:auto; text-align:center;">Выберите лот из списка слева</div>';
        
        try {
            const appData = JSON.parse(document.body.dataset.appData || '{}');
            const userId = (Array.isArray(appData) ? appData[0] : appData).userId;
            const lots = await chrome.runtime.sendMessage({ action: 'getUserLotsList', userId: userId });
            
            myLotsCache = lots || [];
            renderMyLots();
        } catch (e) {
            listEl.innerHTML = `<div class="fp-cw-err" style="padding:15px; text-align:center;">Ошибка загрузки: ${e.message}</div>`;
        }
    });

    tabGlobal.addEventListener('click', () => {
        currentTab = 'global';
        tabGlobal.classList.add('active'); tabMy.classList.remove('active');
        globalStep = 'game';
        searchInput.placeholder = 'Название игры или ID категории...';
        searchInput.value = '';
        searchInput.style.display = 'block';
        backBtn.style.display = 'none';
        
        if (currentNodeId) {
            currentCatBtn.style.display = 'block';
            currentCatBtn.textContent = `Искать в текущей категории (#${currentNodeId})`;
        } else {
            currentCatBtn.style.display = 'none';
        }
        
        listEl.innerHTML = '<div class="fp-cw-muted" style="text-align:center; padding:20px;">Введите название игры или ID</div>';
        previewEl.innerHTML = '<div class="fp-cw-muted" style="margin:auto; text-align:center;">Выберите лот из списка слева</div>';
    });

    currentCatBtn.addEventListener('click', async () => {
        if (!currentNodeId) return;
        globalCategoryUrl = `https://funpay.com/lots/${currentNodeId}/`;
        globalStep = 'lot';
        searchInput.style.display = 'none';
        currentCatBtn.style.display = 'none';
        backBtn.style.display = 'block';
        
        listEl.innerHTML = '<div class="fp-cw-loader"></div>';
        try {
            const lots = await chrome.runtime.sendMessage({ action: 'getLotList', url: globalCategoryUrl });
            renderGlobalItems(lots, 'lot');
        } catch (err) { listEl.innerHTML = `<div class="fp-cw-err">Ошибка: ${err.message}</div>`; }
    });

    searchInput.addEventListener('input', () => {
        const query = searchInput.value.trim().toLowerCase();
        clearTimeout(searchDebounceTimer);
        
        if (currentTab === 'my') {
            renderMyLots(query);
        } else {
            if (globalStep === 'game') {
                if (query.match(/^\d+$/)) {
                    renderGlobalItems([{ name: 'Категория #' + query, url: 'https://funpay.com/lots/' + query + '/', count: 'Перейти' }], 'category');
                    return;
                }
                
                if (query.length < 2) {
                    listEl.innerHTML = '<div class="fp-cw-muted" style="text-align:center; padding:20px;">Введите название игры или ID</div>';
                    return;
                }
                
                searchDebounceTimer = setTimeout(async () => {
                    listEl.innerHTML = '<div class="fp-cw-loader"></div>';
                    try {
                        const games = await chrome.runtime.sendMessage({ action: 'searchGames', query: query });
                        renderGlobalItems(games, 'game');
                    } catch (e) {
                        listEl.innerHTML = `<div class="fp-cw-err" style="padding:15px; text-align:center;">Ошибка: ${e.message}</div>`;
                    }
                }, 400);
            }
        }
    });

    backBtn.addEventListener('click', async () => {
        listEl.innerHTML = '<div class="fp-cw-loader"></div>';
        previewEl.innerHTML = '<div class="fp-cw-muted" style="margin:auto; text-align:center;">Выберите лот из списка слева</div>';
        try {
            if (globalStep === 'lot') {
                globalStep = 'category';
                // Если мы перешли по "Текущая категория" или поиску ID, у нас нет globalGameUrl
                if (!globalGameUrl) {
                    globalStep = 'game';
                    searchInput.style.display = 'block';
                    backBtn.style.display = 'none';
                    if (currentNodeId) currentCatBtn.style.display = 'block';
                    searchInput.dispatchEvent(new Event('input'));
                    return;
                }
                const categories = await chrome.runtime.sendMessage({ action: 'getCategoryList', url: globalGameUrl });
                renderGlobalItems(categories, 'category');
            } else if (globalStep === 'category') {
                globalStep = 'game';
                searchInput.style.display = 'block';
                backBtn.style.display = 'none';
                if (currentNodeId) currentCatBtn.style.display = 'block';
                searchInput.dispatchEvent(new Event('input')); 
            }
        } catch (e) {
            listEl.innerHTML = `<div class="fp-cw-err" style="padding:15px; text-align:center;">Ошибка: ${e.message}</div>`;
        }
    });

    listEl.addEventListener('click', async (e) => {
        const item = e.target.closest('.fp-iw-list-item');
        if (!item) return;

        listEl.querySelectorAll('.fp-iw-list-item').forEach(el => el.classList.remove('active'));
        item.classList.add('active');

        if (currentTab === 'my') {
            loadLotPreviewForImport(item.dataset.offerId, previewEl);
        } else {
            if (globalStep === 'game') {
                globalGameUrl = item.dataset.url;
                globalStep = 'category';
                searchInput.style.display = 'none';
                currentCatBtn.style.display = 'none';
                backBtn.style.display = 'block';
                listEl.innerHTML = '<div class="fp-cw-loader"></div>';
                try {
                    const categories = await chrome.runtime.sendMessage({ action: 'getCategoryList', url: globalGameUrl });
                    renderGlobalItems(categories, 'category');
                } catch (err) { listEl.innerHTML = `<div class="fp-cw-err">Ошибка: ${err.message}</div>`; }
            } else if (globalStep === 'category') {
                globalCategoryUrl = item.dataset.url;
                globalStep = 'lot';
                listEl.innerHTML = '<div class="fp-cw-loader"></div>';
                try {
                    const lots = await chrome.runtime.sendMessage({ action: 'getLotList', url: globalCategoryUrl });
                    renderGlobalItems(lots, 'lot');
                } catch (err) { listEl.innerHTML = `<div class="fp-cw-err">Ошибка: ${err.message}</div>`; }
            } else if (globalStep === 'lot') {
                loadLotPreviewForImport(item.dataset.offerId, previewEl);
            }
        }
    });

    function renderMyLots(filter = '') {
        if (!myLotsCache || myLotsCache.length === 0) {
            listEl.innerHTML = '<div class="fp-cw-muted" style="text-align:center; padding:20px;">Нет лотов.</div>';
            return;
        }
        let html = '';
        myLotsCache.forEach(lot => {
            if (!filter || lot.title.toLowerCase().includes(filter)) {
                html += `
                <div class="fp-iw-list-item" data-offer-id="${lot.id}">
                    <span class="fp-iw-list-item-title">${escapeHtmlClone(lot.title)}</span>
                    <div class="fp-iw-list-item-meta">
                        <span>${escapeHtmlClone(lot.categoryName)}</span>
                        <span>#${lot.id}</span>
                    </div>
                </div>`;
            }
        });
        listEl.innerHTML = html || '<div class="fp-cw-muted" style="text-align:center; padding:20px;">Ничего не найдено.</div>';
    }

    function renderGlobalItems(items, type) {
        if (!items || items.length === 0) {
            listEl.innerHTML = '<div class="fp-cw-muted" style="text-align:center; padding:20px;">Ничего не найдено.</div>';
            return;
        }
        let html = '';
        if (type === 'game') {
            items.forEach(g => {
                html += `<div class="fp-iw-list-item" data-url="${g.url}" style="flex-direction:row; align-items:center;">
                    <img src="${g.img}" style="width:24px;height:24px;border-radius:4px;" onerror="this.style.display='none'">
                    <span class="fp-iw-list-item-title" style="flex:1;">${escapeHtmlClone(g.name)}</span>
                </div>`;
            });
        } else if (type === 'category') {
            items.forEach(c => {
                html += `<div class="fp-iw-list-item" data-url="${c.url}">
                    <div class="fp-iw-list-item-meta">
                        <span style="font-weight:600; color:var(--cw-color);">${escapeHtmlClone(c.name)}</span>
                        <span style="background:var(--cw-subtle); padding:2px 6px; border-radius:10px;">${c.count}</span>
                    </div>
                </div>`;
            });
        } else if (type === 'lot') {
            items.forEach(l => {
                html += `<div class="fp-iw-list-item" data-offer-id="${l.offerId}">
                    <span class="fp-iw-list-item-title">${escapeHtmlClone(l.description)}</span>
                    <div class="fp-iw-list-item-meta">
                        <span>Продавец: ${escapeHtmlClone(l.seller)}</span>
                        <span style="color:var(--cw-accent); font-weight:bold;">${escapeHtmlClone(l.price)}</span>
                    </div>
                </div>`;
            });
        }
        listEl.innerHTML = html;
    }
}

async function loadLotPreviewForImport(offerId, previewEl) {
    if (!offerId) return;
    previewEl.innerHTML = '<div class="fp-cw-loader"></div><p class="fp-cw-muted" style="text-align:center;">Анализирую лот...</p>';
    try {
        const resp = await chrome.runtime.sendMessage({ action: 'cloneGetSource', offerId });
        if (!resp || !resp.success) throw new Error(resp?.error || 'Не удалось получить данные лота.');
        renderImportPreviewPanel(resp.source, previewEl);
    } catch (e) {
        previewEl.innerHTML = `<div class="fp-cw-error">Ошибка: ${escapeHtmlClone(e.message)}</div>`;
    }
}

function renderImportPreviewPanel(src, previewEl) {
    const invincibleCheckbox = `-webkit-appearance: checkbox !important; appearance: checkbox !important; width: 15px !important; height: 15px !important; margin: 0 !important; display: inline-block !important; cursor: pointer !important; position: static !important; visibility: visible !important; opacity: 1 !important;`;
    
    previewEl.innerHTML = `
        <div class="fp-cw-section-title" style="font-size:14px; margin-bottom:15px;">Что импортировать?</div>
        
        <div style="display:flex; gap:15px; margin-bottom:20px; background:var(--cw-subtle); padding:10px 15px; border-radius:8px; flex-wrap:wrap;">
            <label style="display:flex; align-items:center; gap:6px; cursor:pointer; color:var(--cw-color); font-size:13px;">
                <input type="checkbox" id="fp-iw-opt-title" checked style="${invincibleCheckbox}"> Название
            </label>
            <label style="display:flex; align-items:center; gap:6px; cursor:pointer; color:var(--cw-color); font-size:13px;">
                <input type="checkbox" id="fp-iw-opt-desc" checked style="${invincibleCheckbox}"> Описание
            </label>
            <label style="display:flex; align-items:center; gap:6px; cursor:pointer; color:var(--cw-color); font-size:13px;">
                <input type="checkbox" id="fp-iw-opt-price" checked style="${invincibleCheckbox}"> Цена
            </label>
        </div>

        <div class="fp-cw-tabs" style="margin-bottom:15px; display:inline-flex;">
            <button class="fp-cw-tab active" data-iw-tab="ru">RU</button>
            <button class="fp-cw-tab" data-iw-tab="en">EN</button>
        </div>

        <div class="fp-iw-pane" data-iw-pane="ru">
            <label class="fp-cw-mini">Краткое описание (RU)</label>
            <textarea class="fp-cw-input" id="fp-iw-val-title-ru" rows="2" readonly>${escapeHtmlClone(src.summary_ru)}</textarea>
            <label class="fp-cw-mini">Подробное описание (RU)</label>
            <textarea class="fp-cw-input" id="fp-iw-val-desc-ru" rows="8" readonly>${escapeHtmlClone(src.desc_ru)}</textarea>
        </div>
        <div class="fp-iw-pane" data-iw-pane="en" style="display:none;">
            <label class="fp-cw-mini">Short description (EN)</label>
            <textarea class="fp-cw-input" id="fp-iw-val-title-en" rows="2" readonly>${escapeHtmlClone(src.summary_en)}</textarea>
            <label class="fp-cw-mini">Detailed description (EN)</label>
            <textarea class="fp-cw-input" id="fp-iw-val-desc-en" rows="8" readonly>${escapeHtmlClone(src.desc_en)}</textarea>
        </div>

        <div style="margin-top:15px; display:flex; align-items:center; gap:10px;">
            <label class="fp-cw-mini" style="margin:0;">Оригинальная цена:</label>
            <span style="font-weight:bold; color:var(--cw-color); font-size:14px;">${escapeHtmlClone(src.rawPrice || '-')}</span>
        </div>

        <div style="margin-top:auto; padding-top:20px; text-align:right;">
            <button class="fp-cw-btn-primary fp-iw-btn-paste" id="fp-iw-paste-btn">Вставить в текущий лот</button>
        </div>
    `;

    previewEl.querySelectorAll('.fp-cw-tab').forEach(t => {
        t.addEventListener('click', () => {
            previewEl.querySelectorAll('.fp-cw-tab').forEach(x => x.classList.remove('active'));
            t.classList.add('active');
            const paneName = t.dataset.iwTab;
            previewEl.querySelectorAll('.fp-iw-pane').forEach(p => {
                p.style.display = p.dataset.iwPane === paneName ? 'block' : 'none';
            });
        });
    });

    previewEl.querySelector('#fp-iw-paste-btn').addEventListener('click', () => {
        const doTitle = previewEl.querySelector('#fp-iw-opt-title').checked;
        const doDesc = previewEl.querySelector('#fp-iw-opt-desc').checked;
        const doPrice = previewEl.querySelector('#fp-iw-opt-price').checked;

        if (doTitle) setFormField('summary', src.summary_ru, src.summary_en);
        if (doDesc) setFormField('desc', src.desc_ru, src.desc_en);
        if (doPrice && src.rawPrice) {
            const priceInp = document.querySelector('input[name="price"]');
            if (priceInp) { priceInp.value = src.rawPrice; priceInp.dispatchEvent(new Event('input', { bubbles: true })); }
        }

        showNotification('Данные успешно импортированы в форму!', false);
        closeImportWizard();
    });
}

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
    checkForCopiedLotData();

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

        importButton.addEventListener('click', async () => {
            openImportWizard();
        });
    }
}