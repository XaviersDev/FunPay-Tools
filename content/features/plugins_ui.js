// content/features/plugins_ui.js
// ---------------------------------------------------------------------------
// UI for the FunPay Cardinal plugin engine (tab «Плагины» in the FP Tools menu).
// ---------------------------------------------------------------------------

function fptPluginSend(action, extra = {}) {
    return new Promise((resolve) => {
        try {
            chrome.runtime.sendMessage({ action, ...extra }, (res) => {
                if (chrome.runtime.lastError) resolve({ ok: false, error: chrome.runtime.lastError.message });
                else resolve(res || { ok: false, error: 'no response' });
            });
        } catch (e) { resolve({ ok: false, error: String(e && e.message || e) }); }
    });
}

function fptEscapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
}

async function fptRenderPluginsUI() {
    const page = document.querySelector('.fp-tools-page-content[data-page="plugins"]');
    if (!page) return;

    const statusEl = page.querySelector('#fpt-plugins-status');
    const listEl = page.querySelector('#fpt-plugins-list');

    const status = await fptPluginSend('fptPluginStatus');
    if (statusEl) {
        if (status && status.ready) {
            statusEl.innerHTML = `<span class="fpt-plugins-dot ok"></span> Python-движок готов` +
                (status.version ? ` <span class="fpt-plugins-muted">(Pyodide ${fptEscapeHtml(status.version)})</span>` : '');
        } else if (status && status.error) {
            statusEl.innerHTML = `<span class="fpt-plugins-dot err"></span> Движок не запущен: ${fptEscapeHtml(status.error)}`;
        } else {
            statusEl.innerHTML = `<span class="fpt-plugins-dot idle"></span> Движок запустится при первом плагине`;
        }
    }

    const res = await fptPluginSend('fptPluginList');
    if (!listEl) return;
    if (!res || !res.ok) {
        listEl.innerHTML = `<p class="template-info" style="color:#ff6b6b;">Не удалось загрузить список плагинов: ${fptEscapeHtml(res && res.error)}</p>`;
        return;
    }
    if (!res.plugins.length) {
        listEl.innerHTML = '<p class="template-info">Плагинов пока нет. Нажмите «Добавить плагин» и выберите файл <b>*.py</b> от FunPay Cardinal.</p>';
        return;
    }

    listEl.innerHTML = res.plugins.map(p => `
        <div class="fpt-plugin-card" data-uuid="${fptEscapeHtml(p.uuid)}">
            <div class="fpt-plugin-head">
                <div class="fpt-plugin-title">
                    <b>${fptEscapeHtml(p.name)}</b>
                    ${p.version ? `<span class="fpt-plugin-ver">v${fptEscapeHtml(p.version)}</span>` : ''}
                </div>
                <label class="fpt-plugin-switch" title="Вкл/выкл">
                    <input type="checkbox" class="fpt-plugin-toggle" ${p.enabled ? 'checked' : ''}>
                    <span></span>
                </label>
            </div>
            <div class="fpt-plugin-desc">${fptEscapeHtml(p.description || 'Без описания')}</div>
            <div class="fpt-plugin-meta">
                ${p.credits ? `Автор: ${fptEscapeHtml(p.credits)} · ` : ''}${(p.size / 1024).toFixed(1)} КБ
            </div>
            <div class="fpt-plugin-actions">
                <button class="btn btn-default fpt-plugin-logs">Логи</button>
                <button class="btn btn-default fpt-plugin-export">Скачать .py</button>
                <button class="btn btn-default fpt-plugin-delete" style="color:#ff6b6b;">Удалить</button>
            </div>
            <pre class="fpt-plugin-logbox" style="display:none;"></pre>
        </div>
    `).join('');

    listEl.querySelectorAll('.fpt-plugin-card').forEach(card => {
        const uuid = card.dataset.uuid;
        card.querySelector('.fpt-plugin-toggle')?.addEventListener('change', async (e) => {
            const enabled = e.target.checked;
            const r = await fptPluginSend('fptPluginToggle', { uuid, enabled });
            if (!r.ok) { showNotification(r.error || 'Ошибка переключения', true); e.target.checked = !enabled; }
            else showNotification(enabled ? 'Плагин включён.' : 'Плагин выключен.', false);
        });

        card.querySelector('.fpt-plugin-delete')?.addEventListener('click', async () => {
            if (!confirm('Удалить плагин без возможности восстановления?')) return;
            const r = await fptPluginSend('fptPluginDelete', { uuid });
            if (r.ok) { showNotification('Плагин удалён.', false); fptRenderPluginsUI(); }
            else showNotification(r.error || 'Ошибка удаления', true);
        });

        card.querySelector('.fpt-plugin-export')?.addEventListener('click', async () => {
            const r = await fptPluginSend('fptPluginGetCode', { uuid });
            if (!r.ok) { showNotification(r.error || 'Ошибка', true); return; }
            const blob = new Blob([r.code], { type: 'text/x-python' });
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = (r.name || uuid).replace(/[^\w.-]+/g, '_') + '.py';
            document.body.appendChild(a); a.click(); a.remove();
            setTimeout(() => URL.revokeObjectURL(a.href), 2000);
        });

        card.querySelector('.fpt-plugin-logs')?.addEventListener('click', async (e) => {
            const box = card.querySelector('.fpt-plugin-logbox');
            if (box.style.display === 'block') { box.style.display = 'none'; return; }
            const r = await fptPluginSend('fptPluginLogs', { uuid });
            const logs = (r && r.logs) || [];
            box.textContent = logs.length
                ? logs.map(l => `[${new Date(l.t).toLocaleTimeString()}] ${l.level}: ${l.msg}`).join('\n')
                : 'Логов пока нет.';
            box.style.display = 'block';
        });
    });
}

