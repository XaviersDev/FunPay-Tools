function createMainPopup() {
    const toolsPopup = document.createElement('div');
    toolsPopup.className = 'fp-tools-popup';
    toolsPopup.innerHTML = `
        <div class="fp-tools-header">
            <h2>FP Tools</h2>
            <div id="announcementsNavTab" class="fp-tools-header-tab" data-page="announcements">
                <span class="nav-icon">📢</span>
                <span>Объявления</span>
                <span class="notification-badge"></span>
            </div>
            <button class="close-btn" aria-label="Закрыть"></button>
        </div>
        <div class="fp-tools-body">
            <nav class="fp-tools-nav">
                <ul>
                    <li data-page="general" class="active"><a><span class="nav-icon">⚙️</span><span>Общие</span></a></li>
                    <li data-page="accounts"><a><span class="nav-icon">👥</span><span>Аккаунты</span></a></li>
                    <li data-page="templates"><a><span class="nav-icon">📄</span><span>Шаблоны</span></a></li>
                    <li data-page="lot_io"><a><span class="nav-icon">📦</span><span>Лоты</span></a></li>
                    <li data-page="piggy_banks"><a><span class="nav-icon">🐷</span><span>Копилки</span></a></li>
                    <li data-page="theme"><a><span class="nav-icon">🎨</span><span>Кастомизация</span></a></li>
                    <li data-page="autobump"><a><span class="nav-icon">🚀</span><span>Авто-поднятие</span></a></li>
                    <li data-page="notes"><a><span class="nav-icon">📝</span><span>Заметки</span></a></li>
                    <li data-page="calculator"><a><span class="nav-icon">🧮</span><span>Калькулятор</span></a></li>
                    <li data-page="currency_calc"><a><span class="nav-icon">💸</span><span>Калькулятор валют</span></a></li>
                    <li data-page="effects"><a><span class="nav-icon">✨</span><span>Эффекты</span></a></li>
                    <li data-page="overview"><a><span class="nav-icon">🎬</span><span>Обзор</span></a></li>
                    <li data-page="support"><a><span class="nav-icon">❤️</span><span>Поддержка</span></a></li>
                </ul>
            </nav>
            <main class="fp-tools-content">
                <div class="fp-tools-page-content" data-page="announcements">
                    <div class="announcements-header">
                        <h3>Объявления от разработчика</h3>
                        <button id="refresh-announcements-btn" class="btn btn-default" title="Принудительно обновить">
                            <span class="material-icons">refresh</span>
                        </button>
                    </div>
                    <div id="announcements-content-area">
                        <div class="fp-import-loader"></div>
                    </div>
                </div>

                <div class="fp-tools-page-content active" data-page="general">
                    <h3>Общие настройки</h3>
                    <div class="checkbox-label-inline">
                        <input type="checkbox" id="showSalesStatsCheckbox">
                        <label for="showSalesStatsCheckbox" style="margin-bottom:0;"><span>Статистика продаж в "Продажи"</span></label>
                    </div>
                    <div class="checkbox-label-inline">
                        <input type="checkbox" id="hideBalanceCheckbox">
                        <label for="hideBalanceCheckbox" style="margin-bottom:0;"><span>Скрыть баланс</span></label>
                    </div>
                    <div class="checkbox-label-inline">
                        <input type="checkbox" id="viewSellersPromoCheckbox">
                        <label for="viewSellersPromoCheckbox" style="margin-bottom:0;"><span>Отображение иконок промо-лотов</span></label>
                    </div>
                    
                    <h3>Звук уведомления</h3>
                    <div class="fp-tools-radio-group" id="notificationSoundGroup">
                        <label class="fp-tools-radio-option"><input type="radio" name="notificationSound" value="default" checked><span>Стандартный</span></label>
                        <label class="fp-tools-radio-option"><input type="radio" name="notificationSound" value="vk"><span>VK</span></label>
                        <label class="fp-tools-radio-option"><input type="radio" name="notificationSound" value="tg"><span>Telegram</span></label>
                        <label class="fp-tools-radio-option"><input type="radio" name="notificationSound" value="iphone"><span>iPhone</span></label>
                        <label class="fp-tools-radio-option"><input type="radio" name="notificationSound" value="discord"><span>Discord</span></label>
                        <label class="fp-tools-radio-option"><input type="radio" name="notificationSound" value="whatsapp"><span>WhatsApp</span></label>
                    </div>

                    <h3 style="margin-top: 40px;">Уведомления в Discord</h3>
                     <div class="checkbox-label-inline">
                        <input type="checkbox" id="discordLogEnabled">
                        <label for="discordLogEnabled" style="margin-bottom:0;"><span>Включить уведомления о новых сообщениях</span></label>
                    </div>
                    <div id="discordSettingsContainer">
                        <label for="discordWebhookUrl" style="margin-top: 10px;">Webhook URL:</label>
                        <input type="text" id="discordWebhookUrl" class="template-input" placeholder="Вставьте ссылку на вебхук вашего Discord канала">
                        <div class="checkbox-label-inline" style="margin-top:10px;"><input type="checkbox" id="discordPingEveryone"><label for="discordPingEveryone" style="margin-bottom:0;"><span>Пинговать @everyone</span></label></div>
                        <div class="checkbox-label-inline"><input type="checkbox" id="discordPingHere"><label for="discordPingHere" style="margin-bottom:0;"><span>Пинговать @here</span></label></div>
                    </div>

                    <div class="support-promo">
                        <span class="nav-icon">❤️</span>
                        <span>Понравился FP Tools? <a href="#" data-nav-to="support">Поддержите труд разработчика</a> во вкладке "Поддержка"!</span>
                    </div>
                </div>
                <div class="fp-tools-page-content" data-page="accounts">
                    <h3>Управление аккаунтами</h3>
                    <p class="template-info">Добавьте текущий аккаунт в список, чтобы быстро переключаться между профилями без ввода пароля.</p>
                    <button id="addCurrentAccountBtn" class="btn">+ Добавить текущий аккаунт</button>
                    <h4 style="margin-top: 30px;">Сохраненные аккаунты:</h4>
                    <div id="fpToolsAccountsList"></div>
                </div>
                <div class="fp-tools-page-content" data-page="templates">
                    <h3>Настройки шаблонов</h3>
                    <div class="checkbox-label-inline"><input type="checkbox" id="sendTemplatesImmediately"><label for="sendTemplatesImmediately" style="margin-bottom:0;"><span>Отправлять шаблоны сразу по клику</span></label></div>
                    <label>Расположение кнопок:</label>
                    <div class="fp-tools-radio-group">
                        <label class="fp-tools-radio-option"><input type="radio" name="templatePos" value="bottom" checked><span>Под полем ввода</span></label>
                        <label class="fp-tools-radio-option"><input type="radio" name="templatePos" value="sidebar"><span>В правой панели</span></label>
                    </div>
                    <h3>Редактор шаблонов</h3>
                     <p class="template-info">Кликните на название шаблона, чтобы его изменить. Все изменения сохраняются автоматически.<br><strong>Доступные переменные:</strong> {welcome}, {date}, {buyername}, {bal}, {activesells}, {lotname}, {ai:ваш_запрос}.</p>
                    <div id="template-settings-container" class="template-settings-list"></div>
                    <button id="addCustomTemplateBtn" class="btn" style="margin-top: 10px;">+ Добавить свой шаблон</button>
                </div>
                 <!-- НОВАЯ ВКЛАДКА "ЛОТЫ" -->
                <div class="fp-tools-page-content" data-page="lot_io">
                    <h3>Управление лотами</h3>
                    <div class="template-info" style="padding: 15px; background: rgba(0,0,0,0.2); border-radius: 8px;">
                        <p style="margin-top:0;">Здесь собраны инструменты для массовой работы с вашими лотами.</p>
                        <ul style="padding-left: 20px; margin-bottom: 0;">
                            <li><strong>Экспорт/Импорт:</strong> Сохраняйте все свои лоты в файл и восстанавливайте их на любом аккаунте.</li>
                            <li><strong>Массовое управление:</strong> На странице вашего профиля (<code>funpay.com/users/ID</code>) или в категории с вашими лотами появится кнопка "Выбрать" для массового удаления, дублирования или изменения цен.</li>
                            <li><strong>Продвинутое клонирование:</strong> На странице редактирования лота кнопка "Копировать" позволяет создавать копии в разных категориях (например, на разных серверах).</li>
                            <li><strong>Авто-поднятие:</strong> Настройте автоматическое поднятие лотов по таймеру. <a href="#" onclick="document.querySelector('.fp-tools-nav li[data-page=autobump] a').click(); return false;">Перейти к настройке</a>.</li>
                        </ul>
                    </div>
                    
                    <h4 style="margin-top: 30px;">Экспорт и импорт лотов</h4>
                    <p class="template-info">Создайте полную резервную копию всех ваших лотов в файл JSON. Этот файл можно использовать для переноса лотов на другой аккаунт или для восстановления.</p>
                    <div class="lot-io-buttons">
                        <button id="lot-io-export-btn" class="btn"><span class="material-icons">file_upload</span>Экспорт</button>
                        <button id="lot-io-import-btn" class="btn btn-default"><span class="material-icons">file_download</span>Импорт</button>
                        <input type="file" id="lot-io-import-file" accept=".json" style="display: none;">
                    </div>
                </div>
                <div class="fp-tools-page-content" data-page="piggy_banks">
                    <h3>Управление копилками</h3>
                    <p class="template-info">Создавайте копилки для отслеживания прогресса к вашим финансовым целям. Основная копилка будет отображаться при наведении на баланс в шапке сайта.</p>
                    <button id="create-piggy-bank-btn" class="btn">+ Создать новую копилку</button>
                    <div id="piggy-banks-list-container" class="piggy-banks-list-container"></div>
                </div>
                <div class="fp-tools-page-content" data-page="theme">
                    <h3>Кастомизация темы</h3>
                     <div class="checkbox-label-inline" style="margin-bottom: 15px;"><input type="checkbox" id="enableCustomThemeCheckbox"><label for="enableCustomThemeCheckbox" style="margin-bottom:0;"><span>Включить кастомную тему</span></label></div>
                    <div class="template-container">
                        <label>Фоновое изображение:</label>
                        <div id="bg-image-preview" style="width:100%; height:60px; background-color:rgba(0,0,0,0.2); border:1px solid rgba(255,255,255,0.1); border-radius:8px; margin-bottom:10px; background-size:cover; background-position:center; display:flex; align-items:center; justify-content:center; color: #888; font-size:12px;">Нет изображения</div>
                        <button id="uploadBgImageBtn" class="btn" title="Можно загружать анимированные GIF">Загрузить</button>
                        <button id="removeBgImageBtn" class="btn btn-default" style="margin-left: 10px;">Удалить</button>
                        <input type="file" id="bgImageInput" accept="image/*,image/gif" style="display: none;">
                        <div class="bg-image-info"><span id="bgImageInfoToggle" class="info-toggle">Откуда брать анимации? ⓘ</span><div id="bgImageInfoContent" class="info-content"><p>Вы можете загрузать анимированные GIF. Примеры сайтов, где можно найти подходящие фоны:</p><ul><li><a href="https://www.behance.net/gallery/35096329/Ambient-animations" target="_blank" rel="noopener noreferrer">Behance - Ambient Animations</a></li><li><a href="https://tenor.com/ru/search/looping-gifs-anime-aesthetic-gifs" target="_blank" rel="noopener noreferrer">Tenor - Looping Aesthetic Gifs</a></li><li><a href="https://www.pinterest.com/pin/678565868836311444/" target="_blank" rel="noopener noreferrer">Pinterest - Pixel Art</a></li><li><a href="https://tenor.com/ru/search/anime-rain-wallpaper-gifs" target="_blank" rel="noopener noreferrer">Tenor - Anime Rain Wallpaper</a></li></ul></div></div>
                    </div>
                    <div class="template-container color-input-grid">
                        <div><label for="themeColor1">Основной цвет:</label><input type="color" id="themeColor1" class="theme-color-input"></div>
                        <div><label for="themeColor2">Акцентный цвет:</label><input type="color" id="themeColor2" class="theme-color-input"></div>
                        <div><label for="themeContainerBgColor">Фон блоков:</label><input type="color" id="themeContainerBgColor" class="theme-color-input"></div>
                        <div><label for="themeTextColor">Цвет текста:</label><input type="color" id="themeTextColor" class="theme-color-input"></div>
                        <div><label for="themeLinkColor">Цвет ссылок:</label><input type="color" id="themeLinkColor" class="theme-color-input"></div>
                    </div>
                    <div class="template-container"><div class="range-label"><label for="themeFontSelect">Шрифт:</label></div><select id="themeFontSelect"></select></div>
                    <div class="template-container"><div class="range-label"><label for="themeBgBlur">Размытие фона:</label><span id="themeBgBlurValue">0px</span></div><input type="range" id="themeBgBlur" min="0" max="20" step="1"></div>
                    <div class="template-container"><div class="range-label"><label for="themeBgBrightness">Яркость фона:</label><span id="themeBgBrightnessValue">100%</span></div><input type="range" id="themeBgBrightness" min="20" max="150" step="1"></div>
                    <div class="template-container"><div class="range-label"><label for="themeBorderRadius">Закругление углов:</label><span id="themeBorderRadiusValue">8px</span></div><input type="range" id="themeBorderRadius" min="0" max="30" step="1"></div>
                    <div class="setting-group"><div class="checkbox-label-inline"><input type="checkbox" id="enableGlassmorphism"><label for="enableGlassmorphism">Эффект "матового стекла"</label></div><div id="glassmorphismControls" style="display:none;"><div class="template-container"><div class="range-label"><label for="themeContainerBgOpacity">Прозрачность блоков:</label><span id="themeContainerBgOpacityValue">100%</span></div><input type="range" id="themeContainerBgOpacity" min="0" max="100" step="1"></div><div class="template-container"><div class="range-label"><label for="glassmorphismBlur">Размытие стекла:</label><span id="glassmorphismBlurValue">10px</span></div><input type="range" id="glassmorphismBlur" min="0" max="30" step="1"></div></div></div>
                    <div class="setting-group"><div class="checkbox-label-inline"><input type="checkbox" id="enableCustomScrollbar"><label for="enableCustomScrollbar">Кастомный скроллбар</label></div><div id="customScrollbarControls" style="display:none;"><div class="template-container color-input-grid"><div><label for="scrollbarThumbColor">Цвет ползунка:</label><input type="color" id="scrollbarThumbColor" class="theme-color-input"></div><div><label for="scrollbarTrackColor">Цвет фона:</label><input type="color" id="scrollbarTrackColor" class="theme-color-input"></div></div><div class="template-container"><div class="range-label"><label for="scrollbarWidth">Ширина:</label><span id="scrollbarWidthValue">8px</span></div><input type="range" id="scrollbarWidth" min="2" max="20" step="1"></div></div></div>
                    <div class="setting-group"><h4 style="margin-top: 0;">Кругляшки</h4><div class="template-container"><label>Предпросмотр:</label><div style="display: flex; justify-content: center; align-items: center; height: 150px; background: rgba(0,0,0,0.2); border-radius: 10px; overflow: hidden; margin-bottom: 15px;"><div id="circlePreviewContainer" style="transition: opacity 0.3s ease;"><div id="circlePreview" style="position: relative; width: 140px; height: 140px; transform-origin: center center; transition: transform 0.3s ease, filter 0.3s ease, opacity 0.3s ease;"><img src="https://funpay.com/img/circles/funpay_poke.jpg" alt="" style="width: 100%; height: 100%; border-radius: 50%;"><svg viewBox="0 0 200 200" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%;"><defs><path id="text_path_preview" d="M 10, 100 a 90,90 0 1,0 180,0 a 90,90 0 1,0 -180,0"></path></defs><g fill="white" font-size="14px"><text text-anchor="end"><textPath xlink:href="#text_path_preview" startOffset="100%">Example</textPath></text></g></svg></div></div></div></div><div class="checkbox-label-inline"><input type="checkbox" id="enableCircleCustomization"><label for="enableCircleCustomization" style="margin-bottom:0;"><span>Включить кастомизацию</span></label></div><div id="circleCustomizationControls" style="display: none;"><div class="checkbox-label-inline"><input type="checkbox" id="showCircles"><label for="showCircles" style="margin-bottom:0;"><span>Отображать</span></label></div><div class="template-container"><div class="range-label"><label for="circleSize">Размер:</label><span id="circleSizeValue">100%</span></div><input type="range" id="circleSize" min="50" max="150" step="1"></div><div class="template-container"><div class="range-label"><label for="circleOpacity">Прозрачность:</label><span id="circleOpacityValue">100%</span></div><input type="range" id="circleOpacity" min="0" max="100" step="1"></div><div class="template-container"><div class="range-label"><label for="circleBlur">Размытие:</label><span id="circleBlurValue">0px</span></div><input type="range" id="circleBlur" min="0" max="50" step="1"></div></div></div>
                    <div class="setting-group"><h4 style="margin-top: 0;">Разделители</h4><div class="checkbox-label-inline"><input type="checkbox" id="enableImprovedSeparators"><label for="enableImprovedSeparators" style="margin-bottom:0;"><span>Включить улучшенные</span></label></div></div>
                    <div class="setting-group"><h4 style="margin-top: 0;">Главная страница</h4><div class="checkbox-label-inline"><input type="checkbox" id="enableRedesignedHomepage"><label for="enableRedesignedHomepage" style="margin-bottom:0;"><span>Включить улучшенную</span></label></div><small style="font-size: 12px; opacity: 0.7; display: block; margin-top: -10px;">Заменяет главную страницу на более современный вид с поиском. Требуется перезагрузка.</small></div>
                    <div class="setting-group"><h4 style="margin-top: 0;">Расположение</h4><div class="template-container"><div class="range-label"><label for="headerPositionSelect">Верхняя панель:</label></div><select id="headerPositionSelect"><option value="top">Вверх (по умолчанию)</option><option value="bottom">Вниз</option></select></div></div>
                    <div class="theme-actions-grid"><button id="enableMagicStickBtn" class="btn" style="grid-column: 1 / -1;"><span class="material-icons">auto_fix_normal</span><span>Включить режим редактора</span></button><button id="generatePaletteBtn" class="btn btn-default" style="display: flex; align-items: center; justify-content: center; gap: 8px;"><span class="material-icons" style="font-size: 18px;">auto_fix_high</span>цвета фона</button><button id="randomizeThemeBtn" class="btn btn-default" style="display: flex; align-items: center; justify-content: center; gap: 8px;"><span class="material-icons" style="font-size: 18px;">casino</span>рандом</button><button id="shareThemeBtn" class="btn btn-default" style="display: flex; align-items: center; justify-content: center; gap: 8px;"><span class="material-icons" style="font-size: 18px;">share</span>Поделиться темой</button><button id="exportThemeBtn" class="btn btn-default" title="Сохранить текущие настройки темы в файл (.fptheme)">Экспорт</button><button id="importThemeBtn" class="btn btn-default" title="Загрузить настройки темы из файла (.fptheme)">Импорт</button><input type="file" id="importThemeInput" accept=".fptheme" style="display: none;"><button id="resetThemeBtn" class="btn btn-default">СБРОСИТЬ ТЕМУ</button></div>
                </div>
                <div class="fp-tools-page-content" data-page="autobump">
                    <h3>Авто-поднятие лотов</h3>
                    <div class="checkbox-label-inline"><input type="checkbox" id="autoBumpEnabled"><label for="autoBumpEnabled" style="margin-bottom:0;"><span>Включить авто-поднятие</span></label></div>
                    <div class="template-container"><label for="autoBumpCooldown">Интервал поднятия (минуты):</label><input type="number" id="autoBumpCooldown" class="template-input" min="5" placeholder="Например: 245"><small style="font-size: 12px; opacity: 0.7;">Минимум 5 минут. FunPay позволяет поднимать раз в 4 часа (240 минут).</small></div>
                    <div class="checkbox-label-inline"><input type="checkbox" id="selectiveBumpEnabled"><label for="selectiveBumpEnabled" style="margin-bottom:0;"><span>Поднимать только выбранные категории</span></label></div>
                    <button id="configureSelectiveBumpBtn" class="btn btn-default" style="width: auto; padding: 8px 16px; font-size: 14px;">выбрать...</button>
                    <label style="margin-top: 20px;">Консоль логов:</label>
                    <div id="autoBumpConsole" class="fp-tools-console"></div>
                </div>
                <div class="fp-tools-page-content" data-page="notes">
                    <h3>Заметки</h3>
                    <p class="template-info">Это ваш личный блокнот. Текст сохраняется автоматически при вводе и доступен между сессиями браузера.</p>
                    <textarea id="fpToolsNotesArea" class="template-input" style="height: 80%; resize: none; min-height: 400px;" placeholder="Запишите сюда что-нибудь важное: список дел, временные данные для покупателя, идеи для новых лотов..."></textarea>
                </div>
                <div class="fp-tools-page-content" data-page="calculator">
                    <h3>Калькулятор</h3>
                    <div class="calculator-container"><div class="calculator-display"><span id="calcDisplay">0</span></div><div class="calculator-buttons"><button class="calc-btn calc-btn-light" data-action="clear">AC</button><button class="calc-btn calc-btn-light" data-action="toggle-sign">+/-</button><button class="calc-btn calc-btn-light" data-action="percentage">%</button><button class="calc-btn calc-btn-operator" data-action="divide">÷</button><button class="calc-btn" data-key="7">7</button><button class="calc-btn" data-key="8">8</button><button class="calc-btn" data-key="9">9</button><button class="calc-btn calc-btn-operator" data-action="multiply">×</button><button class="calc-btn" data-key="4">4</button><button class="calc-btn" data-key="5">5</button><button class="calc-btn" data-key="6">6</button><button class="calc-btn calc-btn-operator" data-action="subtract">−</button><button class="calc-btn" data-key="1">1</button><button class="calc-btn" data-key="2">2</button><button class="calc-btn" data-key="3">3</button><button class="calc-btn calc-btn-operator" data-action="add">+</button><button class="calc-btn calc-btn-zero" data-key="0">0</button><button class="calc-btn" data-action="decimal">.</button><button class="calc-btn calc-btn-operator" data-action="calculate">=</button></div></div>
                </div>
                <div class="fp-tools-page-content" data-page="currency_calc">
                    <h3>Калькулятор валют</h3>
                    <p class="template-info">Курсы обновляются раз в день. Используется открытый API.</p>
                    <div class="currency-converter-container"><div class="currency-input-group"><input type="number" id="currencyAmountFrom" class="template-input currency-input" value="100"><select id="currencySelectFrom" class="template-input currency-select"></select></div><div class="currency-swap-container"><button id="currencySwapBtn" class="currency-swap-btn">⇅</button><div id="currencyRateDisplay" class="currency-rate-display"></div></div><div class="currency-input-group"><input type="text" id="currencyAmountTo" class="template-input currency-input" readonly><select id="currencySelectTo" class="template-input currency-select"></select></div></div><div id="currency-error-display" class="currency-error"></div>
                </div>
                <div class="fp-tools-page-content" data-page="effects">
                    <h3>Эффекты частиц</h3>
                    <div class="checkbox-label-inline"><input type="checkbox" id="cursorFxEnabled"><label for="cursorFxEnabled" style="margin-bottom:0;"><span>Включить эффекты частиц</span></label></div>
                    <div class="template-container"><label for="cursorFxType">Тип эффекта:</label><select id="cursorFxType"><option value="sparkle">Искры</option><option value="trail">След</option><option value="snow">Снег</option><option value="blood">Кровь</option></select></div>
                    <div class="template-container color-input-grid"><div><label for="cursorFxColor1">Цвет 1:</label><input type="color" id="cursorFxColor1" class="theme-color-input"></div><div><label for="cursorFxColor2">Цвет 2 (градиент):</label><input type="color" id="cursorFxColor2" class="theme-color-input"></div></div>
                    <div class="checkbox-label-inline"><input type="checkbox" id="cursorFxRgb"><label for="cursorFxRgb" style="margin-bottom:0;"><span>Радужный (RGB)</span></label></div>
                    <div class="template-container"><div class="range-label"><label for="cursorFxCount">Интенсивность:</label><span id="cursorFxCountValue">50%</span></div><input type="range" id="cursorFxCount" min="0" max="100" step="1"></div>
                    <div style="margin-top: 20px;"><button id="resetCursorFxBtn" class="btn btn-default">Сбросить эффекты</button></div>
                    <div style="border-top: 1px solid rgba(255,255,255,0.1); margin: 25px 0;"></div>
                    <h3>Пользовательский курсор</h3>
                    <div class="checkbox-label-inline"><input type="checkbox" id="customCursorEnabled"><label for="customCursorEnabled" style="margin-bottom:0;"><span>Включить свой курсор</span></label></div>
                    <div id="customCursorControls" style="display: none;"><div class="template-container"><label>Изображение курсора:</label><div id="cursor-image-preview" style="width:64px; height:64px; background-color:rgba(0,0,0,0.2); border:1px solid rgba(255,255,255,0.1); border-radius:8px; margin-bottom:10px; background-size:contain; background-position:center; background-repeat: no-repeat; display:flex; align-items:center; justify-content:center; color: #888; font-size:12px;">Нет</div><button id="uploadCursorImageBtn" class="btn">Загрузить</button><button id="removeCursorImageBtn" class="btn btn-default" style="margin-left: 10px;">Удалить</button><input type="file" id="cursorImageInput" accept="image/*" style="display: none;"></div><div class="checkbox-label-inline"><input type="checkbox" id="hideSystemCursor" checked><label for="hideSystemCursor" style="margin-bottom:0;"><span>Скрыть системный курсор</span></label></div><div class="template-container"><div class="range-label"><label for="customCursorSize">Размер:</label><span id="customCursorSizeValue">32px</span></div><input type="range" id="customCursorSize" min="16" max="128" step="1" value="32"></div><div class="template-container"><div class="range-label"><label for="customCursorOpacity">Прозрачность:</label><span id="customCursorOpacityValue">100%</span></div><input type="range" id="customCursorOpacity" min="0" max="100" step="1" value="100"></div></div>
                </div>
                <div class="fp-tools-page-content" data-page="overview">
                    <div class="overview-container"><h3 style="border:none">Видео-обзор функций</h3><p class="template-info">Посмотрите короткий кинематографический ролик, демонстрирующий все возможности FP Tools в действии. Откройте для себя инструменты, о которых вы могли не знать!</p><div class="overview-promo-art"></div><button id="start-overview-tour-btn" class="btn">▶️ Начать обзор</button></div>
                    <div class="feature-list-container"><h3>Справочник по функциям</h3><div class="feature-item"><div class="feature-title"><span class="material-icons">smart_toy</span>ИИ-Ассистент в чате</div><div class="feature-location"><strong>Где найти:</strong> В любом чате, кнопка "AI" рядом с полем ввода.</div><div class="feature-desc">Улучшает ваш текст, делая его вежливым и профессиональным. Активируйте режим и нажмите Enter для обработки. Также предупреждает о грубости.</div></div><div class="feature-item"><div class="feature-title"><span class="material-icons">auto_fix_high</span>AI-Генератор лотов</div><div class="feature-location"><strong>Где найти:</strong> На странице создания/редактирования лота.</div><div class="feature-desc">Создает название и описание для лота на основе ваших идей, анализируя и копируя стиль ваших существующих предложений.</div></div><div class="feature-item"><div class="feature-title"><span class="material-icons">add_photo_alternate</span>AI-Генератор изображений</div><div class="feature-location"><strong>Где найти:</strong> На странице создания/редактирования лота, в разделе "Изображения".</div><div class="feature-desc">Создавайте уникальные и стильные превью для ваших предложений с помощью встроенного генератора, в том числе по текстовому запросу.</div></div><div class="feature-item"><div class="feature-title"><span class="material-icons">palette</span>Полная кастомизация</div><div class="feature-location"><strong>Где найти:</strong> Вкладка "Кастомизация".</div><div class="feature-desc">Измените внешний вид FunPay: установите анимированный фон, настройте цвета, шрифты, прозрачность блоков и даже расположение верхней панели.</div></div><div class="feature-item"><div class="feature-title"><span class="material-icons">auto_fix_normal</span>"Кастомизатор (режим редактора)</div><div class="feature-location"><strong>Где найти:</strong> Вкладка "Кастомизация".</div><div class="feature-desc">Редактируйте любой элемент сайта в реальном времени. Меняйте цвета, размеры или скрывайте ненужное, сохраняя стили навсегда.</div></div><div class="feature-item"><div class="feature-title"><span class="material-icons">description</span>Шаблоны и AI-переменные</div><div class="feature-location"><strong>Где найти:</strong> Под полем ввода в чате. Настраиваются во вкладке "Шаблоны".</div><div class="feature-desc">Быстрая вставка готовых сообщений. Поддерживают переменные {buyername}, {date} и даже генерацию текста через {ai:ваш запрос}.</div></div><div class="feature-item"><div class="feature-title"><span class="material-icons">checklist</span>Управление лотами и ценами</div><div class="feature-location"><strong>Где найти:</strong> На странице вашего профиля (funpay.com/users/...).</div><div class="feature-desc">Кнопка "Выбрать" позволяет выделить несколько лотов для массового удаления, дублирования, отключения или редактирования цен.</div></div><div class="feature-item"><div class="feature-title"><span class="material-icons">control_point_duplicate</span>Клонирование лотов</div><div class="feature-location"><strong>Где найти:</strong> На странице редактирования любого вашего лота.</div><div class="feature-desc">Кнопка "Копировать" позволяет создать точную копию лота или массово размножить его по разным категориям (например, по разным серверам).</div></div><div class="feature-item"><div class="feature-title"><span class="material-icons">public</span>Глобальный импорт лотов</div><div class="feature-location"><strong>Где найти:</strong> На странице редактирования лота, кнопка "Импорт".</div><div class="feature-desc">Импортируйте название и описание любого лота с FunPay, чтобы анализировать конкурентов или использовать как основу.</div></div><div class="feature-item"><div class="feature-title"><span class="material-icons">sort_by_alpha</span>Сортировка по отзывам</div><div class="feature-location"><strong>Где найти:</strong> На любой странице со списком лотов.</div><div class="feature-desc">Кликните на заголовок "Продавец" в таблице, чтобы отсортировать все предложения по количеству отзывов у продавцов.</div></div><div class="feature-item"><div class="feature-title"><span class="material-icons">label</span>Пометки для пользователей</div><div class="feature-location"><strong>Где найти:</strong> В выпадающем меню в заголовке чата с человеком.</div><div class="feature-desc">Устанавливайте настраиваемые цветные метки для пользователей, которые будут видны в вашем списке контактов.</div></div><div class="feature-item"><div class="feature-title"><span class="material-icons">rocket_launch</span>Авто-поднятие лотов</div><div class="feature-location"><strong>Где найти:</strong> Вкладка "Авто-поднятие".</div><div class="feature-desc">Настройте автоматическое поднятие лотов по таймеру. Можно выбрать для поднятия только определенные категории.</div></div><div class="feature-item"><div class="feature-title"><span class="material-icons">monitoring</span>Статистика</div><div class="feature-location"><strong>Где найти:</strong> Страница "Продажи" - статистика продаж, кнопка "Аналитика рынка" на странице игры.</div><div class="feature-desc">Получайте детальную статистику по своим продажам и анализируйте рыночную ситуацию в любой категории.</div></div><div class="feature-item"><div class="feature-title"><span class="material-icons">savings</span>Финансовые копилки</div><div class="feature-location"><strong>Где найти:</strong> Вкладка "Копилки" и иконка в шапке сайта.</div><div class="feature-desc">Устанавливайте финансовые цели и отслеживайте их достижение. Копилка синхронизируется с балансом FunPay.</div></div></div>
                </div>
                <div class="fp-tools-page-content" data-page="support">
                    <h3>Поддержка проекта</h3><div class="support-container"><p>Если вам нравится FP Tools и вы хотите отблагодарить разработчика, вы можете поддержать проект финансово.</p><p>Это абсолютно добровольно, но каждая копейка помогает уделять больше времени развитию и добавлению новых функций.</p><a href="https://donorbox.org/fptools" target="_blank" class="btn support-btn"><span class="material-icons" style="font-size: 20px; margin-right: 8px;">volunteer_activism</span> Поддержать на Donorbox</a></div><div style="border-top: 1px solid rgba(255,255,255,0.1); margin: 30px 0;"></div><h3>Оставьте отзыв! ⭐</h3><div class="support-container"><p>Это <strong>самый важный</strong> вклад, который вы можете сделать. Ваш положительный отзыв — это топливо для новых обновлений и лучшая мотивация для разработчика.</p><p>Хорошие оценки помогают другим пользователям найти FP Tools. Пожалуйста, уделите всего минуту, чтобы поделиться своим мнением. Это действительно имеет огромное значение!</p><a href="https://chromewebstore.google.com/detail/funpay-tools/pibmnjjfpojnakckilflcboodkndkibb/reviews" target="_blank" class="btn review-btn"><span class="material-icons" style="font-size: 20px; margin-right: 8px;">rate_review</span>Оставить отзыв в Chrome Store</a></div>
                </div>
            </main>
        </div>
        <div class="fp-tools-footer">
            <button id="saveSettings" class="btn">Сохранить</button>
        </div>
        
        <div class="fp-tools-modal-overlay" id="autobump-category-modal-overlay" style="display: none;"><div class="fp-tools-modal-content"><div class="fp-tools-modal-header"><h3>Выберите категории для поднятия</h3><button class="fp-tools-modal-close">&times;</button></div><div class="fp-tools-modal-body"><div class="autobump-modal-controls"><input type="text" id="autobump-category-search" placeholder="Поиск по категориям..."><button id="autobump-select-all" class="btn btn-default" style="padding: 6px 12px; font-size: 13px;">Выбрать всё</button></div><div id="autobump-category-list" class="autobump-category-list"></div></div><div class="fp-tools-modal-footer"><button id="autobump-category-save" class="btn">Сохранить</button></div></div></div>

        <div class="fp-tools-modal-overlay" id="lot-io-export-modal" style="display: none;">
            <div class="fp-tools-modal-content">
                <div class="fp-tools-modal-header">
                    <h3>Экспорт лотов</h3>
                    <button class="fp-tools-modal-close">&times;</button>
                </div>
                <div class="fp-tools-modal-body">
                    <p class="template-info">Выберите категории, лоты из которых вы хотите экспортировать в файл.</p>
                    <div class="autobump-modal-controls">
                        <button id="lot-io-select-all" class="btn btn-default" style="padding: 6px 12px; font-size: 13px; flex-grow:1;">Выбрать/снять все</button>
                    </div>
                    <div class="lot-io-category-list"></div>
                    <!-- НОВОЕ ПРЕДУПРЕЖДЕНИЕ -->
                    <div class="lot-io-warning">
                        <span class="material-icons">warning</span>
                        <span><b>Внимание!</b> Не закрывайте и не перезагружайте эту вкладку до завершения процесса экспорта.</span>
                    </div>
                </div>
                <div class="fp-tools-modal-footer">
                    <button id="lot-io-export-confirm" class="btn">Экспортировать</button>
                </div>
            </div>
        </div>
        <div class="fp-tools-modal-overlay" id="lot-io-import-progress-modal" style="display: none;">
            <div class="fp-tools-modal-content">
                <div class="fp-tools-modal-header">
                    <h3>Прогресс импорта</h3>
                </div>
                <div class="fp-tools-modal-body">
                    <div id="lot-io-progress-summary">Подготовка...</div>
                    <div class="lot-io-progress-list"></div>
                </div>
                <div class="fp-tools-modal-footer">
                    <button id="lot-io-continue-btn" class="btn" style="display:none;">Продолжить</button>
                    <button id="lot-io-cancel-btn" class="btn btn-default">Отменить</button>
                </div>
            </div>
        </div>
    `;
    return toolsPopup;
}

