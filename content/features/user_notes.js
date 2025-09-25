// content/features/user_notes.js

let userStatuses = {};

/**
 * Определяет контрастный цвет (черный или белый) для заданного HEX-цвета.
 * @param {string} hexColor - Цвет в формате #RRGGBB.
 * @returns {string} - '#000000' (черный) или '#FFFFFF' (белый).
 */
function getContrastColor(hexColor) {
    if (!hexColor) return '#FFFFFF';
    const r = parseInt(hexColor.substr(1, 2), 16);
    const g = parseInt(hexColor.substr(3, 2), 16);
    const b = parseInt(hexColor.substr(5, 2), 16);
    // Формула для вычисления яркости (YIQ)
    const yiq = ((r * 299) + (g * 587) + (b * 114)) / 1000;
    return (yiq >= 128) ? '#000000' : '#FFFFFF';
}


// Функция для сохранения статусов в chrome.storage.local
async function saveUserStatuses() {
    await chrome.storage.local.set({ fpToolsUserStatuses: userStatuses });
}

// Функция для установки статуса пользователю (теперь принимает объект)
function setUserStatus(userId, statusObject) {
    const contactItem = document.querySelector(`.contact-item[data-id="${userId}"]`);
    if (!contactItem) return;

    let statusElement = contactItem.querySelector('.fp-tools-user-status');

    if (!statusElement) {
        statusElement = createElement('span', { class: 'fp-tools-user-status' });
        const userNameElement = contactItem.querySelector('.media-user-name');
        if (userNameElement) {
            userNameElement.prepend(statusElement);
        }
    }
    
    // Если statusObject передан, устанавливаем цвет и подсказку с названием
    if (statusObject && statusObject.color) {
        const contrastColor = getContrastColor(statusObject.color);
        statusElement.style.backgroundColor = statusObject.color;
        // Устанавливаем CSS переменные для стилизации подсказки
        statusElement.style.setProperty('--tooltip-bg-color', statusObject.color);
        statusElement.style.setProperty('--tooltip-text-color', contrastColor);
        statusElement.setAttribute('data-fp-tooltip', statusObject.name);
        statusElement.classList.add('fp-tooltip-host');
        userStatuses[userId] = statusObject;
    } else { // Если нет, удаляем статус
        statusElement.style.backgroundColor = 'transparent';
        statusElement.removeAttribute('data-fp-tooltip');
        statusElement.classList.remove('fp-tooltip-host');
        // Очищаем переменные
        statusElement.style.removeProperty('--tooltip-bg-color');
        statusElement.style.removeProperty('--tooltip-text-color');
        delete userStatuses[userId];
    }

    saveUserStatuses();
}

// Функция для применения сохраненных статусов ко всем контактам в списке
function applyAllUserStatuses() {
    const contactItems = document.querySelectorAll('a.contact-item');
    contactItems.forEach(item => {
        const userId = item.dataset.id;
        const status = userStatuses[userId]; // Получаем объект статуса
        if (userId && status) {
            let statusElement = item.querySelector('.fp-tools-user-status');
            if (!statusElement) {
                statusElement = createElement('span', { class: 'fp-tools-user-status' });
                const userNameElement = item.querySelector('.media-user-name');
                 if (userNameElement) {
                    userNameElement.prepend(statusElement);
                }
            }
            const contrastColor = getContrastColor(status.color);
            statusElement.style.backgroundColor = status.color;
            statusElement.style.setProperty('--tooltip-bg-color', status.color);
            statusElement.style.setProperty('--tooltip-text-color', contrastColor);
            statusElement.setAttribute('data-fp-tooltip', status.name);
            statusElement.classList.add('fp-tooltip-host');
        }
    });
}

