// background/telegram.js
// =============================================================================
// Управление FP Tools из Telegram + уведомления.
//
// ВАЖНО (Chrome Web Store): мы используем ТОЛЬКО официальный Telegram Bot API по
// HTTPS (api.telegram.org). Это передача данных, а не загрузка/исполнение
// удалённого кода (RHC), поэтому политика CWS это допускает - точно так же, как
// уже работающие в расширении вебхуки Discord. Никакой код не подгружается извне.
//
// Хранилище: chrome.storage.local.fpToolsTelegram = {
//   enabled: bool,
//   token: '<bot token>',
//   chatId: '<resolved chat id>',     // куда слать уведомления / кого слушать
//   notifyMessages: bool,             // новые сообщения в чатах
//   notifyOrders: bool,               // новые заказы
//   allowControl: bool,               // разрешить команды управления из бота
//   lastUpdateId: number              // offset для getUpdates (long-poll)
// }
//
// Экспортирует функции, которые вызываются из background.js (alarms + onChanged).
// Реальную выборку чатов/заказов и поднятие лотов выполняет background.js -
// чтобы не дублировать auth/runner-логику, telegram.js дергает переданные
// колбэки (deps).
// =============================================================================

const TELEGRAM_ALARM = 'fpToolsTelegramPoll';
const TG_STORE = 'fpToolsTelegram';
const TG_PROCESSED = 'fpToolsTelegramProcessedIds';

let _deps = null; // { getAuth, getChatList, getOrders, runBump, getProfileInfo }
let _polling = false;

const TG_DEFAULTS = {
    enabled: false,
    token: '',
    chatId: '',
    notifyMessages: true,
    notifyOrders: true,
    allowControl: true,
    pollInterval: 1,
    lastUpdateId: 0
};

async function tgGet() {
    const r = await chrome.storage.local.get(TG_STORE);
    return Object.assign({}, TG_DEFAULTS, r[TG_STORE] || {});
}
async function tgSet(patch) {
    const cur = await tgGet();
    const next = Object.assign({}, cur, patch);
    await chrome.storage.local.set({ [TG_STORE]: next });
    return next;
}

function tgApi(token, method, params) {
    const url = `https://api.telegram.org/bot${encodeURIComponent(token)}/${method}`;
    return fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params || {})
    }).then(r => r.json());
}

