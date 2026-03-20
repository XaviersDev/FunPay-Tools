'use strict';

const FP_SUPPORT_BASE = 'https://support.funpay.com';
let _ticketsInited = false;
let _ticketCategories = [];
let _ticketPendingPayload = null;

// ── helpers ───────────────────────────────────────────────────────────────────

function _msg(action, extra = {}) {
    return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({ action, ...extra }, r => {
            if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
            if (r?.success === false) return reject(new Error(r.error || 'Ошибка'));
            resolve(r);
        });
    });
}

function _getUsername() {
    // Primary: DOM element always present when logged in
    const nameEl = document.querySelector('.user-link-name');
    if (nameEl?.textContent.trim()) return nameEl.textContent.trim();
    // Fallback: appData
    try {
        const d = JSON.parse(document.body.dataset.appData || '{}');
        return (Array.isArray(d) ? d[0] : d)?.userName || '';
    } catch (_) { return ''; }
}

// ── tickets list ──────────────────────────────────────────────────────────────

async function _loadTickets() {
    const list    = document.getElementById('fp-tickets-list');
    const loading = document.getElementById('fp-tickets-loading');
    const empty   = document.getElementById('fp-tickets-empty');
    if (!list) return;

    list.innerHTML = '';
    empty.style.display = 'none';
    loading.style.display = 'block';

    try {
        const { tickets } = await _msg('supportGetTickets');
        loading.style.display = 'none';

        if (!tickets.length) { empty.style.display = 'block'; return; }

        // Сортировка: сначала новые (по числовому ID)
        tickets.sort((a, b) => (b.sortKey || parseInt(b.id)) - (a.sortKey || parseInt(a.id)));

        const statusStyle = {
            'Открыт':      { bg: 'rgba(224,82,82,.15)',  color: '#e05252' },
            'В ожидании':  { bg: 'rgba(240,160,64,.15)', color: '#f0a040' },
            'Решена':      { bg: 'rgba(76,175,130,.15)', color: '#4caf82' },
            'Закрыт':      { bg: 'rgba(58,61,82,.3)',    color: '#5a5f7a' },
        };
        const closeable = new Set(['Открыт', 'В ожидании']);

        tickets.forEach(t => {
            const ss = statusStyle[t.status] || { bg: 'rgba(58,61,82,.3)', color: '#5a5f7a' };
            const card = document.createElement('div');
            card.className = 'fp-tkt-card';
            card.style.position = 'relative';

            const topRow = document.createElement('div');
            topRow.style.cssText = 'display:flex;align-items:flex-start;justify-content:space-between;gap:8px;';

            const titleSpan = document.createElement('span');
            titleSpan.style.cssText = 'font-size:12px;font-weight:500;flex:1;line-height:1.4;color:#c8cadc;';
            titleSpan.textContent = t.title || 'Заявка #' + t.id;

            const statusSpan = document.createElement('span');
            statusSpan.className = 'fp-tkt-status';
            statusSpan.style.cssText = `background:${ss.bg};color:${ss.color};`;
            statusSpan.textContent = t.status;

            topRow.appendChild(titleSpan);
            topRow.appendChild(statusSpan);

            const meta = document.createElement('div');
            meta.style.cssText = 'font-size:11px;color:#3a3d52;margin-top:5px;display:flex;align-items:center;justify-content:space-between;';

            const metaText = document.createElement('span');
            metaText.textContent = `#${t.id}${t.lastUpdate ? ' · ' + t.lastUpdate : ''}`;

            meta.appendChild(metaText);

            // Кнопка закрытия — только для активных
            if (closeable.has(t.status)) {
                const closeBtn = document.createElement('button');
                closeBtn.textContent = 'Закрыть';
                closeBtn.style.cssText = 'font-size:10px;padding:2px 8px;border-radius:4px;border:1px solid rgba(224,82,82,.5);background:rgba(224,82,82,.1);color:#e05252;cursor:pointer;flex-shrink:0;';
                closeBtn.addEventListener('click', async e => {
                    e.stopPropagation();
                    closeBtn.disabled = true;
                    closeBtn.textContent = '...';
                    try {
                        const r = await _msg('supportCloseTicket', { ticketId: t.id });
                        if (r?.success) { _loadTickets(); }
                        else { closeBtn.textContent = 'Ошибка'; closeBtn.disabled = false; }
                    } catch(_) { closeBtn.textContent = 'Ошибка'; closeBtn.disabled = false; }
                });
                meta.appendChild(closeBtn);
            }

            card.appendChild(topRow);
            card.appendChild(meta);
            card.addEventListener('click', () => _openTicket(t.id));
            list.appendChild(card);
        });
    } catch (e) {
        loading.style.display = 'none';
        list.innerHTML = `<div style="color:#e05252;font-size:12px;padding:8px;">${e.message}</div>`;
    }
}

