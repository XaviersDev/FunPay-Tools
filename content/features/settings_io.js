// content/features/settings_io.js - FunPay Tools 2.9
// Экспорт и импорт ВСЕХ настроек FunPay Tools в файл .fpconfig
// Принцип: выгружаем всё из chrome.storage.local, КРОМЕ списка исключений
// (аккаунты, токены, кэши и временное рантайм-состояние). Так новые фичи
// попадают в бэкап автоматически, без правки списка.

const FP_CONFIG_VERSION  = 2;
const FP_CONFIG_MAGIC    = 'FPTCONFIG';

// Ключи, которые НЕ экспортируем.
// 1) Аккаунты и авторизация — по требованию исключаем.
// 2) Токены/секреты сторонних сервисов.
// 3) Большие кэши и временное состояние, которое только навредит на другом
//    устройстве (heartbeat, «seeded/processed/collecting», позиции окна и т.п.).
const EXCLUDE_KEYS = new Set([
    // --- Аккаунты (НИКОГДА не экспортируем) ---
    'fpToolsAccounts',
    'fpToolsAccountsList',
    // --- Токены/секреты ---
    'fpToolsGCToken',
    'fpToolsGCConfig',
    'fpToolsGCConfigTs',
    // --- Рантайм/служебное состояние движков (per-device) ---
    'fpToolsEngineHeartbeat',
    'fpToolsTelegramPoll',
    'fpToolsTelegramSeeded',
    'fpToolsTelegramOrdersSeeded',
    'fpToolsTelegramProcessedIds',
    'fpToolsTelegramProcessedOrders',
    'fpToolsDiscordSeeded',
    'fpToolsDiscordCheck',
    'fpToolsProcessedDiscordIds',
    'fpToolsSalesCollecting',
    'fpToolsPurchasesCollecting',
    'fpToolsFinanceCollecting',
    'fpToolsSalesLastUpdate',
    'fpToolsPurchasesLastUpdate',
    'fpToolsFinanceLastUpdate',
    'fpToolsFinanceCount',
    'fpToolsFirstOrderId',
    'fpToolsLastOrderId',
    'fpToolsLotImportProcess',
    'fpToolsCheckRestoreLots',
    'fpToolsBlacklistUpdated',
    'fpToolsUnreadCount',
    // --- Кэши (большие, легко перезапросятся) ---
    'fpToolsWallpaperCache',
    'fpToolsImageStore',
    'fpToolsImageCanvas',
    'fpToolsCustomSoundData',   // звук может весить много; мета оставляем
    'fpToolsBuyerHistory',
    'fpToolsBuyerViewing',
    // --- Чисто UI-состояние текущей вкладки/окна (per-device) ---
    'fpToolsLastPage',
    'fpToolsPopupDragged',
]);

async function exportSettings() {
    try {
        // Берём ВСЁ хранилище и фильтруем исключения.
        const all = await chrome.storage.local.get(null);
        const data = {};
        for (const [k, v] of Object.entries(all)) {
            if (EXCLUDE_KEYS.has(k)) continue;
            data[k] = v;
        }

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

        const cnt = Object.keys(data).length;
        showNotification(`Настройки экспортированы (${cnt} разделов) ✓`);
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

        // На всякий случай НЕ применяем исключённые ключи, даже если они попали
        // в старый файл (например, аккаунты из бэкапа другой версии).
        const safe = {};
        for (const [k, v] of Object.entries(obj.settings)) {
            if (EXCLUDE_KEYS.has(k)) continue;
            safe[k] = v;
        }

        await chrome.storage.local.set(safe);

        const cnt = Object.keys(safe).length;
        const fromVer = obj._extVer ? ` из v${obj._extVer}` : '';
        showNotification(`Импортировано ${cnt} разделов${fromVer} — перезагрузите страницу ✓`);

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
