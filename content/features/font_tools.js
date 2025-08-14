// content/features/font_tools.js

function initializeFontTools() {
    // Убедимся, что мы на странице редактирования или создания лота
    const header = document.querySelector('h1.page-header');
    if (!header || !(header.textContent.includes('Редактирование предложения') || header.textContent.includes('Добавление предложения'))) {
        return;
    }

    // Проверяем, не были ли элементы управления добавлены ранее
    if (document.querySelector('.fp-tools-font-controls')) {
        return;
    }

    const fonts = {
      "small": { "а": "ᴀ", "б": "б", "в": "ʙ", "г": "ᴦ", "д": "д", "е": "ᴇ", "ё": "ё", "ж": "ж", "з": "з", "и": "и", "й": "й", "к": "ᴋ", "л": "ᴧ", "м": "ʍ", "н": "н", "о": "о", "п": "ᴨ", "р": "ᴩ", "с": "ᴄ", "т": "ᴛ", "у": "у", "ф": "ɸ", "х": "х", "ц": "ц", "ч": "ч", "ш": "ɯ", "щ": "щ", "ъ": "ъ", "ы": "ы", "ь": "ь", "э": "϶", "ю": "ю", "я": "я", "a": "ᴀ", "b": "ʙ", "c": "ᴄ", "d": "ᴅ", "e": "ᴇ", "f": "ꜰ", "g": "ɢ", "h": "ʜ", "i": "ɪ", "j": "ᴊ", "k": "ᴋ", "l": "ʟ", "m": "ᴍ", "n": "ɴ", "o": "ᴏ", "p": "ᴘ", "q": "ǫ", "r": "ʀ", "s": "s", "t": "ᴛ", "u": "ᴜ", "v": "ᴠ", "w": "ᴡ", "x": "x", "y": "ʏ", "z": "ᴢ" },
      "canad": { "а": "ᗣ", "б": "ᘜ", "в": "ᙖ", "г": "ᒋ", "д": "ᗪ", "е": "ᙓ", "ё": "ᕧ", "ж": "ᙧ", "з": "ᙐ", "и": "ᑌ", "й": "ᕫ", "к": "Ꮶ", "л": "ᙁ", "м": "ᗰ", "н": "ᕼ", "о": "ᗝ", "п": "ᑎ", "р": "ᖘ", "с": "ᙅ", "т": "ᙢ", "у": "Ꮍ", "ф": "ᙨ", "х": "ⵋ", "ц": "ᘈ", "ч": "ᔦ", "ш": "ᗯ", "щ": "ᘺ", "ъ": "ᕹ", "ы": "ᕠ", "ь": "ᖚ", "э": "ᑓ", "ю": "ᕡ", "я": "ᖆ" },
      "runi": { "а": "ᚤ", "б": "Ꮆ", "в": "ᛒ", "г": "ᛚ", "д": "ᚦ", "е": "ᛊ", "ё": "ᛊ", "ж": "ᛯ", "з": "℥", "и": "ᛋ", "й": "ᛋ", "к": "ᛕ", "л": "ᚳ", "м": "ᛖ", "н": "ᚺ", "о": "ᛜ", "п": "ᚢ", "р": "ᚹ", "с": "ᛈ", "т": "ᛠ", "у": "ᚴ", "ф": "ᛄ", "х": "ᚷ", "ц": "ᛪ", "ч": "ᛩ", "ш": "Ⱎ", "щ": "Ⱎᛧ", "ъ": "Ⱃ", "ы": "Ⱃᛁ", "ь": "Ⱃ", "э": "Ⰵ", "ю": "ᚿθ", "я": "ᚱ", "a": "ᚣ", "b": "ᛒ", "c": "ᛈ", "d": "ᚦ", "e": "ᛊ", "f": "ᚪ", "g": "ᛈᛧ", "h": "ᚻ", "i": "ᛙ", "j": "𐐈", "k": "ᛕ", "l": "ᚳ", "m": "ᛖ", "n": "ᚺ", "o": "ᛟ", "p": "ᚹ", "q": "𐌒", "r": "ᚱ", "s": "𐐠", "t": "ᛠ", "u": "ᛘ", "v": "ᛉ", "w": "𐐎", "x": "ᚷ", "y": "ᚴ", "z": "ᛢ" },
      "efilopia": { "а": "ል", "б": "ፔ", "в": "ፎ", "г": "ና", "д": "ሏ", "е": "ይ", "ё": "ይ", "ж": "ሦ", "з": "ን", "и": "ሀ", "й": "ህ", "к": "ኸ", "л": "በ", "м": "ጠ", "н": "ዘ", "о": "ዐ", "п": "ከ", "р": "የ", "с": "ር", "т": "ፐ", "у": "ነ", "ф": "ዋ", "х": "ጰ", "ц": "ህ", "ч": "ሃ", "ш": "ሠ", "щ": "ሡ", "ъ": "ፘ", "ы": "ፊ", "ь": "ሪ", "э": "ጓ", "ю": "ሬ", "я": "ጸ" },
      "angle": { "а": "⧼а⧽", "б": "⧼б⧽", "в": "⧼в⧽", "г": "⧼г⧽", "д": "⧼д⧽", "е": "⧼е⧽", "ё": "⧼ё⧽", "ж": "⧼ж⧽", "з": "⧼з⧽", "и": "⧼и⧽", "й": "⧼й⧽", "к": "⧼к⧽", "л": "⧼л⧽", "м": "⧼м⧽", "н": "⧼н⧽", "о": "⧼о⧽", "п": "⧼п⧽", "р": "⧼р⧽", "с": "⧼с⧽", "т": "⧼т⧽", "у": "⧼у⧽", "ф": "⧼ф⧽", "х": "⧼х⧽", "ц": "⧼ц⧽", "ч": "⧼ч⧽", "ш": "⧼ш⧽", "щ": "⧼щ⧽", "ъ": "⧼ъ⧽", "ы": "⧼ы⧽", "ь": "⧼ь⧽", "э": "⧼э⧽", "ю": "⧼ю⧽", "я": "⧼я⧽", "a": "⧼a⧽", "b": "⧼b⧽", "c": "⧼c⧽", "d": "⧼d⧽", "e": "⧼e⧽", "f": "⧼f⧽", "g": "⧼g⧽", "h": "⧼h⧽", "i": "⧼i⧽", "j": "⧼j⧽", "k": "⧼k⧽", "l": "⧼l⧽", "m": "⧼m⧽", "n": "⧼n⧽", "o": "⧼o⧽", "p": "⧼p⧽", "q": "⧼q⧽", "r": "⧼r⧽", "s": "⧼s⧽", "t": "⧼t⧽", "u": "⧼u⧽", "v": "⧼v⧽", "w": "⧼w⧽", "x": "⧼x⧽", "y": "⧼y⧽", "z": "⧼z⧽" }
    };
    const symbols = [ '★', '☆', '✪', '✯', '✡', '✩', '✧', '✵', '✶', '✷', '✸', '✹', '⥉', '⥋', '⥌', '⥍', '⥎', '⥏', '⥐', '⥑', '⥒', '⥓', '⥔', '⥕', '✔', '✓', '☑', '✅', '✖', '❌', '✘', '❎', '❤', '♡', '♥', '❣', '✨', '⚡', '❄', '🔥', '☘', '⚜', '⚫', '⚪', '◼', '◻', '●', '○', '➥', '➦', '➧', '➨', '➚', '➘', '➙', '➛', '➜', '➝', '➞', '➟', '➡', '➢', '➣', '➤', '⮞', '⮟', '⮠', '⮡', '⮢', '⮣', '⮤', '⮥', '▶', '◀', '▲', '▼', '►', '◄', '⧎', '⧏', '⧐', '⧑', '⧒', '⧓', '⚔', '⚖', '⚕', '⚓', '⚙', '⚠', '⛔', '☢', '☣', '⬆', '↗', '➡' ];

    let activeTextarea = null;

    const controlBlock = document.querySelector(".lot-fields-multilingual");
    if (!controlBlock) return;

    const controlsHtml = `
        <div class="form-group fp-tools-font-controls">
            <div class="font-selector">
                <label class="control-label">Шрифт</label>
                <select class="form-control" id="fpToolsFontSelect">
                    <option value="">Стандартный</option>
                    <option value="small">ᴨоᴨᴩобуй ϶ᴛоᴛ ɯᴩиɸᴛ</option>
                    <option value="canad">ᴨᗝᴨᴩᗝᘜᎽᕫ ϶ᴛᗝᴛ ɯᴩᑌɸᴛ</option>
                    <option value="runi">ᚢᛜᚢᚹᛜᎶᚴᛋ Ⰵᛠᛜᛠ Ⱎᚹᛋᛄᛠ</option>
                    <option value="efilopia">ከዐከየዐፔነህ ጓፐዐፐ ሠየሀዋፐ</option>
                    <option value="angle">⧼п⧽⧼о⧽⧼п⧽⧼р⧽⧼о⧽⧼б⧽⧼у⧽⧼й⧽ ⧼э⧽⧼т⧽⧼о⧽⧼т⧽ ⧼ш⧽⧼р⧽⧼и⧽⧼ф⧽⧼т⧽</option>
                </select>
            </div>
            <button type="button" class="btn btn-default" id="fpToolsKeyboardToggleBtn">
                <i class="fa fa-keyboard-o" aria-hidden="true"></i> Клавиатура
            </button>
        </div>
        <div class="fp-tools-symbols-panel" style="display: none;"></div>
    `;
    
    controlBlock.insertAdjacentHTML('beforeend', controlsHtml);

    // Отслеживаем активное поле ввода (ЛЮБОЕ: textarea или input)
    document.querySelectorAll('textarea, input[type="text"]').forEach(element => {
        element.addEventListener('focus', function() {
            activeTextarea = this;
        });
    });

    // Обработчик автозамены шрифта (теперь для всех полей .lot-field-input)
    document.querySelectorAll(".lot-field-input, input[name='fields[short_desc][ru]']").forEach(input => {
        input.addEventListener("input", function(event) {
            const fontSelect = document.getElementById("fpToolsFontSelect");
            const selectedFont = fontSelect.value;
            if (!selectedFont || !event.data) return;

            const lastChar = event.data;
            const newChar = fonts[selectedFont][lastChar.toLowerCase()];

            if (newChar) {
                const currentVal = this.value;
                const cursorPos = this.selectionStart;
                this.value = currentVal.slice(0, cursorPos - 1) + newChar + currentVal.slice(cursorPos);
                this.selectionStart = this.selectionEnd = cursorPos;
            }
        });
    });

    // Обработчик для кнопки "Клавиатура"
    document.getElementById("fpToolsKeyboardToggleBtn").addEventListener("click", function() {
        const panel = document.querySelector(".fp-tools-symbols-panel");
        if (panel.innerHTML === '') {
            panel.innerHTML = symbols.map(symbol => `<span class="fp-tools-symbol-char">${symbol}</span>`).join('');
        }
        panel.style.display = panel.style.display === 'none' ? 'grid' : 'none';
    });

    // Обработчик клика по символу
    document.addEventListener("click", function(event) {
        if (!event.target.classList.contains('fp-tools-symbol-char')) return;
        
        if (activeTextarea) {
            const currentVal = activeTextarea.value;
            const cursorPos = activeTextarea.selectionStart;
            const symbol = event.target.textContent;
            
            const newVal = currentVal.substring(0, cursorPos) + symbol + currentVal.substring(cursorPos);
            activeTextarea.value = newVal;
            
            const newCursorPos = cursorPos + symbol.length;
            activeTextarea.selectionStart = activeTextarea.selectionEnd = newCursorPos;
            activeTextarea.focus();
        } else {
            showNotification("Сначала кликните на любое поле для ввода текста.", true);
        }
    });
}