// Полностью переработанная функция для создания динамического меню
async function addStatusButtonsToChatMenu() {
    const observer = new MutationObserver(async (mutationsList, obs) => {
        const chatMenu = document.querySelector('.chat-header .dropdown-menu');
        // Проверяем, что меню существует и еще не было обработано
        if (chatMenu && !chatMenu.dataset.fpToolsStatusMenu) {
            chatMenu.dataset.fpToolsStatusMenu = 'true'; // Помечаем, что меню уже обработано

            // 1. Загружаем кастомные метки из хранилища с дефолтными значениями
            let { fpToolsCustomLabels = [
                { id: 'default-1', name: 'Мошенник', color: '#f44336' },
                { id: 'default-2', name: 'Постоянный', color: '#4caf50' }
            ] } = await chrome.storage.local.get('fpToolsCustomLabels');

            const saveLabels = () => chrome.storage.local.set({ fpToolsCustomLabels });

            // 2. Функция для отрисовки меню
            const renderMenu = () => {
                // Очищаем старые элементы, добавленные расширением
                chatMenu.querySelectorAll('.fp-tools-status-item, .divider.fp-tools-divider').forEach(el => el.remove());

                chatMenu.insertAdjacentHTML('beforeend', '<li class="divider fp-tools-divider"></li>');

                fpToolsCustomLabels.forEach(label => {
                    const menuItem = createElement('li', { class: 'fp-tools-status-item' });
                    // Создаем интерактивный элемент списка
                    menuItem.innerHTML = `
                        <a href="#" data-id="${label.id}">
                            <input type="color" value="${label.color}" class="fp-tools-status-color-picker">
                            <span class="fp-tools-status-label" contenteditable="true">${label.name}</span>
                            <span class="fp-tools-status-delete">&times;</span>
                        </a>
                    `;
                    chatMenu.appendChild(menuItem);
                });

                // Кнопки "Добавить" и "Убрать статус"
                chatMenu.insertAdjacentHTML('beforeend', `
                    <li class="fp-tools-status-item"><a href="#" id="fp-tools-add-status-btn">+ Добавить новую метку</a></li>
                    <li class="fp-tools-status-item"><a href="#" id="fp-tools-remove-status-btn">Убрать статус</a></li>
                `);
            };

            // 3. Первичная отрисовка
            renderMenu();
            
            // 4. ИСПРАВЛЕННЫЙ обработчик событий в меню (делегирование)
            chatMenu.addEventListener('click', async (e) => {
                const target = e.target;
                const activeContact = document.querySelector('.contact-item.active');
                if (!activeContact) return;
                const userId = activeContact.dataset.id;

                // --- Действия, которые не закрывают меню ---
                
                // Действие: Удаление метки из списка
                if (target.classList.contains('fp-tools-status-delete')) {
                    e.preventDefault();
                    e.stopPropagation();
                    const labelId = target.closest('a').dataset.id;
                    fpToolsCustomLabels = fpToolsCustomLabels.filter(l => l.id != labelId);
                    await saveLabels();
                    renderMenu(); // Перерисовываем меню
                    return;
                }

                // Действие: Добавление новой метки
                if (target.id === 'fp-tools-add-status-btn') {
                    e.preventDefault();
                    e.stopPropagation();
                    fpToolsCustomLabels.push({ id: Date.now().toString(), name: 'Новая метка', color: '#ff9800' });
                    await saveLabels();
                    renderMenu();
                    return;
                }
                
                // --- Действия, которые закрывают меню (или не мешают этому) ---

                // Действие: Применение метки к пользователю
                const labelLink = target.closest('a[data-id]');
                if (labelLink) {
                    // Если клик был по внутреннему элементу (полю цвета, тексту), то не применяем метку,
                    // а просто даем ему выполнить свое действие (открыть палитру, разрешить редактирование).
                    if (target.classList.contains('fp-tools-status-color-picker') || target.classList.contains('fp-tools-status-label')) {
                        e.stopPropagation(); // Останавливаем, чтобы меню не закрылось
                        return;
                    }
                    
                    e.preventDefault();
                    const labelId = labelLink.dataset.id;
                    const label = fpToolsCustomLabels.find(l => l.id == labelId);
                    if (label) {
                        setUserStatus(userId, { name: label.name, color: label.color });
                    }
                    // Не останавливаем событие, позволяя меню закрыться
                }
                
                // Действие: Удаление статуса с пользователя
                if (target.id === 'fp-tools-remove-status-btn') {
                    e.preventDefault();
                    setUserStatus(userId, null);
                    // Не останавливаем событие, позволяя меню закрыться
                }
            });

            // Обработчик изменения цвета
            chatMenu.addEventListener('input', (e) => {
                if (e.target.classList.contains('fp-tools-status-color-picker')) {
                    const labelId = e.target.closest('a').dataset.id;
                    const label = fpToolsCustomLabels.find(l => l.id == labelId);
                    if (label) {
                        label.color = e.target.value;
                        saveLabels();
                    }
                }
            });

            // Обработчик изменения текста
            chatMenu.addEventListener('focusout', (e) => {
                 if (e.target.classList.contains('fp-tools-status-label')) {
                    const labelId = e.target.closest('a').dataset.id;
                    const label = fpToolsCustomLabels.find(l => l.id == labelId);
                    if (label && label.name !== e.target.textContent) {
                        label.name = e.target.textContent.trim() || 'Без названия';
                        e.target.textContent = label.name; // Возвращаем обрезанное название обратно в span
                        saveLabels();
                    }
                }
            });
        }
    });

    observer.observe(document.body, { childList: true, subtree: true });
}


// Основная функция инициализации фичи
async function initializeUserNotes() {
    const { fpToolsUserStatuses } = await chrome.storage.local.get('fpToolsUserStatuses');
    userStatuses = fpToolsUserStatuses || {};
    
    applyAllUserStatuses();
    addStatusButtonsToChatMenu();
    
    // Также следим за обновлением списка контактов (например, при поиске)
    const contactsListObserver = new MutationObserver(() => {
        applyAllUserStatuses();
    });
    const contactsNode = document.querySelector('.chat-contacts');
    if(contactsNode) {
        contactsListObserver.observe(contactsNode, { childList: true, subtree: true });
    }
}