function initializePluginsUI() {
    const page = document.querySelector('.fp-tools-page-content[data-page="plugins"]');
    if (!page || page.dataset.initialized) return;

    const fileInput = page.querySelector('#fpt-plugins-file');
    const addBtn = page.querySelector('#fpt-plugins-add');
    const refreshBtn = page.querySelector('#fpt-plugins-refresh');
    const bootBtn = page.querySelector('#fpt-plugins-boot');

    addBtn?.addEventListener('click', () => fileInput?.click());

    fileInput?.addEventListener('change', async (e) => {
        const file = e.target.files && e.target.files[0];
        e.target.value = '';
        if (!file) return;
        if (!file.name.endsWith('.py')) { showNotification('Выберите файл .py (плагин FunPay Cardinal).', true); return; }

        const text = await file.text();
        showNotification('Разбор плагина…', false);
        const res = await fptPluginSend('fptPluginAdd', { name: file.name, code: text, source: 'file' });
        if (res.ok) {
            showNotification(res.overwrite ? 'Плагин обновлён.' : 'Плагин добавлен.', false);
            if (!res.loaded && res.error) showNotification('Загружен, но не выполнен: ' + res.error, true);
            fptRenderPluginsUI();
        } else {
            showNotification(res.error || 'Не удалось добавить плагин.', true);
        }
    });

    refreshBtn?.addEventListener('click', () => fptRenderPluginsUI());

    bootBtn?.addEventListener('click', async () => {
        showNotification('Запуск Python-движка…', false);
        const r = await fptPluginSend('fptPluginStart');
        if (r && r.ready) showNotification('Движок запущен.', false);
        else showNotification(r && r.error ? ('Ошибка: ' + r.error) : 'Нет включённых плагинов — движок запустится при добавлении.', true);
        fptRenderPluginsUI();
    });

    page.dataset.initialized = 'true';
    fptRenderPluginsUI();
}

// expose for non-module content scripts / nav
if (typeof window !== 'undefined') {
    window.initializePluginsUI = initializePluginsUI;
    window.fptRenderPluginsUI = fptRenderPluginsUI;
}
