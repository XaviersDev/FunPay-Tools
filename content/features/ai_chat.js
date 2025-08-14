let lastAIProcessedText = null;
let isAISuggestionActive = false;
const PROFANITY_ROOTS = ['хуй', 'пизд', 'бля', 'еба', 'ёба', 'сука', 'сучар', 'мраз', 'гнид', 'уеб', 'уёб', 'пидр', 'пидор', 'гомо', 'петух', 'залуп', 'мудак', 'манда', 'мудозвон', 'вагин', 'шлюх', 'нахуй', 'похуй', 'охуе', 'ахуе', 'еблан', 'долбоеб', 'долбоёб', 'ебуч', 'ёбуч', 'пиздюк', 'чмо', 'мразь', 'конч', 'дроч'];
const profanityRegex = new RegExp(`(${PROFANITY_ROOTS.join('|')})`, 'i');

function getChatContext() {
    const myUsernameEl = document.querySelector('.user-link-name');
    const myUsername = myUsernameEl ? myUsernameEl.textContent.trim() : "Me";

    const chatContainer = document.querySelector('.chat.chat-float');
    if (!chatContainer) return { context: "[No active chat found]", myUsername };

    const messageNodes = chatContainer.querySelectorAll('.chat-msg-item');
    if (messageNodes.length === 0) return { context: "[Chat is empty]", myUsername };

    let contextLines = [];
    messageNodes.forEach(node => {
        const authorLink = node.querySelector('.chat-msg-author-link');
        let authorName = 'System';
        if (authorLink) {
            authorName = authorLink.textContent.trim();
        } else {
            const authorLabel = node.querySelector('.chat-msg-author-label');
            if (authorLabel) {
                const funpayAuthorEl = node.querySelector('.media-user-name');
                 if (funpayAuthorEl) {
                    authorName = funpayAuthorEl.textContent.replace(authorLabel.textContent, '').trim();
                 }
            }
        }
        
        const textEl = node.querySelector('.chat-msg-text');
        if (textEl) {
            const tempEl = textEl.cloneNode(true);
            tempEl.querySelectorAll('.chat-img').forEach(img => {
                img.outerHTML = '[Изображение]';
            });
            let messageText = tempEl.textContent.trim().replace(/\s+/g, ' ');
            contextLines.push(`${authorName}: ${messageText}`);
        }
    });
    
    const recentContext = contextLines.slice(-20).join('\n');
    return { context: recentContext, myUsername };
}

async function getAIProcessedText(text, type = "rewrite") {
    const chatInput = document.querySelector('.chat-form-input .form-control');
    let shouldManageLoadingState = type === "rewrite";

    const { context, myUsername } = getChatContext();

    if (chatInput && shouldManageLoadingState) {
        chatInput.classList.add('ai-loading-textarea');
        chatInput.disabled = true;
    }
    try {
        const response = await chrome.runtime.sendMessage({ 
            action: "getAIProcessedText", 
            text: text, 
            context: context, 
            myUsername: myUsername, 
            type: type 
        });

        if (chatInput && shouldManageLoadingState) {
            chatInput.classList.remove('ai-loading-textarea');
            chatInput.disabled = false;
        }
        if (response && response.success) {
            if (type === "rewrite") {
                lastAIProcessedText = response.data;
                isAISuggestionActive = true;
            }
            return response.data;
        } else {
            console.error('AI processing failed:', response ? response.error : 'No response');
            showNotification(`Ошибка обработки AI: ${response ? response.error : 'Нет ответа от AI'}`, true);
            if (type === "rewrite") { lastAIProcessedText = null; isAISuggestionActive = false; }
            return type === "generate" ? `[Ошибка AI: ${text}]` : text;
        }
    } catch (error) {
        if (chatInput && shouldManageLoadingState) {
            chatInput.classList.remove('ai-loading-textarea');
            chatInput.disabled = false;
        }
        console.error('Error sending/processing AI message:', error);
        showNotification(`Ошибка связи с AI модулем: ${error.message}`, true);
        if (type === "rewrite") { lastAIProcessedText = null; isAISuggestionActive = false; }
        return type === "generate" ? `[Ошибка AI: ${text}]` : text;
    }
}

