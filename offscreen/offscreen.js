// offscreen/offscreen.js

// 3.0: Offscreen keepalive driver. The offscreen document is NOT killed on the 30s idle
// timer the way the service worker is, so a periodic message FROM here keeps the worker
// awake. This is one of several redundancy layers for background reliability.
(function startOffscreenKeepalive() {
    const PING_MS = 20000; // < 30s worker idle timeout
    setInterval(() => {
        try {
            chrome.runtime.sendMessage({ target: 'background', action: 'fptEngineKeepalive', t: Date.now() })
                .catch(() => {});
        } catch (_) {}
    }, PING_MS);
})();

// 3.0 FIX: при чтении описания со страницы лот превращается в HTML, где визуальные
// переносы строк закодированы И как <br>, И как реальные \n в исходнике + отступы.
// Из-за этого после замены <br>→\n появлялись лишние ПУСТЫЕ строки. Эта функция
// извлекает чистый текст: <br> и блочные теги дают ровно один \n, а исходные
// переносы/отступы между тегами не считаются за переносы. Затем схлопываем подряд
// идущие пустые строки и убираем хвостовые пробелы - как в оригинальном описании.
function fptCleanDescriptionHtml(rawHtml) {
    if (!rawHtml) return '';
    let html = String(rawHtml);
    // Убираем реальные переносы/табы исходника - они НЕ являются контентом.
    html = html.replace(/[\r\n\t]+/g, ' ');
    // <br> и закрытия блоков → один перенос.
    html = html.replace(/<br\s*\/?>/gi, '\n');
    html = html.replace(/<\/(p|div|li)>/gi, '\n');
    html = html.replace(/<li[^>]*>/gi, '');
    // Снимаем оставшиеся теги.
    html = html.replace(/<[^>]+>/g, '');
    // Декодируем базовые HTML-сущности.
    const ent = { '&nbsp;': ' ', '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'" };
    html = html.replace(/&nbsp;|&amp;|&lt;|&gt;|&quot;|&#39;/gi, m => ent[m.toLowerCase()] || m);
    return fptNormalizeText(html);
}

// Нормализует уже готовый текст: убирает лишние пробелы в строках,
// схлопывает 2+ пустых строк в одну и обрезает края.
function fptNormalizeText(text) {
    if (!text) return '';
    return String(text)
        .replace(/\r\n?/g, '\n')                 // CRLF → LF
        .split('\n')
        .map(l => l.trim())
        .join('\n')
        .replace(/[ \t]{2,}/g, ' ')              // двойные пробелы → один
        .replace(/\n{3,}/g, '\n\n')              // 3+ переносов → одна пустая строка (намеренные пустые строки сохраняем)
        .trim();
}

// --- КОД ДЛЯ СТАТИСТИКИ ---

const RUSSIAN_MONTHS = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"];

function parseFunPayDate(dateString) {
    const now = new Date();
    let year = now.getFullYear();
    const normalizedDate = dateString.trim().toLowerCase().replace(/\s+/g, ' ');
    let day, monthIndex, hours, minutes;
    let match = normalizedDate.match(/(\d{1,2})\s(.+?)\s(\d{4}),\s(\d{1,2}):(\d{2})/);
    if (match) {
        day = parseInt(match[1], 10);
        monthIndex = RUSSIAN_MONTHS.indexOf(match[2]);
        year = parseInt(match[3], 10);
        hours = parseInt(match[4], 10);
        minutes = parseInt(match[5], 10);
    } else {
        match = normalizedDate.match(/(\d{1,2})\s(.+?),\s(\d{1,2}):(\d{2})/);
        if (match) {
            day = parseInt(match[1], 10);
            monthIndex = RUSSIAN_MONTHS.indexOf(match[2]);
            hours = parseInt(match[3], 10);
            minutes = parseInt(match[4], 10);
        } else if (normalizedDate.startsWith("сегодня,")) {
            match = normalizedDate.match(/сегодня,\s(\d{1,2}):(\d{2})/);
            day = now.getDate();
            monthIndex = now.getMonth();
            hours = parseInt(match[1], 10);
            minutes = parseInt(match[2], 10);
        } else if (normalizedDate.startsWith("вчера,")) {
             match = normalizedDate.match(/вчера,\s(\d{1,2}):(\d{2})/);
             const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
             day = yesterday.getDate();
             monthIndex = yesterday.getMonth();
             year = yesterday.getFullYear();
             hours = parseInt(match[1], 10);
             minutes = parseInt(match[2], 10);
        } else {
            console.warn("Неизвестный формат даты:", dateString);
            return Date.now();
        }
    }
    if (monthIndex === -1) {
        console.warn("Не удалось распознать месяц:", dateString);
        return Date.now();
    }
    return new Date(Date.UTC(year, monthIndex, day, hours, minutes)).getTime();
}

function parseSalesPage(html) {
    try {
        const doc = new DOMParser().parseFromString(html, "text/html");
        const continueInput = doc.querySelector("input[type='hidden'][name='continue']");
        const nextOrderId = continueInput ? continueInput.value : null;
        const orderRows = doc.querySelectorAll("a.tc-item");
        if (!orderRows || orderRows.length === 0) {
            return { nextOrderId: null, orders: [] };
        }
        const orders = [];
        orderRows.forEach(row => {
            try {
                const classList = row.classList;
                let orderStatus;
                if (classList.contains("warning")) orderStatus = "refunded";
                else if (classList.contains("info")) orderStatus = "paid";
                else orderStatus = "closed";
                const orderId = row.querySelector(".tc-order")?.textContent?.substring(1);
                if (!orderId) return;
                const description = row.querySelector(".order-desc div")?.textContent.trim() || "";
                const subcategoryName = row.querySelector(".text-muted")?.textContent.trim() || "";
                const priceText = row.querySelector(".tc-price")?.textContent || "";
                const priceRaw = priceText.replace(/\s/g, "");
                const price = parseFloat(priceRaw) || 0;
                let currency = "UNKNOWN";
                if (priceText.includes("₽")) currency = "RUB";
                else if (priceText.includes("$")) currency = "USD";
                else if (priceText.includes("€")) currency = "EUR";
                // 2.9: detect payment type (deal/safe = сделка, regular)
                const isDeal = row.classList.contains("deal") || !!row.querySelector(".deal-icon, .tc-deal");
                const isPaid = row.classList.contains("info");
                const paymentType = isDeal ? "deal" : "regular";
                const buyerEl = row.querySelector(".media-user-name span");
                const buyerUsername = buyerEl?.textContent.trim() || "";
                const buyerHref = buyerEl?.getAttribute("data-href")?.split("/");
                const buyerId = buyerHref ? parseInt(buyerHref[buyerHref.length - 2] || "0", 10) : 0;
                const orderDateText = row.querySelector(".tc-date-time")?.textContent.trim() || "";
                const orderDate = parseFunPayDate(orderDateText);
                orders.push({ orderId, description, subcategoryName, price, currency, buyerUsername, buyerId, orderStatus, orderDate, orderDateText, paymentType });
            } catch (e) {
                console.error("FP Tools Offscreen: Ошибка при парсинге одного заказа:", e, row);
            }
        });
        return { nextOrderId, orders };
    } catch (e) {
        console.error("FP Tools Offscreen: Глобальная ошибка парсинга страницы продаж:", e);
        return { nextOrderId: null, orders: [] };
    }
}

function parseLotEditPage(html) {
    try {
        const doc = new DOMParser().parseFromString(html, 'text/html');
        const form = doc.querySelector('form.form-offer-editor');
        if (!form) {
            throw new Error('Форма редактирования лота не найдена на странице.');
        }

        const formData = new FormData(form);
        const dataObject = {};
        
        for (const [key, value] of formData.entries()) {
            dataObject[key] = value;
        }

        // keep csrf_token for saving; remove only location
        delete dataObject.location;

        // 3.0 FIX: normalize multi-line text fields so export/import doesn't accumulate
        // spurious blank lines (FunPay textareas may store CRLF / trailing spaces).
        Object.keys(dataObject).forEach(k => {
            if (/fields\[(desc|summary|payment_msg)\]/.test(k) && typeof dataObject[k] === 'string') {
                dataObject[k] = fptNormalizeText(dataObject[k]);
            }
        });

        return dataObject;
    } catch (e) {
        console.error("FP Tools Offscreen: Error in parseLotEditPage", e);
        return null;
    }
}

// =====================================================================================
// 3.0 SERVER-SIDE LOT CLONING
// -------------------------------------------------------------------------------------
// Эти две функции реализуют ПОЛНОЦЕННОЕ серверное копирование чужого лота, по той же
// схеме, что и официальный плагин AutoCopy + методы Cardinal get_lot_fields / save_lot:
//   1) parsePublicLotForClone  - читает ПУБЛИЧНУЮ страницу чужого лота (lots/offer?id=)
//      и достаёт всё, что видно: название, описание, сообщение покупателю, видимые
//      параметры категории (param-item), кол-во, цену и ID подкатегории (node).
//   2) solveCloneForm - берёт ПУСТУЮ форму offerEdit?node=<node> ИЗ НАШЕГО аккаунта
//      (валидный шаблон со всеми скрытыми полями, csrf, селектами, радио и галочками)
//      и сопоставляет видимые параметры жертвы с реальными option/radio нашей формы.
//      На выходе - готовый словарь полей для POST lots/offerSave с offer_id=0.
// =====================================================================================

// Заголовки параметров, которые НЕ являются атрибутами категории (их не сопоставляем
// и не показываем). Базовый список - как в плагине get_lot_data, плюс блоки оформления
// заказа и рейтинга, которые тоже размечены как .param-item на странице покупки.
const CLONE_EXCLUDE_HEADERS = [
    "цена", "продавец", "отзывы", "вопросы", "наличие", "количество", "тип",
    "краткое описание", "подробное описание",
    "price", "seller", "reviews", "questions", "in stock", "amount", "type",
    "short description", "detailed description"
];
// Доп. фильтр по вхождению подстроки (блоки чек-аута/рейтинга).
const CLONE_EXCLUDE_CONTAINS = [
    "с вашего баланса", "останется оплатить", "рейтинг продавца", "скидка за оплату",
    "способ оплаты", "with your balance", "left to pay", "seller rating", "payment method",
    "discount", "balance"
];
const CLONE_SUMMARY_HEADERS = ["краткое описание", "short description"];
const CLONE_DESC_HEADERS = ["подробное описание", "detailed description"];

function parsePublicLotForClone(html) {
    try {
        const doc = new DOMParser().parseFromString(html, 'text/html');

        // Проверка "лот не найден" - как в Cardinal.get_lot_page.
        const pageHeader = doc.querySelector('h1.page-header');
        if (pageHeader && /Предложение не найдено|Пропозицію не знайдено|Offer not found/i.test(pageHeader.textContent)) {
            return { notFound: true };
        }

        let summary = '';
        let description = '';
        const attributes = [];     // видимые значения параметров (для сопоставления селектов)
        const attributePairs = []; // {label, value} - для показа пользователю
        let images = [];

        // 1) ID подкатегории (node) - ТОЧНО как в Cardinal: a.js-back-link href .../<node>/...
        //    Cardinal: int(parser.find("a", class_="js-back-link")['href'].split("/")[-2])
        let nodeId = null;
        let isChips = false;
        let categoryName = '';
        const backLink = doc.querySelector('a.js-back-link');
        if (backLink) {
            const href = backLink.getAttribute('href') || '';
            const parts = href.split('/').filter(Boolean); // [..., 'lots', '<node>'] или [..., 'chips', '<node>']
            const nodeCand = parts[parts.length - 1];
            if (nodeCand && /^\d+$/.test(nodeCand)) nodeId = nodeCand;
            isChips = href.includes('/chips/');
            categoryName = backLink.textContent.trim();
        }
        // запасные селекторы, если разметка изменится
        if (!nodeId) {
            const alt = doc.querySelector('a[href*="/lots/"][href$="/"], a[href*="/chips/"][href$="/"]');
            const m = alt?.getAttribute('href')?.match(/\/(lots|chips)\/(\d+)\//);
            if (m) { nodeId = m[2]; isChips = m[1] === 'chips'; categoryName = categoryName || alt.textContent.trim(); }
        }

        // 2) Параметры лота - как в Cardinal.get_lot_page (div.param-item > h5/div).
        const SUMMARY_H = ['краткое описание', 'короткий опис', 'short description'];
        const DESC_H = ['подробное описание', 'докладний опис', 'detailed description'];
        const IMG_H = ['картинки', 'зображення', 'images'];

        doc.querySelectorAll('div.param-item').forEach(item => {
            const h5 = item.querySelector('h5');
            if (!h5) return;
            const headerRaw = h5.textContent.trim();
            const header = headerRaw.toLowerCase();
            const valDiv = item.querySelector('div');
            const value = valDiv ? valDiv.textContent.trim() : '';
            const valueHtml = valDiv ? fptCleanDescriptionHtml(valDiv.innerHTML) : '';

            if (SUMMARY_H.includes(header)) {
                summary = fptNormalizeText(value);
            } else if (DESC_H.includes(header)) {
                description = valueHtml;
            } else if (IMG_H.includes(header)) {
                images = Array.from(item.querySelectorAll('a.attachments-thumb')).map(a => a.getAttribute('href')).filter(Boolean);
            } else if (!CLONE_EXCLUDE_HEADERS.includes(header) &&
                       !CLONE_EXCLUDE_CONTAINS.some(s => header.includes(s))) {
                if (value) {
                    attributes.push(value.toLowerCase());
                    attributePairs.push({ label: headerRaw, value });
                }
            }
        });

        // 3) Цена и количество - из самой формы покупки, если есть (точные значения),
        //    иначе из видимых параметров.
        let price = '';
        const priceInput = doc.querySelector('input[name="price"], [data-price]');
        if (priceInput) {
            price = priceInput.getAttribute('value') || priceInput.getAttribute('data-price') || '';
        }
        if (!price) {
            // запасной вариант: ищем число рядом с валютой
            const pm = doc.body.textContent.match(/(\d[\d\s]*[.,]?\d*)\s*(₽|руб|грн|\$|€|USD|EUR|RUB|UAH)/i);
            if (pm) price = pm[1].replace(/\s/g, '').replace(',', '.');
        }

        let amount = '';
        const amountInput = doc.querySelector('input[name="amount"]');
        if (amountInput) amount = amountInput.getAttribute('value') || '';
        if (!amount) {
            doc.querySelectorAll('div.param-item').forEach(item => {
                const h = item.querySelector('h5')?.textContent.trim().toLowerCase();
                if (['количество', 'наличие', 'кількість', 'amount', 'in stock'].includes(h)) {
                    const v = item.querySelector('div')?.textContent.trim().match(/\d+/);
                    if (v) amount = v[0];
                }
            });
        }

        // Продавец: сначала из data-seller на блоке чата, потом из ссылки.
        let sellerName = '';
        let sellerId = '';
        const chatBox = doc.querySelector('[data-seller]');
        if (chatBox) sellerId = chatBox.getAttribute('data-seller') || '';
        const sellerLink = doc.querySelector('.chat-header .media-user-name a, .media-user-name a');
        if (sellerLink) {
            sellerName = sellerLink.textContent.trim();
            if (!sellerId) {
                const sm = sellerLink.getAttribute('href')?.match(/\/users\/(\d+)/);
                if (sm) sellerId = sm[1];
            }
        }

        const pageTitle = pageHeader ? pageHeader.textContent.trim() : '';
        if (!summary && pageTitle) summary = pageTitle;

        return {
            summary, description, attributes, attributePairs, images,
            nodeId, categoryName, isChips, price, amount,
            sellerName, sellerId, title: pageTitle
        };
    } catch (e) {
        console.error("FP Tools Offscreen: Error in parsePublicLotForClone", e);
        return null;
    }
}

// Парсит список лотов продавца (users/{id}/) и находит цену конкретного оффера -
// ровно тот источник цены, что использует плагин: tc-price[data-s] + валюта из span.unit.
// Возвращает { price, currency } для нужного offerId, либо null.
function parseSellerLotPrice(html, offerId) {
    try {
        const doc = new DOMParser().parseFromString(html, 'text/html');
        const oid = String(offerId);
        const offers = doc.querySelectorAll('a.tc-item');
        for (const a of offers) {
            const href = a.getAttribute('href') || '';
            if (!href.includes('id=' + oid)) continue;
            const tcPrice = a.querySelector('.tc-price');
            if (!tcPrice) return null;
            let price = tcPrice.getAttribute('data-s');
            if (!price) {
                // запасной разбор текста
                const t = tcPrice.textContent.trim().match(/[\d\s.,]+/);
                if (t) price = t[0].replace(/\s/g, '').replace(',', '.');
            }
            let currency = '';
            const unit = tcPrice.querySelector('span.unit');
            if (unit) {
                const u = unit.textContent.trim();
                if (u.includes('₽') || /руб/i.test(u)) currency = 'rub';
                else if (u.includes('$')) currency = 'usd';
                else if (u.includes('€')) currency = 'eur';
            }
            return { price: price ? String(price).replace(',', '.') : '', currency };
        }
        return null;
    } catch (e) {
        console.error("FP Tools Offscreen: Error in parseSellerLotPrice", e);
        return null;
    }
}

// Сопоставляет видимые параметры жертвы с полями НАШЕЙ пустой формы offerEdit?node=...
// Логика повторяет solve_form из официального плагина AutoCopy, но аккуратнее с радио/чекбоксами.
function solveCloneForm(html, attributes) {
    try {
        const doc = new DOMParser().parseFromString(html, 'text/html');
        const form = doc.querySelector('form.form-offer-editor');
        if (!form) throw new Error('Форма создания лота не найдена (offerEdit).');

        const attrs = (attributes || []).map(a => String(a).toLowerCase());
        const data = {};

        // 1) Скрытые поля + csrf - берём как есть.
        form.querySelectorAll('input[type="hidden"]').forEach(i => {
            const name = i.getAttribute('name');
            if (name) data[name] = i.getAttribute('value') || '';
        });

        const matchText = (txt) => {
            if (!txt) return false;
            if (attrs.includes(txt)) return true;
            for (const a of attrs) {
                if ((txt.length > 2 && a.includes(txt)) || (a.length > 2 && txt.includes(a))) return true;
            }
            return false;
        };

        // 2) Селекты: пытаемся выбрать option, текст которого совпадает с параметром жертвы.
        //    history хранит выбранный индекс по «базовому» имени, чтобы согласованно
        //    заполнять связанные (зависимые) селекты с тем же префиксом.
        const history = {};
        const selects = Array.from(form.querySelectorAll('select'));

        selects.forEach(s => {
            const name = s.getAttribute('name');
            if (!name) return;
            const opts = Array.from(s.querySelectorAll('option'));
            let chosen = null, idx = -1;
            for (let i = 0; i < opts.length; i++) {
                const val = opts[i].getAttribute('value');
                const txt = opts[i].textContent.trim().toLowerCase();
                if (!val || val === '0') continue;
                if (matchText(txt)) { chosen = val; idx = i; break; }
            }
            if (chosen !== null) {
                data[name] = chosen;
                history[name.replace(/\d+$/, '')] = { val: chosen, idx };
            }
        });

        // зависимые селекты по базовому имени
        selects.forEach(s => {
            const name = s.getAttribute('name');
            if (!name || data[name] !== undefined) return;
            const base = name.replace(/\d+$/, '');
            if (history[base]) {
                const opts = Array.from(s.querySelectorAll('option'));
                const t = history[base];
                if (t.idx >= 0 && t.idx < opts.length && opts[t.idx].getAttribute('value')) {
                    data[name] = opts[t.idx].getAttribute('value');
                } else {
                    for (const o of opts) {
                        if (o.getAttribute('value') === t.val) { data[name] = t.val; break; }
                    }
                }
            }
        });

        // если селект обязателен, но ничего не подобрали - берём первый непустой option,
        // иначе FunPay вернёт ошибку валидации.
        selects.forEach(s => {
            const name = s.getAttribute('name');
            if (!name || data[name] !== undefined) return;
            const required = s.hasAttribute('required') || (s.closest('.form-group')?.querySelector('.required'));
            if (required) {
                const opt = Array.from(s.querySelectorAll('option')).find(o => {
                    const v = o.getAttribute('value');
                    return v && v !== '0';
                });
                if (opt) data[name] = opt.getAttribute('value');
            }
        });

        // 3) Радио и чекбоксы.
        const radios = {};
        form.querySelectorAll('input').forEach(inp => {
            const n = inp.getAttribute('name');
            const t = (inp.getAttribute('type') || 'text').toLowerCase();
            if (!n) return;
            // эти поля задаём отдельно при сохранении - пропускаем
            if (['offer_id', 'active', 'price', 'amount', 'location', 'csrf_token', 'secrets', 'fields[images]', 'query'].includes(n)) return;
            if (data[n] !== undefined) return;

            if (t === 'radio') {
                if (!radios[n]) radios[n] = [];
                let label = '';
                const lab = inp.closest('label') || inp.parentElement;
                if (lab) label = lab.textContent.trim().toLowerCase();
                radios[n].push({ value: inp.getAttribute('value') || '', label });
                if (inp.hasAttribute('checked')) data[n] = inp.getAttribute('value') || '';
            } else if (t === 'checkbox') {
                if (inp.hasAttribute('checked')) data[n] = inp.getAttribute('value') || 'on';
            } else if (t === 'text' || t === 'number') {
                // как в solve_form: обязательное пустое текстовое/числовое поле = "1"
                const v = inp.getAttribute('value') || '';
                if (inp.hasAttribute('required') && !v) data[n] = '1';
            }
        });

        Object.entries(radios).forEach(([n, opts]) => {
            if (data[n] !== undefined) return;
            for (const o of opts) {
                if (matchText(o.label)) { data[n] = o.value; break; }
            }
        });

        return data;
    } catch (e) {
        console.error("FP Tools Offscreen: Error in solveCloneForm", e);
        return null;
    }
}

function parseChatList(html) {
    try {
        const doc = new DOMParser().parseFromString(html, "text/html");
        const chatItems = doc.querySelectorAll('a.contact-item');
        const BOT_MARKER = '\u2061';
        const OLD_BOT_MARKER = '\u2064';
        return Array.from(chatItems).map(item => {
            const nameEl = item.querySelector('.media-user-name');
            const avatarEl = item.querySelector('.avatar-photo');
            const nodeMsg = parseInt(item.dataset.nodeMsg, 10);   // last message id in the chat
            const userMsg = parseInt(item.dataset.userMsg, 10);   // last message id the user has read
            const rawMsg = item.querySelector('.contact-item-message')?.textContent || '';
            const lastByBot = rawMsg.startsWith(BOT_MARKER) || rawMsg.startsWith(OLD_BOT_MARKER);
            // strip marker + zero-width chars for clean text used in matching
            const cleanMsg = rawMsg.replace(/[\u2061\u2064]/g, '').trim();
            return {
                chatId: item.dataset.id,
                chatName: nameEl ? nameEl.textContent.trim() : 'Unknown',
                msgId: item.dataset.nodeMsg,
                nodeMsg: Number.isNaN(nodeMsg) ? null : nodeMsg,
                userMsg: Number.isNaN(userMsg) ? null : userMsg,
                messageText: cleanMsg,
                lastByBot,
                isUnread: item.classList.contains('unread'),
                avatarUrl: avatarEl ? avatarEl.style.backgroundImage.slice(5, -2) : null
            };
        });
    } catch (e) {
        console.error("FP Tools Offscreen: Error parsing chat list.", e);
        return [];
    }
}

function parseUserLotsList(html) {
    try {
        const doc = new DOMParser().parseFromString(html, "text/html");
        const allLots = [];
        const lotRows = doc.querySelectorAll("a.tc-item");

        lotRows.forEach(row => {
            const offerBlock = row.closest('.offer');
            if (!offerBlock) return;
            const categoryLink = offerBlock.querySelector('.offer-list-title a');
            const categoryName = categoryLink?.textContent.trim() || "Без категории";
            const nodeIdMatch = categoryLink?.getAttribute('href')?.match(/\/(?:lots|chips)\/(\d+)/);
            const nodeId = nodeIdMatch ? nodeIdMatch[1] : null;

            if (!nodeId) return;

            const title = row.querySelector(".tc-desc-text")?.textContent?.trim() || "Без названия";
            const idMatch = row.getAttribute('href')?.match(/(?:offer=|id=)(\d+)/);
            const id = idMatch ? idMatch[1] : null;

            if (id) {
                allLots.push({ id, title, nodeId, categoryName });
            }
        });
        
        return allLots;
    } catch (e) {
        console.error("FP Tools Offscreen: Error in parseUserLotsList", e);
        return [];
    }
}

function parseGameSearchResults(html) {
    try {
        const doc = new DOMParser().parseFromString(html, 'text/html');
        const items = doc.querySelectorAll('.promo-game-item');
        return Array.from(items).map(item => {
            const link = item.querySelector('.game-title a');
            const img = item.querySelector('img');
            return {
                name: link ? link.textContent.trim() : 'Unknown',
                url: link ? link.href : '#',
                img: img ? img.src : ''
            };
        });
    } catch (e) {
        return [];
    }
}

function parseCategoryPage(html) {
    try {
        const doc = new DOMParser().parseFromString(html, 'text/html');
        const items = doc.querySelectorAll('.counter-item');
        return Array.from(items).map(item => {
            const url = item.href;
            const nodeIdMatch = url.match(/\/lots\/(\d+)/);
            return {
                name: item.querySelector('.counter-param')?.textContent.trim() || 'Unknown',
                count: item.querySelector('.counter-value')?.textContent.trim() || '0',
                url: url,
                nodeId: nodeIdMatch ? nodeIdMatch[1] : null
            };
        });
    } catch (e) {
        return [];
    }
}

function parseLotListPage(html) {
    try {
        const doc = new DOMParser().parseFromString(html, 'text/html');
        const items = doc.querySelectorAll('a.tc-item');
        return Array.from(items).map(item => {
            const offerIdMatch = item.getAttribute('href')?.match(/id=(\d+)/);
            return {
                offerId: offerIdMatch ? offerIdMatch[1] : null,
                description: item.querySelector('.tc-desc-text')?.textContent.trim() || 'No description',
                seller: item.querySelector('.media-user-name span')?.textContent.trim() || 'Unknown',
                price: item.querySelector('.tc-price div')?.textContent.trim() || 'N/A'
            };
        });
    } catch (e) {
        return [];
    }
}

// --- ИСПРАВЛЕННАЯ ФУНКЦИЯ ---
function parseUserCategories(html) {
    try {
        const doc = new DOMParser().parseFromString(html, 'text/html');
        const categories = [];
        const offerBlocks = doc.querySelectorAll('.offer');
        
        offerBlocks.forEach(block => {
            // Ищем правильную ссылку для поднятия (`.../trade`)
            const managementLink = block.querySelector('a.btn-plus');
            // Ищем ссылку с названием для отображения
            const titleLink = block.querySelector('.offer-list-title h3 a');

            if (managementLink && titleLink) {
                const name = titleLink.textContent.trim();
                const url = new URL(managementLink.href, 'https://funpay.com/');
                
                const lotItems = block.querySelectorAll('.tc-item');
                const publicUrl = new URL(titleLink.href, 'https://funpay.com/');
                const nodeIdMatch = publicUrl.pathname.match(/\/lots\/(\d+)/);

                const lots = Array.from(lotItems).map(item => {
                    const idMatch = item.getAttribute('href')?.match(/id=(\d+)/);
                    // FIX: track auto-delivery per individual lot, not just category-wide
                    const lotHasAutoDelivery = !!item.querySelector('i.auto-dlv-icon, .sc-auto-delivery, [class*="auto-dlv"]');
                    return {
                        id: idMatch ? idMatch[1] : null,
                        nodeId: nodeIdMatch ? nodeIdMatch[1] : null,
                        title: item.querySelector('.tc-desc-text')?.textContent.trim() || 'Без названия',
                        hasAutoDelivery: lotHasAutoDelivery
                    };
                }).filter(lot => lot.id && lot.nodeId);

                // FIX: category has auto-delivery only if AT LEAST ONE lot has it
                const categoryHasAutoDelivery = lots.some(l => l.hasAutoDelivery);
                
                categories.push({ id: url.pathname, name: name, lots: lots, hasAutoDelivery: categoryHasAutoDelivery });
            }
        });
        return categories;
    } catch (e) {
        console.error("FP Tools Offscreen: Error in parseUserCategories", e);
        return [];
    }
}
// --- КОНЕЦ ИСПРАВЛЕНИЯ ---

// FIX 2.8: returns { stars, lotName } so auto-replies can use {lotname} variable
function parseOrderPageForReview(html) {
    try {
        const doc = new DOMParser().parseFromString(html, 'text/html');

        // --- Detect if this review was written by the current user (skip own reviews) ---
        // FIX: Use more reliable selector - the profile link in the order page header
        const reviewAuthorLink = doc.querySelector('.review-item-head .media-user-name a');
        const reviewAuthorId = reviewAuthorLink
            ? reviewAuthorLink.href.split('/').filter(Boolean).pop()
            : null;

        // Current user's profile link appears in the page header as a dropdown trigger
        const currentUserLink = doc.querySelector('a.user-link-dropdown, a[href*="/users/"].user-link-dropdown');
        // Fallback: any link with /users/ in the top nav
        const currentUserFallback = doc.querySelector('.navbar-right a[href*="/users/"]');
        const currentUserHref = (currentUserLink || currentUserFallback)?.href || '';
        const currentUserId = currentUserHref.split('/').filter(Boolean).pop();

        if (reviewAuthorId && currentUserId && reviewAuthorId === currentUserId) {
            return null; // Own review, skip
        }

        // --- Stars ---
        const ratingDiv = doc.querySelector('.order-review .rating > div');
        if (!ratingDiv) return null;
        const ratingClass = Array.from(ratingDiv.classList).find(c => /^rating\d+$/.test(c));
        if (!ratingClass) return null;
        const stars = parseInt(ratingClass.replace('rating', ''), 10);
        if (isNaN(stars)) return null;

        // --- Lot name (NEW in 2.8) ---
        // Try different selectors that FunPay uses for lot/product name on order page
        let lotName = '';
        const shortDescHeader = Array.from(doc.querySelectorAll('.param-item h5'))
            .find(h => h.textContent.trim() === 'Краткое описание');
        if (shortDescHeader) {
            lotName = shortDescHeader.nextElementSibling?.textContent.trim() || '';
        }
        if (!lotName) {
            lotName = doc.querySelector('.order-desc-title, .tc-desc-text, .order-title')?.textContent.trim() || '';
        }

        return { stars, lotName };
    } catch (e) {
        console.error("FP Tools Offscreen: Error in parseOrderPageForReview", e);
        return null;
    }
}



// 2.9: Parse unconfirmed (pending) balance from the header/balance page
function parseUnconfirmedBalance(html) {
    try {
        const doc = new DOMParser().parseFromString(html, 'text/html');
        // Unconfirmed orders: status "info" (paid but not yet confirmed)
        const pendingRows = doc.querySelectorAll('a.tc-item.info');
        let total = 0;
        let currency = 'RUB';
        pendingRows.forEach(row => {
            const priceText = row.querySelector('.tc-price')?.textContent || '';
            const price = parseFloat(priceText.replace(/\s/g, '').replace(',', '.')) || 0;
            total += price;
            if (priceText.includes('$')) currency = 'USD';
            else if (priceText.includes('€')) currency = 'EUR';
        });
        return { total: Math.round(total * 100) / 100, currency, count: pendingRows.length };
    } catch (e) {
        return { total: 0, currency: 'RUB', count: 0 };
    }
}

// 2.9: Parse buyer purchase history from trade page
// buyerUsername is passed for safety but server already pre-filters by username
function parseBuyerHistory(html, buyerUsername) {
    // Safety net: never return results if buyer is unknown
    if (!buyerUsername) return [];
    try {
        const doc = new DOMParser().parseFromString(html, 'text/html');
        const orders = [];
        doc.querySelectorAll('a.tc-item').forEach(row => {
            // Server pre-filters by username - just parse all returned rows
            const orderId = row.querySelector('.tc-order')?.textContent?.trim().replace(/^#/, '');
            const desc    = row.querySelector('.order-desc div, .tc-desc-text')?.textContent.trim() || '';
            const price   = row.querySelector('.tc-price')?.textContent.trim() || '';
            const date    = row.querySelector('.tc-date-time')?.textContent.trim() || '';
            if (orderId) orders.push({ orderId, desc, price, date });
        });
        return orders.slice(0, 30);
    } catch (e) {
        return [];
    }
}

// 3.0: Parse order page for auto-delivery - get secrets, lotId, chatId
function parseOrderPageForDelivery(html) {
    try {
        const doc = new DOMParser().parseFromString(html, 'text/html');

        // Get secrets (the goods that were delivered / in order-secrets-box)
        const secretsBox = doc.querySelector('.order-secrets-box, .order-secrets-list');
        const secrets = secretsBox?.textContent.trim() || null;

        // Get lot ID from the order page
        const lotLink = doc.querySelector('.order-desc a[href*="lots/offer"], a[href*="id="]');
        const lotIdMatch = lotLink?.getAttribute('href')?.match(/id=(\d+)/);
        const lotId = lotIdMatch ? lotIdMatch[1] : null;

        // Node ID from lot link
        const nodeIdMatch = lotLink?.getAttribute('href')?.match(/node=(\d+)/);
        const nodeId = nodeIdMatch ? nodeIdMatch[1] : null;

        // Buyer chat ID
        const chatLink = doc.querySelector('.order-user a[href*="/chat/?node="], a[href*="chat/?node="]');
        const chatIdMatch = chatLink?.getAttribute('href')?.match(/node=(\d+)/);
        const buyerChatId = chatIdMatch ? chatIdMatch[1] : null;

        // Buyer username
        const buyerLink = doc.querySelector('.media-user-name a[href*="/users/"]');
        const buyerUsername = buyerLink?.textContent.trim() || null;

        // Short description of lot (for variables)
        const shortDescHeader = Array.from(doc.querySelectorAll('.param-item h5'))
            .find(h => h.textContent.trim() === 'Краткое описание');
        const lotName = shortDescHeader?.nextElementSibling?.textContent.trim() || '';

        // Game / category
        const categoryEl = doc.querySelector('.order-category, .order-subcategory');
        const category = categoryEl?.textContent.trim() || '';

        return { secrets, lotId, nodeId, buyerChatId, buyerUsername, lotName, category };
    } catch (e) {
        console.error('FP Tools Offscreen: Error in parseOrderPageForDelivery', e);
        return null;
    }
}


function parseSupportTickets(html) {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const tickets = [];
    doc.querySelectorAll('a.ticket-item').forEach(item => {
        const href = item.getAttribute('href') || '';
        const id = href.replace(/\/$/, '').split('/').pop();
        const title = (item.querySelector('.col-12.mt-2') || item.querySelector('.col-12'))?.textContent.trim() || 'Заявка';
        const date = item.querySelector('.text-secondary')?.textContent.trim() || '';
        const badge = item.querySelector('.badge');
        const status = !badge ? 'Неизвестен'
            : badge.classList.contains('bg-danger') ? 'Открыт'
            : badge.classList.contains('bg-warning') ? 'В ожидании'
            : badge.classList.contains('bg-success') ? 'Решена'
            : badge.classList.contains('bg-secondary') ? 'Закрыт'
            : badge.textContent.trim() || 'Неизвестен';
        // Используем числовой ID как ключ сортировки (больший ID = новее)
        if (id && /^\d+$/.test(id)) tickets.push({ id, title, status, lastUpdate: date, sortKey: parseInt(id, 10) });
    });
    return tickets;
}

function parseSupportCategories(html) {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const categories = [];
    doc.querySelectorAll('select#ticket_select_form option').forEach(opt => {
        const v = opt.value, t = opt.textContent.trim();
        if (v && !t.includes('Выберите')) categories.push({ id: v, name: t });
    });
    return categories;
}

function parseSupportFields(html) {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const fields = [];
    const seenNames = new Set();

    doc.querySelectorAll("input[name^='ticket[fields]'], select[name^='ticket[fields]'], textarea[name^='ticket[comment]']").forEach(el => {
        const fname = el.getAttribute('name') || '';
        if (!fname || fname.includes('_token') || fname.includes('attachments')) return;

        const tag = el.tagName.toLowerCase();
        const inputType = el.getAttribute('type') || '';

        // --- radio: группируем все radios с одним name через fieldset ---
        if (inputType === 'radio') {
            if (seenNames.has(fname)) return;
            seenNames.add(fname);
            const fieldset = el.closest('fieldset');
            const container = fieldset || el.closest('.mb-3');
            if (!container) return;
            const legend = container.querySelector('legend') || container.querySelector('label');
            const labelText = (legend?.textContent || '').replace('*','').trim();
            const isRequired = !!(legend?.classList.contains('required') || labelText.includes('*'));
            const condition = container.getAttribute('data-condition') || null;
            const allRadios = container.querySelectorAll(`input[name='${CSS.escape(fname)}']`);
            const options = [];
            allRadios.forEach(radio => {
                const lbl = container.querySelector(`label[for='${radio.id}']`);
                const txt = (lbl?.textContent || '').replace('*','').trim();
                const val = radio.getAttribute('value') || '';
                if (val && txt) options.push({ value: val, text: txt });
            });
            fields.push({ id: fname, name: labelText || fname, type: 'radio', required: isRequired, options, condition, defaultValue: '' });
            return;
        }

        if (seenNames.has(fname)) return;
        seenNames.add(fname);

        const container = el.closest('.mb-3') || el.closest('fieldset');
        if (!container) return;
        const labelEl = container.querySelector(`label[for='${el.id}']`) || container.querySelector('label') || container.querySelector('legend');
        const labelText = (labelEl?.textContent || '').replace('*','').trim();
        const isRequired = !!(labelEl?.classList.contains('required') || labelText.includes('*'));
        const condition = container.getAttribute('data-condition') || null;

        let type = tag === 'textarea' ? 'textarea' : tag === 'select' ? 'select' : 'text';
        const options = [];
        if (type === 'select') {
            el.querySelectorAll('option').forEach(opt => {
                if (opt.value && !opt.textContent.includes('Выберите')) options.push({ value: opt.value, text: opt.textContent.trim() });
            });
        }

        // Пропускаем textarea с data-controller только если это НЕ поле комментария
        if (type === 'textarea' && el.hasAttribute('data-controller') && !fname.includes('comment')) return;

        const name = (fname.includes('comment') && type === 'textarea') ? 'Сообщение' : (labelText || fname);
        fields.push({ id: fname, name, type, required: isRequired, options, condition, defaultValue: '' });
    });
    return fields;
}

function parseSupportFormToken(html) {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    return doc.querySelector("input[name='ticket[_token]']")?.value || null;
}

function parseOrdersPage(html) {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const ids = new Set();
    doc.querySelectorAll('a[href*="/orders/"]').forEach(a => {
        const m = (a.getAttribute('href') || '').match(/\/orders\/([A-Z0-9]{8})/);
        if (m) ids.add(m[1]);
    });
    return [...ids];
}


function parseTicketDetails(html) {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const title = doc.querySelector('.breadcrumb-item.active')?.textContent.replace(/Заявка #\d+/, '').trim() || '';
    const badge = doc.querySelector('.ticket-info-panel .badge');
    const status = !badge ? (doc.querySelector('.btn-outline-secondary') ? 'Открыт' : 'Закрыт')
        : badge.classList.contains('bg-danger') ? 'Открыт'
        : badge.classList.contains('bg-warning') ? 'В ожидании'
        : badge.classList.contains('bg-success') ? 'Решена' : 'Закрыт';

    const comments = [];
    doc.querySelectorAll('.ticket-comment').forEach(c => {
        const author = c.querySelector('.username')?.textContent.trim() || 'Неизвестно';
        const text = c.querySelector('.comment-text')?.innerHTML || '';
        const ts = (c.querySelector('.comment-username span:nth-child(2)') || c.querySelector('.d-sm-none span:nth-child(2)'))?.textContent.trim() || '';
        const avatarStyle = c.querySelector('.comment-avatar')?.getAttribute('style') || '';
        const avatarMatch = avatarStyle.match(/url\(['"']?([^'"')]+)['"']?\)/);
        const avatarUrl = avatarMatch ? (avatarMatch[1].startsWith('http') ? avatarMatch[1] : 'https://funpay.com' + avatarMatch[1]) : '';
        comments.push({ author, text, timestamp: ts, avatarUrl });
    });

    const token = doc.querySelector("input[name='add_comment[_token]']")?.value || '';
    const canReply = !!doc.querySelector("textarea[name*='comment'], form[action*='comment'] textarea");
    return { title, status, comments, token, canReply };
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.target !== 'offscreen') return true;
    
    switch (message.action) {
        case 'parseSalesPage':
            sendResponse(parseSalesPage(message.html));
            break;
        case 'parseLotEditPage':
            sendResponse(parseLotEditPage(message.html));
            break;
        case 'parsePublicLotForClone':
            sendResponse(parsePublicLotForClone(message.html));
            break;
        case 'parseSellerLotPrice':
            sendResponse(parseSellerLotPrice(message.html, message.offerId));
            break;
        case 'solveCloneForm':
            sendResponse(solveCloneForm(message.html, message.attributes));
            break;
        case 'parseChatList':
            sendResponse(parseChatList(message.html));
            break;
        case 'parseUserLotsList':
            sendResponse(parseUserLotsList(message.html));
            break;
        case 'parseGameSearchResults':
            sendResponse(parseGameSearchResults(message.html));
            break;
        case 'parseCategoryPage':
            sendResponse(parseCategoryPage(message.html));
            break;
        case 'parseLotListPage':
            sendResponse(parseLotListPage(message.html));
            break;
        case 'parseUserCategories':
            sendResponse(parseUserCategories(message.html));
            break;
        case 'parseOrderPageForReview':
            sendResponse(parseOrderPageForReview(message.html));
            break;
        case 'parseUnconfirmedBalance':
            sendResponse(parseUnconfirmedBalance(message.html));
            break;
        case 'parseBuyerHistory':
            sendResponse(parseBuyerHistory(message.html, message.buyerUserId));
            break;
        case 'parseOrderPageForDelivery':
            sendResponse(parseOrderPageForDelivery(message.html));
            break;
        case 'parseSupportTickets':
            sendResponse(parseSupportTickets(message.html));
            break;
        case 'parseSupportCategories':
            sendResponse(parseSupportCategories(message.html));
            break;
        case 'parseSupportFields':
            sendResponse(parseSupportFields(message.html));
            break;
        case 'parseSupportFormToken':
            sendResponse(parseSupportFormToken(message.html));
            break;
        case 'parseOrdersPage':
            sendResponse(parseOrdersPage(message.html));
            break;
        case 'parseTicketDetails':
            sendResponse(parseTicketDetails(message.html));
            break;
        case 'keepalivePing':
            // 3.0: offscreen → worker keepalive. Just acknowledge; the act of receiving
            // a message resets the service worker's idle timer.
            sendResponse({ alive: true, t: Date.now() });
            break;
    }

    return true; 
});