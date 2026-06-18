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

    // Tracks which chat the listener is currently bound to. On SPA chat switches the
    // node= changes but the same <textarea> stays in the DOM, so we must re-read the
    // chatId instead of capturing it once.
    let _draftBoundInput = null;
    let _draftTimer = null;

    function initDraftSaving() {
        loadDrafts().then(() => {
            const input = document.querySelector('.chat-form-input .form-control');
            if (!input) return;

            const currentChatId = getChatIdFromUrl();

            // Restore draft for the chat we're actually looking at right now.
            // Only restore into a genuinely empty field, and never overwrite text the
            // user already has. We mark the restore as programmatic so it isn't re-saved.
            if (currentChatId && _drafts[currentChatId] && !input.value) {
                window.__fptProgrammaticInput = true;
                input.value = _drafts[currentChatId];
                input.dispatchEvent(new Event('input', { bubbles: true }));
                window.__fptProgrammaticInput = false;
            }

            // Attach the input listener only once per textarea element.
            if (_draftBoundInput !== input) {
                _draftBoundInput = input;

                input.addEventListener('input', () => {
                    // Ignore input events that WE triggered (templates, autoresponder,
                    // AI rewrite, draft restore). Those must never be persisted as drafts,
                    // which was causing drafts to appear "out of nowhere".
                    if (window.__fptProgrammaticInput) return;

                    // Always resolve the chatId live - the bound textarea is reused across
                    // chats in FunPay's SPA, so a captured id would be stale.
                    const chatId = getChatIdFromUrl();
                    if (!chatId) return;

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

                // Clear the draft for the chat that is active at submit time.
                const form = input.closest('form');
                form?.addEventListener('submit', () => {
                    const chatId = getChatIdFromUrl();
                    if (!chatId) return;
                    delete _drafts[chatId];
                    chrome.storage.local.set({ [DRAFT_KEY]: _drafts });
                });

                // FIX 2.8.2 (№4): FunPay отправляет сообщения через AJAX (runner),
                // настоящего submit формы НЕ происходит → черновик не очищался и
                // последнее отправленное сообщение «спавнилось» обратно в поле.
                // Дополнительно ловим момент отправки: клик по кнопке отправки и
                // нажатие Enter. После него поле очищается самим FunPay - как только
                // оно стало пустым, удаляем черновик этого чата.
                const clearDraftForActiveChat = () => {
                    const chatId = getChatIdFromUrl();
                    if (!chatId) return;
                    clearTimeout(_draftTimer);   // отменяем отложенное сохранение
                    delete _drafts[chatId];
                    chrome.storage.local.set({ [DRAFT_KEY]: _drafts });
                };

                // ждём, пока FunPay очистит поле после отправки, затем чистим черновик
                const scheduleClearAfterSend = () => {
                    const chatId = getChatIdFromUrl();
                    if (!chatId) return;
                    let tries = 0;
                    const iv = setInterval(() => {
                        tries++;
                        if (input.value.trim() === '') { clearTimeout(_draftTimer); delete _drafts[chatId]; chrome.storage.local.set({ [DRAFT_KEY]: _drafts }); clearInterval(iv); }
                        else if (tries > 20) clearInterval(iv); // ~2с максимум
                    }, 100);
                };

                const sendBtn = form?.querySelector('button[type="submit"], .chat-form-btn, .btn-chat-send');
                sendBtn?.addEventListener('click', scheduleClearAfterSend, true);

                input.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter' && !e.shiftKey) scheduleClearAfterSend();
                });
            }
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
    // FIX 2.8.2 (№11): при открытии чата прокручиваем ленту сообщений к низу
    // (к самым свежим), чтобы не приходилось скроллить вручную. Ждём появления
    // сообщений и докручиваем несколько раз - FunPay подгружает их асинхронно.
    function scrollChatToBottom() {
        const list = document.querySelector('.chat-message-list, .chat-detail .chat-message-list, .chat-full .chat-message-list');
        if (!list) return;
        let tries = 0;
        let lastH = -1;
        const iv = setInterval(() => {
            tries++;
            const list2 = document.querySelector('.chat-message-list, .chat-detail .chat-message-list, .chat-full .chat-message-list');
            if (!list2) { clearInterval(iv); return; }
            // докручиваем, пока высота растёт (подгружаются сообщения)
            if (list2.scrollHeight !== lastH) {
                lastH = list2.scrollHeight;
                list2.scrollTop = list2.scrollHeight;
            }
            if (tries > 12) clearInterval(iv); // ~1.8с
        }, 150);
    }

    function init() {
        initCtrlEnterSend();

        // For chat pages, init draft + char counter
        const isChatPage = window.location.pathname.includes('/chat/') ||
            window.location.pathname.includes('/users/') && document.querySelector('.chat-form-input');

        if (document.querySelector('.chat-form-input')) {
            initDraftSaving();
            initCharCounter();
            scrollChatToBottom();
        }

        // Watch for chat form appearing (SPA routing)
        const root = document.getElementById('content') || document.body;
        let _initDone = !!document.querySelector('.chat-form-input');
        let _lastUrl = window.location.href;
        new MutationObserver(() => {
            if (!_initDone && document.querySelector('.chat-form-input')) {
                _initDone = true;
                initDraftSaving();
                initCharCounter();
                scrollChatToBottom();
            }
            if (_initDone && !document.querySelector('.chat-form-input')) {
                _initDone = false;
            }
            // SPA navigation between chats keeps the form mounted but changes node=.
            // Re-run draft init so the correct chat's draft is restored and the live
            // chatId is used for saving.
            if (window.location.href !== _lastUrl) {
                _lastUrl = window.location.href;
                if (document.querySelector('.chat-form-input')) { initDraftSaving(); scrollChatToBottom(); }
            }
        }).observe(root, { childList: true, subtree: true });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();