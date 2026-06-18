// content/features/lot_notes.js
// Личные заметки к лотам (видны только тебе, хранятся локально).
// Глобальный объект window.FPTNotes:
//   await FPTNotes.get(offerId)            -> { text, lotTitle, updatedAt } | null
//   await FPTNotes.set(offerId, text, lotTitle)
//   await FPTNotes.delete(offerId)
//   await FPTNotes.all()                   -> { offerId: {...}, ... }
//   FPTNotes.openEditor(offerId, lotTitle) -> модалка редактирования заметки
//   FPTNotes.openViewer()                  -> модалка со всеми заметками
//
// Заметки хранятся в chrome.storage.local под ключом 'fptLotNotes'. Лот может быть
// потом удалён с FunPay — заметка останется (показываем в общем списке).

(function (root) {
    'use strict';

    const KEY = 'fptLotNotes';

    function _read() {
        return new Promise(resolve => {
            try {
                chrome.storage.local.get(KEY, (o) => resolve((o && o[KEY]) || {}));
            } catch (_) { resolve({}); }
        });
    }
    function _write(map) {
        return new Promise(resolve => {
            try { chrome.storage.local.set({ [KEY]: map }, () => resolve(true)); }
            catch (_) { resolve(false); }
        });
    }

    async function get(offerId) {
        if (!offerId) return null;
        const m = await _read();
        return m[String(offerId)] || null;
    }
    async function all() { return await _read(); }
    async function set(offerId, text, lotTitle) {
        if (!offerId) return false;
        const m = await _read();
        const id = String(offerId);
        const t = (text || '').trim();
        if (!t) { delete m[id]; }
        else {
            m[id] = { text: t, lotTitle: lotTitle || (m[id] && m[id].lotTitle) || '', updatedAt: Date.now() };
        }
        await _write(m);
        document.dispatchEvent(new CustomEvent('fpt-notes-changed', { detail: { offerId: id } }));
        return true;
    }
    async function del(offerId) { return await set(offerId, '', null); }

    function esc(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, c => (
            { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    }

    function ensureStyles() {
        if (document.getElementById('fpt-notes-styles')) return;
        const s = document.createElement('style');
        s.id = 'fpt-notes-styles';
        s.textContent = `
        .fpt-note-ov{position:fixed;inset:0;z-index:2147483600;display:flex;align-items:center;justify-content:center;
            background:rgba(8,9,14,0.6);backdrop-filter:blur(3px);font-family:Inter,'Segoe UI',sans-serif;}
        .fpt-note-modal{width:min(540px,94vw);max-height:88vh;display:flex;flex-direction:column;
            background:var(--fpt-surface,#fff);color:var(--fpt-text,#1a1a1a);
            border:1px solid var(--fpt-border,#e3e3e8);border-radius:16px;box-shadow:0 20px 60px rgba(0,0,0,0.5);overflow:hidden;}
        .fpt-note-head{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;padding:16px 18px;
            border-bottom:1px solid var(--fpt-border,#ececf0);}
        .fpt-note-title{font-size:15px;font-weight:700;line-height:1.3;}
        .fpt-note-sub{font-size:11.5px;color:var(--fpt-text-muted,#8a8a94);margin-top:3px;word-break:break-word;}
        .fpt-note-close{background:none;border:none;font-size:22px;line-height:1;cursor:pointer;color:inherit;opacity:.65;}
        .fpt-note-close:hover{opacity:1;}
        .fpt-note-body{padding:16px 18px;overflow-y:auto;}
        .fpt-note-ta{width:100%;min-height:160px;resize:vertical;padding:11px 12px;border-radius:10px;
            border:1px solid var(--fpt-border,#dadbe2);background:var(--fpt-surface-2,#fafafc);color:inherit;
            font-size:13.5px;line-height:1.5;font-family:inherit;outline:none;box-sizing:border-box;}
        .fpt-note-ta:focus{border-color:#7c5cff;box-shadow:0 0 0 3px rgba(124,92,255,.12);}
        .fpt-note-foot{display:flex;gap:8px;justify-content:flex-end;padding:0 18px 18px;}
        .fpt-note-btn{padding:8px 16px;border-radius:9px;border:1px solid var(--fpt-border,#dadbe2);
            background:var(--fpt-surface-2,#fff);color:inherit;font-size:13px;font-weight:600;cursor:pointer;}
        .fpt-note-btn.primary{background:#7c5cff;border-color:#7c5cff;color:#fff;}
        .fpt-note-btn.primary:hover{background:#6b4ce6;}
        .fpt-note-btn.danger{color:#ef4444;border-color:rgba(239,68,68,.4);}
        .fpt-note-btn.danger:hover{background:rgba(239,68,68,.08);}
        .fpt-note-list{padding:8px 18px 18px;overflow-y:auto;display:flex;flex-direction:column;gap:9px;}
        .fpt-note-card{border:1px solid var(--fpt-border,#ececf0);border-radius:12px;padding:11px 13px;
            background:var(--fpt-surface-2,#fafafc);}
        .fpt-note-card-title{font-size:12.5px;font-weight:700;margin-bottom:5px;}
        .fpt-note-card-title a{color:inherit;text-decoration:none;}
        .fpt-note-card-title a:hover{color:#7c5cff;text-decoration:underline;}
        .fpt-note-card-text{font-size:12.5px;line-height:1.5;white-space:pre-wrap;word-break:break-word;color:var(--fpt-text,#333);}
        .fpt-note-card-meta{display:flex;gap:8px;align-items:center;margin-top:7px;}
        .fpt-note-card-date{font-size:10.5px;color:var(--fpt-text-muted,#9aa0b0);}
        .fpt-note-card-act{font-size:11px;color:var(--fpt-text-muted,#8a8a94);cursor:pointer;background:none;border:none;padding:2px 4px;}
        .fpt-note-card-act:hover{color:#7c5cff;}
        .fpt-note-card-act.del:hover{color:#ef4444;}
        .fpt-note-search{width:100%;padding:9px 11px;border-radius:9px;border:1px solid var(--fpt-border,#dadbe2);
            background:var(--fpt-surface-2,#fafafc);color:inherit;font-size:13px;outline:none;box-sizing:border-box;margin:0 0 4px;}
        .fpt-note-empty{padding:26px;text-align:center;color:var(--fpt-text-muted,#8a8a94);font-size:13px;}
        `;
        document.head.appendChild(s);
    }

    function closeAll() { document.querySelectorAll('.fpt-note-ov').forEach(o => o.remove()); }

    async function openEditor(offerId, lotTitle) {
        if (!offerId) { showNotification?.('У этого лота нет ID — заметку не привязать.', true); return; }
        ensureStyles();
        closeAll();
        const existing = await get(offerId);
        const ov = document.createElement('div');
        ov.className = 'fpt-note-ov';
        ov.innerHTML = `
            <div class="fpt-note-modal">
                <div class="fpt-note-head">
                    <div>
                        <div class="fpt-note-title">📝 Заметка к лоту</div>
                        <div class="fpt-note-sub">${esc(lotTitle || (existing && existing.lotTitle) || ('Лот #' + offerId))}</div>
                    </div>
                    <button class="fpt-note-close" title="Закрыть">×</button>
                </div>
                <div class="fpt-note-body">
                    <textarea class="fpt-note-ta" placeholder="Личная заметка (видна только тебе): ссылки, инструкции, что угодно…">${esc(existing ? existing.text : '')}</textarea>
                </div>
                <div class="fpt-note-foot">
                    ${existing ? '<button class="fpt-note-btn danger" data-act="del">Удалить</button>' : ''}
                    <button class="fpt-note-btn" data-act="cancel">Отмена</button>
                    <button class="fpt-note-btn primary" data-act="save">Сохранить</button>
                </div>
            </div>`;
        document.body.appendChild(ov);
        const ta = ov.querySelector('.fpt-note-ta');
        ta.focus();
        const close = () => ov.remove();
        ov.addEventListener('click', e => { if (e.target === ov) close(); });
        ov.querySelector('.fpt-note-close').addEventListener('click', close);
        ov.querySelector('[data-act="cancel"]').addEventListener('click', close);
        ov.querySelector('[data-act="save"]').addEventListener('click', async () => {
            await set(offerId, ta.value, lotTitle || (existing && existing.lotTitle));
            showNotification?.('Заметка сохранена 📝', false);
            close();
        });
        const delBtn = ov.querySelector('[data-act="del"]');
        if (delBtn) delBtn.addEventListener('click', async () => {
            await del(offerId);
            showNotification?.('Заметка удалена', false);
            close();
        });
        document.addEventListener('keydown', function onEsc(e) {
            if (e.key === 'Escape') { close(); document.removeEventListener('keydown', onEsc); }
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { ov.querySelector('[data-act="save"]').click(); document.removeEventListener('keydown', onEsc); }
        });
    }

    async function openViewer() {
        ensureStyles();
        closeAll();
        const map = await all();
        const entries = Object.entries(map).sort((a, b) => (b[1].updatedAt || 0) - (a[1].updatedAt || 0));
        const ov = document.createElement('div');
        ov.className = 'fpt-note-ov';
        ov.innerHTML = `
            <div class="fpt-note-modal">
                <div class="fpt-note-head">
                    <div><div class="fpt-note-title">📒 Мои заметки к лотам</div>
                    <div class="fpt-note-sub">${entries.length} заметок · видны только тебе</div></div>
                    <button class="fpt-note-close" title="Закрыть">×</button>
                </div>
                <div style="padding:12px 18px 0;display:flex;gap:8px;">
                    <input class="fpt-note-search" type="text" placeholder="Поиск по заметкам и названиям лотов…" style="margin:0;">
                    <button class="fpt-note-btn primary fpt-note-new" type="button" style="white-space:nowrap;">+ Новая</button>
                </div>
                <div class="fpt-note-list"></div>
            </div>`;
        document.body.appendChild(ov);
        const listEl = ov.querySelector('.fpt-note-list');
        const searchEl = ov.querySelector('.fpt-note-search');

        ov.querySelector('.fpt-note-new').addEventListener('click', () => {
            const raw = prompt('Ссылка на лот или его ID (offer id), к которому привязать заметку:');
            if (!raw) return;
            const m = String(raw).match(/(?:[?&](?:id|offer)=)?(\d{4,})/);
            const id = m ? m[1] : null;
            if (!id) { showNotification?.('Не удалось распознать ID лота.', true); return; }
            openEditor(id, '');
        });

        const render = () => {
            const q = searchEl.value.trim().toLowerCase();
            const filtered = entries.filter(([id, n]) =>
                !q || (n.text || '').toLowerCase().includes(q) || (n.lotTitle || '').toLowerCase().includes(q));
            if (!filtered.length) { listEl.innerHTML = `<div class="fpt-note-empty">${entries.length ? 'Ничего не найдено.' : 'Заметок пока нет. Кликни ПКМ по лоту → «Заметка».'}</div>`; return; }
            listEl.innerHTML = filtered.map(([id, n]) => {
                const d = n.updatedAt ? new Date(n.updatedAt).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : '';
                const url = `https://funpay.com/lots/offer?id=${id}`;
                return `<div class="fpt-note-card" data-id="${esc(id)}">
                    <div class="fpt-note-card-title"><a href="${url}" target="_blank">${esc(n.lotTitle || ('Лот #' + id))}</a></div>
                    <div class="fpt-note-card-text">${esc(n.text)}</div>
                    <div class="fpt-note-card-meta">
                        <span class="fpt-note-card-date">${esc(d)}</span>
                        <button class="fpt-note-card-act edit" style="margin-left:auto;">Изменить</button>
                        <button class="fpt-note-card-act del">Удалить</button>
                    </div>
                </div>`;
            }).join('');
            listEl.querySelectorAll('.fpt-note-card').forEach(card => {
                const id = card.getAttribute('data-id');
                const n = map[id];
                card.querySelector('.edit').addEventListener('click', () => { openEditor(id, n.lotTitle); });
                card.querySelector('.del').addEventListener('click', async () => {
                    if (!confirm('Удалить заметку?')) return;
                    await del(id);
                    delete map[id];
                    const i = entries.findIndex(e => e[0] === id);
                    if (i >= 0) entries.splice(i, 1);
                    render();
                });
            });
        };
        render();
        searchEl.addEventListener('input', render);
        document.addEventListener('fpt-notes-changed', render);
        const close = () => { document.removeEventListener('fpt-notes-changed', render); ov.remove(); };
        ov.addEventListener('click', e => { if (e.target === ov) close(); });
        ov.querySelector('.fpt-note-close').addEventListener('click', close);
        document.addEventListener('keydown', function onEsc(e){ if(e.key==='Escape'){close();document.removeEventListener('keydown',onEsc);} });
    }

    root.FPTNotes = { get, set, delete: del, all, openEditor, openViewer };
})(typeof window !== 'undefined' ? window : this);
