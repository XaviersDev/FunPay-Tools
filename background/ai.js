const VERCEL_API_URL = 'https://fptools.onrender.com/api/ai'; 
const API_SECRET_KEY = 'fptoolsdim';

const SYSTEM_PROMPT = 'You are a text editing model. Follow user instructions precisely.';

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
        const response = await fetch(VERCEL_API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${API_SECRET_KEY}`
            },
            body: JSON.stringify(payload),
        });

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
        console.error(`Network error during AI request: ${error.message}`);
        return { success: false, error: `Сетевая ошибка: ${error.message}. Проверьте подключение к интернету.` };
    }
}


export async function fetchAIResponse(textForAI, context, myUsername, type = "rewrite") {
    let finalPrompt;

    if (type === 'review_reply') {
        const lotName = textForAI;
        const reviewText = context;

        finalPrompt = `
Ты — вежливый и дружелюбный продавец "${myUsername}" на игровой бирже FunPay.
Покупатель оставил отзыв на твой товар "${lotName}".
Текст отзыва: "${reviewText}"

Твоя задача — написать КРАТКИЙ, позитивный и благодарный ответ на этот отзыв.

--- ПРАВИЛА ---
1.  ОБЯЗАТЕЛЬНО упомяни название товара ("${lotName}") или его суть (например, "набор ресурс-паков").
2.  Ответ должен быть ОЧЕНЬ коротким (1-2 предложения).
3.  Используй дружелюбный тон и уместные эмодзи (например, 😊, 👍, 🎉, ✨).
4.  Поблагодари покупателя за отзыв и/или покупку.
5.  Не используй Markdown, жирный текст или курсив.
6.  Твой ответ — это ТОЛЬКО готовый текст. Без кавычек, заголовков или объяснений.

Пример хорошего ответа:
Спасибо за ваш отзыв! Рад, что вам понравился наш пак с ресурс-паками. Обращайтесь еще! 😊👍

ГОТОВЫЙ ТЕКСТ ОТВЕТА:`;

    } else if (type === 'translate_to_russian') {
        finalPrompt = `Переведи следующий текст на русский язык. Верни ТОЛЬКО перевод, без пояснений и кавычек:\n\n${textForAI}`;

    } else if (type === 'lot_audit_raw') {
        // Pass the full constructed prompt directly — no wrapping
        finalPrompt = textForAI;

    } else if (type === 'lot_audit') {
        // For lot_audit, context contains the full system prompt, textForAI is the user message
        // Build multi-turn conversation from context
        finalPrompt = `${context}\n\nСообщение продавца: ${textForAI}\n\nОтветь на русском языке кратко и по существу.`;

    } else { // Логика по умолчанию для переписывания текста в чате
        finalPrompt = `
Ты — ИИ-ассистент, который помогает продавцу "${myUsername}" на FunPay. Твоя задача — переписать его черновик сообщения, сохранив основной смысл, но сделав его вежливым, профессиональным и четким.

--- ОСНОВНЫЕ ПРАВИЛА ---
1.  СОХРАНЯЙ СМЫСЛ: Твой ответ должен передавать ТОТ ЖЕ САМЫЙ смысл, что и черновик продавца. Не добавляй новые идеи, вопросы или предложения от себя.
2.  БУДЬ КРАТОК: Ответ должен быть настолько же коротким, насколько позволяет исходное сообщение. Не пиши длинные тексты, если черновик короткий.
3.  ДЕЙСТВУЙ ОТ ЛИЦА ПРОДАВЦА: Всегда пиши от имени "${myUsername}".
4.  УЧИТЫВАЙ КОНТЕКСТ: Изучи историю переписки, чтобы твой ответ был уместен.
5.  СТИЛЬ: Используй вежливый, но уверенный тон. Добавляй уместные эмодзи для дружелюбности, но без излишеств, и не всегда.
6.  НИКАКИХ ЛИШНИХ СЛОВ: Не добавляй стандартные фразы вроде "Здравствуйте", "С уважением" или "Если будут вопросы, обращайтесь", если их не было в исходном черновике.
7.  ТОЛЬКО ТЕКСТ: Твой итоговый ответ — это ТОЛЬКО готовый текст сообщения. Без кавычек, заголовков или объяснений.


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
Ты — опытный и успешный продавец на игровой бирже FunPay. Твоя задача — создать убедительное и "живое" описание для лота (объявления), которое выглядит так, будто его написал реальный человек, а не ИИ. Ты должен идеально скопировать уникальный стиль оформления пользователя, который будет дан в примерах.

--- ГЛАВНЫЕ ТЕХНИЧЕСКИЕ ПРАВИЛА (ОЧЕНЬ ВАЖНО!) ---
1.  ЗАПРЕЩЕНО ИСПОЛЬЗОВАТЬ MARKDOWN. FunPay не отображает **жирный текст** или *курсив*. Любое использование символов \`*\` или \`_\` для выделения текста — грубая ошибка, которая выдает в тебе ИИ.
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
                 return { success: false, error: `AI returned invalid JSON even after cleaning: ${e2.message}` };
            }
        }
        return { success: false, error: `AI returned invalid JSON: ${e.message}` };
    }
}

export async function fetchAITranslation(data) {
    const { title, description, buyerMessage } = data;
    
    const prompt = `
Translate the following Russian texts for a gaming marketplace into natural-sounding English. Preserve emojis, formatting (like line breaks), and any special characters or symbols.

Your response MUST be in JSON format only, with no extra text.

Input JSON:
{
  "title": "${title.replace(/"/g, '\\"')}",
  "description": "${description.replace(/"/g, '\\"')}",
  "buyerMessage": "${(buyerMessage || "").replace(/"/g, '\\"')}"
}

Output JSON:
`;

    const result = await makeAIRequest(prompt);
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
                return { success: false, error: `AI returned invalid JSON for translation (cleaned): ${e2.message}` };
            }
        }
        return { success: false, error: `AI returned invalid JSON for translation: ${e.message}` };
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