// content/features/feature_disabler.js
// =============================================================================
// Применяет список отключённых форс-элементов (fpToolsDisabledFeatures):
// внедряет/обновляет <style> со скрытием их селекторов - живо, без перезагрузки.
// Раннее (document_start) скрытие делает theme_flash_fix.js, здесь - живое обновление.
// =============================================================================

const FPT_DISABLED_STYLE_ID = 'fp-tools-disabled-features';

function fptGetRegistry() {
    return (typeof FPT_FEATURE_REGISTRY !== 'undefined' && FPT_FEATURE_REGISTRY) ||
           (typeof window !== 'undefined' && window.FPT_FEATURE_REGISTRY) || [];
}

// Build/refresh the CSS that hides disabled features. Locked features are never hidden.
function fptApplyDisabledCss(disabledIds) {
    const reg = fptGetRegistry();
    const disabled = new Set(disabledIds || []);
    const selectors = [];
    reg.forEach(entry => {
        if (entry.locked) return;                 // locked = cannot be disabled
        if (!disabled.has(entry.id)) return;
        if (entry.selector) selectors.push(entry.selector);
    });
    let styleEl = document.getElementById(FPT_DISABLED_STYLE_ID);
    if (!selectors.length) {
        if (styleEl) styleEl.textContent = '';
        return;
    }
    if (!styleEl) {
        styleEl = document.createElement('style');
        styleEl.id = FPT_DISABLED_STYLE_ID;
        (document.head || document.documentElement).appendChild(styleEl);
    }
    styleEl.textContent = selectors.join(', ') + ' { display: none !important; }';
}

// Read state from storage and apply (CSS only - no settings are touched).
async function fptApplyDisabledFeatures(disabledIds) {
    let ids = disabledIds;
    if (!Array.isArray(ids)) {
        const data = await chrome.storage.local.get('fpToolsDisabledFeatures');
        ids = Array.isArray(data.fpToolsDisabledFeatures) ? data.fpToolsDisabledFeatures : [];
    }
    fptApplyDisabledCss(ids);
}

// Live updates without reload.
if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.onChanged) {
    chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== 'local' || !changes.fpToolsDisabledFeatures) return;
        const ids = Array.isArray(changes.fpToolsDisabledFeatures.newValue)
            ? changes.fpToolsDisabledFeatures.newValue : [];
        fptApplyDisabledCss(ids);
    });
}

// Apply once on load.
if (typeof window !== 'undefined') {
    window.fptApplyDisabledFeatures = fptApplyDisabledFeatures;
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => fptApplyDisabledFeatures());
    } else {
        fptApplyDisabledFeatures();
    }
}
