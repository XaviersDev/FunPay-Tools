// offscreen/offscreen.js

// --- НОВЫЙ КОД ДЛЯ СТАТИСТИКИ, СКОПИРОВАННЫЙ И АДАПТИРОВАННЫЙ ---

const RUSSIAN_MONTHS = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"];

/**
 * Преобразует текстовую дату с FunPay в миллисекунды.
 * @param {string} dateString - Дата в формате "12 мая, 14:30" или "12 мая 2024, 14:30".
 * @returns {number} - Дата в миллисекундах (Unix timestamp).
 */
function parseFunPayDate(dateString) {
    const now = new Date();
    let year = now.getFullYear();
    
    // Удаляем лишние пробелы и приводим к нижнему регистру
    const normalizedDate = dateString.trim().toLowerCase().replace(/\s+/g, ' ');

    let day, monthIndex, hours, minutes;

    // Пробуем парсить формат "12 мая 2024, 14:30"
    let match = normalizedDate.match(/(\d{1,2})\s(.+?)\s(\d{4}),\s(\d{1,2}):(\d{2})/);
    if (match) {
        day = parseInt(match[1], 10);
        monthIndex = RUSSIAN_MONTHS.indexOf(match[2]);
        year = parseInt(match[3], 10);
        hours = parseInt(match[4], 10);
        minutes = parseInt(match[5], 10);
    } else {
        // Пробуем парсить формат "12 мая, 14:30"
        match = normalizedDate.match(/(\d{1,2})\s(.+?),\s(\d{1,2}):(\d{2})/);
        if (match) {
            day = parseInt(match[1], 10);
            monthIndex = RUSSIAN_MONTHS.indexOf(match[2]);
            hours = parseInt(match[3], 10);
            minutes = parseInt(match[4], 10);
        } else if (normalizedDate.startsWith("сегодня,")) {
            match = normalizedDate.match(/сегодня,\s(\d{1,2}):(\d{2})/);
            day = now.getDate();
            monthIndex = now.getMonth();
            hours = parseInt(match[1], 10);
            minutes = parseInt(match[2], 10);
        } else if (normalizedDate.startsWith("вчера,")) {
             match = normalizedDate.match(/вчера,\s(\d{1,2}):(\d{2})/);
             const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
             day = yesterday.getDate();
             monthIndex = yesterday.getMonth();
             year = yesterday.getFullYear();
             hours = parseInt(match[1], 10);
             minutes = parseInt(match[2], 10);
        } else {
            console.warn("Неизвестный формат даты:", dateString);
            return Date.now(); // Возвращаем текущую дату как fallback
        }
    }

    if (monthIndex === -1) {
        console.warn("Не удалось распознать месяц:", dateString);
        return Date.now();
    }
    
    // Создаем дату по UTC, чтобы избежать проблем с часовыми поясами
    return new Date(Date.UTC(year, monthIndex, day, hours, minutes)).getTime();
}


/**
 * Парсит HTML-страницу с заказами и извлекает структурированные данные.
 * @param {string} html - HTML-код страницы.
 * @returns {{nextOrderId: string|null, orders: Array<Object>}}
 */
function parseSalesPage(html) {
    try {
        const doc = new DOMParser().parseFromString(html, "text/html");
        const continueInput = doc.querySelector("input[type='hidden'][name='continue']");
        const nextOrderId = continueInput ? continueInput.value : null;

        const orderRows = doc.querySelectorAll("a.tc-item");
        if (!orderRows || orderRows.length === 0) {
            return { nextOrderId: null, orders: [] };
        }

        const orders = [];
        orderRows.forEach(row => {
            try {
                const classList = row.classList;
                let orderStatus;
                if (classList.contains("warning")) orderStatus = "refunded";
                else if (classList.contains("info")) orderStatus = "paid";
                else orderStatus = "closed";

                const orderId = row.querySelector(".tc-order")?.textContent?.substring(1);
                if (!orderId) return;

                const description = row.querySelector(".order-desc div")?.textContent.trim() || "";
                const subcategoryName = row.querySelector(".text-muted")?.textContent.trim() || "";
                
                const priceText = row.querySelector(".tc-price")?.textContent || "";
                const priceRaw = priceText.replace(/\s/g, "");
                const price = parseFloat(priceRaw) || 0;

                let currency = "UNKNOWN";
                if (priceText.includes("₽")) currency = "RUB";
                else if (priceText.includes("$")) currency = "USD";
                else if (priceText.includes("€")) currency = "EUR";

                const buyerEl = row.querySelector(".media-user-name span");
                const buyerUsername = buyerEl?.textContent.trim() || "";
                const buyerHref = buyerEl?.getAttribute("data-href")?.split("/");
                const buyerId = buyerHref ? parseInt(buyerHref[buyerHref.length - 2] || "0", 10) : 0;
                
                const orderDateText = row.querySelector(".tc-date-time")?.textContent.trim() || "";
                const orderDate = parseFunPayDate(orderDateText);

                orders.push({ orderId, description, subcategoryName, price, currency, buyerUsername, buyerId, orderStatus, orderDate, orderDateText });

            } catch (e) {
                console.error("FP Tools Offscreen: Ошибка при парсинге одного заказа:", e, row);
            }
        });

        return { nextOrderId, orders };

    } catch (e) {
        console.error("FP Tools Offscreen: Глобальная ошибка парсинга страницы продаж:", e);
        return { nextOrderId: null, orders: [] };
    }
}

