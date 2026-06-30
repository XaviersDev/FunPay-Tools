// content/features/ui_enhancements.js

// FP Tools: конфиг источника статистики. По умолчанию — продажи.
// На странице покупок (/orders/) purchases.js переопределяет window.fptStatsCfg.
function _fptCfg() {
    return window.fptStatsCfg || {
        updateAction: 'updateSales',
        resetAction: 'resetSalesStorage',
        collectingKey: 'fpToolsSalesCollecting',
        lastUpdateKey: 'fpToolsSalesLastUpdate',
        pathMatch: '/orders/trade',
        title: 'Статистика продаж',
        totalMoneyLabel: 'Всего заработано',
        uniquePartyLabel: 'Уникальных покупателей',
        topPartyLabel: '🏆 Самый активный покупатель:',
        loadingTitle: 'Загружаем продажи…'
    };
}

function getStatsBlockHTML() {
    return `
    <div class="fp-tools-stats-container">
        <div class="fp-stats-header">
            <h1>${_fptCfg().title}</h1>
            <div class="fp-stats-controls">
                <button type="button" class="btn btn-default" id="fpTools-stats-reset">Обновить</button>
                <button type="button" class="btn btn-default fp-stats-search-toggle" id="fpTools-stats-search-toggle" title="Поиск по заказам"><span class="material-symbols-rounded" style="font-size:18px;vertical-align:-4px;">search</span></button>
                <button type="button" class="btn btn-default fp-stats-filter-toggle" id="fpTools-stats-filter-toggle" title="Фильтры и сортировка"><span class="material-symbols-rounded" style="font-size:18px;vertical-align:-4px;">tune</span></button>
                <button type="button" class="btn btn-default" id="fpTools-stats-accuracy" title="Почему цифры могут отличаться от FunPay" style="color:#f0a040;"><span class="material-symbols-rounded" style="font-size:18px;vertical-align:-4px;">info</span></button>
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

        <div class="fp-stats-modebar" id="fpTools-stats-modebar">
            <button type="button" class="fp-stats-mode-btn active" data-mode="cards"><span class="material-symbols-rounded">dashboard</span>Карточки</button>
            <button type="button" class="fp-stats-mode-btn" data-mode="charts"><span class="material-symbols-rounded">show_chart</span>Графики</button>
            <button type="button" class="fp-stats-mode-btn" data-mode="diagrams"><span class="material-symbols-rounded">pie_chart</span>Диаграммы</button>
            <button type="button" class="fp-stats-mode-btn" data-mode="detailed"><span class="material-symbols-rounded">table_rows</span>Детально</button>
            <button type="button" class="fp-stats-mode-btn" data-mode="full"><span class="material-symbols-rounded">apps</span>Полный</button>
        </div>

        <div class="fp-stats-searchbar" id="fpTools-stats-searchbar" style="display:none;">
            <span class="material-symbols-rounded fp-stats-search-ico">search</span>
            <input type="text" id="fpTools-stats-search" placeholder="Поиск по заказам: покупатель, товар, категория…" autocomplete="off">
            <button type="button" id="fpTools-stats-search-btn">Найти</button>
            <button type="button" id="fpTools-stats-search-clear" title="Сбросить">×</button>
        </div>

        <div class="fp-stats-filterbar" id="fpTools-stats-filterbar" style="display:none;">
            <div class="fp-stats-filter-row">
                <span class="fp-stats-filter-cap">Показывать статусы:</span>
                <button type="button" class="fp-stats-status-btn active" id="fpFilt-st-closed" data-status="closed">Закрытые</button>
                <button type="button" class="fp-stats-status-btn active" id="fpFilt-st-paid" data-status="paid">Оплаченные</button>
                <button type="button" class="fp-stats-status-btn active" id="fpFilt-st-refunded" data-status="refunded">Возвраты</button>
            </div>
            <div class="fp-stats-filter-row">
                <span class="fp-stats-filter-cap">Сортировка:</span>
                <select class="form-control fp-stats-sort-select" id="fpFilt-sort">
                    <option value="date-desc">Сначала новые</option>
                    <option value="date-asc">Сначала старые</option>
                    <option value="price-desc">Дороже сверху</option>
                    <option value="price-asc">Дешевле сверху</option>
                </select>
                <button type="button" class="fp-stats-filter-reset" id="fpFilt-reset">Сбросить фильтры</button>
            </div>
        </div>

        <div id="fpTools-stats-modeview"></div>

        <div id="fpTools-stats-cards">
        <div class="fp-stats-grid">
            <div class="fp-stat-card stat-card-large stat-card-revenue">
                <div class="stat-card-icon">💰</div>
                <div class="stat-card-content">
                    <div class="stat-card-label">${_fptCfg().totalMoneyLabel}</div>
                    <div class="stat-card-value" id="fpTools-stats-total-revenue">0 ₽</div>
                </div>
            </div>
            <div class="fp-stat-card">
                <div class="stat-card-icon">📦</div>
                <div class="stat-card-content">
                    <div class="stat-card-label">${_fptCfg().totalOrdersLabel || "Всего заказов"}</div>
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
                    <div class="stat-card-subvalue" id="fpTools-stats-pending-amount"></div>
                </div>
            </div>
            <div class="fp-stat-card stat-card-refund">
                <div class="stat-card-icon">↩️</div>
                <div class="stat-card-content">
                    <div class="stat-card-label">${_fptCfg().refundLabel || 'Возвраты'}</div>
                    <div class="stat-card-value" id="fpTools-stats-orders-refund">0</div>
                </div>
            </div>
            <div class="fp-stat-card">
                <div class="stat-card-icon">👥</div>
                <div class="stat-card-content">
                    <div class="stat-card-label">${_fptCfg().uniquePartyLabel}</div>
                    <div class="stat-card-value" id="fpTools-stats-unique-customers">0</div>
                </div>
            </div>
        </div>

        <div class="fp-stats-details">
            <div class="fp-stat-detail-item">
                <span class="detail-label">${_fptCfg().topPartyLabel}</span>
                <span class="detail-value" id="fpTools-stats-top-customer">-</span>
            </div>
            <div class="fp-stat-detail-item">
                <span class="detail-label">${_fptCfg().topDealLabel || "💎 Самая дорогая продажа:"}</span>
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
            <div class="fp-stats-unconf-divider"></div>
            <div class="fp-stats-expand-row" id="fpTools-stats-expand-btn">
                <span class="fp-stats-expand-label">Показать ещё</span>
                <span class="fp-stats-expand-arrow">▾</span>
            </div>
            <div class="fp-stats-extra" id="fpTools-stats-extra" style="display:none;">
                <div class="fp-stat-detail-item">
                    <span class="detail-label">🔒 Неподтверждённые заказы:</span>
                    <span class="detail-value" id="fpTools-stats-unconfirmed">-</span>
                </div>
            </div>
        </div>
        </div>
    </div>
    `;
}

