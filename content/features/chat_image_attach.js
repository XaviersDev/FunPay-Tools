// content/features/chat_image_attach.js
// =============================================================================
// FPT - КАСТОМНАЯ СКРЕПКА + ТЕЛЕГРАМ-СТАЙЛ МЕНЮ ПРИКРЕПЛЕНИЯ
//
// Полностью заменяет нативную скрепку FunPay. Возможности:
//   • мульти-выбор изображений в проводнике;
//   • окно как в Telegram: сетка превью, на каждой карточке ✕ (удалить) и ⋮
//     (заменить / редактировать), снизу подпись «Сообщение...» и кнопки
//     Добавить / Отмена / Отправить;
//   • встроенный мини-редактор: карандаш, ластик, выбор цвета и толщины кисти,
//     обрезка (crop);
//   • моментальная отправка: картинки СРАЗУ появляются в чате с крутящимся
//     индикатором ожидания (как в Telegram), индикатор снимается, когда FunPay
//     реально показал отправленное сообщение;
//   • порядок: СНАЧАЛА ВСЕ ФОТО → ПОТОМ ТЕКСТ-подпись.
//
// Отправка через существующие background-экшены 'fptSendImage' / 'fptSendChatText'.
// Стиль - нейтральный тёмный + оранжевый акцент FunPay (никакого фиолетового).
// =============================================================================

