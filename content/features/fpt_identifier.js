function initializeFPTIdentifier() {
    'use strict';

    const path = window.location.pathname;
    if (!path.startsWith('/chat/') && !path.startsWith('/lots/offer') && !path.startsWith('/orders/')) {
        return;
    }

    const FPT_SIGNATURE = '\u200B\u200D\u200C';
    const FPT_LABEL_CLASS = 'fpt-status-label';
    const identifiedUsers = new Set();
    let currentChatUserId = null;
    let lastSeenAuthorId = null;

    function addIdentifierStyles() {
        const styleId = 'fpt-identifier-styles';
        if (document.getElementById(styleId)) return;

        const style = document.createElement('style');
        style.id = styleId;
        style.textContent = `
            .${FPT_LABEL_CLASS} {
                color: #8a2be2;
                font-weight: 600;
                margin-left: 5px;
                user-select: none;
            }
        `;
        document.head.appendChild(style);
    }

    function getUserIdFromUrl(url) {
        if (!url) return null;
        const match = url.match(/users\/(\d+)/);
        return match ? match[1] : null;
    }

    function updateHeaderStatus() {
        const header = document.querySelector('.chat-header');
        if (!header) return;
        const statusElement = header.querySelector('.media-user-status');
        const userLink = header.querySelector('.media-user-name a');
        if (!statusElement || !userLink) return;

        const existingLabel = statusElement.querySelector(`.${FPT_LABEL_CLASS}`);
        if (existingLabel) existingLabel.remove();

        const userIdInHeader = getUserIdFromUrl(userLink.href);
        currentChatUserId = userIdInHeader;

        if (userIdInHeader && identifiedUsers.has(userIdInHeader)) {
            const label = document.createElement('span');
            label.className = FPT_LABEL_CLASS;
            label.innerHTML = '&middot; FunPay Tools';
            statusElement.appendChild(label);
        }
    }

    function processMessage(messageNode) {
        let authorId = null;
        if (messageNode.classList.contains('chat-msg-with-head')) {
            const authorLink = messageNode.querySelector('.chat-msg-author-link');
            if (authorLink) {
                authorId = getUserIdFromUrl(authorLink.href);
                lastSeenAuthorId = authorId;
            }
        } else {
            authorId = lastSeenAuthorId;
        }

        if (!authorId) return;

        const textElement = messageNode.querySelector('.chat-msg-text');
        if (textElement && textElement.textContent.includes(FPT_SIGNATURE)) {
            if (!identifiedUsers.has(authorId)) {
                identifiedUsers.add(authorId);
                if (authorId === currentChatUserId) {
                    updateHeaderStatus();
                }
            }
        }
    }

    async function initializeLogic() {
        addIdentifierStyles();
        
        const form = await waitForElement('.chat-form form');
        const textarea = form.querySelector('textarea[name="content"]');
        const sendButton = form.querySelector('button[type="submit"]');
        
        if (textarea && sendButton) {
            const injectSignature = () => {
                const val = textarea.value;
                if (!val) return;

                // --- АНТИУСЛОВИЯ (Anti-conditions) ---
                
                // 1. Если сообщение меньше 4 символов (игнорируя пробелы по краям)
                if (val.trim().length < 4) {
                    return;
                }

                // 2. Если в сообщении есть ссылка (простая проверка на http/https/www)
                const urlRegex = /(https?:\/\/[^\s]+)|(www\.[^\s]+)/i;
                if (urlRegex.test(val)) {
                    return;
                }

                // --- КОНЕЦ АНТИУСЛОВИЙ ---

                if (!val.endsWith(FPT_SIGNATURE)) {
                    if (!val.endsWith(' ')) {
                        textarea.value += ' ';
                    }
                    textarea.value += FPT_SIGNATURE;
                }
            };

            sendButton.addEventListener('click', injectSignature, true);
            textarea.addEventListener('keydown', (event) => {
                if (event.key === 'Enter' && !event.shiftKey) injectSignature();
            }, true);
        }

        const chatContainer = await waitForElement('.chat.chat-float, .chat-full .chat');

        chatContainer.querySelectorAll('.chat-msg-item').forEach(processMessage);
        updateHeaderStatus();

        const observer = new MutationObserver(() => {
            const headerUserLink = document.querySelector('.chat-header .media-user-name a');
            const newUserId = headerUserLink ? getUserIdFromUrl(headerUserLink.href) : null;

            if (newUserId !== currentChatUserId) {
                lastSeenAuthorId = null;
                chatContainer.querySelectorAll('.chat-msg-item').forEach(processMessage);
                updateHeaderStatus();
            }

            chatContainer.querySelectorAll('.chat-msg-item:not(.fpt-processed)').forEach(node => {
                node.classList.add('fpt-processed');
                processMessage(node);
            });
        });

        observer.observe(chatContainer, { childList: true, subtree: true });
        console.log('FunPay Tools Identifier: Скрипт запущен.');
    }

    function waitForElement(selector) {
        return new Promise(resolve => {
            if (document.querySelector(selector)) {
                return resolve(document.querySelector(selector));
            }
            const observer = new MutationObserver(() => {
                if (document.querySelector(selector)) {
                    observer.disconnect();
                    resolve(document.querySelector(selector));
                }
            });
            observer.observe(document.body, { childList: true, subtree: true });
        });
    }

    initializeLogic();
}