function tgEscape(s) {
    return String(s == null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

async function tgSendMessage(text, extra) {
    const cfg = await tgGet();
    if (!cfg.token || !cfg.chatId) return { ok: false, error: 'no token/chatId' };
    return tgApi(cfg.token, 'sendMessage', Object.assign({
        chat_id: cfg.chatId,
        text,
        parse_mode: 'HTML',
        disable_web_page_preview: true
    }, extra || {}));
}

// Проверка токена + (опц.) автоопределение chatId через getUpdates.
// Возвращает { ok, botName, chatId } или { ok:false, error }.
async function telegramValidateAndResolve(token) {
    try {
        const me = await tgApi(token, 'getMe', {});
        if (!me.ok) return { ok: false, error: me.description || 'Неверный токен бота.' };
        const botName = me.result.username ? '@' + me.result.username : me.result.first_name;

        // Пытаемся найти chatId из последних апдейтов (пользователь должен написать боту).
        let chatId = '';
        const upd = await tgApi(token, 'getUpdates', { timeout: 0, limit: 10 });
        if (upd.ok && Array.isArray(upd.result)) {
            for (let i = upd.result.length - 1; i >= 0; i--) {
                const m = upd.result[i].message || upd.result[i].edited_message;
                if (m && m.chat && m.chat.id) { chatId = String(m.chat.id); break; }
            }
        }
        return { ok: true, botName, chatId };
    } catch (e) {
        return { ok: false, error: e.message };
    }
}

// ── Команды управления из Telegram ───────────────────────────────────────────
async function handleTelegramCommand(text, cfg) {
    const raw = (text || '').trim();
    const cmd = raw.split(/\s+/)[0].replace(/@\w+$/, '').toLowerCase(); // /status@bot -> /status

    if (cmd === '/start' || cmd === '/help') {
        await tgSendMessage(
            '<b>FP Tools - управление</b>\n\n' +
            '/status - статус и баланс\n' +
            '/chats - непрочитанные чаты\n' +
            '/sales - статистика продаж\n' +
            '/online - поддержать онлайн\n' +
            '/help - это сообщение\n\n' +
            'Уведомления о новых заказах и сообщениях приходят автоматически (если включены в расширении).'
        );
        return;
    }

    if (!cfg.allowControl) {
        if (cmd.startsWith('/')) await tgSendMessage('Управление через бота отключено в настройках FP Tools.');
        return;
    }

    try {
        if (cmd === '/status') {
            const info = _deps && _deps.getProfileInfo ? await _deps.getProfileInfo() : null;
            if (info) {
                await tgSendMessage(
                    `<b>FP Tools статус</b>\n` +
                    `Пользователь: ${tgEscape(info.username || '-')}\n` +
                    `Баланс: ${tgEscape(info.balance || '-')}\n` +
                    `Активных продаж/заказов: ${tgEscape(String(info.activeOrders ?? '-'))}`
                );
            } else {
                await tgSendMessage('Не удалось получить статус (нет авторизации на FunPay?).');
            }
            return;
        }

        if (cmd === '/chats') {
            const chats = _deps && _deps.getChatList ? await _deps.getChatList() : null;
            if (chats && chats.length) {
                const unread = chats.filter(c => c.isUnread || (c.nodeMsg != null && c.userMsg != null && c.nodeMsg > c.userMsg));
                if (!unread.length) { await tgSendMessage('Непрочитанных чатов нет.'); return; }
                const body = unread.slice(0, 10).map(c =>
                    `• <b>${tgEscape(c.chatName || 'Чат')}</b>\n  ${tgEscape((c.messageText || '').slice(0, 80))}`
                ).join('\n');
                await tgSendMessage(`<b>Непрочитанные чаты (${unread.length}):</b>\n${body}`);
            } else {
                await tgSendMessage('Чаты не найдены или нет доступа.');
            }
            return;
        }

        if (cmd === '/sales') {
            const s = _deps && _deps.getSalesSummary ? await _deps.getSalesSummary() : null;
            if (s) {
                await tgSendMessage(
                    `<b>Статистика продаж</b>\n` +
                    `За сегодня: ${tgEscape(String(s.today.count))} зак. · ${tgEscape(s.today.revenue)}\n` +
                    `За 7 дней: ${tgEscape(String(s.week.count))} зак. · ${tgEscape(s.week.revenue)}\n` +
                    `За 30 дней: ${tgEscape(String(s.month.count))} зак. · ${tgEscape(s.month.revenue)}\n` +
                    `Всего: ${tgEscape(String(s.all.count))} зак. · ${tgEscape(s.all.revenue)}`
                );
            } else {
                await tgSendMessage('Нет данных о продажах. Откройте «Мои продажи» в расширении, чтобы собрать статистику.');
            }
            return;
        }


        if (cmd === '/online') {
            let ok = false;
            if (_deps && _deps.keepOnline) ok = await _deps.keepOnline();
            await tgSendMessage(ok ? 'Онлайн обновлён ✅' : 'Не удалось обновить онлайн.');
            return;
        }

        if (cmd.startsWith('/')) {
            await tgSendMessage('Неизвестная команда. /help - список команд.');
        }
    } catch (e) {
        await tgSendMessage('Ошибка выполнения команды: ' + tgEscape(e.message));
    }
}

// ── Уведомления (новые сообщения / заказы) ────────────────────────────────────
async function telegramNotifyNewMessages(chats) {
    const cfg = await tgGet();
    if (!cfg.enabled || !cfg.notifyMessages || !cfg.token || !cfg.chatId) return;

    const { [TG_PROCESSED]: processedArr } = await chrome.storage.local.get(TG_PROCESSED);
    const processed = new Set(processedArr || []);
    const seededKey = 'fpToolsTelegramSeeded';
    const { [seededKey]: seeded } = await chrome.storage.local.get(seededKey);
    const firstRun = !seeded;

    let changed = false;
    for (const chat of chats || []) {
        const genuinelyNew = (chat.nodeMsg != null && chat.userMsg != null)
            ? (chat.nodeMsg > chat.userMsg) : chat.isUnread;
        if (!genuinelyNew) continue;
        const id = 'm' + chat.msgId;
        if (processed.has(id)) continue;
        if (!firstRun) {
            await tgSendMessage(
                `💬 <b>Новое сообщение</b>\n` +
                `От: ${tgEscape(chat.chatName || 'Покупатель')}\n` +
                `${tgEscape((chat.messageText || '').slice(0, 300))}`,
                {
                    reply_markup: {
                        inline_keyboard: [[
                            { text: 'Открыть чат', url: `https://funpay.com/chat/?node=${chat.chatId}` }
                        ]]
                    }
                }
            );
        }
        processed.add(id);
        changed = true;
    }

    if (changed || firstRun) {
        let arr = Array.from(processed);
        if (arr.length > 300) arr = arr.slice(-300);
        await chrome.storage.local.set({ [TG_PROCESSED]: arr, [seededKey]: true });
    }
}

async function telegramNotifyNewOrders(orders) {
    const cfg = await tgGet();
    if (!cfg.enabled || !cfg.notifyOrders || !cfg.token || !cfg.chatId) return;

    const list = Array.isArray(orders) ? orders.filter(o => o && o.id) : [];
    // Защита от спама: пустой/неудачный запрос НЕ должен «засеивать» пустое
    // состояние, иначе при следующем успешном опросе все заказы посыплются как новые.
    if (!list.length) return;

    const key = 'fpToolsTelegramProcessedOrders';
    const seededKey = 'fpToolsTelegramOrdersSeeded';
    const { [key]: processedArr } = await chrome.storage.local.get(key);
    const { [seededKey]: seeded } = await chrome.storage.local.get(seededKey);
    const processed = new Set(processedArr || []);
    const firstRun = !seeded;

    let changed = false;
    for (const o of list) {
        if (processed.has(o.id)) continue;
        if (!firstRun) {
            await tgSendMessage(
                `🛒 <b>Новый заказ</b>\n` +
                `${tgEscape(o.title || '')}\n` +
                `Покупатель: ${tgEscape(o.buyer || '-')}\n` +
                `Сумма: ${tgEscape(o.price || '-')}`,
                o.link ? { reply_markup: { inline_keyboard: [[{ text: 'Открыть заказ', url: o.link }]] } } : undefined
            );
        }
        processed.add(o.id);
        changed = true;
    }

    if (changed || firstRun) {
        let arr = Array.from(processed);
        if (arr.length > 300) arr = arr.slice(-300);
        // seeded=true ставим только когда реально видели заказы (list.length>0 гарантирован выше).
        await chrome.storage.local.set({ [key]: arr, [seededKey]: true });
    }
}

// ── Опрос Telegram getUpdates (приём команд) ──────────────────────────────────
async function telegramPollOnce() {
    if (_polling) return;
    _polling = true;
    try {
        const cfg = await tgGet();
        if (!cfg.enabled || !cfg.token || !cfg.allowControl) return;

        const upd = await tgApi(cfg.token, 'getUpdates', {
            offset: (cfg.lastUpdateId || 0) + 1,
            timeout: 0,
            limit: 20,
            allowed_updates: ['message']
        });

        // КРИТИЧНО: при неверном/протухшем токене Telegram отвечает 401 Unauthorized.
        // Раньше мы просто выходили и через секунду долбили снова — бесконечный спам
        // 401 в Network. Теперь при ошибке авторизации ВЫКЛЮЧАЕМ опрос целиком, чтобы
        // не флудить (пользователь заново введёт корректный токен в настройках).
        if (upd && upd.ok === false) {
            const code = upd.error_code;
            if (code === 401 || code === 404) {
                console.warn('FP Tools: Telegram токен недействителен (', code, ') — опрос остановлен.');
                await tgSet({ enabled: false });
                stopTelegramPolling();
                return;
            }
            // прочие ошибки (429/5xx) — просто пропускаем тик, не спамим
            return;
        }
        if (!upd.ok || !Array.isArray(upd.result) || !upd.result.length) return;

        let maxId = cfg.lastUpdateId || 0;
        for (const u of upd.result) {
            if (u.update_id > maxId) maxId = u.update_id;
            const msg = u.message;
            if (!msg || !msg.text) continue;
            // принимаем команды только из настроенного chatId (безопасность)
            if (cfg.chatId && String(msg.chat.id) !== String(cfg.chatId)) {
                // если chatId ещё не настроен - примем первый и зафиксируем
                if (!cfg.chatId) await tgSet({ chatId: String(msg.chat.id) });
                else continue;
            }
            await handleTelegramCommand(msg.text, await tgGet());
        }
        await tgSet({ lastUpdateId: maxId });
    } catch (e) {
        console.error('FP Tools: Telegram poll error:', e.message);
    } finally {
        _polling = false;
    }
}

function stopTelegramPolling() {
    if (_fastPollTimer) { clearTimeout(_fastPollTimer); _fastPollTimer = null; }
    try { chrome.alarms.clear(TELEGRAM_ALARM); } catch (_) {}
}

// ── Жизненный цикл ────────────────────────────────────────────────────────────
async function telegramSyncAlarm() {
    const cfg = await tgGet();
    const need = cfg.enabled && cfg.token;
    // период опроса: пользовательский (1..60 сек). chrome.alarms минимум ~30 сек на
    // периодических, поэтому для частого опроса используем самоперезапуск через setTimeout
    // в самом цикле; alarm оставляем как страховку (живучесть SW).
    const alarm = await chrome.alarms.get(TELEGRAM_ALARM);
    if (need && !alarm) {
        chrome.alarms.create(TELEGRAM_ALARM, { delayInMinutes: 0.1, periodInMinutes: 0.5 });
        scheduleFastPoll();
    } else if (!need && alarm) {
        chrome.alarms.clear(TELEGRAM_ALARM);
        if (_fastPollTimer) { clearTimeout(_fastPollTimer); _fastPollTimer = null; }
    } else if (need) {
        scheduleFastPoll();
    }
}

// Быстрый опрос команд с пользовательским интервалом (1..60 сек) поверх alarm.
let _fastPollTimer = null;
async function scheduleFastPoll() {
    if (_fastPollTimer) { clearTimeout(_fastPollTimer); _fastPollTimer = null; }
    const cfg = await tgGet();
    if (!cfg.enabled || !cfg.token) return;
    const sec = Math.max(5, Math.min(60, cfg.pollInterval || 5));
    const tick = async () => {
        const c = await tgGet();
        if (!c.enabled || !c.token) { _fastPollTimer = null; return; }
        try { await telegramPollOnce(); } catch (_) {}
        const s = Math.max(5, Math.min(60, c.pollInterval || 5));
        _fastPollTimer = setTimeout(tick, s * 1000);
    };
    _fastPollTimer = setTimeout(tick, sec * 1000);
}

function telegramInit(deps) {
    _deps = deps || {};
}

export {
    TELEGRAM_ALARM,
    telegramInit,
    telegramSyncAlarm,
    telegramPollOnce,
    telegramValidateAndResolve,
    telegramNotifyNewMessages,
    telegramNotifyNewOrders,
    tgSendMessage
};
