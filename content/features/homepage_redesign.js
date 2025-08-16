function stringToHslColor(str, s = 60, l = 40) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    return `hsl(${hash % 360}, ${s}%, ${l}%)`;
}

function extractGamesFromContainer(container) {
    if (!container) return [];
    const gameItems = container.querySelectorAll('.promo-game-item');
    const data = [];
    gameItems.forEach(item => {
        const titleElement = item.querySelector('.game-title a');
        if (titleElement) {
            const gameName = titleElement.textContent.trim();
            if (data.some(g => g.name === gameName)) return;
            const game = { name: gameName, url: titleElement.href, categories: [] };
            const categoryList = item.querySelector('.list-inline:not(.hidden)');
            if(categoryList) {
                 categoryList.querySelectorAll('li a').forEach(cat => {
                    game.categories.push({ name: cat.textContent.trim(), url: cat.href });
                });
            }
            data.push(game);
        }
    });
    return data;
}

function createGameIcon(game) {
    const link = document.createElement('a');
    link.href = game.url;
    link.className = 'hero-game-icon';
    link.target = '_blank';
    link.title = game.name;
    link.style.animationDelay = `-${(Math.random() * 8).toFixed(2)}s`;
    link.style.animationDuration = `${(Math.random() * 5 + 8).toFixed(2)}s`;
    const firstLetter = game.name.charAt(0).toUpperCase();
    const avatarColor = stringToHslColor(game.name, 70, 60);
    let domain;
    if (game.name.toLowerCase() === 'telegram') {
        domain = 'web.telegram.org';
    } else {
        const cleanGameName = game.name.toLowerCase().replace(/\s+/g, '').replace(/[^a-z0-9-]/g, '');
        domain = `${cleanGameName}.com`;
    }
    const iconUrl = `https://www.google.com/s2/favicons?sz=64&domain=${domain}`;
    link.innerHTML = `
        <div class="fp-fallback-icon" style="background-color: ${avatarColor};">${firstLetter}</div>
        <img class="fp-game-icon" data-src="${iconUrl}" alt="${game.name}" style="display: none;">
    `;
    return link;
}

function createRedesignedUI(allGamesData, yourGamesData) {
    const uiWrapper = document.createElement('div');
    uiWrapper.className = 'redesign-container';
    const heroBlock = document.createElement('div');
    heroBlock.className = 'redesign-hero';
    const heroText = document.createElement('div');
    heroText.className = 'hero-text';
    heroText.innerHTML = `
        <h1>Добро пожаловать на <span>FunPay</span></h1>
        <p>Современный взгляд на биржу игровых ценностей. Легко находите нужные игры и услуги с помощью удобного поиска.</p>`;
    heroBlock.appendChild(heroText);
    if (yourGamesData.length > 0) {
        const heroGamesContainer = document.createElement('div');
        heroGamesContainer.className = 'hero-games-container';
        yourGamesData.forEach(game => {
            const iconElement = createGameIcon(game);
            heroGamesContainer.appendChild(iconElement);
        });
        heroBlock.appendChild(heroGamesContainer);
    }
    const searchHTML = `
        <div class="redesign-search-container">
             <input type="text" id="redesignGameSearchInput" class="redesign-search-input" placeholder="Начните вводить название игры или категории...">
        </div>`;
    const mainTitle = document.createElement('h2');
    mainTitle.className = 'section-title';
    mainTitle.textContent = 'Каталог игр';
    const gameGrid = document.createElement('div');
    gameGrid.className = 'game-grid';
    allGamesData.forEach(game => {
        const card = document.createElement('div');
        card.className = 'game-card';
        const firstLetter = game.name.charAt(0).toUpperCase();
        const avatarColor = stringToHslColor(game.name);
        let domain;
        if (game.name.toLowerCase() === 'telegram') {
            domain = 'web.telegram.org';
        } else {
            const cleanGameName = game.name.toLowerCase().replace(/\s+/g, '').replace(/[^a-z0-9-]/g, '');
            domain = `${cleanGameName}.com`;
        }
        const iconUrl = `https://www.google.com/s2/favicons?sz=64&domain=${domain}`;
        const categoriesHTML = game.categories.map(cat => `<a href="${cat.url}" class="category-tag">${cat.name}</a>`).join('');
        card.innerHTML = `
            <a href="${game.url}" class="game-card-main-link"></a>
            <div class="game-card-header">
                <div class="game-card-avatar">
                    <div class="fp-fallback-icon" style="background-color: ${avatarColor};">${firstLetter}</div>
                    <img class="fp-game-icon" data-src="${iconUrl}" alt="${game.name}" style="display: none;">
                </div>
                <h3 class="game-card-title">${game.name}</h3>
            </div>
            <div class="game-card-categories">${categoriesHTML}</div>
        `;
        gameGrid.appendChild(card);
    });
    uiWrapper.appendChild(heroBlock);
    uiWrapper.insertAdjacentHTML('beforeend', searchHTML);
    uiWrapper.appendChild(mainTitle);
    uiWrapper.appendChild(gameGrid);
    return uiWrapper;
}

