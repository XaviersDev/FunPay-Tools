// content/features/settings_io.js — FunPay Tools 2.9
// Экспорт и импорт всех настроек FunPay Tools в файл .fpconfig

const FP_CONFIG_VERSION  = 1;
const FP_CONFIG_MAGIC    = 'FPTCONFIG';

// Keys to export/import (excludes session data, pinned lots handled separately)
const EXPORT_KEYS = [
    'fpToolsAutoReplies',
    'fpToolsCustomTheme',
    'enableCustomTheme',
    'enableRedesignedHomepage',
    'showSalesStats',
    'hideBalance',
    'viewSellersPromo',
    'notificationSound',
    'fpToolsDiscord',
    'autoBumpEnabled',
    'autoBumpCooldown',
    'fpToolsSelectiveBumpEnabled',
    'fpToolsSelectedBumpCategories',
    'fpToolsBumpOnlyAutoDelivery',
    'fpToolsTemplates',
    'fpToolsCursorFx',
    'fpToolsCustomCursor',
    'sendTemplatesImmediately',
    'templatePos',
    'fpToolsPiggyBanks',
    'fpToolsNotes',
    'fpToolsPinnedLots',
    'fpToolsIdentifierEnabled',
    'fpToolsHeaderPosition',
    'fpToolsPopupPosition',
    'fpToolsPopupSize',
    'headerPositionSelect',
];

async function exportSettings() {
    try {
        const data = await chrome.storage.local.get(EXPORT_KEYS);

        const exportObj = {
            _magic:   FP_CONFIG_MAGIC,
            _version: FP_CONFIG_VERSION,
            _date:    new Date().toISOString(),
            _extVer:  chrome.runtime.getManifest().version,
            settings: data
        };

        const json     = JSON.stringify(exportObj, null, 2);
        const blob     = new Blob([json], { type: 'application/json' });
        const url      = URL.createObjectURL(blob);
        const dateStr  = new Date().toISOString().slice(0, 10);
        const a        = document.createElement('a');
        a.href         = url;
        a.download     = `FunPayTools_config_${dateStr}.fpconfig`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);

        showNotification('Настройки экспортированы ✓');
    } catch (e) {
        showNotification(`Ошибка экспорта: ${e.message}`, true);
    }
}

async function importSettings(file) {
    try {
        const text = await file.text();
        const obj  = JSON.parse(text);

        if (obj._magic !== FP_CONFIG_MAGIC) {
            throw new Error('Неверный формат файла. Выберите файл .fpconfig от FunPay Tools.');
        }

        if (!obj.settings || typeof obj.settings !== 'object') {
            throw new Error('Файл не содержит настроек.');
        }

        // Strip unknown keys for safety
        const safe = {};
        EXPORT_KEYS.forEach(k => {
            if (k in obj.settings) safe[k] = obj.settings[k];
        });

        await chrome.storage.local.set(safe);

        const fromVer = obj._extVer ? ` (из v${obj._extVer})` : '';
        showNotification(`Настройки импортированы${fromVer} — перезагрузите страницу ✓`);

        // Reload after 1.5s
        setTimeout(() => window.location.reload(), 1500);
    } catch (e) {
        showNotification(`Ошибка импорта: ${e.message}`, true);
    }
}

function initializeSettingsIO() {
    const exportBtn = document.getElementById('fp-settings-export-btn');
    const importBtn = document.getElementById('fp-settings-import-btn');
    const importInput = document.getElementById('fp-settings-import-input');

    if (!exportBtn) return;

    exportBtn.addEventListener('click', exportSettings);

    importBtn?.addEventListener('click', () => importInput?.click());

    importInput?.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) importSettings(file);
        importInput.value = '';
    });
}