(function () {
    'use strict';

    const MAX_FILE_BYTES = 7 * 1024 * 1024;  // FunPay: 7 МБ на файл
    const BTN_ICON = 'attach_file';          // минималистичная скрепка

    let basket = [];        // [{ id, dataUrl, name }]
    let modalEl = null;
    let pendingReplaceId = null; // id карточки, которую заменяем через «заменить»
    let borrowedText = '';       // текст, временно забранный из поля «Написать...»

    // ───────────────────────── утилиты ─────────────────────────

    function uid() { return 'i' + Math.random().toString(36).slice(2, 9); }

    function getChatContext() {
        let chatId = null;
        // 1) явное поле/атрибут node (берём непустое значение)
        const nodeInput = document.querySelector('input[name="node"]');
        if (nodeInput && nodeInput.value) chatId = nodeInput.value;
        if (!chatId) {
            const dn = document.querySelector('[data-node]');
            if (dn) chatId = dn.getAttribute('data-node');
        }
        // 2) из URL - ВЕСЬ токен node (и числовой, и вида users-6402834-16606624)
        if (!chatId) {
            const m = location.href.match(/[?&]node=([^&#\s]+)/);
            if (m) chatId = decodeURIComponent(m[1]);
        }
        // 3) активный чат во float-режиме: .chat[data-id] / .contact-item.active
        if (!chatId) {
            const floatChat = document.querySelector('.chat.chat-float[data-id], .chat[data-id]');
            if (floatChat) chatId = floatChat.getAttribute('data-id');
        }
        if (!chatId) {
            const active = document.querySelector('.contact-item.active[data-id]');
            if (active) chatId = active.getAttribute('data-id');
        }
        const nameEl = document.querySelector('.chat-header .media-user-name, .chat-full-header .media-user-name');
        const chatName = nameEl ? nameEl.textContent.trim() : '';
        return { chatId, chatName };
    }

    function readFileAsDataUrl(file) {
        return new Promise((resolve, reject) => {
            const r = new FileReader();
            r.onload = () => resolve(r.result);
            r.onerror = () => reject(r.error);
            r.readAsDataURL(file);
        });
    }

    function notify(text, isError) {
        if (typeof showNotification === 'function') { showNotification(text, !!isError); return; }
        console[isError ? 'error' : 'log']('FP Tools: ' + text);
    }

    // Берёт фон/текст у самой страницы, чтобы окно совпадало с темой FunPay
    // (в т.ч. кастомной или светлой). Ищет ближайший непрозрачный фон.
    function pageSurface() {
        const candidates = [
            document.querySelector('.chat-contacts'),
            document.querySelector('.chat'),
            document.querySelector('.content-with-cd-wide'),
            document.body
        ].filter(Boolean);
        let bg = '', color = '';
        for (const el of candidates) {
            const cs = getComputedStyle(el);
            if (!color) color = cs.color;
            const b = cs.backgroundColor;
            if (b && b !== 'rgba(0, 0, 0, 0)' && b !== 'transparent') { bg = b; break; }
        }
        if (!bg) bg = getComputedStyle(document.body).backgroundColor || '#1e1e1e';
        if (!color) color = getComputedStyle(document.body).color || '#e0e0e0';
        return { bg, color };
    }
    function applyThemeSurface(el) {
        if (!el) return;
        const { bg, color } = pageSurface();
        el.style.backgroundColor = bg;
        el.style.color = color;
    }

    function plural(n) {
        const a = Math.abs(n) % 100, b = a % 10;
        if (a > 10 && a < 20) return 'изображений';
        if (b > 1 && b < 5) return 'изображения';
        if (b === 1) return 'изображение';
        return 'изображений';
    }

    // ───────────── добавление файлов из проводника ─────────────

    async function addFiles(fileList) {
        const files = Array.from(fileList || []);
        if (!files.length) return;
        let skipped = 0;
        const collected = [];
        for (const f of files) {
            if (!f.type.startsWith('image/')) { skipped++; continue; }
            if (f.size > MAX_FILE_BYTES) { skipped++; continue; }
            try {
                const dataUrl = await readFileAsDataUrl(f);
                collected.push({ id: uid(), dataUrl, name: f.name || 'image' });
            } catch { skipped++; }
        }
        if (skipped) notify(`Пропущено файлов: ${skipped} (не изображение или > 7 МБ).`, true);

        if (pendingReplaceId && collected.length) {
            // режим «заменить»: подменяем одну картинку первой выбранной
            const idx = basket.findIndex(b => b.id === pendingReplaceId);
            if (idx !== -1) { basket[idx].dataUrl = collected[0].dataUrl; basket[idx].name = collected[0].name; }
            pendingReplaceId = null;
        } else {
            basket.push(...collected);
        }

        if (basket.length) openModal();
        renderGrid();
    }

    function pickFiles(multiple = true) {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        input.multiple = multiple;
        input.style.display = 'none';
        input.addEventListener('change', () => { addFiles(input.files); input.remove(); });
        document.body.appendChild(input);
        input.click();
    }

    // ───────────────────────── модалка ─────────────────────────

    function openModal() {
        if (modalEl) return;
        modalEl = document.createElement('div');
        modalEl.className = 'fpt-tg-overlay';
        modalEl.innerHTML = `
            <div class="fpt-tg-modal" role="dialog" aria-label="Отправка изображений">
                <div class="fpt-tg-head">
                    <span class="fpt-tg-title" id="fptTgTitle"></span>
                    <button type="button" class="fpt-tg-x" title="Закрыть">
                        <span class="material-symbols-rounded">close</span>
                    </button>
                </div>
                <div class="fpt-tg-grid" id="fptTgGrid"></div>
                <div class="fpt-tg-caption">
                    <textarea class="fpt-tg-msg" id="fptTgMsg" rows="1" placeholder="Сообщение..."></textarea>
                </div>
                <div class="fpt-tg-foot">
                    <button type="button" class="fpt-tg-btn fpt-tg-add">Добавить</button>
                    <button type="button" class="fpt-tg-btn fpt-tg-cancel">Отмена</button>
                    <button type="button" class="fpt-tg-btn fpt-tg-send btn btn-gray">Отправить</button>
                </div>
            </div>`;
        document.body.appendChild(modalEl);

        // фон и цвет окна берём от страницы (FunPay/кастомная тема), чтобы
        // элементы не были «чёрными на белом» - поддержка любой темы.
        applyThemeSurface(modalEl.querySelector('.fpt-tg-modal'));

        const msg = modalEl.querySelector('#fptTgMsg');

        // как в Telegram: то, что уже набрано в поле «Написать...», переносим в подпись
        // и очищаем исходное поле, чтобы не отправилось дважды.
        const nativeInput = document.querySelector('.chat-form-input textarea, .chat-form textarea[name="content"]');
        if (nativeInput && nativeInput.value.trim()) {
            borrowedText = nativeInput.value;
            msg.value = nativeInput.value;
            nativeInput.value = '';
            nativeInput.dispatchEvent(new Event('input', { bubbles: true }));
        }

        const grow = () => { msg.style.height = 'auto'; msg.style.height = Math.min(msg.scrollHeight, 120) + 'px'; };
        msg.addEventListener('input', grow);
        requestAnimationFrame(grow);
        msg.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); doSend(); }
        });

        modalEl.querySelector('.fpt-tg-x').addEventListener('click', closeModal);
        modalEl.querySelector('.fpt-tg-cancel').addEventListener('click', closeModal);
        modalEl.querySelector('.fpt-tg-add').addEventListener('click', () => pickFiles(true));
        modalEl.querySelector('.fpt-tg-send').addEventListener('click', doSend);
        modalEl.addEventListener('mousedown', (e) => { if (e.target === modalEl) closeModal(); });
        document.addEventListener('keydown', escClose);

        requestAnimationFrame(() => { modalEl.classList.add('open'); msg.focus(); });
    }

    function escClose(e) {
        // не закрываем модалку, если открыт редактор (у него свой Esc)
        if (e.key === 'Escape' && modalEl && !document.querySelector('.fpt-ed-overlay')) closeModal();
    }

    function closeModal(opts) {
        if (!modalEl) return;
        document.removeEventListener('keydown', escClose);
        // если закрыли БЕЗ отправки - вернём забранный текст обратно в поле «Написать...»
        if (!(opts && opts.sent) && borrowedText) {
            const ni = document.querySelector('.chat-form-input textarea, .chat-form textarea[name="content"]');
            if (ni) { ni.value = borrowedText; ni.dispatchEvent(new Event('input', { bubbles: true })); }
        }
        borrowedText = '';
        // ВСЕГДА очищаем выбранные картинки при закрытии меню, иначе при
        // следующем открытии всплывут старые (баг: «остались 6 картинок»).
        basket = [];
        pendingReplaceId = null;
        const el = modalEl; modalEl = null;
        el.classList.remove('open');
        setTimeout(() => el.remove(), 150);
    }

    function renderGrid() {
        if (!modalEl) return;
        const grid = modalEl.querySelector('#fptTgGrid');
        const title = modalEl.querySelector('#fptTgTitle');
        const n = basket.length;
        title.textContent = `Выбрано ${n} ${plural(n)}`;

        grid.innerHTML = '';
        basket.forEach(item => {
            const cell = document.createElement('div');
            cell.className = 'fpt-tg-cell';
            cell.innerHTML = `
                <img src="${item.dataUrl}" alt="">
                <button type="button" class="fpt-tg-cell-x" title="Удалить">
                    <span class="material-symbols-rounded">close</span>
                </button>
                <button type="button" class="fpt-tg-cell-menu" title="Ещё">
                    <span class="material-symbols-rounded">more_vert</span>
                </button>`;
            cell.querySelector('img').addEventListener('click', () => openViewer(item.dataUrl));
            cell.querySelector('.fpt-tg-cell-x').addEventListener('click', (e) => {
                e.stopPropagation();
                basket = basket.filter(b => b.id !== item.id);
                if (!basket.length) { closeModal(); return; }
                renderGrid();
            });
            cell.querySelector('.fpt-tg-cell-menu').addEventListener('click', (e) => {
                e.stopPropagation();
                openCellMenu(e.currentTarget, item.id);
            });
            grid.appendChild(cell);
        });
    }

    // мини-меню карточки: заменить / редактировать
    function openCellMenu(anchor, id) {
        closeCellMenu();
        const m = document.createElement('div');
        m.className = 'fpt-tg-cellmenu';
        m.innerHTML = `
            <button type="button" data-act="edit"><span class="material-symbols-rounded">edit</span>Редактировать</button>
            <button type="button" data-act="replace"><span class="material-symbols-rounded">find_replace</span>Заменить</button>`;
        document.body.appendChild(m);
        applyThemeSurface(m);
        const r = anchor.getBoundingClientRect();
        m.style.left = Math.min(r.left, window.innerWidth - 190) + 'px';
        m.style.top = (r.bottom + 4) + 'px';
        m.addEventListener('click', (e) => {
            const b = e.target.closest('[data-act]'); if (!b) return;
            const act = b.getAttribute('data-act');
            closeCellMenu();
            if (act === 'replace') { pendingReplaceId = id; pickFiles(false); }
            if (act === 'edit') { openEditor(id); }
        });
        setTimeout(() => document.addEventListener('mousedown', cellMenuOutside), 0);
    }
    function cellMenuOutside(e) {
        if (!e.target.closest('.fpt-tg-cellmenu')) closeCellMenu();
    }
    function closeCellMenu() {
        document.removeEventListener('mousedown', cellMenuOutside);
        document.querySelectorAll('.fpt-tg-cellmenu').forEach(el => el.remove());
    }

    // простой просмотр одной картинки
    function openViewer(dataUrl) {
        const v = document.createElement('div');
        v.className = 'fpt-tg-viewer';
        v.innerHTML = `<img src="${dataUrl}" alt="">`;
        v.addEventListener('click', () => { v.classList.remove('open'); setTimeout(() => v.remove(), 150); });
        document.body.appendChild(v);
        requestAnimationFrame(() => v.classList.add('open'));
    }

    // ───────────────────────── редактор (рисование + обрезка) ─────────────────────────

    function openEditor(id) {
        const item = basket.find(b => b.id === id);
        if (!item) return;

        const ov = document.createElement('div');
        ov.className = 'fpt-ed-overlay';
        ov.innerHTML = `
            <div class="fpt-ed">
                <div class="fpt-ed-toolbar">
                    <div class="fpt-ed-tools">
                        <button class="fpt-ed-tool active" data-tool="pen" title="Карандаш"><span class="material-symbols-rounded">edit</span></button>
                        <button class="fpt-ed-tool" data-tool="eraser" title="Ластик"><span class="material-symbols-rounded">ink_eraser</span></button>
                        <button class="fpt-ed-tool" data-tool="crop" title="Обрезка"><span class="material-symbols-rounded">crop</span></button>
                    </div>
                    <div class="fpt-ed-colors" id="fptEdColors"></div>
                    <div class="fpt-ed-size">
                        <span class="material-symbols-rounded">line_weight</span>
                        <input type="range" id="fptEdSize" min="2" max="40" value="6">
                    </div>
                    <div class="fpt-ed-actions">
                        <button class="fpt-ed-mini" data-act="undo" title="Отменить"><span class="material-symbols-rounded">undo</span></button>
                        <button class="fpt-ed-apply-crop" data-act="applycrop" style="display:none">Обрезать</button>
                        <button class="fpt-ed-cancel" data-act="cancel">Отмена</button>
                        <button class="fpt-ed-save" data-act="save">Готово</button>
                    </div>
                </div>
                <div class="fpt-ed-stage" id="fptEdStage">
                    <canvas id="fptEdCanvas"></canvas>
                    <div class="fpt-ed-crop" id="fptEdCrop" style="display:none"></div>
                </div>
            </div>`;
        document.body.appendChild(ov);
        applyThemeSurface(ov.querySelector('.fpt-ed'));
        requestAnimationFrame(() => ov.classList.add('open'));

        const canvas = ov.querySelector('#fptEdCanvas');
        const ctx = canvas.getContext('2d');
        const stage = ov.querySelector('#fptEdStage');
        const cropBox = ov.querySelector('#fptEdCrop');
        const PALETTE = ['#ffffff', '#000000', '#ff3b30', '#ff9500', '#ffcc00', '#34c759', '#0a84ff', '#bf5af2'];

        let tool = 'pen';
        let color = '#ff3b30';
        let size = 6;
        let drawing = false;
        let lastX = 0, lastY = 0;
        const history = [];

        // палитра
        const colorsWrap = ov.querySelector('#fptEdColors');
        PALETTE.forEach((c, i) => {
            const sw = document.createElement('button');
            sw.className = 'fpt-ed-color' + (c === color ? ' active' : '');
            sw.style.background = c;
            sw.addEventListener('click', () => {
                color = c;
                colorsWrap.querySelectorAll('.fpt-ed-color').forEach(x => x.classList.remove('active'));
                sw.classList.add('active');
                if (tool === 'eraser') setTool('pen');
            });
            colorsWrap.appendChild(sw);
        });

        // Двухслойная модель, как в Telegram:
        //   baseCanvas  - оригинал (после обрезки), не трогается кистью;
        //   drawCanvas  - прозрачный слой только с пользовательскими штрихами;
        //   canvas      - то, что видно: композит base + draw.
        // Ластик стирает с drawCanvas (destination-out) → проявляется оригинал,
        // а НЕ чёрный/прозрачный провал.
        const baseCanvas = document.createElement('canvas');
        const baseCtx = baseCanvas.getContext('2d', { willReadFrequently: true });
        const drawCanvas = document.createElement('canvas');
        const drawCtx = drawCanvas.getContext('2d', { willReadFrequently: true });

        function composite() {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(baseCanvas, 0, 0);
            ctx.drawImage(drawCanvas, 0, 0);
        }

        // загрузка изображения (с ограничением размера для производительности)
        const baseImg = new Image();
        baseImg.onload = () => {
            const maxDim = 1400;
            let w = baseImg.naturalWidth, h = baseImg.naturalHeight;
            const scale = Math.min(1, maxDim / Math.max(w, h));
            w = Math.round(w * scale); h = Math.round(h * scale);
            canvas.width = w; canvas.height = h;
            baseCanvas.width = w; baseCanvas.height = h;
            drawCanvas.width = w; drawCanvas.height = h;
            fitStage();
            baseCtx.drawImage(baseImg, 0, 0, w, h);
            composite();
            pushHistory();
        };
        baseImg.src = item.dataUrl;

        function fitStage() {
            // вписываем канвас в доступную область, сохраняя пропорции
            const availW = stage.clientWidth - 24;
            const availH = stage.clientHeight - 24;
            const r = Math.min(availW / canvas.width, availH / canvas.height, 1);
            canvas.style.width = Math.round(canvas.width * r) + 'px';
            canvas.style.height = Math.round(canvas.height * r) + 'px';
        }
        window.addEventListener('resize', fitStage);

        function pushHistory() {
            try {
                history.push({
                    base: baseCtx.getImageData(0, 0, baseCanvas.width, baseCanvas.height),
                    draw: drawCtx.getImageData(0, 0, drawCanvas.width, drawCanvas.height),
                    w: canvas.width, h: canvas.height
                });
            } catch (e) {}
            if (history.length > 20) history.shift();
        }
        function undo() {
            if (history.length <= 1) return;
            history.pop();
            const s = history[history.length - 1];
            canvas.width = s.w; canvas.height = s.h;
            baseCanvas.width = s.w; baseCanvas.height = s.h;
            drawCanvas.width = s.w; drawCanvas.height = s.h;
            baseCtx.putImageData(s.base, 0, 0);
            drawCtx.putImageData(s.draw, 0, 0);
            composite();
            fitStage();
        }

        // координаты с учётом масштаба отображения
        function pos(e) {
            const rect = canvas.getBoundingClientRect();
            const sx = canvas.width / rect.width;
            const sy = canvas.height / rect.height;
            const cx = (e.touches ? e.touches[0].clientX : e.clientX) - rect.left;
            const cy = (e.touches ? e.touches[0].clientY : e.clientY) - rect.top;
            return { x: cx * sx, y: cy * sy };
        }

        function startDraw(e) {
            if (tool === 'crop') return;
            if (e.button !== undefined && e.button !== 0) return; // только ЛКМ
            drawing = true;
            const p = pos(e);
            lastX = p.x; lastY = p.y;
            drawCtx.lineCap = 'round'; drawCtx.lineJoin = 'round';
            e.preventDefault();
        }
        function moveDraw(e) {
            if (!drawing) return;
            const p = pos(e);
            drawCtx.lineWidth = (tool === 'eraser' ? size * 2 : size);
            if (tool === 'eraser') {
                // стираем ТОЛЬКО пользовательские штрихи со слоя draw -
                // под ними проявляется оригинал из baseCanvas (не чёрный!)
                drawCtx.globalCompositeOperation = 'destination-out';
                drawCtx.strokeStyle = 'rgba(0,0,0,1)';
            } else {
                drawCtx.globalCompositeOperation = 'source-over';
                drawCtx.strokeStyle = color;
            }
            drawCtx.beginPath();
            drawCtx.moveTo(lastX, lastY);
            drawCtx.lineTo(p.x, p.y);
            drawCtx.stroke();
            lastX = p.x; lastY = p.y;
            composite();
            e.preventDefault();
        }
        function endDraw() {
            if (!drawing) return;
            drawing = false;
            drawCtx.globalCompositeOperation = 'source-over';
            pushHistory();
        }
        canvas.addEventListener('mousedown', startDraw);
        canvas.addEventListener('mousemove', moveDraw);
        window.addEventListener('mouseup', endDraw);
        canvas.addEventListener('touchstart', startDraw, { passive: false });
        canvas.addEventListener('touchmove', moveDraw, { passive: false });
        canvas.addEventListener('touchend', endDraw);

        // тулы
        function setTool(t) {
            tool = t;
            ov.querySelectorAll('.fpt-ed-tool').forEach(x => x.classList.toggle('active', x.dataset.tool === t));
            const applyCropBtn = ov.querySelector('.fpt-ed-apply-crop');
            if (t === 'crop') { enterCrop(); applyCropBtn.style.display = ''; }
            else { exitCrop(); applyCropBtn.style.display = 'none'; }
        }
        ov.querySelectorAll('.fpt-ed-tool').forEach(b => {
            b.addEventListener('click', () => setTool(b.dataset.tool));
        });
        ov.querySelector('#fptEdSize').addEventListener('input', (e) => { size = +e.target.value; });

        // ── обрезка (как в мессенджерах: 4 угла + 4 стороны + перенос) ──
        // crop хранится в координатах ОТНОСИТЕЛЬНО canvas (px на экране), а не stage,
        // чтобы рамка всегда лежала ровно поверх картинки.
        let crop = null;          // { x, y, w, h } в экранных px относительно canvas
        let cropDrag = null;

        // геометрия canvas относительно stage (для позиционирования рамки)
        function canvasOffset() {
            const r = canvas.getBoundingClientRect();
            const s = stage.getBoundingClientRect();
            return { left: r.left - s.left, top: r.top - s.top, w: r.width, h: r.height };
        }

        function enterCrop() {
            const o = canvasOffset();
            const w = o.w * 0.8, h = o.h * 0.8;
            crop = { x: (o.w - w) / 2, y: (o.h - h) / 2, w, h };
            drawCrop();
            cropBox.style.display = '';
        }
        function exitCrop() { cropBox.style.display = 'none'; crop = null; }

        function drawCrop() {
            if (!crop) return;
            const o = canvasOffset();
            // позиция рамки = смещение canvas в stage + crop (в координатах canvas)
            cropBox.style.left = (o.left + crop.x) + 'px';
            cropBox.style.top = (o.top + crop.y) + 'px';
            cropBox.style.width = crop.w + 'px';
            cropBox.style.height = crop.h + 'px';
        }

        // ручки: 4 угла + 4 стороны + центральная зона переноса
        cropBox.innerHTML = `
            <span class="fpt-ed-h fpt-ed-h-nw" data-h="nw"></span>
            <span class="fpt-ed-h fpt-ed-h-ne" data-h="ne"></span>
            <span class="fpt-ed-h fpt-ed-h-sw" data-h="sw"></span>
            <span class="fpt-ed-h fpt-ed-h-se" data-h="se"></span>
            <span class="fpt-ed-e fpt-ed-e-n" data-h="n"></span>
            <span class="fpt-ed-e fpt-ed-e-s" data-h="s"></span>
            <span class="fpt-ed-e fpt-ed-e-w" data-h="w"></span>
            <span class="fpt-ed-e fpt-ed-e-e" data-h="e"></span>`;

        cropBox.addEventListener('mousedown', (e) => {
            const mode = e.target.dataset.h || 'move';
            cropDrag = { sx: e.clientX, sy: e.clientY, mode, ox: crop.x, oy: crop.y, ow: crop.w, oh: crop.h };
            e.preventDefault(); e.stopPropagation();
        });

        function cropMove(e) {
            if (!cropDrag) return;
            const o = canvasOffset();
            const MIN = 24;
            let dx = e.clientX - cropDrag.sx, dy = e.clientY - cropDrag.sy;
            let { ox, oy, ow, oh, mode } = cropDrag;

            // правый/нижний край = ox+ow / oy+oh; ограничиваем в пределах canvas [0..o.w/o.h]
            let x = ox, y = oy, w = ow, h = oh;

            if (mode === 'move') {
                x = Math.max(0, Math.min(ox + dx, o.w - ow));
                y = Math.max(0, Math.min(oy + dy, o.h - oh));
            } else {
                const left = mode.includes('w');
                const right = mode.includes('e');
                const top = mode.includes('n');
                const bottom = mode.includes('s');
                if (left)   { x = Math.min(ox + dx, ox + ow - MIN); x = Math.max(0, x); w = ow + (ox - x); }
                if (right)  { w = Math.max(MIN, Math.min(ow + dx, o.w - ox)); }
                if (top)    { y = Math.min(oy + dy, oy + oh - MIN); y = Math.max(0, y); h = oh + (oy - y); }
                if (bottom) { h = Math.max(MIN, Math.min(oh + dy, o.h - oy)); }
            }
            crop = { x, y, w, h };
            drawCrop();
        }
        window.addEventListener('mousemove', cropMove);
        window.addEventListener('mouseup', () => { cropDrag = null; });

        // применяет рамку к картинке. silent=true - не переключать инструмент (для save)
        function applyCrop(silent) {
            if (!crop) return false;
            const o = canvasOffset();
            const relX = crop.x / o.w, relY = crop.y / o.h;
            const relW = crop.w / o.w, relH = crop.h / o.h;
            const sx = Math.max(0, Math.round(relX * canvas.width));
            const sy = Math.max(0, Math.round(relY * canvas.height));
            const sw = Math.max(1, Math.round(relW * canvas.width));
            const sh = Math.max(1, Math.round(relH * canvas.height));
            composite(); // свести base+draw
            const tmp = document.createElement('canvas');
            tmp.width = sw; tmp.height = sh;
            tmp.getContext('2d').drawImage(canvas, sx, sy, sw, sh, 0, 0, sw, sh);
            canvas.width = sw; canvas.height = sh;
            baseCanvas.width = sw; baseCanvas.height = sh;
            drawCanvas.width = sw; drawCanvas.height = sh;
            baseCtx.drawImage(tmp, 0, 0);
            drawCtx.clearRect(0, 0, sw, sh);
            composite();
            fitStage();
            pushHistory();
            if (!silent) setTool('pen');
            else exitCrop();
            return true;
        }

        // действия тулбара
        ov.querySelector('.fpt-ed-actions').addEventListener('click', (e) => {
            const b = e.target.closest('[data-act]'); if (!b) return;
            const act = b.getAttribute('data-act');
            if (act === 'undo') undo();
            if (act === 'applycrop') applyCrop(false);
            if (act === 'cancel') closeEditor();
            if (act === 'save') {
                // если активен инструмент обрезки и рамка стоит - применяем её
                if (tool === 'crop' && crop) applyCrop(true);
                composite();
                item.dataUrl = canvas.toDataURL('image/png');
                renderGrid();
                closeEditor();
            }
        });

        function edEsc(ev) { if (ev.key === 'Escape') closeEditor(); }
        document.addEventListener('keydown', edEsc);
        function closeEditor() {
            window.removeEventListener('resize', fitStage);
            window.removeEventListener('mousemove', cropMove);
            document.removeEventListener('keydown', edEsc);
            ov.classList.remove('open');
            setTimeout(() => ov.remove(), 150);
        }
    }

    // ───────────────────────── отправка с оптимистичными пузырями ─────────────────────────

    // имя своего аккаунта (для «родного» вида пузыря)
    function getOwnUser() {
        const el = document.querySelector('.user-link-name');
        return { name: el ? el.textContent.trim() : '' };
    }

    async function doSend() {
        if (!modalEl) return;
        const text = (modalEl.querySelector('#fptTgMsg').value || '').trim();
        const imgs = basket.slice();
        if (!imgs.length) { closeModal(); return; }

        const { chatId, chatName } = getChatContext();
        if (!chatId) { notify('Не удалось определить чат для отправки.', true); return; }

        // если подпись пустая - НЕ дублируем то, что уже в поле ввода (его отправит сам пользователь);
        // но если пользователь оставил подпись в модалке - используем её.
        // показываем ОДИН сгруппированный пузырь со всеми картинками + подписью
        const group = addPendingGroup(imgs.map(i => i.dataUrl), text);
        closeModal({ sent: true });
        basket = [];

        try {
            for (let i = 0; i < imgs.length; i++) {
                const resp = await chrome.runtime.sendMessage({
                    action: 'fptSendImage', chatId, dataUrl: imgs[i].dataUrl, chatName
                });
                if (resp && resp.ok) markTileSent(group, i);
                else { markTileError(group, i); notify('Не удалось отправить изображение: ' + ((resp && resp.error) || 'ошибка'), true); }
                await new Promise(r => setTimeout(r, 250));
            }
            if (text) await chrome.runtime.sendMessage({ action: 'fptSendChatText', chatId, text });
            finishPendingGroup(group);
        } catch (e) {
            console.error('FP Tools: ошибка отправки', e);
            notify('Ошибка при отправке: ' + e.message, true);
        }
    }

    // создаёт ОДИН сгруппированный пузырь (как родное сообщение FunPay):
    // имя автора + мозаика картинок + подпись. Ширина - как у обычного сообщения.
    function addPendingGroup(dataUrls, caption) {
        const list = document.querySelector('.chat-message-list');
        if (!list) return null;
        const own = getOwnUser();
        const n = dataUrls.length;
        const cols = n === 1 ? 1 : (n === 2 ? 2 : (n <= 4 ? 2 : 3));

        const tiles = dataUrls.map((u, idx) => `
            <span class="fpt-pending-tile" data-i="${idx}">
                <img src="${u}" alt="">
                <span class="fpt-pending-spinner"><span class="fpt-spin"></span></span>
            </span>`).join('');

        const wrap = document.createElement('div');
        wrap.className = 'chat-msg-item chat-msg-with-head fpt-pending-bubble';
        wrap.innerHTML = `
            <div class="chat-message">
                <div class="media-user-name">
                    <span class="chat-msg-author-link">${escapeText(own.name || 'Вы')}</span>
                    <div class="chat-msg-date">отправка…</div>
                </div>
                <div class="chat-msg-body">
                    <div class="chat-msg-text">
                        <span class="fpt-pending-mosaic" style="--cols:${cols}" data-count="${n}">${tiles}</span>
                        ${caption ? `<span class="fpt-pending-caption">${escapeText(caption)}</span>` : ''}
                    </div>
                </div>
            </div>`;
        list.appendChild(wrap);
        list.scrollTop = list.scrollHeight;
        return wrap;
    }
    function escapeText(s) {
        return (s || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    }
    function markTileSent(group, i) {
        const t = group && group.querySelector(`.fpt-pending-tile[data-i="${i}"] .fpt-pending-spinner`);
        if (t) { t.classList.add('fpt-pending-tile-done'); }
    }
    function markTileError(group, i) {
        const t = group && group.querySelector(`.fpt-pending-tile[data-i="${i}"] .fpt-pending-spinner`);
        if (t) t.innerHTML = '<span class="material-symbols-rounded fpt-pending-err">error</span>';
    }
    function finishPendingGroup(group) {
        // FunPay сам дорисует настоящие сообщения; временный пузырь убираем с фейдом
        if (!group) return;
        group.classList.add('fpt-pending-done');
        setTimeout(() => group.remove(), 500);
    }

    // ───────────── подмена нативной скрепки ─────────────

    function installButton() {
        if (!document.querySelector('.chat-form-input')) return;
        if (document.querySelector('.fpt-attach-btn')) return;
        const nativeAttach = document.querySelector(
            '.chat-form .chat-btn-image:not(.fpt-tpl-popover-btn):not(.fpt-attach-btn)'
        );
        if (!nativeAttach) return;

        const ourBtn = document.createElement('button');
        ourBtn.type = 'button';
        ourBtn.className = 'btn btn-default chat-btn-image fpt-attach-btn';
        ourBtn.title = 'Прикрепить изображения';
        ourBtn.innerHTML = `<span class="material-symbols-rounded">${BTN_ICON}</span>`;
        ourBtn.addEventListener('click', (e) => { e.preventDefault(); pickFiles(true); });

        nativeAttach.parentNode.insertBefore(ourBtn, nativeAttach);
        nativeAttach.classList.add('fpt-native-attach-hidden');
    }

    function syncNativeVisibility() {
        const our = document.querySelector('.fpt-attach-btn');
        const native = document.querySelector('.chat-form .chat-btn-image:not(.fpt-attach-btn):not(.fpt-tpl-popover-btn)');
        if (!native) return;
        const ourHidden = our ? getComputedStyle(our).display === 'none' : true;
        native.classList.toggle('fpt-native-attach-hidden', !ourHidden);
    }

    function init() { installButton(); syncNativeVisibility(); installPasteAndDrop(); }

    // ───────────── перехват вставки и перетаскивания изображений ─────────────

    let pasteDropInstalled = false;
    function installPasteAndDrop() {
        if (pasteDropInstalled) return;
        pasteDropInstalled = true;

        // Ctrl+V: ловим картинки из буфера ДО того, как FunPay покажет своё меню.
        document.addEventListener('paste', (e) => {
            // работаем только когда открыт чат (есть поле ввода)
            if (!document.querySelector('.chat-form-input')) return;
            const items = e.clipboardData && e.clipboardData.items;
            if (!items) return;
            const files = [];
            for (const it of items) {
                if (it.kind === 'file' && it.type.startsWith('image/')) {
                    const f = it.getAsFile(); if (f) files.push(f);
                }
            }
            if (files.length) {
                e.preventDefault();
                e.stopPropagation();
                addFiles(files);  // добавит в текущий альбом или откроет меню
            }
        }, true); // capture - раньше обработчиков FunPay

        // Drag&Drop картинок в область чата
        const chatArea = document.querySelector('.chat') || document.body;
        const stop = (e) => { e.preventDefault(); e.stopPropagation(); };
        ['dragenter', 'dragover'].forEach(ev => document.addEventListener(ev, (e) => {
            if (!e.dataTransfer || !Array.from(e.dataTransfer.types || []).includes('Files')) return;
            if (!document.querySelector('.chat-form-input')) return;
            stop(e);
            document.body.classList.add('fpt-dnd-active');
        }, true));
        document.addEventListener('dragleave', (e) => {
            if (e.relatedTarget === null) document.body.classList.remove('fpt-dnd-active');
        }, true);
        document.addEventListener('drop', (e) => {
            if (!document.querySelector('.chat-form-input')) return;
            const dt = e.dataTransfer;
            if (!dt || !dt.files || !dt.files.length) return;
            const imgs = Array.from(dt.files).filter(f => f.type.startsWith('image/'));
            if (!imgs.length) return;
            stop(e);
            document.body.classList.remove('fpt-dnd-active');
            addFiles(imgs);
        }, true);
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();

    const root = document.querySelector('.js-main-chat') || document.body;
    new MutationObserver(() => {
        if (document.querySelector('.chat-form-input') && !document.querySelector('.fpt-attach-btn')) installButton();
        syncNativeVisibility();
    }).observe(root, { childList: true, subtree: true });

})();
