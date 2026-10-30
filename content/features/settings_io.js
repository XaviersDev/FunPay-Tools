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
    'fpToolsAISettings',
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

// ── 3.1: Пользовательские API-токены ИИ (Gemini, Groq, OpenRouter, Mistral, Custom) ──
const DEFAULT_AI_SETTINGS = {
    enabled: false,
    activeProvider: 'gemini',
    providers: {
        gemini: {
            apiKey: '',
            models: 'gemini-2.5-flash, gemini-2.5-flash-lite, gemini-3.5-flash-lite, gemini-3.8-flash, gemini-3.6-flash'
        },
        groq: {
            apiKey: '',
            models: 'llama-3.3-70b-versatile, llama-3.1-8b-instant, gemma2-9b-it, mixtral-8x7b-32768'
        },
        openrouter: {
            apiKey: '',
            models: 'google/gemini-2.5-flash:free, meta-llama/llama-3.3-70b-instruct:free, deepseek/deepseek-r1:free, deepseek/deepseek-chat:free, qwen/qwen-2.5-72b-instruct:free'
        },
        mistral: {
            apiKey: '',
            models: 'mistral-small-latest, codestral-latest, open-mistral-nemo, open-mistral-7b'
        }
    }
};

const PROVIDER_NAMES = {
    gemini: 'Google Gemini',
    groq: 'Groq Cloud',
    openrouter: 'OpenRouter',
    mistral: 'Mistral AI'
};

const PROVIDER_TAB_COLORS = {
    gemini: { bg: 'rgba(157,114,255,0.18)', border: 'rgba(157,114,255,0.4)', text: '#fff' },
    groq: { bg: 'rgba(245,158,11,0.18)', border: 'rgba(245,158,11,0.4)', text: '#fff' },
    openrouter: { bg: 'rgba(59,130,246,0.18)', border: 'rgba(59,130,246,0.4)', text: '#fff' },
    mistral: { bg: 'rgba(236,72,153,0.18)', border: 'rgba(236,72,153,0.4)', text: '#fff' }
};

const RECOMMENDED_AI_MODELS = {
    gemini: 'gemini-3.8-flash, gemini-3.6-flash, gemini-3.5-flash-lite, gemini-3.1-flash-lite, gemini-2.5-flash',
    groq: 'llama-3.3-70b-versatile, llama-3.1-8b-instant, gemma2-9b-it, mixtral-8x7b-32768',
    openrouter: 'google/gemini-2.5-flash:free, meta-llama/llama-3.3-70b-instruct:free, deepseek/deepseek-r1:free, deepseek/deepseek-chat:free, qwen/qwen-2.5-72b-instruct:free',
    mistral: 'mistral-small-latest, codestral-latest, open-mistral-nemo, open-mistral-7b'
};

