const RUSSIAN_MONTHS = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"];

function parseDate(dateString) {
    if (!dateString) return Date.now();
    const now = new Date();
    const currentYear = now.getFullYear();

    if (dateString.startsWith('сегодня') || dateString.startsWith('вчера')) {
        const isToday = dateString.startsWith('сегодня');
        const timePart = dateString.split(', ')[1];
        if (!timePart) return Date.now();
        const [hours, minutes] = timePart.split(':').map(Number);
        const date = new Date();
        if (!isToday) {
            date.setDate(date.getDate() - 1);
        }
        date.setHours(hours, minutes, 0, 0);
        return date.getTime();
    }
    
    const withYearMatch = dateString.match(/(\d{1,2})\s(.+?)\s(\d{4}),\s(\d{1,2}):(\d{2})/);
    if (withYearMatch) {
        const day = parseInt(withYearMatch[1], 10);
        const monthName = withYearMatch[2];
        const monthIndex = RUSSIAN_MONTHS.indexOf(monthName.toLowerCase());
        const year = parseInt(withYearMatch[3], 10);
        const hours = parseInt(withYearMatch[4], 10);
        const minutes = parseInt(withYearMatch[5], 10);
        if (monthIndex > -1) return new Date(year, monthIndex, day, hours, minutes).getTime();
    }

    const withoutYearMatch = dateString.match(/(\d{1,2})\s(.+?),\s(\d{1,2}):(\d{2})/);
    if (withoutYearMatch) {
        const day = parseInt(withoutYearMatch[1], 10);
        const monthName = withoutYearMatch[2];
        const monthIndex = RUSSIAN_MONTHS.indexOf(monthName.toLowerCase());
        const hours = parseInt(withoutYearMatch[3], 10);
        const minutes = parseInt(withoutYearMatch[4], 10);
        if (monthIndex > -1) return new Date(currentYear, monthIndex, day, hours, minutes).getTime();
    }

    console.warn("FP Tools: Unknown date format:", dateString);
    return Date.now();
}

function parseSalesPage(html) {
    try {
        const doc = new DOMParser().parseFromString(html, "text/html");
        const continueInput = doc.querySelector("input[type='hidden'][name='continue']");
        const nextOrderId = continueInput ? continueInput.value : null;
        const orderRows = doc.querySelectorAll("a.tc-item");

        const orders = Array.from(orderRows).map(row => {
            const orderId = row.querySelector(".tc-order")?.textContent?.substring(1);
            if (!orderId) return null;

            let status = "closed";
            if (row.classList.contains("warning")) status = "refunded";
            else if (row.classList.contains("info")) status = "paid";

            const priceText = row.querySelector(".tc-price")?.textContent || "";
            let currency = "UNKNOWN";
            if (priceText.includes("₽")) currency = "RUB";
            else if (priceText.includes("$")) currency = "USD";
            else if (priceText.includes("€")) currency = "EUR";

            const buyerEl = row.querySelector(".media-user-name span");
            const buyerLink = buyerEl?.getAttribute("data-href")?.split("/");

            return {
                orderId,
                description: row.querySelector(".order-desc div")?.textContent || "",
                price: parseFloat(priceText.replace(/\s/g, "")) || 0,
                currency,
                buyerUsername: buyerEl?.textContent || "",
                buyerId: buyerLink ? parseInt(buyerLink[buyerLink.length - 2] || "0", 10) : 0,
                orderStatus: status,
                orderDateText: row.querySelector(".tc-date-time")?.textContent || "",
                orderDate: parseDate(row.querySelector(".tc-date-time")?.textContent),
                subcategoryName: row.querySelector(".text-muted")?.textContent || ""
            };
        }).filter(Boolean); 

        return { nextOrderId, orders };
    } catch (e) {
        console.error("FP Tools: Critical error in parseSalesPage.", e);
        return { nextOrderId: null, orders: [] };
    }
}

function parseOrderPageForReview(html) {
    try {
        const doc = new DOMParser().parseFromString(html, "text/html");
        const reviewBlock = doc.querySelector('.order-review');
        if (!reviewBlock) return null;

        const starRatingDiv = reviewBlock.querySelector('.rating > div');
        const stars = starRatingDiv ? parseInt(starRatingDiv.className.replace('rating', ''), 10) : 0;
        
        const lotNameEl = Array.from(doc.querySelectorAll('.param-item h5')).find(el => el.textContent.includes('Краткое описание'));
        const lotName = lotNameEl ? lotNameEl.nextElementSibling.textContent.trim() : 'лот';

        let sellerName = null;
        const sellerHeader = Array.from(doc.querySelectorAll('.param-item h5')).find(el => el.textContent.trim() === 'Продавец');
        if (sellerHeader) {
            const sellerNameEl = sellerHeader.parentElement.querySelector('.media-user-name a');
            if (sellerNameEl) {
                sellerName = sellerNameEl.textContent.trim();
            }
        }

        return { stars, lotName, sellerName };
    } catch (e) {
        console.error("FP Tools Offscreen: Error parsing order page for review.", e);
        return null;
    }
}

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

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.target !== 'offscreen') return;

    if (message.action === 'parseSalesPage') {
        sendResponse(parseSalesPage(message.html));
    } else if (message.action === 'parseOrderPageForReview') {
        sendResponse(parseOrderPageForReview(message.html));
    } else if (message.action === 'parseChatList') {
        sendResponse(parseChatList(message.html));
    } else if (message.action === 'parseUserLotsList') {
        sendResponse(parseUserLotsList(message.html));
    }

    return true; 
});
