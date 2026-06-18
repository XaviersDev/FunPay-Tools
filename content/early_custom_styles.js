// content/early_custom_styles.js
// FIX 2.8.8 (№2): кастомные стили редактора (MagicStick) применяются как можно
// РАНЬШЕ - на document_start, до отрисовки страницы. Иначе пользователь видел
// вспышку (FOUC): страница успевала прорисоваться в дефолтном виде, и лишь потом
// (на document_idle) применялись его стили. Этот лёгкий скрипт читает сохранённые
// стили из storage и вставляет <style> в documentElement ещё до построения body.
(function () {
    try {
        if (!chrome?.storage?.local) return;
        chrome.storage.local.get('fpToolsLiveStyles', (data) => {
            try {
                const savedStyles = (data && data.fpToolsLiveStyles) || {};
                if (!savedStyles || !Object.keys(savedStyles).length) return;

                let cssText = '';
                for (const selector in savedStyles) {
                    cssText += `${selector} {\n`;
                    for (const prop in savedStyles[selector]) {
                        cssText += `  ${prop}: ${savedStyles[selector][prop]} !important;\n`;
                    }
                    cssText += '}\n';
                }

                const inject = () => {
                    let styleEl = document.getElementById('fp-tools-magic-stick-persistent-styles');
                    if (!styleEl) {
                        styleEl = document.createElement('style');
                        styleEl.id = 'fp-tools-magic-stick-persistent-styles';
                        (document.head || document.documentElement).appendChild(styleEl);
                    }
                    styleEl.textContent = cssText;
                };

                // documentElement существует уже на document_start; head может ещё нет.
                if (document.head || document.documentElement) inject();
                else document.addEventListener('DOMContentLoaded', inject, { once: true });
            } catch (_) { /* no-op */ }
        });
    } catch (_) { /* no-op */ }
})();
