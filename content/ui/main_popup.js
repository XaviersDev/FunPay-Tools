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
            .fp-tools-site-link::after{content:'';position:absolute;left:0;bottom:-2px;width:0;height:2px;background:linear-gradient(90deg,#C026D3,#a78bfa);transition:width .3s ease;border-radius:2px;}
            .fp-tools-site-link:hover{background:linear-gradient(90deg,#C026D3,#a78bfa,#C026D3);background-size:200%;-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;animation:fp-shimmer 1.2s linear infinite;}
            .fp-tools-site-link:hover::after{width:100%;}
            @keyframes fp-shimmer{0%{background-position:0%}100%{background-position:200%}}
            .fp-wallpaper-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:8px;}
            .fp-wallpaper-card:hover{box-shadow:0 0 0 2px #C026D3,0 4px 16px rgba(192,38,211,.3);}
            .fp-wallpaper-card img{pointer-events:none;}
            .fp-site-footer-link{display:inline-flex;align-items:center;gap:6px;padding:6px 16px;border:1px solid rgba(192,38,211,.35);border-radius:20px;color:#7672ff;text-decoration:none;font-size:12px;font-weight:600;letter-spacing:.5px;transition:all .2s;}
            .fp-site-footer-link:hover{background:rgba(192,38,211,.12);border-color:#C026D3;color:#a09af8;transform:translateY(-1px);box-shadow:0 4px 12px rgba(192,38,211,.2);}
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
                    <li data-page="general" class="active"><a><span class="nav-icon material-symbols-rounded">settings</span><span>Общие</span></a></li>
                    <li data-page="accounts"><a><span class="nav-icon material-symbols-rounded">group</span><span>Аккаунты</span></a></li>
                    <li data-page="needs"><a><span class="nav-icon material-symbols-rounded">tune</span><span>Что тебе нужно</span></a></li>
                    <li data-page="slash_commands"><a><span class="nav-icon material-symbols-rounded">terminal</span><span>Слэш-команды</span></a></li>
                    <li data-page="telegram"><a><span class="nav-icon material-symbols-rounded">send</span><span>Telegram</span></a></li>
                    <li class="fp-nav-divider">Эксклюзив</li>
                    <li data-page="epic_nicks"><a><span class="nav-icon material-symbols-rounded">diamond</span><span>Это увидят все</span></a></li>
                    <li class="fp-nav-divider">Интерфейс</li>
                    <li data-page="theme"><a><span class="nav-icon material-symbols-rounded">palette</span><span>Кастомизация</span></a></li>
                    <li data-page="effects"><a><span class="nav-icon material-symbols-rounded">auto_awesome</span><span>Эффекты</span></a></li>
                    <li class="fp-nav-divider">Чат и продажи</li>
                    <li data-page="global_chat"><a><span class="nav-icon material-symbols-rounded">forum</span><span>Общий чат</span></a></li>
                    <li data-page="templates"><a><span class="nav-icon material-symbols-rounded">description</span><span>Шаблоны</span></a></li>
                    <li data-page="auto_review"><a><span class="nav-icon material-symbols-rounded">smart_toy</span><span>Авто-ответы</span></a></li>
                    <li data-page="auto_delivery"><a><span class="nav-icon material-symbols-rounded">bolt</span><span>Авто-выдача</span></a></li>
                    <li class="fp-nav-divider">Торговля</li>
                    <li data-page="lot_io"><a><span class="nav-icon material-symbols-rounded">inventory_2</span><span>Лоты</span></a></li>
                    <li data-page="autobump"><a><span class="nav-icon material-symbols-rounded">rocket_launch</span><span>Авто-поднятие</span></a></li>
                    <li data-page="ai_audit"><a><span class="nav-icon material-symbols-rounded">search_insights</span><span>ИИ-аудит</span></a></li>
                    <li data-page="blacklist"><a><span class="nav-icon material-symbols-rounded">block</span><span>Чёрный список</span></a></li>
                    <li class="fp-nav-divider">Финансы</li>
                    <li data-page="piggy_banks"><a><span class="nav-icon material-symbols-rounded">savings</span><span>Копилки</span></a></li>
                    <li data-page="calculator"><a><span class="nav-icon material-symbols-rounded">calculate</span><span>Калькулятор</span></a></li>
                    <li data-page="currency_calc"><a><span class="nav-icon material-symbols-rounded">currency_exchange</span><span>Валюты</span></a></li>
                    <li class="fp-nav-divider">Прочее</li>
                    <li data-page="notes"><a><span class="nav-icon material-symbols-rounded">edit_note</span><span>Заметки</span></a></li>
                    <li data-page="overview"><a><span class="nav-icon material-symbols-rounded">movie</span><span>Обзор</span></a></li>
                    <li data-page="settings_io"><a><span class="nav-icon material-symbols-rounded">database</span><span>Настройки</span></a></li>
                    <li data-page="tickets"><a><span class="nav-icon material-symbols-rounded">confirmation_number</span><span>Тикеты</span></a></li>
                    <li data-page="support"><a><span class="nav-icon material-symbols-rounded">favorite</span><span>Поддержка</span></a></li>
                </ul>
            </nav>
            <main class="fp-tools-content">
                <div class="fp-tools-page-content active" data-page="general">
                    <h3>Общие настройки</h3>
                    <div class="checkbox-label-inline">
                        <input type="checkbox" id="showSalesStatsCheckbox">
                        <label for="showSalesStatsCheckbox" style="margin-bottom:0;"><span>Показывать статистику покупок и продаж на их вкладках</span></label>
                    </div>
                    <div class="checkbox-label-inline">
                        <input type="checkbox" id="showFinanceStatsCheckbox">
                        <label for="showFinanceStatsCheckbox" style="margin-bottom:0;"><span>Показывать статистику финансов в «Финансы»</span></label>
                    </div>
                    <div class="checkbox-label-inline">
                        <input type="checkbox" id="hideBalanceCheckbox">
                        <label for="hideBalanceCheckbox" style="margin-bottom:0;"><span>Скрыть баланс</span></label>
                    </div>
                    <div class="checkbox-label-inline">
                        <input type="checkbox" id="viewSellersPromoCheckbox">
                        <label for="viewSellersPromoCheckbox" style="margin-bottom:0;"><span>Отображение иконок промо-лотов</span></label>
                    </div>
                    <div class="checkbox-label-inline">
                        <input type="checkbox" id="fptShowCommissionCheckbox">
                        <label for="fptShowCommissionCheckbox" style="margin-bottom:0;"><span>Показывать комиссию разделов</span></label>
                    </div>
                    <div class="checkbox-label-inline">
                        <input type="checkbox" id="fptShowRealPricesCheckbox">
                        <label for="fptShowRealPricesCheckbox" style="margin-bottom:0;"><span>Показывать реальные цены лотов</span></label>
                    </div>
                    
                    <h3>Звук уведомления</h3>
                    <div class="fp-tools-radio-group" id="notificationSoundGroup">
                        <label class="fp-tools-radio-option"><input type="radio" name="notificationSound" value="default" checked><span>Стандартный</span></label>
                        <label class="fp-tools-radio-option"><input type="radio" name="notificationSound" value="vk"><span>VK</span></label>
                        <label class="fp-tools-radio-option"><input type="radio" name="notificationSound" value="tg"><span>Telegram</span></label>
                        <label class="fp-tools-radio-option"><input type="radio" name="notificationSound" value="iphone"><span>iPhone</span></label>
                        <label class="fp-tools-radio-option"><input type="radio" name="notificationSound" value="discord"><span>Discord</span></label>
                        <label class="fp-tools-radio-option"><input type="radio" name="notificationSound" value="whatsapp"><span>WhatsApp</span></label>
                        <label class="fp-tools-radio-option"><input type="radio" name="notificationSound" value="custom"><span>Своя мелодия</span></label>
                    </div>

                    <!-- Загрузка своей мелодии + обрезка до 5 секунд -->
                    <div id="fptCustomSoundBlock" style="margin-top:12px;background:#0e0f16;border:1px solid #1e2030;border-radius:10px;padding:14px;display:none;">
                        <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
                            <button id="fptCustomSoundUploadBtn" class="btn btn-default" style="padding:6px 12px;font-size:13px;">
                                <span class="material-symbols-rounded" style="font-size:16px;vertical-align:-3px;margin-right:5px;">upload_file</span>Выбрать аудио
                            </button>
                            <input type="file" id="fptCustomSoundInput" accept="audio/*" style="display:none;">
                            <span id="fptCustomSoundFileName" style="font-size:12px;color:#9099b8;">Файл не выбран</span>
                        </div>
                        <p class="template-info" style="margin-top:10px;">Можно выбрать любые <span class="fpt-sec-spin"><input type="text" id="fptClipSeconds" value="5" inputmode="numeric" maxlength="1"><span class="fpt-sec-spin-btns"><button type="button" id="fptClipSecUp" tabindex="-1">▲</button><button type="button" id="fptClipSecDown" tabindex="-1">▼</button></span></span> сек. из вашего трека: перетащите выделение по дорожке, прослушайте и сохраните. Уведомление будет проигрывать именно этот отрезок.</p>

                        <div id="fptCustomSoundEditor" style="display:none;margin-top:8px;">
                            <div id="fptWaveWrap" style="position:relative;height:64px;background:#070810;border:1px solid #22253a;border-radius:8px;overflow:hidden;user-select:none;cursor:pointer;">
                                <canvas id="fptWaveCanvas" style="position:absolute;inset:0;width:100%;height:100%;"></canvas>
                                <div id="fptWaveSel" style="position:absolute;top:0;bottom:0;background:rgba(192,38,211,0.22);border-left:2px solid #C026D3;border-right:2px solid #C026D3;box-sizing:border-box;"></div>
                                <div id="fptWavePlayhead" style="position:absolute;top:0;bottom:0;width:2px;background:#ffd24a;display:none;"></div>
                                <div id="fptWaveSelHandleL" style="position:absolute;top:0;bottom:0;width:8px;margin-left:-4px;cursor:ew-resize;"></div>
                                <div id="fptWaveSelHandleR" style="position:absolute;top:0;bottom:0;width:8px;margin-left:-4px;cursor:ew-resize;"></div>
                            </div>
                            <div style="display:flex;align-items:center;justify-content:space-between;margin-top:8px;gap:10px;flex-wrap:wrap;">
                                <span id="fptCustomSoundRange" style="font-size:11px;color:#5a5f7a;">0:00 - 0:05</span>
                                <div style="display:flex;gap:8px;align-items:center;">
                                    <button id="fptCustomSoundPreviewBtn" class="fpt-icon-play-btn" title="Прослушать отрезок">
                                        <span class="material-symbols-rounded">play_arrow</span>
                                    </button>
                                    <button id="fptCustomSoundSaveBtn" class="btn" style="padding:5px 14px;font-size:12px;">Сохранить мелодию</button>
                                </div>
                            </div>
                        </div>
                        <div id="fptCustomSoundSaved" style="display:none;margin-top:10px;font-size:12px;color:#4caf82;">
                            <span class="material-symbols-rounded" style="font-size:15px;vertical-align:-3px;">check_circle</span>
                            Сохранена своя мелодия (<span id="fptCustomSoundSavedLen">5.0</span> сек).
                        </div>
                    </div>
                    <div class="template-container" style="margin-top:14px;">
                        <div class="range-label" style="display:flex;align-items:center;justify-content:space-between;">
                            <label for="notificationVolume" style="margin:0;">Громкость уведомлений:</label>
                            <span id="notificationVolumeValue">100%</span>
                        </div>
                        <div style="display:flex;align-items:center;gap:10px;margin-top:6px;">
                            <input type="range" id="notificationVolume" min="0" max="100" step="1" value="100" style="flex:1;">
                            <button id="previewNotificationBtn" class="fpt-icon-play-btn" title="Прослушать"><span class="material-symbols-rounded">play_arrow</span></button>
                        </div>
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
                        <span class="nav-icon material-symbols-rounded">favorite</span>
                        <span>Понравился FP Tools? <a href="#" data-nav-to="support">Поддержите труд разработчика</a> во вкладке "Поддержка"!</span>
                    </div>
                    
                    <h3 style="margin-top: 30px;">Заказы и статистика</h3>
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
                    <p class="template-info">При включении к исходящим сообщениям добавляется невидимый символ. Если собеседник тоже использует FPT - рядом с его ником появится пометка. Символ не виден обычным пользователям. Не добавляется в ссылки и скопированный текст.</p>

                    <div class="support-promo" style="background: rgba(255, 152, 0, 0.1); border-color: rgba(255, 152, 0, 0.3); margin-top: 15px;">
                        <span class="nav-icon material-symbols-rounded" style="color: #ff9800;">warning</span>
                        <span>Для корректной работы расширения рекомендуется использовать FunPay на <strong>русском языке</strong>, так как большинство функций не будут работать на других языках.</span>
                    </div>
                </div> <!-- КОНЕЦ ВКЛАДКИ "ОБЩИЕ" -->

                <!-- НАЧАЛО ВКЛАДКИ "ЭПИЧЕСКИЕ НИКИ" -->
                <div class="fp-tools-page-content" data-page="epic_nicks">
                    <div style="display:flex; justify-content:space-between; align-items:center;">
                        <h3>Эпический никнейм <span class="material-symbols-rounded" style="vertical-align:-3px;color:#e9a8ff;">diamond</span></h3>
                    </div>
                    <p class="template-info" style="font-size: 14px; line-height: 1.5;">
                        Выделитесь среди конкурентов! Ваш никнейм будет светиться, переливаться и излучать частицы <b>у всех пользователей расширения FP Tools</b> (более 15 000 человек).
                    </p>

                    <div style="background: rgba(192, 38, 211, 0.1); border: 1px solid rgba(192, 38, 211, 0.3); border-radius: 12px; padding: 18px; margin-bottom: 25px; box-shadow: 0 4px 15px rgba(0,0,0,0.2);">
                        <div style="font-size: 15px; margin-bottom: 12px; color: #fff;">Приобрести уникальный стиль можно навсегда по очень низкой цене.</div>
                        <div style="font-size: 13px; color: #a0a0a0; margin-bottom: 15px;">Больше 6 способов оплаты на выбор. Нажав на кнопку ниже, вы перейдёте в Telegram-бота, где сможете нажать на "Украсить ник на сайте FunPay"</div>
                        <a href="https://t.me/FPToolsBot" target="_blank" class="btn" style="text-decoration:none; display:flex; align-items:center; justify-content:center; gap:8px; font-size: 14px; padding: 10px;">
                            <svg viewBox="0 0 24 24" width="20" height="20"><path fill="currentColor" d="M9.78 18.65l.28-4.23 7.68-6.92c.34-.31-.07-.46-.52-.19L7.74 13.3 3.64 12c-.88-.25-.89-1.37.2-1.64l16.44-5.99c.73-.27 1.36.17 1.15.99l-2.28 10.82c-.15.71-.56 1.01-1.2 1.01l-4.82-.01-1.15 4.35c-.32.74-1.23.46-1.42-.47z"/></svg>
                            Получить уникальный ник
                        </a>
                    </div>

                    <h4 style="margin-bottom: 15px;">Вот несколько примеров для того, чтобы вы посмотрели, как это будет выглядеть у всех пользователей расширения:</h4>
                    <div id="fpt-epic-previews-container" style="display: flex; flex-direction: column; gap: 30px; margin-top: 10px; background: #0e0f16; border: 1px solid #1e2030; border-radius: 8px; padding: 20px;">
                        <div style="text-align: center; color: #5a5f7a; font-size: 12px;">Загрузка движка частиц...</div>
                    </div>
                </div> <!-- КОНЕЦ ВКЛАДКИ "ЭПИЧЕСКИЕ НИКИ" -->

                <!-- НАЧАЛО ВКЛАДКИ "АККАУНТЫ" -->
                <div class="fp-tools-page-content" data-page="accounts">
                    <h3>Управление аккаунтами</h3>
                    <p class="template-info">Добавьте текущий аккаунт в список, чтобы быстро переключаться между профилями без ввода пароля.</p>
                    <div class="support-promo" style="background: rgba(192,38,211,0.08); border-color: rgba(192,38,211,0.25); margin-bottom: 20px;">
                        <span class="nav-icon material-symbols-rounded" style="color: #C026D3;">info</span>
                        <span>Нажмите «+ Добавить текущий аккаунт» для каждого профиля. Переключение происходит мгновенно без ввода паролей.</span>
                    </div>
                    <button id="addCurrentAccountBtn" class="btn">+ Добавить текущий аккаунт</button>
                    <div style="display:flex;align-items:center;justify-content:space-between;margin-top:22px;margin-bottom:10px;">
                        <h4 style="margin:0;">Сохраненные аккаунты:</h4>
                        <button id="fptRefreshAccountsBtn" class="btn btn-default" style="padding:4px 10px;font-size:12px;" title="Обновить баланс, аватары и непрочитанные">
                            <span class="material-symbols-rounded" style="font-size:15px;vertical-align:-3px;">refresh</span> Обновить
                        </button>
                    </div>
                    <div id="fpToolsAccountsList"></div>
                </div>
                <div class="fp-tools-page-content" data-page="needs">
                    <h3>Что тебе нужно</h3>
                    <p class="template-info">Здесь убираются кнопки и элементы, которые расширение само добавляет на страницы FunPay (например, кнопка ИИ-переписывателя в чате или кнопка «Прочитать все») и которые иначе никак не отключить. Опишите своими словами, что мешает - ИИ поймёт и спросит подтверждение. Либо отметьте вручную. Применяется сразу, без перезагрузки. Функции со своим переключателем (тема, авто-поднятие, эффекты курсора, метка рядом с ником и т.п.) отключаются в их собственных вкладках.</p>

                    <div class="fpt-needs-ai-box">
                        <textarea id="fptNeedsInput" placeholder="Например: «убери ИИ-кнопку и счётчик символов в чате, не нужна кнопка Прочитать все и пункт Добавить в ЧС»" rows="3"></textarea>
                        <button id="fptNeedsAskBtn" class="btn"><span class="material-symbols-rounded" style="font-size:18px;vertical-align:-4px;margin-right:6px;">auto_awesome</span>Понять и подобрать</button>
                    </div>

                    <div id="fptNeedsAiResult" class="fpt-needs-ai-result" style="display:none;"></div>

                    <div class="fpt-needs-manual">
                        <div class="fpt-needs-manual-head">
                            <h4 style="margin:0;">Все добавленные элементы</h4>
                            <input type="text" id="fptNeedsFilter" class="fpt-needs-filter" placeholder="Поиск по названию…">
                        </div>
                        <p class="template-info" style="margin-top:6px;">Галочка = элемент показывается. Снимите галочку, чтобы убрать его со страниц - сохраняется и применяется сразу, без перезагрузки и без кнопки «применить». Нажмите <span class="material-symbols-rounded" style="font-size:15px;vertical-align:-3px;color:#e9a8ff;">visibility</span>, чтобы увидеть, как элемент выглядит.</p>
                        <div id="fptNeedsList" class="fpt-needs-list"></div>
                        <div class="fpt-needs-footer">
                            <span class="fpt-needs-autosave-note"><span class="material-symbols-rounded">bolt</span>Изменения сохраняются автоматически</span>
                            <span id="fptNeedsStatus" class="fpt-needs-status"></span>
                        </div>
                    </div>
                </div>

                <!-- НАЧАЛО ВКЛАДКИ "СЛЭШ-КОМАНДЫ" -->
                <div class="fp-tools-page-content" data-page="slash_commands">
                    <h3>Слэш-команды</h3>
                    <p class="template-info">Свои быстрые ответы для поля чата. Вы задаёте команду (например <code>/привет</code>) и её ответ (например «Привет, я тут. Какие вопросы?»). В чате начинаете печатать команду - <code>/при</code> - появляется подсказка; нажимаете Tab или Enter, и команда сразу превращается в полный текст ответа. Удобно для приветствий, реквизитов, частых фраз.</p>

                    <div class="checkbox-label-inline">
                        <input type="checkbox" id="fptSlashEnabled" checked>
                        <label for="fptSlashEnabled" style="margin-bottom:0;"><span><b>Включить слэш-команды</b></span></label>
                    </div>

                    <div id="fptSlashConfig">
                        <div class="checkbox-label-inline" style="margin-top:8px;">
                            <input type="checkbox" id="fptSlashAutocomplete" checked>
                            <label for="fptSlashAutocomplete" style="margin-bottom:0;"><span>Показывать выпадающую подсказку при вводе</span></label>
                        </div>

                        <label style="display:block;margin-top:14px;margin-bottom:6px;font-size:13px;">Чем разворачивать команду:</label>
                        <div class="fp-tools-radio-group" id="fptSlashKeyGroup">
                            <label class="fp-tools-radio-option"><input type="radio" name="fptSlashKey" value="both" checked><span>Tab или Enter</span></label>
                            <label class="fp-tools-radio-option"><input type="radio" name="fptSlashKey" value="tab"><span>Только Tab</span></label>
                            <label class="fp-tools-radio-option"><input type="radio" name="fptSlashKey" value="enter"><span>Только Enter</span></label>
                        </div>

                        <div class="support-promo" style="background:rgba(192,38,211,0.07);border-color:rgba(192,38,211,0.2);margin:16px 0;">
                            <span class="material-symbols-rounded" style="font-size:16px;color:#f4c84a;vertical-align:-3px;">lightbulb</span>
                            <span>Переменные в ответе: <code>{buyername}</code> - имя собеседника, <code>{date}</code>, <code>{time}</code>.</span>
                        </div>

                        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">
                            <h4 style="margin:0;">Мои команды</h4>
                            <button id="fptSlashAddBtn" class="btn btn-default" style="padding:5px 12px;font-size:13px;">+ Добавить команду</button>
                        </div>
                        <div id="fptSlashList"></div>
                    </div>
                </div>
                <!-- КОНЕЦ ВКЛАДКИ "СЛЭШ-КОМАНДЫ" -->

                <!-- НАЧАЛО ВКЛАДКИ "TELEGRAM" -->
                <div class="fp-tools-page-content" data-page="telegram">
                    <h3>Управление через Telegram</h3>
                    <p class="template-info">Управляйте FP Tools и получайте уведомления (новые заказы и сообщения) прямо в Telegram-боте. Создайте бота, вставьте токен - и всё работает.</p>

                    <div class="support-promo" style="background:rgba(192,38,211,0.08);border-color:rgba(192,38,211,0.25);margin-bottom:16px;">
                        <span class="nav-icon material-symbols-rounded" style="color:#C026D3;">info</span>
                        <span>Как настроить: 1) создайте бота через <b>@BotFather</b> и скопируйте токен; 2) <b>напишите своему боту любое сообщение</b> в Telegram; 3) вставьте токен ниже и нажмите «Подключить».</span>
                    </div>

                    <div class="support-promo" style="background:rgba(240,160,64,0.08);border-color:rgba(240,160,64,0.3);margin-bottom:16px;">
                        <span class="nav-icon material-symbols-rounded" style="color:#f0a040;">warning</span>
                        <span>Важно: в некоторых странах доступ к Telegram ограничен или блокируется - если вы находитесь в такой стране, не удивляйтесь ошибкам подключения, таймаутам или «вечному ожиданию» сообщений, это связано с ограничениями сети, а не с расширением. Также у части пользователей бот может работать нестабильно (периодические ошибки, задержки, зависание ответов) даже без блокировок Telegram - причины бывают на стороне Telegram или провайдера. Если у вас так - это известное поведение, попробуйте переподключить бота позже.</span>
                    </div>

                    <div class="checkbox-label-inline">
                        <input type="checkbox" id="fptTgEnabled">
                        <label for="fptTgEnabled" style="margin-bottom:0;"><span><b>Включить интеграцию с Telegram</b></span></label>
                    </div>

                    <div id="fptTgConfig" style="margin-top:10px;">
                        <label for="fptTgToken" style="margin-top:6px;">Токен бота:</label>
                        <input type="text" id="fptTgToken" class="template-input" placeholder="123456789:AAExxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" autocomplete="off" spellcheck="false">
                        <div style="display:flex;gap:8px;margin-top:8px;">
                            <button id="fptTgConnectBtn" class="btn" style="flex:1;">Подключить</button>
                            <button id="fptTgTestBtn" class="btn btn-default" style="flex:1;">Тест уведомления</button>
                        </div>
                        <div id="fptTgStatus" style="font-size:12px;margin-top:8px;color:#9099b8;"></div>

                        <label for="fptTgChatId" style="margin-top:14px;">Chat ID (определяется автоматически):</label>
                        <input type="text" id="fptTgChatId" class="template-input" placeholder="Будет заполнено после «Подключить»" autocomplete="off" spellcheck="false">

                        <h4 style="margin-top:22px;">Уведомления</h4>
                        <div class="checkbox-label-inline">
                            <input type="checkbox" id="fptTgNotifyOrders" checked>
                            <label for="fptTgNotifyOrders" style="margin-bottom:0;"><span>Новые заказы</span></label>
                        </div>
                        <div class="checkbox-label-inline">
                            <input type="checkbox" id="fptTgNotifyMessages" checked>
                            <label for="fptTgNotifyMessages" style="margin-bottom:0;"><span>Новые сообщения в чатах</span></label>
                        </div>

                        <h4 style="margin-top:22px;">Управление из бота</h4>
                        <div class="checkbox-label-inline">
                            <input type="checkbox" id="fptTgAllowControl" checked>
                            <label for="fptTgAllowControl" style="margin-bottom:0;"><span>Разрешить команды управления из бота</span></label>
                        </div>

                        <p class="template-info" style="margin-top:12px;margin-bottom:8px;">Команды бота (принимаются только из вашего чата):</p>
                        <ul class="fpt-tg-cmd-list">
                            <li><code>/status</code><span>баланс и статус</span></li>
                            <li><code>/chats</code><span>непрочитанные чаты</span></li>
                            <li><code>/sales</code><span>статистика продаж</span></li>
                            <li><code>/online</code><span>поддержать онлайн</span></li>
                            <li><code>/help</code><span>список команд</span></li>
                        </ul>
                    </div>
                </div>
                <!-- КОНЕЦ ВКЛАДКИ "TELEGRAM" -->
                <div class="fp-tools-page-content" data-page="templates">
                    <h3>Настройки шаблонов</h3>
                    <div class="checkbox-label-inline"><input type="checkbox" id="templatesEnabled" checked><label for="templatesEnabled" style="margin-bottom:0;"><span><b>Включить шаблоны</b></span></label></div>
                    <div class="checkbox-label-inline" style="margin-top:8px;"><input type="checkbox" id="sendTemplatesImmediately"><label for="sendTemplatesImmediately" style="margin-bottom:0;"><span>Отправлять шаблоны сразу по клику</span></label></div>

                    <div id="fpt-templates-config">
                    <label style="margin-top:10px;display:block;">Расположение кнопок:</label>
                    <div class="fpt-pos-grid">
                        <label class="fpt-pos-card"><input type="radio" name="templatePos" value="above"><span class="fpt-pos-ico"><span class="fpt-pos-row"></span><span class="fpt-pos-field"></span></span><span class="fpt-pos-name">Над полем</span></label>
                        <label class="fpt-pos-card"><input type="radio" name="templatePos" value="bottom" checked><span class="fpt-pos-ico"><span class="fpt-pos-field"></span><span class="fpt-pos-row"></span></span><span class="fpt-pos-name">Под полем</span></label>
                        <label class="fpt-pos-card"><input type="radio" name="templatePos" value="sidebar_top"><span class="fpt-pos-ico fpt-pos-ico-side"><span class="fpt-pos-panel fpt-pos-panel-top"><span class="fpt-pos-srow"></span><span class="fpt-pos-srow"></span></span><span class="fpt-pos-sfield"></span></span><span class="fpt-pos-name">В панели сверху</span></label>
                        <label class="fpt-pos-card"><input type="radio" name="templatePos" value="sidebar_bottom"><span class="fpt-pos-ico fpt-pos-ico-side"><span class="fpt-pos-panel fpt-pos-panel-bottom"><span class="fpt-pos-srow"></span><span class="fpt-pos-srow"></span></span><span class="fpt-pos-sfield"></span></span><span class="fpt-pos-name">В панели снизу</span></label>
                        <label class="fpt-pos-card"><input type="radio" name="templatePos" value="popover"><span class="fpt-pos-ico fpt-pos-ico-pop"><span class="fpt-pos-field"></span><span class="fpt-pos-pop-btn"></span></span><span class="fpt-pos-name">Меню у скрепки</span></label>
                    </div>
                    <p class="template-info" id="fpt-popover-hint" style="margin-top:6px;display:none;">«Меню у скрепки»: слева от кнопки прикрепления файла появится отдельная кнопка с иконкой шаблонов. По клику открывается компактное меню со всеми шаблонами и быстрым переходом в эти настройки.</p>

                    <h3>Внешний вид кнопок</h3>
                    <div class="fpt-appx">
                        <div class="fpt-appx-grid">
                            <div class="fpt-appx-block">
                                <div class="fpt-appx-cap">Форма</div>
                                <div class="fpt-seg" data-fpt-opt="shape">
                                    <button type="button" data-val="rounded" title="Скруглённые"><span class="fpt-shape-prev" style="border-radius:5px;"></span></button>
                                    <button type="button" data-val="pill" title="Капсула"><span class="fpt-shape-prev" style="border-radius:999px;"></span></button>
                                    <button type="button" data-val="square" title="Прямые углы"><span class="fpt-shape-prev" style="border-radius:1px;"></span></button>
                                </div>
                            </div>
                            <div class="fpt-appx-block">
                                <div class="fpt-appx-cap">Размер</div>
                                <div class="fpt-seg" data-fpt-opt="size">
                                    <button type="button" data-val="s" title="Маленький"><span class="fpt-az" style="font-size:11px;">Aa</span></button>
                                    <button type="button" data-val="m" title="Средний"><span class="fpt-az" style="font-size:14px;">Aa</span></button>
                                    <button type="button" data-val="l" title="Большой"><span class="fpt-az" style="font-size:17px;">Aa</span></button>
                                </div>
                            </div>
                        </div>

                        <div class="fpt-appx-block">
                            <div class="fpt-appx-cap">Заливка</div>
                            <div class="fpt-seg fpt-seg-fill" data-fpt-opt="fill">
                                <button type="button" data-val="solid" title="Сплошная"><span class="fpt-fill-prev" style="background:#C026D3;"></span><span class="fpt-fill-name">Сплошная</span></button>
                                <button type="button" data-val="soft" title="Мягкая"><span class="fpt-fill-prev" style="background:rgba(192,38,211,.28);"></span><span class="fpt-fill-name">Мягкая</span></button>
                                <button type="button" data-val="outline" title="Контур"><span class="fpt-fill-prev" style="background:transparent;border:2px solid #C026D3;"></span><span class="fpt-fill-name">Контур</span></button>
                                <button type="button" data-val="ghost" title="Призрачная"><span class="fpt-fill-prev" style="background:transparent;border:1px dashed #C026D3;"></span><span class="fpt-fill-name">Призрак</span></button>
                            </div>
                        </div>

                        <div class="fpt-appx-block fpt-align-block" id="fpt-align-block">
                            <div class="fpt-appx-cap">Выравнивание текста</div>
                            <div class="fpt-seg" data-fpt-opt="align">
                                <button type="button" data-val="left" title="Слева"><span class="material-symbols-rounded">format_align_left</span></button>
                                <button type="button" data-val="center" title="По центру"><span class="material-symbols-rounded">format_align_center</span></button>
                                <button type="button" data-val="right" title="Справа"><span class="material-symbols-rounded">format_align_right</span></button>
                            </div>
                            <div class="fpt-align-hint">Доступно при включённом «На всю ширину»</div>
                        </div>

                        <div class="fpt-appx-block">
                            <div class="fpt-appx-cap">Дополнительно</div>
                            <div class="fpt-appx-toggles">
                                <button type="button" class="fpt-chip-toggle" data-fpt-toggle="fullWidth"><span class="material-symbols-rounded">width_full</span><span>На всю ширину</span></button>
                                <button type="button" class="fpt-chip-toggle" data-fpt-toggle="compact"><span class="material-symbols-rounded">density_small</span><span>Компактно</span></button>
                                <button type="button" class="fpt-chip-toggle" data-fpt-toggle="uppercase"><span class="material-symbols-rounded">text_fields</span><span>ЗАГЛАВНЫЕ</span></button>
                                <button type="button" class="fpt-chip-toggle" data-fpt-toggle="showPreview"><span class="material-symbols-rounded">preview</span><span>Превью при наведении</span></button>
                            </div>
                        </div>

                        <!-- Доп. настройки, видимые только для «в панели» -->
                        <div class="fpt-appx-block fpt-sidebar-only" id="fpt-sidebar-extra">
                            <div class="fpt-appx-cap">Компактность панели</div>
                            <div class="fpt-seg" data-fpt-opt="sidebarDensity">
                                <button type="button" data-val="cozy" title="Просторно">Просторно</button>
                                <button type="button" data-val="normal" title="Обычно">Обычно</button>
                                <button type="button" data-val="dense" title="Плотно">Плотно</button>
                            </div>
                            <div class="fpt-appx-cap" style="margin-top:10px;">Раскладка</div>
                            <div class="fpt-seg" data-fpt-opt="sidebarLayout">
                                <button type="button" data-val="flow" title="Авто-сетка (по ширине)">Авто-сетка</button>
                                <button type="button" data-val="list" title="Список (в столбик)">Список</button>
                            </div>
                            <div class="fpt-align-hint" style="display:block;color:#6b7194;">«Авто-сетка» умно раскладывает кнопки по ширине панели, как на скрине.</div>
                        </div>

                        <div class="fpt-appx-block">
                            <div class="fpt-appx-cap">Живой предпросмотр</div>
                            <div id="fpt-appearance-preview" class="chat-buttons-container" data-fpt-shape="rounded" data-fpt-size="m" data-fpt-fill="solid" data-fpt-align="center" data-fpt-fullwidth="0" data-fpt-uppercase="0" data-fpt-compact="0">
                                <button type="button" class="chat-template-btn" style="background-color:#C026D3;--btn-color:#C026D3;">Приветствие</button>
                                <button type="button" class="chat-template-btn" style="background-color:#FF6B6B;--btn-color:#FF6B6B;">Спасибо за заказ</button>
                                <button type="button" class="custom-chat-template-btn" style="background-color:#7c4dff;--btn-color:#7c4dff;">Свой шаблон</button>
                            </div>
                        </div>
                    </div>
                    </div>

                    <h3>Редактор шаблонов</h3>
                     <p class="template-info">Кликните на название или текст шаблона, чтобы его изменить. Все изменения сохраняются автоматически.</p>
                     
                     <div class="template-variables-guide">
                        <h5>Справка по переменным</h5>
                        <ul class="variables-list">
                            <li><span class="variable-code">{buyername}</span> - Имя покупателя в текущем чате.</li>
                            <li><span class="variable-code">{lotname}</span> - Название товара, который обсуждается в чате.</li>
                            <li><span class="variable-code">{welcome}</span> - "Доброе утро!", "Добрый день!" или "Добрый вечер!" в зависимости от времени.</li>
                            <li><span class="variable-code">{date}</span> - Текущая дата и время (например, 25.12.2025 14:30).</li>
                            <li><span class="variable-code">{bal}</span> - Ваш текущий баланс на FunPay.</li>
                            <li><span class="variable-code">{activesells}</span> - Количество ваших активных продаж.</li>
                            <li><span class="variable-code">{ai: ваш запрос}</span> - Вставляет текст, сгенерированный ИИ на основе вашего запроса. 
                                <br><em>Пример: <code>{ai: вежливо поблагодари за покупку}</code></em>
                            </li>
                        </ul>
                     </div>
                     
                     <div class="template-info image-upload-warning">
                        <span class="nav-icon material-symbols-rounded">image</span>
                        <span><b>Изображения в шаблонах:</b> Нажмите кнопку с иконкой изображения под текстом, чтобы прикрепить картинку. Появится плашка «Прикреплённое изображение» - нажмите на неё, чтобы выбрать порядок отправки (сначала текст, потом картинка - или наоборот). При отправке шаблона всё уйдёт в чат автоматически.</span>
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
                            <li><span class="variable-code">{buyername}</span> - Имя покупателя.</li>
                            <li><span class="variable-code">{lotname}</span> - Название купленного товара.</li>
                            <li><span class="variable-code">{orderid}</span> - Номер заказа.</li>
                            <li><span class="variable-code">{orderlink}</span> - Ссылка на заказ.</li>
                            <li><span class="variable-code">{date}</span> - Текущая дата.</li>
                            <li><span class="variable-code">{welcome}</span> - Приветствие по времени суток.</li>
                        </ul>
                    </div>
                    <div class="review-templates-grid">
                        <div class="template-container">
                            <label for="fpt-review-5" class="fpt-stars"><span class="material-symbols-rounded">star</span><span class="material-symbols-rounded">star</span><span class="material-symbols-rounded">star</span><span class="material-symbols-rounded">star</span><span class="material-symbols-rounded">star</span></label>
                            <textarea id="fpt-review-5" class="template-input" placeholder="Шаблон для 5 звёзд"></textarea>
                        </div>
                        <div class="template-container">
                            <label for="fpt-review-4" class="fpt-stars"><span class="material-symbols-rounded">star</span><span class="material-symbols-rounded">star</span><span class="material-symbols-rounded">star</span><span class="material-symbols-rounded">star</span></label>
                            <textarea id="fpt-review-4" class="template-input" placeholder="Шаблон для 4 звёзд"></textarea>
                        </div>
                        <div class="template-container">
                            <label for="fpt-review-3" class="fpt-stars"><span class="material-symbols-rounded">star</span><span class="material-symbols-rounded">star</span><span class="material-symbols-rounded">star</span></label>
                            <textarea id="fpt-review-3" class="template-input" placeholder="Шаблон для 3 звёзд"></textarea>
                        </div>
                        <div class="template-container">
                            <label for="fpt-review-2" class="fpt-stars"><span class="material-symbols-rounded">star</span><span class="material-symbols-rounded">star</span></label>
                            <textarea id="fpt-review-2" class="template-input" placeholder="Шаблон для 2 звёзд"></textarea>
                        </div>
                        <div class="template-container">
                            <label for="fpt-review-1" class="fpt-stars"><span class="material-symbols-rounded">star</span></label>
                            <textarea id="fpt-review-1" class="template-input" placeholder="Шаблон для 1 звезды"></textarea>
                        </div>
                    </div>
                    
                    <h3>Бонус за отзыв</h3>
                    <div class="checkbox-label-inline">
                        <input type="checkbox" id="bonusForReviewEnabled">
                        <label for="bonusForReviewEnabled" style="margin-bottom:0;"><span>Отправлять бонус в чат за отзыв 5 <span class="material-symbols-rounded" style="font-size:15px;vertical-align:-2px;color:#f4c84a;">star</span></span></label>
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
                    <div class="template-container" style="margin-top:8px;">
                        <label for="bonusForReviewDelaySec" style="display:block;margin-bottom:4px;">Задержка перед отправкой бонуса (сек)</label>
                        <input type="number" id="bonusForReviewDelaySec" class="template-input" min="0" max="60" step="1" value="4" style="max-width:120px;">
                        <p class="template-info">Пауза между ответом на отзыв и сообщением с бонусом. Без паузы ответ на отзыв в некоторых случаях может не отправиться. Рекомендуется 3-5 секунд.</p>
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
                    <button id="fp-bulk-edit-btn" class="btn btn-default" style="width:auto;padding:8px 16px;"><span class="material-symbols-rounded" style="font-size:16px;vertical-align:-3px;margin-right:5px;">edit</span>Массово изменить лоты</button>

                    <h4 style="margin-top: 30px;">Личные заметки к лотам</h4>
                    <p class="template-info">Заметки видны только тебе. Добавляй их через ПКМ по лоту (в профиле, на странице лота) или прямо в чате с покупателем. Здесь — все заметки сразу, даже к удалённым лотам.</p>
                    <button id="fp-open-notes-btn" class="btn btn-default" style="width:auto;padding:8px 16px;"><span class="material-symbols-rounded" style="font-size:16px;vertical-align:-3px;margin-right:5px;">sticky_note_2</span>Открыть все заметки</button>

                    <a href="#" id="convert-cardinal-lots-btn" style="display: block; text-align: center; margin-top: 25px; padding-top: 15px; border-top: 1px solid rgba(255,255,255,0.1); font-size: 13px; color: #a0a0a0; text-decoration: underline;">Конвертер лотов FunPay Cardinal → FunPay Tools</a>

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
                        <span style="font-size:12px;color:#5a5f7a;flex:1;">Готовые темы:</span>
                        <button id="fp-apply-dark-preset" class="btn btn-default" style="padding:3px 10px;font-size:12px;"><span class="material-symbols-rounded" style="font-size:15px;vertical-align:-3px;margin-right:4px;">dark_mode</span>Чёрная</button>
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
                            <div style="width:60px;height:3px;background:#1e2030;border-radius:2px;overflow:hidden;"><div id="fp-wp-bar" style="height:100%;width:0%;background:#C026D3;transition:width .15s linear;border-radius:2px;"></div></div>
                            <span id="fp-wp-pct" style="font-size:10px;color:#4a4f68;">0%</span>
                        </div>
                        <button id="fp-wp-apply-cur" style="position:absolute;top:6px;right:6px;background:rgba(192,38,211,.85);border:none;color:#fff;font-size:11px;font-weight:600;padding:4px 10px;border-radius:12px;cursor:pointer;z-index:2;display:none;">Применить</button>
                    </div>
                    <div id="fp-wp-desc" style="font-size:12px;color:#9aa0b8;margin:6px 0 2px;line-height:1.4;min-height:16px;"></div>
                    <div style="font-size:11px;color:#5a5f7a;margin:6px 0 12px;line-height:1.4;">Хотите добавить свою тему в этот каталог? Загрузите её в Telegram-боте <a href="https://t.me/FPToolsBot" target="_blank" rel="noopener noreferrer" style="color:#C026D3;">@FPToolsBot</a> → «Загрузить тему».</div>
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
                    <div class="setting-group"><h4 style="margin-top: 0;">Прозрачное меню FunPay Tools</h4><div class="checkbox-label-inline"><input type="checkbox" id="fptMenuTransparentEnabled"><label for="fptMenuTransparentEnabled" style="margin-bottom:0;"><span>Сделать меню прозрачным</span></label></div><small style="font-size:12px;opacity:0.7;display:block;margin-top:-10px;margin-bottom:8px;">Делает окно FunPay Tools прозрачным со стеклянным размытием.</small><div id="fptMenuTransparentControls" style="display:none;"><div class="template-container color-input-grid"><div><label for="fptMenuTintColor">Цвет фона:</label><input type="color" id="fptMenuTintColor" class="theme-color-input"></div></div></div></div>
                    <div class="setting-group" id="fptTextOutlineGroup"><h4 style="margin-top: 0;">Контур тексту</h4><div class="checkbox-label-inline"><input type="checkbox" id="fptTextOutlineEnabled"><label for="fptTextOutlineEnabled" style="margin-bottom:0;"><span>Включить контур буквам</span></label></div><small style="font-size:12px;opacity:0.7;display:block;margin-top:-10px;margin-bottom:8px;">Обводит все буквы в меню контуром для возможного повышения читаемости.</small><div id="fptTextOutlineControls" style="display:none;"><div class="template-container color-input-grid"><div><label for="fptTextOutlineColor">Цвет контура:</label><input type="color" id="fptTextOutlineColor" class="theme-color-input"></div></div><div class="template-container"><div class="range-label"><label for="fptTextOutlineWidth">Толщина:</label><span id="fptTextOutlineWidthValue">1px</span></div><input type="range" id="fptTextOutlineWidth" min="0" max="5" step="0.5"></div></div></div>
                    <div class="theme-actions-grid"><button id="enableMagicStickBtn" class="btn" style="grid-column: 1 / -1;"><span class="material-icons">auto_fix_normal</span><span>Включить режим редактора</span></button><button id="generatePaletteBtn" class="btn btn-default" style="display: flex; align-items: center; justify-content: center; gap: 8px;"><span class="material-icons" style="font-size: 18px;">auto_fix_high</span>цвета фона</button><button id="randomizeThemeBtn" class="btn btn-default" style="display: flex; align-items: center; justify-content: center; gap: 8px;"><span class="material-icons" style="font-size: 18px;">casino</span>рандом</button><button id="shareThemeBtn" class="btn btn-default" style="display: flex; align-items: center; justify-content: center; gap: 8px;"><span class="material-icons" style="font-size: 18px;">share</span>Поделиться темой</button><button id="exportThemeBtn" class="btn btn-default" title="Сохранить текущие настройки темы в файл (.fptheme)">Экспорт</button><button id="importThemeBtn" class="btn btn-default" title="Загрузить настройки темы из файла (.fptheme)">Импорт</button><input type="file" id="importThemeInput" accept=".fptheme" style="display: none;"><button id="resetThemeBtn" class="btn btn-default">СБРОСИТЬ ТЕМУ</button></div>
                </div>
                <div class="fp-tools-page-content" data-page="autobump">
                    <h3>Авто-поднятие лотов</h3>
                    <div class="checkbox-label-inline"><input type="checkbox" id="autoBumpEnabled"><label for="autoBumpEnabled" style="margin-bottom:0;"><span>Включить автоподнятие</span></label></div>
                    <small style="font-size:12px;opacity:0.75;display:block;margin-top:-10px;margin-left:30px;margin-bottom:8px;">Стабильно поднимает все лоты через FunPay API</small>

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
                <div class="fp-tools-page-content" data-page="global_chat">
                    <h3>Общий чат</h3>
                    <p class="template-info">Чат для пользователей расширения</p>
                    
                    <!-- ЗАМЕТКА С ПРАВИЛАМИ И ПРЕДУПРЕЖДЕНИЕМ -->
                    <div class="fpt-gc-disclaimer" style="flex-direction: column; gap: 10px;">
                        <div style="display:flex; align-items:flex-start; gap: 6px;">
                            <span class="material-symbols-rounded" style="color:#e05252;">shield</span>
                            <span>Это чат сообщества FP Tools. Будьте вежливы и уважайте других участников. За нарушения - блокировка в чате.</span>
                        </div>
                        <div style="background: rgba(0,0,0,0.2); border: 1px dashed rgba(224, 82, 82, 0.4); border-radius: 6px; padding: 10px; font-size: 11px;">
                            <b style="color: #ff6b6b; display: block; margin-bottom: 4px;">ЗАПРЕЩЕНО:</b>
                            Спам и флуд, реклама, оскорбления, разжигание, обман. Соблюдайте порядок - чат для общения по FP Tools.
                        </div>
                    </div>

                    <div id="fpt-gc-feed" class="fpt-gc-feed">
                        <div class="fpt-gc-loading">Загрузка сообщений…</div>
                    </div>
                    <div class="fpt-gc-composer">
                        <textarea id="fpt-gc-input" rows="1" placeholder="Сообщение…" maxlength="300"></textarea>
                        <button id="fpt-gc-send" type="button" class="fpt-gc-send-btn" title="Отправить"><span class="material-symbols-rounded">send</span></button>
                    </div>
                    <div id="fpt-gc-status" class="fpt-gc-status"></div>
                </div>
                <div class="fp-tools-page-content" data-page="calculator">
                    <h3>Калькулятор</h3>
                    <div class="calc-subtabs">
                        <button class="calc-subtab is-active" data-calc-mode="math"><span class="material-symbols-rounded">calculate</span><span>Обычный</span></button>
                        <button class="calc-subtab" data-calc-mode="time"><span class="material-symbols-rounded">schedule</span><span>Временной</span></button>
                    </div>
                    <div class="calc-pane" data-calc-pane="math">
                    <div class="calculator-container"><div class="calculator-display"><span id="calcDisplay">0</span></div><div class="calculator-buttons"><button class="calc-btn calc-btn-light" data-action="clear">AC</button><button class="calc-btn calc-btn-light" data-action="toggle-sign">+/-</button><button class="calc-btn calc-btn-light" data-action="percentage">%</button><button class="calc-btn calc-btn-operator" data-action="divide">÷</button><button class="calc-btn" data-key="7">7</button><button class="calc-btn" data-key="8">8</button><button class="calc-btn" data-key="9">9</button><button class="calc-btn calc-btn-operator" data-action="multiply">×</button><button class="calc-btn" data-key="4">4</button><button class="calc-btn" data-key="5">5</button><button class="calc-btn" data-key="6">6</button><button class="calc-btn calc-btn-operator" data-action="subtract">−</button><button class="calc-btn" data-key="1">1</button><button class="calc-btn" data-key="2">2</button><button class="calc-btn" data-key="3">3</button><button class="calc-btn calc-btn-operator" data-action="add">+</button><button class="calc-btn calc-btn-zero" data-key="0">0</button><button class="calc-btn" data-action="decimal">.</button><button class="calc-btn calc-btn-operator" data-action="calculate">=</button></div></div>
                    </div>
                    <div class="calc-pane" data-calc-pane="time" hidden>
                        <p class="template-info" style="margin-top:0;">Опишите ситуацию обычными словами - калькулятор посчитает время.</p>
                        <textarea id="calcTimeInput" class="template-input" rows="4" placeholder="Напр.: через 60 минут заказ, но на 5 минут отойду через 25 минут, а когда приду - 10-20 минут на дизайн. Сколько останется на подготовку?"></textarea>
                        <button id="calcTimeBtn" class="btn btn-default" style="margin-top:10px;width:100%;"><span class="material-symbols-rounded" style="vertical-align:middle;font-size:18px;">bolt</span> Посчитать</button>
                        <div id="calcTimeResult" class="calc-time-result" hidden></div>
                    </div>
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
                    <div class="feature-list-container"><h3>Справочник по функциям</h3><div class="feature-item"><div class="feature-title"><span class="material-icons">smart_toy</span>ИИ-Ассистент в чате</div><div class="feature-location"><strong>Где найти:</strong> В любом чате, кнопка "AI" рядом с полем ввода.</div><div class="feature-desc">Улучшает ваш текст, делая его вежливым и профессиональным. Активируйте режим и нажмите Enter для обработки. Также предупреждает о грубости.</div></div><div class="feature-item"><div class="feature-title"><span class="material-icons">auto_fix_high</span>AI-Генератор лотов</div><div class="feature-location"><strong>Где найти:</strong> На странице создания/редактирования лота.</div><div class="feature-desc">Создает название и описание для лота на основе ваших идей, анализируя и копируя стиль ваших существующих предложений.</div></div><div class="feature-item"><div class="feature-title"><span class="material-icons">add_photo_alternate</span>AI-Генератор изображений</div><div class="feature-location"><strong>Где найти:</strong> На странице создания/редактирования лота, в разделе "Изображения".</div><div class="feature-desc">Создавайте уникальные и стильные превью для ваших предложений с помощью встроенного генератора, в том числе по текстовому запросу.</div></div><div class="feature-item"><div class="feature-title"><span class="material-icons">palette</span>Полная кастомизация</div><div class="feature-location"><strong>Где найти:</strong> Вкладка "Кастомизация".</div><div class="feature-desc">Измените внешний вид FunPay: установите анимированный фон, настройте цвета, шрифты, прозрачность блоков и даже расположение верхней панели.</div></div><div class="feature-item"><div class="feature-title"><span class="material-icons">auto_fix_normal</span>"Кастомизатор (режим редактора)</div><div class="feature-location"><strong>Где найти:</strong> Вкладка "Кастомизация".</div><div class="feature-desc">Редактируйте любой элемент сайта в реальном времени. Меняйте цвета, размеры или скрывайте ненужное, сохраняя стили навсегда.</div></div><div class="feature-item"><div class="feature-title"><span class="material-icons">description</span>Шаблоны и AI-переменные</div><div class="feature-location"><strong>Где найти:</strong> Под полем ввода в чате. Настраиваются во вкладке "Шаблоны".</div><div class="feature-desc">Быстрая вставка готовых сообщений. Поддерживают переменные {buyername}, {date} и даже генерацию текста через {ai:ваш запрос}.</div></div><div class="feature-item"><div class="feature-title"><span class="material-icons">checklist</span>Управление лотами и ценами</div><div class="feature-location"><strong>Где найти:</strong> На странице вашего профиля (funpay.com/users/...).</div><div class="feature-desc">Кнопка "Выбрать" позволяет выделить несколько лотов для массового удаления, дублирования, отключения или редактирования цен.</div></div><div class="feature-item"><div class="feature-title"><span class="material-icons">control_point_duplicate</span>Клонирование лотов</div><div class="feature-location"><strong>Где найти:</strong> На странице редактирования любого вашего лота.</div><div class="feature-desc">Кнопка "Копировать" позволяет создать точную копию лота или массово размножить его по разным категориям (например, по разным серверам).</div></div><div class="feature-item"><div class="feature-title"><span class="material-icons">content_copy</span>Копировать лот со страницы заказа</div><div class="feature-location"><strong>Где найти:</strong> На странице купленного заказа (funpay.com/orders/...), кнопка под блоком "Оплаченный товар".</div><div class="feature-desc">Создаёт копию купленного лота через тот же мастер, что и обычное клонирование: подтягивает описание, автоматически переводит его на английский и, если у лота была автовыдача, сразу вставляет выданный товар в поле автовыдачи.</div></div><div class="feature-item"><div class="feature-title"><span class="material-icons">public</span>Глобальный импорт лотов</div><div class="feature-location"><strong>Где найти:</strong> На странице редактирования лота, кнопка "Импорт".</div><div class="feature-desc">Импортируйте название и описание любого лота с FunPay, чтобы анализировать конкурентов или использовать как основу.</div></div><div class="feature-item"><div class="feature-title"><span class="material-icons">sort_by_alpha</span>Сортировка по отзывам</div><div class="feature-location"><strong>Где найти:</strong> На любой странице со списком лотов.</div><div class="feature-desc">Кликните на заголовок "Продавец" в таблице, чтобы отсортировать все предложения по количеству отзывов у продавцов.</div></div><div class="feature-item"><div class="feature-title"><span class="material-icons">label</span>Пометки для пользователей</div><div class="feature-location"><strong>Где найти:</strong> В выпадающем меню в заголовке чата с человеком.</div><div class="feature-desc">Устанавливайте настраиваемые цветные метки для пользователей, которые будут видны в вашем списке контактов.</div></div><div class="feature-item"><div class="feature-title"><span class="material-icons">rocket_launch</span>Авто-поднятие лотов</div><div class="feature-location"><strong>Где найти:</strong> Вкладка "Авто-поднятие".</div><div class="feature-desc">Настройте автоматическое поднятие лотов по таймеру. Можно выбрать для поднятия только определенные категории.</div></div><div class="feature-item"><div class="feature-title"><span class="material-icons">monitoring</span>Статистика</div><div class="feature-location"><strong>Где найти:</strong> Страница "Продажи" - статистика продаж, кнопка "Аналитика рынка" на странице игры.</div><div class="feature-desc">Получайте детальную статистику по своим продажам и анализируйте рыночную ситуацию в любой категории.</div></div><div class="feature-item"><div class="feature-title"><span class="material-icons">savings</span>Финансовые копилки</div><div class="feature-location"><strong>Где найти:</strong> Вкладка "Копилки" и иконка в шапке сайта.</div><div class="feature-desc">Устанавливайте финансовые цели и отслеживайте их достижение. Копилка синхронизируется с балансом FunPay.</div></div></div>
                </div>
                <div class="fp-tools-page-content" data-page="ai_audit">
                    <h3>ИИ-аудит лотов</h3>

                    <!-- START STATE -->
                    <div id="fp-audit-start-wrap">
                        <p class="template-info">ИИ прочитает все ваши лоты и последние 30 отзывов, сгенерирует ~40 вопросов и на основе ваших ответов выдаст конкретные рекомендации.</p>
                        <div class="support-promo" style="background:rgba(192,38,211,0.07);border-color:rgba(192,38,211,0.2);margin-bottom:16px;">
                            <span class="material-symbols-rounded" style="font-size:16px;color:#f4c84a;vertical-align:-3px;">lightbulb</span>
                            <span>Вопросы будут именно о ваших лотах - ИИ внимательно их изучит перед генерацией.</span>
                        </div>
                        <button id="fp-audit-start-btn" class="btn" style="width:100%;padding:12px;"><span class="material-symbols-rounded" style="font-size:18px;vertical-align:-4px;margin-right:6px;">search_insights</span>Начать аудит</button>
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
                            <div id="fp-audit-progress-bar" style="height:100%;background:#C026D3;width:0;transition:width .3s;border-radius:2px;"></div>
                        </div>
                        <div id="fp-audit-q-container" style="min-height:120px;"></div>
                        <div style="display:flex;gap:8px;margin-top:16px;">
                            <button id="fp-audit-prev-btn" class="btn btn-default" style="flex:1;">← Назад</button>
                            <button id="fp-audit-next-btn" class="btn" style="flex:2;">Далее →</button>
                        </div>
                    </div>

                    <!-- PROCESSING STATE -->
                    <div id="fp-audit-processing" style="display:none;text-align:center;padding:30px 0;color:#5a5f7a;font-size:13px;">
                        ИИ анализирует ваши ответы и готовит рекомендации...
                    </div>

                    <!-- RESULTS STATE -->
                    <div id="fp-audit-results" style="display:none;overflow-y:auto;max-height:460px;padding-right:4px;"></div>
                </div>

                <div class="fp-tools-page-content" data-page="settings_io">
                    <h3>Импорт и экспорт настроек</h3>
                    <p class="template-info">Сохраните все настройки FunPay Tools в файл и восстановите на другом устройстве или аккаунте.</p>
                    <div style="display:flex;gap:12px;margin-bottom:20px;">
                        <button id="fp-settings-export-btn" class="btn" style="flex:1;"><span class="material-symbols-rounded" style="font-size:16px;vertical-align:-3px;margin-right:5px;">upload</span>Экспортировать настройки</button>
                        <button id="fp-settings-import-btn" class="btn btn-default" style="flex:1;"><span class="material-symbols-rounded" style="font-size:16px;vertical-align:-3px;margin-right:5px;">download</span>Импортировать настройки</button>
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
                        <a href="https://funpay.tools" target="_blank" class="fp-site-footer-link"><span class="material-symbols-rounded" style="font-size:14px;vertical-align:-2px;margin-right:4px;">link</span>funpay.tools</a>
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
                    <div class="support-promo" style="background:rgba(192,38,211,0.07);border-color:rgba(192,38,211,0.2);margin-bottom:16px;">
                        <span class="material-symbols-rounded" style="font-size:16px;color:#f4c84a;vertical-align:-3px;">lightbulb</span>
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
                    <p class="template-info">Выберите лот для настройки авто-выдачи. Если лот не настроен - отправляется содержимое поля «Секреты» автоматически.</p>
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
                        .fp-tkt-card:hover{border-color:#C026D3;background:#11122a;}
                        .fp-tkt-status{display:inline-block;padding:2px 7px;border-radius:10px;font-size:10px;font-weight:700;letter-spacing:.3px;}
                        #fp-new-ticket-fields::-webkit-scrollbar{width:4px}
                        #fp-new-ticket-fields::-webkit-scrollbar-track{background:transparent}
                        #fp-new-ticket-fields::-webkit-scrollbar-thumb{background:#2a2d44;border-radius:4px}
                        .fp-field-input{width:100%;background:#0d0e18;border:1px solid #1a1c2e;border-radius:6px;color:#d8dae8;padding:7px 10px;font-size:13px;box-sizing:border-box;outline:none;transition:border-color .15s;}
                        .fp-field-input:focus{border-color:#C026D3;}
                        .fp-field-input option{background:#0d0e18;color:#d8dae8;}
                    </style>

                    <!-- Header -->
                    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">
                        <h3 style="margin:0;font-size:15px;">Техподдержка FunPay</h3>
                        <button id="fp-ticket-refresh-btn" title="Обновить" style="background:none;border:none;color:#5a5f7a;cursor:pointer;font-size:16px;padding:2px 6px;transition:color .15s;" onmouseover="this.style.color='#d8dae8'" onmouseout="this.style.color='#5a5f7a'">↻</button>
                    </div>

                    <!-- Auto ticket block -->
                    <div style="background:rgba(192,38,211,0.06);border:1px solid rgba(192,38,211,0.18);border-radius:8px;padding:11px 12px;margin-bottom:12px;">
                        <div style="font-weight:600;font-size:13px;margin-bottom:4px;color:#f0c4ff;"><span class="material-symbols-rounded" style="font-size:15px;vertical-align:-3px;margin-right:5px;">mail</span>Подтверждение заказов</div>
                        <p style="font-size:12px;color:#6a7090;margin:0 0 10px;line-height:1.5;">FunPay не всегда подтверждает заказы автоматически. Кнопка ниже соберёт все ваши неподтверждённые заказы и отправит заявку в ТП с просьбой их подтвердить - вручную делать не надо.</p>
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

                    <!-- Filters (поиск + статус + сортировка) - фильтрация локальная, все заявки грузятся сразу -->
                    <div style="display:flex;flex-direction:column;gap:6px;margin-bottom:8px;">
                        <input type="text" id="fp-tickets-search" placeholder="Поиск по заявкам..." class="fp-field-input" style="padding:6px 8px;font-size:12px;width:100%;box-sizing:border-box;">
                        <div style="display:flex;gap:8px;">
                            <select id="fp-tickets-status-filter" class="fp-field-input" style="padding:5px 8px;font-size:12px;flex:1;">
                                <option value="all" selected>Все</option>
                                <option value="active">Актуальные</option>
                                <option value="solved">Закрытые</option>
                            </select>
                            <select id="fp-tickets-sort" class="fp-field-input" style="padding:5px 8px;font-size:12px;flex:1;">
                                <option value="newest_first" selected>Сначала новые</option>
                                <option value="oldest_first">Сначала старые</option>
                                <option value="last_answered">Последние отвеченные</option>
                            </select>
                        </div>
                        <span id="fp-tickets-count" style="font-size:11px;color:#3a3d52;"></span>
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
                            #fp-tri{outline:none;caret-color:#C026D3;background:#23243a !important;border:none !important;box-shadow:none !important;border-radius:0 !important;padding:0 !important;margin:0 !important;}
                            #fp-tri::-webkit-scrollbar{width:2px}
                            #fp-tri::-webkit-scrollbar-thumb{background:#2a2d3a;}
                            .fp-msg-img{max-width:100%;border-radius:8px;margin-top:4px;display:block;cursor:pointer;}
                        </style>
                        <!-- Top bar -->
                        <div style="display:flex;align-items:center;gap:10px;padding:8px 12px;background:#1a1b22;flex-shrink:0;border-bottom:1px solid #0d0e14;">
                            <button id="fp-ticket-detail-back" style="all:unset;position:relative;overflow:hidden;color:#C026D3;cursor:pointer;font-size:22px;line-height:1;padding:2px 6px 2px 0;flex-shrink:0;">&#8249;</button>
                            <div id="fp-tkt-av" style="width:32px;height:32px;border-radius:50%;background:#23243a;flex-shrink:0;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;color:#C026D3;overflow:hidden;"></div>
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
                            <button id="fp-ticket-reply-btn" style="all:unset;position:relative;overflow:hidden;display:flex;align-items:center;justify-content:center;width:36px;height:36px;border-radius:50%;background:#C026D3;cursor:pointer;flex-shrink:0;">
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
                    <h3>Оставьте отзыв! <span class="material-symbols-rounded" style="color:#f4c84a;vertical-align:-3px;">star</span></h3>
                    <div class="support-container">
                        <p>Это <strong>самый важный</strong> вклад, который вы можете сделать. Ваш положительный отзыв - это топливо для новых обновлений и лучшая мотивация для разработчика.</p>
                        <p>Хорошие оценки помогают другим пользователям найти FP Tools. Пожалуйста, уделите всего минуту, чтобы поделиться своим мнением. Это действительно имеет огромное значение!</p>
                        <a href="https://chromewebstore.google.com/detail/funpay-tools/pibmnjjfpojnakckilflcboodkndkibb/reviews" target="_blank" class="btn review-btn"><span class="material-icons" style="font-size: 20px; margin-right: 8px;">rate_review</span>Оставить отзыв в Chrome Store</a>
                    </div>
                    <div style="margin-top:24px;text-align:center;border-top:1px solid rgba(255,255,255,0.06);padding-top:16px;">
                        <a href="https://funpay.tools" target="_blank" class="fp-site-footer-link"><span class="material-symbols-rounded" style="font-size:14px;vertical-align:-2px;margin-right:4px;">link</span>funpay.tools</a>
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

// --- Каталог готовых ТЕМ (.fptheme) с GitHub ------------------------------
// Ленивая загрузка: index.json тянется ОДИН раз при первом открытии вкладки,
// превью каждой темы грузится по одному (только текущий слайд карусели),
// сам .fptheme качается только в момент нажатия «Применить». Ничего не
// предзагружается — трафик не жрётся.
const FP_THEME_GH_USER   = 'XaviersDev';
const FP_THEME_GH_REPO   = 'fpt-themes';
const FP_THEME_GH_BRANCH = 'main';
const FP_THEME_RAW_BASE  = `https://raw.githubusercontent.com/${FP_THEME_GH_USER}/${FP_THEME_GH_REPO}/${FP_THEME_GH_BRANCH}/`;
const FP_THEME_INDEX_URL = FP_THEME_RAW_BASE + 'index.json';

let _fpThemeCatalog = null;   // массив тем после загрузки index.json
let _fpThemeCatalogLoaded = false;

function _fpThemeResolveUrl(u) {
    if (!u) return '';
    if (/^https?:\/\//i.test(u)) return u;
    return FP_THEME_RAW_BASE + String(u).replace(/^\/+/, '');
}

async function _fpLoadThemeCatalog() {
    if (_fpThemeCatalogLoaded) return _fpThemeCatalog;
    try {
        const resp = await fetch(FP_THEME_INDEX_URL, { cache: 'no-store' });
        if (!resp.ok) throw new Error('HTTP ' + resp.status);
        const data = await resp.json();
        const list = Array.isArray(data) ? data : (Array.isArray(data.themes) ? data.themes : []);
        _fpThemeCatalog = list.filter(t => t && t.file).map(t => ({
            name: t.name || 'Без названия',
            desc: t.desc || t.description || '',
            author: t.author || '',
            previewUrl: _fpThemeResolveUrl(t.preview || ''),
            fileUrl: _fpThemeResolveUrl(t.file),
        }));
    } catch (e) {
        console.error('FP Tools: не удалось загрузить каталог тем', e);
        _fpThemeCatalog = null; // отличаем «ошибка» от «пусто»
    }
    _fpThemeCatalogLoaded = true;
    return _fpThemeCatalog;
}

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
    const catalog = _fpThemeCatalog;
    if (!catalog || !catalog.length) return;
    const theme = catalog[index];
    if (!theme) return;
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

    nameEl.textContent  = theme.name + (theme.author ? `  ·  ${theme.author}` : '');
    counter.textContent = `${index + 1} / ${catalog.length}`;
    emoji.textContent   = '🎨';
    const descEl = document.getElementById('fp-wp-desc');
    if (descEl) descEl.textContent = theme.desc || '';
    if (applyBtn) applyBtn.style.display = 'none';

    // Нет превью у темы — показываем заглушку, но «Применить» доступна.
    if (!theme.previewUrl) {
        slot.innerHTML = '<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:#5a5f7a;font-size:12px;">Без превью</div>';
        if (loaderEl) loaderEl.style.display = 'none';
        if (applyBtn) applyBtn.style.display = 'block';
        _wpLoading = false;
        return;
    }

    if (_fpWpImgCache.has(theme.previewUrl)) {
        const img = _fpWpImgCache.get(theme.previewUrl).cloneNode();
        _showCarouselImg(img, slot, loaderEl);
        _wpLoading = false;
        return;
    }

    loaderEl.style.display = 'flex';
    slot.innerHTML = '';
    bar.style.width = '0%'; pct.textContent = '0%';

    const storageCache = await _getWpCache();
    const cached = storageCache[theme.previewUrl] && Date.now() - storageCache[theme.previewUrl].ts < FP_WP_CACHE_TTL;

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
    img.src = theme.previewUrl;

    try {
        await img.decode();
        if (slot._fakeIv) { clearInterval(slot._fakeIv); delete slot._fakeIv; }
        bar.style.width = '100%'; pct.textContent = '100%';
        _fpWpImgCache.set(theme.previewUrl, img);
        if (!cached) _markWpCached(theme.previewUrl);
        _showCarouselImg(img.cloneNode(), slot, loaderEl);
    } catch {
        // превью не загрузилось — показываем заглушку, но не скипаем тему,
        // чтобы её всё равно можно было применить
        if (slot._fakeIv) { clearInterval(slot._fakeIv); delete slot._fakeIv; }
        slot.innerHTML = '<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:#5a5f7a;font-size:12px;">Превью недоступно</div>';
        if (loaderEl) loaderEl.style.display = 'none';
        if (applyBtn) applyBtn.style.display = 'block';
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

async function initializeWallpaperPresets() {
    const carousel = document.getElementById('fp-wallpaper-carousel');
    if (!carousel || carousel.dataset.initialized) return;
    carousel.dataset.initialized = '1';

    const loaderEl = document.getElementById('fp-wp-loader');
    const slot     = document.getElementById('fp-wp-img-slot');
    const nameEl   = document.getElementById('fp-wp-name');
    const emoji    = document.getElementById('fp-wp-emoji');
    if (loaderEl) loaderEl.style.display = 'flex';
    if (emoji) emoji.textContent = '⏳';
    if (nameEl) nameEl.textContent = 'Загрузка каталога…';

    // Лениво грузим index.json ровно один раз (вкладка уже открыта).
    await _fpLoadThemeCatalog();

    const _descEl0 = document.getElementById('fp-wp-desc');
    if (_descEl0) _descEl0.textContent = '';

    if (_fpThemeCatalog === null) {
        // ошибка сети/каталога
        if (slot) slot.innerHTML = '<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:#5a5f7a;font-size:12px;text-align:center;padding:10px;">Не удалось загрузить каталог тем.<br>Проверьте интернет и переоткройте вкладку.</div>';
        if (loaderEl) loaderEl.style.display = 'none';
        carousel.dataset.initialized = ''; // позволить повторную попытку
        return;
    }
    if (!_fpThemeCatalog.length) {
        if (slot) slot.innerHTML = '<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:#5a5f7a;font-size:12px;text-align:center;padding:10px;">Каталог пока пуст.<br>Темы добавляются через @FPToolsBot.</div>';
        if (loaderEl) loaderEl.style.display = 'none';
        return;
    }

    _wpIndex = 0;
    _loadCarouselSlide(0);

    document.getElementById('fp-wp-prev')?.addEventListener('click', () => {
        if (_wpLoading || !_fpThemeCatalog || !_fpThemeCatalog.length) return;
        _wpIndex = (_wpIndex - 1 + _fpThemeCatalog.length) % _fpThemeCatalog.length;
        _loadCarouselSlide(_wpIndex);
    });
    document.getElementById('fp-wp-next')?.addEventListener('click', () => {
        if (_wpLoading || !_fpThemeCatalog || !_fpThemeCatalog.length) return;
        _wpIndex = (_wpIndex + 1) % _fpThemeCatalog.length;
        _loadCarouselSlide(_wpIndex);
    });
    document.getElementById('fp-wp-apply-cur')?.addEventListener('click', () => {
        const theme = _fpThemeCatalog && _fpThemeCatalog[_wpIndex];
        if (theme) applyThemeFromCatalog(theme);
    });
    document.getElementById('fp-apply-dark-preset')?.addEventListener('click', applyBlackThemePreset);
}

// Скачивает .fptheme выбранной темы и применяет её (тот же путь, что ручной импорт).
async function applyThemeFromCatalog(theme) {
    const applyBtn = document.getElementById('fp-wp-apply-cur');
    if (!theme || !theme.fileUrl) return;
    const oldText = applyBtn ? applyBtn.textContent : '';
    if (applyBtn) { applyBtn.textContent = 'Применяю…'; applyBtn.disabled = true; }
    try {
        const resp = await fetch(theme.fileUrl, { cache: 'no-store' });
        if (!resp.ok) throw new Error('HTTP ' + resp.status);
        const text = await resp.text();
        let data;
        try { data = JSON.parse(text); }
        catch { throw new Error('файл темы повреждён'); }
        if (!data || typeof data !== 'object' || !data.bgColor1 || !data.font) {
            throw new Error('неверный формат темы');
        }

        // Тот же контракт, что и при ручном импорте .fptheme.
        const newTheme = { ...data, enableCustomTheme: true };
        await chrome.storage.local.set({ fpToolsTheme: newTheme, enableCustomTheme: true });

        if (typeof applyCustomTheme === 'function') await applyCustomTheme();
        if (typeof applyHeaderPosition === 'function') await applyHeaderPosition();
        if (typeof updateThemePreview === 'function') await updateThemePreview();
        // отметить чекбокс «Включить кастомную тему», если он есть
        const chk = document.getElementById('enableCustomThemeCheckbox');
        if (chk) chk.checked = true;

        if (typeof showNotification === 'function') showNotification(`Тема «${theme.name}» применена!`);
    } catch (e) {
        if (typeof showNotification === 'function') showNotification(`Не удалось применить тему: ${e.message}`, true);
        console.error('FP Tools: apply theme from catalog error', e);
    } finally {
        if (applyBtn) { applyBtn.textContent = oldText || 'Применить'; applyBtn.disabled = false; }
    }
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
            if (pageId === 'epic_nicks') { if (typeof renderEpicPreviews === 'function') renderEpicPreviews(); }
            if (pageId === 'currency_calc') initializeCurrencyCalculator();
            if (pageId === 'notes') { if (typeof initializeNotes === 'function') initializeNotes(); }
            if (pageId === 'global_chat') { if (typeof initializeGlobalChat === 'function') initializeGlobalChat(); }
            if (pageId === 'templates') { if (typeof setupTemplateSettingsHandlers === 'function') setupTemplateSettingsHandlers(); }
            if (pageId === 'piggy_banks') { if (typeof renderPiggyBankSettings === 'function') renderPiggyBankSettings(); }
            if (pageId === 'lot_io') { if (typeof initializeLotIO === 'function') initializeLotIO(); }
            if (pageId === 'auto_review') { if (typeof initializeAutoReviewUI === 'function') initializeAutoReviewUI(); }
            if (pageId === 'needs') { if (typeof initializeNeedsTab === 'function') initializeNeedsTab(); }
            if (pageId === 'slash_commands') { if (typeof initializeSlashCommandsUI === 'function') initializeSlashCommandsUI(); }
            if (pageId === 'telegram') { if (typeof initializeTelegramUI === 'function') initializeTelegramUI(); }
            if (pageId === 'blacklist') { if (typeof initializeBlacklist === 'function') initializeBlacklist(); }
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

    compactNav(toolsPopup);
    attachAutoReplyImageButtons(toolsPopup);

    // Общий чат: подтянуть удалённый конфиг и сразу применить видимость вкладки.
    // Если чат выключен/скрыт на GitHub - юзер увидит это без обновления расширения.
    if (typeof fptGcRefreshConfig === 'function') {
        fptGcRefreshConfig(false).then(() => {
            if (typeof fptGcApplyVisibility === 'function') fptGcApplyVisibility();
        });
    }
}

// 3.0: add an image-insert button to every autoreply textarea (greeting, keyword responses,
// review templates, bonus, new-order, order-confirm). Inserts an [image:...] tag at the caret;
// the background sender uploads & sends it in order. This is "картинки во все автоответы".
function attachAutoReplyImageButtons(toolsPopup) {
    const ids = ['greetingText', 'newOrderReplyText', 'orderConfirmReplyText', 'singleBonusText',
                 'newKeywordResponse',
                 'fpt-review-5', 'fpt-review-4', 'fpt-review-3', 'fpt-review-2', 'fpt-review-1'];
    ids.forEach(id => {
        const ta = toolsPopup.querySelector('#' + (window.CSS && CSS.escape ? CSS.escape(id) : id));
        if (!ta || ta.dataset.fptImgBtn) return;
        ta.dataset.fptImgBtn = '1';
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'btn fpt-img-btn fpt-autoreply-img-btn';
        btn.title = 'Вставить изображение';
        btn.innerHTML = '<span class="material-symbols-rounded">image</span>';
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            if (typeof handleImageAddClick === 'function') handleImageAddClick(ta);
        });
        // place the button right after the textarea
        if (ta.parentNode) {
            ta.insertAdjacentElement('afterend', btn);
        }
    });
    // keyword rule responses are dynamic - delegate
    if (!toolsPopup.dataset.fptKwImgDelegated) {
        toolsPopup.dataset.fptKwImgDelegated = '1';
        toolsPopup.addEventListener('click', (e) => {
            const b = e.target.closest('.fpt-keyword-img-btn');
            if (!b) return;
            e.preventDefault();
            const row = b.closest('.keyword-rule, .keyword-item') || b.parentElement;
            const ta = row && row.querySelector('textarea');
            if (ta && typeof handleImageAddClick === 'function') handleImageAddClick(ta);
        });
    }
}

// Auto-compaction: in the 2-column nav grid, stretch the last button of any section that
// would otherwise leave a gap (odd count, or a lone button) so the layout never looks empty.
function compactNav(toolsPopup) {
    const ul = toolsPopup.querySelector('.fp-tools-nav ul');
    if (!ul) return;
    const children = Array.from(ul.children);
    let group = [];
    const flush = () => {
        // clear previous wide flags in this group
        group.forEach(li => li.classList.remove('fpt-nav-wide'));
        if (group.length && group.length % 2 === 1) {
            // odd count → stretch the last one across both columns
            group[group.length - 1].classList.add('fpt-nav-wide');
        }
        group = [];
    };
    for (const li of children) {
        if (li.classList.contains('fp-nav-divider')) { flush(); continue; }
        if (li.dataset.page) group.push(li);
    }
    flush();
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

    // 3.0.6.2: the observer used to fire chrome.storage.local.set on EVERY inline-style
    // mutation of the popup - including the left/top updates during drag and any transient
    // hover-driven style writes. That produced a storm of async storage writes (lag) and,
    // combined with the close-btn scale transition, a visible flicker when the cursor moved
    // between the ✕ and the title. Now: debounce, and only persist when width/height
    // actually changed.
    let __fptLastW = popupEl.style.width;
    let __fptLastH = popupEl.style.height;
    let __fptSizeSaveTimer = null;
    const resizeObserver = new MutationObserver(() => {
        const newWidth = popupEl.style.width;
        const newHeight = popupEl.style.height;
        if (newWidth === __fptLastW && newHeight === __fptLastH) return; // size unchanged → ignore
        __fptLastW = newWidth;
        __fptLastH = newHeight;
        if (__fptSizeSaveTimer) clearTimeout(__fptSizeSaveTimer);
        __fptSizeSaveTimer = setTimeout(() => {
            if (chrome.runtime?.id) {
                chrome.storage.local.set({ fpToolsPopupSize: { width: newWidth, height: newHeight } });
            }
        }, 300);
    });
    resizeObserver.observe(popupEl, { attributes: true, attributeFilter: ['style'] });
}