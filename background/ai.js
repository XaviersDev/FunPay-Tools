const VERCEL_API_URL = 'https://fptools.onrender.com/api/ai'; 
const API_SECRET_KEY = 'fptoolsdim';

const SYSTEM_PROMPT = 'You are a text editing model. Follow user instructions precisely.';

// 3.0 FIX: убирает лишние пустые строки, которые ИИ-перевод/генерация любят добавлять
// между пунктами. Схлопывает 2+ переносов в один и обрезает края.
function fptNorm(t) {
    return typeof t === 'string'
        ? t.replace(/\r\n?/g, '\n').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim()
        : t;
}

async function makeAIRequest(finalPrompt) {
    if (VERCEL_API_URL.includes('YOUR_VERCEL_PROJECT_NAME')) {
        return { success: false, error: "URL сервера не настроен в background/ai.js" };
    }

    const payload = {
        messages: [{ role: "system", content: SYSTEM_PROMPT }, { role: "user", content: finalPrompt.trim() }],
        modelName: "ChatGPT 4o",
        currentPagePath: "/chatgpt-4o"
    };

    try {
        // 3.0: hard timeout so the UI never waits forever if the server hangs or is unreachable.
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 45000);
        let response;
        try {
            response = await fetch(VERCEL_API_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${API_SECRET_KEY}`
                },
                body: JSON.stringify(payload),
                signal: controller.signal
            });
        } finally {
            clearTimeout(timeoutId);
        }

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            const details = errorData.details || `HTTP ${response.status} ${response.statusText}`;
            console.error(`AI Server Error: ${details}`);
            
            if (response.status >= 500) {
                 return { 
                    success: false, 
                    error: "ИИ на сервере разработчика устарел. Разработчик скоро обновит ИИ, и все заработает! ИЗВИНИ 🙏🏻" 
                };
            }
            return { success: false, error: `Ошибка API: ${details}` };
        }

        const result = await response.json();
        
        if (result && result.response) {
            return { success: true, data: result.response.trim() };
        } else {
            return { success: false, error: 'AI response format is incorrect or empty.' };
        }

    } catch (error) {
        if (error.name === 'AbortError') {
            console.error('AI request timed out');
            return { success: false, error: 'ИИ не ответил вовремя (таймаут). Попробуйте ещё раз.' };
        }
        console.error(`Network error during AI request: ${error.message}`);
        return { success: false, error: `Сетевая ошибка: ${error.message}. Проверьте подключение к интернету.` };
    }
}


export async function fetchAIResponse(textForAI, context, myUsername, type = "rewrite") {
    let finalPrompt;

    if (type === 'time_calc') {
        // Token-light: краткий промпт, краткий ответ. Подаётся как «калькулятор».
        finalPrompt = `Реши задачу на расчёт времени. Сложи/вычти интервалы по описанию и дай короткий понятный ответ на русском (1-3 предложения, без лишних слов, без markdown). Если есть диапазон - укажи диапазон.\n\nЗадача: ${textForAI}`;

    } else if (type === 'review_reply') {
        const lotName = textForAI;
        const reviewText = context;

        finalPrompt = `
Ты - дружелюбный продавец "${myUsername}" на бирже FunPay. Покупатель оставил отзыв на товар.
Название товара (вставляй ТОЧНО как есть, со всеми эмодзи/символами/буквами, НИЧЕГО не меняя): ${lotName}
Текст отзыва покупателя: "${reviewText}"

Напиши ОЧЕНЬ короткий благодарный ответ на отзыв.

ПРАВИЛА (строго):
1. Длина - 1 предложение, максимум 2 коротких. Это самое важное правило.
2. Обязательно упомяни название товара, вставив его ДОСЛОВНО (символ в символ) из строки выше.
3. Поблагодари за отзыв и/или покупку, добавь 1-3 уместных эмодзи.
4. Без Markdown, без кавычек, без заголовков, без пояснений. Только готовый текст ответа.
5. Тёплый, искренний тон.

Пример стиля (НЕ копируй дословно, только тон и длину):
Спасибо за ваш отзыв и покупку нашего ${lotName}! Рад, что всё понравилось! 😊✨

ГОТОВЫЙ ТЕКСТ ОТВЕТА:`;

    } else if (type === 'feature_match') {
        // textForAI = freeform user request ("что мне не нужно")
        // context   = JSON string array of { id, label, desc }
        finalPrompt = `
Ты - помощник внутри браузерного расширения FunPay Tools. Пользователь описывает своими словами, какие функции/кнопки расширения ему НЕ нужны и он хочет их отключить.

Вот полный список доступных функций (JSON, поля: id, label, desc):
${context}

Запрос пользователя: "${textForAI}"

Твоя задача: определить, какие функции из списка пользователь, вероятно, хочет ОТКЛЮЧИТЬ, исходя из его запроса. Сопоставляй по смыслу (label + desc), а не только по точным словам.

Верни СТРОГО валидный JSON-массив объектов, без какого-либо текста вокруг, без Markdown, без \`\`\`. Формат каждого объекта:
{"id": "<id функции из списка>", "confidence": <число 0..1>, "reason": "<очень короткое пояснение на русском, почему подходит>"}

Правила:
1. Включай только функции, которые реально соответствуют запросу. Если пользователь явно назвал что-то - confidence ближе к 1. Если только косвенно подразумевается - ниже.
2. Не выдумывай id, которых нет в списке.
3. Если ничего не подходит - верни пустой массив [].
4. Никаких комментариев, только JSON-массив.

JSON:`;

    } else if (type === 'translate_to_russian') {
        finalPrompt = `Переведи следующий текст на русский язык. Верни ТОЛЬКО перевод, без пояснений и кавычек:\n\n${textForAI}`;

    } else if (type === 'lot_audit_raw') {
        // Pass the full constructed prompt directly - no wrapping
        finalPrompt = textForAI;

    } else if (type === 'lot_audit') {
        // For lot_audit, context contains the full system prompt, textForAI is the user message
        // Build multi-turn conversation from context
        finalPrompt = `${context}\n\nСообщение продавца: ${textForAI}\n\nОтветь на русском языке кратко и по существу.`;

    } else { // Логика по умолчанию для переписывания текста в чате
        finalPrompt = `
Ты - ИИ-ассистент, который помогает продавцу "${myUsername}" на FunPay. Твоя задача - переписать его черновик сообщения, сохранив основной смысл, но сделав его вежливым, профессиональным и четким.

--- ОСНОВНЫЕ ПРАВИЛА ---
1.  СОХРАНЯЙ СМЫСЛ: Твой ответ должен передавать ТОТ ЖЕ САМЫЙ смысл, что и черновик продавца. Не добавляй новые идеи, вопросы или предложения от себя.
2.  БУДЬ КРАТОК: Ответ должен быть настолько же коротким, насколько позволяет исходное сообщение. Не пиши длинные тексты, если черновик короткий.
3.  ДЕЙСТВУЙ ОТ ЛИЦА ПРОДАВЦА: Всегда пиши от имени "${myUsername}".
4.  УЧИТЫВАЙ КОНТЕКСТ: Изучи историю переписки, чтобы твой ответ был уместен.
5.  СТИЛЬ: Используй вежливый, но уверенный тон. Добавляй уместные эмодзи для дружелюбности, но без излишеств, и не всегда.
6.  НИКАКИХ ЛИШНИХ СЛОВ: Не добавляй стандартные фразы вроде "Здравствуйте", "С уважением" или "Если будут вопросы, обращайтесь", если их не было в исходном черновике.
7.  ТОЛЬКО ТЕКСТ: Твой итоговый ответ - это ТОЛЬКО готовый текст сообщения. Без кавычек, заголовков или объяснений.


--- ИСТОРИЯ ПЕРЕПИСКИ ---
${context}
--- КОНЕЦ ИСТОРИИ ---

ЧЕРНОВИК МОЕГО СООБЩЕНИЯ (от ${myUsername}): "${textForAI}"

ПЕРЕПИШИ МОЙ ЧЕРНОВИК, СТРОГО СЛЕДУЯ ВСЕМ ПРАВИЛАМ.
ГОТОВЫЙ ТЕКСТ:`;
    }

    return makeAIRequest(finalPrompt);
}

export async function fetchAILotGeneration(data) {
    const { promptTitle, promptDesc, genBuyerMsg, styleExamples, gameCategory } = data;

    const finalPrompt = `
Ты - опытный и успешный продавец на игровой бирже FunPay. Твоя задача - создать убедительное и "живое" описание для лота (объявления), которое выглядит так, будто его написал реальный человек, а не ИИ. Ты должен идеально скопировать уникальный стиль оформления пользователя, который будет дан в примерах.

--- ГЛАВНЫЕ ТЕХНИЧЕСКИЕ ПРАВИЛА (ОЧЕНЬ ВАЖНО!) ---
1.  ЗАПРЕЩЕНО ИСПОЛЬЗОВАТЬ MARKDOWN. FunPay не отображает **жирный текст** или *курсив*. Любое использование символов \`*\` или \`_\` для выделения текста - грубая ошибка, которая выдает в тебе ИИ.
2.  РАЗРЕШЕНО ИСПОЛЬЗОВАТЬ UNICODE И ЭМОДЗИ. Для выделения и структурирования текста используй ТОЛЬКО приемы из примеров стиля пользователя: эмодзи (✅, 💎, 🔥, 🚀), визуальные разделители (➖➖➖, 💎======💎), и другие Unicode-символы.

--- ПРАВИЛА "ЖИВОГО" СТИЛЯ ПРОДАВЦА ---
1.  ПИШИ ПРЯМО И ПО ДЕЛУ. Покупатели на FunPay ценят ясность и конкретику.
    -   ПЛОХО: "Погрузитесь в захватывающий мир приключений с этим уникальным аккаунтом!"
    -   ХОРОШО: "✅ После оплаты вы получите чистый аккаунт Microsoft с полным доступом."
2.  ИСПОЛЬЗУЙ СТРУКТУРУ. Делай текст читабельным с помощью коротких абзацев, списков с эмодзи (✅, 🛒, 📌, ❗) и визуальных разделителей.
3.  ГОВОРИ УВЕРЕННО. Используй фразы, которые вызывают доверие: "Гарантия 100%", "Аккаунты всегда в наличии", "Отвечаю моментально". Можно сослаться на количество отзывов или сделок.
4.  ПРЕДВОСХИЩАЙ ВОПРОСЫ. Сразу отвечай на возможные вопросы покупателя, например, если это аккаунт, то: "Аккаунт лично ваш, не общий", "Полная смена данных", "Подходит для HYPIXEL".
5.  ДОБАВЬ ВАЖНЫЕ УСЛОВИЯ.

--- СТОП-СЛОВА И ФРАЗЫ (КАТЕГОРИЧЕСКИ ЗАПРЕЩЕНО) ---
-   "Погружайтесь в мир...", "Откройте для себя..."
-   "Невероятные возможности...", "Уникальный опыт..."
-   "Данный аккаунт подарит вам..."
-   "Приобретая этот товар, вы получаете:"
-   "Не упустите шанс..."
-   Любой другой "водянистый" и обезличенный маркетинговый язык, который звучит как реклама по телевизору. Будь проще и конкретнее.

--- ОБЩИЕ ИНСТРУКЦИИ ---
1.  **Анализ стиля:** Внимательно изучи примеры названий и описаний лотов пользователя. Узнай его примерный стиль, его манеру оформления, используемые эмодзи, символы и разделители.
2.  Краткое описание: Создай яркий заголовок в стиле пользователя на основе идеи: "${promptTitle}".
3.  Подробное описание: Напиши подробное, структурированное описание на основе деталей: "${promptDesc}", следуя всем правилам "живого" стиля.
4.  Сообщение покупателю: ${genBuyerMsg ? 'Напиши короткое, дружелюбное сообщение для покупателя после оплаты в том же стиле.' : 'Сообщение покупателю генерировать НЕ нужно.'}
5.  Формат ответа: Твой ответ должен быть СТРОГО в формате JSON. Без лишних слов, объяснений или приветствий.

--- ПРИМЕРЫ СТИЛЯ ПОЛЬЗОВАТЕЛЯ (для анализа) ---
${styleExamples}
--- КОНЕЦ ПРИМЕРОВ ---

ЗАПРОС ПОЛЬЗОВАТЕЛЯ:
- Идея для заголовка: "${promptTitle}"
- Детали для описания: "${promptDesc}"

Ожидаемый формат ответа (только JSON):
{
  "title": "Сгенерированный заголовок в стиле пользователя",
  "description": "Сгенерированное подробное описание в живом стиле...",
  "buyerMessage": "${genBuyerMsg ? 'Сгенерированное сообщение для покупателя...' : ''}"
}
`;
    const result = await makeAIRequest(finalPrompt);
    if (!result.success) return result;

    const _cleanGen = (obj) => {
        if (obj && typeof obj === 'object') {
            if (obj.title) obj.title = fptNorm(obj.title);
            if (obj.description) obj.description = fptNorm(obj.description);
            if (obj.buyerMessage) obj.buyerMessage = fptNorm(obj.buyerMessage);
        }
        return obj;
    };

    try {
        const aiJson = JSON.parse(result.data);
        return { success: true, data: _cleanGen(aiJson) };
    } catch (e) {
        const jsonMatch = result.data.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            try {
                const cleanedJson = JSON.parse(jsonMatch[0]);
                return { success: true, data: _cleanGen(cleanedJson) };
            } catch (e2) {
                 return { success: false, error: `AI returned invalid JSON even after cleaning: ${e2.message}` };
            }
        }
        return { success: false, error: `AI returned invalid JSON: ${e.message}` };
    }
}

