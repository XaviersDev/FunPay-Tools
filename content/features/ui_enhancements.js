// content/features/ui_enhancements.js

function getStatsBlockHTML() {
    return `
    <div class="fp-tools-stats-container">
        <div class="fp-stats-header">
            <h1>Статистика продаж</h1>
            <div class="fp-stats-controls">
                <button type="button" class="btn btn-default" id="fpTools-stats-reset">Обновить</button>
                <select class="form-control" id="fpTools-stats-period">
                    <option value="today">За сегодня</option>
                    <option value="yesterday">За вчера</option>
                    <option value="24h">За 24 часа</option>
                    <option value="7d">За неделю</option>
                    <option value="30d">За месяц</option>
                    <option value="365d">За год</option>
                    <option value="all">Всё время</option>
                </select>
            </div>
        </div>

        <div class="fp-stats-grid">
            <div class="fp-stat-card stat-card-large stat-card-revenue">
                <div class="stat-card-icon">💰</div>
                <div class="stat-card-content">
                    <div class="stat-card-label">Всего заработано</div>
                    <div class="stat-card-value" id="fpTools-stats-total-revenue">0 ₽</div>
                </div>
            </div>
            <div class="fp-stat-card">
                <div class="stat-card-icon">📦</div>
                <div class="stat-card-content">
                    <div class="stat-card-label">Всего заказов</div>
                    <div class="stat-card-value" id="fpTools-stats-total-orders">0</div>
                </div>
            </div>
            <div class="fp-stat-card">
                <div class="stat-card-icon">📈</div>
                <div class="stat-card-content">
                    <div class="stat-card-label">Средний чек</div>
                    <div class="stat-card-value" id="fpTools-stats-average-sale-price">0 ₽</div>
                </div>
            </div>
            <div class="fp-stat-card stat-card-success">
                <div class="stat-card-icon">✅</div>
                <div class="stat-card-content">
                    <div class="stat-card-label">Закрыто</div>
                    <div class="stat-card-value" id="fpTools-stats-orders-closed">0</div>
                </div>
            </div>
            <div class="fp-stat-card stat-card-pending">
                <div class="stat-card-icon">⏳</div>
                <div class="stat-card-content">
                    <div class="stat-card-label">В ожидании</div>
                    <div class="stat-card-value" id="fpTools-stats-orders-pending">0</div>
                </div>
            </div>
            <div class="fp-stat-card stat-card-refund">
                <div class="stat-card-icon">↩️</div>
                <div class="stat-card-content">
                    <div class="stat-card-label">Возвратов</div>
                    <div class="stat-card-value" id="fpTools-stats-orders-refund">0</div>
                </div>
            </div>
            <div class="fp-stat-card">
                <div class="stat-card-icon">👥</div>
                <div class="stat-card-content">
                    <div class="stat-card-label">Уникальных покупателей</div>
                    <div class="stat-card-value" id="fpTools-stats-unique-customers">0</div>
                </div>
            </div>
        </div>

        <div class="fp-stats-details">
            <div class="fp-stat-detail-item">
                <span class="detail-label">🏆 Самый активный покупатель:</span>
                <span class="detail-value" id="fpTools-stats-top-customer">-</span>
            </div>
            <div class="fp-stat-detail-item">
                <span class="detail-label">💎 Самая дорогая продажа:</span>
                <span class="detail-value" id="fpTools-stats-top-sale">-</span>
            </div>
            <div class="fp-stat-detail-item">
                <span class="detail-label">🔥 Самый популярный товар:</span>
                <span class="detail-value" id="fpTools-stats-popular-product">-</span>
            </div>
            <div class="fp-stat-detail-item">
                <span class="detail-label">🎮 Самая популярная категория:</span>
                <span class="detail-value" id="fpTools-stats-popular-category">-</span>
            </div>
        </div>
    </div>
    `;
}

