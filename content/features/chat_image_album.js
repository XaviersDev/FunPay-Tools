// content/features/chat_image_album.js
// =============================================================================
// FPT - ТЕЛЕГРАМ-СТАЙЛ АЛЬБОМЫ В ЧАТЕ + ПРОДВИНУТЫЙ ЛАЙТБОКС
//
// Если в чате идут НЕСКОЛЬКО изображений ПОДРЯД от ОДНОГО отправителя и между
// ними нет других сообщений (текста), они схлопываются в один аккуратный
// альбом-мозаику (как в Telegram), а не висят простынёй отдельных картинок.
//
// Клик по любой картинке открывает лайтбокс с галереей альбома:
//   • листание стрелками / клавишами ← → ;
//   • зум колёсиком мыши (к точке курсора), кнопками + / −, даблкликом;
//   • панорамирование перетаскиванием при увеличении;
//   • поворот на 90° кнопкой или клавишей R;
//   • правый клик мыши работает штатно (нативное меню браузера - «Сохранить»);
//   • закрытие по Esc / клику по фону / крестику.
//
// Группировка опирается на реальный DOM FunPay:
//   .chat-msg-item → .chat-msg-body .chat-msg-text → a.chat-img-link > img.chat-img
// Автор берётся из .chat-msg-author-link; у «продолжающих» сообщений группы имя
// автора в DOM отсутствует, поэтому последний известный автор переносится дальше.
// =============================================================================

