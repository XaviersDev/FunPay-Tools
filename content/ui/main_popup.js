// content/ui/main_popup.js

function getModalOverlaysHTML() {
    return `
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
                    <div id="lot-io-postpone-controls">
                        <p>Отложите прогресс на завтра, если сейчас не работает.</p>
                        <button id="lot-io-postpone-btn" class="btn btn-default">Отложить</button>
                    </div>
                </div>
            </div>
        </div>
    `;
}

function createMainPopup() {
    if (!document.getElementById('fp-popup-extra-styles')) {
        const s = document.createElement('style');
        s.id = 'fp-popup-extra-styles';
        s.textContent = `
            .fp-tools-site-link{color:inherit;text-decoration:none;display:inline-block;transition:all .25s ease;position:relative;}
            .fp-tools-site-link::after{content:'';position:absolute;left:0;bottom:-2px;width:0;height:2px;background:linear-gradient(90deg,#6B66FF,#a78bfa);transition:width .3s ease;border-radius:2px;}
            .fp-tools-site-link:hover{background:linear-gradient(90deg,#6B66FF,#a78bfa,#6B66FF);background-size:200%;-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;animation:fp-shimmer 1.2s linear infinite;}
            .fp-tools-site-link:hover::after{width:100%;}
            @keyframes fp-shimmer{0%{background-position:0%}100%{background-position:200%}}
            .fp-wallpaper-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:8px;}
            .fp-wallpaper-card:hover{box-shadow:0 0 0 2px #6B66FF,0 4px 16px rgba(107,102,255,.3);}
            .fp-wallpaper-card img{pointer-events:none;}
            .fp-site-footer-link{display:inline-flex;align-items:center;gap:6px;padding:6px 16px;border:1px solid rgba(107,102,255,.35);border-radius:20px;color:#7672ff;text-decoration:none;font-size:12px;font-weight:600;letter-spacing:.5px;transition:all .2s;}
            .fp-site-footer-link:hover{background:rgba(107,102,255,.12);border-color:#6B66FF;color:#a09af8;transform:translateY(-1px);box-shadow:0 4px 12px rgba(107,102,255,.2);}
            .fp-nav-divider{padding:10px 16px 3px!important;font-size:10px!important;font-weight:700!important;color:#3a3d52!important;text-transform:uppercase;letter-spacing:1px;cursor:default!important;pointer-events:none;margin-top:10px!important;}
            .fp-nav-divider:first-child{margin-top:0!important;}
            .fp-nav-divider:hover{background:none!important;}
            .fp-dark-preset-btn{width:100%;margin-bottom:12px;background:rgba(0,0,0,.3)!important;border-color:rgba(255,255,255,.1)!important;display:flex;align-items:center;justify-content:center;gap:8px;}
        `;
        document.head.appendChild(s);
    }

    const toolsPopup = document.createElement('div');
    toolsPopup.className = 'fp-tools-popup';
    toolsPopup.innerHTML = `
        <div class="fp-tools-header">
            <h2><a href="https://funpay.tools" target="_blank" class="fp-tools-site-link">FP Tools</a></h2>
            <button class="close-btn" aria-label="Закрыть"></button>
        </div>
        <div class="fp-tools-body">
            <nav class="fp-tools-nav">
                <ul>
                    <li class="fp-nav-divider">Основное</li>
                    <li data-page="general" class="active"><a><span class="nav-icon">⚙️</span><span>Общие</span></a></li>
                    <li data-page="accounts"><a><span class="nav-icon">👥</span><span>Аккаунты</span></a></li>
                    <li class="fp-nav-divider">Чат и продажи</li>
                    <li data-page="templates"><a><span class="nav-icon">📄</span><span>Шаблоны</span></a></li>
                    <li data-page="auto_review"><a><span class="nav-icon">🤖</span><span>Авто-ответы</span></a></li>
                    <li data-page="auto_delivery"><a><span class="nav-icon">⚡</span><span>Авто-выдача</span></a></li>
                    <li class="fp-nav-divider">Торговля</li>
                    <li data-page="lot_io"><a><span class="nav-icon">📦</span><span>Лоты</span></a></li>
                    <li data-page="autobump"><a><span class="nav-icon">🚀</span><span>Авто-поднятие</span></a></li>
                    <li data-page="ai_audit"><a><span class="nav-icon">🔍</span><span>ИИ-аудит</span></a></li>
                    <li data-page="blacklist"><a><span class="nav-icon">🚫</span><span>Чёрный список</span></a></li>
                    <li class="fp-nav-divider">Финансы</li>
                    <li data-page="piggy_banks"><a><span class="nav-icon">🐷</span><span>Копилки</span></a></li>
                    <li data-page="calculator"><a><span class="nav-icon">🧮</span><span>Калькулятор</span></a></li>
                    <li data-page="currency_calc"><a><span class="nav-icon">💸</span><span>Валюты</span></a></li>
                    <li class="fp-nav-divider">Интерфейс</li>
                    <li data-page="theme"><a><span class="nav-icon">🎨</span><span>Кастомизация</span></a></li>
                    <li data-page="effects"><a><span class="nav-icon">✨</span><span>Эффекты</span></a></li>
                    <li class="fp-nav-divider">Прочее</li>
                    <li data-page="notes"><a><span class="nav-icon">📝</span><span>Заметки</span></a></li>
                    <li data-page="overview"><a><span class="nav-icon">🎬</span><span>Обзор</span></a></li>
                    <li data-page="settings_io"><a><span class="nav-icon">🗄️</span><span>Настройки</span></a></li>
                    <li data-page="tickets"><a><span class="nav-icon">🎫</span><span>Тикеты</span></a></li>
                    <li data-page="support"><a><span class="nav-icon">❤️</span><span>Поддержка</span></a></li>
                </ul>
            </nav>
            <main class="fp-tools-content">
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
                    <h3 style="margin-top: 30px;">Заказы и статистика</h3>
                    <div class="checkbox-label-inline">
                        <input type="checkbox" id="fpToolsShowPaymentType" checked>
                        <label for="fpToolsShowPaymentType" style="margin-bottom:0;"><span>Показывать тип оплаты в списке заказов (Сделка / Обычный)</span></label>
                    </div>
                    <div class="checkbox-label-inline">
                        <input type="checkbox" id="fpToolsBuyerHistory" checked>
                        <label for="fpToolsBuyerHistory" style="margin-bottom:0;"><span>Показывать историю покупок в чате</span></label>
                    </div>
                    <div class="checkbox-label-inline">
                        <input type="checkbox" id="fpToolsShowUnconfirmed" checked>
                        <label for="fpToolsShowUnconfirmed" style="margin-bottom:0;"><span>Показывать сумму неподтверждённых заказов</span></label>
                    </div>

                    <h3 style="margin-top: 30px;">Идентификатор FPT</h3>
                    <div class="checkbox-label-inline">
                        <input type="checkbox" id="fptIdentifierEnabled" checked>
                        <label for="fptIdentifierEnabled" style="margin-bottom:0;"><span>Показывать метку «FunPay Tools» рядом с ником собеседника</span></label>
                    </div>
                    <p class="template-info">При включении к исходящим сообщениям добавляется невидимый символ. Если собеседник тоже использует FPT — рядом с его ником появится пометка. Символ не виден обычным пользователям. Не добавляется в ссылки и скопированный текст.</p>

                    <div class="support-promo" style="background: rgba(255, 152, 0, 0.1); border-color: rgba(255, 152, 0, 0.3); margin-top: 15px;">
                        <span class="nav-icon" style="color: #ff9800;">⚠️</span>
                        <span>Для корректной работы расширения рекомендуется использовать FunPay на <strong>русском языке</strong>, так как большинство функций не будут работать на других языках.</span>
                    </div>
                </div>
                <div class="fp-tools-page-content" data-page="accounts">
                    <h3>Управление аккаунтами</h3>
                    <p class="template-info">Добавьте текущий аккаунт в список, чтобы быстро переключаться между профилями без ввода пароля.</p>
                    <div class="support-promo" style="background: rgba(107,102,255,0.08); border-color: rgba(107,102,255,0.25); margin-bottom: 20px;">
                        <span class="nav-icon" style="color: #6B66FF;">ℹ️</span>
                        <span>Нажмите «+ Добавить текущий аккаунт» для каждого профиля. Переключение происходит мгновенно без ввода паролей.</span>
                    </div>
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
                     <p class="template-info">Кликните на название или текст шаблона, чтобы его изменить. Все изменения сохраняются автоматически.</p>
                     
                     <div class="template-variables-guide">
                        <h5>Справка по переменным</h5>
                        <ul class="variables-list">
                            <li><span class="variable-code">{buyername}</span> — Имя покупателя в текущем чате.</li>
                            <li><span class="variable-code">{lotname}</span> — Название товара, который обсуждается в чате.</li>
                            <li><span class="variable-code">{welcome}</span> — "Доброе утро!", "Добрый день!" или "Добрый вечер!" в зависимости от времени.</li>
                            <li><span class="variable-code">{date}</span> — Текущая дата и время (например, 25.12.2025 14:30).</li>
                            <li><span class="variable-code">{bal}</span> — Ваш текущий баланс на FunPay.</li>
                            <li><span class="variable-code">{activesells}</span> — Количество ваших активных продаж.</li>
                            <li><span class="variable-code">{ai: ваш запрос}</span> — Вставляет текст, сгенерированный ИИ на основе вашего запроса. 
                                <br><em>Пример: <code>{ai: вежливо поблагодари за покупку}</code></em>
                            </li>
                            <li><span class="variable-code">{orderlink}</span> — Ссылка на последний заказ с этим покупателем. <em>Пример: Подтвердите заказ: {orderlink}</em></li>
                            <li><span class="variable-code">{date}</span> — Текущая дата и время.</li>
                            <li><span class="variable-code">{welcome}</span> — Приветствие по времени суток.</li>
                        </ul>
                     </div>
                     
                     <div class="template-info image-upload-warning">
                        <span class="nav-icon">🖼️</span>
                        <span><b>Изображения в шаблонах:</b> Используйте кнопку 🖼️, чтобы добавить картинку с компьютера. Она будет вставлена как код. При отправке шаблона картинка будет отправлена в чат, как будто вы её скопировали и вставили.</span>
                     </div>

                    <div id="template-settings-container" class="template-settings-list"></div>
                    <button id="addCustomTemplateBtn" class="btn" style="margin-top: 10px;">+ Добавить свой шаблон</button>
                </div>

                <div class="fp-tools-page-content" data-page="auto_review">
                    <h3>Ответы на отзывы</h3>
                    <div class="checkbox-label-inline">
                        <input type="checkbox" id="autoReviewEnabled">
                        <label for="autoReviewEnabled" style="margin-bottom:0;"><span>Включить автоматический ответ на отзывы</span></label>
                    </div>
                    <p class="template-info">Расширение будет автоматически отвечать на новые отзывы, используя заданные шаблоны. Ответ не будет отправлен, если вы уже ответили вручную.</p>
                    <div class="template-variables-guide" style="margin-bottom: 15px;">
                        <h5>Переменные в ответах на отзывы</h5>
                        <ul class="variables-list">
                            <li><span class="variable-code">{buyername}</span> — Имя покупателя.</li>
                            <li><span class="variable-code">{lotname}</span> — Название купленного товара.</li>
                            <li><span class="variable-code">{orderid}</span> — Номер заказа.</li>
                            <li><span class="variable-code">{orderlink}</span> — Ссылка на заказ.</li>
                            <li><span class="variable-code">{date}</span> — Текущая дата.</li>
                            <li><span class="variable-code">{welcome}</span> — Приветствие по времени суток.</li>
                        </ul>
                    </div>
                    <div class="review-templates-grid">
                        <div class="template-container">
                            <label for="fpt-review-5">⭐⭐⭐⭐⭐</label>
                            <textarea id="fpt-review-5" class="template-input" placeholder="Шаблон для 5 звёзд"></textarea>
                        </div>
                        <div class="template-container">
                            <label for="fpt-review-4">⭐⭐⭐⭐</label>
                            <textarea id="fpt-review-4" class="template-input" placeholder="Шаблон для 4 звёзд"></textarea>
                        </div>
                        <div class="template-container">
                            <label for="fpt-review-3">⭐⭐⭐</label>
                            <textarea id="fpt-review-3" class="template-input" placeholder="Шаблон для 3 звёзд"></textarea>
                        </div>
                        <div class="template-container">
                            <label for="fpt-review-2">⭐⭐</label>
                            <textarea id="fpt-review-2" class="template-input" placeholder="Шаблон для 2 звёзд"></textarea>
                        </div>
                        <div class="template-container">
                            <label for="fpt-review-1">⭐</label>
                            <textarea id="fpt-review-1" class="template-input" placeholder="Шаблон для 1 звезды"></textarea>
                        </div>
                    </div>
                    
                    <h3>Бонус за отзыв</h3>
                    <div class="checkbox-label-inline">
                        <input type="checkbox" id="bonusForReviewEnabled">
                        <label for="bonusForReviewEnabled" style="margin-bottom:0;"><span>Отправлять бонус в чат за отзыв 5 ★</span></label>
                    </div>
                    <p class="template-info">Если покупатель оставит отзыв 5 звёзд, ему в чат будет автоматически отправлено сообщение с бонусом. Ничего не будет отправлено за оценки ниже 5 звёзд.</p>
                    <div class="fp-tools-radio-group" id="bonusModeSelector">
                        <label class="fp-tools-radio-option"><input type="radio" name="bonusMode" value="single" checked><span>Один бонус</span></label>
                        <label class="fp-tools-radio-option"><input type="radio" name="bonusMode" value="random"><span>Случайный из списка</span></label>
                    </div>
                    <div id="singleBonusContainer" class="template-container">
                        <textarea id="singleBonusText" class="template-input" placeholder="Текст вашего бонуса..."></textarea>
                    </div>
                    <div id="randomBonusContainer" class="template-container" style="display: none;">
                        <div id="bonus-list-container" class="bonus-list"></div>
                        <div class="bonus-add-form">
                            <textarea id="newBonusText" placeholder="Текст нового бонуса для списка..."></textarea>
                            <button id="addBonusBtn" class="btn btn-default">Добавить бонус в список</button>
                        </div>
                    </div>

                    <h3>Автоответчик в чате</h3>
                     <div class="template-container">
                        <div class="checkbox-label-inline">
                            <input type="checkbox" id="greetingEnabled">
                            <label for="greetingEnabled" style="margin-bottom:0;"><span>Авто-приветствие для новых покупателей</span></label>
                        </div>
                        <textarea id="greetingText" class="template-input" placeholder="Текст приветствия... Переменные: {buyername}, $chat_name"></textarea>

                        <div style="margin-top:10px;">
                            <div class="checkbox-label-inline">
                                <input type="checkbox" id="onlyNewChats">
                                <label for="onlyNewChats" style="margin-bottom:0;"><span>Только совсем новые чаты</span></label>
                            </div>
                            <div class="checkbox-label-inline">
                                <input type="checkbox" id="ignoreSystemMessages">
                                <label for="ignoreSystemMessages" style="margin-bottom:0;"><span>Не приветствовать при системных сообщениях (заказы, отзывы)</span></label>
                            </div>
                            <label style="font-size:12px;color:#5a5f7a;margin-top:6px;display:block;">Кулдаун повторного приветствия (дней, 0 = без кулдауна):</label>
                            <input type="number" id="greetingCooldownDays" min="0" max="365" value="0" class="template-input" style="width:80px;" placeholder="0">
                        </div>
                    </div>
                    <h3>Ответ на новый заказ</h3>
                    <div class="checkbox-label-inline">
                        <input type="checkbox" id="newOrderReplyEnabled">
                        <label for="newOrderReplyEnabled" style="margin-bottom:0;"><span>Отправлять сообщение при новом заказе</span></label>
                    </div>
                    <p class="template-info">Отправляется когда покупатель оплачивает заказ. Переменные: <code>{buyername}</code>, <code>{orderid}</code>, <code>{orderlink}</code>.</p>
                    <textarea id="newOrderReplyText" class="template-input" placeholder="Спасибо за заказ, {buyername}! Ваш заказ: {orderlink}"></textarea>

                    <h3 style="margin-top:20px;">Ответ при подтверждении заказа</h3>
                    <div class="checkbox-label-inline">
                        <input type="checkbox" id="orderConfirmReplyEnabled">
                        <label for="orderConfirmReplyEnabled" style="margin-bottom:0;"><span>Отправлять сообщение при подтверждении заказа покупателем</span></label>
                    </div>
                    <p class="template-info">Переменные: <code>{buyername}</code>, <code>{orderid}</code>, <code>{lotname}</code>, <code>{orderlink}</code>.</p>
                    <textarea id="orderConfirmReplyText" class="template-input" placeholder="{buyername}, спасибо за подтверждение заказа {orderid}! Если не сложно, оставь, пожалуйста, отзыв!"></textarea>

                    <h3 style="margin-top:20px;">Дополнительно</h3>
                    <div class="template-container">
                        <div class="checkbox-label-inline">
                            <input type="checkbox" id="keywordsEnabled">
                            <label for="keywordsEnabled" style="margin-bottom:0;"><span>Авто-ответы по ключевым словам</span></label>
                        </div>
                        <div id="keywords-list-container" class="keywords-list"></div>
                        <div class="keyword-add-form">
                            <input type="text" id="newKeyword" placeholder="Ключевое слово или фраза">
                            <div class="fp-tools-radio-group" style="margin: 6px 0;">
                                <label class="fp-tools-radio-option"><input type="radio" name="newKeywordMatchMode" value="exact" checked><span>Точное совпадение</span></label>
                                <label class="fp-tools-radio-option"><input type="radio" name="newKeywordMatchMode" value="contains"><span>Содержит</span></label>
                            </div>
                            <textarea id="newKeywordResponse" placeholder="Текст ответа (можно использовать {buyername})"></textarea>
                            <button id="addKeywordBtn" class="btn btn-default">Добавить правило</button>
                        </div>
                    </div>
                </div>

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
                    <h4 style="margin-top: 30px;">Массовое редактирование</h4>
                    <p class="template-info">Измените название, описание или сообщение покупателю сразу у нескольких лотов.</p>
                    <button id="fp-bulk-edit-btn" class="btn btn-default" style="width:auto;padding:8px 16px;">✏️ Массово изменить лоты</button>

                    <a href="#" id="convert-cardinal-lots-btn" style="display: block; text-align: center; margin-top: 25px; padding-top: 15px; border-top: 1px solid rgba(255,255,255,0.1); font-size: 13px; color: #a0a0a0; text-decoration: underline;">Конвертер Cardinal-лотов в наш формат</a>

                    <h4 style="margin-top: 30px;">Незавершённые импорты</h4>
                    <div id="lot-io-pending-imports-list">
                        <p class="template-info">Здесь будут отображаться отложенные процессы импорта.</p>
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
                    <div class="checkbox-label-inline" style="margin-bottom:15px;"><input type="checkbox" id="enableCustomThemeCheckbox"><label for="enableCustomThemeCheckbox" style="margin-bottom:0;"><span>Включить кастомную тему</span></label></div>
                    <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
                        <span style="font-size:12px;color:#5a5f7a;flex:1;">Готовые обои:</span>
                        <button id="fp-apply-dark-preset" class="btn btn-default" style="padding:3px 10px;font-size:12px;">🌑 Чёрная</button>
                    </div>
                    <div id="fp-wallpaper-carousel" style="position:relative;width:100%;aspect-ratio:16/9;border-radius:8px;overflow:hidden;background:#0e0f16;contain:layout style paint;">
                        <div id="fp-wp-img-slot" style="position:absolute;inset:0;"></div>
                        <button id="fp-wp-prev" style="position:absolute;left:6px;top:50%;transform:translateY(-50%);background:rgba(0,0,0,.55);border:none;color:#fff;font-size:18px;width:28px;height:28px;border-radius:50%;cursor:pointer;z-index:2;display:flex;align-items:center;justify-content:center;line-height:1;">&#8249;</button>
                        <button id="fp-wp-next" style="position:absolute;right:6px;top:50%;transform:translateY(-50%);background:rgba(0,0,0,.55);border:none;color:#fff;font-size:18px;width:28px;height:28px;border-radius:50%;cursor:pointer;z-index:2;display:flex;align-items:center;justify-content:center;line-height:1;">&#8250;</button>
                        <div id="fp-wp-label" style="position:absolute;bottom:0;left:0;right:0;padding:4px 8px;background:rgba(0,0,0,.6);font-size:11px;color:#ccc;display:flex;align-items:center;justify-content:space-between;">
                            <span id="fp-wp-name"></span>
                            <span id="fp-wp-counter" style="color:#5a5f7a;font-size:10px;"></span>
                        </div>
                        <div id="fp-wp-loader" style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;">
                            <span id="fp-wp-emoji" style="font-size:24px;"></span>
                            <div style="width:60px;height:3px;background:#1e2030;border-radius:2px;overflow:hidden;"><div id="fp-wp-bar" style="height:100%;width:0%;background:#6B66FF;transition:width .15s linear;border-radius:2px;"></div></div>
                            <span id="fp-wp-pct" style="font-size:10px;color:#4a4f68;">0%</span>
                        </div>
                        <button id="fp-wp-apply-cur" style="position:absolute;top:6px;right:6px;background:rgba(107,102,255,.85);border:none;color:#fff;font-size:11px;font-weight:600;padding:4px 10px;border-radius:12px;cursor:pointer;z-index:2;display:none;">Применить</button>
                    </div>
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
                    
                    <div class="checkbox-label-inline" style="margin-top: 15px;"><input type="checkbox" id="bumpOnlyAutoDelivery"><label for="bumpOnlyAutoDelivery" style="margin-bottom:0;"><span>Поднимать только категории с автовыдачей</span></label></div>
                    <small style="font-size: 12px; opacity: 0.7; display: block; margin-top: -10px; margin-left: 30px;">Будут подняты только те категории, в которых есть хотя бы один лот с иконкой автовыдачи (⚡️).</small>

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
                <div class="fp-tools-page-content" data-page="ai_audit">
                    <h3>ИИ-аудит лотов</h3>

                    <!-- START STATE -->
                    <div id="fp-audit-start-wrap">
                        <p class="template-info">ИИ прочитает все ваши лоты и последние 30 отзывов, сгенерирует ~40 вопросов и на основе ваших ответов выдаст конкретные рекомендации.</p>
                        <div class="support-promo" style="background:rgba(107,102,255,0.07);border-color:rgba(107,102,255,0.2);margin-bottom:16px;">
                            <span>💡</span>
                            <span>Вопросы будут именно о ваших лотах — ИИ внимательно их изучит перед генерацией.</span>
                        </div>
                        <button id="fp-audit-start-btn" class="btn" style="width:100%;padding:12px;">🔍 Начать аудит</button>
                        <p id="fp-audit-cooldown-msg" style="display:none;text-align:center;font-size:12px;color:#5a5f7a;margin-top:8px;"></p>
                    </div>

                    <!-- LOADING STATE -->
                    <div id="fp-audit-loading" style="display:none;font-size:13px;color:#5a5f7a;margin-top:10px;white-space:pre-line;text-align:center;line-height:1.7;padding:20px 0;"></div>

                    <!-- SURVEY STATE -->
                    <div id="fp-audit-survey" style="display:none;">
                        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
                            <span id="fp-audit-q-num" style="font-size:12px;color:#5a5f7a;"></span>
                            <span id="fp-audit-skip" style="font-size:11px;color:#3a3d52;cursor:pointer;" onclick="document.getElementById('fp-audit-next-btn')?.click()">Пропустить →</span>
                        </div>
                        <div style="height:4px;background:#1e2030;border-radius:2px;margin-bottom:16px;overflow:hidden;">
                            <div id="fp-audit-progress-bar" style="height:100%;background:#6B66FF;width:0;transition:width .3s;border-radius:2px;"></div>
                        </div>
                        <div id="fp-audit-q-container" style="min-height:120px;"></div>
                        <div style="display:flex;gap:8px;margin-top:16px;">
                            <button id="fp-audit-prev-btn" class="btn btn-default" style="flex:1;">← Назад</button>
                            <button id="fp-audit-next-btn" class="btn" style="flex:2;">Далее →</button>
                        </div>
                    </div>

                    <!-- PROCESSING STATE -->
                    <div id="fp-audit-processing" style="display:none;text-align:center;padding:30px 0;color:#5a5f7a;font-size:13px;">
                        ⏳ ИИ анализирует ваши ответы и готовит рекомендации...
                    </div>

                    <!-- RESULTS STATE -->
                    <div id="fp-audit-results" style="display:none;overflow-y:auto;max-height:460px;padding-right:4px;"></div>
                </div>

                <div class="fp-tools-page-content" data-page="settings_io">
                    <h3>Импорт и экспорт настроек</h3>
                    <p class="template-info">Сохраните все настройки FunPay Tools в файл и восстановите на другом устройстве или аккаунте.</p>
                    <div style="display:flex;gap:12px;margin-bottom:20px;">
                        <button id="fp-settings-export-btn" class="btn" style="flex:1;">⬆️ Экспортировать настройки</button>
                        <button id="fp-settings-import-btn" class="btn btn-default" style="flex:1;">⬇️ Импортировать настройки</button>
                        <input type="file" id="fp-settings-import-input" accept=".fpconfig,.json" style="display:none;">
                    </div>
                    <p class="template-info">Файл сохраняется с расширением <code>.fpconfig</code>. Импорт перезагрузит страницу.</p>

                    <h3 style="margin-top:24px;">Сброс данных</h3>
                    <p class="template-info">Удалить только определённые данные, не затрагивая остальные настройки.</p>
                    <div style="display:flex;flex-direction:column;gap:8px;">
                        <button id="fp-reset-autoresponder-btn" class="btn btn-default" style="width:auto;padding:8px 14px;">Сбросить данные автоответчика (обработанные ID)</button>
                        <button id="fp-reset-pinned-btn" class="btn btn-default" style="width:auto;padding:8px 14px;">Очистить закреплённые лоты</button>
                        <button id="fp-reset-greeted-btn" class="btn btn-default" style="width:auto;padding:8px 14px;">Сбросить список поприветствованных чатов</button>
                        <button id="fp-reset-april-btn" class="btn btn-default" style="width:auto;padding:8px 14px;">Сбросить счётчик даты</button>
                    </div>
                    <div style="margin-top:24px;text-align:center;border-top:1px solid rgba(255,255,255,0.06);padding-top:16px;">
                        <a href="https://funpay.tools" target="_blank" class="fp-site-footer-link">🔗 funpay.tools</a>
                    </div>
                </div>

                <div class="fp-tools-page-content" data-page="blacklist">
                    <h3>Чёрный список покупателей</h3>
                    <p class="template-info">Добавьте ненадёжных покупателей. Вы сможете заблокировать на них автоматизаию и уведомления.</p>
                    <div style="display:flex;flex-direction:column;gap:6px;margin-bottom:12px;">
                        <input type="text" id="fp-bl-name-input" placeholder="Имя пользователя FunPay" style="background:#0e0f16;border:1px solid #22253a;border-radius:6px;padding:8px;color:#d8dae8;font-size:13px;outline:none;">
                        <input type="text" id="fp-bl-note-input" placeholder="Причина (необязательно)" style="background:#0e0f16;border:1px solid #22253a;border-radius:6px;padding:8px;color:#d8dae8;font-size:13px;outline:none;">
                        <button id="fp-bl-add-btn" class="btn btn-default">+ Добавить в ЧС</button>
                    </div>
                    <div id="fp-bl-list"></div>
                </div>

                <div class="fp-tools-page-content" data-page="auto_delivery">
                    <h3>Авто-выдача товаров</h3>
                    <p class="template-info">При новом заказе расширение автоматически отправит покупателю товар. Укажите что именно отправлять для каждого лота, или используйте поле «Секреты» лота как источник.</p>
                    <div class="support-promo" style="background:rgba(107,102,255,0.07);border-color:rgba(107,102,255,0.2);margin-bottom:16px;">
                        <span>💡</span>
                        <span>Используйте переменные: <code>{buyername}</code>, <code>{orderid}</code>, <code>{orderlink}</code>, <code>$username</code>, <code>$order_link</code>, <code>$order_id</code>, <code>$sleep=3</code> (пауза в секундах).</span>
                    </div>

                    <div class="checkbox-label-inline" style="margin-bottom:12px;">
                        <input type="checkbox" id="fpAutoRestoreEnabled">
                        <label for="fpAutoRestoreEnabled" style="margin-bottom:0;"><span>Авто-восстановление лотов после деактивации</span></label>
                    </div>
                    <div class="checkbox-label-inline" style="margin-bottom:16px;">
                        <input type="checkbox" id="fpAutoDisableEnabled">
                        <label for="fpAutoDisableEnabled" style="margin-bottom:0;"><span>Авто-деактивация лотов при пустом складе</span></label>
                    </div>

                    <h4>Настройка авто-выдачи по лотам</h4>
                    <p class="template-info">Выберите лот для настройки авто-выдачи. Если лот не настроен — отправляется содержимое поля «Секреты» автоматически.</p>
                    <button id="fp-load-delivery-lots-btn" class="btn btn-default" style="margin-bottom:12px;">Загрузить список лотов</button>
                    <div id="fp-delivery-lots-list"></div>
                </div>

                <div class="fp-tools-page-content" data-page="tickets" style="position:relative;">
                    <style>
                        #fp-tickets-list::-webkit-scrollbar{width:4px}
                        #fp-tickets-list::-webkit-scrollbar-track{background:transparent}
                        #fp-tickets-list::-webkit-scrollbar-thumb{background:#2a2d44;border-radius:4px}
                        #fp-ticket-confirm-text::-webkit-scrollbar{width:4px}
                        #fp-ticket-confirm-text::-webkit-scrollbar-thumb{background:#2a2d44;border-radius:4px}
                        #fp-ticket-age-hours::-webkit-inner-spin-button,#fp-ticket-age-hours::-webkit-outer-spin-button,
                        #fp-ticket-max-orders::-webkit-inner-spin-button,#fp-ticket-max-orders::-webkit-outer-spin-button{-webkit-appearance:none;margin:0}
                        #fp-ticket-age-hours,#fp-ticket-max-orders{-moz-appearance:textfield}
                        .fp-tkt-card{background:#0d0e18;border:1px solid #1a1c2e;border-radius:8px;padding:10px 12px;cursor:pointer;transition:border-color .15s,background .15s;}
                        .fp-tkt-card:hover{border-color:#6B66FF;background:#11122a;}
                        .fp-tkt-status{display:inline-block;padding:2px 7px;border-radius:10px;font-size:10px;font-weight:700;letter-spacing:.3px;}
                        #fp-new-ticket-fields::-webkit-scrollbar{width:4px}
                        #fp-new-ticket-fields::-webkit-scrollbar-track{background:transparent}
                        #fp-new-ticket-fields::-webkit-scrollbar-thumb{background:#2a2d44;border-radius:4px}
                        .fp-field-input{width:100%;background:#0d0e18;border:1px solid #1a1c2e;border-radius:6px;color:#d8dae8;padding:7px 10px;font-size:13px;box-sizing:border-box;outline:none;transition:border-color .15s;}
                        .fp-field-input:focus{border-color:#6B66FF;}
                        .fp-field-input option{background:#0d0e18;color:#d8dae8;}
                    </style>

                    <!-- Header -->
                    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">
                        <h3 style="margin:0;font-size:15px;">Техподдержка FunPay</h3>
                        <button id="fp-ticket-refresh-btn" title="Обновить" style="background:none;border:none;color:#5a5f7a;cursor:pointer;font-size:16px;padding:2px 6px;transition:color .15s;" onmouseover="this.style.color='#d8dae8'" onmouseout="this.style.color='#5a5f7a'">↻</button>
                    </div>

                    <!-- Auto ticket block -->
                    <div style="background:rgba(107,102,255,0.06);border:1px solid rgba(107,102,255,0.18);border-radius:8px;padding:11px 12px;margin-bottom:12px;">
                        <div style="font-weight:600;font-size:13px;margin-bottom:4px;color:#c8c4ff;">📨 Подтверждение заказов</div>
                        <p style="font-size:12px;color:#6a7090;margin:0 0 10px;line-height:1.5;">FunPay не всегда подтверждает заказы автоматически. Кнопка ниже соберёт все ваши неподтверждённые заказы и отправит заявку в ТП с просьбой их подтвердить — вручную делать не надо.</p>
                        <div style="display:flex;gap:10px;margin-bottom:10px;">
                            <label style="font-size:11px;color:#6a7090;display:flex;flex-direction:column;gap:3px;flex:1;">
                                Возраст заказа (ч)
                                <input type="number" id="fp-ticket-age-hours" min="1" max="168" value="24" class="fp-field-input" style="padding:5px 8px;font-size:12px;">
                            </label>
                            <label style="font-size:11px;color:#6a7090;display:flex;flex-direction:column;gap:3px;flex:1;">
                                Заказов в заявке (макс)
                                <input type="number" id="fp-ticket-max-orders" min="1" max="20" value="5" class="fp-field-input" style="padding:5px 8px;font-size:12px;">
                            </label>
                        </div>
                        <div style="display:flex;align-items:center;gap:8px;">
                            <button id="fp-send-auto-ticket-btn" class="btn" style="padding:6px 14px;font-size:12px;">Отправить заявку в ТП</button>
                            <span id="fp-auto-ticket-status" style="font-size:11px;color:#5a5f7a;"></span>
                        </div>
                    </div>

                    <!-- Tickets list header -->
                    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;">
                        <span style="font-size:11px;font-weight:600;color:#3a3d52;text-transform:uppercase;letter-spacing:.5px;">Ваши заявки</span>
                        <button id="fp-create-ticket-btn" class="btn btn-default" style="padding:3px 10px;font-size:11px;">+ Создать заявку</button>
                    </div>

                    <!-- List -->
                    <div id="fp-tickets-list" style="display:flex;flex-direction:column;gap:5px;max-height:240px;overflow-y:auto;"></div>
                    <div id="fp-tickets-empty" style="display:none;text-align:center;color:#3a3d52;font-size:13px;padding:18px 0;">Заявок нет</div>
                    <div id="fp-tickets-loading" style="text-align:center;color:#3a3d52;font-size:12px;padding:14px 0;">Загрузка...</div>

                    <!-- Ticket detail panel -->
                    <div id="fp-ticket-detail-panel" style="display:none;position:absolute;inset:0;background:#111318;z-index:20;box-sizing:border-box;flex-direction:column;overflow:hidden;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
                        <style>
                            #fp-tdm::-webkit-scrollbar{width:3px}
                            #fp-tdm::-webkit-scrollbar-thumb{background:#2a2d3a;border-radius:3px}
                            #fp-tri{outline:none;caret-color:#6B66FF;background:#23243a !important;border:none !important;box-shadow:none !important;border-radius:0 !important;padding:0 !important;margin:0 !important;}
                            #fp-tri::-webkit-scrollbar{width:2px}
                            #fp-tri::-webkit-scrollbar-thumb{background:#2a2d3a;}
                            .fp-msg-img{max-width:100%;border-radius:8px;margin-top:4px;display:block;cursor:pointer;}
                        </style>
                        <!-- Top bar -->
                        <div style="display:flex;align-items:center;gap:10px;padding:8px 12px;background:#1a1b22;flex-shrink:0;border-bottom:1px solid #0d0e14;">
                            <button id="fp-ticket-detail-back" style="all:unset;position:relative;overflow:hidden;color:#6B66FF;cursor:pointer;font-size:22px;line-height:1;padding:2px 6px 2px 0;flex-shrink:0;">&#8249;</button>
                            <div id="fp-tkt-av" style="width:32px;height:32px;border-radius:50%;background:#23243a;flex-shrink:0;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;color:#6B66FF;overflow:hidden;"></div>
                            <div style="flex:1;min-width:0;">
                                <div id="fp-ticket-detail-title" style="font-size:14px;font-weight:600;color:#e8eaf0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;line-height:1.2;"></div>
                                <div id="fp-ticket-detail-status" style="font-size:11px;margin-top:1px;line-height:1;"></div>
                            </div>
                        </div>
                        <!-- Messages -->
                        <div id="fp-tdm" style="flex:1;overflow-y:auto;padding:10px 10px 6px;display:flex;flex-direction:column;gap:3px;background:#111318;"></div>
                        <!-- Attach preview -->
                        <div id="fp-tapr" style="display:none;flex-shrink:0;padding:6px 12px 0;background:#1a1b22;">
                            <div style="position:relative;display:inline-block;">
                                <img id="fp-tath" style="height:48px;border-radius:6px;border:1px solid #2a2d3a;display:block;" src="" alt="">
                                <button id="fp-tarm" style="all:unset;position:absolute;top:-5px;right:-5px;background:#2a2d3a;border-radius:50%;width:16px;height:16px;color:#9099b8;font-size:10px;cursor:pointer;display:flex;align-items:center;justify-content:center;line-height:1;">&#x2715;</button>
                            </div>
                        </div>
                        <!-- Input bar -->
                        <div id="fp-tria" style="display:none;flex-shrink:0;align-items:flex-end;gap:6px;padding:6px 10px 8px;background:#111318;">
                            <label id="fp-attach-lbl" style="all:unset;display:flex;align-items:center;justify-content:center;width:34px;height:34px;cursor:pointer;color:#4a4f6a;flex-shrink:0;" title="Прикрепить">
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48"/></svg>
                                <input type="file" id="fp-ticket-attach-input" accept="image/*" style="display:none;">
                            </label>
                            <div style="flex:1;background:#23243a;border-radius:20px;padding:7px 14px;display:flex;align-items:flex-end;min-height:36px;box-sizing:border-box;">
                                <textarea id="fp-tri" placeholder="Сообщение..." style="all:unset;-webkit-appearance:none;appearance:none;width:100%;color:#e8eaf0;font-size:13px;line-height:1.45;height:20px;max-height:90px;overflow-y:hidden;font-family:inherit;display:block;resize:none;background:#23243a !important;" rows="1"></textarea>
                            </div>
                            <button id="fp-ticket-reply-btn" style="all:unset;position:relative;overflow:hidden;display:flex;align-items:center;justify-content:center;width:36px;height:36px;border-radius:50%;background:#6B66FF;cursor:pointer;flex-shrink:0;">
                                <svg width="15" height="15" viewBox="0 0 24 24" fill="#fff" style="margin-left:2px;"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>
                            </button>
                        </div>
                    </div>
                    <!-- Confirm overlay -->
                    <div id="fp-ticket-confirm-overlay" style="display:none;position:absolute;inset:0;background:rgba(5,6,12,0.96);z-index:10;border-radius:8px;padding:18px;box-sizing:border-box;flex-direction:column;gap:10px;">
                        <div style="font-weight:600;font-size:14px;">Проверьте заявку перед отправкой</div>
                        <div style="font-size:11px;color:#6a7090;">Именно это будет отправлено в техподдержку FunPay:</div>
                        <div id="fp-ticket-confirm-text" style="background:#0d0e18;border:1px solid #1a1c2e;border-radius:6px;padding:10px;font-size:12px;color:#c8cadc;white-space:pre-wrap;flex:1;overflow-y:auto;min-height:80px;max-height:180px;line-height:1.5;"></div>
                        <div style="display:flex;gap:8px;margin-top:2px;">
                            <button id="fp-ticket-confirm-yes" class="btn" style="flex:1;font-size:13px;">Отправить</button>
                            <button id="fp-ticket-confirm-no" class="btn btn-default" style="flex:1;font-size:13px;">Отмена</button>
                        </div>
                    </div>

                    <!-- New ticket panel (slides in from bottom) -->
                    <div id="fp-new-ticket-panel" style="display:none;position:absolute;inset:0;background:#0a0b14;z-index:20;border-radius:0;box-sizing:border-box;flex-direction:column;overflow:hidden;">
                        <div style="display:flex;align-items:center;justify-content:space-between;padding:12px 14px 8px;border-bottom:1px solid #1a1c2e;flex-shrink:0;">
                            <span style="font-weight:600;font-size:14px;">Новая заявка</span>
                            <button id="fp-new-ticket-close" style="background:none;border:none;color:#5a5f7a;cursor:pointer;font-size:18px;padding:0 4px;line-height:1;" onmouseover="this.style.color='#d8dae8'" onmouseout="this.style.color='#5a5f7a'">✕</button>
                        </div>
                        <div id="fp-new-ticket-fields" style="display:flex;flex-direction:column;gap:6px;flex:1;overflow-y:auto;padding:10px 14px;"></div>
                        <div style="flex-shrink:0;padding:8px 14px 12px;border-top:1px solid #1a1c2e;background:#0a0b14;">
                            <button id="fp-new-ticket-submit" class="btn" style="width:100%;font-size:13px;">Далее →</button>
                        </div>
                    </div>
                </div>

                <div class="fp-tools-page-content" data-page="support">
                    <h3>Оставьте отзыв! ⭐</h3>
                    <div class="support-container">
                        <p>Это <strong>самый важный</strong> вклад, который вы можете сделать. Ваш положительный отзыв — это топливо для новых обновлений и лучшая мотивация для разработчика.</p>
                        <p>Хорошие оценки помогают другим пользователям найти FP Tools. Пожалуйста, уделите всего минуту, чтобы поделиться своим мнением. Это действительно имеет огромное значение!</p>
                        <a href="https://chromewebstore.google.com/detail/funpay-tools/pibmnjjfpojnakckilflcboodkndkibb/reviews" target="_blank" class="btn review-btn"><span class="material-icons" style="font-size: 20px; margin-right: 8px;">rate_review</span>Оставить отзыв в Chrome Store</a>
                    </div>
                    <div style="margin-top:24px;text-align:center;border-top:1px solid rgba(255,255,255,0.06);padding-top:16px;">
                        <a href="https://funpay.tools" target="_blank" class="fp-site-footer-link">🔗 funpay.tools</a>
                    </div>
                </div>
            </main>
        </div>
        <div class="fp-tools-footer">
            <button id="saveSettings" class="btn">Сохранить</button>
        </div>
    `;
    return toolsPopup;
}

