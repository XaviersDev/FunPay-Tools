// content/features/chat_reply.js
// =============================================================================
// Ответы на сообщения в стиле Telegram + перевод отдельного сообщения.
//
// • При наведении на сообщение появляются мини-иконки СЛЕВА от даты:
//   «ответить» всегда, «перевести» - только если собеседник пишет на английском.
// • «Ответить» → НАД всем полем ввода (как в Telegram) появляется тонкая плашка:
//   ник автора + текст + крестик. Поле ввода не меняется - пользователь пишет сам.
// • При отправке сообщение уходит в формате:
//       ╭─ ⤸ <цитата>
//       ╰ <мой текст>
// • У кого ЕСТЬ расширение - формат заменяется тонкой кликабельной плашкой в
//   ПАРСИНГОВЫХ цветах. Клик прокручивает к исходному сообщению.
// • Автор цитаты берётся ИЗ ПЕРЕПИСКИ, а не из футера собеседника.
// =============================================================================

(function () {
    'use strict';

    const REPLY_OPEN = '╭─ ⤸ ';
    const REPLY_CONT = '╰ ';

    let activeReply = null;

    function chatInput() {
        return document.querySelector('.chat-form-input .form-control, .chat-form textarea[name="content"]');
    }
    function chatForm() {
        const inp = chatInput();
        return inp ? inp.closest('form') : null;
    }
    function esc(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, ch => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        }[ch]));
    }

    function interlocutorIsEnglish() {
        const items = document.querySelectorAll('.chat-detail-list .param-item, .chat-detail .param-item');
        for (const it of items) {
            const h = it.querySelector('h5');
            if (h && /язык собеседника/i.test(h.textContent)) {
                const val = it.querySelector('div');
                if (val && /english|англ/i.test(val.textContent)) return true;
                return false;
            }
        }
        return false;
    }

    function resolveAuthor(item) {
        let el = item;
        for (let i = 0; el && i < 80; i++) {
            const link = el.querySelector && el.querySelector('.chat-msg-author-link');
            if (link) {
                const txt = link.querySelector('.fpt-epic-text');
                return (txt ? txt.textContent : link.textContent).trim();
            }
            el = el.previousElementSibling;
        }
        const head = document.querySelector('.chat-header .media-user-name a, .chat-header .media-user-name');
        return head ? head.textContent.trim() : 'Сообщение';
    }

    function messageText(item) {
        const t = item.querySelector('.chat-msg-text');
        // Сообщение-картинка без текста: вернём метку, чтобы цитата не была пустой.
        if (!t) {
            const img = item.querySelector('.chat-img, .chat-message img, a[href*="/s/chat/"]');
            return img ? 'Изображение' : '';
        }
        const rest = t.querySelector('.fpt-reply-rest');
        if (rest) {
            const v = rest.innerText.trim();
            if (v) return v;
        } else {
            const clone = t.cloneNode(true);
            clone.querySelectorAll('.fp-trans-wrap, .fpt-reply-card, .fpt-reply-rest').forEach(n => n.remove());
            const v = clone.innerText.trim();
            if (v) return v;
        }
        // текст пуст - возможно это картинка
        const img = item.querySelector('.chat-img, .chat-message img, a[href*="/s/chat/"]');
        return img ? 'Изображение' : '';
    }

    function ensureStyles() {
        if (document.getElementById('fpt-reply-styles')) return;
        const s = document.createElement('style');
        s.id = 'fpt-reply-styles';
        s.textContent = `
        .fpt-msg-tools{display:none;align-items:center;gap:1px;vertical-align:middle;
            margin-right:6px;line-height:1;}
        .chat-msg-item:hover .fpt-msg-tools{display:inline-flex;}
        .fpt-msg-tool{width:18px !important;height:18px !important;display:inline-flex;align-items:center;justify-content:center;
            border:none;background:transparent;color:var(--fpt-text-muted,#8a8f9c);
            border-radius:4px;cursor:pointer;padding:0 !important;margin:0 !important;transition:color .12s,background .12s;
            line-height:1 !important;min-width:0 !important;box-shadow:none !important;vertical-align:middle;}
        .fpt-msg-tool:hover{color:var(--fpt-text,#cfd2dc);background:var(--fpt-hover,rgba(127,127,127,0.16));}
        .fpt-msg-tool .material-symbols-rounded{font-size:14px !important;line-height:1 !important;}

        /* всплывающая кнопка «Ответить» над выделенным текстом */
        #fpt-sel-reply{position:fixed;z-index:100002;display:none;align-items:center;gap:4px;
            background:var(--fpt-surface,#1a1c26);border:1px solid var(--fpt-border,rgba(127,127,127,0.3));
            color:var(--fpt-text,#d8dae8);border-radius:7px;padding:5px 10px;font-size:12px;font-weight:600;
            cursor:pointer;box-shadow:0 4px 14px rgba(0,0,0,0.35);font-family:Inter,'Segoe UI',sans-serif;
            white-space:nowrap;user-select:none;}
        #fpt-sel-reply:hover{border-color:var(--fpt-text-muted,#8a8f9c);}
        #fpt-sel-reply .material-symbols-rounded{font-size:15px;line-height:1;}

        .fpt-reply-bar{display:flex;align-items:center;gap:0;margin:0;
            background:var(--fpt-surface,rgba(127,127,127,0.08));
            border:1px solid var(--fpt-border,rgba(127,127,127,0.25));
            border-left:3px solid var(--fpt-text-muted,#8a8f9c);
            border-radius:7px;overflow:hidden;width:100%;box-sizing:border-box;}
        .fpt-reply-bar-body{flex:1;min-width:0;padding:4px 9px;}
        .fpt-reply-bar-author{font-size:11.5px;font-weight:700;color:var(--fpt-text,#cfd2dc);
            display:flex;align-items:center;gap:4px;line-height:1.3;}
        .fpt-reply-bar-author .material-symbols-rounded{font-size:13px;color:var(--fpt-text-muted,#8a8f9c);}
        .fpt-reply-bar-text{font-size:11.5px;color:var(--fpt-text-muted,#8a8f9c);overflow:hidden;
            text-overflow:ellipsis;white-space:nowrap;line-height:1.3;}
        .fpt-reply-bar-close{width:30px;align-self:stretch;border:none;background:transparent;
            color:var(--fpt-text-muted,#8a8f9c);font-size:16px;cursor:pointer;flex-shrink:0;}
        .fpt-reply-bar-close:hover{color:var(--fpt-text,#fff);background:var(--fpt-accent-soft,rgba(127,127,127,0.15));}

        .fpt-reply-card{display:inline-flex;align-items:stretch;margin-bottom:4px;cursor:pointer;
            background:var(--fpt-surface,rgba(127,127,127,0.10));border-radius:5px;overflow:hidden;
            border-left:3px solid var(--fpt-text-muted,#8a8f9c);max-width:100%;width:auto;vertical-align:top;}
        .fpt-reply-card:hover{background:var(--fpt-hover,rgba(127,127,127,0.16));}
        .fpt-reply-card-body{padding:2px 8px;min-width:0;display:flex;flex-direction:column;justify-content:center;}
        .fpt-reply-card-author{font-size:10.5px;font-weight:700;color:var(--fpt-text,#cfd2dc);line-height:1.2;
            overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
        .fpt-reply-card-text{font-size:11px;color:var(--fpt-text-muted,#8a8f9c);overflow:hidden;
            text-overflow:ellipsis;white-space:nowrap;max-width:260px;line-height:1.2;}
        .fpt-reply-rest{white-space:pre-wrap;word-break:break-word;}
        .contact-item-message .fpt-prev-reply-ico{font-size:13px;vertical-align:middle;margin-right:3px;
            opacity:0.7;position:relative;top:-1px;}
        .contact-item-message .fpt-prev-reply-text{vertical-align:middle;}
        .chat-msg-item.fpt-reply-flash{animation:fptReplyFlash 1.1s ease;}
        @keyframes fptReplyFlash{0%,100%{background:transparent;}30%{background:var(--fpt-accent-soft,rgba(127,127,127,0.22));}}
        `;
        (document.head || document.documentElement).appendChild(s);
    }

    // Находит «головной» элемент склейки: ближайшее выше (включая себя)
    // сообщение, у которого есть .chat-msg-with-head (т.е. ник/дата).
    function headOfGroup(item) {
        let el = item;
        for (let i = 0; el && i < 80; i++) {
            if (el.classList && el.classList.contains('chat-msg-with-head')) return el;
            el = el.previousElementSibling;
        }
        return item;
    }

    // Все сообщения одной склейки: от головы (с ником) до следующей головы.
    function groupItems(headItem) {
        const items = [headItem];
        let el = headItem.nextElementSibling;
        while (el && el.classList && el.classList.contains('chat-msg-item') &&
               !el.classList.contains('chat-msg-with-head')) {
            items.push(el);
            el = el.nextElementSibling;
        }
        return items;
    }

    // Объединённый текст всей группы (для ответа/перевода целиком).
    function groupText(headItem) {
        return groupItems(headItem).map(it => messageText(it)).filter(Boolean).join('\n');
    }

    function addToolsTo(item) {
        // Кнопки только на ГОЛОВНОМ сообщении группы (там, где есть ник и дата).
        // Склеенные сообщения без шапки отдельных кнопок не получают -
        // ответ/перевод работают на всю группу целиком.
        if (!item.classList.contains('chat-msg-with-head')) return;

        const dateEl = item.querySelector('.chat-msg-date');
        if (!dateEl || !dateEl.parentNode) return;
        if (dateEl.parentNode.querySelector(':scope > .fpt-msg-tools')) return;

        const tools = document.createElement('span');
        tools.className = 'fpt-msg-tools';

        const rpBtn = document.createElement('button');
        rpBtn.type = 'button';
        rpBtn.className = 'fpt-msg-tool';
        rpBtn.title = 'Ответить';
        rpBtn.innerHTML = '<span class="material-symbols-rounded">reply</span>';
        rpBtn.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); startReplyGroup(item); });
        tools.appendChild(rpBtn);

        if (interlocutorIsEnglish()) {
            const trBtn = document.createElement('button');
            trBtn.type = 'button';
            trBtn.className = 'fpt-msg-tool';
            trBtn.title = 'Перевести сообщение';
            trBtn.innerHTML = '<span class="material-symbols-rounded">translate</span>';
            trBtn.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); translateGroup(item); });
            tools.appendChild(trBtn);
        }

        // Вставляем СЛЕВА от даты.
        dateEl.parentNode.insertBefore(tools, dateEl);
    }

    // Перевод одного сообщения (низкоуровневый помощник).
    async function translateInto(item) {
        const textEl = item.querySelector('.chat-msg-text');
        if (!textEl) return false;
        if (textEl.querySelector('.fp-trans-wrap')) {
            textEl.querySelectorAll('.fp-trans-wrap').forEach(n => n.remove());
            return null; // означает «сняли перевод»
        }
        const orig = messageText(item);
        if (!orig) return false;
        let translated = null;
        if (typeof translateText === 'function') translated = await translateText(orig);
        else {
            try {
                const r = await fetch('https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=ru&dt=t&q=' + encodeURIComponent(orig));
                const j = await r.json();
                translated = j[0].map(s => s[0]).join('');
                if (translated === orig) translated = null;
            } catch (_) {}
        }
        if (!translated) translated = '(перевод недоступен)';
        const wrap = document.createElement('div');
        wrap.className = 'fp-trans-wrap';
        wrap.innerHTML = '<div class="fp-trans-divider"></div><div class="fp-trans-text">' + esc(translated) + '</div>';
        textEl.appendChild(wrap);
        return true;
    }

    // Перевод ВСЕЙ склеенной группы. Если хоть у одного уже есть перевод - снимаем у всех.
    async function translateGroup(headItem) {
        const items = groupItems(headItem);
        const anyTranslated = items.some(it => it.querySelector('.chat-msg-text .fp-trans-wrap'));
        if (anyTranslated) {
            items.forEach(it => it.querySelectorAll('.fp-trans-wrap').forEach(n => n.remove()));
            return;
        }
        for (const it of items) { await translateInto(it); }
    }

    function startReplyGroup(headItem) {
        activeReply = { author: resolveAuthor(headItem), text: groupText(headItem), msgId: headItem.id || '' };
        renderReplyBar();
        const inp = chatInput();
        if (inp) inp.focus();
    }

    function cancelReply() {
        activeReply = null;
        const bar = document.getElementById('fpt-reply-bar');
        if (bar) bar.remove();
        const wrap = document.getElementById('fpt-reply-bar-wrap');
        if (wrap) wrap.remove();
    }

    function renderReplyBar() {
        const form = chatForm();
        if (!form || !activeReply) return;

        // Якорь - внешний контейнер .chat-form (блочный). Вставляем плашку ПЕРЕД ним,
        // чтобы она была над всей областью ввода на всю ширину, а не сбоку во флексе.
        const anchor = form.closest('.chat-form') || form;

        let wrap = document.getElementById('fpt-reply-bar-wrap');
        if (!wrap) {
            wrap = document.createElement('div');
            wrap.id = 'fpt-reply-bar-wrap';
            wrap.style.cssText = 'padding:6px 10px 0;width:100%;box-sizing:border-box;';
            anchor.parentNode.insertBefore(wrap, anchor);
        }
        let bar = document.getElementById('fpt-reply-bar');
        if (!bar) {
            bar = document.createElement('div');
            bar.id = 'fpt-reply-bar';
            bar.className = 'fpt-reply-bar';
            wrap.appendChild(bar);
        }
        bar.innerHTML = `
            <div class="fpt-reply-bar-body">
                <div class="fpt-reply-bar-author"><span class="material-symbols-rounded">reply</span>${esc(activeReply.author)}</div>
                <div class="fpt-reply-bar-text">${esc(activeReply.text || '')}</div>
            </div>
            <button type="button" class="fpt-reply-bar-close" title="Отменить ответ">×</button>
        `;
        bar.querySelector('.fpt-reply-bar-close').addEventListener('click', cancelReply);
    }

    function buildSendText(typed) {
        if (!activeReply) return typed;
        const quote = (activeReply.text || '').replace(/\s+/g, ' ').trim();
        return `${REPLY_OPEN}${quote}\n${REPLY_CONT}${typed}`;
    }

    function interceptSend() {
        document.addEventListener('keydown', (e) => {
            if (e.key !== 'Enter' || e.shiftKey) return;
            const inp = e.target;
            if (!inp.matches || !inp.matches('.chat-form-input .form-control, .chat-form textarea[name="content"]')) return;
            if (!activeReply) return;
            if (e.defaultPrevented) return;
            applyReplyToInput(inp);
        }, true);

        document.addEventListener('click', (e) => {
            const btn = e.target.closest('.chat-form-btn button[type="submit"], .chat-form button.btn-round');
            if (!btn || !activeReply) return;
            const inp = chatInput();
            if (inp) applyReplyToInput(inp);
        }, true);
    }

    function applyReplyToInput(inp) {
        const typed = inp.value;
        if (!typed.trim()) return;
        inp.value = buildSendText(typed);
        window.__fptProgrammaticInput = true;
        inp.dispatchEvent(new Event('input', { bubbles: true }));
        window.__fptProgrammaticInput = false;
        cancelReply();
    }

    function renderReplyCards(scope) {
        const items = (scope && scope.querySelectorAll ? scope : document).querySelectorAll('.chat-msg-text:not([data-fpt-reply-parsed])');
        items.forEach(textEl => {
            const raw = textEl.textContent;
            const m = raw.match(/^╭─ ⤸ ([\s\S]*?)\n╰ ([\s\S]*)$/);
            textEl.dataset.fptReplyParsed = '1';
            if (!m) return;
            const quote = m[1].trim();
            const rest = m[2];

            const item = textEl.closest('.chat-msg-item');
            const target = findQuotedItem(item, quote);
            const quotedAuthor = target ? resolveAuthor(headOfGroup(target)) : '';

            const card = document.createElement('div');
            card.className = 'fpt-reply-card';
            card.dataset.fptQuote = quote;
            card.innerHTML = `
                <div class="fpt-reply-card-body">
                    <div class="fpt-reply-card-author">${esc(quotedAuthor || 'Ответ')}</div>
                    <div class="fpt-reply-card-text">${esc(quote)}</div>
                </div>`;
            card.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                const t = target || findQuotedItem(item, quote);
                if (t) flashTo(t);
            });

            textEl.textContent = '';
            textEl.appendChild(card);
            const restDiv = document.createElement('div');
            restDiv.className = 'fpt-reply-rest';
            restDiv.textContent = rest;
            textEl.appendChild(restDiv);

            // Если автора не удалось определить сразу (например, после перезагрузки
            // страницы, когда соседние сообщения ещё не отрисованы) - пробуем позже.
            if (!quotedAuthor) scheduleAuthorRetry(card, item);
        });
    }

    function scheduleAuthorRetry(card, fromItem) {
        let tries = 0;
        const tick = () => {
            if (!card.isConnected) return;
            const quote = card.dataset.fptQuote || '';
            const target = findQuotedItem(fromItem, quote);
            if (target) {
                const author = resolveAuthor(headOfGroup(target));
                if (author && author !== 'Сообщение') {
                    const aEl = card.querySelector('.fpt-reply-card-author');
                    if (aEl) aEl.textContent = author;
                    return;
                }
            }
            if (++tries < 8) setTimeout(tick, 250);
        };
        setTimeout(tick, 200);
    }

    function findQuotedItem(fromItem, quote) {
        if (!fromItem) return null;
        const list = fromItem.closest('.chat-message-list');
        if (!list) return null;
        const all = Array.from(list.querySelectorAll('.chat-msg-item'));
        const myIdx = all.indexOf(fromItem);
        const qn = quote.replace(/\s+/g, ' ').trim().toLowerCase();
        let exact = null, partial = null;
        for (let i = myIdx - 1; i >= 0; i--) {
            const t = all[i].querySelector('.chat-msg-text');
            if (!t) continue;
            const restEl = t.querySelector('.fpt-reply-rest');
            const tn = (restEl ? restEl.innerText : t.innerText).replace(/\s+/g, ' ').trim().toLowerCase();
            if (!tn) continue;
            if (tn === qn) { exact = all[i]; break; }
            if (!partial && (tn.startsWith(qn) || qn.startsWith(tn))) partial = all[i];
        }
        return exact || partial;
    }

    function flashTo(el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.classList.remove('fpt-reply-flash');
        void el.offsetWidth;
        el.classList.add('fpt-reply-flash');
    }

    // ── всплывающая кнопка «Ответить» над выделенным текстом ──────────────────
    let _selBtn = null;
    function ensureSelBtn() {
        if (_selBtn) return _selBtn;
        _selBtn = document.createElement('div');
        _selBtn.id = 'fpt-sel-reply';
        _selBtn.innerHTML = '<span class="material-symbols-rounded">reply</span>Ответить';
        document.body.appendChild(_selBtn);
        _selBtn.addEventListener('mousedown', (e) => {
            // mousedown (а не click), чтобы выделение не успело сброситься
            e.preventDefault();
            e.stopPropagation();
            const sel = window.getSelection();
            const text = sel ? String(sel).trim() : '';
            if (!text) { hideSelBtn(); return; }
            const node = sel.anchorNode;
            const item = node && (node.nodeType === 1 ? node : node.parentElement)
                ? (node.nodeType === 1 ? node : node.parentElement).closest('.chat-msg-item')
                : null;
            const head = item ? headOfGroup(item) : null;
            activeReply = {
                author: head ? resolveAuthor(head) : 'Сообщение',
                text: text,
                msgId: item ? (item.id || '') : ''
            };
            renderReplyBar();
            hideSelBtn();
            sel.removeAllRanges();
            const inp = chatInput();
            if (inp) inp.focus();
        });
        return _selBtn;
    }
    function hideSelBtn() { if (_selBtn) _selBtn.style.display = 'none'; }
    function maybeShowSelBtn() {
        const sel = window.getSelection();
        const text = sel ? String(sel).trim() : '';
        if (!text || sel.rangeCount === 0) { hideSelBtn(); return; }
        // выделение должно быть внутри переписки
        const node = sel.anchorNode;
        const host = node && (node.nodeType === 1 ? node : node.parentElement);
        if (!host || !host.closest('.chat-message-list')) { hideSelBtn(); return; }
        // не показываем над нашими же служебными плашками
        if (host.closest('.fpt-reply-card, #fpt-reply-bar')) { hideSelBtn(); return; }

        const rect = sel.getRangeAt(0).getBoundingClientRect();
        if (!rect || (!rect.width && !rect.height)) { hideSelBtn(); return; }
        const btn = ensureSelBtn();
        btn.style.display = 'inline-flex';
        const bw = btn.offsetWidth, bh = btn.offsetHeight;
        let left = rect.left + rect.width / 2 - bw / 2;
        let top = rect.top - bh - 8;
        if (top < 8) top = rect.bottom + 8;
        left = Math.max(8, Math.min(left, window.innerWidth - bw - 8));
        btn.style.left = left + 'px';
        btn.style.top = top + 'px';
    }
    function setupSelectionReply() {
        document.addEventListener('selectionchange', () => {
            // небольшая задержка, чтобы getBoundingClientRect был актуален
            setTimeout(maybeShowSelBtn, 0);
        });
        document.addEventListener('scroll', hideSelBtn, true);
        window.addEventListener('resize', hideSelBtn);
        document.addEventListener('mousedown', (e) => {
            if (_selBtn && e.target.closest && e.target.closest('#fpt-sel-reply')) return;
            // если кликнули вне выделения - спрячем (выделение всё равно сбросится)
            setTimeout(() => {
                const s = window.getSelection();
                if (!s || !String(s).trim()) hideSelBtn();
            }, 0);
        });
    }

    // ── предпросмотр ответов в списке контактов ───────────────────────────────
    // FunPay показывает в списке чатов сырой текст «╭─ ⤸ цитата ╰ ответ» одной
    // строкой. Заменяем на иконку ответа + сам ответ (часть после ╰).
    function renderContactPreviews(scope) {
        const root = scope && scope.querySelectorAll ? scope : document;
        const items = root.querySelectorAll('.contact-item-message:not([data-fpt-prev])');
        items.forEach(el => {
            const raw = el.textContent || '';
            // допускаем как многострочный, так и однострочный вариант
            const m = raw.match(/╭─\s*⤸\s*([\s\S]*?)\s*╰\s*([\s\S]*)$/);
            if (!m) { el.dataset.fptPrev = '1'; return; }
            el.dataset.fptPrev = '1';
            const replyText = (m[2] || '').replace(/\s+/g, ' ').trim() || '…';
            el.innerHTML = '';
            const ico = document.createElement('span');
            ico.className = 'material-icons fpt-prev-reply-ico';
            ico.textContent = 'reply';
            const txt = document.createElement('span');
            txt.className = 'fpt-prev-reply-text';
            txt.textContent = replyText;
            el.appendChild(ico);
            el.appendChild(txt);
        });
    }

    let _contactObs = null;
    function attachContactPreviews() {
        const cl = document.querySelector('.contact-list');
        if (!cl) return;
        renderContactPreviews(cl);
        if (cl.dataset.fptPrevBound) return;
        cl.dataset.fptPrevBound = '1';
        _contactObs = new MutationObserver(() => renderContactPreviews(cl));
        _contactObs.observe(cl, { childList: true, subtree: true, characterData: true });
    }

    function processList(list) {
        list.querySelectorAll('.chat-msg-item').forEach(addToolsTo);
        renderReplyCards(list);
    }

    let _obs = null;
    function attach() {
        const list = document.querySelector('.chat-message-list');
        if (!list) return;
        if (list.dataset.fptReplyBound) { processList(list); return; }
        list.dataset.fptReplyBound = '1';
        ensureStyles();
        processList(list);

        _obs = new MutationObserver((muts) => {
            for (const m of muts) {
                for (const node of m.addedNodes) {
                    if (node.nodeType !== 1) continue;
                    if (node.matches && node.matches('.chat-msg-item')) { addToolsTo(node); renderReplyCards(node); }
                    else if (node.querySelectorAll) { node.querySelectorAll('.chat-msg-item').forEach(addToolsTo); renderReplyCards(node); }
                }
            }
        });
        _obs.observe(list, { childList: true, subtree: true });
    }

    async function isEnabled() {
        try {
            const { fpToolsDisabledFeatures = [] } = await chrome.storage.local.get('fpToolsDisabledFeatures');
            return !Array.isArray(fpToolsDisabledFeatures) || !fpToolsDisabledFeatures.includes('chat_reply');
        } catch (_) { return true; }
    }

    async function init() {
        if (!(await isEnabled())) return;
        ensureStyles();
        if (typeof fptApplyThemeVars === 'function') {
            try { fptApplyThemeVars(); } catch (_) {}
            setTimeout(() => { try { fptApplyThemeVars(); } catch (_) {} }, 400);
        }
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden && typeof fptApplyThemeVars === 'function') { try { fptApplyThemeVars(); } catch (_) {} }
        });
        interceptSend();
        setupSelectionReply();
        attach();
        attachContactPreviews();
        const root = document.getElementById('content') || document.body;
        const ro = new MutationObserver(() => {
            const list = document.querySelector('.chat-message-list');
            if (list && !list.dataset.fptReplyBound) attach();
            const cl = document.querySelector('.contact-list');
            if (cl && !cl.dataset.fptPrevBound) attachContactPreviews();
        });
        try { ro.observe(root, { childList: true, subtree: true }); } catch (_) {}
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})();
