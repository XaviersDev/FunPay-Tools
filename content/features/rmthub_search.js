// content/features/rmthub_search.js — FunPay Tools 3.0
// RMTHub profile search — cloned exactly from FunPay's game search form.
// Uses EXACT same classes: navbar-form, navbar-left, form-control, dropdown-menu etc.
// Works only with EXACT usernames (same as RMTHub API requirement).

(function initRMTHubSearch() {
    'use strict';

    const DEF_AVA  = 'https://funpay.com/img/layout/avatar.png';
    const WRAP_ID  = 'fp-rmthub-form';
    const INPUT_ID = 'fp-rmthub-input';
    const DROP_ID  = 'fp-rmthub-drop';

    let debTimer = null;
    let busy     = false;

    // ── Extra styles only for the card dropdown ───────────────────────────────
    // The form itself reuses FunPay's own CSS classes (form-control, dropdown-menu, etc.)
    function injectStyles() {
        if (document.getElementById('fp-rmthub-css')) return;
        const s = document.createElement('style');
        s.id = 'fp-rmthub-css';
        s.textContent = `
        /* Spinner inside the input */
        #fp-rmthub-spin{
            position:absolute;right:30px;top:50%;transform:translateY(-50%);
            display:none;width:12px;height:12px;
            border:2px solid rgba(160,158,248,.2);border-top-color:#a09ef8;
            border-radius:50%;animation:rmths .7s linear infinite;pointer-events:none;z-index:10;
        }
        .fp-rmthub-wrap{position:relative;display:inline-block;}
        @keyframes rmths{to{transform:translateY(-50%) rotate(360deg)}}

        /* Hint tooltip */
        #fp-rmthub-drop .rmth-hint{
            padding:5px 10px;font-size:9.5px;color:#5a5f80;text-align:center;
            letter-spacing:.2px;line-height:1.4;
        }
        #fp-rmthub-drop .rmth-hint small{font-size:8.5px;opacity:.55;display:block;margin-top:1px;}

        /* Card styles inside the dropdown */
        .fp-rmthub-drop .rmth-card{padding:12px 14px;}
        .fp-rmthub-drop .rmth-head{display:flex;align-items:center;gap:10px;margin-bottom:10px;}
        .fp-rmthub-drop .rmth-ava{width:40px;height:40px;border-radius:50%;object-fit:cover;border:2px solid rgba(107,102,255,.4);flex-shrink:0;background:#1e2035;}
        .fp-rmthub-drop .rmth-uinfo{flex:1;min-width:0;}
        .fp-rmthub-drop .rmth-name{font-size:13px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
        .fp-rmthub-drop .rmth-uid{font-size:11px;opacity:.45;margin-top:1px;}
        .fp-rmthub-drop .rmth-banned{display:inline-block;background:rgba(255,60,60,.15);color:#ff5c5c;border:1px solid rgba(255,60,60,.3);border-radius:3px;font-size:9px;font-weight:700;padding:0 4px;margin-left:4px;vertical-align:middle;}
        .fp-rmthub-drop .rmth-grid{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:10px;}
        .fp-rmthub-drop .rmth-stat{background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.07);border-radius:6px;padding:6px 8px;text-align:center;}
        .fp-rmthub-drop .rmth-sval{font-size:14px;font-weight:700;color:#a09ef8;line-height:1;margin-bottom:2px;}
        .fp-rmthub-drop .rmth-slbl{font-size:9px;opacity:.4;text-transform:uppercase;letter-spacing:.4px;}
        .fp-rmthub-drop .rmth-glbl{font-size:9px;opacity:.35;text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px;}
        .fp-rmthub-drop .rmth-grow{display:flex;align-items:center;padding:3px 0;border-bottom:1px solid rgba(255,255,255,.04);font-size:11px;}
        .fp-rmthub-drop .rmth-grow:last-child{border-bottom:none;}
        .fp-rmthub-drop .rmth-gname{flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0;}
        .fp-rmthub-drop .rmth-gpct{font-size:10px;opacity:.35;margin:0 6px;flex-shrink:0;}
        .fp-rmthub-drop .rmth-grev{font-size:11px;font-weight:600;color:#a09ef8;flex-shrink:0;}
        .fp-rmthub-drop .rmth-foot{display:flex;align-items:center;justify-content:space-between;padding:8px 14px;background:rgba(0,0,0,.18);border-top:1px solid rgba(255,255,255,.06);}
        .fp-rmthub-drop .rmth-links{display:flex;gap:8px;}
        .fp-rmthub-drop .rmth-links a{font-size:11px;font-weight:600;color:#a09ef8;text-decoration:none;opacity:.8;}
        .fp-rmthub-drop .rmth-links a:hover{opacity:1;text-decoration:underline;}
        .fp-rmthub-drop .rmth-credit{font-size:9px;opacity:.25;}
        .fp-rmthub-drop .rmth-state{padding:16px 14px;text-align:center;opacity:.5;font-size:12px;}
        `;
        document.head.appendChild(s);
    }

    // ── Build — uses EXACT same HTML structure as FunPay's game search ─────────
    function buildForm() {
        // Outer form — identical classes to .promo-games-filter
        const form  = document.createElement('form');
        form.id     = WRAP_ID;
        form.action = 'javascript:void(0)';
        form.className = 'navbar-form navbar-left dropdown fp-rmthub-form';
        form.setAttribute('autocomplete', 'off');

        const group = document.createElement('div');
        group.className = 'form-group fp-rmthub-wrap';

        // Input — identical classes to FunPay's game search input
        const input = document.createElement('input');
        input.id           = INPUT_ID;
        input.type         = 'text';
        input.name         = 'fp-rmthub-q';
        input.className    = 'form-control dropdown-toggle';
        input.placeholder  = 'Продавец';
        input.autocomplete = 'off';
        input.spellcheck   = false;
        input.setAttribute('role', 'searchbox');

        // Spinner
        const spin = document.createElement('div');
        spin.id = 'fp-rmthub-spin';

        // Dropdown — identical class to FunPay's autocomplete dropdown
        const drop = document.createElement('div');
        drop.id        = DROP_ID;
        drop.className = 'fp-rmthub-drop dropdown-menu hidden';
        drop.style.cssText = 'min-width:300px;max-width:360px;padding:0;overflow:hidden;border-radius:8px;';

        input.style.width = '95px';
        input.style.paddingRight = '21px';

        const btn = document.createElement('button');
        btn.type      = 'submit';
        btn.className = 'btn btn-link';
        btn.innerHTML = '<i class="fa fa-user"></i>';
        btn.title     = 'Найти продавца на RMTHub';
        btn.style.cssText = 'position:absolute;right:0;top:0;height:100%;padding:0 8px;color:#777;outline:none;border:none;background:transparent;z-index:5;';

        group.appendChild(input);
        group.appendChild(spin);
        group.appendChild(btn);
        group.appendChild(drop);
        form.appendChild(group);

        // Events
        input.addEventListener('focus', () => showHint());
        input.addEventListener('input', onInput);
        input.addEventListener('keydown', e => { if (e.key === 'Escape') closeDrop(); });
        form.addEventListener('submit', e => {
            e.preventDefault();
            const q = input.value.trim();
            if (q.length >= 2) doSearch(q);
        });
        document.addEventListener('click', e => {
            if (!form.contains(e.target)) closeDrop();
        });
        return form;
    }

    function onInput(e) {
        const q = e.target.value.trim();
        clearTimeout(debTimer);
        if (q.length < 2) { closeDrop(); return; }
        showHint();
    }

    function showHint() {
        const drop = document.getElementById(DROP_ID);
        if (!drop) return;
        drop.innerHTML = `<div class="rmth-hint">Введите точный ник и нажмите Enter<small>RMTHub работает только с точными никами</small></div>`;
        openDrop(drop);
    }

    async function doSearch(username) {
        if (busy) return;
        busy = true;
        const spin = document.getElementById('fp-rmthub-spin');
        const drop = document.getElementById(DROP_ID);
        if (!drop) { busy = false; return; }
        if (spin) spin.style.display = 'block';
        showState(drop, 'Поиск…');

        try {
            const result = await new Promise((resolve) => {
                chrome.runtime.sendMessage({ action: 'rmthubFetch', username }, resolve);
            });

            if (!result || !result.ok) {
                if (result?.notFound) {
                    showState(drop, `Пользователь «${esc(username)}» не найден.<br><small style="opacity:.5;font-size:10px;">Введите точный ник без пробелов</small>`);
                } else {
                    showState(drop, 'Ошибка запроса. Попробуйте ещё раз.');
                }
                return;
            }

            renderCard(drop, result.data, result.avatar || DEF_AVA);
        } catch (err) {
            showState(drop, 'Ошибка запроса. Попробуйте ещё раз.');
        } finally {
            busy = false;
            if (spin) spin.style.display = 'none';
        }
    }

    function renderCard(drop, data, ava) {
        const u  = data.user  || {};
        const st = data.stats || {};
        const uid    = String(u.id || '');
        const uname  = u.username || '—';
        const banned = u.banned;
        const total  = st.totalAmount       || 0;
        const reviews = st.totalReviews     || 0;
        const avg    = st.averagePerReview  || 0;
        const games  = st.gamesPlayed       || 0;
        const top3   = (st.byGameWithPercentage || [])
            .filter(g => g.amount > 0)
            .sort((a, b) => b.amount - a.amount)
            .slice(0, 3);
        const fpUrl  = `https://funpay.com/users/${uid}/`;
        const rmtUrl = `https://rmthub.com/ru/funpay/${uid}`;

        drop.innerHTML = `
        <div class="rmth-card">
            <div class="rmth-head">
                <img class="rmth-ava" src="${esc(ava)}" onerror="this.src='${DEF_AVA}'" alt="">
                <div class="rmth-uinfo">
                    <div class="rmth-name">${esc(uname)}${banned ? '<span class="rmth-banned">БАН</span>' : ''}</div>
                    <div class="rmth-uid">#${esc(uid)}</div>
                </div>
            </div>
            <div class="rmth-grid">
                <div class="rmth-stat"><div class="rmth-sval">$${fmt(total)}</div><div class="rmth-slbl">Выручка</div></div>
                <div class="rmth-stat"><div class="rmth-sval">${fmt(reviews,0)}</div><div class="rmth-slbl">Отзывы</div></div>
                <div class="rmth-stat"><div class="rmth-sval">$${fmt(avg)}</div><div class="rmth-slbl">Ср. чек</div></div>
                <div class="rmth-stat"><div class="rmth-sval">${games}</div><div class="rmth-slbl">Игр</div></div>
            </div>
            ${top3.length ? `<div class="rmth-glbl">ТОП ИГРЫ</div>${top3.map(g=>`<div class="rmth-grow"><span class="rmth-gname">${esc(g.game)}</span><span class="rmth-gpct">${g.percentage}%</span><span class="rmth-grev">$${fmt(g.amount)}</span></div>`).join('')}` : ''}
        </div>
        <div class="rmth-foot">
            <div class="rmth-links">
                <a href="${esc(fpUrl)}" target="_blank">🔗 FunPay</a>
                <a href="${esc(rmtUrl)}" target="_blank">📊 RMTHub</a>
            </div>
            <span class="rmth-credit">Данные: RMTHub.com</span>
        </div>`;
        openDrop(drop);
    }

    function showState(drop, msg) {
        drop.innerHTML = `<div class="rmth-state">${msg}</div>`;
        openDrop(drop);
    }

    function openDrop(d) {
        d.classList.remove('hidden');
        d.style.display = 'block';
    }

    function closeDrop() {
        const d = document.getElementById(DROP_ID);
        if (!d) return;
        d.classList.add('hidden');
        d.style.display = '';
        busy = false;
        clearTimeout(debTimer);
        const s = document.getElementById('fp-rmthub-spin');
        if (s) s.style.display = 'none';
    }

    function esc(s) {
        return String(s)
            .replace(/&/g,'&amp;').replace(/</g,'&lt;')
            .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    }
    function fmt(n, d = 0) {
        return Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
    }

    // ── Mount — insert after the game search form, with multiple fallbacks ─────
    function mount() {
        if (document.getElementById(WRAP_ID)) return;
        // Try multiple possible anchor points (FunPay occasionally changes their markup)
        const anchor =
            document.querySelector('form.navbar-form.promo-games-filter') ||
            document.querySelector('form.navbar-form.navbar-left') ||
            document.querySelector('.navbar-form') ||
            document.querySelector('.navbar-header') ||
            document.querySelector('.navbar-nav');
        if (!anchor) return;
        injectStyles();
        anchor.insertAdjacentElement('afterend', buildForm());
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount);
    else mount();
    setTimeout(mount, 800);

    window.initRMTHubSearch = mount;
})();