(function () {
    'use strict';

    const GROUP_ATTR = 'data-fpt-album-built';

    // ───────────────────────── определение картинок ─────────────────────────

    // Сообщение «только картинка»: в .chat-msg-text единственный значимый
    // ребёнок - ссылка a.chat-img-link с img.chat-img внутри, без текста.
    function imageLinkOf(item) {
        const body = item.querySelector(':scope > .chat-message > .chat-msg-body, .chat-msg-body');
        if (!body) return null;
        const textEl = body.querySelector('.chat-msg-text');
        if (!textEl) return null;
        const link = textEl.querySelector('a.chat-img-link');
        if (!link) return null;
        // есть ли посторонний текст помимо картинки?
        const txt = textEl.textContent.replace(/\u200b|\u200c|\u200d|\uFEFF/g, '').trim();
        if (txt.length > 0) return null;           // подпись/текст → не чистая картинка
        if (!link.querySelector('img.chat-img')) return null;
        return link;
    }

    // id автора сообщения (по ссылке на профиль), либо null если в этом
    // конкретном .chat-msg-item имени нет (продолжение группы).
    function authorIdOf(item) {
        const a = item.querySelector('.chat-msg-author-link');
        if (!a || !a.href) return null;
        const m = a.href.match(/\/users\/(\d+)/);
        return m ? m[1] : null;
    }

    // ───────────────────────── построение альбомов ─────────────────────────

    function buildAlbums(container) {
        const items = Array.from(container.querySelectorAll('.chat-msg-item'));
        if (!items.length) return;

        let lastAuthor = null;   // переносим автора на «продолжающие» сообщения
        let run = [];            // текущая серия картинок одного автора

        const flush = () => {
            if (run.length >= 2) collapseRun(run);
            run = [];
        };

        for (const item of items) {
            // обновляем «текущего автора», если в сообщении есть имя
            const declared = authorIdOf(item);
            if (declared) lastAuthor = declared;
            const author = declared || lastAuthor;

            // уже слитые в альбом сообщения и сам собранный альбом - это «барьер»:
            // они не участвуют в новой группировке (иначе мозаика пересобиралась бы),
            // но прерывают текущую серию, как обычное сообщение.
            // временные пузыри отправки (оптимистичные) - игнорируем как барьер
            if (item.classList.contains('fpt-pending-bubble') ||
                item.classList.contains('fpt-album-merged') ||
                item.getAttribute(GROUP_ATTR) === '1') {
                flush();
                continue;
            }

            const link = imageLinkOf(item);

            if (link) {
                if (run.length === 0) {
                    run.push({ item, link, author });
                } else if (run[run.length - 1].author === author) {
                    run.push({ item, link, author });
                } else {
                    // картинка, но другой автор → закрываем серию, начинаем новую
                    flush();
                    run.push({ item, link, author });
                }
            } else {
                // не картинка (текст / системное) → серия прерывается
                flush();
            }
        }
        flush();
    }

    // Схлопывает серию из >=2 картинок в один альбом-мозаику.
    function collapseRun(run) {
        const first = run[0].item;
        // не пересобираем уже собранный альбом
        if (first.getAttribute(GROUP_ATTR) === '1') return;

        // собираем данные о картинках (полноразмер берём из href ссылки)
        const photos = run.map(r => {
            const img = r.link.querySelector('img.chat-img');
            return {
                full: r.link.getAttribute('href') || (img ? img.src : ''),
                thumb: img ? img.src : (r.link.getAttribute('href') || ''),
                w: img ? (parseInt(img.getAttribute('width'), 10) || 0) : 0,
                h: img ? (parseInt(img.getAttribute('height'), 10) || 0) : 0
            };
        });

        // строим контейнер-мозаику и кладём его в .chat-msg-text первого сообщения
        const firstTextEl = first.querySelector('.chat-msg-text');
        if (!firstTextEl) return;

        const n = photos.length;
        const grid = document.createElement('div');
        grid.className = 'fpt-album-mosaic';
        grid.setAttribute('data-count', String(n));
        // раскладка: 1 ряд для 2, 2x2 для 3-4, иначе сетка по 3 в ряд
        const cols = n === 2 ? 2 : (n <= 4 ? 2 : 3);
        grid.style.setProperty('--cols', String(cols));

        photos.forEach((p, idx) => {
            const cell = document.createElement('div');
            cell.className = 'fpt-album-tile';
            const im = document.createElement('img');
            im.src = p.thumb;
            im.alt = '';
            im.loading = 'lazy';
            cell.appendChild(im);
            // «+N» на последней плитке, если картинок больше, чем влезает (визуально 7+)
            cell.addEventListener('click', () => openLightbox(photos, idx));
            grid.appendChild(cell);
        });

        firstTextEl.innerHTML = '';
        firstTextEl.appendChild(grid);
        first.setAttribute(GROUP_ATTR, '1');

        // остальные сообщения серии прячем - их картинки теперь в мозаике
        for (let i = 1; i < run.length; i++) {
            run[i].item.setAttribute(GROUP_ATTR, 'merged');
            run[i].item.classList.add('fpt-album-merged');
        }
    }

    // ───────────────────────── лайтбокс ─────────────────────────

    let lb = null;          // overlay
    let lbState = null;     // { photos, index, scale, rot, tx, ty, dragging, sx, sy }

    function openLightbox(photos, index) {
        closeLightbox();
        lbState = { photos, index, scale: 1, rot: 0, tx: 0, ty: 0, dragging: false, sx: 0, sy: 0 };

        lb = document.createElement('div');
        lb.className = 'fpt-lb-overlay';
        lb.innerHTML = `
            <div class="fpt-lb-stage">
                <img class="fpt-lb-img" alt="" draggable="false">
            </div>
            <button class="fpt-lb-btn fpt-lb-close" title="Закрыть (Esc)"><span class="material-symbols-rounded">close</span></button>
            <button class="fpt-lb-btn fpt-lb-prev" title="Назад (←)"><span class="material-symbols-rounded">chevron_left</span></button>
            <button class="fpt-lb-btn fpt-lb-next" title="Вперёд (→)"><span class="material-symbols-rounded">chevron_right</span></button>
            <div class="fpt-lb-toolbar">
                <button class="fpt-lb-btn" data-act="zoomout" title="Уменьшить (−)"><span class="material-symbols-rounded">remove</span></button>
                <span class="fpt-lb-counter"></span>
                <button class="fpt-lb-btn" data-act="zoomin" title="Увеличить (+)"><span class="material-symbols-rounded">add</span></button>
                <button class="fpt-lb-btn" data-act="rotate" title="Повернуть (R)"><span class="material-symbols-rounded">rotate_right</span></button>
                <button class="fpt-lb-btn" data-act="reset" title="Сброс (0)"><span class="material-symbols-rounded">crop_free</span></button>
            </div>`;
        document.body.appendChild(lb);

        const stage = lb.querySelector('.fpt-lb-stage');
        const img = lb.querySelector('.fpt-lb-img');

        // навигация
        lb.querySelector('.fpt-lb-prev').addEventListener('click', (e) => { e.stopPropagation(); go(-1); });
        lb.querySelector('.fpt-lb-next').addEventListener('click', (e) => { e.stopPropagation(); go(1); });
        lb.querySelector('.fpt-lb-close').addEventListener('click', (e) => { e.stopPropagation(); closeLightbox(); });

        // тулбар
        lb.querySelector('.fpt-lb-toolbar').addEventListener('click', (e) => {
            const b = e.target.closest('[data-act]'); if (!b) return;
            e.stopPropagation();
            const act = b.getAttribute('data-act');
            if (act === 'zoomin')  zoomBy(1.25);
            if (act === 'zoomout') zoomBy(1 / 1.25);
            if (act === 'rotate')  { lbState.rot = (lbState.rot + 90) % 360; applyTransform(); }
            if (act === 'reset')   resetView();
        });

        // клик по фону (не по картинке/кнопкам) - закрыть
        lb.addEventListener('mousedown', (e) => {
            if (e.target === lb || e.target === stage) { closeLightbox(); }
        });

        // даблклик по картинке - зум туда / сброс
        img.addEventListener('dblclick', (e) => {
            e.preventDefault();
            if (lbState.scale > 1) resetView();
            else zoomAtPoint(2, e.clientX, e.clientY);
        });

        // зум колёсиком к точке курсора
        stage.addEventListener('wheel', (e) => {
            e.preventDefault();
            const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
            zoomAtPoint(lbState.scale * factor, e.clientX, e.clientY);
        }, { passive: false });

        // панорамирование перетаскиванием (только ЛКМ; ПКМ оставляем браузеру)
        img.addEventListener('mousedown', (e) => {
            if (e.button !== 0) return;        // ПКМ/СКМ - не перехватываем
            if (lbState.scale <= 1) return;
            e.preventDefault();
            lbState.dragging = true;
            lbState.sx = e.clientX - lbState.tx;
            lbState.sy = e.clientY - lbState.ty;
            img.classList.add('grabbing');
        });
        window.addEventListener('mousemove', onDragMove);
        window.addEventListener('mouseup', onDragEnd);

        // ПКМ - НЕ мешаем нативному меню «Сохранить изображение»
        img.addEventListener('contextmenu', (e) => { e.stopPropagation(); });

        // клавиатура
        document.addEventListener('keydown', onKey);

        render();
        requestAnimationFrame(() => lb.classList.add('open'));
    }

    function onDragMove(e) {
        if (!lbState || !lbState.dragging) return;
        lbState.tx = e.clientX - lbState.sx;
        lbState.ty = e.clientY - lbState.sy;
        applyTransform();
    }
    function onDragEnd() {
        if (!lbState) return;
        lbState.dragging = false;
        const img = lb && lb.querySelector('.fpt-lb-img');
        if (img) img.classList.remove('grabbing');
    }

    function onKey(e) {
        if (!lbState) return;
        switch (e.key) {
            case 'Escape': closeLightbox(); break;
            case 'ArrowLeft': go(-1); break;
            case 'ArrowRight': go(1); break;
            case '+': case '=': zoomBy(1.25); break;
            case '-': case '_': zoomBy(1 / 1.25); break;
            case 'r': case 'R': case 'к': case 'К': lbState.rot = (lbState.rot + 90) % 360; applyTransform(); break;
            case '0': resetView(); break;
        }
    }

    function go(dir) {
        if (!lbState) return;
        const n = lbState.photos.length;
        lbState.index = (lbState.index + dir + n) % n;
        resetView(true);
        render();
    }

    function render() {
        if (!lb || !lbState) return;
        const p = lbState.photos[lbState.index];
        const img = lb.querySelector('.fpt-lb-img');
        img.src = p.full || p.thumb;
        lb.querySelector('.fpt-lb-counter').textContent = `${lbState.index + 1} / ${lbState.photos.length}`;
        const multi = lbState.photos.length > 1;
        lb.querySelector('.fpt-lb-prev').style.display = multi ? '' : 'none';
        lb.querySelector('.fpt-lb-next').style.display = multi ? '' : 'none';
        applyTransform();
    }

    function applyTransform() {
        if (!lb) return;
        const img = lb.querySelector('.fpt-lb-img');
        img.style.transform =
            `translate(${lbState.tx}px, ${lbState.ty}px) scale(${lbState.scale}) rotate(${lbState.rot}deg)`;
        img.classList.toggle('zoomed', lbState.scale > 1);
    }

    function zoomBy(factor) {
        if (!lbState) return;
        zoomAtPoint(lbState.scale * factor, window.innerWidth / 2, window.innerHeight / 2);
    }

    // зум к точке экрана (cx,cy) - масштабируем так, чтобы точка под курсором осталась на месте
    function zoomAtPoint(targetScale, cx, cy) {
        if (!lbState || !lb) return;
        const next = Math.max(1, Math.min(targetScale, 8));
        const img = lb.querySelector('.fpt-lb-img');
        const rect = img.getBoundingClientRect();
        const ox = cx - (rect.left + rect.width / 2);
        const oy = cy - (rect.top + rect.height / 2);
        const ratio = next / lbState.scale;
        lbState.tx -= ox * (ratio - 1);
        lbState.ty -= oy * (ratio - 1);
        lbState.scale = next;
        if (next === 1) { lbState.tx = 0; lbState.ty = 0; }
        applyTransform();
    }

    function resetView(keepRot) {
        if (!lbState) return;
        lbState.scale = 1; lbState.tx = 0; lbState.ty = 0;
        if (!keepRot) lbState.rot = 0;
        applyTransform();
    }

    function closeLightbox() {
        document.removeEventListener('keydown', onKey);
        window.removeEventListener('mousemove', onDragMove);
        window.removeEventListener('mouseup', onDragEnd);
        if (!lb) { lbState = null; return; }
        const el = lb; lb = null; lbState = null;
        el.classList.remove('open');
        setTimeout(() => el.remove(), 150);
    }

    // ───────────────────────── наблюдение за чатом ─────────────────────────

    // 3.0: одиночные изображения (НЕ альбомы) раньше открывались нативным
    // просмотрщиком FunPay - без зума, мелкие. Теперь любая одиночная картинка
    // тоже открывается в нашем лайтбоксе (зум/поворот/панорама), как в альбомах.
    function bindSingleImages(container) {
        const links = container.querySelectorAll('a.chat-img-link:not([data-fpt-single-bound])');
        links.forEach(link => {
            // пропускаем картинки, попавшие в альбом-мозаику (там свой обработчик)
            const item = link.closest('.chat-msg-item');
            if (item && (item.getAttribute(GROUP_ATTR) === '1' || item.classList.contains('fpt-album-merged'))) {
                return;
            }
            if (link.closest('.fpt-album-mosaic')) return;

            link.setAttribute('data-fpt-single-bound', '1');
            link.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                const img = link.querySelector('img.chat-img');
                const photo = {
                    full: link.getAttribute('href') || (img ? img.src : ''),
                    thumb: img ? img.src : (link.getAttribute('href') || ''),
                    w: img ? (parseInt(img.getAttribute('width'), 10) || 0) : 0,
                    h: img ? (parseInt(img.getAttribute('height'), 10) || 0) : 0
                };
                if (photo.full) openLightbox([photo], 0);
            });
        });
    }

    function run() {
        const container = document.querySelector(
            '.chat-message-list, .chat-message-container, .chat.chat-float, .chat-full .chat'
        );
        if (container) {
            buildAlbums(container);
            bindSingleImages(container);
        }
    }

    function boot() {
        run();
        const root = document.querySelector('.js-main-chat') || document.body;
        let scheduled = false;
        new MutationObserver(() => {
            if (scheduled) return;
            scheduled = true;
            // дебаунс: ждём, пока FunPay допишет порцию сообщений
            requestAnimationFrame(() => { scheduled = false; run(); });
        }).observe(root, { childList: true, subtree: true });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot);
    } else {
        boot();
    }

})();
