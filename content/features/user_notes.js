// content/features/user_notes.js

let userStatuses = {};

// Функция для сохранения статусов в chrome.storage.local
async function saveUserStatuses() {
    await chrome.storage.local.set({ fpToolsUserStatuses: userStatuses });
}

// Функция для установки статуса пользователю
function setUserStatus(userId, color) {
    const contactItem = document.querySelector(`.contact-item[data-id="${userId}"]`);
    if (!contactItem) return;

    let statusElement = contactItem.querySelector('.fp-tools-user-status');

    // Если элемента метки нет, создаем его
    if (!statusElement) {
        statusElement = createElement('span', { class: 'fp-tools-user-status' });
        // Вставляем метку перед именем пользователя для лучшего выравнивания
        const userNameElement = contactItem.querySelector('.media-user-name');
        if (userNameElement) {
            userNameElement.prepend(statusElement);
        } else {
            contactItem.append(statusElement);
        }
    }
    
    // Обновляем цвет метки
    statusElement.style.backgroundColor = color || 'transparent';

    // Обновляем данные в объекте
    if (color) {
        userStatuses[userId] = color;
    } else {
        delete userStatuses[userId];
    }

    // Сохраняем изменения
    saveUserStatuses();
}

// Функция для применения сохраненных статусов ко всем контактам в списке
function applyAllUserStatuses() {
    const contactItems = document.querySelectorAll('a.contact-item');
    contactItems.forEach(item => {
        const userId = item.dataset.id;
        if (userId && userStatuses[userId]) {
            let statusElement = item.querySelector('.fp-tools-user-status');
            if (!statusElement) {
                statusElement = createElement('span', { class: 'fp-tools-user-status' });
                const userNameElement = item.querySelector('.media-user-name');
                 if (userNameElement) {
                    userNameElement.prepend(statusElement);
                } else {
                    item.append(statusElement);
                }
            }
            statusElement.style.backgroundColor = userStatuses[userId];
        }
    });
}

// Функция для добавления кнопок в меню чата
function addStatusButtonsToChatMenu() {
    // Ждем, пока появится меню (оно создается динамически)
    const observer = new MutationObserver((mutationsList, obs) => {
        const chatMenu = document.querySelector('.chat-header .dropdown-menu');
        if (chatMenu && !chatMenu.querySelector('.fp-tools-set-status')) {
            
            const statusOptions = [
                { label: 'Мошенник', color: '#f44336' }, // red
                { label: 'Неадекват', color: '#ff9800' }, // orange
                { label: 'Постоянный', color: '#4caf50' }, // green
                { label: 'Убрать статус', color: '' }
            ];

            chatMenu.insertAdjacentHTML('beforeend', '<li class="divider"></li>');

            statusOptions.forEach(option => {
                const menuItem = createElement('li');
                const link = createElement('a', { 
                    href: '#', 
                    class: 'fp-tools-set-status',
                    'data-color': option.color 
                });
                link.textContent = option.label;

                // Добавляем цветной кружок для наглядности
                const colorCircle = createElement('span', {class: 'fp-tools-status-circle'});
                if(option.color) colorCircle.style.backgroundColor = option.color;
                link.prepend(colorCircle);
                
                menuItem.appendChild(link);
                chatMenu.appendChild(menuItem);
            });

            // Назначаем обработчик на все меню сразу (делегирование событий)
            chatMenu.addEventListener('click', (event) => {
                const target = event.target.closest('.fp-tools-set-status');
                if (!target) return;
                
                event.preventDefault();
                const color = target.dataset.color;
                const activeContact = document.querySelector('.contact-item.active');
                if (activeContact) {
                    const userId = activeContact.dataset.id;
                    if (userId) {
                        setUserStatus(userId, color);
                    }
                }
            });
            // Меню найдено и обработано, можно отключать наблюдатель
            // obs.disconnect(); 
            // Не отключаем, так как меню может перерисовываться при смене чата
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