// ── new ticket form ───────────────────────────────────────────────────────────

function _openNewTicketPanel() {
    const panel = document.getElementById('fp-new-ticket-panel');
    if (!panel) return;
    // Move panel to fp-tools-body so it covers the full popup content, not just the page div
    const body = document.querySelector('.fp-tools-body');
    if (body && panel.parentElement !== body) body.appendChild(panel);
    panel.style.display = 'flex';
    _loadCategoriesForForm();
}

function _closeNewTicketPanel() {
    const panel = document.getElementById('fp-new-ticket-panel');
    if (panel) panel.style.display = 'none';
}

async function _loadCategoriesForForm() {
    const fieldsDiv = document.getElementById('fp-new-ticket-fields');
    const submitBtn = document.getElementById('fp-new-ticket-submit');
    if (!fieldsDiv) return;
    fieldsDiv.innerHTML = '<div style="color:#3a3d52;font-size:12px;">Загрузка категорий...</div>';
    if (submitBtn) submitBtn.style.display = 'none';

    try {
        const { categories } = await _msg('supportGetCategories');
        _ticketCategories = categories;
        _renderCategorySelect(fieldsDiv, submitBtn);
    } catch (e) {
        fieldsDiv.innerHTML = `<div style="color:#e05252;font-size:12px;">${e.message}</div>`;
    }
}

function _renderCategorySelect(fieldsDiv, submitBtn) {
    fieldsDiv.innerHTML = '';

    const wrap = document.createElement('div');
    wrap.style.cssText = 'display:flex;flex-direction:column;gap:4px;';

    const lbl = document.createElement('label');
    lbl.style.cssText = 'font-size:11px;color:#6a7090;';
    lbl.textContent = 'Тип обращения';
    wrap.appendChild(lbl);

    const sel = document.createElement('select');
    sel.id = 'fp-ticket-cat-select';
    sel.className = 'fp-field-input';

    const ph = document.createElement('option');
    ph.value = ''; ph.textContent = 'Выберите...';
    sel.appendChild(ph);

    _ticketCategories.forEach(c => {
        const opt = document.createElement('option');
        opt.value = c.id; opt.textContent = c.name;
        sel.appendChild(opt);
    });
    wrap.appendChild(sel);
    fieldsDiv.appendChild(wrap);

    sel.addEventListener('change', async () => {
        // Remove old fields
        fieldsDiv.querySelectorAll('.fp-tkt-field').forEach(r => r.remove());
        if (submitBtn) submitBtn.style.display = 'none';
        if (!sel.value) return;

        const spinner = document.createElement('div');
        spinner.className = 'fp-tkt-field';
        spinner.style.cssText = 'font-size:12px;color:#3a3d52;padding:4px 0;';
        spinner.textContent = 'Загрузка полей...';
        fieldsDiv.appendChild(spinner);

        try {
            const { fields } = await _msg('supportGetFields', { categoryId: sel.value });
            spinner.remove();
            _renderFields(fields, fieldsDiv);
            if (submitBtn) submitBtn.style.display = 'block';
        } catch (e) {
            spinner.textContent = '❌ ' + e.message;
        }
    });
}

function _evaluateCondition(condition, fieldValues) {
    if (!condition) return true;
    try {
        const c = JSON.parse(condition);
        const targetName = `ticket[fields][${c.fieldId}]`;
        const cur = fieldValues[targetName] || '';
        if (c.type === 'equals') return cur === String(c.value) || parseInt(cur) === c.value;
    } catch (_) {}
    return false;
}

function _getFieldValues(container) {
    const fv = {};
    container.querySelectorAll('[data-field-id]').forEach(el => {
        if (el.dataset.fieldType === 'radio-group') {
            const checked = el.querySelector('input[type=radio]:checked');
            if (checked) fv[el.dataset.fieldId] = checked.value;
        } else if (el.value) {
            fv[el.dataset.fieldId] = el.value;
        }
    });
    return fv;
}

