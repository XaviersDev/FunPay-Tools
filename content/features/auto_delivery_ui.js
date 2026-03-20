function initAutoDeliveryUI() {
    const page = document.querySelector('.fp-tools-page-content[data-page="auto_delivery"]');
    if (!page || page.dataset.initialized) return;
    page.dataset.initialized = 'true';

    const loadBtn = document.getElementById('fp-load-delivery-lots-btn');
    const listEl  = document.getElementById('fp-delivery-lots-list');
    if (!loadBtn || !listEl) return;

    loadBtn.addEventListener('click', async () => {
        loadBtn.disabled = true;
        loadBtn.textContent = 'Загружаем...';

        try {
            const appData = JSON.parse(document.body.dataset.appData || '{}');
            const d = Array.isArray(appData) ? appData[0] : appData;
            const userId = d.userId;
            if (!userId) throw new Error('Нет userId');

            const lots = await new Promise((resolve, reject) => {
                chrome.runtime.sendMessage({ action: 'getUserLotsList', userId }, res => {
                    if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
                    else resolve(res || []);
                });
            });

            if (!lots.length) {
                listEl.innerHTML = '<p class="template-info" style="text-align:center;">Лоты не найдены</p>';
                return;
            }

            const { fpToolsAutoDeliveryLots = {} } = await chrome.storage.local.get('fpToolsAutoDeliveryLots');
            renderDeliveryLots(lots, fpToolsAutoDeliveryLots, listEl);

        } catch (e) {
            showNotification(`Ошибка: ${e.message}`, true);
        } finally {
            loadBtn.disabled = false;
            loadBtn.textContent = 'Загрузить список лотов';
        }
    });
}

function renderDeliveryLots(lots, config, container) {
    container.innerHTML = '';

    
    const byCategory = {};
    lots.forEach(lot => {
        if (!byCategory[lot.categoryName]) byCategory[lot.categoryName] = [];
        byCategory[lot.categoryName].push(lot);
    });

    Object.entries(byCategory).forEach(([cat, catLots]) => {
        const catEl = document.createElement('div');
        catEl.style.cssText = 'margin-bottom:16px;';
        catEl.innerHTML = `<div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:#4a4f68;margin-bottom:6px;padding-bottom:4px;border-bottom:1px solid #1e2030;">${cat}</div>`;

        catLots.forEach(lot => {
            const lotConfig = config[String(lot.id)] || {};
            const item = document.createElement('div');
            item.style.cssText = `
                background:#0e0f16;border:1px solid #1e2030;border-radius:8px;
                padding:12px;margin-bottom:8px;
            `;

            item.innerHTML = `
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
                    <span style="font-size:13px;font-weight:600;color:#d8dae8;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:70%;">${lot.title}</span>
                    <div style="display:flex;gap:6px;align-items:center;">
                        <span class="fp-ad-product-count" data-lot-id="${lot.id}" style="font-size:11px;color:#5a5f7a;">
                            ${lotConfig.productCount !== undefined ? `📦 ${lotConfig.productCount} шт.` : ''}
                        </span>
                        <label style="display:flex;align-items:center;gap:4px;font-size:11px;color:#5a5f7a;cursor:pointer;">
                            <input type="checkbox" class="fp-ad-enabled" data-lot-id="${lot.id}" ${lotConfig.enabled ? 'checked' : ''} style="accent-color:#6B66FF;">
                            Авто-выдача
                        </label>
                    </div>
                </div>
                <div class="fp-ad-settings" data-lot-id="${lot.id}" style="display:${lotConfig.enabled ? 'block' : 'none'};">
                    <div class="fp-tools-radio-group" style="margin-bottom:8px;flex-wrap:wrap;">
                        <label class="fp-tools-radio-option">
                            <input type="radio" name="fp-ad-mode-${lot.id}" value="secrets" ${(lotConfig.mode || 'secrets') === 'secrets' ? 'checked' : ''}>
                            <span>Секреты лота (автоматически)</span>
                        </label>
                        <label class="fp-tools-radio-option">
                            <input type="radio" name="fp-ad-mode-${lot.id}" value="template" ${lotConfig.mode === 'template' ? 'checked' : ''}>
                            <span>Свой шаблон</span>
                        </label>
                    </div>
                    <div class="fp-ad-template-area" data-lot-id="${lot.id}" style="display:${lotConfig.mode === 'template' ? 'block' : 'none'};">
                        <textarea class="template-input fp-ad-template-text" data-lot-id="${lot.id}"
                            placeholder="Текст выдачи. Переменные: {buyername}, {orderid}, {orderlink}, $sleep=3&#10;Для нескольких товаров используйте $sleep=2 между ними."
                            style="height:80px;">${lotConfig.text || ''}</textarea>
                    </div>
                    <div style="display:flex;gap:8px;margin-top:8px;flex-wrap:wrap;">
                        <label style="display:flex;align-items:center;gap:4px;font-size:11px;color:#5a5f7a;cursor:pointer;">
                            <input type="checkbox" class="fp-ad-auto-restore" data-lot-id="${lot.id}" ${lotConfig.autoRestoreEnabled !== false ? 'checked' : ''} style="accent-color:#4caf82;">
                            Авто-восстановление
                        </label>
                        <label style="display:flex;align-items:center;gap:4px;font-size:11px;color:#5a5f7a;cursor:pointer;">
                            <input type="checkbox" class="fp-ad-auto-disable" data-lot-id="${lot.id}" ${lotConfig.autoDisableEnabled !== false ? 'checked' : ''} style="accent-color:#e05252;">
                            Авто-деактивация при пустом складе
                        </label>
                    </div>
                    <button class="btn btn-default fp-ad-save-btn" data-lot-id="${lot.id}"
                        style="padding:5px 12px;font-size:12px;margin-top:8px;">
                        💾 Сохранить
                    </button>
                </div>
            `;

            catEl.appendChild(item);
        });

        container.appendChild(catEl);
    });

    
    container.querySelectorAll('.fp-ad-enabled').forEach(cb => {
        cb.addEventListener('change', () => {
            const lotId = cb.dataset.lotId;
            const settingsArea = container.querySelector(`.fp-ad-settings[data-lot-id="${lotId}"]`);
            if (settingsArea) settingsArea.style.display = cb.checked ? 'block' : 'none';
            autoSaveDeliveryLot(lotId, container);
        });
    });

    container.querySelectorAll('input[name^="fp-ad-mode-"]').forEach(radio => {
        radio.addEventListener('change', () => {
            const lotId = radio.name.replace('fp-ad-mode-', '');
            const tplArea = container.querySelector(`.fp-ad-template-area[data-lot-id="${lotId}"]`);
            if (tplArea) tplArea.style.display = radio.value === 'template' ? 'block' : 'none';
        });
    });

    container.querySelectorAll('.fp-ad-save-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            const lotId = btn.dataset.lotId;
            btn.textContent = '✓ Сохранено';
            btn.style.color = '#4caf82';
            await autoSaveDeliveryLot(lotId, container);
            setTimeout(() => { btn.textContent = '💾 Сохранить'; btn.style.color = ''; }, 1500);
        });
    });
}

