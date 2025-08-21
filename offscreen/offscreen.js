// offscreen/offscreen.js

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

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.target !== 'offscreen') return true;

    if (message.action === 'parseSalesPage') {
        // ...
    } else if (message.action === 'parseOrderPageForReview') {
        sendResponse(parseOrderPageForReview(message.html));
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
    }

    return true; 
});