async function initializeAITokensSettings() {
    const enabledCb = document.getElementById('fpAITokensEnabled');
    const container = document.getElementById('fpAITokensContainer');
    if (!enabledCb || !container) return;

    const tabBtns = container.querySelectorAll('.fp-ai-tab-btn');
    const panels = container.querySelectorAll('.fp-ai-panel');
    const testBtn = document.getElementById('fp-ai-test-btn');
    const saveBtn = document.getElementById('fp-ai-save-btn');
    const statusMsg = document.getElementById('fp-ai-status-msg');
    const activeBadge = document.getElementById('fp-ai-active-badge');
    const activeNameEl = document.getElementById('fp-ai-active-name');

    // Load saved settings
    const stored = (await chrome.storage.local.get('fpToolsAISettings')).fpToolsAISettings || {};

    // 3.1 Migration: автоматическое удаление устаревших/отключённых моделей Google Gemini 2.0 / 1.5 из сохранённых настроек
    const DEPRECATED_GEMINI_PATTERNS = ['gemini-2.0', 'gemini-1.5', 'gemini-1.0', 'gemini-2.5-pro', 'gemini-flash-latest'];
    let needsStorageMigration = false;

    if (stored.providers?.gemini?.models) {
        const geminiModelsStr = Array.isArray(stored.providers.gemini.models)
            ? stored.providers.gemini.models.join(', ')
            : String(stored.providers.gemini.models);
        const hasDeprecated = DEPRECATED_GEMINI_PATTERNS.some(dep => geminiModelsStr.includes(dep));
        const startsWithSlowModel = geminiModelsStr.trim().startsWith('gemini-3.8');
        if (hasDeprecated || startsWithSlowModel) {
            stored.providers.gemini.models = RECOMMENDED_AI_MODELS.gemini.split(',').map(m => m.trim());
            needsStorageMigration = true;
        }
    }

    if (needsStorageMigration) {
        chrome.storage.local.set({ fpToolsAISettings: stored });
    }
    const settings = {
        enabled: stored.enabled ?? false,
        activeProvider: stored.activeProvider || 'gemini',
        providers: {
            gemini: { ...DEFAULT_AI_SETTINGS.providers.gemini, ...(stored.providers?.gemini || {}) },
            groq: { ...DEFAULT_AI_SETTINGS.providers.groq, ...(stored.providers?.groq || {}) },
            openrouter: { ...DEFAULT_AI_SETTINGS.providers.openrouter, ...(stored.providers?.openrouter || {}) },
            mistral: { ...DEFAULT_AI_SETTINGS.providers.mistral, ...(stored.providers?.mistral || {}) }
        }
    };

    enabledCb.checked = settings.enabled;
    container.style.display = settings.enabled ? 'block' : 'none';

    // Populate input fields
    for (const [pId, pData] of Object.entries(settings.providers)) {
        const keyInput = document.getElementById(`fp-ai-key-${pId}`);
        const modelsInput = document.getElementById(`fp-ai-models-${pId}`);
        if (keyInput) keyInput.value = pData.apiKey || '';
        if (modelsInput) {
            let mVal = Array.isArray(pData.models) ? pData.models.join(', ') : (pData.models || '');
            if (pId === 'gemini' && (DEPRECATED_GEMINI_PATTERNS.some(dep => mVal.includes(dep)) || mVal.trim().startsWith('gemini-3.8'))) {
                mVal = RECOMMENDED_AI_MODELS.gemini;
            }
            modelsInput.value = mVal;
        }
        
    }

    let currentActiveProvider = settings.activeProvider || 'gemini';

    function updateActiveBadge() {
        if (!activeBadge || !activeNameEl) return;
        const currentConfig = settings.providers[currentActiveProvider];
        const hasKey = Boolean(currentConfig?.apiKey);
        if (settings.enabled && hasKey) {
            activeBadge.style.display = 'inline-block';
            activeNameEl.textContent = PROVIDER_NAMES[currentActiveProvider] || currentActiveProvider;
        } else {
            activeBadge.style.display = 'none';
        }
    }

    function switchTab(providerId) {
        currentActiveProvider = providerId;
        tabBtns.forEach(btn => {
            const isTarget = btn.dataset.provider === providerId;
            btn.classList.toggle('active', isTarget);
            btn.style.background = '';
            btn.style.borderColor = '';
            btn.style.color = '';
        });

        panels.forEach(panel => {
            panel.style.display = panel.dataset.panel === providerId ? 'block' : 'none';
        });

        updateActiveBadge();
    }

    // Switch to loaded active provider
    switchTab(currentActiveProvider);

    // Event: Toggle visibility of API container
    enabledCb.addEventListener('change', async () => {
        settings.enabled = enabledCb.checked;
        container.style.display = settings.enabled ? 'block' : 'none';
        await saveSettings(true);
        updateActiveBadge();
    });

    // Event: Click on provider tab
    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const pId = btn.dataset.provider;
            if (pId) {
                switchTab(pId);
                settings.activeProvider = pId;
                saveSettings(true);
            }
        });
    });

    // Event: Toggle password visibility
    container.querySelectorAll('.fp-ai-toggle-key-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const targetId = btn.dataset.target;
            const targetInput = document.getElementById(targetId);
            if (targetInput) {
                if (targetInput.type === 'password') {
                    targetInput.type = 'text';
                    btn.textContent = '🔒';
                } else {
                    targetInput.type = 'password';
                    btn.textContent = '👁';
                }
            }
        });
    });

    // Collect settings from UI inputs
    function collectCurrentSettings() {
        const out = {
            enabled: enabledCb.checked,
            activeProvider: currentActiveProvider,
            providers: {}
        };

        ['gemini', 'groq', 'openrouter', 'mistral'].forEach(pId => {
            const keyEl = document.getElementById(`fp-ai-key-${pId}`);
            const modelsEl = document.getElementById(`fp-ai-models-${pId}`);
            const modelsArr = modelsEl ? modelsEl.value.split(',').map(m => m.trim()).filter(Boolean) : [];

            out.providers[pId] = {
                apiKey: keyEl ? keyEl.value.trim() : '',
                models: modelsArr.length ? modelsArr : DEFAULT_AI_SETTINGS.providers[pId].models.split(',').map(m => m.trim())
            };

            
        });

        return out;
    }

    async function saveSettings(silent = false) {
        const toSave = collectCurrentSettings();
        settings.enabled = toSave.enabled;
        settings.activeProvider = toSave.activeProvider;
        settings.providers = toSave.providers;

        await chrome.storage.local.set({ fpToolsAISettings: toSave });
        updateActiveBadge();

        if (!silent) {
            if (typeof showNotification === 'function') {
                showNotification('Настройки API-токенов ИИ сохранены ✓');
            }
            if (statusMsg) {
                statusMsg.style.display = 'block';
                statusMsg.style.background = 'rgba(76,175,130,0.12)';
                statusMsg.style.color = '#4caf82';
                statusMsg.style.border = '1px solid rgba(76,175,130,0.3)';
                statusMsg.innerHTML = '✓ Настройки успешно сохранены в расширении.';
                setTimeout(() => { statusMsg.style.display = 'none'; }, 3000);
            }
        }
    }

    // Event: Сброс цепочки моделей к рекомендованным
    container.querySelectorAll('.fp-ai-reset-models-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            const pId = btn.dataset.provider;
            const modelsInput = document.getElementById(`fp-ai-models-${pId}`);
            if (modelsInput && RECOMMENDED_AI_MODELS[pId]) {
                modelsInput.value = RECOMMENDED_AI_MODELS[pId];
                saveSettings(true);
                if (typeof showNotification === 'function') {
                    showNotification(`Модели ${PROVIDER_NAMES[pId] || pId} сброшены к рекомендованным ✓`);
                }
            }
        });
    });

    // Save button click
    saveBtn?.addEventListener('click', () => saveSettings(false));

    // Test button click
    testBtn?.addEventListener('click', async () => {
        const curSettings = collectCurrentSettings();
        const activeId = curSettings.activeProvider;
        const activeCfg = curSettings.providers[activeId];

        if (!activeCfg?.apiKey) {
            if (statusMsg) {
                statusMsg.style.display = 'block';
                statusMsg.style.background = 'rgba(239,68,68,0.12)';
                statusMsg.style.color = '#f87171';
                statusMsg.style.border = '1px solid rgba(239,68,68,0.3)';
                statusMsg.innerHTML = '⚠️ Пожалуйста, укажите API-ключ перед проверкой.';
            }
            return;
        }

        const origText = testBtn.innerHTML;
        testBtn.disabled = true;
        testBtn.innerHTML = '<span class="material-symbols-rounded" style="font-size:16px;animation:spin 1s linear infinite;">sync</span> Проверяем...';

        if (statusMsg) {
            statusMsg.style.display = 'block';
            statusMsg.style.background = 'rgba(157,114,255,0.08)';
            statusMsg.style.color = '#bca0ff';
            statusMsg.style.border = '1px solid rgba(157,114,255,0.2)';
            statusMsg.innerHTML = `⏳ Отправка тестового запроса к <strong>${PROVIDER_NAMES[activeId]}</strong> (проверка каскада моделей)...`;
        }

        try {
            const resp = await chrome.runtime.sendMessage({
                action: 'testAIProviderKey',
                providerId: activeId,
                config: activeCfg
            });

            if (resp && resp.success) {
                statusMsg.style.background = 'rgba(76,175,130,0.14)';
                statusMsg.style.color = '#4caf82';
                statusMsg.style.border = '1px solid rgba(76,175,130,0.35)';
                statusMsg.innerHTML = `
                    <div style="font-weight:600;margin-bottom:2px;">✅ Ключ успешно подтверждён!</div>
                    <div>Модель <strong>${resp.model}</strong> успешно ответила: «${resp.reply}»</div>
                    <div style="font-size:11px;opacity:0.85;margin-top:2px;">⏱ Задержка (пинг): <strong>${resp.latencyMs} мс</strong> • Каскадный резерв активен и готов к работе.</div>
                `;
                // Also auto-save verified settings
                await saveSettings(true);
            } else {
                statusMsg.style.background = 'rgba(239,68,68,0.14)';
                statusMsg.style.color = '#f87171';
                statusMsg.style.border = '1px solid rgba(239,68,68,0.35)';
                const errText = resp?.error || 'Неизвестная ошибка при запросе к ИИ.';
                statusMsg.innerHTML = `
                    <div style="font-weight:600;margin-bottom:2px;">❌ Ошибка проверки ключа:</div>
                    <div style="white-space:pre-wrap;font-family:monospace;font-size:11px;margin-top:4px;">${errText}</div>
                    <div style="font-size:11px;opacity:0.85;margin-top:4px;">Убедитесь, что токен скопирован без лишних пробелов и на аккаунте нет блокировок.</div>
                `;
            }
        } catch (e) {
            statusMsg.style.background = 'rgba(239,68,68,0.14)';
            statusMsg.style.color = '#f87171';
            statusMsg.style.border = '1px solid rgba(239,68,68,0.35)';
            statusMsg.innerHTML = `❌ Ошибка связи с фоновым процессом: ${e.message}`;
        } finally {
            testBtn.disabled = false;
            testBtn.innerHTML = origText;
        }
    });
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

    // 3.1: Инициализация блока пользовательских API-токенов ИИ
    initializeAITokensSettings();
}

window.initializeSettingsIO = initializeSettingsIO;
