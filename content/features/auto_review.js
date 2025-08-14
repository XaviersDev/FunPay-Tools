// content/features/auto_review.js

/**
 * Инициализирует все обработчики для UI авто-ответов на отзывы.
 */
function initializeAutoReviewUI() {
    const page = document.querySelector('.fp-tools-page-content[data-page="auto_review"]');
    if (!page || page.dataset.initialized) return;

    const modeRadios = document.querySelectorAll('input[name="autoReviewMode"]');
    const allSettingsBlocks = document.querySelectorAll('.review-settings-block');

    // Функция для переключения видимости блоков настроек в зависимости от выбранного режима
    const toggleModeBlocks = () => {
        const selectedMode = document.querySelector('input[name="autoReviewMode"]:checked').value;
        allSettingsBlocks.forEach(block => {
            block.style.display = block.dataset.mode === selectedMode ? 'block' : 'none';
        });
    };
    
    // Функция для добавления поля для случайного ответа
    const addRandomReplyInput = (listContainer, text = '') => {
        const item = createElement('div', { class: 'random-reply-item' });
        const textarea = createElement('textarea', { class: 'template-input', placeholder: 'Вариант ответа...' });
        textarea.value = text;
        const deleteBtn = createElement('button', { class: 'btn btn-default delete-random-reply' }, {}, '×');

        deleteBtn.addEventListener('click', () => item.remove());
        item.append(textarea, deleteBtn);
        listContainer.appendChild(item);
    };

    // --- ОБРАБОТЧИКИ ---
    modeRadios.forEach(radio => radio.addEventListener('change', toggleModeBlocks));

    document.querySelectorAll('.add-random-reply-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const stars = btn.dataset.stars;
            const listContainer = document.querySelector(`.random-reply-list[data-stars="${stars}"]`);
            addRandomReplyInput(listContainer);
        });
    });

    if (typeof loadAutoReviewSettings === 'function') {
        loadAutoReviewSettings();
    }

    page.dataset.initialized = 'true';
}