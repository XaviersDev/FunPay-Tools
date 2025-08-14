// content/features/review_sorter.js

function sortLotsByReviews(direction) {
    const container = document.querySelector('.tc.showcase-table');
    if (!container) return;

    // Получаем все элементы лотов для сортировки
    const lots = Array.from(container.querySelectorAll('a.tc-item'));
    if (lots.length === 0) return;

    // Создаем массив объектов с данными для сортировки
    const lotsWithData = lots.map(lot => {
        const reviewElement = lot.querySelector('.media-user-reviews .rating-mini-count');
        const reviewCount = reviewElement ? parseInt(reviewElement.textContent.replace(/\s/g, ''), 10) || 0 : 0;
        return { element: lot, reviews: reviewCount };
    });

    // Сортируем массив
    lotsWithData.sort((a, b) => {
        return direction === 'desc' ? b.reviews - a.reviews : a.reviews - b.reviews;
    });

    // Используем DocumentFragment для быстрой и эффективной вставки в DOM
    const fragment = document.createDocumentFragment();
    lotsWithData.forEach(item => {
        fragment.appendChild(item.element);
    });
    
    // Добавляем отсортированные элементы обратно в контейнер.
    // Так как элементы уже существуют в DOM, appendChild их переместит, а не скопирует.
    // Это одна быстрая операция вместо тысяч, что и решает проблему зависания.
    container.appendChild(fragment);
}


function initializeReviewSorter() {
    // Проверяем, что мы на странице со списком лотов
    if (!window.location.pathname.includes('/lots/')) {
        return;
    }

    const headerContainer = document.querySelector('.tc-header');
    if (!headerContainer) return;

    const sellerHeader = headerContainer.querySelector('.tc-user');
    // Если заголовка нет или он уже сделан сортируемым, выходим
    if (!sellerHeader || sellerHeader.classList.contains('sort')) {
        return;
    }

    // Делаем заголовок "Продавец" похожим на "Цена"
    sellerHeader.classList.add('sort');
    sellerHeader.style.cursor = 'pointer';
    sellerHeader.dataset.sortField = 'reviews';
    sellerHeader.innerHTML += ' <i class="fa"></i>';

    // Добавляем обработчик клика
    sellerHeader.addEventListener('click', () => {
        const allHeaders = headerContainer.querySelectorAll('.sort');
        const currentDirection = sellerHeader.dataset.sortDir;
        const newDirection = (currentDirection === 'desc') ? 'asc' : 'desc';

        // Сбрасываем стили и состояние у всех заголовков
        allHeaders.forEach(header => {
            if (header !== sellerHeader) {
                header.classList.remove('ascending', 'descending');
                delete header.dataset.sortDir;
            }
        });

        // Устанавливаем новые стили и состояние для нашего заголовка
        sellerHeader.classList.remove('ascending', 'descending');
        sellerHeader.classList.add(newDirection === 'asc' ? 'ascending' : 'descending');
        sellerHeader.dataset.sortDir = newDirection;

        // Визуальная обратная связь на время сортировки
        const container = document.querySelector('.tc.showcase-table');
        if (container) {
            container.style.transition = 'opacity 0.2s ease-in-out';
            container.style.opacity = '0.5';
        }

        // Сортируем с небольшой задержкой, чтобы браузер успел отрисовать изменения
        setTimeout(() => {
            sortLotsByReviews(newDirection);
            if (container) {
                container.style.opacity = '1';
            }
        }, 50);
    });
}