// content/features/sales_chart.js - FunPay Tools 2.8
// Диаграмма продаж по дням/неделям на странице статистики

function renderSalesChart(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    chrome.storage.local.get(['fpToolsSalesData', 'fpToolsSalesChartPeriod'], ({ fpToolsSalesData, fpToolsSalesChartPeriod }) => {
        if (!fpToolsSalesData || !Object.keys(fpToolsSalesData).length) {
            container.innerHTML = '<p style="color:var(--fpt-text-muted);font-size:12px;text-align:center;padding:20px;">Нет данных о продажах</p>';
            return;
        }

        const period = fpToolsSalesChartPeriod || 30;
        const cutoff = Date.now() - period * 24 * 60 * 60 * 1000;
        const orders = Object.values(fpToolsSalesData).filter(o => o.orderDate >= cutoff && o.orderStatus === 'closed');

        if (!orders.length) {
            container.innerHTML = '<p style="color:var(--fpt-text-muted);font-size:12px;text-align:center;padding:20px;">Нет продаж за выбранный период</p>';
            return;
        }

        // Group by day
        const byDay = {};
        orders.forEach(o => {
            const d = new Date(o.orderDate);
            const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
            if (!byDay[key]) byDay[key] = { count: 0, revenue: 0 };
            byDay[key].count++;
            byDay[key].revenue += o.price || 0;
        });

        const days = Object.keys(byDay).sort();
        const maxRevenue = Math.max(...Object.values(byDay).map(d => d.revenue));
        const maxCount   = Math.max(...Object.values(byDay).map(d => d.count));

        const W = container.clientWidth || 400;
        const H = 140;
        const PAD = { t: 16, r: 12, b: 30, l: 50 };
        const chartW = W - PAD.l - PAD.r;
        const chartH = H - PAD.t - PAD.b;
        const barW   = Math.max(2, Math.min(20, Math.floor(chartW / days.length) - 2));

        // Build SVG
        let bars = '';
        let xLabels = '';
        let yLabels = '';

        days.forEach((day, i) => {
            const x = PAD.l + (i / Math.max(days.length - 1, 1)) * chartW;
            const { revenue, count } = byDay[day];
            const barH = maxRevenue > 0 ? (revenue / maxRevenue) * chartH : 0;
            const y = PAD.t + chartH - barH;

            bars += `
                <rect x="${x - barW/2}" y="${y}" width="${barW}" height="${barH}"
                    fill="var(--fpt-accent)" rx="2" opacity="0.85">
                    <title>${day}: ${Math.round(revenue)} ₽ (${count} заказ)</title>
                </rect>
            `;

            // X label: show every Nth day
            if (i === 0 || i === days.length - 1 || i % Math.max(1, Math.floor(days.length / 5)) === 0) {
                const label = day.slice(5); // MM-DD
                xLabels += `<text x="${x}" y="${H - 4}" text-anchor="middle" font-size="9" fill="var(--fpt-text-muted)">${label}</text>`;
            }
        });

        // Y axis labels
        const ySteps = 3;
        for (let i = 0; i <= ySteps; i++) {
            const val = Math.round((maxRevenue / ySteps) * i);
            const y   = PAD.t + chartH - (i / ySteps) * chartH;
            yLabels += `
                <text x="${PAD.l - 4}" y="${y + 3}" text-anchor="end" font-size="9" fill="var(--fpt-text-muted)">${val >= 1000 ? Math.round(val/1000)+'к' : val}</text>
                <line x1="${PAD.l}" y1="${y}" x2="${W - PAD.r}" y2="${y}" stroke="var(--fpt-border)" stroke-width="1"/>
            `;
        }

        // Summary
        const totalRevenue = orders.reduce((s, o) => s + (o.price || 0), 0);
        const totalCount   = orders.length;
        const avgRevenue   = totalCount > 0 ? totalRevenue / totalCount : 0;

        container.innerHTML = `
            <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:10px;">
                <span style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:var(--fpt-text-muted);">
                    Продажи (последние ${period} дней)
                </span>
                <span style="font-size:12px;color:var(--fpt-text);font-weight:600;">
                    ${Math.round(totalRevenue).toLocaleString('ru-RU')} ₽ · ${totalCount} заказов
                </span>
            </div>
            <svg width="100%" height="${H}" viewBox="0 0 ${W} ${H}" style="display:block;overflow:visible;">
                ${yLabels}
                <line x1="${PAD.l}" y1="${PAD.t}" x2="${PAD.l}" y2="${PAD.t + chartH}" stroke="var(--fpt-border)" stroke-width="1"/>
                ${bars}
                ${xLabels}
            </svg>
            <div style="display:flex;gap:20px;margin-top:10px;font-size:11px;color:var(--fpt-text-muted);">
                <span>Ср. чек: <strong style="color:var(--fpt-text);">${Math.round(avgRevenue)} ₽</strong></span>
                <span>Лучший день: <strong style="color:var(--fpt-text);">${Math.round(maxRevenue)} ₽</strong></span>
                <span>Пик: <strong style="color:var(--fpt-text);">${maxCount} заказов</strong></span>
            </div>
        `;
    });
}

function initSalesChart() {
    // Add chart container to the sales statistics section
    const salesSection = document.querySelector('.sales-statistics, #fp-tools-sales-block');
    if (!salesSection || document.getElementById('fp-sales-chart-wrapper')) return;

    const wrapper = document.createElement('div');
    wrapper.id = 'fp-sales-chart-wrapper';
    wrapper.style.cssText = `
        background:var(--fpt-surface);border:1px solid var(--fpt-border);border-radius:8px;
        padding:14px;margin-top:12px;
    `;

    // Period selector
    const periodBar = document.createElement('div');
    periodBar.style.cssText = 'display:flex;gap:6px;margin-bottom:12px;';
    [7, 14, 30, 90].forEach(days => {
        const btn = document.createElement('button');
        btn.className = 'btn btn-default';
        btn.style.cssText = 'padding:3px 8px;font-size:10px;font-weight:700;';
        btn.textContent = days === 7 ? '7 дней' : days === 14 ? '2 нед.' : days === 30 ? '30 дней' : '3 мес.';
        btn.addEventListener('click', () => {
            periodBar.querySelectorAll('button').forEach(b => { b.style.background=''; b.style.color=''; });
            btn.style.background = 'var(--fpt-accent-soft)'; btn.style.color = 'var(--fpt-accent)';
            chrome.storage.local.set({ fpToolsSalesChartPeriod: days });
            renderSalesChart('fp-sales-chart-area');
        });
        if (days === 30) { btn.style.background = 'var(--fpt-accent-soft)'; btn.style.color = 'var(--fpt-accent)'; }
        periodBar.appendChild(btn);
    });

    const chartArea = document.createElement('div');
    chartArea.id = 'fp-sales-chart-area';

    wrapper.appendChild(periodBar);
    wrapper.appendChild(chartArea);
    salesSection.appendChild(wrapper);

    renderSalesChart('fp-sales-chart-area');
}
