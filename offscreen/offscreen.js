// offscreen/offscreen.js

// ... (существующий код в файле, если он есть, оставьте)

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
    if (message.target !== 'offscreen') return true;

    if (message.action === 'parseSalesPage') {
        // Эта функция у вас могла быть, если нет - добавьте ее из MergedFiles.txt
        // sendResponse(parseSalesPage(message.html)); 
    } else if (message.action === 'parseOrderPageForReview') {
        sendResponse(parseOrderPageForReview(message.html));
    } else if (message.action === 'parseChatList') {
        sendResponse(parseChatList(message.html));
    } else if (message.action === 'parseUserLotsList') {
        sendResponse(parseUserLotsList(message.html));
    }

    return true; 
});