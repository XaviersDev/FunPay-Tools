// C:\Users\AlliSighs\Desktop\◘FUNPAY ◘\FunPay Tools 2.6\content\content_script.js 

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

        // --- НОВЫЙ БЛОК: Добавление кнопки копирования на публичную страницу лота ---
        if (window.location.pathname.includes('/lots/offer') && !document.getElementById('fp-tools-public-clone-btn')) {
            const buyButtonForm = document.querySelector('form[action$="/orders/new"]');
            const buyButton = buyButtonForm?.querySelector('button[type="submit"]');

            if (buyButton) {
                const cloneBtn = createElement('button', {
                    type: 'button',
                    id: 'fp-tools-public-clone-btn',
                    class: 'btn btn-default'
                }, {
                    marginRight: '10px', // Небольшой отступ
                    flex: '1' // Занимает доступное место
                }, 'Копировать лот');
                
                // Делаем кнопки гибкими
                buyButton.style.flex = '2'; // Кнопка "Купить" шире
                buyButton.parentElement.style.display = 'flex';
                buyButton.parentElement.style.gap = '10px';

                // Вставляем кнопку "Копировать" перед кнопкой "Купить"
                buyButton.parentElement.prepend(cloneBtn);

                // Вешаем обработчик
                if (typeof handlePublicLotCopy === 'function') {
                    cloneBtn.addEventListener('click', handlePublicLotCopy);
                }
            }
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
// --- Остальной код файла content_script.js остается без изменений ---
// Я верну его целиком, чтобы вы могли просто заменить файл.
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
            // AI review reply button removed in 3.0 (use template buttons)

            // --- НОВЫЙ БЛОК: Добавление кнопки копирования на публичную страницу лота ---
            if (window.location.pathname.includes('/lots/offer') && !document.getElementById('fp-tools-public-clone-btn')) {
                const buyButtonForm = document.querySelector('form[action$="/orders/new"]');
                const buyButton = buyButtonForm?.querySelector('button[type="submit"]');

                if (buyButton) {
                    const cloneBtn = createElement('button', {
                        type: 'button',
                        id: 'fp-tools-public-clone-btn',
                        class: 'btn btn-default'
                    }, {
                        marginRight: '10px',
                        flex: '1'
                    }, 'Копировать лот');
                    
                    buyButton.style.flex = '2';
                    buyButton.parentElement.style.display = 'flex';
                    buyButton.parentElement.style.gap = '10px';

                    buyButton.parentElement.prepend(cloneBtn);
                    
                    if (typeof handlePublicLotCopy === 'function') {
                        cloneBtn.addEventListener('click', handlePublicLotCopy);
                    }
                }
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
        
        // --- ИЗМЕНЕНИЕ: Вставка HTML модальных окон в body ---
        if (typeof getModalOverlaysHTML === 'function') {
            const modalsHTML = getModalOverlaysHTML();
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = modalsHTML;
            while (tempDiv.firstChild) {
                document.body.appendChild(tempDiv.firstChild);
            }
        }
        // --- КОНЕЦ ИЗМЕНЕНИЯ ---

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
        initializeLotIO();
        initializeAutoReview();
        initializeFPTIdentifier();
        // 2.9: New features
        initializeAILotAudit();
        initializeSettingsIO();
        initBulkLotEditor();
        initializeBlacklist();
        initAutoDeliveryUI();
        initializePaymentTypeBadges();
        initializeUnconfirmedBalanceDisplay();
        initializeSalesFilters();
        initializeResetButtons();
        initSalesChart();
        // order_page_enhancements.js, lot_context_menu.js, auto_restore_lots.js self-initialize
        // New 3.0 features (self-initializing modules loaded separately)
        // quick_lot_search.js, chat_enhancements.js, order_timer.js self-initialize

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
            if (request.action === 'fpToolsCheckRestoreLots') {
                setTimeout(checkAndRestoreLots, 5000);
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

    // ── 2.9: Payment type badges in orders list ─────────────────────────────────
    function initializePaymentTypeBadges() {
        chrome.storage.local.get('fpToolsShowPaymentType', ({ fpToolsShowPaymentType }) => {
            if (fpToolsShowPaymentType === false) return;
            if (!window.location.pathname.includes('/orders/')) return;
            const addBadges = () => {
                document.querySelectorAll('a.tc-item:not(.fp-typed)').forEach(row => {
                    row.classList.add('fp-typed');
                    const isDeal = row.classList.contains('deal');
                    // Only add badge if not already present
                    const orderEl = row.querySelector('.tc-order');
                    if (!orderEl || orderEl.querySelector('.fp-type-badge')) return;
                    const badge = document.createElement('span');
                    badge.className = 'fp-type-badge';
                    badge.style.cssText = `display:inline-block;font-size:10px;font-weight:700;border-radius:3px;padding:1px 5px;margin-left:6px;vertical-align:middle;background:${isDeal ? 'rgba(76,175,130,0.15)' : 'rgba(107,102,255,0.15)'};color:${isDeal ? '#4caf82' : '#a09ef8'};border:1px solid ${isDeal ? 'rgba(76,175,130,0.3)' : 'rgba(107,102,255,0.3)'};`;
                    badge.textContent = isDeal ? 'Сделка' : 'Обычный';
                    orderEl.appendChild(badge);
                });
            };
            addBadges();
            // Only watch the list container, not whole document
            const listEl = document.querySelector('.order-list, #content');
            if (listEl) new MutationObserver(addBadges).observe(listEl, { childList: true, subtree: false });
        });
    }

    // ── 2.9: Unconfirmed balance display ─────────────────────────────────────
    function initializeUnconfirmedBalanceDisplay() {
        chrome.storage.local.get('fpToolsShowUnconfirmed', ({ fpToolsShowUnconfirmed }) => {
            if (fpToolsShowUnconfirmed === false) return;

            async function updateUnconfirmedBadge() {
                const balanceEl = document.querySelector('.user-balance-sum, .navbar-balance');
                if (!balanceEl || document.getElementById('fp-unconfirmed-badge')) return;

                try {
                    const res = await chrome.runtime.sendMessage({ action: 'getUnconfirmedBalance' });
                    if (!res?.success || !res.data?.total) return;

                    const { total, count } = res.data;
                    if (!count) return;

                    const badge = document.createElement('span');
                    badge.id = 'fp-unconfirmed-badge';
                    badge.title = `${count} неподтверждённых заказа(ов) на сумму ${total} ₽`;
                    badge.style.cssText = `
                        font-size:11px;color:#ff9800;cursor:default;margin-left:4px;
                        font-family:Inter,sans-serif;
                    `;
                    badge.textContent = `(+${total} ₽ ожид.)`;
                    balanceEl.parentElement?.appendChild(badge);
                } catch (e) {}
            }

            setTimeout(updateUnconfirmedBadge, 3000);
        });
    }

    // ── 2.9: Sales period filter ──────────────────────────────────────────────
    function initializeSalesFilters() {
        const salesSection = document.querySelector('.sales-statistics, #fp-tools-sales-block');
        if (!salesSection) return;
        if (document.getElementById('fp-sales-filter-bar')) return;

        const filterBar = document.createElement('div');
        filterBar.id = 'fp-sales-filter-bar';
        filterBar.style.cssText = `
            display:flex;gap:6px;margin-bottom:10px;flex-wrap:wrap;
        `;

        const periods = [
            { label: 'Сегодня',    days: 1   },
            { label: 'Неделя',     days: 7   },
            { label: 'Месяц',      days: 30  },
            { label: '3 месяца',   days: 90  },
            { label: 'Всё время',  days: 9999 }
        ];

        periods.forEach((p, i) => {
            const btn = document.createElement('button');
            btn.className = 'btn btn-default';
            btn.style.cssText = 'padding:4px 10px;font-size:11px;font-weight:600;';
            btn.textContent = p.label;
            if (i === 2) { // Default: month
                btn.style.background = '#252847';
                btn.style.color = '#a09ef8';
                btn.style.borderColor = '#363a5a';
            }
            btn.addEventListener('click', () => {
                filterBar.querySelectorAll('button').forEach(b => {
                    b.style.background = '';
                    b.style.color = '';
                    b.style.borderColor = '';
                });
                btn.style.background = '#252847';
                btn.style.color = '#a09ef8';
                btn.style.borderColor = '#363a5a';
                applySalesPeriodFilter(p.days);
            });
            filterBar.appendChild(btn);
        });

        salesSection.insertBefore(filterBar, salesSection.firstChild);
    }

    function applySalesPeriodFilter(days) {
        chrome.storage.local.get('fpToolsSalesData', ({ fpToolsSalesData }) => {
            if (!fpToolsSalesData) return;
            const cutoff = days >= 9999 ? 0 : Date.now() - days * 24 * 60 * 60 * 1000;
            const filtered = Object.values(fpToolsSalesData).filter(o => o.orderDate >= cutoff);
            const total = filtered.reduce((s, o) => s + (o.price || 0), 0);
            const countEl = document.getElementById('fp-sales-count');
            const totalEl = document.getElementById('fp-sales-total');
            if (countEl) countEl.textContent = filtered.length;
            if (totalEl) totalEl.textContent = `${Math.round(total).toLocaleString('ru-RU')} ₽`;
        });
    }

    // ── 2.9: Reset buttons in settings_io page ────────────────────────────────
    // Helper: visually confirm a reset button action
    function _resetBtnFeedback(btn, successText) {
        if (!btn) return;
        const orig = btn.textContent;
        btn.disabled = true;
        btn.textContent = '⏳ Сброс...';
        setTimeout(() => {
            btn.textContent = '✅ ' + successText;
            btn.style.color = '#4caf82';
            setTimeout(() => {
                btn.textContent = orig;
                btn.style.color = '';
                btn.disabled = false;
            }, 2000);
        }, 400);
    }

    function initializeResetButtons() {
        const arBtn = document.getElementById('fp-reset-autoresponder-btn');
        arBtn?.addEventListener('click', async () => {
            await chrome.storage.local.remove(['fpToolsAutoResponderTag']);
            const { fpToolsAutoReplies = {} } = await chrome.storage.local.get('fpToolsAutoReplies');
            fpToolsAutoReplies.processedMessageIds = [];
            await chrome.storage.local.set({ fpToolsAutoReplies });
            _resetBtnFeedback(arBtn, 'Сброшено');
        });

        const pinBtn = document.getElementById('fp-reset-pinned-btn');
        pinBtn?.addEventListener('click', async () => {
            await chrome.storage.local.remove('fpToolsPinnedLots');
            _resetBtnFeedback(pinBtn, 'Очищено');
        });

        const greetBtn = document.getElementById('fp-reset-greeted-btn');
        greetBtn?.addEventListener('click', async () => {
            const { fpToolsAutoReplies = {} } = await chrome.storage.local.get('fpToolsAutoReplies');
            fpToolsAutoReplies.greetedUsers = [];
            await chrome.storage.local.set({ fpToolsAutoReplies });
            _resetBtnFeedback(greetBtn, 'Сброшено');
        });

        // 3.0: Reset April Fools date counter
        const aprBtn = document.getElementById('fp-reset-april-btn');
        aprBtn?.addEventListener('click', async () => {
            const year = new Date().getFullYear();
            try { localStorage.removeItem(`fpApril_${year}_done`); } catch(e) {}
            try { localStorage.removeItem(`fpApril_${year - 1}_done`); } catch(e) {}
            try { sessionStorage.removeItem('fpAprilReloads'); } catch(e) {}
            try { sessionStorage.removeItem('fpAprilActive'); } catch(e) {}
            await chrome.storage.local.remove([
                `fpApril_${year}_done`,
                `fpApril_${year - 1}_done`,
                `fpApril_${year + 1}_done`,
                'fpAprilReloads',
                'fpAprilActive',
            ]);
            _resetBtnFeedback(aprBtn, 'Сброшено');
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initializeFpTools);
    } else {
        initializeFpTools();
    }
    
})();