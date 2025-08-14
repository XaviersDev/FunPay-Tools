// content/features/notes.js

let notesDebounceTimer;

/**
 * Инициализирует функциональность блокнота для заметок.
 */
function initializeNotes() {
    const notesArea = document.getElementById('fpToolsNotesArea');
    if (!notesArea || notesArea.dataset.initialized) return;

    // Загружаем существующие заметки при открытии
    chrome.storage.local.get('fpToolsUserNotes', ({ fpToolsUserNotes }) => {
        if (fpToolsUserNotes) {
            notesArea.value = fpToolsUserNotes;
        }
    });

    // Сохраняем заметки при вводе с небольшой задержкой, чтобы не нагружать систему
    notesArea.addEventListener('input', () => {
        clearTimeout(notesDebounceTimer);
        notesDebounceTimer = setTimeout(() => {
            chrome.storage.local.set({ fpToolsUserNotes: notesArea.value })
                .then(() => console.log("FP Tools: Notes saved."))
                .catch(err => console.error("FP Tools: Error saving notes:", err));
        }, 500); // Сохраняем через 500 мс после прекращения ввода
    });

    notesArea.dataset.initialized = 'true';
}