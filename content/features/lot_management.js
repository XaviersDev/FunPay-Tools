'use strict';

async function displayPinnedLotsOnLoad() {
    const { fpToolsPinnedLots = [] } = await chrome.storage.local.get('fpToolsPinnedLots');
    if (fpToolsPinnedLots.length === 0) return;

    const profileDataContainer = $('.profile-data-container');
    if (!profileDataContainer.length) return;

    let pinnedLotsHtml = '';
    fpToolsPinnedLots.forEach(lotData => {
        const $lot = $(lotData.html);
        $lot.attr('data-fp-tooltip', lotData.gameName);
        $lot.addClass('fp-tooltip-host');
        pinnedLotsHtml += $lot[0].outerHTML;
    });

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
        const isProfileSalesPage = window.location.pathname.includes('/users/') && !document.querySelector('.chat-profile-container');
        const isCategoryTradePage = window.location.pathname.includes('/lots/') && window.location.pathname.includes('/trade');

        if (!isProfileSalesPage && !isCategoryTradePage) return;
        if (document.getElementById('fp-tools-select-lots-btn')) return;

        if (isProfileSalesPage) {
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
                reactivateBtn.removeClass('btn-block').addClass('btn-xs');
                controlsContainer.addClass('fp-tools-selection-controls-profile');
                offersHeader.append(selectBtn, reactivateBtn, controlsContainer.hide());
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

        setupActionProcessing();
    });
}