function _updateConditions(fieldsContainer, allFields) {
    const fv = _getFieldValues(fieldsContainer);
    allFields.forEach(f => {
        if (!f.condition) return;
        const wrap = fieldsContainer.querySelector(`[data-wrap-for="${CSS.escape(f.id)}"]`);
        if (!wrap) return;
        const show = _evaluateCondition(f.condition, fv);
        wrap.style.display = show ? 'flex' : 'none';
    });
}

function _renderFields(fields, container) {
    const username = _getUsername();

    fields.forEach(f => {
        const wrap = document.createElement('div');
        wrap.className = 'fp-tkt-field';
        wrap.dataset.wrapFor = f.id;
        wrap.style.cssText = 'display:flex;flex-direction:column;gap:2px;';
        if (f.condition) wrap.style.display = 'none'; // скрыто до оценки условия

        const lbl = document.createElement('label');
        lbl.style.cssText = 'font-size:10px;color:#6a7090;';
        lbl.textContent = f.name + (f.required ? ' *' : '');
        wrap.appendChild(lbl);

        const lname = f.name.toLowerCase();
        const autoVal = (lname.includes('ник') || lname.includes('логин') || lname.includes('login') || lname.includes('nickname')) ? username : (f.defaultValue || '');
        let input;

        if (f.type === 'select' || f.type === 'radio') {
            // Точно как в Android: Column с border, каждый option — Row с RadioButton + Text
            const col = document.createElement('div');
            col.style.cssText = 'display:flex;flex-direction:column;border:1px solid rgba(106,112,144,0.3);border-radius:4px;overflow:hidden;';
            col.dataset.fieldId = f.id;
            col.dataset.fieldType = 'radio-group';

            let currentVal = autoVal || '';

            function updateRows() {
                col.querySelectorAll('.fp-radio-row').forEach(row => {
                    const r = row.querySelector('input[type=radio]');
                    const selected = r.value === currentVal;
                    r.checked = selected;
                    row.style.background = selected ? 'rgba(100,102,200,0.2)' : 'transparent';
                });
            }

            (f.options || []).forEach(o => {
                const row = document.createElement('div');
                row.className = 'fp-radio-row';
                row.style.cssText = 'display:flex;align-items:center;gap:8px;padding:12px;cursor:pointer;';

                const radio = document.createElement('input');
                radio.type = 'radio';
                radio.name = f.id;
                radio.value = o.value;
                radio.style.cssText = 'accent-color:#6466b4;cursor:pointer;width:16px;height:16px;flex-shrink:0;';

                const txt = document.createElement('span');
                txt.textContent = o.text;
                txt.style.cssText = 'font-size:13px;color:#c8cadc;';

                row.appendChild(radio);
                row.appendChild(txt);

                row.addEventListener('click', () => {
                    currentVal = o.value;
                    updateRows();
                    _updateConditions(container, fields);
                });

                col.appendChild(row);
            });

            updateRows();
            wrap.appendChild(col);
            container.appendChild(wrap);
            return;
        } else if (f.type === 'textarea') {
            input = document.createElement('textarea');
            input.className = 'fp-field-input';
            input.style.cssText = 'resize:vertical;min-height:48px;padding:3px 7px;font-size:12px;';
            input.value = autoVal;
            input.placeholder = f.name;
        } else {
            input = document.createElement('input');
            input.type = 'text';
            input.className = 'fp-field-input';
            input.style.padding = '3px 7px';
            input.value = autoVal;
            input.placeholder = f.name;
        }

        input.dataset.fieldId = f.id;
        input.dataset.fieldName = f.name;
        input.addEventListener('change', () => _updateConditions(container, fields));
        wrap.appendChild(input);
        container.appendChild(wrap);
    });

    // Оцениваем условия сразу после рендера
    _updateConditions(container, fields);
}

// ── confirm ───────────────────────────────────────────────────────────────────

function _showConfirm(previewText, payload) {
    _ticketPendingPayload = payload;
    const overlay = document.getElementById('fp-ticket-confirm-overlay');
    const textEl  = document.getElementById('fp-ticket-confirm-text');
    if (!overlay || !textEl) return;
    textEl.textContent = previewText;
    overlay.style.display = 'flex';
}

