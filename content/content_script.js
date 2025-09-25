(function() {
    'use strict';
    
    // --- НОВЫЙ БЛОК: ФУНКЦИОНАЛ ОБЪЯВЛЕНИЙ ---
    function initializeAnnouncementsFeature() {
        const announcementsTab = document.getElementById('announcementsNavTab');
        if (!announcementsTab) return;

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

        announcementsTab.addEventListener('click', async () => {
            const popup = document.querySelector('.fp-tools-popup');
            const navItems = popup.querySelectorAll('.fp-tools-nav li, .fp-tools-header-tab');
            const contentPages = popup.querySelectorAll('.fp-tools-page-content');

            navItems.forEach(item => item.classList.remove('active'));
            announcementsTab.classList.add('active');
            
            contentPages.forEach(page => page.classList.remove('active'));
            popup.querySelector('.fp-tools-page-content[data-page="announcements"]').classList.add('active');

            chrome.runtime.sendMessage({ action: 'markAnnouncementsAsRead' });
            
            const { fpToolsAnnouncements } = await chrome.storage.local.get('fpToolsAnnouncements');
            displayAnnouncements(fpToolsAnnouncements);
        });

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
                }, 5000);
            });
        }

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

    async function handleAIReviewReply(event) {
        const button = event.currentTarget;
    
        if (!document.querySelector('style[data-fp-tools-btn-loader]')) {
            const style = document.createElement('style');
            style.dataset.fpToolsBtnLoader = 'true';
            style.textContent = `
                .fp-tools-btn-loader {
                    display: inline-block;
                    width: 16px; height: 16px;
                    border: 2px solid rgba(255,255,255,0.3);
                    border-top-color: #fff;
                    border-radius: 50%;
                    animation: spin 1s linear infinite;
                }
                @keyframes spin { to { transform: rotate(360deg); } }
            `;
            document.head.appendChild(style);
        }
    
        const originalText = button.innerHTML;
        button.disabled = true;
        button.innerHTML = `<span class="fp-tools-btn-loader"></span>`;
        
        const replyTextarea = document.querySelector('.review-item-answer-form textarea[name="text"]');
        if (!replyTextarea) {
            showNotification('Не найдено поле для ответа.', true);
            button.disabled = false;
            button.innerHTML = originalText;
            return;
        }
        
        try {
            const myUsername = document.querySelector('.user-link-name')?.textContent.trim() || 'Продавец';
    
            const headers = Array.from(document.querySelectorAll('.param-item h5'));
            const shortDescHeader = headers.find(h => h.textContent.trim() === 'Краткое описание');
            const lotName = shortDescHeader ? shortDescHeader.nextElementSibling.textContent.trim() : 'ваш товар';
    
            const reviewText = document.querySelector('.review-item-text')?.textContent.trim() || 'положительный отзыв';
    
            const response = await chrome.runtime.sendMessage({
                action: "getAIProcessedText",
                text: lotName,
                context: reviewText,
                myUsername: myUsername,
                type: "review_reply"
            });
    
            if (response && response.success) {
                replyTextarea.value = response.data;
                replyTextarea.dispatchEvent(new Event('input', { bubbles: true }));
            } else {
                throw new Error(response.error || 'Неизвестная ошибка ИИ.');
            }
    
        } catch (error) {
            showNotification(`Ошибка ИИ: ${error.message}`, true);
            console.error('FP Tools AI Review Reply Error:', error);
        } finally {
            button.disabled = false;
            button.innerHTML = originalText;
        }
    }

    function initializeDynamicFeatures() {
        document.body.addEventListener('focusin', (event) => {
            if (event.target.matches('.chat-form-input .form-control')) {
                if (!document.querySelector('.chat-buttons-container') && !document.querySelector('.fp-tools-template-sidebar')) {
                    addChatTemplateButtons();
                }
                if (!document.getElementById('aiModeToggleBtn')) {
                    setupAIChatFeature();
                }
            }
            if (event.target.matches('textarea.textarea-lot-secrets')) {
                if (!document.getElementById('ad-manager-placeholder')) {
                    initializeAutoDeliveryManager();
                }
            }
        });
    
        const checkAndInitFeatures = () => {
            if (!document.getElementById('fpToolsGenerateImageBtn') && document.querySelector('.attachments-box')) {
                initializeImageGenerator();
            }
            if (!document.getElementById('fp-tools-ai-gen-btn-wrapper')) {
                const header = document.querySelector('h1.page-header, h1.page-header.page-header-no-hr');
                if (header && (header.textContent.includes('Добавление предложения') || header.textContent.includes('Редактирование предложения'))) {
                    createAIGeneratorUI();
                }
            }
            if (!document.getElementById('fp-tools-read-all-btn') && document.querySelector('.chat-full-header')) {
                initializeMarkAllAsRead();
            }
            // --- НОВЫЙ БЛОК ДЛЯ ИИ-ОТВЕТА НА ОТЗЫВ ---
            const publishButton = document.querySelector('.review-item-answer-form .btn[data-action="save"]');
            if (publishButton && !document.getElementById('fp-tools-ai-review-reply-btn')) {
                const aiButton = createElement('button', {
                    type: 'button',
                    class: 'btn btn-primary action',
                    id: 'fp-tools-ai-review-reply-btn'
                });
                aiButton.innerHTML = `<span class="material-icons" style="font-size: 16px; margin-right: 5px; vertical-align: text-bottom;">auto_awesome</span>Ответить`;
                
                publishButton.style.marginLeft = '10px';
                publishButton.parentElement.prepend(aiButton);
    
                aiButton.addEventListener('click', handleAIReviewReply);
            }
            // --- КОНЕЦ НОВОГО БЛОКА ---
        };
    
        checkAndInitFeatures();
    
        const observer = new MutationObserver(throttle(checkAndInitFeatures, 500));
    
        const contentNode = document.getElementById('content');
        if (contentNode) {
            observer.observe(contentNode, { childList: true, subtree: true });
        } else {
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
        initializeAnnouncementsFeature();
        initializeLotIO(); // <-- ВЫЗОВ НОВОЙ ФУНКЦИИ

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
            if (request.action === 'updateAnnouncementsBadge') {
                updateAnnouncementsBadgeUI(request.unreadCount);
                return true;
            }
            if (request.action === 'announcementsUpdated') {
                const announcementsArea = document.getElementById('announcements-content-area');
                if (announcementsArea && document.querySelector('.fp-tools-page-content[data-page="announcements"]').classList.contains('active')) {
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
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initializeFpTools);
    } else {
        initializeFpTools();
    }
    
})();