function toggleSelectionMode(enable) {
    if (enable) {
        if ($('.tc-header').length && $('.action-lots-header-cell').length === 0) {
            $('.tc-header').prepend('<div class="action-lots-header-cell"></div>');
        }
        
        $('.tc-item').each(function() {
            if ($(this).find('.action-lots-checkbox-cell').length === 0) {
                const checkboxCell = $('<div class="action-lots-checkbox-cell"><label class="lot-box"><input type="checkbox" hidden /><span class="lot-mark"></span></label></div>');
                $(this).prepend(checkboxCell);
            }
        });
    } else {
        $('.lot-box input:checked').prop('checked', false).trigger('change');
        $('.action-lots-header-cell, .action-lots-checkbox-cell').remove();
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

function setupActionProcessing() {
    if ($('.actions').length === 0) {
        $(`
            <div class="actions">
                <span class="log">Выберите действие</span>
                <div>
                    <button class="action-lot price-editor">Редактор цен</button>
                    <button class="action-lot pin-lot" style="background: #27ae60;">Закрепить</button>
                    <button class="action-lot unpin-lot" style="background: #c0392b;">Открепить</button>
                    <button class="action-lot dublicate">Дублировать</button>
                    <button class="action-lot deactivate-lot">Отключить</button>
                    <button class="action-lot delete-lot">Удалить</button>
                </div>
            </div>
        `).appendTo('body').hide();
    }

    $(document).on('change', '.lot-box input', function() {
        const total = $('.lot-box input').length;
        const checked = $('.lot-box input:checked').length;
        const selectAllCheckbox = $('#fp-tools-select-all-lots');

        $('.actions').css('display', checked > 0 ? 'flex' : 'none');

        if (total > 0) {
            selectAllCheckbox.prop('checked', checked === total);
            selectAllCheckbox.prop('indeterminate', checked > 0 && checked < total);
        }
        
        updatePinButtonsState();
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
        const selectedCheckboxes = $('.lot-box input:checked').get();
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
            
            $('#fp-tools-pinned-lots-container').remove();
            await displayPinnedLotsOnLoad();
            
            showNotification(isPinning ? `Закреплено ${changesMade} лот(ов).` : `Откреплено ${changesMade} лот(ов).`);
        }
    
        $('.lot-box input:checked').prop('checked', false).trigger('change');
        toggleActions(false);
    }
    
    async function processSelectedLots(actionType) {
        const selectedCheckboxes = $('.lot-box input:checked').get();
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
                        $lotLink.css('opacity', '0.5');
                        const { fpToolsDeactivatedLots = [] } = await chrome.storage.local.get('fpToolsDeactivatedLots');
                        if (!fpToolsDeactivatedLots.some(lot => lot.offerId === offerId)) {
                            fpToolsDeactivatedLots.push({ offerId, nodeId, name: lotName, deactivatedAt: Date.now() });
                            await chrome.storage.local.set({ fpToolsDeactivatedLots });
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
    
    async function processPriceChange(changeValueStr) {
        changeValueStr = changeValueStr.trim().replace(',', '.');
        const adjustmentMatch = changeValueStr.match(/^([+-])(\d*\.?\d+)$/);
        const isExactPrice = !isNaN(parseFloat(changeValueStr)) && isFinite(changeValueStr) && !adjustmentMatch;

        if (!adjustmentMatch && !isExactPrice) {
            if (typeof showNotification === 'function') showNotification('Неверный формат. Используйте +10, -5.5 или 99', true);
            return;
        }

        const selectedCheckboxes = $('.lot-box input:checked').get();
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

                let newPrice;
                if (isExactPrice) {
                    newPrice = parseFloat(changeValueStr);
                } else if (adjustmentMatch) {
                    const operation = adjustmentMatch[1];
                    const value = parseFloat(adjustmentMatch[2]);
                    newPrice = operation === '+' ? currentPrice + value : currentPrice - value;
                }

                formData.set('price', Math.max(0, newPrice).toFixed(2));
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
    
    $(document).on('click', '.actions .price-editor', function() {
        $('#fp-price-editor-overlay').fadeIn(200);
    });
    
    $('#fp-price-editor-apply').on('click', function() {
        const value = $('#fp-price-change-input').val();
        $('#fp-price-editor-overlay').fadeOut(200);
        processPriceChange(value);
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
            
            $(button).closest('.fp-reactivate-item').fadeOut(300, function() { 
                $(this).remove();
                if ($('.fp-reactivate-list').children().length === 0) {
                    $('.fp-reactivate-list').html('<li style="text-align:center; color:#888;">Нет отключенных лотов (которые вы отключали через выбор лотов от расширения).</li>');
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
                <h3>Редактор цен</h3>
                <p>Установите новую цену для всех выбранных лотов двумя способами:</p>
                <div class="price-editor-instructions">
                    <div>
                        <strong>1. Изменить цену:</strong>
                        <span>Используйте <strong>+</strong> или <strong>-</strong> для увеличения или уменьшения текущей цены.</span>
                        <em>Пример: <code>+10</code> или <code>-5.5</code></em>
                    </div>
                    <div>
                        <strong>2. Установить точную цену:</strong>
                        <span>Просто введите число, и оно станет новой ценой для всех лотов.</span>
                        <em>Пример: <code>99</code> или <code>14.50</code></em>
                    </div>
                </div>
                <input type="text" id="fp-price-change-input" placeholder="+10 / -5.5 / 99">
                <div class="price-editor-actions">
                    <button id="fp-price-editor-cancel">Отмена</button>
                    <button id="fp-price-editor-apply">Применить</button>
                </div>
            </div>
        </div>
    `;
    $('body').append(popupHtml);
    
    $('#fp-price-editor-overlay').on('click', function(e) {
        if ($(e.target).is('#fp-price-editor-overlay')) {
            $(this).fadeOut(200);
        }
    });
    $('#fp-price-editor-cancel').on('click', function() {
        $('#fp-price-editor-overlay').fadeOut(200);
    });
}

async function showReactivationPopup() {
    const { fpToolsDeactivatedLots = [] } = await chrome.storage.local.get('fpToolsDeactivatedLots');
    const list = $('.fp-reactivate-list');
    list.empty();
    
    if (fpToolsDeactivatedLots.length === 0) {
        list.html('<li style="text-align:center; color:#888;">Нет отключенных лотов. (которые вы отключали через выбор лотов от расширения)</li>');
    } else {
        fpToolsDeactivatedLots.sort((a, b) => b.deactivatedAt - a.deactivatedAt).forEach(lot => {
            const date = new Date(lot.deactivatedAt).toLocaleString();
            const itemHtml = `
                <li class="fp-reactivate-item" data-offer-id="${lot.offerId}" data-node-id="${lot.nodeId}">
                    <div class="fp-reactivate-info">
                        <div class="name">${lot.name}</div>
                        <div class="date">Отключен: ${date}</div>
                    </div>
                    <button class="fp-reactivate-btn">Включить</button>
                </li>
            `;
            list.append(itemHtml);
        });
    }
    
    $('#fp-reactivate-popup-overlay').fadeIn(200);
}