const FP_WALLPAPER_PRESETS = [
    { name: 'Горы и озеро', emoji: '🏔️', url: 'https://isorepublic.com/wp-content/uploads/2023/03/iso-republic-mountain-winter-lake.jpg', palette: { bgColor1: '#1a3050', bgColor2: '#4a7aaa', containerBgColor: '#0d1828', textColor: '#dde8f4', linkColor: '#7aaad8' } },
    { name: 'Туманные горы', emoji: '🌫️', url: 'https://isorepublic.com/wp-content/uploads/2023/02/iso-republic-napa-hill-fog.jpg', palette: { bgColor1: '#1e2830', bgColor2: '#5a7888', containerBgColor: '#101820', textColor: '#d8e4ec', linkColor: '#7aaac0' } },
    { name: 'Каньон', emoji: '🪨', url: 'https://isorepublic.com/wp-content/uploads/2023/03/iso-republic-rough-rocky-landscape.jpg', palette: { bgColor1: '#2a1808', bgColor2: '#a85030', containerBgColor: '#180e04', textColor: '#f0ddd0', linkColor: '#e08060' } },
    { name: 'Горный туман', emoji: '☁️', url: 'https://isorepublic.com/wp-content/uploads/2022/10/iso-republic-mist-mountains-clouds.jpg', palette: { bgColor1: '#151e2a', bgColor2: '#3a6090', containerBgColor: '#0a1018', textColor: '#dce8f8', linkColor: '#6090c8' } },
    { name: 'Закат', emoji: '🌅', url: 'https://isorepublic.com/wp-content/uploads/2022/11/iso-republic-clouds-sky-trees.jpg', palette: { bgColor1: '#280a18', bgColor2: '#c84810', containerBgColor: '#180508', textColor: '#f8ddd0', linkColor: '#f08060' } },
    { name: 'Пустыня', emoji: '🏜️', url: 'https://isorepublic.com/wp-content/uploads/2023/06/iso-republic-desert-barren-sky.jpg', palette: { bgColor1: '#201808', bgColor2: '#c89840', containerBgColor: '#100c04', textColor: '#f8ead8', linkColor: '#e0b860' } },
    { name: 'Побережье', emoji: '🌊', url: 'https://isorepublic.com/wp-content/uploads/2023/05/iso-republic-scenic-coast-beach-03.jpg', palette: { bgColor1: '#082028', bgColor2: '#2888a0', containerBgColor: '#041018', textColor: '#d8eef8', linkColor: '#50a8c8' } },
    { name: 'Млечный путь', emoji: '🌌', url: 'https://isorepublic.com/wp-content/uploads/2025/02/isorepublic-milky-way.jpg', palette: { bgColor1: '#080618', bgColor2: '#4030a0', containerBgColor: '#04030e', textColor: '#e0d8f8', linkColor: '#8070e0' } },
    { name: 'Звёзды', emoji: '⭐', url: 'https://isorepublic.com/wp-content/uploads/2022/12/iso-republic-mikly-way-trees-sky.jpg', palette: { bgColor1: '#040a18', bgColor2: '#103868', containerBgColor: '#020508', textColor: '#d8e8f8', linkColor: '#4080b8' } },
    { name: 'Синий дуотон', emoji: '🔵', url: 'https://isorepublic.com/wp-content/uploads/2022/10/iso-republic-abstract-wallpaper-duotone.jpg', palette: { bgColor1: '#080e28', bgColor2: '#1840c0', containerBgColor: '#040818', textColor: '#d8e0f8', linkColor: '#4868e8' } },
    { name: 'Тёмно-синий', emoji: '💙', url: 'https://isorepublic.com/wp-content/uploads/2024/05/iso-republic-abstract-wallpaper-dark-blues.jpg', palette: { bgColor1: '#030610', bgColor2: '#0c2890', containerBgColor: '#020408', textColor: '#d0d8f0', linkColor: '#3060c8' } },
    { name: 'Мягкий боке', emoji: '🎨', url: 'https://isorepublic.com/wp-content/uploads/2022/10/iso-republic-abstract-wallpaper-soft-blur.jpg', palette: { bgColor1: '#0e0618', bgColor2: '#6030b0', containerBgColor: '#06030c', textColor: '#e8d8f8', linkColor: '#9060e0' } }
];

