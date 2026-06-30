// content/features/order_lot_copy.js
// =============================================================================
// FP Tools — «Копировать лот» со страницы КУПЛЕННОГО заказа (/orders/XXXX/).
//
// На странице заказа есть: игра, категория, сервер, краткое и подробное
// описание, и (если это был товар с автовыдачей) сам выданный товар в блоке
// «Оплаченный товар» (.order-secrets-box). Кнопка собирает эти данные и кладёт
// их в то же хранилище, что и обычное клонирование лота (fpToolsCopiedLotData),
// поэтому на странице создания/редактирования лота появится привычная плашка
// «Вставить данные лота» — и summary/описание, и автовыдача подставятся сразу.
//
// Проблема: на странице заказа доступно только РУССКОЕ название/описание, а в
// форме лота есть поля RU и EN. Поэтому EN-версии получаем автопереводом через
// бесплатный гугл-эндпойнт translate_a (тот же «хак», что уже используется в
// расширении для перевода сообщений).
// =============================================================================

(function () {
    'use strict';

    const COPIED_KEY = 'fpToolsCopiedLotData'; // тот же ключ, что у lot_cloning

    // Только страница конкретного заказа: /orders/CODE/ (не /orders/ и не /orders/trade)
    function isOrderPage() {
        return /^\/orders\/[A-Z0-9]{6,}\/?$/i.test(window.location.pathname);
    }

    function txt(el) { return el ? el.textContent.trim() : ''; }

    // Найти значение param-item по заголовку <h5> (Игра/Категория/Сервер/…)
    function paramByTitle(title) {
        const items = document.querySelectorAll('.param-item');
        for (const it of items) {
            const h = it.querySelector('h5');
            if (h && h.textContent.trim().toLowerCase() === title.toLowerCase()) {
                // значение — это блок после h5 (а не сам h5)
                const val = it.querySelector('.text-bold, div:not(:has(h5))');
                // надёжнее: взять весь текст item минус заголовок
                const clone = it.cloneNode(true);
                const hh = clone.querySelector('h5'); if (hh) hh.remove();
                return clone.textContent.trim();
            }
        }
        return '';
    }

    // Собрать данные лота со страницы заказа
    function scrapeOrder() {
        const game = paramByTitle('Игра');
        const category = paramByTitle('Категория');
        const server = paramByTitle('Сервер');
        const summary = paramByTitle('Краткое описание');

        // подробное описание — берём innerText (с переносами строк)
        let description = '';
        const items = document.querySelectorAll('.param-item');
        for (const it of items) {
            const h = it.querySelector('h5');
            if (h && h.textContent.trim().toLowerCase() === 'подробное описание') {
                const body = it.querySelector('div');
                description = body ? String(body.innerText != null ? body.innerText : body.textContent).trim() : '';
                break;
            }
        }

        // автовыдача: блок «Оплаченный товар» (.order-secrets-box) — каждый <li>
        // это один товар. Берём data-copy кнопки (точный текст без иконок) либо
        // текст .secret-placeholder.
        const secretsArr = [];
        document.querySelectorAll('.order-secrets-box .order-secrets-list li').forEach(li => {
            const btn = li.querySelector('.btn-copy[data-copy]');
            let s = btn ? btn.getAttribute('data-copy') : '';
            if (!s) s = txt(li.querySelector('.secret-placeholder')) || txt(li);
            if (s) secretsArr.push(s.trim());
        });
        const secrets = secretsArr.join('\n');

        // nodeId (категория) — из ссылки «Категория» вида /lots/221/
        let nodeId = '';
        let categoryName = category;
        const items2 = document.querySelectorAll('.param-item');
        for (const it of items2) {
            const h = it.querySelector('h5');
            if (h && h.textContent.trim().toLowerCase() === 'категория') {
                const a = it.querySelector('a[href*="/lots/"]');
                if (a) {
                    const m = a.getAttribute('href').match(/\/lots\/(\d+)\//);
                    if (m) nodeId = m[1];
                    categoryName = a.textContent.trim() || categoryName;
                }
                break;
            }
        }

        // цена и валюта (блок «Сумма»: <span class="h1 ...">5.88</span> <strong>₽</strong>)
        let rawPrice = '', priceCurrency = '';
        for (const it of items2) {
            const h = it.querySelector('h5');
            if (h && h.textContent.trim().toLowerCase() === 'сумма') {
                const num = it.querySelector('.h1, .text-bold');
                if (num) rawPrice = num.textContent.replace(/[^\d.,]/g, '').replace(',', '.');
                const cur = it.textContent;
                if (cur.includes('₽')) priceCurrency = 'rub';
                else if (cur.includes('$')) priceCurrency = 'usd';
                else if (cur.includes('€')) priceCurrency = 'eur';
                break;
            }
        }

        // продавец (из шапки чата, если есть)
        let sellerName = '', sellerId = '';
        const sellerLink = document.querySelector('.chat-header .media-user-name a[href*="/users/"]');
        if (sellerLink) {
            sellerName = sellerLink.textContent.trim();
            const sm = sellerLink.getAttribute('href').match(/\/users\/(\d+)/);
            if (sm) sellerId = sm[1];
        }

        // включим сервер в описание, если он есть и не упомянут (полезно для копии)
        return { game, category: categoryName, nodeId, server, summary, description, secrets, rawPrice, priceCurrency, sellerName, sellerId };
    }

    // ── Google-перевод (бесплатный эндпойнт translate_a, как в chat_reply) ──
    async function gTranslate(text, sl, tl) {
        text = String(text || '').trim();
        if (!text) return '';
        try {
            const url = 'https://translate.googleapis.com/translate_a/single?client=gtx'
                + '&sl=' + encodeURIComponent(sl || 'ru')
                + '&tl=' + encodeURIComponent(tl || 'en')
                + '&dt=t&q=' + encodeURIComponent(text);
            const r = await fetch(url);
            if (!r.ok) return '';
            const j = await r.json();
            // j[0] — массив сегментов [ [translated, original, ...], ... ]
            const out = (j && j[0]) ? j[0].map(s => s[0]).join('') : '';
            return (out && out !== text) ? out : '';
        } catch (_) { return ''; }
    }

    // ── UI: кнопка под блоком «Оплаченный товар», на всю его ширину ──
    function ensureStyles() {
        if (document.getElementById('fpt-olc-styles')) return;
        const s = document.createElement('style');
        s.id = 'fpt-olc-styles';
        s.textContent = `
        .fpt-olc-btn{display:flex;width:100%;box-sizing:border-box;align-items:center;justify-content:center;gap:7px;
            margin:6px 0 14px;padding:5px 16px;border-radius:8px;
            border:1px solid var(--fpt-border,#dcdce4);background:var(--fpt-surface-2,#fafafd);color:var(--fpt-text,#16181d);
            font-size:12px;font-weight:600;line-height:1.2;cursor:pointer;transition:border-color .14s,color .14s,background .14s;}
        .fpt-olc-btn:hover{border-color:#2563eb;color:#2563eb;}
        .fpt-olc-btn .material-symbols-rounded{font-size:15px;}
        .fpt-olc-btn:disabled{opacity:.6;cursor:default;}
        .fpt-olc-spin{width:14px;height:14px;border:2px solid rgba(37,99,235,.35);border-top-color:#2563eb;
            border-radius:50%;animation:fptOlcSpin .7s linear infinite;display:inline-block;}
        @keyframes fptOlcSpin{to{transform:rotate(360deg)}}
        `;
        document.head.appendChild(s);
    }

    function toast(msg, isErr) {
        if (typeof showNotification === 'function') { showNotification(msg, !!isErr); return; }
        // запасной мини-тост
        const t = document.createElement('div');
        t.textContent = msg;
        t.style.cssText = 'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);z-index:2147483600;'
            + 'background:' + (isErr ? '#c0392b' : '#1f2937') + ';color:#fff;padding:10px 16px;border-radius:10px;'
            + 'font-size:13px;font-family:Inter,sans-serif;box-shadow:0 6px 20px rgba(0,0,0,.3);';
        document.body.appendChild(t);
        setTimeout(() => t.remove(), 2600);
    }

    async function doCopy(btn) {
        const data = scrapeOrder();
        if (!data.summary && !data.description && !data.secrets) {
            toast('Не нашёл данных лота на странице заказа.', true);
            return;
        }
        const orig = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = '<span class="fpt-olc-spin"></span> Перевод EN…';

        // Автоперевод RU→EN (страница заказа — только RU)
        const [summaryEn, descEn] = await Promise.all([
            gTranslate(data.summary, 'ru', 'en'),
            gTranslate(data.description, 'ru', 'en')
        ]);

        // запускаем ТОТ ЖЕ визард создания лота, что и при копировании со страницы
        // лота — он построит форму категории по nodeId и даст кнопку «Создать лот».
        if (typeof openCloneWizardFromOrder === 'function') {
            btn.innerHTML = '<span class="fpt-olc-spin"></span> Открываю мастер…';
            try {
                await openCloneWizardFromOrder({
                    nodeId: data.nodeId,
                    categoryName: data.category,
                    summary_ru: data.summary,
                    desc_ru: data.description,
                    summary_en: summaryEn || data.summary,
                    desc_en: descEn || data.description,
                    secrets: data.secrets || '',
                    rawPrice: data.rawPrice || '',
                    priceCurrency: data.priceCurrency || '',
                    sellerName: data.sellerName || '',
                    sellerId: data.sellerId || ''
                });
            } catch (e) {
                toast('Не удалось открыть мастер: ' + (e && e.message ? e.message : e), true);
            }
            btn.disabled = false; btn.innerHTML = orig;
            return;
        }

        // запасной путь: если визард недоступен — сохраняем для вставки в форму
        const payload = {
            summary: data.summary, summaryEn: summaryEn || '',
            description: data.description, descriptionEn: descEn || '',
            secrets: data.secrets || '', autoDelivery: !!data.secrets,
            source: 'order_page', timestamp: Date.now()
        };
        try {
            await chrome.storage.local.set({ [COPIED_KEY]: payload });
            toast('Лот скопирован. Откройте создание лота и нажмите «Вставить».');
        } catch (e) {
            toast('Не удалось сохранить данные: ' + (e && e.message ? e.message : e), true);
        }
        btn.disabled = false; btn.innerHTML = orig;
    }

    function mount() {
        if (!isOrderPage()) return;
        if (document.getElementById('fpt-olc-btn')) return;
        // показываем кнопку только если на странице есть данные лота
        if (!document.querySelector('.param-item') && !document.querySelector('.order-secrets-box')) return;

        ensureStyles();
        const btn = document.createElement('button');
        btn.id = 'fpt-olc-btn';
        btn.type = 'button';
        btn.className = 'fpt-olc-btn';
        btn.title = 'Скопировать лот из этого заказа (создаёт копию через мастер, с EN-переводом и автовыдачей)';
        btn.innerHTML = '<span class="material-symbols-rounded">content_copy</span> Копировать лот';
        btn.addEventListener('click', () => doCopy(btn));

        // Предпочтительно: прямо ПОД блоком «Оплаченный товар», на всю его ширину.
        const secretsBox = document.querySelector('.order-secrets-box');
        if (secretsBox) {
            secretsBox.insertAdjacentElement('afterend', btn);
            return;
        }
        // запасной вариант: после шапки заказа
        const header = document.querySelector('h1.page-header');
        if (header) header.insertAdjacentElement('afterend', btn);
    }

    function init() {
        if (!isOrderPage()) return;
        mount();
        // заказ-страница может дорисовываться — наблюдаем недолго
        if (typeof MutationObserver === 'undefined') return;
        let tries = 0;
        const obs = new MutationObserver(() => { mount(); if (++tries > 60 || document.getElementById('fpt-olc-btn')) obs.disconnect(); });
        obs.observe(document.body, { childList: true, subtree: true });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