function setupPopupNavigation() {
    const toolsPopup = document.querySelector('.fp-tools-popup');
    if (!toolsPopup) return;
    const navItems = toolsPopup.querySelectorAll('.fp-tools-nav li, .fp-tools-header-tab');
    const contentPages = toolsPopup.querySelectorAll('.fp-tools-page-content');

    navItems.forEach(li => {
        li.addEventListener('click', (e) => {
            e.preventDefault();
            const pageId = li.dataset.page;

            navItems.forEach(item => item.classList.remove('active'));
            li.classList.add('active');
            
            contentPages.forEach(page => {
                page.classList.toggle('active', page.dataset.page === pageId);
            });

            if (pageId === 'currency_calc') initializeCurrencyCalculator();
            if (pageId === 'notes') { if (typeof initializeNotes === 'function') initializeNotes(); }
            if (pageId === 'templates') { if (typeof setupTemplateSettingsHandlers === 'function') setupTemplateSettingsHandlers(); }
            if (pageId === 'piggy_banks') { if (typeof renderPiggyBankSettings === 'function') renderPiggyBankSettings(); }
            if (pageId === 'lot_io') { if (typeof initializeLotIO === 'function') initializeLotIO(); }

            chrome.storage.local.set({ fpToolsLastPage: pageId });
        });
    });

    const promoLink = document.querySelector('a[data-nav-to="support"]');
    if (promoLink) {
        promoLink.addEventListener('click', (e) => {
            e.preventDefault();
            const supportTabLi = document.querySelector('.fp-tools-nav li[data-page="support"]');
            if (supportTabLi) supportTabLi.click();
        });
    }
}


