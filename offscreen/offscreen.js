// offscreen/offscreen.js

// --- КОД ДЛЯ СТАТИСТИКИ ---

const RUSSIAN_MONTHS = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"];

function parseFunPayDate(dateString) {
    const now = new Date();
    let year = now.getFullYear();
    const normalizedDate = dateString.trim().toLowerCase().replace(/\s+/g, ' ');
    let day, monthIndex, hours, minutes;
    let match = normalizedDate.match(/(\d{1,2})\s(.+?)\s(\d{4}),\s(\d{1,2}):(\d{2})/);
    if (match) {
        day = parseInt(match[1], 10);
        monthIndex = RUSSIAN_MONTHS.indexOf(match[2]);
        year = parseInt(match[3], 10);
        hours = parseInt(match[4], 10);
        minutes = parseInt(match[5], 10);
    } else {
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
            return Date.now();
        }
    }
    if (monthIndex === -1) {
        console.warn("Не удалось распознать месяц:", dateString);
        return Date.now();
    }
    return new Date(Date.UTC(year, monthIndex, day, hours, minutes)).getTime();
}

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
                // 2.9: detect payment type (deal/safe = сделка, regular)
                const isDeal = row.classList.contains("deal") || !!row.querySelector(".deal-icon, .tc-deal");
                const isPaid = row.classList.contains("info");
                const paymentType = isDeal ? "deal" : "regular";
                const buyerEl = row.querySelector(".media-user-name span");
                const buyerUsername = buyerEl?.textContent.trim() || "";
                const buyerHref = buyerEl?.getAttribute("data-href")?.split("/");
                const buyerId = buyerHref ? parseInt(buyerHref[buyerHref.length - 2] || "0", 10) : 0;
                const orderDateText = row.querySelector(".tc-date-time")?.textContent.trim() || "";
                const orderDate = parseFunPayDate(orderDateText);
                orders.push({ orderId, description, subcategoryName, price, currency, buyerUsername, buyerId, orderStatus, orderDate, orderDateText, paymentType });
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