async function calculateSalesStats(allOrders, startDate, endDate) {
    const stats = {
        totalOrders: 0, totalClosed: 0, totalPending: 0, totalRefunded: 0,
        totalRevenue: { RUB: 0, USD: 0, EUR: 0 },
        averageCheck: { RUB: 0, USD: 0, EUR: 0 },
        uniqueBuyers: new Set(), mostPopularProduct: "", mostPopularCategory: "",
        mostActiveBuyer: { username: "", id: 0, count: 0 },
        mostExpensiveSale: { price: 0, currency: "RUB", orderId: "" }
    };
    const productCount = new Map(), categoryCount = new Map(), buyerCount = new Map();
    const validCurrencies = new Set(["RUB", "USD", "EUR"]);
    const exchangeRates = { RUB: 0.011, USD: 1, EUR: 1.08 };

    for (const orderId in allOrders) {
        const order = allOrders[orderId];
        if ((startDate && order.orderDate < startDate) || (endDate && order.orderDate > endDate)) continue;

        stats.totalOrders++;
        stats.uniqueBuyers.add(order.buyerId);
        
        if (validCurrencies.has(order.currency) && (order.orderStatus === "paid" || order.orderStatus === "closed")) {
            stats.totalRevenue[order.currency] += order.price;
        }

        productCount.set(order.description, (productCount.get(order.description) || 0) + 1);
        categoryCount.set(order.subcategoryName, (categoryCount.get(order.subcategoryName) || 0) + 1);
        
        const buyerKey = `${order.buyerUsername}|${order.buyerId}`;
        buyerCount.set(buyerKey, (buyerCount.get(buyerKey) || 0) + 1);

        if (order.orderStatus === "paid") stats.totalPending++;
        else if (order.orderStatus === "closed") stats.totalClosed++;
        else if (order.orderStatus === "refunded") stats.totalRefunded++;
        
        if (validCurrencies.has(order.currency) && (order.orderStatus === "paid" || order.orderStatus === "closed")) {
             const saleValueUSD = order.price * (exchangeRates[order.currency] || 0);
             const topSaleValueUSD = stats.mostExpensiveSale.price * (exchangeRates[stats.mostExpensiveSale.currency] || 0);
             if(saleValueUSD > topSaleValueUSD) {
                 stats.mostExpensiveSale = { price: order.price, currency: order.currency, orderId: order.orderId };
             }
        }
    }
    
    const paidAndClosedCount = stats.totalClosed + stats.totalPending;
    if(paidAndClosedCount > 0) {
        for(const currency of validCurrencies) stats.averageCheck[currency] = stats.totalRevenue[currency] / paidAndClosedCount;
    }

    stats.uniqueBuyers = stats.uniqueBuyers.size;
    stats.mostPopularProduct = [...productCount.entries()].reduce((a, b) => b[1] > a[1] ? b : a, ["-", 0])[0] || "-";
    stats.mostPopularCategory = [...categoryCount.entries()].reduce((a, b) => b[1] > a[1] ? b : a, ["-", 0])[0] || "-";
    
    const topBuyer = [...buyerCount.entries()].reduce((a, b) => b[1] > a[1] ? b : a, ["-", 0]);
    if (topBuyer[1] > 0) {
        const [username, id] = topBuyer[0].split('|');
        stats.mostActiveBuyer = { username, id: Number(id), count: topBuyer[1] };
    }
    return stats;
}

function formatCurrency(value, currency) {
    if (!value || value === 0) return "";
    const symbolMap = { "RUB": "₽", "USD": "$", "EUR": "€" };
    const roundedValue = Math.round(value * 100) / 100;
    return `${roundedValue} ${symbolMap[currency] || currency}`;
}

function formatRevenue(revenue) {
    const parts = [formatCurrency(revenue.RUB, 'RUB'), formatCurrency(revenue.USD, 'USD'), formatCurrency(revenue.EUR, 'EUR')].filter(Boolean);
    return parts.length ? parts.join(' <span class="balances-delimiter">·</span> ') : "0 ₽ · 0 $ · 0 €";
}

async function displaySalesStats() {
    if (!document.getElementById("fpTools-stats-period")) return;
    
    const { fpToolsSalesData } = await chrome.storage.local.get('fpToolsSalesData');
    if (!fpToolsSalesData || Object.keys(fpToolsSalesData).length === 0) {
        document.getElementById("fpTools-stats-total-orders").textContent = "Нет данных (Нажмите 'Обновить')";
        return;
    };

    const period = document.getElementById("fpTools-stats-period").value;
    let startDate = null, endDate = null;
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const oneDay = 24 * 3600 * 1000;

    switch(period) {
        case "today": startDate = todayStart; break;
        case "yesterday": endDate = todayStart; startDate = endDate - oneDay; break;
        case "24h": startDate = Date.now() - oneDay; break;
        case "7d": startDate = Date.now() - 7 * oneDay; break;
        case "30d": startDate = Date.now() - 30 * oneDay; break;
        case "365d": startDate = Date.now() - 365 * oneDay; break;
    }

    const stats = await calculateSalesStats(fpToolsSalesData, startDate, endDate);

    document.getElementById("fpTools-stats-total-orders").textContent = stats.totalOrders;
    document.getElementById("fpTools-stats-total-revenue").innerHTML = formatRevenue(stats.totalRevenue);
    document.getElementById("fpTools-stats-average-sale-price").innerHTML = formatRevenue(stats.averageCheck);
    document.getElementById("fpTools-stats-orders-closed").textContent = stats.totalClosed;
    document.getElementById("fpTools-stats-orders-pending").textContent = stats.totalPending;
    document.getElementById("fpTools-stats-orders-refund").textContent = stats.totalRefunded;
    document.getElementById("fpTools-stats-unique-customers").textContent = stats.uniqueBuyers;
    document.getElementById("fpTools-stats-top-customer").textContent = stats.mostActiveBuyer.username || "-";
    document.getElementById("fpTools-stats-top-customer").onclick = () => { if(stats.mostActiveBuyer.id) window.open(`https://funpay.com/users/${stats.mostActiveBuyer.id}/`); };
    document.getElementById("fpTools-stats-top-sale").textContent = formatCurrency(stats.mostExpensiveSale.price, stats.mostExpensiveSale.currency) || "-";
    document.getElementById("fpTools-stats-top-sale").onclick = () => { if(stats.mostExpensiveSale.orderId) window.open(`https://funpay.com/orders/${stats.mostExpensiveSale.orderId}/`); };
    document.getElementById("fpTools-stats-popular-product").textContent = stats.mostPopularProduct || "-";
    document.getElementById("fpTools-stats-popular-category").textContent = stats.mostPopularCategory || "-";
}

