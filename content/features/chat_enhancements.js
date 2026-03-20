// content/features/chat_enhancements.js
// Chat quality-of-life improvements:
// 1. Unread total badge on the "Сообщения" nav link
// 2. Timestamp relative refresh ("только что", "2 мин назад", etc.) 
// 3. Ctrl+Enter to send
// 4. Draft saving per chat (survives page navigation)

(function () {
    'use strict';

    // --- 1. Ctrl+Enter to send ---
    function initCtrlEnterSend() {
        document.addEventListener('keydown', (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                const input = document.querySelector('.chat-form-input .form-control');
                if (input && document.activeElement === input) {
                    const form = input.closest('form');
                    const submitBtn = form?.querySelector('button[type="submit"]');
                    if (submitBtn && !submitBtn.disabled) {
                        e.preventDefault();
                        submitBtn.click();
                    }
                }
            }
        });
    }

    // --- 2. Draft saving per chat ---
    const DRAFT_KEY = 'fpToolsChatDrafts';
    let _drafts = {};

    async function loadDrafts() {
        const d = await chrome.storage.local.get(DRAFT_KEY);
        _drafts = d[DRAFT_KEY] || {};
    }

    async function saveDraft(chatId, text) {
        if (!chatId) return;
        _drafts[chatId] = text;
        // Trim to last 200 chats
        const keys = Object.keys(_drafts);
        if (keys.length > 200) {
            keys.slice(0, keys.length - 200).forEach(k => delete _drafts[k]);
        }
        await chrome.storage.local.set({ [DRAFT_KEY]: _drafts });
    }

    function getChatIdFromUrl() {
        const m = window.location.search.match(/[?&]node=(\d+)/);
        return m ? m[1] : null;
    }

    function initDraftSaving() {
        loadDrafts().then(() => {
            const chatId = getChatIdFromUrl();
            if (!chatId) return;

            const input = document.querySelector('.chat-form-input .form-control');
            if (!input) return;

            // Restore draft
            if (_drafts[chatId] && !input.value) {
                input.value = _drafts[chatId];
                input.dispatchEvent(new Event('input', { bubbles: true }));
            }

            // Save on input
            let _draftTimer = null;
            input.addEventListener('input', () => {
                clearTimeout(_draftTimer);
                _draftTimer = setTimeout(() => {
                    const text = input.value.trim();
                    if (text) saveDraft(chatId, text);
                    else {
                        delete _drafts[chatId];
                        chrome.storage.local.set({ [DRAFT_KEY]: _drafts });
                    }
                }, 800);
            });

            // Clear draft on send
            const form = input.closest('form');
            form?.addEventListener('submit', () => {
                delete _drafts[chatId];
                chrome.storage.local.set({ [DRAFT_KEY]: _drafts });
            });
        });
    }

    // --- 3. Character counter on chat input ---
    function initCharCounter() {
        const input = document.querySelector('.chat-form-input .form-control');
        if (!input || document.getElementById('fp-chat-char-count')) return;

        const counter = document.createElement('span');
        counter.id = 'fp-chat-char-count';
        counter.className = 'fp-chat-char-count';
        counter.textContent = '';

        const formGroup = document.querySelector('#comments');
        if (formGroup) {
            formGroup.style.position = 'relative';
            formGroup.appendChild(counter);
        }

        input.addEventListener('input', () => {
            const len = input.value.length;
            if (len > 0) {
                counter.textContent = len;
                counter.style.display = 'block';
                counter.style.color = len > 900 ? '#ff5c5c' : len > 700 ? '#ffa500' : '#4a5070';
            } else {
                counter.style.display = 'none';
            }
        });
    }

    // --- Init ---
    function init() {
        initCtrlEnterSend();

        // For chat pages, init draft + char counter
        const isChatPage = window.location.pathname.includes('/chat/') ||
            window.location.pathname.includes('/users/') && document.querySelector('.chat-form-input');

        if (document.querySelector('.chat-form-input')) {
            initDraftSaving();
            initCharCounter();
        }

        // Watch for chat form appearing (SPA routing)
        const root = document.getElementById('content') || document.body;
        let _initDone = !!document.querySelector('.chat-form-input');
        new MutationObserver(() => {
            if (!_initDone && document.querySelector('.chat-form-input')) {
                _initDone = true;
                initDraftSaving();
                initCharCounter();
            }
            if (_initDone && !document.querySelector('.chat-form-input')) {
                _initDone = false;
            }
        }).observe(root, { childList: true, subtree: true });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();