const FP_WP_CACHE_KEY = 'fpToolsWallpaperCache';
const FP_WP_CACHE_TTL = 7 * 24 * 60 * 60 * 1000;
const _fpWpImgCache = new Map();

async function _getWpCache() {
    try { const r = await chrome.storage.local.get(FP_WP_CACHE_KEY); return r[FP_WP_CACHE_KEY] || {}; } catch { return {}; }
}
async function _markWpCached(url) {
    try { const c = await _getWpCache(); c[url] = { ts: Date.now() }; await chrome.storage.local.set({ [FP_WP_CACHE_KEY]: c }); } catch {}
}

let _wpIndex = 0;
let _wpLoading = false;

async function _loadCarouselSlide(index) {
    if (_wpLoading) return;
    const preset = FP_WALLPAPER_PRESETS[index];
    if (!preset) return;
    _wpLoading = true;

    const slot    = document.getElementById('fp-wp-img-slot');
    const loaderEl= document.getElementById('fp-wp-loader');
    const bar     = document.getElementById('fp-wp-bar');
    const pct     = document.getElementById('fp-wp-pct');
    const emoji   = document.getElementById('fp-wp-emoji');
    const nameEl  = document.getElementById('fp-wp-name');
    const counter = document.getElementById('fp-wp-counter');
    const applyBtn= document.getElementById('fp-wp-apply-cur');
    if (!slot) { _wpLoading = false; return; }

    nameEl.textContent  = preset.name;
    counter.textContent = `${index + 1} / ${FP_WALLPAPER_PRESETS.length}`;
    emoji.textContent   = preset.emoji;
    if (applyBtn) applyBtn.style.display = 'none';

    if (_fpWpImgCache.has(preset.url)) {
        const img = _fpWpImgCache.get(preset.url).cloneNode();
        _showCarouselImg(img, slot, loaderEl);
        _wpLoading = false;
        return;
    }

    loaderEl.style.display = 'flex';
    slot.innerHTML = '';
    bar.style.width = '0%'; pct.textContent = '0%';

    const storageCache = await _getWpCache();
    const cached = storageCache[preset.url] && Date.now() - storageCache[preset.url].ts < FP_WP_CACHE_TTL;

    if (!cached) {
        let fakeP = 0;
        slot._fakeIv = setInterval(() => {
            fakeP = Math.min(fakeP + Math.random() * 10, 88);
            bar.style.width = Math.round(fakeP) + '%';
            pct.textContent = Math.round(fakeP) + '%';
        }, 150);
    } else {
        bar.style.width = '90%'; pct.textContent = '…';
    }

    const img = new Image();
    img.referrerPolicy = 'no-referrer';
    img.decoding = 'async';
    img.width = 160;
    img.src = preset.url;

    try {
        await img.decode();
        if (slot._fakeIv) { clearInterval(slot._fakeIv); delete slot._fakeIv; }
        bar.style.width = '100%'; pct.textContent = '100%';
        _fpWpImgCache.set(preset.url, img);
        if (!cached) _markWpCached(preset.url);
        _showCarouselImg(img.cloneNode(), slot, loaderEl);
    } catch {
        if (slot._fakeIv) { clearInterval(slot._fakeIv); delete slot._fakeIv; }
        _wpLoading = false;
        _wpIndex = (index + 1) % FP_WALLPAPER_PRESETS.length;
        _loadCarouselSlide(_wpIndex);
        return;
    }
    _wpLoading = false;
}

