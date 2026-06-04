// content/features/overview_tour.js

function initializeOverviewTour() {
    const startBtn = document.getElementById('start-overview-tour-btn');
    if (startBtn) {
        startBtn.addEventListener('click', startTour);
    }
}

let tourTimeout;
let currentSceneIndex = 0;
let iconsLoaded = false;
let audioElement = null;
let audioFadeInterval = null;

const SCENES = [
    {
        title: "Добро пожаловать в FP Tools",
        icon: "movie_filter",
        description: "Ваш незаменимый помощник для работы на FunPay. Приготовьтесь увидеть его возможности в действии.",
        visualization: `<div class="tour-logo">FP Tools</div>`,
        duration: 5000
    },
    {
        title: "ИИ-Ассистент в чате",
        icon: "smart_toy",
        description: "Превратите любой черновик в вежливое и профессиональное сообщение одним нажатием Enter. ИИ учтет контекст переписки.",
        visualization: `
            <div class="tour-chat-mockup-3d">
                <div class="tour-chat-bubble before">привет, данные скинь</div>
                <div class="tour-chat-bubble after">Здравствуйте! 👋 Ожидаю данные для выполнения заказа.</div>
            </div>`,
        duration: 6000
    },
    {
        title: "AI-Генератор лотов",
        icon: "auto_fix_high",
        description: "Создавайте привлекательные названия и описания, которые идеально копируют ваш уникальный стиль оформления.",
        visualization: `
             <div class="tour-lot-gen-mockup">
                <div class="tour-lot-gen-input">Идея: <span>Крутой аккаунт Genshin</span></div>
                <div class="tour-lot-gen-output">
                    <div>🔥 ТОПОВЫЙ АККАУНТ GENSHIN 🔥</div>
                    <div>✅ Много лег • ✅ Быстрая выдача</div>
                </div>
            </div>`,
        duration: 7000
    },
    {
        title: "Полная кастомизация",
        icon: "palette",
        description: "Настройте внешний вид FunPay с помощью анимированных фонов, цветов и даже расположения верхней панели.",
        visualization: `
            <div class="tour-theme-mockup-3d">
                <div class="tour-theme-card before-theme">
                    <div class="tour-theme-header"></div><div class="tour-theme-body"></div>
                </div>
                <div class="tour-theme-card after-theme">
                    <div class="tour-theme-header"></div><div class="tour-theme-body"></div>
                </div>
                <div class="tour-magic-sparkles"></div>
            </div>`,
        duration: 6000
    },
    {
        title: "Волшебная палочка (Live Styler)",
        icon: "auto_fix_normal",
        description: "Редактируйте любой элемент сайта в реальном времени. Меняйте цвета, размеры или скрывайте ненужное, сохраняя стили навсегда.",
        visualization: `
            <div class="tour-magicstick-mockup">
                <div class="tour-ms-element" id="tour-ms-target">Кнопка</div>
                <div class="tour-ms-panel">
                    <span>Цвет:</span> <input type="color" value="#E879F9" disabled>
                </div>
                <div class="tour-ms-cursor"></div>
            </div>`,
        duration: 7000
    },
    {
        title: "Встроенный генератор изображений",
        icon: "add_photo_alternate",
        description: "Создавайте привлекательные превью для своих лотов прямо в редакторе, в том числе с помощью ИИ.",
        visualization: `
            <div class="tour-image-gen-mockup">
                <div class="tour-image-gen-ui">
                    <div class="tour-image-gen-control">AI: <span>огненный значок клана</span></div>
                </div>
                <div class="tour-image-gen-preview">
                    <div class="tour-preview-content">
                        <span class="material-icons">local_fire_department</span>
                        <span>FIRE SQUAD</span>
                    </div>
                </div>
            </div>`,
        duration: 7000
    },
    {
        title: "Продвинутое клонирование лотов",
        icon: "control_point_duplicate",
        description: "Копируйте лоты не только целиком, но и с изменением категорий, создавая десятки вариаций за раз.",
        visualization: `
            <div class="tour-adv-cloning-mockup">
                <div class="tour-adv-lot-card original"><span>Мой Лот</span></div>
                <div class="tour-category-selector">
                    <div>Сервер 1 <span class="tour-check"></span></div>
                    <div>Сервер 2 <span class="tour-check"></span></div>
                    <div>Сервер 3 <span class="tour-check"></span></div>
                </div>
                <div class="tour-adv-lot-card clone c1"></div>
                <div class="tour-adv-lot-card clone c2"></div>
                <div class="tour-adv-lot-card clone c3"></div>
            </div>`,
        duration: 7000
    },
     {
        title: "Статистика и аналитика",
        icon: "monitoring",
        description: "Анализируйте рынок в любой категории и отслеживайте свои продажи с помощью детальной статистики.",
        visualization: `
            <div class="tour-analytics-mockup">
                <div class="tour-stat-card"><span>Продавцов онлайн</span><p>15</p></div>
                <div class="tour-stat-card"><span>Средний чек</span><p>450 ₽</p></div>
                <div class="tour-stat-card"><span>Всего заработано</span><p>15 230 ₽</p></div>
            </div>`,
        duration: 7000
    },
    {
        title: "Финансовые Копилки",
        icon: "savings",
        description: "Ставьте цели и отслеживайте прогресс их достижения. Копилка синхронизируется с вашим балансом на FunPay.",
        visualization: `
            <div class="tour-piggy-mockup">
                <h4>На новый ПК</h4>
                <div class="tour-piggy-progress">
                    <div class="tour-piggy-fill"></div>
                </div>
                <span>Собрано 45 000 из 100 000 ₽</span>
            </div>`,
        duration: 6000
    },
    {
        title: "Автоматизация рутины",
        icon: "model_training",
        description: "Авто-поднятие лотов по таймеру, авто-приветствия для новых покупателей и уведомления в Discord.",
        visualization: `
            <div class="tour-auto-mockup-3d">
                <div class="tour-auto-item-3d">
                    <span class="material-icons">upgrade</span><h4>Авто-поднятие</h4><p>Следующее через: 3:59:58</p>
                </div>
                <div class="tour-auto-item-3d">
                    <span class="material-icons">forum</span><h4>Discord</h4><p>Новое сообщение!</p>
                </div>
            </div>`,
        duration: 6000
    },
    {
        title: "И многое другое...",
        icon: "add_circle",
        description: "Пометки пользователей, калькуляторы, глобальный импорт, менеджер автовыдачи и постоянные обновления!",
        visualization: `<div class="tour-grid-icons-3d">
            <span class="material-icons">label</span><span class="material-icons">public</span><span class="material-icons">calculate</span>
            <span class="material-icons">magic_button</span><span class="material-icons">inventory</span><span class="material-icons">auto_awesome_motion</span>
        </div>`,
        duration: 6000
    },
    {
        title: "Спасибо за просмотр!",
        icon: "thumb_up",
        description: "Присоединяйтесь к нашему Telegram-каналу, чтобы быть в курсе обновлений и общаться с другими пользователями.",
        visualization: `<a href="https://t.me/FPTools" target="_blank" class="tour-telegram-btn">
            <svg viewBox="0 0 24 24" height="24" width="24"><path fill="currentColor" d="M9.78 18.65l.28-4.23 7.68-6.92c.34-.31-.07-.46-.52-.19L7.74 13.3 3.64 12c-.88-.25-.89-1.37.2-1.64l16.44-5.99c.73-.27 1.36.17 1.15.99l-2.28 10.82c-.15.71-.56 1.01-1.2 1.01l-4.82-.01-1.15 4.35c-.32.74-1.23.46-1.42-.47z"></path></svg>
            Перейти в Telegram
        </a>`,
        duration: 8000
    }
];