async function autoSaveDeliveryLot(lotId, container) {
    const { fpToolsAutoDeliveryLots = {} } = await chrome.storage.local.get('fpToolsAutoDeliveryLots');

    const enabledEl = container.querySelector(`.fp-ad-enabled[data-lot-id="${lotId}"]`);
    const modeEl    = container.querySelector(`input[name="fp-ad-mode-${lotId}"]:checked`);
    const textEl    = container.querySelector(`.fp-ad-template-text[data-lot-id="${lotId}"]`);
    const restoreEl = container.querySelector(`.fp-ad-auto-restore[data-lot-id="${lotId}"]`);
    const disableEl = container.querySelector(`.fp-ad-auto-disable[data-lot-id="${lotId}"]`);

    fpToolsAutoDeliveryLots[String(lotId)] = {
        enabled:           enabledEl?.checked ?? false,
        mode:              modeEl?.value || 'secrets',
        text:              textEl?.value || '',
        autoRestoreEnabled: restoreEl?.checked !== false,
        autoDisableEnabled: disableEl?.checked !== false,
        productCount:      fpToolsAutoDeliveryLots[String(lotId)]?.productCount ?? 0,
        updatedAt:         Date.now()
    };

    await chrome.storage.local.set({ fpToolsAutoDeliveryLots });
}

async function initStockCounterDisplay() {
    if (!window.location.pathname.match(/\/users\/\d+\/?/)) return;

    const { fpToolsAutoDeliveryLots = {} } = await chrome.storage.local.get('fpToolsAutoDeliveryLots');
    if (!Object.keys(fpToolsAutoDeliveryLots).length) return;

    document.querySelectorAll('a.tc-item:not(.fp-stock-init)').forEach(row => {
        row.classList.add('fp-stock-init');
        const offerMatch = row.getAttribute('href')?.match(/id=(\d+)/);
        if (!offerMatch) return;
        const lotId = offerMatch[1];
        const config = fpToolsAutoDeliveryLots[String(lotId)];
        if (!config?.enabled) return;

        const priceEl = row.querySelector('.tc-price');
        if (!priceEl) return;

        const count = config.productCount ?? 0;
        const badge = document.createElement('span');
        badge.style.cssText = `
            font-size:10px;font-weight:700;border-radius:3px;padding:1px 4px;margin-left:4px;
            background:${count > 3 ? 'rgba(76,175,130,0.15)' : count > 0 ? 'rgba(255,152,0,0.15)' : 'rgba(224,82,82,0.15)'};
            color:${count > 3 ? '#4caf82' : count > 0 ? '#ff9800' : '#e05252'};
            border:1px solid ${count > 3 ? 'rgba(76,175,130,0.3)' : count > 0 ? 'rgba(255,152,0,0.3)' : 'rgba(224,82,82,0.3)'};
            vertical-align:middle;
        `;
        badge.textContent = count > 0 ? `📦 ${count}` : '📭 0';
        badge.title = count > 0 ? `${count} товаров в авто-выдаче` : 'Товары закончились!';
        priceEl.appendChild(badge);
    });
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initStockCounterDisplay);
} else {
    initStockCounterDisplay();
}

new MutationObserver(() => initStockCounterDisplay())
    .observe(document.body, { childList: true, subtree: true });