function setupLazyLoadObserver() {
    const itemsToLoad = document.querySelectorAll('.game-card, .hero-game-icon');
    if (!itemsToLoad.length) return;
    const observer = new IntersectionObserver((entries, observer) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const item = entry.target;
                const img = item.querySelector('.fp-game-icon');
                const fallback = item.querySelector('.fp-fallback-icon');
                const dataSrc = img.getAttribute('data-src');
                if (dataSrc) {
                    img.src = dataSrc;
                    img.removeAttribute('data-src');
                    img.onload = () => {
                        if (img.naturalWidth > 16 && img.naturalHeight > 16) {
                            fallback.style.display = 'none';
                            img.style.display = 'block';
                            img.style.animation = 'fadeInIcon 0.5s';
                        }
                    };
                }
                observer.unobserve(item);
            }
        });
    }, {
        root: null,
        rootMargin: '0px 0px 200px 0px'
    });
    itemsToLoad.forEach(item => {
        observer.observe(item);
    });
}

function setupSearchFilter() {
    const searchInput = document.getElementById('redesignGameSearchInput');
    if (!searchInput) return;
    searchInput.addEventListener('input', () => {
        const searchTerm = searchInput.value.toLowerCase().trim();
        const gameCards = document.querySelectorAll('.game-grid .game-card');
        gameCards.forEach(card => {
            const title = card.querySelector('.game-card-title').textContent.toLowerCase();
            const tags = card.querySelectorAll('.category-tag');
            let isMatch = false;
            tags.forEach(tag => tag.classList.remove('category-tag--highlighted'));
            if (title.includes(searchTerm)) isMatch = true;
            tags.forEach(tag => {
                if (tag.textContent.toLowerCase().includes(searchTerm)) {
                    isMatch = true;
                    if (searchTerm) tag.classList.add('category-tag--highlighted');
                }
            });
            card.style.display = isMatch ? 'flex' : 'none';
        });
    });
}

function initializeRedesign() {
    // Удаляем стандартный фильтр игр FunPay, так как у нас есть свой.
    const promoFilterForm = document.querySelector('.promo-games-filter');
    if (promoFilterForm) {
        promoFilterForm.remove();
    }

    if (document.body.classList.contains('funpay-redesigned')) return;
    const originalContentContainer = document.querySelector('#content');
    if (!originalContentContainer) return;
    const chatElement = originalContentContainer.querySelector('.js-main-chat');
    const headers = Array.from(document.querySelectorAll('.title-mini'));
    const yourGamesHeader = headers.find(h => h.textContent.trim() === 'Ваши игры');
    const yourGamesContainer = yourGamesHeader ? yourGamesHeader.closest('.promo-game-list-header').nextElementSibling : null;
    const allGamesContainer = document.querySelector('.promo-games-all');
    const allGamesData = extractGamesFromContainer(allGamesContainer);
    const yourGamesData = extractGamesFromContainer(yourGamesContainer);
    if (allGamesData.length === 0) {
        document.body.style.visibility = 'visible';
        originalContentContainer.style.visibility = 'visible';
        return;
    }
    const newUI = createRedesignedUI(allGamesData, yourGamesData);
    originalContentContainer.innerHTML = '';
    originalContentContainer.appendChild(newUI);
    if (chatElement) {
        const searchContainer = newUI.querySelector('.redesign-search-container');
        if (searchContainer) {
            newUI.insertBefore(chatElement, searchContainer);
        }
    }
    originalContentContainer.classList.add('redesigned-content-container');
    document.body.classList.add('funpay-redesigned');
    setupSearchFilter();
    setupLazyLoadObserver();
}

async function handleHomepageRedesign() {
    const {
        enableRedesignedHomepage = true
    } = await chrome.storage.local.get('enableRedesignedHomepage');
    const path = window.location.pathname;
    const isHomepage = path === '/' || path === '/en' || path === '/en/';
    if (enableRedesignedHomepage && isHomepage) {
        initializeRedesign();
    } else {
        const content = document.querySelector('#content');
        if (content) content.style.visibility = 'visible';
    }
}