(function initNewChatStarter() {
    'use strict';

    const DEBOUNCE_MS = 1000;
    const STYLE_ID = 'fpt-new-chat-css';
    const ROOT_ID = 'fpt-new-chat';

    let debTimer = null;
    let busy = false;
    let lastQuery = '';

    function injectStyles() {
        if (document.getElementById(STYLE_ID)) return;
        const s = document.createElement('style');
        s.id = STYLE_ID;
        s.textContent = `
        #${ROOT_ID}{
            display:flex;flex-direction:column;align-items:center;gap:14px;
            width:100%;max-width:340px;margin:18px auto 0;
        }
        #${ROOT_ID} .fpt-nc-start{cursor:pointer;}
        #${ROOT_ID} .fpt-nc-form{
            width:100%;display:none;flex-direction:column;gap:10px;
            animation:fptNcIn .18s ease;
        }
        #${ROOT_ID}.open .fpt-nc-form{display:flex;}
        #${ROOT_ID}.open .fpt-nc-start{display:none;}
        @keyframes fptNcIn{from{opacity:0;transform:translateY(6px);}to{opacity:1;transform:translateY(0);}}
        #${ROOT_ID} .fpt-nc-inputwrap{position:relative;}
        #${ROOT_ID} .fpt-nc-input{padding-right:34px;text-align:left;}
        #${ROOT_ID} .fpt-nc-spin{
            position:absolute;right:11px;top:50%;width:14px;height:14px;
            margin-top:-7px;display:none;border-radius:50%;
            border:2px solid currentColor;border-top-color:transparent;opacity:.5;
            animation:fptNcSpin .7s linear infinite;pointer-events:none;
        }
        #${ROOT_ID}.loading .fpt-nc-spin{display:block;}
        @keyframes fptNcSpin{to{transform:rotate(360deg);}}
        #${ROOT_ID} .fpt-nc-result{
            border:1px solid var(--gray-300, rgba(128,128,128,.25));
            border-radius:8px;overflow:hidden;display:none;
        }
        #${ROOT_ID} .fpt-nc-result.show{display:block;}
        #${ROOT_ID} .fpt-nc-card{
            display:flex;align-items:center;gap:11px;
            padding:11px 13px;cursor:pointer;text-decoration:none;
            color:inherit;transition:background .12s ease;
        }
        #${ROOT_ID} .fpt-nc-card:hover{background:var(--gray-200, rgba(128,128,128,.12));}
        #${ROOT_ID} .fpt-nc-ava{
            width:42px;height:42px;border-radius:50%;flex-shrink:0;
            object-fit:cover;background:var(--gray-200, rgba(128,128,128,.15));
        }
        #${ROOT_ID} .fpt-nc-info{flex:1;min-width:0;text-align:left;}
        #${ROOT_ID} .fpt-nc-uname{
            font-size:14px;font-weight:600;
            white-space:nowrap;overflow:hidden;text-overflow:ellipsis;
        }
        #${ROOT_ID} .fpt-nc-uid{font-size:12px;opacity:.5;margin-top:1px;}
        #${ROOT_ID} .fpt-nc-go{
            flex-shrink:0;font-size:13px;font-weight:600;opacity:.65;
        }
        #${ROOT_ID} .fpt-nc-msg{
            padding:10px 13px;font-size:13px;text-align:center;opacity:.6;
            display:none;
        }
        #${ROOT_ID} .fpt-nc-msg.show{display:block;}
        #${ROOT_ID} .fpt-nc-cancel{
            background:none;border:none;cursor:pointer;
            font-size:12px;opacity:.5;padding:2px;align-self:center;
        }
        #${ROOT_ID} .fpt-nc-cancel:hover{opacity:.85;text-decoration:underline;}
        `;
        document.head.appendChild(s);
    }

    function getMyUserId() {
        try {
            const raw = document.body.dataset.appData;
            if (!raw) return null;
            const data = JSON.parse(raw);
            const app = Array.isArray(data) ? data[0] : data;
            return app && app.userId ? String(app.userId) : null;
        } catch (e) {
            return null;
        }
    }

    function esc(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        }[c]));
    }

    function buildNodeName(theirId, myId) {
        const a = parseInt(theirId, 10);
        const b = parseInt(myId, 10);
        const lo = Math.min(a, b);
        const hi = Math.max(a, b);
        return `users-${lo}-${hi}`;
    }

    function build() {
        const root = document.createElement('div');
        root.id = ROOT_ID;
        root.innerHTML = `
            <button type="button" class="fpt-nc-start btn btn-default">Начать новый чат</button>
            <div class="fpt-nc-form">
                <div class="fpt-nc-inputwrap">
                    <input type="text" class="fpt-nc-input form-control" placeholder="Введите ник пользователя" autocomplete="off" spellcheck="false">
                    <span class="fpt-nc-spin"></span>
                </div>
                <div class="fpt-nc-msg"></div>
                <div class="fpt-nc-result"></div>
                <button type="button" class="fpt-nc-cancel">отмена</button>
            </div>`;

        const startBtn = root.querySelector('.fpt-nc-start');
        const input = root.querySelector('.fpt-nc-input');
        const cancel = root.querySelector('.fpt-nc-cancel');

        startBtn.addEventListener('click', () => {
            root.classList.add('open');
            input.focus();
        });

        cancel.addEventListener('click', () => {
            root.classList.remove('open');
            resetState(root);
            input.value = '';
        });

        input.addEventListener('input', () => {
            const q = input.value.trim();
            clearTimeout(debTimer);
            hideResult(root);
            if (q.length < 2) { showMsg(root, ''); root.classList.remove('loading'); return; }
            debTimer = setTimeout(() => doResolve(root, q), DEBOUNCE_MS);
        });

        input.addEventListener('keydown', e => {
            if (e.key === 'Enter') {
                e.preventDefault();
                const q = input.value.trim();
                if (q.length >= 2) { clearTimeout(debTimer); doResolve(root, q); }
            }
            if (e.key === 'Escape') {
                root.classList.remove('open');
                resetState(root);
                input.value = '';
            }
        });

        return root;
    }

    function showMsg(root, html) {
        const el = root.querySelector('.fpt-nc-msg');
        if (!el) return;
        if (!html) { el.classList.remove('show'); el.innerHTML = ''; return; }
        el.innerHTML = html;
        el.classList.add('show');
    }

    function hideResult(root) {
        const el = root.querySelector('.fpt-nc-result');
        if (el) { el.classList.remove('show'); el.innerHTML = ''; }
    }

    function resetState(root) {
        clearTimeout(debTimer);
        root.classList.remove('loading');
        hideResult(root);
        showMsg(root, '');
        lastQuery = '';
    }

    async function doResolve(root, username) {
        if (busy) return;
        if (username === lastQuery && root.querySelector('.fpt-nc-result.show')) return;
        lastQuery = username;
        busy = true;
        root.classList.add('loading');
        hideResult(root);
        showMsg(root, '');

        try {
            const result = await new Promise(resolve => {
                chrome.runtime.sendMessage({ action: 'rmthubFetch', username }, resolve);
            });

            if (!result || !result.ok) {
                if (result && result.notFound) {
                    showMsg(root, `Пользователь «${esc(username)}» не найден`);
                } else {
                    showMsg(root, 'Ошибка запроса. Попробуйте ещё раз');
                }
                return;
            }

            renderResult(root, result.data, result.avatar);
        } catch (e) {
            showMsg(root, 'Ошибка запроса. Попробуйте ещё раз');
        } finally {
            busy = false;
            root.classList.remove('loading');
        }
    }

    function renderResult(root, data, avatar) {
        const u = (data && data.user) || {};
        const theirId = String(u.id || '');
        const uname = u.username || '-';
        if (!theirId) { showMsg(root, 'Не удалось определить пользователя'); return; }

        const myId = getMyUserId();
        if (!myId) { showMsg(root, 'Не удалось определить ваш аккаунт. Обновите страницу'); return; }

        if (theirId === myId) { showMsg(root, 'Это вы 🙂'); return; }

        const node = buildNodeName(theirId, myId);
        const chatUrl = `https://funpay.com/chat/?node=${node}`;
        const ava = avatar || u.avatar || 'https://funpay.com/img/layout/avatar.png';

        const el = root.querySelector('.fpt-nc-result');
        el.innerHTML = `
            <a class="fpt-nc-card" href="${chatUrl}">
                <img class="fpt-nc-ava" src="${esc(ava)}" alt="" onerror="this.src='https://funpay.com/img/layout/avatar.png'">
                <div class="fpt-nc-info">
                    <div class="fpt-nc-uname">${esc(uname)}</div>
                    <div class="fpt-nc-uid">ID ${esc(theirId)}</div>
                </div>
                <span class="fpt-nc-go">Открыть чат →</span>
            </a>`;
        el.classList.add('show');
    }

    function mount() {
        const empty = document.querySelector('.chat-empty .chat-not-selected-info');
        if (!empty) return;
        if (document.getElementById(ROOT_ID)) return;
        injectStyles();
        empty.appendChild(build());
    }

    let mountScheduled = false;
    function init() {
        mount();
        const root = document.querySelector('.chat') || document.body;
        const obs = new MutationObserver(() => {
            if (mountScheduled) return;
            if (document.getElementById(ROOT_ID)) return;
            if (!document.querySelector('.chat-empty .chat-not-selected-info')) return;
            mountScheduled = true;
            requestAnimationFrame(() => { mountScheduled = false; mount(); });
        });
        obs.observe(root, { childList: true, subtree: true });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();