async function calculateSalesStats(allOrders, startDate, endDate) {
    const stats = {
        totalOrders: 0, totalClosed: 0, totalPending: 0, totalRefunded: 0,
        totalRevenue: { RUB: 0, USD: 0, EUR: 0 },
        pendingRevenue: { RUB: 0, USD: 0, EUR: 0 },
        refundedRevenue: { RUB: 0, USD: 0, EUR: 0 },
        averageCheck: { RUB: 0, USD: 0, EUR: 0 },
        uniqueBuyers: new Set(), mostPopularProduct: "", mostPopularCategory: "",
        mostActiveBuyer: { username: "", id: 0, count: 0 },
        mostExpensiveSale: { price: 0, currency: "RUB", orderId: "" }
    };
    const productCount = new Map(), categoryCount = new Map(), buyerCount = new Map();
    const validCurrencies = new Set(["RUB", "USD", "EUR"]);
    const exchangeRates = { RUB: 0.011, USD: 1, EUR: 1.08 };

    // Учитываем глобальные фильтры статусов (общие со статистикой/диаграммами).
    // Дефолт зависит от режима: на покупках возвраты по умолчанию выключены.
    const _purchases = !!(window.fptStatsCfg);
    let flt = { stClosed: true, stPaid: true, stRefunded: !_purchases };
    try { if (typeof window.fptGetStatsFilters === 'function') flt = window.fptGetStatsFilters(); } catch (_) {}
    const statusOk = (st) => {
        if (st === 'refunded') return flt.stRefunded !== false;
        if (st === 'paid') return flt.stPaid !== false;
        if (st === 'closed') return flt.stClosed !== false;
        return true;
    };

    for (const orderId in allOrders) {
        const order = allOrders[orderId];
        if ((startDate && order.orderDate < startDate) || (endDate && order.orderDate > endDate)) continue;

        // Сумму возвратов считаем ВСЕГДА (даже если возвраты скрыты фильтром),
        // чтобы было видно, сколько денег вернулось — это не входит в «потрачено».
        if (order.orderStatus === "refunded" && validCurrencies.has(order.currency)) {
            stats.refundedRevenue[order.currency] = (stats.refundedRevenue[order.currency] || 0) + (order.price || 0);
        }

        if (!statusOk(order.orderStatus)) continue;

        stats.totalOrders++;
        stats.uniqueBuyers.add(order.buyerId);
        
        if (validCurrencies.has(order.currency) && (order.orderStatus === "paid" || order.orderStatus === "closed")) {
            stats.totalRevenue[order.currency] += order.price;
        }

        productCount.set(order.description, (productCount.get(order.description) || 0) + 1);
        categoryCount.set(order.subcategoryName, (categoryCount.get(order.subcategoryName) || 0) + 1);
        
        const buyerKey = `${order.buyerUsername}|${order.buyerId}`;
        buyerCount.set(buyerKey, (buyerCount.get(buyerKey) || 0) + 1);

        if (order.orderStatus === "paid") {
            stats.totalPending++;
            if (stats.pendingRevenue[order.currency] != null) stats.pendingRevenue[order.currency] += order.price;
        }
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

// ===== FP Tools: красивый оверлей загрузки статистики =====
function _fptStatsHost() {
    // Контейнер, поверх которого показываем загрузку (блок карточек).
    return document.getElementById('fpTools-stats-cards');
}

function showStatsLoading(opts) {
    opts = opts || {};
    const host = _fptStatsHost();
    if (!host) return;
    // Затеняем карточки и кладём оверлей сверху (внутри контейнера статистики).
    const container = document.querySelector('.fp-tools-stats-container');
    if (!container) return;

    let overlay = document.getElementById('fpTools-stats-loading');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'fpTools-stats-loading';
        overlay.className = 'fp-stats-loading';
        overlay.innerHTML = `
            <div class="fp-stats-spinner"></div>
            <div class="fp-stats-loading-title">${_fptCfg().loadingTitle}</div>
            <div class="fp-stats-loading-sub">Собираем историю заказов с FunPay. Это может занять несколько секунд — не закрывайте вкладку.</div>
            <div class="fp-stats-loading-bar"></div>
            <div class="fp-stats-loading-count" id="fpTools-stats-loading-count"></div>
        `;
        // Прячем сетку карточек на время загрузки, показываем оверлей вместо неё.
        host.style.display = 'none';
        host.parentElement.insertBefore(overlay, host);
    }
    const sub = overlay.querySelector('.fp-stats-loading-sub');
    if (sub && opts.sub) sub.textContent = opts.sub;
    updateStatsLoadingCount(opts.count);
}

function updateStatsLoadingCount(count) {
    const el = document.getElementById('fpTools-stats-loading-count');
    if (!el) return;
    if (typeof count === 'number' && count > 0) {
        el.textContent = `Загружено заказов: ${count.toLocaleString('ru-RU')}`;
    } else {
        el.textContent = 'Подключаемся к FunPay…';
    }
}

function hideStatsLoading() {
    const overlay = document.getElementById('fpTools-stats-loading');
    if (overlay) overlay.remove();
    const host = _fptStatsHost();
    if (host) host.style.display = '';
}

async function displaySalesStats() {
    if (!document.getElementById("fpTools-stats-period")) return;
    
    const fpToolsSalesData = await (window.fptOrdersDB || FPTSalesDB).getAllAsMap();
    if (!fpToolsSalesData || Object.keys(fpToolsSalesData).length === 0) {
        // База пуста. Если прямо сейчас идёт сбор — показываем красивую загрузку
        // вместо пугающего «Нет данных».
        let collecting = false;
        try {
            const _ck = _fptCfg().collectingKey;
            const st = await chrome.storage.local.get(_ck);
            collecting = !!st[_ck];
        } catch (_) {}
        if (collecting) {
            showStatsLoading();
        } else {
            hideStatsLoading();
            document.getElementById("fpTools-stats-total-orders").textContent = "Нет данных (Нажмите 'Обновить')";
        }
        return;
    };

    // Данные есть — убираем оверлей и рисуем как обычно.
    hideStatsLoading();

    const period = document.getElementById("fpTools-stats-period").value;
    let startDate = null, endDate = null;
    const oneDay = 24 * 3600 * 1000;

    // FIX 2.8.5: "сегодня"/"вчера" считаем по московскому дню (MSK, UTC+3),
    // как день определяет сам FunPay, иначе границы суток у пользователя в другом
    // часовом поясе не совпадали с датами заказов и в "сегодня" попадали вчерашние.
    const MSK_OFFSET_MS = 3 * 60 * 60 * 1000;
    const nowMs = Date.now();
    // полночь текущего МSK-дня, выраженная в обычном (UTC-эпоха) таймстампе
    const mskNow = nowMs + MSK_OFFSET_MS;
    const mskMidnight = Math.floor(mskNow / oneDay) * oneDay;       // 00:00 MSK в "MSK-шкале"
    const todayStart = mskMidnight - MSK_OFFSET_MS;                  // тот же момент в реальном таймстампе

    switch(period) {
        case "today": startDate = todayStart; break;
        case "yesterday": endDate = todayStart; startDate = endDate - oneDay; break;
        case "24h": startDate = nowMs - oneDay; break;
        case "7d": startDate = nowMs - 7 * oneDay; break;
        case "30d": startDate = nowMs - 30 * oneDay; break;
        case "365d": startDate = nowMs - 365 * oneDay; break;
    }

    const stats = await calculateSalesStats(fpToolsSalesData, startDate, endDate);

    document.getElementById("fpTools-stats-total-orders").textContent = stats.totalOrders;
    document.getElementById("fpTools-stats-total-revenue").innerHTML = formatRevenue(stats.totalRevenue);
    document.getElementById("fpTools-stats-average-sale-price").innerHTML = formatRevenue(stats.averageCheck);
    document.getElementById("fpTools-stats-orders-closed").textContent = stats.totalClosed;
    document.getElementById("fpTools-stats-orders-pending").textContent = stats.totalPending;
    {
        const amtEl = document.getElementById("fpTools-stats-pending-amount");
        if (amtEl) {
            const sym = { RUB: '₽', USD: '$', EUR: '€' };
            const parts = [];
            for (const cur of ['RUB', 'USD', 'EUR']) {
                const v = stats.pendingRevenue[cur];
                if (v && v > 0) parts.push(Math.round(v).toLocaleString('ru-RU') + ' ' + (sym[cur] || cur));
            }
            amtEl.textContent = parts.length ? parts.join(' · ') : '';
        }
    }
    if (window.fptStatsCfg) {
        // Покупки: в карточке возвратов показываем СУММУ вернувшихся денег
        // (она не входит в «Всего потрачено»), а не просто число заказов.
        document.getElementById("fpTools-stats-orders-refund").innerHTML = formatRevenue(stats.refundedRevenue);
    } else {
        document.getElementById("fpTools-stats-orders-refund").textContent = stats.totalRefunded;
    }
    document.getElementById("fpTools-stats-unique-customers").textContent = stats.uniqueBuyers;
    document.getElementById("fpTools-stats-top-customer").textContent = stats.mostActiveBuyer.username || "-";
    document.getElementById("fpTools-stats-top-customer").onclick = () => { if(stats.mostActiveBuyer.id) window.open(`https://funpay.com/users/${stats.mostActiveBuyer.id}/`); };
    document.getElementById("fpTools-stats-top-sale").textContent = formatCurrency(stats.mostExpensiveSale.price, stats.mostExpensiveSale.currency) || "-";
    document.getElementById("fpTools-stats-top-sale").onclick = () => { if(stats.mostExpensiveSale.orderId) window.open(`https://funpay.com/orders/${stats.mostExpensiveSale.orderId}/`); };
    document.getElementById("fpTools-stats-popular-product").textContent = stats.mostPopularProduct || "-";
    document.getElementById("fpTools-stats-popular-category").textContent = stats.mostPopularCategory || "-";

    // Fetch unconfirmed (pending) balance from live trade page
    // FIX: Always fetch status=paid specifically (ignores the period filter - unconfirmed is always real-time)
    const unconfEl = document.getElementById("fpTools-stats-unconfirmed");
    if (unconfEl) {
        unconfEl.textContent = "…";
        try {
            const resp = await fetch('https://funpay.com/orders/trade?status=paid', { credentials: 'include' });
            if (resp.ok) {
                const html = await resp.text();
                const result = await new Promise(r =>
                    chrome.runtime.sendMessage({ target: 'offscreen', action: 'parseUnconfirmedBalance', html }, d => r(d))
                );
                if (result) {
                    const sym = result.currency === 'USD' ? '$' : result.currency === 'EUR' ? '€' : '₽';
                    unconfEl.textContent = result.count > 0
                        ? `${result.total.toLocaleString('ru')} ${sym} (${result.count} шт.)`
                        : '0 ' + sym;
                    // Style: highlight if there's money waiting
                    if (result.count > 0) {
                        unconfEl.style.color = '#ffa000';
                        unconfEl.style.fontWeight = '700';
                    }
                }
            }
        } catch(_) { unconfEl.textContent = "-"; }
    }

    // FIX 2.8.6: авто-детектор неполной/неточной статистики. Раньше про неточность
    // говорил только маленький значок в шапке, который никто не замечал. Теперь,
    // если данные похожи на неполные, показываем заметный баннер с кнопкой действия.
    try { await _maybeShowInaccuracyBanner(fpToolsSalesData); } catch (_) {}
}

// Показывает баннер "данные могут быть неполными", если обнаружены признаки:
//  1) сумма "за месяц" совпадает с "за всё время" (история не докачана), ИЛИ
//  2) самый старый заказ в кэше новее ~31 дня (а значит "за всё время" урезано).
async function _maybeShowInaccuracyBanner(allOrders) {
    const host = document.querySelector('.fp-stats-cards-wrap, #fpTools-stats-cards, .fp-stats-body') 
        || document.getElementById('fpTools-stats-total-orders')?.closest('.fp-stats-section')
        || document.querySelector('.fp-stats-header')?.parentElement;
    if (!host || !allOrders) return;

    // если пользователь скрыл баннер в этой сессии - не мешаем
    if (sessionStorage.getItem('fptStatsBannerDismissed') === '1') return;

    const ids = Object.keys(allOrders);
    if (ids.length === 0) return;

    const oneDay = 24 * 3600 * 1000;
    const now = Date.now();

    // суммы за 30 дней и за всё время (closed+paid, по всем валютам в рублёвом эквиваленте)
    const rate = { RUB: 1, USD: 90, EUR: 98 };
    let sum30 = 0, sumAll = 0, oldest = Infinity;
    for (const id of ids) {
        const o = allOrders[id];
        if (!o) continue;
        if (typeof o.orderDate === 'number') oldest = Math.min(oldest, o.orderDate);
        if (o.orderStatus === 'closed' || o.orderStatus === 'paid') {
            const v = (o.price || 0) * (rate[o.currency] || 0);
            sumAll += v;
            if (o.orderDate >= now - 30 * oneDay) sum30 += v;
        }
    }

    const monthEqualsAll = sumAll > 0 && Math.abs(sumAll - sum30) < 1;     // месяц == всё время
    const historyShallow = oldest !== Infinity && oldest > now - 31 * oneDay; // старее 31д нет

    if (!monthEqualsAll && !historyShallow) {
        const ex = document.getElementById('fpt-stats-inaccuracy-banner');
        if (ex) ex.remove();
        return;
    }

    if (document.getElementById('fpt-stats-inaccuracy-banner')) return;

    const banner = document.createElement('div');
    banner.id = 'fpt-stats-inaccuracy-banner';
    // Парсинговые цвета: непрозрачный фон карточки + янтарная рамка/иконка как
    // акцент предупреждения. Текст основной - читается и на светлой, и на тёмной теме.
    banner.style.cssText = 'display:flex;align-items:center;gap:12px;margin:0 0 14px;padding:12px 16px;background:var(--fp-bg-card, #1e1e1e);border:1px solid #f0a040;border-left:4px solid #f0a040;border-radius:10px;color:var(--fp-text-primary, #e0e0e0);font-size:13px;line-height:1.45;';
    banner.innerHTML = `
        <span class="material-symbols-rounded" style="color:#f0a040;font-size:22px;flex-shrink:0;">warning</span>
        <div style="flex:1;">
            <b style="color:#f0a040;">Похоже, данные неполные.</b>
            ${historyShallow ? 'Расширение ещё не докачало старые заказы - "за всё время" сейчас показывает только часть истории. ' : ''}
            ${monthEqualsAll ? '"За месяц" и "за всё время" совпадают, хотя вы торгуете дольше - значит старые заказы не загружены. ' : ''}
            Нажмите "Пересобрать", чтобы дотянуть всю доступную историю.
        </div>
        <button id="fpt-stats-banner-rebuild" class="btn btn-default" style="padding:6px 12px;flex-shrink:0;">Пересобрать</button>
        <button id="fpt-stats-banner-x" title="Скрыть" style="background:none;border:none;color:var(--fp-text-secondary, #a0a0a0);font-size:20px;cursor:pointer;flex-shrink:0;line-height:1;">×</button>
    `;
    host.prepend(banner);

    banner.querySelector('#fpt-stats-banner-x').addEventListener('click', () => {
        sessionStorage.setItem('fptStatsBannerDismissed', '1');
        banner.remove();
    });
    banner.querySelector('#fpt-stats-banner-rebuild').addEventListener('click', async () => {
        banner.querySelector('#fpt-stats-banner-rebuild').textContent = 'Сбор...';
        try {
            await chrome.runtime.sendMessage({ action: 'resetSalesStorage' });
            await chrome.runtime.sendMessage({ action: 'updateSales' });
        } catch (_) {}
    });
}

// Позволяет другим модулям (панель фильтров) пересчитать карточки.
if (typeof window !== 'undefined') {
    window.fptRefreshStatsCards = function () { try { displaySalesStats(); } catch (_) {} };
}

// Попап "Стойте, это не точные данные!" - честно объясняет, почему сумма в FP Tools
// может отличаться от того, что пользователь видит/ожидает, и как это исправить.
function _showStatsAccuracyPopup(lastUpd, ordersCount, updateBtn) {
    document.getElementById('fpt-stats-accuracy-overlay')?.remove();

    const overlay = document.createElement('div');
    overlay.id = 'fpt-stats-accuracy-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:100000;display:flex;align-items:center;justify-content:center;padding:20px;';

    const box = document.createElement('div');
    box.id = 'fpt-stats-accuracy-box';
    // Парсинговые цвета (как окно копирования лота): свой непрозрачный фон + тёмный
    // скрим оверлея, поэтому окно нормально читается и на светлой, и на тёмной теме
    // FunPay, не сливаясь с фоном. Переменные --fp-* адаптируются к теме страницы.
    box.style.cssText = 'max-width:440px;width:100%;background:var(--fp-bg-card, #1e1e1e);border:1px solid var(--fp-border-color, #333);border-radius:14px;padding:18px 20px;color:var(--fp-text-primary, #e0e0e0);font-size:13px;line-height:1.5;box-shadow:0 12px 48px rgba(0,0,0,.45);max-height:88vh;overflow:auto;scrollbar-width:none;-ms-overflow-style:none;';

    const infoLine = (lastUpd || ordersCount)
        ? `<div style="margin:12px 0;padding:10px 12px;background:var(--fp-bg-main, rgba(0,0,0,.15));border:1px solid var(--fp-border-color, #333);border-radius:8px;font-size:13px;color:var(--fp-text-secondary, #a0a0a0);">
                Загружено заказов в кэше: <b style="color:var(--fp-text-primary,#e0e0e0);">${ordersCount}</b>${lastUpd ? `<br>Последнее обновление: <b style="color:var(--fp-text-primary,#e0e0e0);">${lastUpd}</b>` : ''}
           </div>`
        : '';

    box.innerHTML = `
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:6px;">
            <span class="material-symbols-rounded" style="color:#f0a040;font-size:26px;">warning</span>
            <h3 style="margin:0;font-size:18px;color:var(--fp-text-primary, #e0e0e0);">Стойте, это не точные данные?</h3>
        </div>
        <p style="margin:10px 0;color:var(--fp-text-secondary, #a0a0a0);">
            Статистика собирается из вашей истории заказов на FunPay и считается на стороне расширения.
            Поэтому цифры могут немного отличаться от того, что вы ожидаете. Основные причины:
        </p>
        <ul style="margin:10px 0;padding-left:18px;color:var(--fp-text-primary, #c2c5db);">
            <li style="margin-bottom:7px;"><b>"Оплаченные" (в ожидании) входят в сумму.</b> Заказы со статусом "оплачен, но не подтверждён" учитываются в "Всего заработано". Деньги по ним ещё не получены и могут уйти в возврат. Чтобы увидеть только реально завершённое - в фильтрах оставьте лишь "Закрытые".</li>
            <li style="margin-bottom:7px;"><b>Часовой пояс.</b> День заказа определяется по Москве (как на FunPay). "За сегодня/вчера" теперь считается по МSK - если ваш пояс другой, границы суток всё равно совпадут с FunPay.</li>
            <li style="margin-bottom:7px;"><b>Глубина истории.</b> Если "За месяц" и "За всё время" совпадают - значит расширение ещё не докачало старые заказы (или FunPay отдаёт ограниченную историю). Нажмите "Пересобрать", чтобы дотянуть всю доступную историю.</li>
            <li style="margin-bottom:7px;"><b>Возвраты и валюты.</b> Возвраты и заказы в разных валютах считаются по своим правилам - переключайте фильтры статусов, чтобы сверить.</li>
        </ul>
        ${infoLine}
        <div style="display:flex;gap:10px;margin-top:16px;justify-content:flex-end;">
            <button id="fpt-acc-rebuild" class="btn btn-default" style="padding:7px 14px;">Пересобрать данные</button>
            <button id="fpt-acc-close" class="btn" style="padding:7px 14px;background:var(--fp-accent, #1b75bb);border-color:var(--fp-accent, #1b75bb);color:#fff;">Понятно</button>
        </div>
    `;

    overlay.appendChild(box);
    document.body.appendChild(overlay);

    const close = () => overlay.remove();
    overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
    box.querySelector('#fpt-acc-close').addEventListener('click', close);
    box.querySelector('#fpt-acc-rebuild').addEventListener('click', async () => {
        close();
        if (updateBtn && chrome.runtime?.id) {
            updateBtn.disabled = true;
            updateBtn.textContent = "Обновление...";
            showStatsLoading({ sub: 'Пересобираем историю заказов с FunPay…' });
            await chrome.runtime.sendMessage({ action: _fptCfg().resetAction });
            await chrome.runtime.sendMessage({ action: _fptCfg().updateAction });
        }
    });
}

function initializeSalesStatistics() {
    if (!window.location.pathname.includes(_fptCfg().pathMatch)) return;
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
        showStatsLoading({ sub: 'Обновляем историю заказов с FunPay…' });
        await chrome.runtime.sendMessage({ action: _fptCfg().resetAction });
        await chrome.runtime.sendMessage({ action: _fptCfg().updateAction });
    });

    // Кнопка "почему цифры могут отличаться" - объясняет расхождения и даёт пересобрать данные.
    const accuracyBtn = document.getElementById("fpTools-stats-accuracy");
    accuracyBtn?.addEventListener('click', async () => {
        let lastUpd = '';
        let ordersCount = 0;
        try {
            const _luk = _fptCfg().lastUpdateKey;
            const fpToolsSalesLastUpdate = (await chrome.storage.local.get(_luk))[_luk];
            ordersCount = await (window.fptOrdersDB || FPTSalesDB).count();
            if (fpToolsSalesLastUpdate) lastUpd = new Date(fpToolsSalesLastUpdate).toLocaleString();
        } catch (_) {}
        _showStatsAccuracyPopup(lastUpd, ordersCount, updateBtn);
    });
    
    displaySalesStats();
    if (chrome.runtime?.id) {
        // При первом заходе, если база ещё пустая, сразу показываем красивую загрузку,
        // не дожидаясь первого commit'а — чтобы юзер не увидел «Нет данных».
        (async () => {
            try {
                const c = await (window.fptOrdersDB || FPTSalesDB).count();
                if (!c) showStatsLoading();
            } catch (_) {}
        })();
        chrome.runtime.sendMessage({ action: _fptCfg().updateAction });
    }

    // Несколько режимов отображения статистики (графики/диаграммы/детально/полный).
    if (typeof initSalesModes === 'function') initSalesModes();

    // Expand/collapse "Показать ещё"
    const expandBtn = document.getElementById('fpTools-stats-expand-btn');
    const extraBlock = document.getElementById('fpTools-stats-extra');
    if (expandBtn && extraBlock) {
        expandBtn.addEventListener('click', () => {
            const open = extraBlock.style.display !== 'none';
            extraBlock.style.display = open ? 'none' : 'block';
            expandBtn.querySelector('.fp-stats-expand-arrow').textContent = open ? '▾' : '▴';
            expandBtn.querySelector('.fp-stats-expand-label').textContent = open ? 'Показать ещё' : 'Скрыть';
        });
    }

    // Слушаем изменения в хранилище, чтобы обновить UI
    chrome.storage.onChanged.addListener((changes, namespace) => {
        // Проверяем, существует ли еще расширение, чтобы избежать ошибки
        if (!chrome.runtime?.id) return;
        
        const statsBlock = document.getElementById('fpTools-stats-reset');
        if (!statsBlock) return; // И если блока статистики больше нет на странице

        // Пока идёт сбор — на каждом commit'е обновляем живой счётчик в оверлее.
        if (changes[_fptCfg().lastUpdateKey]) {
            (async () => {
                try {
                    const _ck2 = _fptCfg().collectingKey;
                    const collecting = (await chrome.storage.local.get(_ck2))[_ck2];
                    if (collecting && document.getElementById('fpTools-stats-loading')) {
                        const c = await (window.fptOrdersDB || FPTSalesDB).count();
                        updateStatsLoadingCount(c);
                    }
                } catch (_) {}
            })();
        }

        // Флаг сбора переключился в false → процесс завершён: прячем оверлей,
        // рисуем карточки и возвращаем кнопку в исходное состояние.
        if (changes[_fptCfg().collectingKey] && changes[_fptCfg().collectingKey].newValue === false) {
            console.log("FP Tools: Сбор завершён, показываем статистику.");
            hideStatsLoading();
            displaySalesStats();
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
        // stash original once so we can restore when toggled off
        if (el.dataset.fptOrigBalance === undefined) el.dataset.fptOrigBalance = el.textContent;
        el.textContent = el.textContent.replace(/[\d.,\s]/g, '?');
    });
    // 3.0.6.2: now that the text is masked, drop the document_start pre-hide CSS so the
    // "?" masked value is shown (instead of the transparent/•••• placeholder).
    const preHide = document.getElementById('fp-tools-balance-prehide');
    if (preHide) preHide.remove();
}

function restoreBalance() {
    document.querySelectorAll('.badge-balance, .balances-value').forEach(el => {
        if (el.dataset.fptOrigBalance !== undefined) {
            el.textContent = el.dataset.fptOrigBalance;
        }
    });
    // ensure the early mask is gone when balance hiding is turned off
    const preHide = document.getElementById('fp-tools-balance-prehide');
    if (preHide) preHide.remove();
}

// 3.0: react to the toggle instantly - no page reload needed.
if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.onChanged) {
    chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== 'local' || !changes.hideBalance) return;
        if (changes.hideBalance.newValue === true) initializeHideBalance();
        else restoreBalance();
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