(function() {
    'use strict';
    
    // --- НОВЫЙ БЛОК: ФУНКЦИОНАЛ ОБЪЯВЛЕНИЙ ---
    function initializeAnnouncementsFeature() {
        const announcementsTab = document.getElementById('announcementsNavTab');
        if (!announcementsTab) return;

        // Функция для отображения объявлений
        const displayAnnouncements = (announcements) => {
            const contentArea = document.getElementById('announcements-content-area');
            if (!contentArea) return;

            if (!announcements || announcements.length === 0) {
                contentArea.innerHTML = '<p class="announcement-empty">Пока нет никаких объявлений.</p>';
                return;
            }

            contentArea.innerHTML = announcements.map(a => {
                const date = new Date(a.id).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
                return `
                    <div class="announcement-item">
                        <div class="announcement-item-header">
                            <h4>${a.title}</h4>
                            <span class="announcement-date">${date}</span>
                        </div>
                        <p>${a.content.replace(/\n/g, '<br>')}</p>
                    </div>
                `;
            }).join('');
        };

        // Клик по вкладке
        announcementsTab.addEventListener('click', async () => {
            const popup = document.querySelector('.fp-tools-popup');
            const navItems = popup.querySelectorAll('.fp-tools-nav li, .fp-tools-header-tab');
            const contentPages = popup.querySelectorAll('.fp-tools-page-content');

            navItems.forEach(item => item.classList.remove('active'));
            announcementsTab.classList.add('active');
            
            contentPages.forEach(page => page.classList.remove('active'));
            popup.querySelector('.fp-tools-page-content[data-page="announcements"]').classList.add('active');

            // Отправляем сообщение, что пользователь прочитал объявления
            chrome.runtime.sendMessage({ action: 'markAnnouncementsAsRead' });
            
            // Загружаем и отображаем контент
            const { fpToolsAnnouncements } = await chrome.storage.local.get('fpToolsAnnouncements');
            displayAnnouncements(fpToolsAnnouncements);
        });

        // Кнопка принудительного обновления
        const refreshBtn = document.getElementById('refresh-announcements-btn');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', () => {
                refreshBtn.disabled = true;
                refreshBtn.querySelector('.material-icons').classList.add('spinning');
                
                chrome.runtime.sendMessage({ action: 'forceCheckAnnouncements' }, (response) => {
                    if (response && response.success) {
                        showNotification('Объявления обновлены!', false);
                    }
                });

                setTimeout(() => {
                    refreshBtn.disabled = false;
                    refreshBtn.querySelector('.material-icons').classList.remove('spinning');
                }, 5000); // КД 5 секунд
            });
        }

        // Проверяем наличие непрочитанных при инициализации
        chrome.storage.local.get('fpToolsUnreadCount', ({ fpToolsUnreadCount }) => {
            updateAnnouncementsBadgeUI(fpToolsUnreadCount || 0);
        });
    }

    function updateAnnouncementsBadgeUI(unreadCount) {
        const announcementsTab = document.getElementById('announcementsNavTab');
        if (!announcementsTab) return;
        const badge = announcementsTab.querySelector('.notification-badge');

        if (unreadCount > 0) {
            announcementsTab.classList.add('has-unread');
            badge.textContent = `+${unreadCount}`;
            badge.style.display = 'flex';
        } else {
            announcementsTab.classList.remove('has-unread');
            badge.style.display = 'none';
        }
    }
    // --- КОНЕЦ НОВОГО БЛОКА ---

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

        const button = toolsMenu.querySelector('#fpToolsButton');

        button?.addEventListener('click', async () => {
            const popup = document.querySelector('.fp-tools-popup');
            if (popup) {
                await loadLastActivePage();
                popup.classList.add('active');
            }
        });
        
        let hoverTimeout;
        button?.addEventListener('mouseenter', () => {
            hoverTimeout = setTimeout(() => {
                if (typeof showHeaderButtonTooltip === 'function') {
                    showHeaderButtonTooltip(button);
                }
            }, 2000);
        });

        button?.addEventListener('mouseleave', () => {
            clearTimeout(hoverTimeout);
            if (typeof hideHeaderButtonTooltip === 'function') {
                hideHeaderButtonTooltip();
            }
        });

        button?.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            if (typeof showButtonStyler === 'function') {
                showButtonStyler(e.clientX, e.clientY);
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
                    if (node.querySelector('.chat-full-header') || node.matches('.chat-full-header')) {
                        initializeMarkAllAsRead();
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
        initializeMarkAllAsRead();
        initializeHeaderButtonStyler();
        initializeAnnouncementsFeature(); // <-- ВЫЗОВ НОВОЙ ФУНКЦИИ

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
            // --- НОВЫЙ ИСПРАВЛЕННЫЙ СЛУШАТЕЛЬ ---
            if (request.action === 'updateAnnouncementsBadge') {
                updateAnnouncementsBadgeUI(request.unreadCount);
                return true;
            }
            if (request.action === 'announcementsUpdated') {
                const announcementsArea = document.getElementById('announcements-content-area');
                // Проверяем, активна ли вкладка объявлений
                if (announcementsArea && document.querySelector('.fp-tools-page-content[data-page="announcements"]').classList.contains('active')) {
                    // Напрямую вызываем функцию для отрисовки полученных данных, БЕЗ клика
                    const displayAnnouncements = (announcements) => {
                        if (!announcementsArea) return;
                        if (!announcements || announcements.length === 0) {
                            announcementsArea.innerHTML = '<p class="announcement-empty">Пока нет никаких объявлений.</p>';
                            return;
                        }
                        announcementsArea.innerHTML = announcements.map(a => {
                            const date = new Date(a.id).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
                            return `
                                <div class="announcement-item">
                                    <div class="announcement-item-header">
                                        <h4>${a.title}</h4>
                                        <span class="announcement-date">${date}</span>
                                    </div>
                                    <p>${a.content.replace(/\n/g, '<br>')}</p>
                                </div>
                            `;
                        }).join('');
                    };
                    displayAnnouncements(request.announcements);
                }
                return true;
            }
            // --- КОНЕЦ НОВОГО ИСПРАВЛЕННОГО СЛУШАТЕЛЯ ---
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initializeFpTools);
    } else {
        initializeFpTools();
    }
    
})();