async function loadGoogleIcons() {
    if (iconsLoaded) return;
    return new Promise((resolve) => {
        if (document.getElementById('google-material-icons-tour')) {
            iconsLoaded = true;
            resolve();
            return;
        }
        const link = createElement('link', {
            id: 'google-material-icons-tour',
            rel: 'stylesheet',
            href: 'https://fonts.googleapis.com/icon?family=Material+Icons'
        });
        document.head.appendChild(link);
        // Простой тайм-аут для "гарантии" загрузки шрифта
        setTimeout(() => {
            iconsLoaded = true;
            resolve();
        }, 500);
    });
}

async function startTour() {
    await loadGoogleIcons();

    let overlay = document.getElementById('fp-tools-tour-overlay');
    if (!overlay) {
        overlay = createTourOverlay();
        document.body.appendChild(overlay);
    }

    document.querySelector('.fp-tools-popup').classList.remove('active');
    overlay.classList.add('active');
    toggleFullscreen(true);
    playTourMusic();
    document.addEventListener('keydown', escapeHandler);

    currentSceneIndex = -1;
    nextScene();
}

function nextScene() {
    const overlay = document.getElementById('fp-tools-tour-overlay');
    if (!overlay) return;

    const scenes = overlay.querySelectorAll('.tour-scene');
    
    if (currentSceneIndex >= 0 && scenes[currentSceneIndex]) {
        scenes[currentSceneIndex].classList.remove('active');
    }

    currentSceneIndex++;
    if (currentSceneIndex >= SCENES.length) {
        endTour();
        return;
    }

    if (scenes[currentSceneIndex]) {
        scenes[currentSceneIndex].classList.add('active');
    }
    
    const progressFill = overlay.querySelector('.tour-progress-fill');
    progressFill.style.width = `${((currentSceneIndex + 1) / SCENES.length) * 100}%`;
    
    clearTimeout(tourTimeout);
    tourTimeout = setTimeout(nextScene, SCENES[currentSceneIndex].duration);
}

