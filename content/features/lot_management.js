'use strict';

function waitForProfileContainer(timeout = 8000) {
    return new Promise((resolve) => {
        const check = () => {
            const container = document.querySelector('.profile-data-container');
            if (container && container.querySelector('.offer')) return container;
            return null;
        };
        const existing = check();
        if (existing) { resolve(existing); return; }

        let resolved = false;
        const done = (el) => {
            if (resolved) return;
            resolved = true;
            clearInterval(poll);
            observer.disconnect();
            resolve(el);
        };

        // Poll every 150ms as primary mechanism (most reliable)
        const poll = setInterval(() => {
            const el = check();
            if (el) done(el);
        }, 150);

        // MutationObserver as secondary
        const observer = new MutationObserver(() => {
            const el = check();
            if (el) done(el);
        });
        observer.observe(document.body, { childList: true, subtree: true });

        setTimeout(() => done(null), timeout);
    });
}

async function displayPinnedLotsOnLoad() {
    const { fpToolsPinnedLots = [] } = await chrome.storage.local.get('fpToolsPinnedLots');
    if (fpToolsPinnedLots.length === 0) return;

    // Don't re-insert if already there
    if ($('#fp-tools-pinned-lots-container').length) return;

    // Wait for FunPay to render the profile container (it arrives after their own JS runs)
    const profileDataContainerEl = await waitForProfileContainer();
    if (!profileDataContainerEl) return;
    const profileDataContainer = $(profileDataContainerEl);

    let pinnedLotsHtml = '';
    fpToolsPinnedLots.forEach(lotData => {
        if (!lotData.html) return;
        const $lot = $(lotData.html);
        if (!$lot.length) return;
        $lot.attr('data-fp-tooltip', lotData.gameName);
        $lot.addClass('fp-tooltip-host');
        pinnedLotsHtml += $lot[0].outerHTML;
    });

    if (!pinnedLotsHtml) return;

    const pinnedContainer = $(`
        <div class="offer" id="fp-tools-pinned-lots-container">
            <div class="offer-list-title" style="display: flex; align-items: center; gap: 10px;">
                <h3>Закрепленные лоты</h3>
                <button id="fp-tools-edit-pinned-lots-btn" class="btn btn-default btn-xs" title="Выбрать закрепленные" style="padding: 2px 8px; font-size: 14px; line-height: 1;">✏️</button>
            </div>
            <div class="tc showcase-table tc-b-main">
                ${pinnedLotsHtml}
            </div>
        </div>
    `);

    profileDataContainer.prepend(pinnedContainer);
}