// --- КОНЕЦ НОВОГО КОДА ДЛЯ СТАТИСТИКИ ---


function parseChatList(html) {
    try {
        const doc = new DOMParser().parseFromString(html, "text/html");
        const chatItems = doc.querySelectorAll('a.contact-item');
        return Array.from(chatItems).map(item => {
            const nameEl = item.querySelector('.media-user-name');
            const avatarEl = item.querySelector('.avatar-photo');
            return {
                chatId: item.dataset.id,
                chatName: nameEl ? nameEl.textContent.trim() : 'Unknown',
                msgId: item.dataset.nodeMsg,
                messageText: item.querySelector('.contact-item-message')?.textContent.trim() || '',
                isUnread: item.classList.contains('unread'),
                avatarUrl: avatarEl ? avatarEl.style.backgroundImage.slice(5, -2) : null
            };
        });
    } catch (e) {
        console.error("FP Tools Offscreen: Error parsing chat list.", e);
        return [];
    }
}

function parseUserLotsList(html) {
    try {
        const doc = new DOMParser().parseFromString(html, "text/html");
        const allLots = [];
        const lotRows = doc.querySelectorAll("a.tc-item");

        lotRows.forEach(row => {
            const offerBlock = row.closest('.offer');
            if (!offerBlock) return;

            const categoryLink = offerBlock.querySelector('.offer-list-title a');
            const nodeIdMatch = categoryLink?.getAttribute('href')?.match(/\/(?:lots|chips)\/(\d+)/);
            const nodeId = nodeIdMatch ? nodeIdMatch[1] : null;

            if (!nodeId) return;

            const title = row.querySelector(".tc-desc-text")?.textContent?.trim() || "Без названия";
            
            const idMatch = row.getAttribute('href')?.match(/(?:offer=|id=)(\d+)/);
            const id = idMatch ? idMatch[1] : null;

            if (id) {
                allLots.push({ id, title, nodeId });
            }
        });
        
        return allLots;
    } catch (e) {
        console.error("FP Tools Offscreen: Error in parseUserLotsList", e);
        return [];
    }
}

function parseGameSearchResults(html) {
    try {
        const doc = new DOMParser().parseFromString(html, 'text/html');
        const items = doc.querySelectorAll('.promo-game-item');
        return Array.from(items).map(item => {
            const link = item.querySelector('.game-title a');
            const img = item.querySelector('img');
            return {
                name: link ? link.textContent.trim() : 'Unknown',
                url: link ? link.href : '#',
                img: img ? img.src : ''
            };
        });
    } catch (e) {
        return [];
    }
}

function parseCategoryPage(html) {
    try {
        const doc = new DOMParser().parseFromString(html, 'text/html');
        const items = doc.querySelectorAll('.counter-item');
        return Array.from(items).map(item => {
            const url = item.href;
            const nodeIdMatch = url.match(/\/lots\/(\d+)/);
            return {
                name: item.querySelector('.counter-param')?.textContent.trim() || 'Unknown',
                count: item.querySelector('.counter-value')?.textContent.trim() || '0',
                url: url,
                nodeId: nodeIdMatch ? nodeIdMatch[1] : null
            };
        });
    } catch (e) {
        return [];
    }
}

function parseLotListPage(html) {
    try {
        const doc = new DOMParser().parseFromString(html, 'text/html');
        const items = doc.querySelectorAll('a.tc-item');
        return Array.from(items).map(item => {
            const offerIdMatch = item.getAttribute('href')?.match(/id=(\d+)/);
            return {
                offerId: offerIdMatch ? offerIdMatch[1] : null,
                description: item.querySelector('.tc-desc-text')?.textContent.trim() || 'No description',
                seller: item.querySelector('.media-user-name span')?.textContent.trim() || 'Unknown',
                price: item.querySelector('.tc-price div')?.textContent.trim() || 'N/A'
            };
        });
    } catch (e) {
        return [];
    }
}

function parseUserCategories(html) {
    try {
        const doc = new DOMParser().parseFromString(html, 'text/html');
        const categories = [];
        const offerBlocks = doc.querySelectorAll('.offer');
        offerBlocks.forEach(block => {
            const titleLink = block.querySelector('.offer-list-title h3 a');
            if (titleLink) {
                const name = titleLink.textContent.trim();
                const url = new URL(titleLink.href, 'https://funpay.com/');
                categories.push({ id: url.pathname, name: name });
            }
        });
        return categories;
    } catch (e) {
        console.error("FP Tools Offscreen: Error in parseUserCategories", e);
        return [];
    }
}


chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.target !== 'offscreen') return true;

    // --- ДОБАВЛЕН НОВЫЙ ОБРАБОТЧИК ---
    if (message.action === 'parseSalesPage') {
        sendResponse(parseSalesPage(message.html));
    } else if (message.action === 'parseChatList') {
        sendResponse(parseChatList(message.html));
    } else if (message.action === 'parseUserLotsList') {
        sendResponse(parseUserLotsList(message.html));
    } else if (message.action === 'parseGameSearchResults') {
        sendResponse(parseGameSearchResults(message.html));
    } else if (message.action === 'parseCategoryPage') {
        sendResponse(parseCategoryPage(message.html));
    } else if (message.action === 'parseLotListPage') {
        sendResponse(parseLotListPage(message.html));
    } else if (message.action === 'parseUserCategories') {
        sendResponse(parseUserCategories(message.html));
    }

    return true; 
});