function setupProfanityChecker(chatTextarea, warningDiv) {
    if (!chatTextarea || !warningDiv) return;

    warningDiv.addEventListener('click', () => {
        const aiButton = document.getElementById('aiModeToggleBtn');
        if (aiButton && !aiModeActive) {
            aiButton.click();
        }
        warningDiv.style.display = 'none';
    });

    chatTextarea.addEventListener('input', () => {
        if (aiModeActive) {
            warningDiv.style.display = 'none';
            return;
        }
        const hasProfanity = profanityRegex.test(chatTextarea.value);
        warningDiv.style.display = hasProfanity ? 'block' : 'none';
    });
}

function setupAIChatFeature() {
    const chatFormInputDiv = document.querySelector('.chat-form-input');
    const chatTextarea = chatFormInputDiv ? chatFormInputDiv.querySelector('textarea.form-control') : null;
    const chatFormAttachDiv = document.querySelector('.chat-form-attach');
    const chatForm = chatTextarea ? chatTextarea.closest('form') : null;

    if (chatTextarea && chatFormAttachDiv && !document.getElementById('aiModeToggleBtn')) {
        const aiButton = createElement('button', { type: 'button', id: 'aiModeToggleBtn' }, {}, 'AI');
        if (chatFormAttachDiv.nextSibling) chatFormAttachDiv.parentNode.insertBefore(aiButton, chatFormAttachDiv.nextSibling);
        else chatFormAttachDiv.parentNode.appendChild(aiButton);

        aiButton.classList.toggle('active', aiModeActive);
        aiButton.title = aiModeActive ? 'AI Режим АКТИВЕН (Enter для генерации/отправки)' : 'AI Режим (Enter для генерации/отправки)';

        aiButton.addEventListener('click', async () => {
            aiModeActive = !aiModeActive;
            await chrome.storage.local.set({ aiModeActive: aiModeActive });
            aiButton.classList.toggle('active', aiModeActive);
            aiButton.title = aiModeActive ? 'AI Режим АКТИВЕН (Enter для генерации/отправки)' : 'AI Режим (Enter для генерации/отправки)';
            if (aiModeActive) {
                showNotification('AI режим активирован.');
                const warningDiv = document.getElementById('fpToolsProfanityWarning');
                if(warningDiv) warningDiv.style.display = 'none';
            }
            else {
                showNotification('AI режим отключен.');
                isAISuggestionActive = false;
            }
        });

        chatTextarea.addEventListener('input', () => {
            if (isAISuggestionActive && chatTextarea.value !== lastAIProcessedText) isAISuggestionActive = false;
        });

        chatTextarea.addEventListener('keydown', async (event) => {
            if (event.key === 'Enter' && !event.shiftKey && aiModeActive) {
                event.preventDefault();
                const currentText = chatTextarea.value.trim();
                if (isAISuggestionActive && currentText === lastAIProcessedText && lastAIProcessedText !== null) {
                    if (chatForm) {
                        const submitButton = chatForm.querySelector('button[type="submit"]');
                        if (submitButton) submitButton.click(); else chatForm.submit();
                    }
                    lastAIProcessedText = null; isAISuggestionActive = false;
                } else if (currentText) {
                    const processedText = await getAIProcessedText(currentText, "rewrite");
                    chatTextarea.value = processedText;
                    chatTextarea.dispatchEvent(new Event('input', { bubbles: true }));
                    chatTextarea.focus();
                    chatTextarea.selectionStart = chatTextarea.selectionEnd = chatTextarea.value.length;
                }
            }
        });

        let profanityWarning = document.getElementById('fpToolsProfanityWarning');
        if (!profanityWarning) {
            let buttonsContainer = document.querySelector('.chat-buttons-container');
            if(!buttonsContainer) {
                 buttonsContainer = document.createElement('div');
                 buttonsContainer.className = 'chat-buttons-container';
                 chatTextarea.parentElement.insertBefore(buttonsContainer, chatTextarea);
            }
            profanityWarning = createElement('div', { id: 'fpToolsProfanityWarning' });
            profanityWarning.textContent = "Обнаружена грубость! Хотите это исправить с помощью AI? Нажмите сюда, чтобы включить AI-режим.";
            chatTextarea.parentElement.insertBefore(profanityWarning, buttonsContainer);
            setupProfanityChecker(chatTextarea, profanityWarning);
        }
    }
}