function initializeLotManagement() {
    $(function() {
        const onUsersPage = window.location.pathname.includes('/users/');
        const hasChatPanel = !!document.querySelector('.chat-profile-container');
        const isCategoryTradePage = window.location.pathname.includes('/lots/') && window.location.pathname.includes('/trade');

        // Свой профиль = страница /users/ без чат-панели (на своём чата с собой нет).
        const isOwnProfile = onUsersPage && !hasChatPanel;

        // Определяем свой userId из шапки (.user-link-dropdown) и id просматриваемого профиля.
        function getOwnUserId() {
            const a = document.querySelector('.user-link-dropdown[href*="/users/"]');
            const m = a && a.getAttribute('href') && a.getAttribute('href').match(/\/users\/(\d+)/);
            if (m) return m[1];
            try {
                const raw = document.body?.dataset?.appData;
                if (raw) { const d = JSON.parse(raw); return String((Array.isArray(d) ? d[0] : d)?.userId || '') || null; }
            } catch (_) {}
            return null;
        }
        const profileMatch = window.location.pathname.match(/\/users\/(\d+)\//);
        const profileId = profileMatch ? profileMatch[1] : null;
        const ownId = getOwnUserId();
        // Чужой профиль = /users/N/ где N ≠ мой id (есть лоты для копирования).
        const isForeignProfile = onUsersPage && profileId && ownId && profileId !== ownId;

        // Страница активируется на: своём профиле, категории-trade, ИЛИ чужом профиле.
        const isProfileSalesPage = isOwnProfile || isForeignProfile;
        if (!isProfileSalesPage && !isCategoryTradePage) return;
        if (document.getElementById('fp-tools-select-lots-btn')) return;

        const isForeignClone = isForeignProfile;
        window.__fptForeignClone = isForeignClone;

        if (isProfileSalesPage && !isForeignClone) {
            displayPinnedLotsOnLoad();
        }

        const selectBtn = $('<button type="button" class="btn btn-default btn-block" id="fp-tools-select-lots-btn">Выбрать</button>');
        const reactivateBtn = $('<button type="button" class="btn btn-default btn-block" id="fp-tools-reactivate-lots-btn">Включить лоты</button>');

        const controlsContainer = $(`
            <div id="fp-tools-selection-controls">
                <label>
                    <input type="checkbox" id="fp-tools-select-all-lots"> Выбрать все
                </label>
                <button type="button" class="btn btn-default btn-xs" id="fp-tools-cancel-selection">Отмена</button>
            </div>
        `);

        if (isProfileSalesPage) {
            const offersHeader = $(Array.from(document.querySelectorAll('h5.mb10.text-bold')).find(h => h.textContent.trim() === 'Предложения' || h.textContent.trim() === 'Отзывы'));
            if (offersHeader.length) {
                selectBtn.removeClass('btn-block').addClass('btn-xs');
                controlsContainer.addClass('fp-tools-selection-controls-profile');
                // На профилях кнопку «Включить лоты» не показываем — только «Выбрать».
                offersHeader.append(selectBtn, controlsContainer.hide());
            }
        } else if (isCategoryTradePage) {
            $('body').addClass('fp-category-trade-page');
            const raiseButtonWrapper = $('.js-lot-raise').closest('[class*="col-"]');
            if (raiseButtonWrapper.length) {
                const controlsRow = raiseButtonWrapper.parent();
                controlsRow.addClass('fp-original-controls');
                
                const fpToolsControls = $('<div class="row row-10 fp-tools-offer-controls"></div>');
                const selectBtnWrapper = $('<div class="col-sm-6 mb10"></div>').append(selectBtn);
                const reactivateBtnWrapper = $('<div class="col-sm-6 mb10"></div>').append(reactivateBtn);
                
                fpToolsControls.append(selectBtnWrapper, reactivateBtnWrapper);
                controlsRow.before(fpToolsControls);
                
                controlsContainer.addClass('fp-tools-selection-controls-category').hide();
                controlsRow.parent().append(controlsContainer);
            }
        }
        
        createReactivationPopup();
        createPriceEditorPopup();

        selectBtn.on('click', function() {
            if(isProfileSalesPage) {
                $(this).hide();
                reactivateBtn.hide();
            } else {
                 $('.fp-tools-offer-controls, .fp-original-controls').hide();
            }
            controlsContainer.css('display', 'flex');
            toggleSelectionMode(true);
        });
        
        reactivateBtn.on('click', showReactivationPopup);

        controlsContainer.find('#fp-tools-cancel-selection').on('click', function() {
            controlsContainer.hide();
            if(isProfileSalesPage) {
                selectBtn.show();
                reactivateBtn.show();
            } else {
                $('.fp-tools-offer-controls, .fp-original-controls').show();
            }
            toggleSelectionMode(false);
            $('.actions').hide();
        });

        controlsContainer.find('#fp-tools-select-all-lots').on('change', function() {
            const isChecked = this.checked;
            $('.lot-box input').prop('checked', isChecked).trigger('change');
        });

        $(document).on('click', '#fp-tools-edit-pinned-lots-btn', function() {
            if (!$('#fp-tools-selection-controls').is(':visible')) {
                $('#fp-tools-select-lots-btn').click();
            }
            $('.lot-box input').prop('checked', false);
            $('#fp-tools-pinned-lots-container .lot-box input').prop('checked', true).trigger('change');
        });

        // [ИСПРАВЛЕНО] Добавляем CSS для корректного отображения чекбокса категории
        if (!$('style[data-fp-tools-category-selector]').length) {
            $('head').append(`
                <style data-fp-tools-category-selector>
                    .offer-list-title-container .offer-list-title {
                        display: flex;
                        align-items: center;
                        flex-grow: 1;
                    }
                    .offer-list-title-container .offer-list-title h3 {
                        margin: 0;
                    }
                    .fp-tools-category-selector {
                        margin-right: 15px;
                    }
                </style>
            `);
        }

        // Обработчик для чекбоксов категорий
        $(document).on('change', '.fp-tools-category-selector input', function() {
            const isChecked = $(this).prop('checked');
            $(this).closest('.offer').find('.tc-item .lot-box input').prop('checked', isChecked).trigger('change');
        });

        setupActionProcessing();
    });
}

function toggleSelectionMode(enable) {
    if (enable) {
        if ($('.tc-header').length && $('.action-lots-header-cell').length === 0) {
            $('.tc-header').prepend('<div class="action-lots-header-cell"></div>');
        }
        
        // Добавление чекбоксов для категорий
        $('.offer-list-title').each(function() {
            if ($(this).find('.fp-tools-category-selector').length === 0) {
                const categoryCheckbox = $(`
                    <label class="lot-box fp-tools-category-selector">
                        <input type="checkbox" hidden />
                        <span class="lot-mark"></span>
                    </label>
                `);
                $(this).prepend(categoryCheckbox);
            }
        });

        $('.tc-item').each(function() {
            if ($(this).find('.action-lots-checkbox-cell').length === 0) {
                const checkboxCell = $('<div class="action-lots-checkbox-cell"><label class="lot-box"><input type="checkbox" hidden /><span class="lot-mark"></span></label></div>');
                $(this).prepend(checkboxCell);
            }
        });
    } else {
        $('.lot-box input:checked').prop('checked', false).trigger('change');
        $('.action-lots-header-cell, .action-lots-checkbox-cell, .fp-tools-category-selector').remove();
    }
}

async function updatePinButtonsState() {
    const $checked = $('.lot-box input:checked');
    const $pinBtn = $('.action-lot.pin-lot');
    const $unpinBtn = $('.action-lot.unpin-lot');

    if ($checked.length === 0) {
        $pinBtn.hide();
        $unpinBtn.hide();
        return;
    }

    const { fpToolsPinnedLots = [] } = await chrome.storage.local.get('fpToolsPinnedLots');
    const pinnedIds = new Set(fpToolsPinnedLots.map(l => l.offerId));

    let arePinnedCount = 0;
    let areNotPinnedCount = 0;

    $checked.each(function() {
        const $lotLink = $(this).closest('a.tc-item');
        const offerIdMatch = $lotLink.attr('href').match(/(?:offer=|id=)(\d+)/);
        const offerId = offerIdMatch ? offerIdMatch[1] : null;

        if (offerId) {
            if (pinnedIds.has(offerId)) {
                arePinnedCount++;
            } else {
                areNotPinnedCount++;
            }
        }
    });

    $pinBtn.show();
    $unpinBtn.show();

    if (arePinnedCount > 0 && areNotPinnedCount === 0) {
        $pinBtn.hide();
    }
    if (areNotPinnedCount > 0 && arePinnedCount === 0) {
        $unpinBtn.hide();
    }
}

// Копирование ОДНОГО чужого лота к себе (тот же конвейер, что и одиночное
// клонирование): cloneGetSource (читает лот + подбирает поля категории) → cloneCreateLot.
async function fptCloneOneForeign(offerId) {
    const src = await chrome.runtime.sendMessage({ action: 'cloneGetSource', offerId });
    if (!src || !src.success) throw new Error(src?.error || 'не удалось прочитать лот');
    if (src.source?.isChips) throw new Error('лот из раздела валюты — пропущен');
    if (!src.fields) throw new Error(src.formError || 'не удалось подобрать поля категории');

    const s = src.source;
    const fields = { ...src.fields };
    fields['offer_id'] = '0';
    fields['fields[summary][ru]'] = s.summary || '';
    fields['fields[desc][ru]'] = s.description || '';
    fields['fields[summary][en]'] = (s.enDiffers && s.summary_en) ? s.summary_en : '';
    fields['fields[desc][en]'] = (s.enDiffers && s.desc_en) ? s.desc_en : '';
    // Цена: округляем до 2 знаков (FunPay не принимает длинные дроби → «Invalid price»).
    // Минимум на FunPay — 1, поэтому совсем мелкие цены поднимаем до 1.
    const fmtPrice = (v) => {
        let n = parseFloat(String(v).replace(',', '.'));
        if (Number.isNaN(n) || n <= 0) return '';
        if (n < 1) n = 1; // FunPay не даёт ставить меньше 1 в основной валюте
        return (Math.round(n * 100) / 100).toString();
    };
    let priceStr = '';
    if (s.finalPrice != null) priceStr = fmtPrice(s.finalPrice);
    if (!priceStr && s.rawPrice) priceStr = fmtPrice(s.rawPrice);
    if (priceStr) fields['price'] = priceStr;
    fields['amount'] = (s.amount && /^\d+$/.test(s.amount)) ? s.amount : (fields['amount'] || '1');
    fields['active'] = 'on';
    fields['secrets'] = fields['secrets'] || '';
    fields['fields[images]'] = fields['fields[images]'] || '';

    const res = await chrome.runtime.sendMessage({ action: 'cloneCreateLot', fields, location: 'trade' });
    if (!res || !res.success) throw new Error(res?.error || 'ошибка создания');
    return res.newId;
}

function setupActionProcessing() {
    if ($('.actions').length === 0) {
        $(`
            <div class="actions">
                <span class="log">Выберите действие</span>
                <div>
                    <button class="action-lot clone-lots" style="background:#7c5cff;display:none;">Копировать</button>
                    <button class="action-lot price-editor">Редактор цен</button>
                    <button class="action-lot pin-lot" style="background: #27ae60;">Закрепить</button>
                    <button class="action-lot unpin-lot" style="background: #c0392b;">Открепить</button>
                    <button class="action-lot dublicate">Дублировать</button>
                    <button class="action-lot activate-lot" style="background: #4CAF50; display:none;">Включить</button>
                    <button class="action-lot deactivate-lot">Отключить</button>
                    <button class="action-lot delete-lot">Удалить</button>
                </div>
            </div>
        `).appendTo('body').hide();

        // В режиме копирования (чужой профиль) показываем только «Копировать»,
        // прячем действия над своими лотами.
        if (window.__fptForeignClone) {
            $('.actions .action-lot').not('.clone-lots').hide();
            $('.actions .clone-lots').show();
        }
    }

    // FIX 2.8.8 (№6): обновляет счётчики на кнопках "Включить xN" / "Отключить xN".
    // Активные лоты = .tc-item без .warning; неактивные = .tc-item.warning.
    // Кнопка "Включить" показывается только если выбран хотя бы один НЕактивный лот,
    // а "Отключить" считает только выбранные АКТИВНЫЕ (отключать уже отключённые нельзя).
    function updateActivateDeactivateCounts() {
        // На чужом профиле (режим копирования) кнопок включения/отключения нет —
        // чужие лоты трогать нельзя, показываем только «Копировать».
        if (window.__fptForeignClone) {
            $('.actions .action-lot').not('.clone-lots').hide();
            $('.actions .clone-lots').show();
            return;
        }
        let activeSel = 0, inactiveSel = 0;
        $('.tc-item .lot-box input:checked').each(function() {
            const row = $(this).closest('.tc-item');
            if (row.hasClass('warning')) inactiveSel++; else activeSel++;
        });
        const $act = $('.actions .activate-lot');
        const $deact = $('.actions .deactivate-lot');
        if (inactiveSel > 0) { $act.show().text('Включить x' + inactiveSel); }
        else { $act.hide().text('Включить'); }
        if (activeSel > 0) { $deact.show().text('Отключить x' + activeSel); }
        else { $deact.hide().text('Отключить'); }
    }

    $(document).on('change', '.lot-box input', function() {
        // [ИСПРАВЛЕНО] Считаем только чекбоксы лотов для общего счетчика
        const totalLots = $('.tc-item .lot-box input').length;
        const checkedLots = $('.tc-item .lot-box input:checked').length;
        const selectAllCheckbox = $('#fp-tools-select-all-lots');

        $('.actions').css('display', checkedLots > 0 ? 'flex' : 'none');
        updateActivateDeactivateCounts();
        
        // Обновляем главный чекбокс "Выбрать все"
        if (totalLots > 0) {
            selectAllCheckbox.prop('checked', checkedLots === totalLots);
            selectAllCheckbox.prop('indeterminate', checkedLots > 0 && checkedLots < totalLots);
        }
        
        updatePinButtonsState();

        // [ИСПРАВЛЕНО] Логика синхронизации чекбокса категории
        const $offer = $(this).closest('.offer');
        if ($offer.length > 0) {
            const $categoryCheckbox = $offer.find('.fp-tools-category-selector input');
            // Считаем только лоты внутри данной категории
            const totalInCategory = $offer.find('.tc-item .lot-box input').length;
            const checkedInCategory = $offer.find('.tc-item .lot-box input:checked').length;

            if (checkedInCategory === 0) {
                $categoryCheckbox.prop('checked', false).prop('indeterminate', false);
            } else if (checkedInCategory === totalInCategory) {
                $categoryCheckbox.prop('checked', true).prop('indeterminate', false);
            } else {
                $categoryCheckbox.prop('checked', false).prop('indeterminate', true);
            }
        }
    });
    
    $(document).on('click', 'a.tc-item', function(e) {
        if (!$('#fp-tools-selection-controls').is(':visible')) {
            return;
        }
        if (e.target.tagName === 'A' && e.target.closest('a.tc-item') !== e.target || $(e.target).closest('.lot-box').length > 0) {
            if ($(e.target).closest('.lot-box').length > 0) {
                 const checkbox = $(this).find('input[type="checkbox"]');
                 checkbox.prop('checked', !checkbox.prop('checked'));
                 checkbox.trigger('change');
            }
            return;
        }
        e.preventDefault();
        const checkbox = $(this).find('input[type="checkbox"]');
        checkbox.prop('checked', !checkbox.prop('checked'));
        checkbox.trigger('change');
    });

    const $actionsBar = $('.actions');
    const $logElement = $actionsBar.find('.log');
    const $actionButtons = $actionsBar.find('.action-lot');

    function getCsrfToken() {
        try {
            const appDataString = document.body.getAttribute('data-app-data');
            const appData = JSON.parse(appDataString);
            return appData['csrf-token'];
        } catch (e) {
            const errorMsg = `Критическая ошибка: ${e.message}`;
            updateLog(errorMsg, true);
            if (typeof showNotification === 'function') showNotification(errorMsg, true);
            return null;
        }
    }

    function updateLog(message, isError = false) {
        $logElement.text(message).css('color', isError ? '#ff6b6b' : '#ccc');
    }

    function toggleActions(disabled) {
        $actionButtons.prop('disabled', disabled);
        $actionsBar.css('cursor', disabled ? 'wait' : 'default');
    }

    async function getLotParams(nodeId, offerId) {
        const url = `https://funpay.com/lots/offerEdit?node=${nodeId}&offer=${offerId}&location=offer`;
        try {
            const response = await fetch(url);
            if (!response.ok) throw new Error(`Ошибка сети: ${response.status}`);
            const html = await response.text();

            const doc = new DOMParser().parseFromString(html, 'text/html');
            const form = doc.querySelector(".form-offer-editor");
            if (!form) throw new Error("Форма редактирования лота не найдена.");

            const formData = new FormData(form);
            formData.delete('csrf_token');
            formData.delete('location');
            return new URLSearchParams(formData).toString();
        } catch (error) {
            throw error;
        }
    }

    async function processPinAction(isPinning) {
        const selectedCheckboxes = $('.tc-item .lot-box input:checked').get(); // [ИСПРАВЛЕНО]
        if (selectedCheckboxes.length === 0) return;
    
        toggleActions(true);
        let { fpToolsPinnedLots = [] } = await chrome.storage.local.get('fpToolsPinnedLots');
        const pinnedOfferIds = new Set(fpToolsPinnedLots.map(l => l.offerId));
        let changesMade = 0;
    
        for (const checkbox of selectedCheckboxes) {
            const $lotLink = $(checkbox).closest('a.tc-item');
            const offerLink = $lotLink.attr('href');
            const offerIdMatch = offerLink.match(/(?:offer=|id=)(\d+)/);
            const offerId = offerIdMatch ? offerIdMatch[1] : null;
    
            if (!offerId) continue;
    
            if (isPinning) {
                if (!pinnedOfferIds.has(offerId)) {
                    const $offerBlock = $lotLink.closest('.offer');
                    const gameName = $offerBlock.find('.offer-list-title h3 a').text().trim();
                    const nodeIdMatch = $offerBlock.find('.offer-list-title a').attr('href').match(/\/(?:lots|chips)\/(\d+)/);
                    const nodeId = nodeIdMatch ? nodeIdMatch[1] : null;
    
                    const descElement = $lotLink.find('.tc-desc');
                    const priceElement = $lotLink.find('.tc-price');

                    if (gameName && nodeId && descElement.length && priceElement.length) {
                        const cleanLotHtml = $('<a>', { href: offerLink, class: 'tc-item' })
                            .append(descElement.clone())
                            .append(priceElement.clone())
                            .prop('outerHTML');

                        fpToolsPinnedLots.push({
                            offerId: offerId,
                            nodeId: nodeId,
                            gameName: gameName,
                            html: cleanLotHtml
                        });
                        pinnedOfferIds.add(offerId);
                        changesMade++;
                    }
                }
            } else { 
                const initialLength = fpToolsPinnedLots.length;
                fpToolsPinnedLots = fpToolsPinnedLots.filter(l => l.offerId !== offerId);
                if (fpToolsPinnedLots.length < initialLength) {
                    changesMade++;
                }
            }
        }
    
        if (changesMade > 0) {
            await chrome.storage.local.set({ fpToolsPinnedLots });
            
            // Remove old container and rebuild
            $('#fp-tools-pinned-lots-container').remove();
            await displayPinnedLotsOnLoad();

            // Re-attach checkbox cells to newly inserted pinned lots
            if ($('#fp-tools-selection-controls').is(':visible')) {
                $('#fp-tools-pinned-lots-container .tc-item').each(function() {
                    if ($(this).find('.action-lots-checkbox-cell').length === 0) {
                        const checkboxCell = $('<div class="action-lots-checkbox-cell"><label class="lot-box"><input type="checkbox" hidden /><span class="lot-mark"></span></label></div>');
                        $(this).prepend(checkboxCell);
                    }
                });
            }
            
            showNotification(isPinning ? `Закреплено ${changesMade} лот(ов).` : `Откреплено ${changesMade} лот(ов).`);
        }
    
        $('.lot-box input:checked').prop('checked', false).trigger('change');
        toggleActions(false);
    }
    
    async function processSelectedLots(actionType) {
        const selectedCheckboxes = $('.tc-item .lot-box input:checked').get(); // [ИСПРАВЛЕНО]
        if (selectedCheckboxes.length === 0) return;

        const csrfToken = getCsrfToken();
        if (!csrfToken) return;

        toggleActions(true);
        let successCount = 0;
        let errorCount = 0;

        const isProfileSalesPage = window.location.pathname.includes('/users/');
        
        for (const checkbox of selectedCheckboxes) {
            const $lotLink = $(checkbox).closest('a.tc-item');
            const lotName = $lotLink.find(".tc-desc-text").text().trim();
            const offerLink = $lotLink.attr('href');

            // FIX 2.8.8 (№6): по статусу строки пропускаем неприменимые лоты:
            //  - "deactivate" не трогает уже отключённые (.warning),
            //  - "activate" не трогает уже активные (без .warning).
            const isInactiveRow = $lotLink.hasClass('warning');
            if (actionType === 'deactivate' && isInactiveRow) continue;
            if (actionType === 'activate' && !isInactiveRow) continue;

            if (!offerLink) {
                errorCount++;
                continue;
            }

            const offerIdMatch = offerLink.match(/(?:offer=|id=)(\d+)/);
            const offerId = offerIdMatch ? offerIdMatch[1] : $lotLink.data('offer');
            
            let nodeId;
            if (isProfileSalesPage) {
                const $offerBlock = $lotLink.closest('.offer');
                const categoryLink = $offerBlock.find('.offer-list-title a');
                if (categoryLink.length > 0) {
                    const nodeIdMatch = categoryLink.attr('href').match(/\/(?:lots|chips)\/(\d+)/);
                    nodeId = nodeIdMatch ? nodeIdMatch[1] : null;
                } else if ($offerBlock.attr('id') === 'fp-tools-pinned-lots-container') {
                    const { fpToolsPinnedLots = [] } = await chrome.storage.local.get('fpToolsPinnedLots');
                    const pinnedLot = fpToolsPinnedLots.find(l => l.offerId === offerId);
                    nodeId = pinnedLot ? pinnedLot.nodeId : null;
                }
            } else {
                const nodeIdMatch = window.location.pathname.match(/\/lots\/(\d+)/);
                nodeId = nodeIdMatch ? nodeIdMatch[1] : null;
            }

            if (!offerId || !nodeId) {
                errorCount++;
                continue;
            }

            let actionText = '';
            if (actionType === 'delete') actionText = 'Удаление';
            else if (actionType === 'duplicate') actionText = 'Дублирование';
            else if (actionType === 'deactivate') actionText = 'Отключение';
            else if (actionType === 'activate') actionText = 'Включение';
            
            updateLog(`${actionText}: ${lotName}...`);

            try {
                let response, result;
                let formData;

                if (actionType === 'delete') {
                    formData = new URLSearchParams({ 'csrf_token': csrfToken, 'offer_id': offerId, 'location': 'offer', 'deleted': '1' });
                } else {
                    const lotParams = await getLotParams(nodeId, offerId);
                    formData = new URLSearchParams(lotParams);
                    formData.set('csrf_token', csrfToken);
                    
                    if (actionType === 'duplicate') {
                        formData.set('offer_id', '0');
                        formData.set('node_id', nodeId);
                        formData.set('active', 'on');
                    } else if (actionType === 'deactivate') {
                        formData.set('active', '0'); 
                        formData.delete('deleted');
                    } else if (actionType === 'activate') {
                        formData.set('active', 'on');
                        formData.delete('deleted');
                    }
                }

                response = await fetch("https://funpay.com/lots/offerSave", {
                    method: "POST", headers: { "X-Requested-With": "XMLHttpRequest", 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' }, body: formData
                });

                if (!response.ok) throw new Error(`Ошибка сети: ${response.statusText}`);
                result = await response.json();

                if (result && (result.error === 0 || result.error === false || typeof result.error === 'undefined') && result.done !== false) {
                    successCount++;
                    
                    if (actionType === 'delete') {
                        $lotLink.fadeOut(300, function() { $(this).remove(); });
                    } else if (actionType === 'duplicate') {
                        const $clone = $lotLink.clone();
                        $clone.attr('href', '#').css('opacity', '0.7').attr('title', 'Дубликат (ID неизвестен до перезагрузки)');
                        $clone.find('input[type="checkbox"]').prop('checked', false);
                        $clone.hide().insertAfter($lotLink).fadeIn(300);
                    } else if (actionType === 'deactivate') {
                        $lotLink.css('opacity', '0.5').addClass('warning');
                        const { fpToolsDeactivatedLots = [] } = await chrome.storage.local.get('fpToolsDeactivatedLots');
                        if (!fpToolsDeactivatedLots.some(lot => lot.offerId === offerId)) {
                            fpToolsDeactivatedLots.push({ offerId, nodeId, name: lotName, deactivatedAt: Date.now() });
                            await chrome.storage.local.set({ fpToolsDeactivatedLots });
                        }
                    } else if (actionType === 'activate') {
                        // включили лот - обновляем строку и убираем его из списка отключённых
                        $lotLink.css('opacity', '1').removeClass('warning');
                        const { fpToolsDeactivatedLots = [] } = await chrome.storage.local.get('fpToolsDeactivatedLots');
                        const filtered = fpToolsDeactivatedLots.filter(lot => String(lot.offerId) !== String(offerId));
                        if (filtered.length !== fpToolsDeactivatedLots.length) {
                            await chrome.storage.local.set({ fpToolsDeactivatedLots: filtered });
                        }
                    }
                    if (actionType !== 'delete') $(checkbox).prop('checked', false).trigger('change');

                } else {
                    const errorMessage = result.msg || result.error || `Сервер вернул ошибку: ${JSON.stringify(result)}`;
                    throw new Error(errorMessage);
                }
            } catch (error) {
                updateLog(`Ошибка "${lotName}": ${error.message}`, true);
                errorCount++;
            }
            await new Promise(resolve => setTimeout(resolve, 700));
        }

        const actionTextMap = { 'delete': 'Удалено', 'duplicate': 'Дублировано', 'deactivate': 'Отключено' };
        const finalText = `Завершено. ${actionTextMap[actionType]}: ${successCount}, ошибки: ${errorCount}.`;

        if (errorCount === 0) {
            updateLog(finalText);
            if (typeof showNotification === 'function') showNotification(finalText, false);
        } else {
            if (typeof showNotification === 'function') showNotification(finalText, true);
        }
        toggleActions(false);
    }
    
    async function processPriceChange(opts) {
        // Backward-compat: allow a raw string ("+10"/"-5"/"99") too.
        let mode, value, round = false, min = NaN, max = NaN;
        if (typeof opts === 'string') {
            const s = opts.trim().replace(',', '.');
            const m = s.match(/^([+-])(\d*\.?\d+)$/);
            if (m) { mode = m[1] === '+' ? 'add' : 'sub'; value = parseFloat(m[2]); }
            else if (!isNaN(parseFloat(s)) && isFinite(s)) { mode = 'set'; value = parseFloat(s); }
            else { if (typeof showNotification === 'function') showNotification('Неверный формат', true); return; }
        } else {
            ({ mode, value, round, min, max } = opts);
        }
        if (isNaN(value)) { if (typeof showNotification === 'function') showNotification('Введите число', true); return; }

        const selectedCheckboxes = $('.tc-item .lot-box input:checked').get();
        if (selectedCheckboxes.length === 0) return;

        const csrfToken = getCsrfToken();
        if (!csrfToken) return;

        toggleActions(true);
        let successCount = 0;
        let errorCount = 0;
        const isProfileSalesPage = window.location.pathname.includes('/users/');

        for (const checkbox of selectedCheckboxes) {
            const $lotLink = $(checkbox).closest('a.tc-item');
            const lotName = $lotLink.find(".tc-desc-text").text().trim();
            const offerLink = $lotLink.attr('href');

            if (!offerLink) { errorCount++; continue; }

            const offerIdMatch = offerLink.match(/(?:offer=|id=)(\d+)/);
            const offerId = offerIdMatch ? offerIdMatch[1] : $lotLink.data('offer');

            let nodeId;
            if (isProfileSalesPage) {
                const $offerBlock = $lotLink.closest('.offer');
                const categoryLink = $offerBlock.find('.offer-list-title a');
                 if (categoryLink.length > 0) {
                    const nodeIdMatch = categoryLink.attr('href').match(/\/(?:lots|chips)\/(\d+)/);
                    nodeId = nodeIdMatch ? nodeIdMatch[1] : null;
                } else if ($offerBlock.attr('id') === 'fp-tools-pinned-lots-container') {
                    const { fpToolsPinnedLots = [] } = await chrome.storage.local.get('fpToolsPinnedLots');
                    const pinnedLot = fpToolsPinnedLots.find(l => l.offerId === offerId);
                    nodeId = pinnedLot ? pinnedLot.nodeId : null;
                }
            } else {
                const nodeIdMatch = window.location.pathname.match(/\/lots\/(\d+)/);
                nodeId = nodeIdMatch ? nodeIdMatch[1] : null;
            }

            if (!offerId || !nodeId) { errorCount++; continue; }

            updateLog(`Изменение цены: ${lotName}...`);

            try {
                const lotParams = await getLotParams(nodeId, offerId);
                const formData = new URLSearchParams(lotParams);
                const currentPrice = parseFloat(formData.get('price'));
                if (isNaN(currentPrice)) throw new Error("Не удалось получить текущую цену.");

                const newPrice = computeNewPrice(currentPrice, mode, value, round, min, max);
                if (isNaN(newPrice)) throw new Error('Не удалось вычислить цену.');

                formData.set('price', newPrice.toFixed(2));
                formData.set('csrf_token', csrfToken);

                const response = await fetch("https://funpay.com/lots/offerSave", {
                    method: "POST", headers: { "X-Requested-With": "XMLHttpRequest", 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' }, body: formData
                });

                if (!response.ok) throw new Error(`Ошибка сети: ${response.statusText}`);
                const result = await response.json();

                if (result && (result.error === 0 || result.error === false)) {
                    successCount++;
                    $lotLink.find('.tc-price').text(`${newPrice.toFixed(2)} ₽`);
                } else {
                    throw new Error(result.msg || 'Ошибка API FunPay');
                }
            } catch (error) {
                updateLog(`Ошибка "${lotName}": ${error.message}`, true);
                errorCount++;
            }
            await new Promise(resolve => setTimeout(resolve, 700));
        }

        const finalText = `Завершено. Цены изменены: ${successCount}, ошибки: ${errorCount}.`;
        if (typeof showNotification === 'function') showNotification(finalText, errorCount > 0);
        updateLog(finalText, errorCount > 0);
        toggleActions(false);
    }
    
    $actionsBar.on('click', '.pin-lot', () => processPinAction(true));
    $actionsBar.on('click', '.unpin-lot', () => processPinAction(false));
    $actionsBar.on('click', '.delete-lot', () => processSelectedLots('delete'));
    $actionsBar.on('click', '.dublicate', () => processSelectedLots('duplicate'));
    $actionsBar.on('click', '.deactivate-lot', () => processSelectedLots('deactivate'));
    $actionsBar.on('click', '.activate-lot', () => processSelectedLots('activate'));

    // Чужой профиль: копирование выбранных лотов к себе через клон-бэкенд.
    $actionsBar.on('click', '.clone-lots', async function () {
        const selected = $('.tc-item .lot-box input:checked').get();
        if (!selected.length) { updateLog('Не выбрано ни одного лота.', true); return; }
        const offerIds = selected.map(chk => {
            const $a = $(chk).closest('a.tc-item');
            const href = $a.attr('href') || '';
            const m = href.match(/[?&]id=(\d+)/) || href.match(/offer=(\d+)/) || ($a.attr('data-offer') ? [null, $a.attr('data-offer')] : null);
            return m ? m[1] : null;
        }).filter(Boolean);
        if (!offerIds.length) { updateLog('Не удалось определить ID лотов.', true); return; }
        if (!confirm(`Скопировать ${offerIds.length} лот(ов) к себе? Они будут созданы на твоём аккаунте.`)) return;

        toggleActions(true);
        let ok = 0, fail = 0;
        for (let i = 0; i < offerIds.length; i++) {
            const id = offerIds[i];
            updateLog(`Копирую ${i + 1}/${offerIds.length} (#${id})…`);
            try {
                await fptCloneOneForeign(id);
                ok++;
            } catch (e) {
                fail++;
                console.warn('FP Tools clone fail', id, e);
            }
        }
        updateLog(`Готово: ${ok} создано, ${fail} с ошибкой.`, fail > 0);
        if (typeof showNotification === 'function') showNotification(`Копирование: ${ok} ок, ${fail} ошибок`, fail > 0);
        toggleActions(false);
    });

    
    $(document).on('click', '.actions .price-editor', function() {
        $('#fp-price-editor-overlay').css('display', 'flex').hide().fadeIn(200);
        if (typeof window.refreshPriceEditorPreviews === 'function') window.refreshPriceEditorPreviews();
    });
    
    $('#fp-price-editor-apply').on('click', function() {
        const mode  = $('.fp-pe-mode.active').data('mode') || 'set';
        const value = parseFloat($('#fp-price-change-input').val());
        const round = $('#fp-pe-round').is(':checked');
        const min   = parseFloat($('#fp-pe-min').val());
        const max   = parseFloat($('#fp-pe-max').val());
        if (isNaN(value)) { if (typeof showNotification === 'function') showNotification('Введите число', true); return; }
        $('#fp-price-editor-overlay').fadeOut(200);
        processPriceChange({ mode, value, round, min, max });
    });
}

async function reactivateLot(offerId, nodeId, button) {
    button.disabled = true;
    button.textContent = '...';
    
    function getCsrfToken() {
        const appData = JSON.parse(document.body.dataset.appData);
        return appData['csrf-token'];
    }
    
    try {
        const csrfToken = getCsrfToken();
        if (!csrfToken) throw new Error("Не удалось получить CSRF-токен");
        
        const lotParams = await (await fetch(`https://funpay.com/lots/offerEdit?node=${nodeId}&offer=${offerId}&location=offer`)).text();
        const doc = new DOMParser().parseFromString(lotParams, 'text/html');
        const form = doc.querySelector(".form-offer-editor");
        if (!form) throw new Error("Форма не найдена.");

        const formData = new URLSearchParams(new FormData(form));
        formData.set('csrf_token', csrfToken);
        formData.set('active', 'on');
        formData.delete('deleted');

        const response = await fetch("https://funpay.com/lots/offerSave", {
            method: "POST", headers: { "X-Requested-With": "XMLHttpRequest", 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' }, body: formData
        });

        if (!response.ok) throw new Error(`Ошибка сети: ${response.statusText}`);
        const result = await response.json();

        if (result && (result.error === 0 || result.error === false)) {
            const { fpToolsDeactivatedLots = [] } = await chrome.storage.local.get('fpToolsDeactivatedLots');
            const updatedList = fpToolsDeactivatedLots.filter(lot => String(lot.offerId) !== String(offerId));
            await chrome.storage.local.set({ fpToolsDeactivatedLots: updatedList });

            // если этот лот виден на странице - обновляем его строку (снимаем неактивный вид)
            document.querySelectorAll(`a.tc-item[data-offer="${offerId}"], .tc-item[data-offer="${offerId}"]`).forEach(el => {
                el.classList.remove('warning');
                el.style.opacity = '1';
            });
            $(button).closest('.fp-reactivate-item').fadeOut(300, function() { 
                $(this).remove();
                if ($('.fp-reactivate-list').children().length === 0) {
                    $('.fp-reactivate-list').html('<li style="text-align:center; color:#888;">Пока нет отключенных лотов</li>');
                }
            });
            if (typeof showNotification === 'function') showNotification('Лот включен!', false);
        } else {
            throw new Error(result.msg || 'Ошибка API FunPay');
        }
    } catch (error) {
        button.disabled = false;
        button.textContent = 'Включить';
        if (typeof showNotification === 'function') showNotification(`Ошибка: ${error.message}`, true);
    }
}

function createReactivationPopup() {
    if ($('#fp-reactivate-popup-overlay').length > 0) return;

    const popupHtml = `
        <div class="fp-reactivate-popup-overlay" id="fp-reactivate-popup-overlay">
            <div class="fp-reactivate-popup">
                <div class="fp-reactivate-popup-header">
                    <h3>Включить лоты</h3>
                    <button class="fp-reactivate-popup-close">&times;</button>
                </div>
                <ul class="fp-reactivate-list"></ul>
            </div>
        </div>
    `;
    $('body').append(popupHtml);

    $('#fp-reactivate-popup-overlay').on('click', function(e) {
        if ($(e.target).is('#fp-reactivate-popup-overlay') || $(e.target).is('.fp-reactivate-popup-close')) {
            $(this).fadeOut(200);
        }
    });
    
    $('.fp-reactivate-list').on('click', '.fp-reactivate-btn', function() {
        const item = $(this).closest('.fp-reactivate-item');
        const offerId = item.attr('data-offer-id');
        const nodeId = item.attr('data-node-id');
        reactivateLot(offerId, nodeId, this);
    });
}

function createPriceEditorPopup() {
    if ($('#fp-price-editor-overlay').length > 0) return;
    const popupHtml = `
        <div id="fp-price-editor-overlay">
            <div id="fp-price-editor-popup">
                <div class="fp-pe-head">
                    <h3>Редактор цен</h3>
                    <button id="fp-price-editor-close" class="fp-pe-x">&times;</button>
                </div>
                <p class="fp-pe-sub">Применится ко всем выбранным лотам.</p>

                <label class="fp-pe-label">Что сделать с ценой</label>
                <div class="fp-pe-modes">
                    <button class="fp-pe-mode active" data-mode="set">Установить =</button>
                    <button class="fp-pe-mode" data-mode="add">Прибавить +</button>
                    <button class="fp-pe-mode" data-mode="sub">Вычесть −</button>
                    <button class="fp-pe-mode" data-mode="pct_up">Поднять %</button>
                    <button class="fp-pe-mode" data-mode="pct_down">Снизить %</button>
                </div>

                <div class="fp-pe-row">
                    <input type="number" step="0.01" id="fp-price-change-input" placeholder="0">
                    <span class="fp-pe-unit" id="fp-pe-unit">₽</span>
                </div>

                <div class="fp-pe-opts">
                    <label class="fp-pe-check"><input type="checkbox" id="fp-pe-round"> Округлять до целого</label>
                    <label class="fp-pe-minmax">не ниже <input type="number" step="0.01" id="fp-pe-min" placeholder="-"></label>
                    <label class="fp-pe-minmax">не выше <input type="number" step="0.01" id="fp-pe-max" placeholder="-"></label>
                </div>

                <div class="fp-pe-preview-head">Предпросмотр (<span id="fp-pe-sel-count">0</span> выбрано):</div>
                <div class="fp-pe-preview-list" id="fp-pe-preview-list"></div>

                <div class="price-editor-actions">
                    <button id="fp-price-editor-cancel">Отмена</button>
                    <button id="fp-price-editor-apply">Применить</button>
                </div>
            </div>
        </div>
    `;
    $('body').append(popupHtml);

    const recalcPreview = () => {
        const mode = $('.fp-pe-mode.active').data('mode') || 'set';
        const v = parseFloat($('#fp-price-change-input').val());
        const round = $('#fp-pe-round').is(':checked');
        const mn = parseFloat($('#fp-pe-min').val());
        const mx = parseFloat($('#fp-pe-max').val());
        $('#fp-pe-unit').text((mode === 'pct_up' || mode === 'pct_down') ? '%' : '₽');

        const selected = $('.tc-item .lot-box input:checked').get();
        $('#fp-pe-sel-count').text(selected.length);
        const $list = $('#fp-pe-preview-list').empty();

        if (selected.length === 0) {
            $list.html('<div class="fp-pe-preview-empty">Лоты не выбраны - выберите лоты на странице.</div>');
            return;
        }

        selected.forEach((checkbox) => {
            const $lotLink = $(checkbox).closest('a.tc-item');
            const name = ($lotLink.find('.tc-desc-text').text().trim()) || 'Лот';
            const priceText = $lotLink.find('.tc-price').first().text().replace(/\s+/g, ' ').trim();
            const m = priceText.match(/([\d.,]+)/);
            const current = m ? parseFloat(m[1].replace(',', '.')) : NaN;

            let out = computeNewPrice(current, mode, v, round, mn, mx);
            const curStr = isNaN(current) ? '-' : current;
            const outStr = isNaN(out) ? (isNaN(current) ? '-' : current) : out;
            const changed = !isNaN(current) && !isNaN(out) && out !== current;

            const row = $(`
                <div class="fp-pe-preview-row">
                    <span class="fp-pe-preview-name"></span>
                    <span class="fp-pe-preview-prices">
                        <span class="fp-pe-old">${curStr} ₽</span>
                        <span class="fp-pe-arrow">→</span>
                        <b class="fp-pe-new ${changed ? 'fp-pe-new-changed' : ''}">${outStr} ₽</b>
                    </span>
                </div>
            `);
            row.find('.fp-pe-preview-name').text(name);
            $list.append(row);
        });
    };
    // Allow the open handler to refresh previews against the current selection.
    window.refreshPriceEditorPreviews = recalcPreview;

    $('#fp-price-editor-overlay').on('click', '.fp-pe-mode', function () {
        $('.fp-pe-mode').removeClass('active');
        $(this).addClass('active');
        recalcPreview();
    });
    $('#fp-price-editor-overlay').on('input', '#fp-price-change-input, #fp-pe-min, #fp-pe-max', recalcPreview);
    $('#fp-price-editor-overlay').on('change', '#fp-pe-round', recalcPreview);

    $('#fp-price-editor-overlay').on('click', function(e) {
        if ($(e.target).is('#fp-price-editor-overlay')) $(this).fadeOut(200);
    });
    $('#fp-price-editor-cancel, #fp-price-editor-close').on('click', function() {
        $('#fp-price-editor-overlay').fadeOut(200);
    });
    recalcPreview();
}

// Shared price math for editor + preview.
function computeNewPrice(current, mode, value, round, min, max) {
    if (isNaN(value)) return NaN;
    let np;
    switch (mode) {
        case 'set':      np = value; break;
        case 'add':      np = current + value; break;
        case 'sub':      np = current - value; break;
        case 'pct_up':   np = current * (1 + value / 100); break;
        case 'pct_down': np = current * (1 - value / 100); break;
        default:         np = value;
    }
    np = Math.max(0, np);
    if (!isNaN(min)) np = Math.max(min, np);
    if (!isNaN(max)) np = Math.min(max, np);
    return round ? Math.round(np) : Math.round(np * 100) / 100;
}

async function showReactivationPopup() {
    let { fpToolsDeactivatedLots = [] } = await chrome.storage.local.get('fpToolsDeactivatedLots');

    // FIX 2.8.8 (№6): синхронизация со статусом на странице. Если лот, который мы
    // когда-то отключали через расширение, сейчас ВИДЕН на странице и АКТИВЕН
    // (строка .tc-item без класса .warning) - значит пользователь включил его сам
    // на FunPay. Убираем такой лот из списка отключённых, чтобы он не висел в меню.
    const activeOnPage = new Set();
    document.querySelectorAll('a.tc-item[data-offer], .tc-item[data-offer]').forEach(el => {
        const oid = el.getAttribute('data-offer');
        if (oid && !el.classList.contains('warning')) activeOnPage.add(String(oid));
    });
    const cleaned = fpToolsDeactivatedLots.filter(l => !(l && activeOnPage.has(String(l.offerId))));
    if (cleaned.length !== fpToolsDeactivatedLots.length) {
        fpToolsDeactivatedLots = cleaned;
        await chrome.storage.local.set({ fpToolsDeactivatedLots: cleaned });
    }

    const list = $('.fp-reactivate-list');
    list.empty();

    // Собираем: отключённые через расширение + все неактивные (.warning) на странице.
    const merged = new Map(); // offerId -> { offerId, nodeId, name, deactivatedAt }

    fpToolsDeactivatedLots.forEach(lot => {
        if (lot && lot.offerId != null) merged.set(String(lot.offerId), { ...lot });
    });

    document.querySelectorAll('a.tc-item.warning[data-offer], .tc-item.warning[data-offer]').forEach(el => {
        const offerId = el.getAttribute('data-offer');
        if (!offerId) return;
        const href = el.getAttribute('href') || '';
        const nodeMatch = href.match(/[?&]node=(\d+)/);
        const nodeId = nodeMatch ? nodeMatch[1] : (el.getAttribute('data-node') || '');
        const name = (el.querySelector('.tc-desc-text')?.textContent || '').trim() || ('Лот #' + offerId);
        if (!merged.has(String(offerId))) {
            merged.set(String(offerId), { offerId, nodeId, name, deactivatedAt: null });
        } else {
            const ex = merged.get(String(offerId));
            if (!ex.name) ex.name = name;
            if (!ex.nodeId) ex.nodeId = nodeId;
        }
    });

    const items = Array.from(merged.values());

    if (items.length === 0) {
        list.html('<li style="text-align:center; color:#888;">Пока нет отключенных лотов</li>');
    } else {
        items.sort((a, b) => (b.deactivatedAt || 0) - (a.deactivatedAt || 0));
        items.forEach(lot => {
            const dateLine = lot.deactivatedAt
                ? `Отключен: ${new Date(lot.deactivatedAt).toLocaleString()}`
                : 'Неактивен на FunPay';
            const itemHtml = `
                <li class="fp-reactivate-item" data-offer-id="${lot.offerId}" data-node-id="${lot.nodeId || ''}">
                    <div class="fp-reactivate-info">
                        <div class="name">${lot.name}</div>
                        <div class="date">${dateLine}</div>
                    </div>
                    <button class="fp-reactivate-btn">Включить</button>
                </li>
            `;
            list.append(itemHtml);
        });
    }

    // центрируем (overlay - flex-контейнер; fadeIn ставил display:block и окно
    // уезжало в левый верхний угол).
    $('#fp-reactivate-popup-overlay').css('display', 'flex').hide().fadeIn(200);
}