function initializeSalesStatistics() {
    if (!window.location.pathname.includes('/orders/trade')) return;
    const ordersTable = document.querySelector('.orders-table');
    if (!ordersTable || document.getElementById('fpTools-stats-period')) return;

    const statsContainer = document.createElement('div');
    statsContainer.innerHTML = getStatsBlockHTML();
    ordersTable.before(statsContainer);

    const periodSelect = document.getElementById("fpTools-stats-period");
    periodSelect.value = localStorage.getItem("fpToolsStatsPeriod") || "7d";
    periodSelect.addEventListener('change', () => {
        localStorage.setItem("fpToolsStatsPeriod", periodSelect.value);
        displaySalesStats();
    });

    const updateBtn = document.getElementById("fpTools-stats-reset");
    updateBtn.addEventListener('click', async () => {
        if (!chrome.runtime?.id) return; // Защита от недействительного контекста
        updateBtn.disabled = true;
        updateBtn.textContent = "Обновление...";
        await chrome.runtime.sendMessage({ action: 'resetSalesStorage' });
        await chrome.runtime.sendMessage({ action: 'updateSales' });
    });
    
    displaySalesStats();
    if (chrome.runtime?.id) {
        chrome.runtime.sendMessage({ action: 'updateSales' });
    }

    // Слушаем изменения в хранилище, чтобы обновить UI
    chrome.storage.onChanged.addListener((changes, namespace) => {
        // Проверяем, существует ли еще расширение, чтобы избежать ошибки
        if (!chrome.runtime?.id) return;
        
        const statsBlock = document.getElementById('fpTools-stats-reset');
        if (!statsBlock) return; // И если блока статистики больше нет на странице

        if (changes.fpToolsSalesData) {
            console.log("FP Tools: Sales data updated, refreshing stats display.");
            displaySalesStats();
        }
        
        // Когда приходит любое обновление, связанное с продажами, считаем, что процесс закончен
        if (changes.fpToolsSalesLastUpdate) {
            console.log("FP Tools: Update finished, re-enabling button.");
            const updateBtn = document.getElementById("fpTools-stats-reset");
            if (updateBtn) {
                updateBtn.disabled = false;
                updateBtn.textContent = "Обновить данные";
            }
        }
    });
}

// --- Hide Balance ---
function initializeHideBalance() {
    const balanceElements = document.querySelectorAll('.badge-balance, .balances-value');
    balanceElements.forEach(el => {
        el.textContent = el.textContent.replace(/[\d.,\s]/g, '?');
    });
}

// --- View Promo Icons ---
function initializeViewPromoIcons() {
    const promoOffers = document.querySelectorAll('a.tc-item.offer-promo');
    promoOffers.forEach(offer => {
        const priceContainer = offer.querySelector('.tc-price');
        if (!priceContainer || priceContainer.querySelector('.fp-tools-promo-icon')) return;
        
        const iconContainer = priceContainer.querySelector('.sc-offer-icons') || document.createElement('div');
        if (!iconContainer.classList.contains('sc-offer-icons')) {
            iconContainer.className = 'sc-offer-icons';
            priceContainer.appendChild(iconContainer);
        }

        const promoIcon = createElement('div', { 
            class: 'promo-offer-icon fpt-promo-offer-highlight fp-tools-promo-icon',
            title: 'Промо-лот'
        }, { 
            marginLeft: '4px' 
        });
        iconContainer.appendChild(promoIcon);
    });
}