async function googleTranslateLine(text, target) {
    if (!text || !text.trim()) return text;
    const url = 'https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl='
        + encodeURIComponent(target || 'en') + '&dt=t&q=' + encodeURIComponent(text);
    const res = await fetch(url);
    if (!res.ok) throw new Error('TRANSLATE_HTTP_' + res.status);
    const json = await res.json();
    if (!json || !Array.isArray(json[0])) return text;
    return json[0].map((s) => (s && s[0] != null ? s[0] : '')).join('');
}

async function googleTranslatePreserve(text, target) {
    if (typeof text !== 'string' || !text.trim()) return text || '';
    const lines = text.split('\n');
    const out = [];
    for (const line of lines) {
        if (!line.trim()) { out.push(line); continue; }
        try { out.push(await googleTranslateLine(line, target)); }
        catch { out.push(line); }
    }
    return out.join('\n');
}

export async function fetchAITranslation(data) {
    const { title, description, buyerMessage } = data;
    try {
        const tTitle = await googleTranslatePreserve(title || '', 'en');
        const tDesc = await googleTranslatePreserve(description || '', 'en');
        const tBuyer = await googleTranslatePreserve(buyerMessage || '', 'en');
        return {
            success: true,
            data: {
                title: tTitle,
                description: tDesc,
                buyerMessage: tBuyer,
            },
        };
    } catch (e) {
        return { success: false, error: 'Ошибка перевода: ' + e.message };
    }
}

