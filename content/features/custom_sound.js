// content/features/custom_sound.js

const soundMap = {
    vk: 'vk.mp3',
    tg: 'telegram.mp3',
    iphone: 'iphone.mp3',
    discord: 'discord.mp3',
    whatsapp: 'whatsapp.mp3'
};

async function applyNotificationSound() {
    const { notificationSound, notificationVolume, fpToolsCustomSoundData } = await chrome.storage.local.get(['notificationSound', 'notificationVolume', 'fpToolsCustomSoundData']);
    const selectedSound = notificationSound || 'default';
    const vol = (typeof notificationVolume === 'number') ? Math.max(0, Math.min(1, notificationVolume)) : 1;

    const audioSource = document.querySelector("source[src='/audio/chat_loud.mp3'], source[src^='chrome-extension://'], source[src^='data:audio'], source[src^='blob:']");
    const audioPlayer = document.querySelector("audio.loud");

    if (!audioSource || !audioPlayer) {
        return;
    }

    // 3.0: volume control
    audioPlayer.volume = vol;

    // FIX 2.8.2 (№6): раньше подменялся только дочерний <source>. Но FunPay часто
    // проигрывает звук, выставляя audioPlayer.src НАПРЯМУЮ или уже забуферив
    // оригинал - тогда наш <source> игнорировался и звук оставался «фпшным».
    // Теперь: (1) вычисляем нужный src, (2) ставим его И на <source>, И на сам
    // audioPlayer, (3) перехватываем play(), чтобы перед каждым воспроизведением
    // принудительно ставить наш src и громкость (FunPay не сможет «вернуть своё»).
    const setSrc = (newSrc) => {
        if (!newSrc) return;
        if (audioSource.src !== newSrc) audioSource.src = newSrc;
        if (audioPlayer.src !== newSrc) {
            audioPlayer.src = newSrc;
            audioPlayer.load();
        }
    };

    // запоминаем выбранный src на самом элементе, чтобы перехватчик play() знал что ставить
    let chosenSrc = null;

    if (selectedSound === 'default') {
        chosenSrc = 'https://funpay.com/audio/chat_loud.mp3';
        setSrc(chosenSrc);
    } else if (selectedSound === 'custom') {
        // Своя загруженная мелодия (обрезанный отрезок). Преобразуем data URL в
        // blob: URL - он не попадает под ограничения CSP на data:-медиа.
        if (fpToolsCustomSoundData) {
            try {
                if (!window.__fptCustomSoundBlobUrl || window.__fptCustomSoundBlobSrc !== fpToolsCustomSoundData) {
                    const resp = await fetch(fpToolsCustomSoundData);
                    const blob = await resp.blob();
                    if (window.__fptCustomSoundBlobUrl) { try { URL.revokeObjectURL(window.__fptCustomSoundBlobUrl); } catch (_) {} }
                    window.__fptCustomSoundBlobUrl = URL.createObjectURL(blob);
                    window.__fptCustomSoundBlobSrc = fpToolsCustomSoundData;
                }
                chosenSrc = window.__fptCustomSoundBlobUrl;
                setSrc(chosenSrc);
            } catch (_) {
                // если blob не удался - пробуем напрямую data URL
                chosenSrc = fpToolsCustomSoundData;
                setSrc(chosenSrc);
            }
        } else {
            chosenSrc = 'https://funpay.com/audio/chat_loud.mp3';
            setSrc(chosenSrc);
        }
    } else {
        const soundFile = soundMap[selectedSound];
        if (soundFile) {
            chosenSrc = chrome.runtime.getURL(`sounds/${soundFile}`);
            setSrc(chosenSrc);
        }
    }

    // FIX 2.8.2 (№6): перехват play() - гарантирует наш src/громкость при каждом
    // воспроизведении, даже если FunPay переустановил источник между уведомлениями.
    if (chosenSrc && !audioPlayer.__fptPlayPatched) {
        audioPlayer.__fptPlayPatched = true;
        const origPlay = audioPlayer.play.bind(audioPlayer);
        audioPlayer.play = function () {
            try {
                const want = audioPlayer.__fptChosenSrc;
                if (want && audioPlayer.src !== want) { audioPlayer.src = want; audioPlayer.load(); }
                if (typeof audioPlayer.__fptVol === 'number') audioPlayer.volume = audioPlayer.__fptVol;
            } catch (_) {}
            return origPlay();
        };
    }
    audioPlayer.__fptChosenSrc = chosenSrc;
    audioPlayer.__fptVol = vol;
}

// 3.0: preview the currently-selected sound at the selected volume (used by the popup button).
async function previewNotificationSound(soundValue, volume) {
    try {
        let url;
        if (!soundValue || soundValue === 'default') url = 'https://funpay.com/audio/chat_loud.mp3';
        else if (soundValue === 'custom') {
            const { fpToolsCustomSoundData } = await chrome.storage.local.get('fpToolsCustomSoundData');
            if (!fpToolsCustomSoundData) { if (typeof showNotification === 'function') showNotification('Своя мелодия ещё не сохранена.', true); return; }
            url = fpToolsCustomSoundData;
        }
        else if (soundMap[soundValue]) url = chrome.runtime.getURL(`sounds/${soundMap[soundValue]}`);
        else return;
        const a = new Audio(url);
        a.volume = (typeof volume === 'number') ? Math.max(0, Math.min(1, volume)) : 1;
        await a.play().catch(() => {});
    } catch (_) {}
}

function initializeCustomSound() {
    // защита от повторной инициализации (раньше вызывалось только при сборке
    // попапа настроек — из-за чего звук не подменялся, пока пользователь не открыл
    // настройки на этой вкладке; теперь модуль ещё и сам стартует ниже)
    if (window.__fptSoundInited) { applyNotificationSound(); return; }
    window.__fptSoundInited = true;

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

// FIX 3.0: звук НЕ должен зависеть от того, открыл ли пользователь попап настроек.
// Раньше initializeCustomSound() вызывался только при ленивой сборке попапа, и
// если вкладку с настройками не открывали — кастомный звук не подменялся.
// Теперь модуль самоинициализируется на КАЖДОЙ странице funpay сразу при загрузке.
(function autoInitCustomSound() {
    if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.id) return;
    const boot = () => { try { initializeCustomSound(); } catch (_) {} };
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot, { once: true });
    } else {
        boot();
    }
})();

// 3.0: re-apply sound/volume immediately when changed in the popup (no reload).
if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.onChanged) {
    chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== 'local') return;
        if (changes.notificationSound || changes.notificationVolume || changes.fpToolsCustomSoundData) {
            if (typeof applyNotificationSound === 'function') applyNotificationSound();
        }
    });
}