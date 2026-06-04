// content/features/needs_tab.js
// =============================================================================
// Вкладка «Что тебе нужно».
//  • Свободный ввод → ИИ сопоставляет с реестром форс-элементов → карточки с галочками.
//  • Полный список форс-элементов с галочками (вкл/выкл) и встроенным предпросмотром.
//  • Чекбоксы → АВТОСОХРАНЕНИЕ в fpToolsDisabledFeatures при каждом изменении (скрытие живое).
// Заблокированные (locked) элементы выключать нельзя.
// =============================================================================

let __fptNeedsInited = false;

function fptNeedsRegistry() {
    return (typeof FPT_FEATURE_REGISTRY !== 'undefined' && FPT_FEATURE_REGISTRY) ||
           (typeof window !== 'undefined' && window.FPT_FEATURE_REGISTRY) || [];
}

function fptEscapeHtml(s) {
    return String(s == null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

// Inline preview markup - a faithful mini visual copy of the real element.
// Not escaped: the registry author controls this html (trusted, no user input).
// {{MAGIC_ICON}} is replaced with the real path to icons/magic.png so the AI
// button preview uses the exact same icon as the live button.
function fptNeedsPreviewHtml(entry) {
    const p = entry.preview;
    if (p && p.kind === 'html') {
        let html = p.html;
        if (html.indexOf('{{MAGIC_ICON}}') !== -1) {
            let url = 'icons/magic.png';
            try {
                if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL) {
                    url = chrome.runtime.getURL('icons/magic.png');
                }
            } catch (_) {}
            html = html.split('{{MAGIC_ICON}}').join(url);
        }
        return `<div class="fpt-pv-stage">${html}</div>`;
    }
    return `<div class="fpt-pv-stage fpt-pv-none">Нет предпросмотра</div>`;
}

// Render the full feature list grouped by `group`.
async function fptRenderNeedsList(filterText) {
    const list = document.getElementById('fptNeedsList');
    if (!list) return;
    const reg = fptNeedsRegistry();
    const { fpToolsDisabledFeatures = [] } = await chrome.storage.local.get('fpToolsDisabledFeatures');
    const disabled = new Set(Array.isArray(fpToolsDisabledFeatures) ? fpToolsDisabledFeatures : []);

    const q = (filterText || '').trim().toLowerCase();
    const groups = {};
    reg.forEach(entry => {
        if (q && !(`${entry.label} ${entry.desc}`.toLowerCase().includes(q))) return;
        (groups[entry.group] = groups[entry.group] || []).push(entry);
    });

    const groupNames = Object.keys(groups);
    if (!groupNames.length) {
        list.innerHTML = `<p class="template-info" style="text-align:center;">Ничего не найдено.</p>`;
        return;
    }

    list.innerHTML = groupNames.map(g => {
        const items = groups[g].map(entry => {
            const on = !disabled.has(entry.id);
            const locked = !!entry.locked;
            const control = locked
                ? `<span class="fpt-needs-lock" title="Эту функцию нельзя отключить - иначе пропадёт доступ к расширению"><span class="material-symbols-rounded">lock</span></span>`
                : `<input type="checkbox" class="fpt-needs-cb" data-id="${entry.id}" ${on ? 'checked' : ''}>`;
            return `
            <div class="fpt-needs-item${locked ? ' fpt-needs-locked' : ''}" data-id="${entry.id}">
                <label class="fpt-needs-check">
                    ${control}
                    <span class="fpt-needs-item-text">
                        <span class="fpt-needs-item-label">${fptEscapeHtml(entry.label)}</span>
                        <span class="fpt-needs-item-desc">${fptEscapeHtml(entry.desc)}</span>
                    </span>
                </label>
                <button type="button" class="fpt-needs-preview-btn" data-id="${entry.id}" title="Показать предпросмотр"><span class="material-symbols-rounded">visibility</span></button>
            </div>
            <div class="fpt-needs-preview-row" data-id="${entry.id}" style="display:none;">
                <span class="fpt-needs-preview-caption">Так выглядит элемент:</span>
                ${fptNeedsPreviewHtml(entry)}
            </div>`;
        }).join('');
        return `
            <div class="fpt-needs-group">
                <div class="fpt-needs-group-title">${fptEscapeHtml(g)}</div>
                ${items}
            </div>`;
    }).join('');
}

// Save the current checkbox state immediately (autosave). Called on every
// checkbox change - there is no separate "apply" button anymore.
async function fptApplyNeedsSelection() {
    const list = document.getElementById('fptNeedsList');
    const status = document.getElementById('fptNeedsStatus');
    if (!list) return;
    const reg = fptNeedsRegistry();
    const lockedIds = new Set(reg.filter(e => e.locked).map(e => e.id));
    // Only ids that exist in the CURRENT registry are valid. Anything else in
    // storage is stale (left over from an old version / removed feature) and must
    // never be counted or kept - that was the cause of the bogus "Отключено: 10".
    const knownIds = new Set(reg.map(e => e.id));

    // Start from the previously-saved set so features filtered out of the current
    // view (by search) keep their state, then update from visible checkboxes.
    let prev = [];
    try {
        const data = await chrome.storage.local.get('fpToolsDisabledFeatures');
        prev = Array.isArray(data.fpToolsDisabledFeatures) ? data.fpToolsDisabledFeatures : [];
    } catch (_) { prev = []; }
    // keep only valid, non-locked, currently-known ids → prunes stale garbage
    const disabledSet = new Set(prev.filter(id => knownIds.has(id) && !lockedIds.has(id)));

    list.querySelectorAll('.fpt-needs-cb').forEach(cb => {
        if (lockedIds.has(cb.dataset.id) || !knownIds.has(cb.dataset.id)) return;
        if (cb.checked) disabledSet.delete(cb.dataset.id);
        else disabledSet.add(cb.dataset.id);
    });

    const disabled = Array.from(disabledSet);

    try {
        await chrome.storage.local.set({ fpToolsDisabledFeatures: disabled });
        // refresh live CSS hiding immediately
        if (typeof window !== 'undefined' && typeof window.fptApplyDisabledFeatures === 'function') {
            await window.fptApplyDisabledFeatures(disabled);
        }
        if (status) {
            status.textContent = disabled.length
                ? `Сохранено · отключено: ${disabled.length}`
                : 'Сохранено · все элементы включены';
            status.classList.remove('fpt-needs-status-err');
            status.classList.add('fpt-needs-status-ok');
            clearTimeout(fptApplyNeedsSelection._t);
            fptApplyNeedsSelection._t = setTimeout(() => {
                if (status) status.classList.remove('fpt-needs-status-ok');
            }, 1400);
        }
    } catch (e) {
        console.error('FP Tools: ошибка автосохранения needs', e);
        if (status) {
            status.textContent = 'Ошибка сохранения: ' + (e && e.message ? e.message : 'неизвестно');
            status.classList.remove('fpt-needs-status-ok');
            status.classList.add('fpt-needs-status-err');
        }
        if (typeof showNotification === 'function') showNotification('Не удалось сохранить настройки.', true);
    }
}

// Ask the AI which features the user wants to disable, then show confirm cards.
async function fptNeedsAskAI() {
    const input = document.getElementById('fptNeedsInput');
    const resultBox = document.getElementById('fptNeedsAiResult');
    const askBtn = document.getElementById('fptNeedsAskBtn');
    if (!input || !resultBox) return;

    const text = input.value.trim();
    if (!text) {
        if (typeof showNotification === 'function') showNotification('Напишите, что вы хотите отключить.', true);
        return;
    }

    const reg = fptNeedsRegistry();
    // exclude locked entries from what the AI may suggest
    const offerable = reg.filter(e => !e.locked);
    const compact = JSON.stringify(offerable.map(e => ({ id: e.id, label: e.label, desc: e.desc })));

    askBtn.disabled = true;
    askBtn.classList.add('fpt-needs-loading');
    resultBox.style.display = 'block';
    resultBox.innerHTML = `<div class="fpt-needs-ai-loading"><span class="material-symbols-rounded fpt-spin">progress_activity</span> ИИ анализирует ваш запрос…</div>`;

    let matches = [];
    try {
        const resp = await chrome.runtime.sendMessage({
            action: 'getAIProcessedText',
            text: text,
            context: compact,
            myUsername: '',
            type: 'feature_match'
        });
        if (resp && resp.success) {
            let raw = (resp.data || '').trim();
            raw = raw.replace(/^```json\s*/i, '').replace(/^```\s*/, '').replace(/```$/, '').trim();
            matches = JSON.parse(raw);
            if (!Array.isArray(matches)) matches = [];
        } else {
            throw new Error(resp ? resp.error : 'нет ответа');
        }
    } catch (e) {
        console.error('FP Tools needs AI error:', e);
        resultBox.innerHTML = `<div class="fpt-needs-ai-error"><span class="material-symbols-rounded">error</span> Не удалось разобрать ответ ИИ. Переформулируйте запрос или отметьте элементы вручную ниже.</div>`;
        askBtn.disabled = false;
        askBtn.classList.remove('fpt-needs-loading');
        return;
    }

    const byId = {};
    offerable.forEach(e => { byId[e.id] = e; });
    matches = matches.filter(m => m && byId[m.id]);

    if (!matches.length) {
        resultBox.innerHTML = `<div class="fpt-needs-ai-empty"><span class="material-symbols-rounded">info</span> ИИ не нашёл подходящих элементов. Опишите иначе или отметьте вручную ниже.</div>`;
        askBtn.disabled = false;
        askBtn.classList.remove('fpt-needs-loading');
        return;
    }

    resultBox.innerHTML = `
        <div class="fpt-needs-ai-head">
            <span class="material-symbols-rounded">auto_awesome</span>
            ИИ предлагает отключить это. Отметьте, что действительно выключить:
        </div>
        <div class="fpt-needs-ai-cards">
            ${matches.map(m => {
                const e = byId[m.id];
                const conf = Math.round((m.confidence || 0) * 100);
                return `
                <div class="fpt-needs-ai-card">
                    <label class="fpt-needs-ai-card-main">
                        <input type="checkbox" class="fpt-needs-ai-pick" data-id="${e.id}" checked>
                        <span>
                            <span class="fpt-needs-ai-card-label">${fptEscapeHtml(e.label)}</span>
                            <span class="fpt-needs-ai-card-reason">${fptEscapeHtml(m.reason || e.desc)}</span>
                        </span>
                    </label>
                    <span class="fpt-needs-ai-conf" title="Уверенность ИИ">${conf}%</span>
                </div>`;
            }).join('')}
        </div>
        <button id="fptNeedsAiConfirm" class="btn">Отключить выбранное</button>`;

    askBtn.disabled = false;
    askBtn.classList.remove('fpt-needs-loading');
}

// Wire all event handlers (idempotent).
function initializeNeedsTab() {
    fptRenderNeedsList('');

    if (__fptNeedsInited) return;
    __fptNeedsInited = true;

    const page = document.querySelector('.fp-tools-page-content[data-page="needs"]');
    if (!page) return;

    const askBtn = document.getElementById('fptNeedsAskBtn');
    if (askBtn) askBtn.addEventListener('click', fptNeedsAskAI);

    const filter = document.getElementById('fptNeedsFilter');
    if (filter) filter.addEventListener('input', () => fptRenderNeedsList(filter.value));

    // AUTOSAVE: every checkbox toggle in the list saves instantly (no apply button).
    page.addEventListener('change', (e) => {
        if (e.target.classList && e.target.classList.contains('fpt-needs-cb')) {
            fptApplyNeedsSelection();
        }
    });

    // delegated clicks: toggle inline preview + AI confirm
    page.addEventListener('click', async (e) => {
        const previewBtn = e.target.closest('.fpt-needs-preview-btn');
        if (previewBtn) {
            e.preventDefault();
            const id = previewBtn.dataset.id;
            const row = page.querySelector(`.fpt-needs-preview-row[data-id="${CSS.escape(id)}"]`);
            if (row) {
                const showing = row.style.display !== 'none';
                row.style.display = showing ? 'none' : 'flex';
                previewBtn.classList.toggle('fpt-needs-preview-open', !showing);
            }
            return;
        }
        if (e.target.closest('#fptNeedsAiConfirm')) {
            const resultBox = document.getElementById('fptNeedsAiResult');
            const picks = resultBox.querySelectorAll('.fpt-needs-ai-pick');
            const toDisable = new Set();
            picks.forEach(cb => { if (cb.checked) toDisable.add(cb.dataset.id); });
            // reflect into main list checkboxes (uncheck = disable) → autosave
            document.querySelectorAll('.fpt-needs-cb').forEach(cb => {
                if (toDisable.has(cb.dataset.id)) cb.checked = false;
            });
            await fptApplyNeedsSelection();
            const confirmBtn = resultBox.querySelector('#fptNeedsAiConfirm');
            if (confirmBtn) confirmBtn.textContent = 'Отключено ✓';
        }
    });
}

if (typeof window !== 'undefined') {
    window.initializeNeedsTab = initializeNeedsTab;
}
