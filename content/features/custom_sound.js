// content/features/custom_sound.js

const soundMap = {
    vk: 'vk.mp3',
    tg: 'telegram.mp3',
    iphone: 'iphone.mp3',
    discord: 'discord.mp3',
    whatsapp: 'whatsapp.mp3'
};

async function applyNotificationSound() {
    const { notificationSound, notificationVolume } = await chrome.storage.local.get(['notificationSound', 'notificationVolume']);
    const selectedSound = notificationSound || 'default';
    const vol = (typeof notificationVolume === 'number') ? Math.max(0, Math.min(1, notificationVolume)) : 1;

    const audioSource = document.querySelector("source[src='/audio/chat_loud.mp3'], source[src^='chrome-extension://']");
    const audioPlayer = document.querySelector("audio.loud");

    if (!audioSource || !audioPlayer) {
        return;
    }

    // 3.0: volume control
    audioPlayer.volume = vol;

    if (selectedSound === 'default') {
        const originalSrc = 'https://funpay.com/audio/chat_loud.mp3';
        if (audioSource.src !== originalSrc) {
            audioSource.src = originalSrc;
            audioPlayer.load();
        }
    } else {
        const soundFile = soundMap[selectedSound];
        if (soundFile) {
            const newSrc = chrome.runtime.getURL(`sounds/${soundFile}`);
            if (audioSource.src !== newSrc) {
                audioSource.src = newSrc;
                audioPlayer.load();
            }
        }
    }
}

// 3.0: preview the currently-selected sound at the selected volume (used by the popup button).
async function previewNotificationSound(soundValue, volume) {
    try {
        let url;
        if (!soundValue || soundValue === 'default') url = 'https://funpay.com/audio/chat_loud.mp3';
        else if (soundMap[soundValue]) url = chrome.runtime.getURL(`sounds/${soundMap[soundValue]}`);
        else return;
        const a = new Audio(url);
        a.volume = (typeof volume === 'number') ? Math.max(0, Math.min(1, volume)) : 1;
        await a.play().catch(() => {});
    } catch (_) {}
}

function initializeCustomSound() {
    // Первоначальное применение звука
    applyNotificationSound();

    // Наблюдатель на случай, если FunPay динамически пересоздаст плеер
    const observer = new MutationObserver((mutations) => {
        for (let mutation of mutations) {
            if (mutation.addedNodes) {
                for (let node of mutation.addedNodes) {
                    if (node.nodeType === 1 && (node.matches("audio.loud") || node.querySelector("audio.loud"))) {
                        applyNotificationSound();
                        return;
                    }
                }
            }
        }
    });

    observer.observe(document.body, { childList: true, subtree: true });
}

// 3.0: re-apply sound/volume immediately when changed in the popup (no reload).
if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.onChanged) {
    chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== 'local') return;
        if (changes.notificationSound || changes.notificationVolume) {
            if (typeof applyNotificationSound === 'function') applyNotificationSound();
        }
    });
}