async function _sendPendingTicket() {
    const btn = document.getElementById('fp-ticket-confirm-yes');
    if (!_ticketPendingPayload || !btn) return;
    btn.disabled = true; btn.textContent = 'Отправка...';
    const { categoryId, fieldValues, message } = _ticketPendingPayload;
    try {
        const res = await _msg('supportCreateTicket', { categoryId, fieldValues, message });
        document.getElementById('fp-ticket-confirm-overlay').style.display = 'none';
        _ticketPendingPayload = null;
        if (typeof showNotification === 'function') showNotification('Заявка отправлена' + (res.ticketId ? ' #' + res.ticketId : '') + ' ✓');
        _loadTickets();
    } catch (e) {
        btn.disabled = false; btn.textContent = 'Отправить';
        if (typeof showNotification === 'function') showNotification('❌ ' + e.message, true);
    }
}

function _buildPreviewFromForm() {
    const catId   = document.getElementById('fp-ticket-cat-select')?.value;
    const catName = _ticketCategories.find(c => c.id === catId)?.name || catId;
    const lines   = [`Категория: ${catName}`];
    const fv      = {};
    document.querySelectorAll('#fp-new-ticket-fields [data-field-id]').forEach(el => {
        // radio-group: читаем выбранный radio внутри
        if (el.dataset.fieldType === 'radio-group') {
            const checked = el.querySelector('input[type=radio]:checked');
            if (checked) {
                fv[el.dataset.fieldId] = checked.value;
                const label = el.querySelector(`label[for="${checked.id}"] span`)?.textContent || checked.value;
                lines.push(`  ${el.dataset.fieldId}: ${label}`);
            }
            return;
        }
        if (el.value) {
            fv[el.dataset.fieldId] = el.value;
            lines.push(`  ${el.dataset.fieldName || el.dataset.fieldId}: ${el.value}`);
        }
    });
    const msgEl = document.querySelector('#fp-new-ticket-fields textarea[data-field-id]');
    const msg   = msgEl?.value?.trim() || '';
    lines.push('', 'Сообщение:', msg);
    return { preview: lines.join('\n'), fieldValues: fv, message: msg, categoryId: catId };
}

// ── auto ticket ───────────────────────────────────────────────────────────────

async function _buildAndConfirmAutoTicket() {
    const statusEl = document.getElementById('fp-auto-ticket-status');
    const btn      = document.getElementById('fp-send-auto-ticket-btn');
    const ageHours  = parseInt(document.getElementById('fp-ticket-age-hours')?.value  || '24');
    const maxOrders = parseInt(document.getElementById('fp-ticket-max-orders')?.value || '5');

    btn.disabled = true; btn.textContent = 'Сбор заказов...';
    statusEl.textContent = '';

    try {
        const { orderIds } = await _msg('getUnconfirmedOrders', { ageHours, maxOrders });
        if (!orderIds.length) {
            statusEl.textContent = 'Нет неподтверждённых заказов';
            return;
        }
        const username = _getUsername();
        const idsStr   = orderIds.join(', ');
        const message  = `Здравствуйте! Прошу подтвердить заказы: ${idsStr}. С уважением, ${username}!`;
        const fv = {
            'ticket[fields][1]': username,
            'ticket[fields][2]': idsStr,
            'ticket[fields][3]': '2',
            'ticket[fields][5]': '201'
        };
        const preview = `Категория: Подтверждение заказа\n  Ник: ${username}\n  Заказы: ${idsStr}\n\nСообщение:\n${message}`;
        _showConfirm(preview, { categoryId: '1', fieldValues: fv, message });
    } catch (e) {
        statusEl.textContent = '❌ ' + e.message;
    } finally {
        btn.disabled = false; btn.textContent = 'Отправить заявку в ТП';
    }
}


// ── ticket detail ─────────────────────────────────────────────────────────────

let _currentTicketId = null;
let _currentReplyToken = null;

