// content/features/exact_price.js

function initializeExactPrice() {
    // Убедимся, что мы на странице редактирования или создания лота
    const header = document.querySelector('h1.page-header');
    if (!header || !(header.textContent.includes('Редактирование предложения') || header.textContent.includes('Новое предложение'))) {
        return;
    }

    // Проверяем, не была ли кнопка добавлена ранее
    if (document.querySelector('.set-exact-price')) {
        return;
    }

    const inputPrice = document.querySelector('input[name="price"]');
    if (!inputPrice) {
        return;
    }

    const exactPriceButton = createElement('div', { class: 'set-exact-price' }, {}, 'Рассчитать, чтобы получить эту сумму');
    inputPrice.parentNode.insertBefore(exactPriceButton, inputPrice.nextSibling);

    exactPriceButton.addEventListener("click", () => {
        const desiredAmount = parseFloat(inputPrice.value); // Сумма, которую хотим получить
        if (isNaN(desiredAmount) || desiredAmount <= 0) {
            showNotification('Введите в поле сумму, которую хотите получить.', true);
            return;
        }

        // --- ЭТАП 1: Получаем актуальный коэффициент комиссии ---
        
        // Для расчета нам нужна любая "тестовая" цена. Используем текущее значение в поле.
        const testPrice = parseFloat(inputPrice.value);
        if (isNaN(testPrice)) {
             showNotification('Для расчета нужна любая цена в поле ввода (например, 100).', true);
             return;
        }

        // Находим таблицу с ценами для покупателей
        const calcTableBody = document.querySelector(".js-calc-table-body");
        if (!calcTableBody) {
            showNotification('Не найдена таблица с расчетами FunPay. Измените цену, чтобы она появилась.', true);
            return;
        }

        // Берем самую первую (обычно самую дорогую) цену для покупателя
        const firstBuyerPriceRow = calcTableBody.querySelector('tr td:last-child');
        if (!firstBuyerPriceRow) {
            showNotification('Не удалось найти цену для покупателя.', true);
            return;
        }
        
        const buyerPaysPrice = parseFloat(firstBuyerPriceRow.textContent.replace(/ /g, ''));
        if (isNaN(buyerPaysPrice)) {
            showNotification('Не удалось прочитать цену для покупателя.', true);
            return;
        }

        // --- ЭТАП 2: Применяем правильную формулу ---

        // Формула основана на пропорции.
        // Если при установленной цене `testPrice` покупатель платит `buyerPaysPrice`,
        // то какую цену `X` нужно установить, чтобы покупатель заплатил `desiredAmount`?
        // Пропорция: X / desiredAmount = testPrice / buyerPaysPrice
        // Отсюда: X = (testPrice / buyerPaysPrice) * desiredAmount

        // Коэффициент, который показывает, какая часть от денег покупателя доходит до поля "Цена".
        const priceRatio = testPrice / buyerPaysPrice;
        
        if (isNaN(priceRatio) || priceRatio <= 0 || priceRatio >= 1) {
            showNotification('Ошибка расчета коэффициента. Попробуйте ввести другую цену.', true);
            return;
        }

        // Рассчитываем итоговую цену, которую нужно установить
        const finalPriceToSet = desiredAmount * priceRatio;

        // --- ЭТАП 3: Обновляем значение и уведомляем ---
        
        inputPrice.value = finalPriceToSet.toFixed(2);
        inputPrice.dispatchEvent(new Event('input', { bubbles: true }));
        showNotification(`Установлена цена ${finalPriceToSet.toFixed(2)}`, false);
    });
}