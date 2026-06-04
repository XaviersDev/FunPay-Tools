function getAnalyticsBlockHTML() {
    return `
    <div class="fp-tools-analytics-container">
        <div class="fp-stats-header">
            <h1>Аналитика рынка</h1>
            <div class="fp-stats-controls">
                <button type="button" class="btn btn-default" id="fpTools-analytics-refresh">Обновить</button>
                <button type="button" class="btn btn-default" id="fpTools-analytics-close">Закрыть</button>
            </div>
        </div>
        <div class="fp-stats-grid">
            <div class="fp-stat-card">
                <div class="stat-card-icon">👥</div>
                <div class="stat-card-content">
                    <div class="stat-card-label">Уникальных продавцов</div>
                    <div class="stat-card-value" id="fpTools-analytics-unique-sellers">0</div>
                </div>
            </div>
            <div class="fp-stat-card">
                <div class="stat-card-icon">⭐</div>
                <div class="stat-card-content">
                    <div class="stat-card-label">Продавцов с отзывами</div>
                    <div class="stat-card-value" id="fpTools-analytics-sellers-with-reviews">0</div>
                </div>
            </div>
            <div class="fp-stat-card">
                <div class="stat-card-icon">💰</div>
                <div class="stat-card-content">
                    <div class="stat-card-label">Средняя цена</div>
                    <div class="stat-card-value" id="fpTools-analytics-average-price">0 ₽</div>
                </div>
            </div>
            <div class="fp-stat-card stat-card-min-price">
                <div class="stat-card-icon">📉</div>
                <div class="stat-card-content">
                    <div class="stat-card-label">Мин. цена</div>
                    <div class="stat-card-value" id="fpTools-analytics-min-price">0 ₽</div>
                </div>
            </div>
            <div class="fp-stat-card stat-card-max-price">
                <div class="stat-card-icon">📈</div>
                <div class="stat-card-content">
                    <div class="stat-card-label">Макс. цена</div>
                    <div class="stat-card-value" id="fpTools-analytics-max-price">0 ₽</div>
                </div>
            </div>
            <div class="fp-stat-card">
                <div class="stat-card-icon">💎</div>
                <div class="stat-card-content">
                    <div class="stat-card-label">Общая стоимость</div>
                    <div class="stat-card-value" id="fpTools-analytics-total-value">0 ₽</div>
                </div>
            </div>
            <div class="fp-stat-card fpt-analytics-online">
                <div class="stat-card-icon">🟢</div>
                <div class="stat-card-content">
                    <div class="stat-card-label">Продавцов онлайн</div>
                    <div class="stat-card-value" id="fpTools-analytics-sellers-online">0</div>
                </div>
            </div>
        </div>
    </div>
    `;
}

function runMarketAnalysis() {
    const lots = document.querySelectorAll('a.tc-item');
    if (lots.length === 0) {
        showNotification('На странице не найдены лоты для анализа.', true);
        return;
    }
    const prices = [];
    const sellers = new Set();
    let sellersWithReviews = 0;
    let onlineSellers = 0;
    lots.forEach(lot => {
        const price = parseFloat(lot.querySelector('.tc-price')?.dataset.s);
        if (!isNaN(price)) {
            prices.push(price);
        }
        const sellerName = lot.querySelector('.media-user-name span')?.textContent.trim();
        if (sellerName) {
            sellers.add(sellerName);
        }
        if (lot.querySelector('.rating-mini-count')) {
            sellersWithReviews++;
        }
        if (lot.querySelector('.media-user.online')) {
            onlineSellers++;
        }
    });
    if (prices.length === 0) {
        showNotification('Не удалось извлечь цены из лотов.', true);
        return;
    }
    const sum = prices.reduce((a, b) => a + b, 0);
    const avg = sum / prices.length;
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    { const el = document.getElementById('fpTools-analytics-total-lots'); if (el) el.textContent = lots.length; }
    document.getElementById('fpTools-analytics-unique-sellers').textContent = sellers.size;
    document.getElementById('fpTools-analytics-sellers-with-reviews').textContent = sellersWithReviews;
    document.getElementById('fpTools-analytics-sellers-online').textContent = onlineSellers;
    document.getElementById('fpTools-analytics-average-price').textContent = `${avg.toFixed(2)} ₽`;
    document.getElementById('fpTools-analytics-min-price').textContent = `${min.toFixed(2)} ₽`;
    document.getElementById('fpTools-analytics-max-price').textContent = `${max.toFixed(2)} ₽`;
    document.getElementById('fpTools-analytics-total-value').textContent = `${sum.toFixed(0)} ₽`;
}

function initializeMarketAnalytics() {
    if (!window.location.pathname.includes('/lots/')) return;

    const parentColumn = document.querySelector('.col-md-3.col-sm-4.hidden-xs');
    if (!parentColumn || document.getElementById('fpTools-market-analytics-btn-wrapper')) return;

    const originalButtonContainer = parentColumn.querySelector('.pull-right');
    if (!originalButtonContainer) return;

    parentColumn.style.display = 'flex';
    parentColumn.style.flexDirection = 'column';
    parentColumn.style.alignItems = 'flex-end';
    
    const analyticsButtonWrapper = createElement('div', {
        id: 'fpTools-market-analytics-btn-wrapper'
    }, {
        marginBottom: '10px',
        width: 'auto'
    });

    const analyticsButton = createElement('button', {
        type: 'button',
        class: 'btn btn-default btn-block',
        id: 'fpTools-market-analytics-btn',
    }, {}, 'Аналитика рынка');

    analyticsButtonWrapper.appendChild(analyticsButton);
    parentColumn.insertBefore(analyticsButtonWrapper, originalButtonContainer);
    
    analyticsButton.addEventListener('click', () => {
        let analyticsBlock = document.querySelector('.fp-tools-analytics-container');
        if (analyticsBlock) {
            analyticsBlock.remove();
            return;
        }
        const lotsTable = document.querySelector('.tc.showcase-table');
        if (lotsTable) {
            lotsTable.insertAdjacentHTML('beforebegin', getAnalyticsBlockHTML());
            runMarketAnalysis();
            document.getElementById('fpTools-analytics-refresh').addEventListener('click', runMarketAnalysis);
            document.getElementById('fpTools-analytics-close').addEventListener('click', () => {
                document.querySelector('.fp-tools-analytics-container')?.remove();
            });
        }
    });
}