function _renderBubble(c, myUsername) {
    const isMe = c.author === myUsername;
    const wrap = document.createElement('div');
    wrap.style.cssText = `display:flex;flex-direction:${isMe ? 'row-reverse' : 'row'};align-items:flex-end;gap:8px;`;

    // Avatar (only for others)
    if (!isMe) {
        const av = document.createElement('div');
        av.style.cssText = `width:28px;height:28px;border-radius:50%;flex-shrink:0;background:#1a1c2e;font-size:11px;font-weight:600;color:#6B66FF;display:flex;align-items:center;justify-content:center;`;
        if (c.avatarUrl) {
            av.style.backgroundImage = `url('${c.avatarUrl}')`;
            av.style.backgroundSize = 'cover';
            av.style.backgroundPosition = 'center';
            av.textContent = '';
        } else {
            av.textContent = (c.author || '?')[0].toUpperCase();
        }
        wrap.appendChild(av);
    }

    const col = document.createElement('div');
    col.style.cssText = `display:flex;flex-direction:column;gap:3px;max-width:78%;align-items:${isMe ? 'flex-end' : 'flex-start'};`;

    // Name + time (only for others, or own first)
    const meta = document.createElement('div');
    meta.style.cssText = `font-size:10px;color:#3a3d52;padding:0 4px;`;
    meta.textContent = (!isMe ? c.author + '  ' : '') + (c.timestamp || '');
    col.appendChild(meta);

    // Bubble
    const bubble = document.createElement('div');
    if (isMe) {
        bubble.style.cssText = `background:linear-gradient(135deg,#5a56e8,#7b77ff);border-radius:16px 16px 4px 16px;padding:8px 12px;font-size:13px;color:#fff;line-height:1.55;word-break:break-word;`;
    } else {
        bubble.style.cssText = `background:#12131f;border:1px solid #1a1c2e;border-radius:16px 16px 16px 4px;padding:8px 12px;font-size:13px;color:#d8dae8;line-height:1.55;word-break:break-word;`;
    }

    // Parse text: images inline, links clickable
    const rawHtml = c.text || '';
    const tmp = document.createElement('div');
    tmp.innerHTML = rawHtml;

    // Make images real img tags with click-to-open
    tmp.querySelectorAll('img').forEach(img => {
        img.className = 'fp-msg-img';
        img.addEventListener('click', () => window.open(img.src, '_blank'));
    });
    // Make links open in new tab
    tmp.querySelectorAll('a').forEach(a => { a.target = '_blank'; a.style.color = isMe ? 'rgba(255,255,255,0.85)' : '#7b77ff'; });

    bubble.appendChild(tmp);
    col.appendChild(bubble);
    wrap.appendChild(col);
    return wrap;
}

async function _openTicket(ticketId) {
    _currentTicketId = ticketId;

    const panel = document.getElementById('fp-ticket-detail-panel');
    const body = document.querySelector('.fp-tools-body');
    if (body && panel && panel.parentElement !== body) body.appendChild(panel);
    if (!panel) return;
    panel.style.display = 'flex';

    document.getElementById('fp-ticket-detail-title').textContent = 'Заявка #' + ticketId;
    document.getElementById('fp-ticket-detail-status').textContent = '';
    document.getElementById('fp-tria').style.display = 'none';
    const msgs = document.getElementById('fp-tdm');
    msgs.innerHTML = '<div style="text-align:center;color:#3a3d52;font-size:13px;padding:40px 0;">Загрузка...</div>';

    try {
        const res = await _msg('supportGetTicketDetails', { ticketId });
        _currentReplyToken = res.token || null;
        const myUsername = _getUsername();

        const titleStr = res.title || ('Заявка #' + ticketId);
        document.getElementById('fp-ticket-detail-title').textContent = titleStr;
        const statusEl = document.getElementById('fp-ticket-detail-status');
        const statusColor = { 'Открыт': '#4caf82', 'В ожидании': '#f0a040', 'Решена': '#4caf82', 'Закрыт': '#5a5f7a' };
        statusEl.style.color = statusColor[res.status] || '#5a5f7a';
        statusEl.textContent = res.status || '';
        const avEl = document.getElementById('fp-tkt-av');
        if (avEl) avEl.textContent = titleStr[0]?.toUpperCase() || 'Т';

        msgs.innerHTML = '';
        if (!(res.comments || []).length) {
            msgs.innerHTML = '<div style="text-align:center;color:#3a3d52;font-size:12px;padding:30px 0;">Нет сообщений</div>';
        } else {
            (res.comments || []).forEach(c => msgs.appendChild(_renderBubble(c, myUsername)));
            msgs.scrollTop = msgs.scrollHeight;
        }

        if (res.canReply && _currentReplyToken) {
            document.getElementById('fp-tria').style.display = 'flex';
            const inp = document.getElementById('fp-tri');
            if (inp) { inp.value = ''; inp.style.height = '20px'; }
        }
    } catch (e) {
        msgs.innerHTML = `<div style="color:#e05252;font-size:13px;padding:16px;">${e.message}</div>`;
    }
}

