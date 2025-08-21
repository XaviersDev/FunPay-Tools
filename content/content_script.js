(function() {
    'use strict';
    
    function loadGoogleFonts() {
        if (document.getElementById('google-material-icons')) return;
        const link = createElement('link', {
            id: 'google-material-icons',
            rel: 'stylesheet',
            href: 'https://fonts.googleapis.com/icon?family=Material+Icons'
        });
        document.head.appendChild(link);
    }

    function addFpToolsButton() {
        const anchor = document.querySelector('.nav.navbar-nav.navbar-right.logged .user-link[data-toggle="dropdown"]')?.parentElement;
        if (!anchor || document.getElementById('fpToolsButton')) {
            return false;
        }

        const toolsMenu = createElement('li');
        toolsMenu.innerHTML = `<a style="font-weight: bold; cursor: pointer; user-select: none;" id="fpToolsButton">FP Tools<span></span></a>`;
        anchor.insertAdjacentElement('afterend', toolsMenu);

        toolsMenu.querySelector('#fpToolsButton')?.addEventListener('click', async () => {
            const popup = document.querySelector('.fp-tools-popup');
            if (popup) {
                await loadLastActivePage();
                popup.classList.add('active');
            }
        });

        console.log("FP Tools: Кнопка в хедере успешно добавлена.");
        return true;
    }

    function initializeDynamicFeatures() {
        // Используем делегирование событий для элементов, которые могут появиться в будущем
        document.body.addEventListener('focusin', (event) => {
            // ИИ-помощник и шаблоны в чате
            if (event.target.matches('.chat-form-input .form-control')) {
                if (!document.querySelector('.chat-buttons-container') && !document.querySelector('.fp-tools-template-sidebar')) {
                    addChatTemplateButtons();
                }
                if (!document.getElementById('aiModeToggleBtn')) {
                    setupAIChatFeature();
                }
            }
            // Шаблоны для ответа на отзыв
            if (event.target.matches('.review-editor-reply .form-control')) {
                if (!document.querySelector('.review-response-btn')) {
                    addReviewResponseButton();
                }
            }
            // Менеджер автовыдачи
            if (event.target.matches('textarea.textarea-lot-secrets')) {
                if (!document.getElementById('ad-manager-placeholder')) {
                    initializeAutoDeliveryManager();
                }
            }
        });
    
        // Для элементов, которые появляются без фокуса, используем более умный наблюдатель
        const observer = new MutationObserver((mutationsList) => {
            for (const mutation of mutationsList) {
                for (const node of mutation.addedNodes) {
                    if (node.nodeType !== 1) continue;
    
                    // Генератор изображений
                    if (node.querySelector('.attachments-box') || node.matches('.attachments-box')) {
                        if (!document.getElementById('fpToolsGenerateImageBtn')) {
                            initializeImageGenerator();
                        }
                    }
                    // ИИ-генератор лотов
                    const header = node.querySelector('h1.page-header, h1.page-header.page-header-no-hr') || (node.matches('h1.page-header, h1.page-header.page-header-no-hr') ? node : null);
                    if (header && (header.textContent.includes('Добавление предложения') || header.textContent.includes('Редактирование предложения'))) {
                        if (!document.getElementById('fp-tools-ai-gen-btn-wrapper')) {
                            createAIGeneratorUI();
                        }
                    }
                }
            }
        });
    
        // Наблюдаем только за основным контейнером контента, а не за всем body
        const contentNode = document.getElementById('content');
        if (contentNode) {
            observer.observe(contentNode, { childList: true, subtree: true });
        } else {
            // Fallback, если #content не найден сразу
            observer.observe(document.body, { childList: true, subtree: true });
        }
    }

    async function initializeFpTools() {
        loadGoogleFonts();

        const buttonObserver = new MutationObserver((mutations, obs) => {
            if (addFpToolsButton()) {
                obs.disconnect(); 
            }
        });

        if (!addFpToolsButton()) {
            buttonObserver.observe(document.body, {
                childList: true,
                subtree: true
            });
        }
        
        initializeDynamicFeatures();
        initializeQuickGamesMenu();
        
        const toolsPopup = createMainPopup();
        document.body.appendChild(toolsPopup);
        
        const settings = await chrome.storage.local.get([
            'enableRedesignedHomepage', 
            'showSalesStats', 
            'hideBalance', 
            'viewSellersPromo',
            'enableCustomTheme'
        ]);

        if (settings.enableRedesignedHomepage !== false) {
            await handleHomepageRedesign();
        } else {
            const content = document.querySelector('#content');
            if (content) content.style.visibility = 'visible';
        }

        if (settings.showSalesStats !== false) initializeSalesStatistics();
        if (settings.hideBalance === true) initializeHideBalance();
        if (settings.viewSellersPromo !== false) initializeViewPromoIcons();
        
        await loadSavedSettings();
        addChatTemplateButtons();
        initializeExactPrice();
        addReviewResponseButton();
        setupAIChatFeature();
        initializeFontTools();
        if(settings.enableCustomTheme !== false) applyCustomTheme();
        
        applyHeaderPosition();
        initializeUserNotes();
        initializeToolsPopup();
        makePopupInteractive(toolsPopup);
        initializeAutoDeliveryManager();
        initializeLotCloning();
        initializeLotManagement();
        initializeImageGenerator();
        initializeCustomSound();
        initializeReviewSorter();
        initializeOverviewTour();
        initializeMagicStickStyler();
        initializePiggyBank();
        initializeMarketAnalytics();

        chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
            if (request.action === 'logToAutoBumpConsole') {
                logToAutoBumpConsole(request.message);
                return true;
            }
            if (request.action === "getAppData") {
                try {
                    const appDataString = document.body.dataset.appData;
                    if (!appDataString) {
                         sendResponse({ success: false, error: "data-app-data not found on page" });
                    } else {
                        const appData = JSON.parse(appDataString);
                        sendResponse({ success: true, data: appData });
                    }
                } catch (e) {
                    sendResponse({ success: false, error: e.message });
                }
                return true;
            }
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initializeFpTools);
    } else {
        initializeFpTools();
    }
    
})();