function _showCarouselImg(img, slot, loaderEl) {
    img.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;object-fit:cover;image-rendering:pixelated;opacity:0;transition:opacity .35s ease;pointer-events:none;';
    slot.innerHTML = '';
    slot.appendChild(img);
    const applyBtn = document.getElementById('fp-wp-apply-cur');
    if (applyBtn) applyBtn.style.display = 'block';
    requestAnimationFrame(() => requestAnimationFrame(() => {
        img.style.opacity = '1';
        if (loaderEl) loaderEl.style.display = 'none';
    }));
}

function initializeWallpaperPresets() {
    const carousel = document.getElementById('fp-wallpaper-carousel');
    if (!carousel || carousel.dataset.initialized) return;
    carousel.dataset.initialized = '1';

    _wpIndex = 0;
    _loadCarouselSlide(0);

    document.getElementById('fp-wp-prev')?.addEventListener('click', () => {
        if (_wpLoading) return;
        _wpIndex = (_wpIndex - 1 + FP_WALLPAPER_PRESETS.length) % FP_WALLPAPER_PRESETS.length;
        _loadCarouselSlide(_wpIndex);
    });
    document.getElementById('fp-wp-next')?.addEventListener('click', () => {
        if (_wpLoading) return;
        _wpIndex = (_wpIndex + 1) % FP_WALLPAPER_PRESETS.length;
        _loadCarouselSlide(_wpIndex);
    });
    document.getElementById('fp-wp-apply-cur')?.addEventListener('click', () => {
        const preset = FP_WALLPAPER_PRESETS[_wpIndex];
        if (preset) applyWallpaperPreset(preset);
    });
    document.getElementById('fp-apply-dark-preset')?.addEventListener('click', applyBlackThemePreset);
}