async function _sendTicketReply() {
    const btn   = document.getElementById('fp-ticket-reply-btn');
    const input = document.getElementById('fp-tri');
    const text  = input?.value.trim();
    if (!text || !_currentTicketId) return;
    btn.disabled = true; btn.textContent = '...';
    try {
        await _msg('supportAddComment', { ticketId: _currentTicketId, message: text, token: _currentReplyToken });
        // Append message visually — no reload
        const msgs = document.getElementById('fp-tdm');
        const username = _getUsername();
        const now = new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
        const syntheticComment = { author: username, text: text.replace(/\n/g, '<br>'), timestamp: now, avatarUrl: '' };
        msgs.appendChild(_renderBubble(syntheticComment, username));
        msgs.scrollTop = msgs.scrollHeight;
        input.value = '';
        btn.disabled = false; btn.textContent = 'Отправить';
    } catch (e) {
        if (typeof showNotification === 'function') showNotification('❌ ' + e.message, true);
        btn.disabled = false; btn.textContent = 'Отправить';
    }
}

// ── init ──────────────────────────────────────────────────────────────────────

function initTicketsTab() {
    if (_ticketsInited) { _loadTickets(); return; }
    _ticketsInited = true;

    document.getElementById('fp-ticket-refresh-btn')   ?.addEventListener('click', _loadTickets);
    document.getElementById('fp-send-auto-ticket-btn') ?.addEventListener('click', _buildAndConfirmAutoTicket);
    document.getElementById('fp-create-ticket-btn')    ?.addEventListener('click', _openNewTicketPanel);
    document.getElementById('fp-new-ticket-close')     ?.addEventListener('click', _closeNewTicketPanel);
    document.getElementById('fp-ticket-confirm-no')    ?.addEventListener('click', () => {
        document.getElementById('fp-ticket-confirm-overlay').style.display = 'none';
        _ticketPendingPayload = null;
    });
    document.getElementById('fp-ticket-confirm-yes')?.addEventListener('click', _sendPendingTicket);
    document.getElementById('fp-new-ticket-submit')?.addEventListener('click', () => {
        const catId = document.getElementById('fp-ticket-cat-select')?.value;
        if (!catId) { if (typeof showNotification === 'function') showNotification('Выберите категорию', true); return; }
        const { preview, fieldValues, message, categoryId } = _buildPreviewFromForm();
        if (!message) { if (typeof showNotification === 'function') showNotification('Введите сообщение', true); return; }
        _closeNewTicketPanel();
        _showConfirm(preview, { categoryId, fieldValues, message });
    });

    document.getElementById('fp-ticket-detail-back')?.addEventListener('click', () => {
        const panel = document.getElementById('fp-ticket-detail-panel');
        if (panel) panel.style.display = 'none';
        _currentTicketId = null;
    });
    document.getElementById('fp-ticket-reply-btn')?.addEventListener('click', _sendTicketReply);
    const replyInput = document.getElementById('fp-tri');

    // Hover effects via JS — inline onmouseover breaks HTML in template literals
    const replyBtn = document.getElementById('fp-ticket-reply-btn');
    replyBtn?.addEventListener('mouseenter', () => replyBtn.style.background = '#5752e8');
    replyBtn?.addEventListener('mouseleave', () => replyBtn.style.background = '#6B66FF');
    const attachLbl = document.getElementById('fp-attach-lbl');
    attachLbl?.addEventListener('mouseenter', () => attachLbl.style.color = '#9099b8');
    attachLbl?.addEventListener('mouseleave', () => attachLbl.style.color = '#4a4f6a');
    replyInput?.addEventListener('keydown', e => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); _sendTicketReply(); }
    });
    replyInput?.addEventListener('input', function() {
        this.style.height = 'auto';
        this.style.height = Math.min(this.scrollHeight, 90) + 'px';
        this.style.overflowY = this.scrollHeight > 90 ? 'auto' : 'hidden';
    });

    // Image attach
    document.getElementById('fp-ticket-attach-input')?.addEventListener('change', function() {
        const file = this.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = e => {
            const preview = document.getElementById('fp-tapr');
            const thumb = document.getElementById('fp-tath');
            if (preview && thumb) { thumb.src = e.target.result; preview.style.display = 'block'; }
        };
        reader.readAsDataURL(file);
    });
    document.getElementById('fp-tarm')?.addEventListener('click', () => {
        document.getElementById('fp-tapr').style.display = 'none';
        document.getElementById('fp-tath').src = '';
        document.getElementById('fp-ticket-attach-input').value = '';
    });

    _loadTickets();
}