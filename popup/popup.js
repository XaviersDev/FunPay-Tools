document.addEventListener('DOMContentLoaded', function() {
    const telegramBtn = document.getElementById('telegramBtn');
    
    if (telegramBtn) {
        telegramBtn.addEventListener('click', function() {
            chrome.tabs.create({
                url: 'https://t.me/FPTools'
            });
            window.close();
        });
    }
});
