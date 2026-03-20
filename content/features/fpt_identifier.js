// content/features/fpt_identifier.js — FunPay Tools 3.0
// FIXED: Now works on /users/, /orders/, /chat/ and chat list pages.
//        Previously silently exited on /users/ (not in path allowlist).
//        Fixed selector for textarea and chat container across all page types.

function initializeFPTIdentifier() {
    'use strict';

    const path = window.location.pathname;

    // FIX: Added /users/ — previously this returned early on profile pages
    // which have an inline chat form (sends messages to seller).
    const ALLOWED = ['/chat/', '/lots/offer', '/orders/', '/users/'];
    if (!ALLOWED.some(p => path.startsWith(p))) return;

    const FPT_SIGNATURE   = '\u200B\u200D\u200C';
    const FPT_LABEL_CLASS = 'fpt-status-label';
    const identifiedUsers = new Set();
    let currentChatUserId = null;
    let lastSeenAuthorId  = null;

    // ── Styles ──────────────────────────────────────────────────────────────
    function addIdentifierStyles() {
        if (document.getElementById('fpt-identifier-styles')) return;
        const s = document.createElement('style');
        s.id = 'fpt-identifier-styles';
        s.textContent = `
            .${FPT_LABEL_CLASS} {
                color: #6B66FF;
                font-size: 11px;
                font-weight: 600;
                margin-left: 6px;
                opacity: 0.85;
                user-select: none;
            }
        `;
        document.head.appendChild(s);
    }

    function getUserIdFromUrl(url) {
        if (!url) return null;
        const m = url.match(/users\/(\d+)/);
        return m ? m[1] : null;
    }

    // ── Header badge ────────────────────────────────────────────────────────
    function updateHeaderStatus() {
        const header = document.querySelector('.chat-header');
        if (!header) return;
        const statusEl  = header.querySelector('.media-user-status');
        const userLink  = header.querySelector('.media-user-name a');
        if (!statusEl || !userLink) return;

        statusEl.querySelector(`.${FPT_LABEL_CLASS}`)?.remove();
        const userId = getUserIdFromUrl(userLink.href);
        currentChatUserId = userId;
        if (userId && identifiedUsers.has(userId)) {
            const lbl = document.createElement('span');
            lbl.className = FPT_LABEL_CLASS;
            lbl.textContent = '· FunPay Tools';
            statusEl.appendChild(lbl);
        }
    }

    // ── Message scanning ────────────────────────────────────────────────────
    function processMessage(node) {
        let authorId = null;
        if (node.classList.contains('chat-msg-with-head')) {
            const link = node.querySelector('.chat-msg-author-link');
            if (link) { authorId = getUserIdFromUrl(link.href); lastSeenAuthorId = authorId; }
        } else {
            authorId = lastSeenAuthorId;
        }
        if (!authorId) return;
        const txt = node.querySelector('.chat-msg-text');
        if (txt?.textContent.includes(FPT_SIGNATURE)) {
            if (!identifiedUsers.has(authorId)) {
                identifiedUsers.add(authorId);
                if (authorId === currentChatUserId) updateHeaderStatus();
            }
        }
    }

    // ── Injection guard ──────────────────────────────────────────────────────
    function shouldInject(text) {
        if (!text || text.trim().length < 4) return false;
        if (/(https?:\/\/|www\.|ftp:\/\/)/i.test(text)) return false;
        if (/funpay\.com/i.test(text)) return false;
        if (/[A-Za-z]:\\/i.test(text) || /^\/[a-z]/i.test(text)) return false;
        // Already contains zero-width chars (own or foreign signature)
        if (/[\u200B\u200C\u200D\uFEFF]/.test(text)) return false;
        return true;
    }

    // ── Find chat textarea across ALL page types ────────────────────────────
    // FunPay uses .chat-form > form > .chat-form-input > textarea[name="content"]
    // on /users/, /orders/, /chat/ pages (same structure, just different parents).
    // FIX: waitForElement('.chat-form form') was broken because form was found
    // but querySelector('button[type="submit"]') on it failed on some pages.
    async function setupFormInjection() {
        // Wait for the textarea directly — works on ALL page types
        const textarea = await waitForElement('textarea[name="content"]', 8000);
        if (!textarea) return;

        // The submit button is always .btn-round[type=submit] OR .btn-gray.btn-round inside .chat-form-btn
        const form = textarea.closest('form');
        if (!form) return;

        const sendBtn = form.querySelector('button[type="submit"], button.btn-round');
        if (!sendBtn) return;

        const injectSig = () => {
            const val = textarea.value;
            if (!shouldInject(val)) return;
            if (!val.endsWith(FPT_SIGNATURE)) {
                if (!val.endsWith(' ')) textarea.value += ' ';
                textarea.value += FPT_SIGNATURE;
            }
        };

        sendBtn.addEventListener('click', injectSig, true);
        textarea.addEventListener('keydown', e => {
            if (e.key === 'Enter' && !e.shiftKey) injectSig();
        }, true);
    }

    // ── Find chat message container across ALL page types ───────────────────
    // /chat/ full page  → .chat-full .chat
    // /orders/          → .chat.chat-float  (inside .chat-float-container)
    // /users/           → .chat-form parent does NOT have a .chat wrapper;
    //                     messages are in .chat-message-list if any, or we
    //                     observe .chat-form's parent container instead.
    async function setupMessageObserver() {
        // Try all known selectors, prefer most specific
        const containerSelector =
            '.chat.chat-float, .chat-full .chat, .chat-message-list, .chat-message-container';

        const container = await waitForElement(containerSelector, 8000);
        if (!container) return;

        // Scan existing messages
        container.querySelectorAll('.chat-msg-item').forEach(processMessage);
        updateHeaderStatus();

        const observer = new MutationObserver(() => {
            // Detect chat switch (clicking a different contact in the list)
            const headerLink = document.querySelector('.chat-header .media-user-name a');
            const newUserId  = headerLink ? getUserIdFromUrl(headerLink.href) : null;
            if (newUserId !== currentChatUserId) {
                lastSeenAuthorId = null;
                container.querySelectorAll('.chat-msg-item').forEach(processMessage);
                updateHeaderStatus();
            }
            // Process new messages
            container.querySelectorAll('.chat-msg-item:not(.fpt-processed)').forEach(node => {
                node.classList.add('fpt-processed');
                processMessage(node);
            });
        });
        observer.observe(container, { childList: true, subtree: true });
    }

    // ── waitForElement with optional timeout ─────────────────────────────────
    function waitForElement(selector, timeout = 0) {
        return new Promise(resolve => {
            const el = document.querySelector(selector);
            if (el) return resolve(el);

            const obs = new MutationObserver(() => {
                const found = document.querySelector(selector);
                if (found) { obs.disconnect(); resolve(found); }
            });
            obs.observe(document.body, { childList: true, subtree: true });

            if (timeout > 0) {
                setTimeout(() => { obs.disconnect(); resolve(null); }, timeout);
            }
        });
    }

    // ── Boot ────────────────────────────────────────────────────────────────
    async function boot() {
        const { fpToolsIdentifierEnabled } = await chrome.storage.local.get('fpToolsIdentifierEnabled');
        if (fpToolsIdentifierEnabled === false) return;

        addIdentifierStyles();
        // Run both in parallel — they each wait independently
        await Promise.all([setupFormInjection(), setupMessageObserver()]);
    }

    boot();
}
