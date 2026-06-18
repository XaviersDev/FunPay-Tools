// content/features/exact_price.js

function initializeExactPrice() {
    // Убедимся, что мы на странице редактирования или создания лота
    const header = document.querySelector('h1.page-header');
    if (!header || !(header.textContent.includes('Редактирование предложения') || header.textContent.includes('Добавление предложения'))) {
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

    // Читает «сколько заплатит покупатель» из живой таблицы расчёта FunPay.
    // ВАЖНО: поле цены продавца — в рублях, поэтому берём ТОЛЬКО рублёвые строки (₽),
    // иначе Math.min цепляет $/€ (их числа мельче) и считает в чужой валюте.
    // Среди рублёвых берём минимум — самый дешёвый для покупателя способ (напр. СБП).
    const readBuyerPriceRub = () => {
        const body = document.querySelector('.js-calc-table-body');
        if (!body) return null;
        const vals = [];
        body.querySelectorAll('tr').forEach(tr => {
            const cell = tr.querySelector('td:last-child');
            if (!cell) return;
            const txt = cell.textContent;
            // только рубли: символ ₽ или слово руб
            if (!/[₽]|руб/i.test(txt)) return;
            const n = parseFloat(txt.replace(/[^\d.,]/g, '').replace(/\s/g, '').replace(',', '.'));
            if (!isNaN(n) && n > 0) vals.push(n);
        });
        if (!vals.length) return null;
        return Math.min(...vals);
    };

    const setPrice = (v) => {
        inputPrice.value = (Math.round(v * 100) / 100).toString();
        inputPrice.dispatchEvent(new Event('input', { bubbles: true }));
        inputPrice.dispatchEvent(new Event('keyup', { bubbles: true }));
    };

    // Ждёт пересчёта таблицы FunPay (нужно только если таблицы ещё нет / поле было пустым).
    const waitRecalc = (prevBuyer) => new Promise(resolve => {
        let tries = 0;
        const tick = () => {
            const b = readBuyerPriceRub();
            if ((b !== null && b !== prevBuyer) || tries > 25) { resolve(b); return; }
            tries++;
            setTimeout(tick, 40);
        };
        tick();
    });

    exactPriceButton.addEventListener('click', async () => {
        const desiredAmount = parseFloat((inputPrice.value || '').replace(',', '.')); // хотим получить (в рублях покупателя)
        if (isNaN(desiredAmount) || desiredAmount <= 0) {
            showNotification('Введите в поле сумму, которую хотите получить.', true);
            return;
        }

        exactPriceButton.textContent = 'Считаю…';
        try {
            // Комиссия FunPay линейна: buyerPrice = sellerPrice × k, где k — фиксированный
            // множитель метода. Достаточно узнать k ОДИН раз и поделить — почти мгновенно.
            //
            // ВАЖНО: таблица могла быть посчитана для ДРУГОГО значения, чем сейчас в поле.
            // Поэтому сначала ставим в поле desiredAmount как пробную цену продавца и ОДИН раз
            // ждём пересчёт — тогда таблица гарантированно соответствует полю и k будет точным.
            const prevBuyer = readBuyerPriceRub();
            setPrice(desiredAmount);
            let buyerForProbe = await waitRecalc(prevBuyer);
            const sellerProbe = desiredAmount;

            if (buyerForProbe === null || buyerForProbe <= 0) {
                showNotification('Не найдена рублёвая строка в таблице расчёта. Впишите цену, дождитесь таблицы и повторите.', true);
                exactPriceButton.textContent = 'Рассчитать, чтобы получить эту сумму';
                return;
            }

            const k = buyerForProbe / sellerProbe;   // множитель метода (например 1.0183 для СБП)
            if (!isFinite(k) || k <= 0) {
                showNotification('Не удалось определить комиссию. Повторите.', true);
                exactPriceButton.textContent = 'Рассчитать, чтобы получить эту сумму';
                return;
            }

            // Один расчёт — мгновенно.
            const sellerPrice = desiredAmount / k;
            setPrice(sellerPrice);

            // Разовая корректировка округления копеек (без цикла, один быстрый пересчёт).
            const buyerNow = await waitRecalc(buyerForProbe);
            if (buyerNow && Math.abs(buyerNow - desiredAmount) > 0.02) {
                const k2 = buyerNow / sellerPrice;
                if (isFinite(k2) && k2 > 0) setPrice(desiredAmount / k2);
            }

            const finalSeller = parseFloat(inputPrice.value);
            showNotification(`Цена продавца: ${finalSeller} ₽ — покупатель заплатит ≈ ${desiredAmount} ₽ (по самому дешёвому способу)`, false);
        } catch (e) {
            showNotification('Ошибка расчёта: ' + e.message, true);
        } finally {
            exactPriceButton.textContent = 'Рассчитать, чтобы получить эту сумму';
        }
    });
}