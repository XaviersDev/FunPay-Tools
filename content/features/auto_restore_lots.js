async function checkAndRestoreLots() {
    const { fpToolsAutoRestoreEnabled, fpToolsAutoDisableEnabled } =
        await chrome.storage.local.get(['fpToolsAutoRestoreEnabled', 'fpToolsAutoDisableEnabled']);

    if (!fpToolsAutoRestoreEnabled && !fpToolsAutoDisableEnabled) return;

    try {
        const appData = JSON.parse(document.body?.dataset?.appData || '{}');
        const d = Array.isArray(appData) ? appData[0] : appData;
        const userId = d.userId;
        if (!userId) return;

        
        const profileRes = await fetch(`https://funpay.com/users/${userId}/`, { credentials: 'include' });
        if (!profileRes.ok) return;
        const profileHtml = await profileRes.text();

        
        const lots = await new Promise((resolve) => {
            chrome.runtime.sendMessage({ action: 'getUserLotsList', userId }, (res) => {
                resolve(res || []);
            });
        });

        if (!lots.length) return;

        
        const { fpToolsAutoDeliveryLots = {} } = await chrome.storage.local.get('fpToolsAutoDeliveryLots');

        for (const lot of lots) {
            const deliveryConfig = fpToolsAutoDeliveryLots[String(lot.id)];

            
            const lotDoc = new DOMParser().parseFromString(profileHtml, 'text/html');
            const lotEl  = lotDoc.querySelector(`a.tc-item[href*="id=${lot.id}"]`);
            if (!lotEl) continue;

            const isActive = !lotEl.closest('.offer')?.classList.contains('deactivated') &&
                             !lotEl.style.opacity?.includes('0.5');

            if (deliveryConfig) {
                const productCount = deliveryConfig.productCount ?? Infinity;

                
                if (fpToolsAutoDisableEnabled && productCount === 0 && isActive &&
                    deliveryConfig.autoDisableEnabled !== false) {
                    await toggleLotActive(lot.id, lot.nodeId, false, d['csrf-token']);
                    showNotification(`Лот "${lot.title}" деактивирован: товары закончились`, false);
                    console.log(`FP Tools AutoDisable: деактивирован лот ${lot.id}`);
                }

                
                if (fpToolsAutoRestoreEnabled && productCount > 0 && !isActive &&
                    deliveryConfig.autoRestoreEnabled !== false) {
                    await toggleLotActive(lot.id, lot.nodeId, true, d['csrf-token']);
                    showNotification(`Лот "${lot.title}" восстановлен: товары пополнены`, false);
                    console.log(`FP Tools AutoRestore: восстановлен лот ${lot.id}`);
                }
            } else if (fpToolsAutoRestoreEnabled && !isActive) {
                
                await toggleLotActive(lot.id, lot.nodeId, true, d['csrf-token']);
                console.log(`FP Tools AutoRestore: глобальное восстановление лота ${lot.id}`);
            }
        }
    } catch (e) {
        console.error('FP Tools AutoRestore: ошибка', e.message);
    }
}

async function toggleLotActive(offerId, nodeId, active, csrfToken) {
    const goldenKeyRes = await chrome.runtime.sendMessage({ action: 'getGoldenKey' });
    if (!goldenKeyRes?.success) throw new Error('Нет golden_key');

    
    const editRes = await chrome.runtime.sendMessage({ action: 'getLotForExport', nodeId, offerId: String(offerId) });
    if (!editRes?.success) throw new Error('Не удалось загрузить данные лота');

    const formData = new URLSearchParams(editRes.data);
    if (active) formData.set('active', 'on');
    else        formData.delete('active');
    formData.set('offer_id', String(offerId));
    formData.set('csrf_token', csrfToken);

    const res = await fetch('https://funpay.com/lots/offerSave', {
        method: 'POST',
        headers: {
            'X-Requested-With': 'XMLHttpRequest',
            'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        },
        credentials: 'include',
        body: formData
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const result = await res.json();
    if (result.error !== 0 && result.error !== false) {
        throw new Error(result.msg || 'Ошибка API');
    }
}

chrome.runtime.onMessage.addListener((request) => {
    if (request.action === 'fpToolsCheckRestoreLots') {
        setTimeout(checkAndRestoreLots, 5000); 
    }
});
