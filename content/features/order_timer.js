// content/features/order_timer.js
// Shows a countdown timer on orders page for how long the buyer has to confirm
// and highlights orders that are about to expire.

(function () {
    'use strict';

    const FP_CONFIRM_HOURS = 72; // FunPay gives 72h to confirm after completion

    function parseDateFromRow(row) {
        const dateEl = row.querySelector('.tc-date-time');
        if (!dateEl) return null;
        const text = dateEl.textContent.trim();
        // Already parsed in offscreen - here we parse from display text
        const now = new Date();
        // "сегодня, HH:MM"
        let m = text.match(/сегодня,\s*(\d{1,2}):(\d{2})/i);
        if (m) {
            const d = new Date(now);
            d.setHours(parseInt(m[1]), parseInt(m[2]), 0, 0);
            return d;
        }
        // "вчера, HH:MM"
        m = text.match(/вчера,\s*(\d{1,2}):(\d{2})/i);
        if (m) {
            const d = new Date(now - 86400000);
            d.setHours(parseInt(m[1]), parseInt(m[2]), 0, 0);
            return d;
        }
        // "DD месяц, HH:MM" or "DD месяц YYYY, HH:MM"
        const RU_MONTHS = ['января','февраля','марта','апреля','мая','июня','июля','августа','сентября','октября','ноября','декабря'];
        m = text.match(/(\d{1,2})\s+(\S+?)(?:\s+(\d{4}))?,\s*(\d{1,2}):(\d{2})/i);
        if (m) {
            const day = parseInt(m[1]);
            const monthIdx = RU_MONTHS.findIndex(mn => m[2].toLowerCase().startsWith(mn));
            const year = m[3] ? parseInt(m[3]) : now.getFullYear();
            const hr = parseInt(m[4]), min = parseInt(m[5]);
            if (monthIdx !== -1) return new Date(year, monthIdx, day, hr, min);
        }
        return null;
    }

    function formatCountdown(ms) {
        if (ms <= 0) return '⌛ истекло';
        const h = Math.floor(ms / 3600000);
        const m = Math.floor((ms % 3600000) / 60000);
        if (h >= 24) return `${Math.floor(h/24)}д ${h%24}ч`;
        if (h > 0) return `${h}ч ${m}м`;
        return `${m} мин`;
    }

    function attachTimers() {
        // Only on pages with orders in "paid" (info) status = awaiting confirmation
        document.querySelectorAll('a.tc-item.info').forEach(row => {
            if (row.querySelector('.fp-order-timer')) return;

            const orderDate = parseDateFromRow(row);
            if (!orderDate) return;

            const expiresAt = new Date(orderDate.getTime() + FP_CONFIRM_HOURS * 3600000);
            const msLeft = expiresAt - Date.now();

            const timerEl = document.createElement('div');
            timerEl.className = 'fp-order-timer';

            const update = () => {
                const left = expiresAt - Date.now();
                timerEl.textContent = left > 0 ? `⏱ ${formatCountdown(left)}` : '⌛ Истекает';
                timerEl.classList.toggle('fp-order-timer-urgent', left < 6 * 3600000 && left > 0);
                timerEl.classList.toggle('fp-order-timer-expired', left <= 0);
            };

            update();
            const iv = setInterval(update, 60000);

            // Clean up when row removed
            new MutationObserver((_, obs) => {
                if (!document.body.contains(row)) { clearInterval(iv); obs.disconnect(); }
            }).observe(document.body, { childList: true, subtree: true });

            const dateEl = row.querySelector('.tc-date');
            if (dateEl) dateEl.appendChild(timerEl);
        });
    }

    function init() {
        const isOrdersPage = window.location.pathname.includes('/orders') ||
            window.location.pathname.includes('/orders/trade');
        if (!isOrdersPage) return;

        attachTimers();
        new MutationObserver(attachTimers)
            .observe(document.getElementById('content') || document.body, { childList: true, subtree: true });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