export async function fetchAIImageGeneration(prompt) {
    const finalPrompt = `
You are a creative assistant that generates parameters for an image canvas based on a user's text description.
Your response MUST be a single, valid JSON object and nothing else.

--- JSON STRUCTURE ---
{
  "bgColor1": "#RRGGBB",
  "bgColor2": "#RRGGBB",
  "text1": "UPPERCASE TITLE",
  "text1Color": "#RRGGBB",
  "text1Size": 48,
  "text2": "Subtitle text",
  "text2Color": "#RRGGBB",
  "text2Size": 24,
  "text3": "Additional text",
  "text3Color": "#RRGGBB",
  "text3Size": 20,
  "icon": "icon_name",
  "iconColor": "#RRGGBB",
  "iconSize": 100
}

--- INSTRUCTIONS ---
1.  Analyze the user's prompt and creatively translate it into the JSON parameters.
2.  Choose contrasting and harmonious colors.
3.  Pick a suitable Google Material Icon if the prompt suggests one. If not, choose a relevant one or leave it as an empty string.
4.  Extract key text for text1, text2, and text3 fields. Keep them concise.
5.  Your entire response is ONLY the JSON object. No explanations, no markdown, no comments.

--- USER PROMPT ---
"${prompt}"

--- YOUR JSON OUTPUT ---
`;
    const result = await makeAIRequest(finalPrompt);
    if (!result.success) return result;

    try {
        const aiJson = JSON.parse(result.data);
        return { success: true, data: aiJson };
    } catch (e) {
        const jsonMatch = result.data.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            try {
                const cleanedJson = JSON.parse(jsonMatch[0]);
                return { success: true, data: cleanedJson };
            } catch (e2) {
                return { success: false, error: `AI returned invalid JSON for image generation (cleaned): ${e2.message}` };
            }
        }
        return { success: false, error: `AI returned invalid JSON for image generation: ${e.message}` };
    }
}