async function applyWallpaperPreset(preset, cardEl) {
    const { fpToolsTheme = {} } = await chrome.storage.local.get('fpToolsTheme');
    const newTheme = { ...fpToolsTheme, bgImage: preset.url, enableCustomTheme: true, ...preset.palette };
    await chrome.storage.local.set({ fpToolsTheme: newTheme, enableCustomTheme: true });

    const previewDiv = document.getElementById('bg-image-preview');
    if (previewDiv) { previewDiv.style.backgroundImage = `url(${preset.url})`; previewDiv.textContent = ''; }

    _updateColorInputs(preset.palette);
    const cb = document.getElementById('enableCustomThemeCheckbox');
    if (cb) cb.checked = true;

    if (typeof applyCustomTheme === 'function') applyCustomTheme();
    if (typeof showNotification === 'function') showNotification(`Обои «${preset.name}» применены ✓`);
}

async function applyBlackThemePreset() {
    const canvas = document.createElement('canvas');
    canvas.width = 2; canvas.height = 2;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(0, 0, 2, 2);
    const base64 = canvas.toDataURL('image/png');

    const darkPalette = { bgColor1: '#0a0a0a', bgColor2: '#222222', containerBgColor: '#111111', textColor: '#cccccc', linkColor: '#888888' };
    const { fpToolsTheme = {} } = await chrome.storage.local.get('fpToolsTheme');
    const newTheme = { ...fpToolsTheme, bgImage: base64, enableCustomTheme: true, ...darkPalette };
    await chrome.storage.local.set({ fpToolsTheme: newTheme, enableCustomTheme: true });

    const previewDiv = document.getElementById('bg-image-preview');
    if (previewDiv) { previewDiv.style.backgroundImage = `url(${base64})`; previewDiv.style.backgroundColor = '#1a1a1a'; previewDiv.textContent = ''; }

    _updateColorInputs(darkPalette);
    const cb = document.getElementById('enableCustomThemeCheckbox');
    if (cb) cb.checked = true;
    document.querySelectorAll('.fp-wallpaper-card').forEach(c => c.style.borderColor = 'transparent');

    if (typeof applyCustomTheme === 'function') applyCustomTheme();
    if (typeof showNotification === 'function') showNotification('Чёрная тема применена ✓');
}

