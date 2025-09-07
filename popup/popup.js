document.addEventListener('DOMContentLoaded', function() {
    
    // --- ИЗМЕНЕНИЕ: Динамически устанавливаем номер версии ---
    const versionDisplay = document.getElementById('version-display');
    if (versionDisplay) {
        const manifestData = chrome.runtime.getManifest();
        versionDisplay.textContent = `v${manifestData.version}`;
    }

    // Функция для кнопки "Перейти на FunPay"
    const goToFunPayBtn = document.getElementById('goToFunPayBtn');
    if (goToFunPayBtn) {
        goToFunPayBtn.addEventListener('click', function(e) {
            e.preventDefault();
            
            // Ищем уже открытую вкладку FunPay
            chrome.tabs.query({ url: "https://funpay.com/*" }, function(tabs) {
                if (tabs.length > 0) {
                    // Если нашли, активируем ее
                    const funpayTab = tabs[0];
                    chrome.tabs.update(funpayTab.id, { active: true });
                    chrome.windows.update(funpayTab.windowId, { focused: true });
                } else {
                    // Если не нашли, создаем новую
                    chrome.tabs.create({ url: "https://funpay.com/" });
                }
                window.close(); // Закрываем попап
            });
        });
    }

    // Функция для кнопки Telegram
    const telegramBtn = document.getElementById('telegramBtn');
    if (telegramBtn) {
        telegramBtn.addEventListener('click', function(e) {
            e.preventDefault();
            chrome.tabs.create({ url: 'https://t.me/FPTools' });
            window.close();
        });
    }

    // Функция для кнопки "Оценить"
    const reviewBtn = document.getElementById('reviewBtn');
    if (reviewBtn) {
        reviewBtn.addEventListener('click', function(e) {
            e.preventDefault();
            chrome.tabs.create({ url: 'https://chromewebstore.google.com/detail/funpay-tools/pibmnjjfpojnakckilflcboodkndkibb/reviews' });
            window.close();
        });
    }
});