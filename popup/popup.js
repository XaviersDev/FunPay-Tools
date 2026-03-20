document.addEventListener('DOMContentLoaded', async function () {

    // ─── Version ────────────────────────────────────────────────────
    const manifest = chrome.runtime.getManifest();
    const version = manifest.version;
    const versionEl = document.getElementById('version-display');
    const footerVerEl = document.getElementById('footer-version');
    if (versionEl)   versionEl.textContent   = `v${version}`;
    if (footerVerEl) footerVerEl.textContent  = version;

    // ─── Status dot: check if FunPay tab is open + user is logged in ─
    const statusDot = document.getElementById('status-dot');
    chrome.tabs.query({ url: 'https://funpay.com/*' }, (tabs) => {
        if (tabs.length > 0) {
            statusDot.classList.add('online');
            statusDot.title = 'FunPay открыт';
        } else {
            statusDot.classList.add('offline');
            statusDot.title = 'FunPay не открыт';
        }
    });

    // ─── Quick stats ─────────────────────────────────────────────────
    chrome.storage.local.get(['fpToolsAutoReplies', 'autoBumpEnabled'], (data) => {
        const autoReplies = data.fpToolsAutoReplies || {};
        const anyAR = autoReplies.greetingEnabled
            || autoReplies.keywordsEnabled
            || autoReplies.autoReviewEnabled
            || autoReplies.bonusForReviewEnabled;

        const statsSection = document.getElementById('quickStats');
        const arEl  = document.getElementById('statAutoReply');
        const abEl  = document.getElementById('statAutoBump');

        if (statsSection) statsSection.style.display = 'flex';

        if (arEl) {
            arEl.textContent = anyAR ? 'Включены' : 'Выключены';
            arEl.className   = 'stat-value ' + (anyAR ? 'on' : 'off');
        }
        if (abEl) {
            abEl.textContent = data.autoBumpEnabled ? 'Включено' : 'Выключено';
            abEl.className   = 'stat-value ' + (data.autoBumpEnabled ? 'on' : 'off');
        }
    });

    // ─── CTA button ──────────────────────────────────────────────────
    document.getElementById('goToFunPayBtn')?.addEventListener('click', (e) => {
        e.preventDefault();
        chrome.tabs.query({ url: 'https://funpay.com/*' }, (tabs) => {
            if (tabs.length > 0) {
                chrome.tabs.update(tabs[0].id, { active: true });
                chrome.windows.update(tabs[0].windowId, { focused: true });
            } else {
                chrome.tabs.create({ url: 'https://funpay.com/' });
            }
            window.close();
        });
    });

    // ─── Telegram ────────────────────────────────────────────────────
    document.getElementById('telegramBtn')?.addEventListener('click', (e) => {
        e.preventDefault();
        chrome.tabs.create({ url: 'https://t.me/FPTools' });
        window.close();
    });

    // ─── Review ──────────────────────────────────────────────────────
    document.getElementById('reviewBtn')?.addEventListener('click', (e) => {
        e.preventDefault();
        chrome.tabs.create({ url: 'https://chromewebstore.google.com/detail/funpay-tools/pibmnjjfpojnakckilflcboodkndkibb/reviews' });
        window.close();
    });

    // ─── Changelog toggle ────────────────────────────────────────────
    const changelogPanel = document.getElementById('changelog-panel');
    document.getElementById('changelogBtn')?.addEventListener('click', (e) => {
        e.preventDefault();
        if (changelogPanel) {
            const isVisible = changelogPanel.style.display !== 'none';
            changelogPanel.style.display = isVisible ? 'none' : 'block';
        }
    });

    document.getElementById('changelog-close')?.addEventListener('click', () => {
        if (changelogPanel) changelogPanel.style.display = 'none';
    });

    // Auto-show changelog once for new version
    chrome.storage.local.get('fpToolsLastSeenVersion', ({ fpToolsLastSeenVersion }) => {
        if (fpToolsLastSeenVersion !== version) {
            if (changelogPanel) changelogPanel.style.display = 'block';
            chrome.storage.local.set({ fpToolsLastSeenVersion: version });
        }
    });
});