function _updateColorInputs(palette) {
    const map = { bgColor1: 'themeColor1', bgColor2: 'themeColor2', containerBgColor: 'themeContainerBgColor', textColor: 'themeTextColor', linkColor: 'themeLinkColor' };
    Object.entries(map).forEach(([key, id]) => { if (palette[key]) { const el = document.getElementById(id); if (el) el.value = palette[key]; } });
}



function setupPopupNavigation() {
    const toolsPopup = document.querySelector('.fp-tools-popup');
    if (!toolsPopup) return;
    const navItems = toolsPopup.querySelectorAll('.fp-tools-nav li, .fp-tools-header-tab');
    const contentPages = toolsPopup.querySelectorAll('.fp-tools-page-content');

    navItems.forEach(li => {
        if (!li.dataset.page) return;
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
            if (pageId === 'auto_review') { if (typeof initializeAutoReviewUI === 'function') initializeAutoReviewUI(); }
            if (pageId === 'tickets') { initTicketsTab(); }
            if (pageId === 'theme') {
                initializeWallpaperPresets();
                const g = document.getElementById('fp-wallpaper-carousel');
                if (g) g.style.display = 'block';
            } else {
                const g = document.getElementById('fp-wallpaper-carousel');
                if (g) g.style.display = 'none';
            }

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