function endTour() {
    const overlay = document.getElementById('fp-tools-tour-overlay');
    if (overlay) {
        overlay.classList.remove('active');
    }
    clearTimeout(tourTimeout);
    toggleFullscreen(false);
    stopTourMusic();
    document.removeEventListener('keydown', escapeHandler);
}

function escapeHandler(e) {
    if (e.key === 'Escape') {
        endTour();
    }
}

function createTourOverlay() {
    const overlay = createElement('div', { id: 'fp-tools-tour-overlay' });
    let scenesHTML = SCENES.map((scene, index) => `
        <div class="tour-scene" data-index="${index}">
            <div class="tour-content-wrapper">
                <div class="tour-header">
                    <span class="material-icons tour-icon">${scene.icon}</span>
                    <h2 class="tour-title">${scene.title}</h2>
                </div>
                <p class="tour-description">${scene.description}</p>
                <div class="tour-visualization">${scene.visualization}</div>
            </div>
        </div>
    `).join('');

    overlay.innerHTML = `
        <div class="tour-background"></div>
        <div class="tour-perspective-container">
            ${scenesHTML}
        </div>
        <button class="tour-close-btn">&times;</button>
        <div class="tour-progress-bar">
            <div class="tour-progress-fill"></div>
        </div>
    `;
    overlay.querySelector('.tour-close-btn').addEventListener('click', endTour);
    return overlay;
}

function toggleFullscreen(enter = true) {
    if (enter && !document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(err => console.log(err));
    } else if (!enter && document.fullscreenElement) {
        document.exitFullscreen();
    }
}

function playTourMusic() {
    if (!audioElement) {
        audioElement = new Audio(chrome.runtime.getURL('sounds/epic.mp3'));
        audioElement.loop = true;
    }
    audioElement.volume = 0;
    audioElement.play();

    clearInterval(audioFadeInterval);
    audioFadeInterval = setInterval(() => {
        if (audioElement.volume < 0.5) {
            audioElement.volume = Math.min(0.5, audioElement.volume + 0.01);
        } else {
            clearInterval(audioFadeInterval);
        }
    }, 50);
}

function stopTourMusic() {
    if (!audioElement) return;

    clearInterval(audioFadeInterval);
    audioFadeInterval = setInterval(() => {
        if (audioElement.volume > 0.01) {
            audioElement.volume = Math.max(0, audioElement.volume - 0.01);
        } else {
            audioElement.pause();
            audioElement.currentTime = 0;
            clearInterval(audioFadeInterval);
        }
    }, 30);
}