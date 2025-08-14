// content/features/currency_calculator.js

const API_BASE_URL = 'https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/';
let currencyRatesCache = {}; // Простой кэш в памяти на время сессии

// Функция для получения и кэширования списка валют
async function getCurrencyList() {
    if (currencyRatesCache.list) {
        return currencyRatesCache.list;
    }
    try {
        const response = await fetch(`${API_BASE_URL.slice(0, -1)}.min.json`);
        if (!response.ok) throw new Error('Network response was not ok');
        const data = await response.json();
        currencyRatesCache.list = data;
        return data;
    } catch (error) {
        console.error('FP Tools: Failed to fetch currency list:', error);
        return null;
    }
}

// Функция для получения курсов для базовой валюты
async function getRates(baseCurrency) {
    baseCurrency = baseCurrency.toLowerCase();
    if (currencyRatesCache[baseCurrency]) {
        return currencyRatesCache[baseCurrency];
    }
    try {
        const response = await fetch(`${API_BASE_URL}${baseCurrency}.min.json`);
        if (!response.ok) throw new Error(`Could not fetch rates for ${baseCurrency}`);
        const data = await response.json();
        currencyRatesCache[baseCurrency] = data[baseCurrency];
        return data[baseCurrency];
    } catch (error) {
        console.error(`FP Tools: Failed to fetch rates for ${baseCurrency}:`, error);
        return null;
    }
}

// Функция для обновления расчета
async function updateCurrencyConversion() {
    const amountFromInput = document.getElementById('currencyAmountFrom');
    const amountToInput = document.getElementById('currencyAmountTo');
    const selectFrom = document.getElementById('currencySelectFrom');
    const selectTo = document.getElementById('currencySelectTo');
    const rateDisplay = document.getElementById('currencyRateDisplay');
    const errorDisplay = document.getElementById('currency-error-display');

    errorDisplay.textContent = '';
    rateDisplay.textContent = 'Загрузка курса...';

    const fromCurrency = selectFrom.value;
    const toCurrency = selectTo.value;
    const amount = parseFloat(amountFromInput.value);

    if (isNaN(amount)) {
        amountToInput.value = '';
        rateDisplay.textContent = '-';
        return;
    }

    const rates = await getRates(fromCurrency);

    if (!rates) {
        errorDisplay.textContent = `Не удалось загрузить курсы для ${fromCurrency}. Попробуйте позже.`;
        rateDisplay.textContent = '-';
        amountToInput.value = 'Ошибка';
        return;
    }

    const rate = rates[toCurrency.toLowerCase()];
    if (!rate) {
        errorDisplay.textContent = `Курс для пары ${fromCurrency}/${toCurrency} не найден.`;
        rateDisplay.textContent = '-';
        amountToInput.value = 'Ошибка';
        return;
    }

    const result = amount * rate;
    amountToInput.value = result.toFixed(2);
    rateDisplay.textContent = `1 ${fromCurrency} ≈ ${rate.toFixed(4)} ${toCurrency}`;
}

// Функция для заполнения выпадающих списков валютами
async function populateCurrencies() {
    const selectFrom = document.getElementById('currencySelectFrom');
    const selectTo = document.getElementById('currencySelectTo');
    if (!selectFrom || !selectTo || selectFrom.options.length > 0) return;

    const currencyList = await getCurrencyList();
    if (!currencyList) {
        document.getElementById('currency-error-display').textContent = 'Не удалось загрузить список валют.';
        return;
    }

    // Приоритетные валюты
    const priority = ['RUB', 'UAH', 'USD', 'EUR', 'KZT', 'BYN'];
    
    const sortedCurrencies = Object.entries(currencyList).sort(([, a], [, b]) => a.localeCompare(b));

    const createOption = (code, name) => `<option value="${code.toUpperCase()}">${code.toUpperCase()} - ${name}</option>`;

    let optionsHTML = '';
    
    priority.forEach(code => {
        const upperCode = code.toUpperCase();
        const name = currencyList[code.toLowerCase()];
        if (name) {
            optionsHTML += createOption(upperCode, name);
        }
    });

    optionsHTML += '<option disabled>──────────</option>';

    sortedCurrencies.forEach(([code, name]) => {
        if (!priority.includes(code.toUpperCase())) {
            optionsHTML += createOption(code, name);
        }
    });

    selectFrom.innerHTML = optionsHTML;
    selectTo.innerHTML = optionsHTML;

    // Установка значений по умолчанию
    selectFrom.value = 'USD';
    selectTo.value = 'RUB';

    updateCurrencyConversion();
}

// Основная функция инициализации
function initializeCurrencyCalculator() {
    const page = document.querySelector('.fp-tools-page-content[data-page="currency_calc"]');
    if (!page || page.dataset.initialized) return;

    const amountFromInput = document.getElementById('currencyAmountFrom');
    const selectFrom = document.getElementById('currencySelectFrom');
    const selectTo = document.getElementById('currencySelectTo');
    const swapBtn = document.getElementById('currencySwapBtn');

    amountFromInput.addEventListener('input', updateCurrencyConversion);
    selectFrom.addEventListener('change', updateCurrencyConversion);
    selectTo.addEventListener('change', updateCurrencyConversion);

    swapBtn.addEventListener('click', () => {
        const fromVal = selectFrom.value;
        selectFrom.value = selectTo.value;
        selectTo.value = fromVal;
        updateCurrencyConversion();
    });

    populateCurrencies();
    page.dataset.initialized = 'true';
}