function parseLotEditPage(html) {
    try {
        const doc = new DOMParser().parseFromString(html, 'text/html');
        const form = doc.querySelector('form.form-offer-editor');
        if (!form) {
            throw new Error('Форма редактирования лота не найдена на странице.');
        }

        const formData = new FormData(form);
        const dataObject = {};
        
        for (const [key, value] of formData.entries()) {
            dataObject[key] = value;
        }

        // keep csrf_token for saving; remove only location
        delete dataObject.location;

        return dataObject;
    } catch (e) {
        console.error("FP Tools Offscreen: Error in parseLotEditPage", e);
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
            const categoryName = categoryLink?.textContent.trim() || "Без категории";
            const nodeIdMatch = categoryLink?.getAttribute('href')?.match(/\/(?:lots|chips)\/(\d+)/);
            const nodeId = nodeIdMatch ? nodeIdMatch[1] : null;

            if (!nodeId) return;

            const title = row.querySelector(".tc-desc-text")?.textContent?.trim() || "Без названия";
            const idMatch = row.getAttribute('href')?.match(/(?:offer=|id=)(\d+)/);
            const id = idMatch ? idMatch[1] : null;

            if (id) {
                allLots.push({ id, title, nodeId, categoryName });
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

// --- ИСПРАВЛЕННАЯ ФУНКЦИЯ ---
function parseUserCategories(html) {
    try {
        const doc = new DOMParser().parseFromString(html, 'text/html');
        const categories = [];
        const offerBlocks = doc.querySelectorAll('.offer');
        
        offerBlocks.forEach(block => {
            // Ищем правильную ссылку для поднятия (`.../trade`)
            const managementLink = block.querySelector('a.btn-plus');
            // Ищем ссылку с названием для отображения
            const titleLink = block.querySelector('.offer-list-title h3 a');

            if (managementLink && titleLink) {
                const name = titleLink.textContent.trim();
                const url = new URL(managementLink.href, 'https://funpay.com/');
                
                const lotItems = block.querySelectorAll('.tc-item');
                const publicUrl = new URL(titleLink.href, 'https://funpay.com/');
                const nodeIdMatch = publicUrl.pathname.match(/\/lots\/(\d+)/);

                const lots = Array.from(lotItems).map(item => {
                    const idMatch = item.getAttribute('href')?.match(/id=(\d+)/);
                    // FIX: track auto-delivery per individual lot, not just category-wide
                    const lotHasAutoDelivery = !!item.querySelector('i.auto-dlv-icon, .sc-auto-delivery, [class*="auto-dlv"]');
                    return {
                        id: idMatch ? idMatch[1] : null,
                        nodeId: nodeIdMatch ? nodeIdMatch[1] : null,
                        title: item.querySelector('.tc-desc-text')?.textContent.trim() || 'Без названия',
                        hasAutoDelivery: lotHasAutoDelivery
                    };
                }).filter(lot => lot.id && lot.nodeId);

                // FIX: category has auto-delivery only if AT LEAST ONE lot has it
                const categoryHasAutoDelivery = lots.some(l => l.hasAutoDelivery);
                
                categories.push({ id: url.pathname, name: name, lots: lots, hasAutoDelivery: categoryHasAutoDelivery });
            }
        });
        return categories;
    } catch (e) {
        console.error("FP Tools Offscreen: Error in parseUserCategories", e);
        return [];
    }
}
// --- КОНЕЦ ИСПРАВЛЕНИЯ ---

// FIX 2.8: returns { stars, lotName } so auto-replies can use {lotname} variable
function parseOrderPageForReview(html) {
    try {
        const doc = new DOMParser().parseFromString(html, 'text/html');

        // --- Detect if this review was written by the current user (skip own reviews) ---
        // FIX: Use more reliable selector — the profile link in the order page header
        const reviewAuthorLink = doc.querySelector('.review-item-head .media-user-name a');
        const reviewAuthorId = reviewAuthorLink
            ? reviewAuthorLink.href.split('/').filter(Boolean).pop()
            : null;

        // Current user's profile link appears in the page header as a dropdown trigger
        const currentUserLink = doc.querySelector('a.user-link-dropdown, a[href*="/users/"].user-link-dropdown');
        // Fallback: any link with /users/ in the top nav
        const currentUserFallback = doc.querySelector('.navbar-right a[href*="/users/"]');
        const currentUserHref = (currentUserLink || currentUserFallback)?.href || '';
        const currentUserId = currentUserHref.split('/').filter(Boolean).pop();

        if (reviewAuthorId && currentUserId && reviewAuthorId === currentUserId) {
            return null; // Own review, skip
        }

        // --- Stars ---
        const ratingDiv = doc.querySelector('.order-review .rating > div');
        if (!ratingDiv) return null;
        const ratingClass = Array.from(ratingDiv.classList).find(c => /^rating\d+$/.test(c));
        if (!ratingClass) return null;
        const stars = parseInt(ratingClass.replace('rating', ''), 10);
        if (isNaN(stars)) return null;

        // --- Lot name (NEW in 2.8) ---
        // Try different selectors that FunPay uses for lot/product name on order page
        let lotName = '';
        const shortDescHeader = Array.from(doc.querySelectorAll('.param-item h5'))
            .find(h => h.textContent.trim() === 'Краткое описание');
        if (shortDescHeader) {
            lotName = shortDescHeader.nextElementSibling?.textContent.trim() || '';
        }
        if (!lotName) {
            lotName = doc.querySelector('.order-desc-title, .tc-desc-text, .order-title')?.textContent.trim() || '';
        }

        return { stars, lotName };
    } catch (e) {
        console.error("FP Tools Offscreen: Error in parseOrderPageForReview", e);
        return null;
    }
}



// 2.9: Parse unconfirmed (pending) balance from the header/balance page
function parseUnconfirmedBalance(html) {
    try {
        const doc = new DOMParser().parseFromString(html, 'text/html');
        // Unconfirmed orders: status "info" (paid but not yet confirmed)
        const pendingRows = doc.querySelectorAll('a.tc-item.info');
        let total = 0;
        let currency = 'RUB';
        pendingRows.forEach(row => {
            const priceText = row.querySelector('.tc-price')?.textContent || '';
            const price = parseFloat(priceText.replace(/\s/g, '').replace(',', '.')) || 0;
            total += price;
            if (priceText.includes('$')) currency = 'USD';
            else if (priceText.includes('€')) currency = 'EUR';
        });
        return { total: Math.round(total * 100) / 100, currency, count: pendingRows.length };
    } catch (e) {
        return { total: 0, currency: 'RUB', count: 0 };
    }
}

// 2.9: Parse buyer purchase history from trade page
// buyerUsername is passed for safety but server already pre-filters by username
function parseBuyerHistory(html, buyerUsername) {
    // Safety net: never return results if buyer is unknown
    if (!buyerUsername) return [];
    try {
        const doc = new DOMParser().parseFromString(html, 'text/html');
        const orders = [];
        doc.querySelectorAll('a.tc-item').forEach(row => {
            // Server pre-filters by username — just parse all returned rows
            const orderId = row.querySelector('.tc-order')?.textContent?.trim().replace(/^#/, '');
            const desc    = row.querySelector('.order-desc div, .tc-desc-text')?.textContent.trim() || '';
            const price   = row.querySelector('.tc-price')?.textContent.trim() || '';
            const date    = row.querySelector('.tc-date-time')?.textContent.trim() || '';
            if (orderId) orders.push({ orderId, desc, price, date });
        });
        return orders.slice(0, 30);
    } catch (e) {
        return [];
    }
}

// 3.0: Parse order page for auto-delivery — get secrets, lotId, chatId
function parseOrderPageForDelivery(html) {
    try {
        const doc = new DOMParser().parseFromString(html, 'text/html');

        // Get secrets (the goods that were delivered / in order-secrets-box)
        const secretsBox = doc.querySelector('.order-secrets-box, .order-secrets-list');
        const secrets = secretsBox?.textContent.trim() || null;

        // Get lot ID from the order page
        const lotLink = doc.querySelector('.order-desc a[href*="lots/offer"], a[href*="id="]');
        const lotIdMatch = lotLink?.getAttribute('href')?.match(/id=(\d+)/);
        const lotId = lotIdMatch ? lotIdMatch[1] : null;

        // Node ID from lot link
        const nodeIdMatch = lotLink?.getAttribute('href')?.match(/node=(\d+)/);
        const nodeId = nodeIdMatch ? nodeIdMatch[1] : null;

        // Buyer chat ID
        const chatLink = doc.querySelector('.order-user a[href*="/chat/?node="], a[href*="chat/?node="]');
        const chatIdMatch = chatLink?.getAttribute('href')?.match(/node=(\d+)/);
        const buyerChatId = chatIdMatch ? chatIdMatch[1] : null;

        // Buyer username
        const buyerLink = doc.querySelector('.media-user-name a[href*="/users/"]');
        const buyerUsername = buyerLink?.textContent.trim() || null;

        // Short description of lot (for variables)
        const shortDescHeader = Array.from(doc.querySelectorAll('.param-item h5'))
            .find(h => h.textContent.trim() === 'Краткое описание');
        const lotName = shortDescHeader?.nextElementSibling?.textContent.trim() || '';

        // Game / category
        const categoryEl = doc.querySelector('.order-category, .order-subcategory');
        const category = categoryEl?.textContent.trim() || '';

        return { secrets, lotId, nodeId, buyerChatId, buyerUsername, lotName, category };
    } catch (e) {
        console.error('FP Tools Offscreen: Error in parseOrderPageForDelivery', e);
        return null;
    }
}


function parseSupportTickets(html) {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const tickets = [];
    doc.querySelectorAll('a.ticket-item').forEach(item => {
        const href = item.getAttribute('href') || '';
        const id = href.replace(/\/$/, '').split('/').pop();
        const title = (item.querySelector('.col-12.mt-2') || item.querySelector('.col-12'))?.textContent.trim() || 'Заявка';
        const date = item.querySelector('.text-secondary')?.textContent.trim() || '';
        const badge = item.querySelector('.badge');
        const status = !badge ? 'Неизвестен'
            : badge.classList.contains('bg-danger') ? 'Открыт'
            : badge.classList.contains('bg-warning') ? 'В ожидании'
            : badge.classList.contains('bg-success') ? 'Решена'
            : badge.classList.contains('bg-secondary') ? 'Закрыт'
            : badge.textContent.trim() || 'Неизвестен';
        // Используем числовой ID как ключ сортировки (больший ID = новее)
        if (id && /^\d+$/.test(id)) tickets.push({ id, title, status, lastUpdate: date, sortKey: parseInt(id, 10) });
    });
    return tickets;
}

function parseSupportCategories(html) {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const categories = [];
    doc.querySelectorAll('select#ticket_select_form option').forEach(opt => {
        const v = opt.value, t = opt.textContent.trim();
        if (v && !t.includes('Выберите')) categories.push({ id: v, name: t });
    });
    return categories;
}

function parseSupportFields(html) {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const fields = [];
    const seenNames = new Set();

    doc.querySelectorAll("input[name^='ticket[fields]'], select[name^='ticket[fields]'], textarea[name^='ticket[comment]']").forEach(el => {
        const fname = el.getAttribute('name') || '';
        if (!fname || fname.includes('_token') || fname.includes('attachments')) return;

        const tag = el.tagName.toLowerCase();
        const inputType = el.getAttribute('type') || '';

        // --- radio: группируем все radios с одним name через fieldset ---
        if (inputType === 'radio') {
            if (seenNames.has(fname)) return;
            seenNames.add(fname);
            const fieldset = el.closest('fieldset');
            const container = fieldset || el.closest('.mb-3');
            if (!container) return;
            const legend = container.querySelector('legend') || container.querySelector('label');
            const labelText = (legend?.textContent || '').replace('*','').trim();
            const isRequired = !!(legend?.classList.contains('required') || labelText.includes('*'));
            const condition = container.getAttribute('data-condition') || null;
            const allRadios = container.querySelectorAll(`input[name='${CSS.escape(fname)}']`);
            const options = [];
            allRadios.forEach(radio => {
                const lbl = container.querySelector(`label[for='${radio.id}']`);
                const txt = (lbl?.textContent || '').replace('*','').trim();
                const val = radio.getAttribute('value') || '';
                if (val && txt) options.push({ value: val, text: txt });
            });
            fields.push({ id: fname, name: labelText || fname, type: 'radio', required: isRequired, options, condition, defaultValue: '' });
            return;
        }

        if (seenNames.has(fname)) return;
        seenNames.add(fname);

        const container = el.closest('.mb-3') || el.closest('fieldset');
        if (!container) return;
        const labelEl = container.querySelector(`label[for='${el.id}']`) || container.querySelector('label') || container.querySelector('legend');
        const labelText = (labelEl?.textContent || '').replace('*','').trim();
        const isRequired = !!(labelEl?.classList.contains('required') || labelText.includes('*'));
        const condition = container.getAttribute('data-condition') || null;

        let type = tag === 'textarea' ? 'textarea' : tag === 'select' ? 'select' : 'text';
        const options = [];
        if (type === 'select') {
            el.querySelectorAll('option').forEach(opt => {
                if (opt.value && !opt.textContent.includes('Выберите')) options.push({ value: opt.value, text: opt.textContent.trim() });
            });
        }

        // Пропускаем textarea с data-controller только если это НЕ поле комментария
        if (type === 'textarea' && el.hasAttribute('data-controller') && !fname.includes('comment')) return;

        const name = (fname.includes('comment') && type === 'textarea') ? 'Сообщение' : (labelText || fname);
        fields.push({ id: fname, name, type, required: isRequired, options, condition, defaultValue: '' });
    });
    return fields;
}

function parseSupportFormToken(html) {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    return doc.querySelector("input[name='ticket[_token]']")?.value || null;
}

function parseOrdersPage(html) {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const ids = new Set();
    doc.querySelectorAll('a[href*="/orders/"]').forEach(a => {
        const m = (a.getAttribute('href') || '').match(/\/orders\/([A-Z0-9]{8})/);
        if (m) ids.add(m[1]);
    });
    return [...ids];
}


function parseTicketDetails(html) {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const title = doc.querySelector('.breadcrumb-item.active')?.textContent.replace(/Заявка #\d+/, '').trim() || '';
    const badge = doc.querySelector('.ticket-info-panel .badge');
    const status = !badge ? (doc.querySelector('.btn-outline-secondary') ? 'Открыт' : 'Закрыт')
        : badge.classList.contains('bg-danger') ? 'Открыт'
        : badge.classList.contains('bg-warning') ? 'В ожидании'
        : badge.classList.contains('bg-success') ? 'Решена' : 'Закрыт';

    const comments = [];
    doc.querySelectorAll('.ticket-comment').forEach(c => {
        const author = c.querySelector('.username')?.textContent.trim() || 'Неизвестно';
        const text = c.querySelector('.comment-text')?.innerHTML || '';
        const ts = (c.querySelector('.comment-username span:nth-child(2)') || c.querySelector('.d-sm-none span:nth-child(2)'))?.textContent.trim() || '';
        const avatarStyle = c.querySelector('.comment-avatar')?.getAttribute('style') || '';
        const avatarMatch = avatarStyle.match(/url\(['"']?([^'"')]+)['"']?\)/);
        const avatarUrl = avatarMatch ? (avatarMatch[1].startsWith('http') ? avatarMatch[1] : 'https://funpay.com' + avatarMatch[1]) : '';
        comments.push({ author, text, timestamp: ts, avatarUrl });
    });

    const token = doc.querySelector("input[name='add_comment[_token]']")?.value || '';
    const canReply = !!doc.querySelector("textarea[name*='comment'], form[action*='comment'] textarea");
    return { title, status, comments, token, canReply };
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.target !== 'offscreen') return true;
    
    switch (message.action) {
        case 'parseSalesPage':
            sendResponse(parseSalesPage(message.html));
            break;
        case 'parseLotEditPage':
            sendResponse(parseLotEditPage(message.html));
            break;
        case 'parseChatList':
            sendResponse(parseChatList(message.html));
            break;
        case 'parseUserLotsList':
            sendResponse(parseUserLotsList(message.html));
            break;
        case 'parseGameSearchResults':
            sendResponse(parseGameSearchResults(message.html));
            break;
        case 'parseCategoryPage':
            sendResponse(parseCategoryPage(message.html));
            break;
        case 'parseLotListPage':
            sendResponse(parseLotListPage(message.html));
            break;
        case 'parseUserCategories':
            sendResponse(parseUserCategories(message.html));
            break;
        case 'parseOrderPageForReview':
            sendResponse(parseOrderPageForReview(message.html));
            break;
        case 'parseUnconfirmedBalance':
            sendResponse(parseUnconfirmedBalance(message.html));
            break;
        case 'parseBuyerHistory':
            sendResponse(parseBuyerHistory(message.html, message.buyerUserId));
            break;
        case 'parseOrderPageForDelivery':
            sendResponse(parseOrderPageForDelivery(message.html));
            break;
        case 'parseSupportTickets':
            sendResponse(parseSupportTickets(message.html));
            break;
        case 'parseSupportCategories':
            sendResponse(parseSupportCategories(message.html));
            break;
        case 'parseSupportFields':
            sendResponse(parseSupportFields(message.html));
            break;
        case 'parseSupportFormToken':
            sendResponse(parseSupportFormToken(message.html));
            break;
        case 'parseOrdersPage':
            sendResponse(parseOrdersPage(message.html));
            break;
        case 'parseTicketDetails':
            sendResponse(parseTicketDetails(message.html));
            break;
    }

    return true; 
});