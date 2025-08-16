let particles = [];
let isHoveringAIGenBtn = false;
let animationFrameId = null;

function createAIGeneratorUI() {
    const header = Array.from(document.querySelectorAll('h1.page-header, h1.page-header.page-header-no-hr'))
        .find(h1 => h1.textContent.includes('Добавление предложения') || h1.textContent.includes('Редактирование предложения'));

    if (!header) return;
    if (document.getElementById('fp-tools-ai-gen-btn-wrapper')) return;

    let actionsContainer = document.querySelector('.fp-tools-lot-edit-actions-container');
    if (!actionsContainer) {
        actionsContainer = createElement('div', { class: 'fp-tools-lot-edit-actions-container' });
        header.parentNode.insertBefore(actionsContainer, header.nextSibling);
    }

    const wrapper = createElement('div', { id: 'fp-tools-ai-gen-btn-wrapper' });
    const button = createElement('button', { class: 'fp-tools-ai-gen-btn', id: 'fp-tools-ai-gen-btn' });
    button.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="#e3e3e3"><path d="m176-120-56-56 301-302-181-45 198-123-17-234 179 151 216-88-87 217 151 178-234-16-124 198-45-181-301 301Zm24-520-80-80 80-80 80 80-80 80Zm355 197 48-79 93 7-60-71 35-86-86 35-71-59 7 92-79 49 90 22 23 90Zm165 323-80-80 80-80 80 80-80 80ZM569-570Z"/></svg>
        <span>ИИ-генерация</span>
    `;
    const overlay = createElement('div', { class: 'fp-tools-ai-gen-overlay' });
    const canvas = createElement('canvas', { id: 'fp-tools-ai-gen-canvas' });
    
    wrapper.append(overlay, canvas, button);
    
    actionsContainer.appendChild(wrapper);

    const modal = createModal();
    document.body.appendChild(modal);

    setupAIGeneratorEventListeners(button, overlay, canvas, modal);
}

function createModal() {
    const modal = createElement('div', { class: 'fp-tools-ai-gen-modal', id: 'fp-tools-ai-gen-modal' });
    modal.innerHTML = `
        <div class="fp-tools-ai-gen-modal-content">
            <div class="fp-tools-ai-gen-modal-header">
                <h3>ИИ-генератор лотов</h3>
                <button class="close-btn">&times;</button>
            </div>
            <div class="fp-tools-ai-gen-modal-body">
                <p>ИИ проанализирует ваши существующие лоты и создаст новый в похожем стиле.</p>
                <label for="ai-prompt-title">Что продаём? (Краткая идея для заголовка)</label>
                <input type="text" id="ai-prompt-title" placeholder="Например: Пак аватарок на тему аниме">
                
                <label for="ai-prompt-desc">О чём написать в описании? (Ключевые особенности)</label>
                <textarea id="ai-prompt-desc" rows="4" placeholder="Например: 350 тысяч картинок, разделено по категориям, автовыдача, уникальные"></textarea>

                <div class="fp-tools-ai-gen-options">
                    <label>
                        <input type="checkbox" id="ai-gen-buyer-msg">
                        <span class="custom-checkbox"></span>
                        <span>Сгенерировать сообщение для покупателя</span>
                    </label>
                    <label>
                        <input type="checkbox" id="ai-gen-translate">
                        <span class="custom-checkbox"></span>
                        <span>Автоматически перевести на английский</span>
                    </label>
                </div>
            </div>
            <div class="fp-tools-ai-gen-modal-footer">
                <button id="ai-gen-submit-btn" class="submit-btn">
                    <span class="btn-text">Сгенерировать</span>
                    <span class="btn-loader"></span>
                </button>
            </div>
        </div>
    `;
    return modal;
}

function setupAIGeneratorEventListeners(button, overlay, canvas, modal) {
    const ctx = canvas.getContext('2d');

    const resizeCanvas = () => {
        const rect = button.getBoundingClientRect();
        canvas.width = rect.width + 100;
        canvas.height = rect.height + 100;
        canvas.style.left = `${rect.left - 50}px`;
        canvas.style.top = `${rect.top - 50}px`;
    };

    const particleLoop = () => {
        if (!isHoveringAIGenBtn && particles.length === 0) {
            animationFrameId = null;
            return;
        }

        ctx.clearRect(0, 0, canvas.width, canvas.height);

        if (isHoveringAIGenBtn && Math.random() > 0.5) {
            for(let i = 0; i < 2; i++) {
                particles.push({
                    x: canvas.width / 2, y: canvas.height / 2,
                    vx: (Math.random() - 0.5) * 3, vy: (Math.random() - 0.5) * 3,
                    life: 50, size: Math.random() * 2 + 1,
                    color: `rgba(227, 227, 227, ${Math.random() * 0.5 + 0.3})`
                });
            }
        }
        
        for (let i = particles.length - 1; i >= 0; i--) {
            const p = particles[i];
            p.x += p.vx; p.y += p.vy;
            p.life--;
            p.vx *= 0.98; p.vy *= 0.98;

            if (p.life <= 0) {
                particles.splice(i, 1);
                continue;
            }

            ctx.globalAlpha = p.life / 50;
            ctx.fillStyle = p.color;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.globalAlpha = 1;
        animationFrameId = requestAnimationFrame(particleLoop);
    };

    button.addEventListener('mouseenter', () => {
        isHoveringAIGenBtn = true;
        overlay.classList.add('active');
        resizeCanvas();
        if (!animationFrameId) particleLoop();
    });

    button.addEventListener('mouseleave', () => {
        isHoveringAIGenBtn = false;
        overlay.classList.remove('active');
    });

    button.addEventListener('click', () => modal.classList.add('active'));
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.classList.remove('active');
        }
    });
    modal.querySelector('.close-btn').addEventListener('click', () => modal.classList.remove('active'));
    modal.querySelector('#ai-gen-submit-btn').addEventListener('click', handleAIGeneration);

    window.addEventListener('resize', resizeCanvas);
}


async function handleAIGeneration() {
    const submitBtn = document.getElementById('ai-gen-submit-btn');
    submitBtn.classList.add('loading');
    submitBtn.disabled = true;

    try {
        const promptTitle = document.getElementById('ai-prompt-title').value;
        const promptDesc = document.getElementById('ai-prompt-desc').value;
        const genBuyerMsg = document.getElementById('ai-gen-buyer-msg').checked;
        const doTranslate = document.getElementById('ai-gen-translate').checked;

        if (!promptTitle || !promptDesc) {
            showNotification('Заполните оба поля для генерации.', true);
            return;
        }

        const profileLinkEl = document.querySelector('.user-link-dropdown[href*="/users/"]');
        if (!profileLinkEl) {
            showNotification('Не удалось найти ссылку на ваш профиль для анализа стиля.', true);
            return;
        }

        const profileUrl = profileLinkEl.href;
        const response = await fetch(profileUrl);
        if (!response.ok) {
            showNotification(`Ошибка загрузки профиля: ${response.status}`, true);
            return;
        }
        const profileHtml = await response.text();
        const parser = new DOMParser();
        const profileDoc = parser.parseFromString(profileHtml, 'text/html');
        
        const lotTitles = Array.from(profileDoc.querySelectorAll('.tc-desc-text')).map(el => el.textContent.trim()).slice(0, 20);
        const styleExamples = lotTitles.length > 0 ? lotTitles.join('\n') : "Стиль не найден, используй креативный маркетинговый стиль FunPay с эмодзи.";

        const gameCategory = document.querySelector('.back-link .inside')?.textContent.trim() || 'неизвестная категория';

        const aiResult = await chrome.runtime.sendMessage({
            action: 'generateAILot',
            data: {
                promptTitle,
                promptDesc,
                genBuyerMsg,
                styleExamples,
                gameCategory
            }
        });

        if (!aiResult || !aiResult.success) {
            throw new Error(aiResult.error || 'Неизвестная ошибка AI.');
        }

        const ruTitle = aiResult.data.title;
        const ruDesc = aiResult.data.description;
        const ruBuyerMsg = aiResult.data.buyerMessage || '';

        document.querySelector('input[name="fields[summary][ru]"]').value = ruTitle;
        document.querySelector('textarea[name="fields[desc][ru]"]').value = ruDesc;
        if(genBuyerMsg) document.querySelector('textarea[name="fields[payment_msg][ru]"]').value = ruBuyerMsg;

        if (doTranslate) {
            showNotification('Генерация завершена. Начинаю перевод...', false);
            const translationResult = await chrome.runtime.sendMessage({
                action: 'translateLotText',
                data: { title: ruTitle, description: ruDesc, buyerMessage: ruBuyerMsg }
            });
            if (translationResult && translationResult.success) {
                document.querySelector('input[name="fields[summary][en]"]').value = translationResult.data.title;
                document.querySelector('textarea[name="fields[desc][en]"]').value = translationResult.data.description;
                 if(genBuyerMsg) document.querySelector('textarea[name="fields[payment_msg][en]"]').value = translationResult.data.buyerMessage;
            } else {
                 showNotification('Ошибка перевода. Английские поля остались пустыми.', true);
            }
        }
        
        document.querySelectorAll('.lot-field-input').forEach(el => el.dispatchEvent(new Event('input', { bubbles: true })));

        document.getElementById('fp-tools-ai-gen-modal').classList.remove('active');
        showNotification('Лот успешно сгенерирован!', false);

    } catch (error) {
        showNotification(`Ошибка генерации: ${error.message}`, true);
        console.error("AI Lot Generation Error:", error);
    } finally {
        submitBtn.classList.remove('loading');
        submitBtn.disabled = false;
    }
}

function addTranslateButton() {
    const enTabLink = document.querySelector('.lot-fields-multilingual .nav-tabs li[data-locale="en"] a');
    if (!enTabLink || document.getElementById('fp-tools-translate-btn')) {
        return;
    }

    const translateBtn = createElement('button', {
        type: 'button',
        id: 'fp-tools-translate-btn',
        title: 'Перевести'
    }, {}, 'Перевод');

    enTabLink.parentNode.insertBefore(translateBtn, enTabLink.nextSibling);

    translateBtn.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();

        translateBtn.textContent = 'Перевожу...';
        translateBtn.disabled = true;

        try {
            const data = {
                title: document.querySelector('input[name="fields[summary][ru]"]').value,
                description: document.querySelector('textarea[name="fields[desc][ru]"]').value,
                buyerMessage: document.querySelector('textarea[name="fields[payment_msg][ru]"]').value
            };

            if (!data.title && !data.description) {
                showNotification('Нечего переводить. Заполните русские поля.', true);
                return;
            }

            const result = await chrome.runtime.sendMessage({ action: 'translateLotText', data: data });

            if (result && result.success) {
                document.querySelector('input[name="fields[summary][en]"]').value = result.data.title || '';
                document.querySelector('textarea[name="fields[desc][en]"]').value = result.data.description || '';
                document.querySelector('textarea[name="fields[payment_msg][en]"]').value = result.data.buyerMessage || '';
                showNotification('Текст успешно переведен!', false);
            } else {
                throw new Error(result.error || 'Неизвестная ошибка перевода.');
            }

        } catch (error) {
            showNotification(`Ошибка перевода: ${error.message}`, true);
        } finally {
            translateBtn.textContent = 'Перевод';
            translateBtn.disabled = false;
        }
    });
}

createAIGeneratorUI();
addTranslateButton();