async function loadLastActivePage() {
    const { fpToolsLastPage } = await chrome.storage.local.get('fpToolsLastPage');
    if (fpToolsLastPage) {
        const itemToActivate = document.querySelector(`.fp-tools-nav li[data-page="${fpToolsLastPage}"]`);
        if (itemToActivate) {
            itemToActivate.click();
        }
    }
}

function makePopupInteractive(popupEl) {
    const header = popupEl.querySelector('.fp-tools-header h2');
    if (!header) return;

    let isDragging = false;
    let offset = { x: 0, y: 0 };
    let hasBeenDragged = false;

    header.addEventListener('mousedown', (e) => {
        if (e.target !== header) return;
        isDragging = true;
        if (!hasBeenDragged) {
            const rect = popupEl.getBoundingClientRect();
            popupEl.style.left = `${rect.left}px`;
            popupEl.style.top = `${rect.top}px`;
            popupEl.classList.add('no-transform');
            hasBeenDragged = true;
        }
        offset.x = e.clientX - popupEl.offsetLeft;
        offset.y = e.clientY - popupEl.offsetTop;
        popupEl.style.transition = 'none';
        document.body.style.userSelect = 'none';
    });

    window.addEventListener('mousemove', (e) => {
        if (isDragging) {
            let left = e.clientX - offset.x;
            let top = e.clientY - offset.y;
            const winWidth = window.innerWidth;
            const winHeight = window.innerHeight;
            const popupWidth = popupEl.offsetWidth;
            const popupHeight = popupEl.offsetHeight;
            left = Math.max(0, Math.min(left, winWidth - popupWidth));
            top = Math.max(0, Math.min(top, winHeight - popupHeight));
            popupEl.style.left = `${left}px`;
            popupEl.style.top = `${top}px`;
        }
    });

    window.addEventListener('mouseup', async () => {
        if (isDragging) {
            isDragging = false;
            document.body.style.userSelect = '';
            await chrome.storage.local.set({ 
                fpToolsPopupPosition: { top: popupEl.style.top, left: popupEl.style.left },
                fpToolsPopupDragged: true 
            });
        }
    });

    const resizeObserver = new MutationObserver(async () => {
         const newWidth = popupEl.style.width;
         const newHeight = popupEl.style.height;
         await chrome.storage.local.set({ fpToolsPopupSize: { width: newWidth, height: newHeight } });
    });
    resizeObserver.observe(popupEl, { attributes: true, attributeFilter: ['style'] });
}
