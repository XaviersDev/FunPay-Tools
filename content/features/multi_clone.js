// content/features/multi_clone.js
// На странице ЧУЖОГО профиля (funpay.com/users/ID/, где ID ≠ наш) добавляет чекбоксы
// к лотам и кнопку «Копировать выбранные» — массовое серверное клонирование лотов.
// Использует тот же бэкенд, что и одиночное клонирование (cloneGetSource → cloneCreateLot).

(function () {
    'use strict';

    function ownUserId() {
        const a = document.querySelector('.user-link-dropdown[href*="/users/"]');
        const m = a?.getAttribute('href')?.match(/\/users\/(\d+)/);
        return m ? m[1] : null;
    }
    function profileUserId() {
        const m = window.location.pathname.match(/\/users\/(\d+)/);
        return m ? m[1] : null;
    }
    function isForeignProfile() {
        const pid = profileUserId();
        if (!pid) return false;
        const own = ownUserId();
        return own && pid !== own;
    }

    function offerIdOf(a) {
        const m = (a.getAttribute('href') || '').match(/[?&]id=(\d+)/);
        return m ? m[1] : null;
    }

    const selected = new Set();

    function ensureStyles() {
        if (document.getElementById('fpt-mclone-styles')) return;
        const s = document.createElement('style');
        s.id = 'fpt-mclone-styles';
        s.textContent = `
        .fpt-mc-chk{margin-right:8px;width:16px;height:16px;cursor:pointer;vertical-align:middle;accent-color:#7c5cff;flex:0 0 auto;}
        a.tc-item.fpt-mc-row{display:flex;align-items:center;}
        .fpt-mc-bar{position:sticky;top:0;z-index:50;display:flex;gap:10px;align-items:center;flex-wrap:wrap;
            background:var(--fpt-surface,#fff);border:1px solid var(--fpt-border,#e3e3ea);border-radius:12px;
            padding:10px 14px;margin:0 0 12px;font-family:Inter,'Segoe UI',sans-serif;box-shadow:0 4px 14px rgba(0,0,0,.06);}
        .fpt-mc-bar b{font-size:13px;}
        .fpt-mc-btn{padding:7px 14px;border-radius:9px;border:1px solid var(--fpt-border,#dadbe2);background:var(--fpt-surface-2,#fff);
            color:inherit;font-size:13px;font-weight:600;cursor:pointer;}
        .fpt-mc-btn.primary{background:#7c5cff;border-color:#7c5cff;color:#fff;}
        .fpt-mc-btn.primary:disabled{opacity:.5;cursor:default;}
        .fpt-mc-btn:hover:not(:disabled){border-color:#7c5cff;}
        .fpt-mc-count{font-size:12px;color:var(--fpt-text-muted,#8a8a94);}
        .fpt-mc-log{max-height:160px;overflow:auto;font-size:12px;line-height:1.5;width:100%;margin-top:4px;
            border-top:1px solid var(--fpt-border,#ececf0);padding-top:8px;display:none;}
        .fpt-mc-log .ok{color:#16a34a;} .fpt-mc-log .err{color:#ef4444;}
        `;
        document.head.appendChild(s);
    }

    function updateBar() {
        const bar = document.getElementById('fpt-mc-bar');
        if (!bar) return;
        const cnt = bar.querySelector('.fpt-mc-count');
        const btn = bar.querySelector('.fpt-mc-go');
        cnt.textContent = selected.size ? `Выбрано: ${selected.size}` : 'Отметьте лоты галочками';
        btn.disabled = selected.size === 0;
    }

    function addCheckboxes() {
        document.querySelectorAll('a.tc-item[href*="lots/offer?id="]').forEach(a => {
            if (a.dataset.fptMc) return;
            const offerId = offerIdOf(a);
            if (!offerId) return;
            a.dataset.fptMc = '1';
            a.classList.add('fpt-mc-row');
            const chk = document.createElement('input');
            chk.type = 'checkbox';
            chk.className = 'fpt-mc-chk';
            chk.title = 'Выбрать для копирования';
            // не давать клику по чекбоксу открывать лот
            chk.addEventListener('click', (e) => {
                e.stopPropagation();
                if (chk.checked) selected.add(offerId); else selected.delete(offerId);
                updateBar();
            });
            a.insertBefore(chk, a.firstChild);
        });
    }

    function buildBar() {
        if (document.getElementById('fpt-mc-bar')) return;
        const firstOffer = document.querySelector('.offer');
        if (!firstOffer) return;
        ensureStyles();
        const bar = document.createElement('div');
        bar.id = 'fpt-mc-bar';
        bar.className = 'fpt-mc-bar';
        bar.innerHTML = `
            <b>📋 Копирование лотов</b>
            <span class="fpt-mc-count">Отметьте лоты галочками</span>
            <button class="fpt-mc-btn fpt-mc-all" type="button" style="margin-left:auto;">Выбрать все</button>
            <button class="fpt-mc-btn fpt-mc-none" type="button">Снять все</button>
            <button class="fpt-mc-btn primary fpt-mc-go" type="button" disabled>Копировать выбранные</button>
            <div class="fpt-mc-log"></div>`;
        firstOffer.parentElement.insertBefore(bar, firstOffer);

        bar.querySelector('.fpt-mc-all').addEventListener('click', () => {
            document.querySelectorAll('.fpt-mc-chk').forEach(c => {
                if (!c.checked) { c.checked = true; const a = c.closest('a.tc-item'); const id = offerIdOf(a); if (id) selected.add(id); }
            });
            updateBar();
        });
        bar.querySelector('.fpt-mc-none').addEventListener('click', () => {
            document.querySelectorAll('.fpt-mc-chk').forEach(c => c.checked = false);
            selected.clear(); updateBar();
        });
        bar.querySelector('.fpt-mc-go').addEventListener('click', runBatchClone);
        updateBar();
    }

    async function cloneOne(offerId) {
        // 1) читаем источник + решённые поля
        const src = await chrome.runtime.sendMessage({ action: 'cloneGetSource', offerId });
        if (!src || !src.success) throw new Error(src?.error || 'не удалось прочитать лот');
        if (src.source?.isChips) throw new Error('лот из раздела валюты — пропущен');
        if (!src.fields) throw new Error(src.formError || 'не удалось подобрать поля категории');

        const s = src.source;
        const fields = { ...src.fields };
        fields['offer_id'] = '0';
        fields['fields[summary][ru]'] = s.summary || '';
        fields['fields[desc][ru]'] = s.description || '';
        // EN: только если реально отличается, иначе оставляем пустым
        fields['fields[summary][en]'] = (s.enDiffers && s.summary_en) ? s.summary_en : '';
        fields['fields[desc][en]'] = (s.enDiffers && s.desc_en) ? s.desc_en : '';
        if (s.finalPrice != null && !Number.isNaN(s.finalPrice) && s.finalPrice > 0) fields['price'] = String(s.finalPrice);
        else if (s.rawPrice) fields['price'] = String(s.rawPrice);
        fields['amount'] = (s.amount && /^\d+$/.test(s.amount)) ? s.amount : (fields['amount'] || '1');
        fields['active'] = 'on';
        fields['secrets'] = fields['secrets'] || '';
        fields['fields[images]'] = fields['fields[images]'] || '';

        const res = await chrome.runtime.sendMessage({ action: 'cloneCreateLot', fields, location: 'trade' });
        if (!res || !res.success) throw new Error(res?.error || 'ошибка создания');
        return res.newId;
    }

    async function runBatchClone() {
        const bar = document.getElementById('fpt-mc-bar');
        const go = bar.querySelector('.fpt-mc-go');
        const logEl = bar.querySelector('.fpt-mc-log');
        const ids = [...selected];
        if (!ids.length) return;
        if (!confirm(`Скопировать ${ids.length} лот(ов) к себе? Они будут созданы на твоём аккаунте.`)) return;

        go.disabled = true;
        logEl.style.display = 'block';
        logEl.innerHTML = '';
        let ok = 0, fail = 0;
        const log = (html, cls) => { const d = document.createElement('div'); if (cls) d.className = cls; d.innerHTML = html; logEl.appendChild(d); logEl.scrollTop = logEl.scrollHeight; return d; };

        const DELAY_MS = 3500; // пауза между лотами, чтобы не словить лимит FunPay
        // оценка общего времени: на каждый лот ~1.5с работа + задержка между ними
        const perLot = DELAY_MS + 1500;
        const totalMs = ids.length * perLot;
        const fmtTime = (ms) => {
            const sec = Math.max(0, Math.round(ms / 1000));
            const m = Math.floor(sec / 60), s = sec % 60;
            return m > 0 ? `${m} мин ${s} сек` : `${s} сек`;
        };
        const finishAt = Date.now() + totalMs;
        const etaEl = log(`Примерное время: <b>${fmtTime(totalMs)}</b>. Завершу примерно к ${new Date(finishAt).toLocaleTimeString()}.`);
        const etaTimer = setInterval(() => {
            const left = finishAt - Date.now();
            if (left > 0) etaEl.innerHTML = `Осталось примерно: <b>${fmtTime(left)}</b> (готово к ${new Date(finishAt).toLocaleTimeString()}).`;
        }, 1000);

        for (let i = 0; i < ids.length; i++) {
            const id = ids[i];
            log(`(${i + 1}/${ids.length}) Лот #${id}…`);
            try {
                const newId = await cloneOne(id);
                ok++;
                log(`✓ #${id} → создан${newId ? ' #' + newId : ''}`, 'ok');
            } catch (e) {
                fail++;
                log(`✗ #${id}: ${e.message}`, 'err');
            }
            // пауза перед следующим лотом (не после последнего)
            if (i < ids.length - 1) {
                const waitEl = log(`⏳ Пауза ${Math.round(DELAY_MS / 1000)} сек, чтобы не словить лимит FunPay…`, 'wait');
                let remain = Math.round(DELAY_MS / 1000);
                const cd = setInterval(() => { remain--; if (remain > 0) waitEl.textContent = `⏳ Пауза ${remain} сек…`; }, 1000);
                await new Promise(r => setTimeout(r, DELAY_MS));
                clearInterval(cd);
                waitEl.remove();
            }
        }
        clearInterval(etaTimer);
        etaEl.remove();
        log(`<b>Готово: ${ok} создано, ${fail} с ошибкой.</b>`);
        showNotification?.(`Копирование завершено: ${ok} ок, ${fail} ошибок`, fail > 0);
        go.disabled = false;
    }

    function init() {
        if (!isForeignProfile()) return;
        const tryBuild = () => {
            if (!document.querySelector('.offer')) return;
            buildBar();
            addCheckboxes();
        };
        tryBuild();
        const root = document.getElementById('content') || document.body;
        new MutationObserver(tryBuild).observe(root, { childList: true, subtree: true });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
