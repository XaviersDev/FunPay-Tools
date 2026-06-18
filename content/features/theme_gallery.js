// ============================================================================
//  FP Tools — Каталог готовых тем (.fptheme) из GitHub
// ----------------------------------------------------------------------------
//  Зачем GitHub raw, а не Telegram/Vercel:
//    • Telegram CDN заблокирован в РФ → ссылки на file_id не грузятся у россиян.
//    • Vercel free — жалко лимиты.
//    • raw.githubusercontent.com бесплатный, грузит в РФ, файлы 5-10 МБ ок,
//      свой сервер не нужен. Темы и превью лежат в публичном репозитории,
//      каталог описан в index.json.
//
//  Структура репозитория (заполняется вручную владельцем):
//    index.json                 — манифест: [{id,name,desc,author,file,preview,size}]
//    themes/<id>.fptheme        — сами темы
//    previews/<id>.jpg          — превью-картинки
//
//  index.json — пример одной записи:
//    {
//      "id": "cyberpunk_neon",
//      "name": "Cyberpunk Neon",
//      "desc": "Неоновый киберпанк",
//      "author": "sDimosX",
//      "file": "themes/cyberpunk_neon.fptheme",
//      "preview": "previews/cyberpunk_neon.jpg"
//    }
//  Поля file/preview можно указывать относительными (тогда достроятся от RAW_BASE)
//  или абсолютными ссылками (http...). size — необязательно, для подписи.
// ============================================================================

(() => {
    'use strict';

    // --- Настройки репозитория (поменяй под свой) -----------------------------
    const GH_USER   = 'XaviersDev';
    const GH_REPO   = 'fpt-themes';
    const GH_BRANCH = 'main';
    const RAW_BASE  = `https://raw.githubusercontent.com/${GH_USER}/${GH_REPO}/${GH_BRANCH}/`;
    const INDEX_URL = RAW_BASE + 'index.json';

    let _themes = [];        // загруженный каталог
    let _index = 0;          // текущая карточка в карусели
    let _loaded = false;     // каталог уже грузили?
    let _loading = false;    // идёт загрузка каталога
    let _applying = false;   // идёт применение темы (защита от даблкликов)

    // Достраивает относительную ссылку из index.json до полного RAW-URL.
    function resolveUrl(u) {
        if (!u) return '';
        if (/^https?:\/\//i.test(u)) return u;
        return RAW_BASE + String(u).replace(/^\/+/, '');
    }

    // --- Вёрстка контейнера каталога ------------------------------------------
    function ensureStyles() {
        if (document.getElementById('fpt-theme-gallery-styles')) return;
        const css = `
        #fpt-theme-gallery { margin: 14px 0 4px; }
        #fpt-theme-gallery .fptg-head { display:flex; align-items:center; justify-content:space-between; margin-bottom:8px; }
        #fpt-theme-gallery .fptg-title { font-size:14px; font-weight:600; display:flex; align-items:center; gap:6px; }
        #fpt-theme-gallery .fptg-counter { font-size:12px; opacity:.6; }
        #fpt-theme-gallery .fptg-card {
            position:relative; border-radius:12px; overflow:hidden;
            background:rgba(0,0,0,.25); border:1px solid rgba(255,255,255,.08);
        }
        #fpt-theme-gallery .fptg-preview {
            width:100%; aspect-ratio:16/9; object-fit:cover; display:block; background:#15151c;
        }
        #fpt-theme-gallery .fptg-preview-empty {
            width:100%; aspect-ratio:16/9; display:flex; align-items:center; justify-content:center;
            color:#5a5f7a; font-size:13px; background:#15151c;
        }
        #fpt-theme-gallery .fptg-meta { padding:10px 12px; }
        #fpt-theme-gallery .fptg-name { font-size:14px; font-weight:600; margin:0 0 2px; }
        #fpt-theme-gallery .fptg-desc { font-size:12px; opacity:.7; margin:0 0 2px; line-height:1.35; }
        #fpt-theme-gallery .fptg-author { font-size:11px; opacity:.5; }
        #fpt-theme-gallery .fptg-nav { display:flex; gap:8px; margin-top:8px; align-items:center; }
        #fpt-theme-gallery .fptg-nav .btn { flex:0 0 auto; padding:6px 12px; }
        #fpt-theme-gallery .fptg-apply { flex:1 1 auto; display:flex; align-items:center; justify-content:center; gap:6px; }
        #fpt-theme-gallery .fptg-state { font-size:13px; opacity:.7; padding:14px; text-align:center; }
        #fpt-theme-gallery .fptg-arrow { user-select:none; }
        #fpt-theme-gallery .fptg-arrow[disabled] { opacity:.3; pointer-events:none; }
        `;
        const tag = document.createElement('style');
        tag.id = 'fpt-theme-gallery-styles';
        tag.textContent = css;
        document.head.appendChild(tag);
    }

    // Находит вкладку «Кастомизация» и вставляет туда контейнер каталога.
    function mountContainer() {
        if (document.getElementById('fpt-theme-gallery')) return true;
        // theme-actions-grid — это блок кнопок Экспорт/Импорт во вкладке темы.
        const grid = document.querySelector('.theme-actions-grid');
        if (!grid) return false;

        ensureStyles();
        const box = createElement('div', { id: 'fpt-theme-gallery' });
        box.innerHTML = `
            <div class="fptg-head">
                <div class="fptg-title"><span class="material-icons" style="font-size:18px;">palette</span>Готовые темы</div>
                <div class="fptg-counter" id="fptg-counter"></div>
            </div>
            <div id="fptg-body">
                <div class="fptg-state">Нажмите «Загрузить каталог», чтобы увидеть готовые темы.</div>
            </div>
            <div class="fptg-nav">
                <button class="btn btn-default fptg-arrow" id="fptg-prev" disabled>‹</button>
                <button class="btn fptg-apply" id="fptg-load"><span class="material-icons" style="font-size:18px;">cloud_download</span>Загрузить каталог</button>
                <button class="btn btn-default fptg-arrow" id="fptg-next" disabled>›</button>
            </div>
        `;
        // вставляем ПЕРЕД блоком кнопок Экспорт/Импорт
        grid.parentNode.insertBefore(box, grid);

        box.querySelector('#fptg-load').addEventListener('click', onLoadOrApply);
        box.querySelector('#fptg-prev').addEventListener('click', () => move(-1));
        box.querySelector('#fptg-next').addEventListener('click', () => move(1));
        return true;
    }

    // --- Загрузка каталога ------------------------------------------------------
    async function loadCatalog() {
        if (_loading) return;
        _loading = true;
        renderState('Загружаю каталог тем…');
        try {
            const resp = await fetch(INDEX_URL, { cache: 'no-store' });
            if (!resp.ok) throw new Error('HTTP ' + resp.status);
            const data = await resp.json();
            const list = Array.isArray(data) ? data : (Array.isArray(data.themes) ? data.themes : []);
            _themes = list.filter(t => t && t.file).map(t => ({
                id: t.id || t.name || Math.random().toString(36).slice(2),
                name: t.name || 'Без названия',
                desc: t.desc || t.description || '',
                author: t.author || '',
                fileUrl: resolveUrl(t.file),
                previewUrl: resolveUrl(t.preview || ''),
                size: t.size || ''
            }));
            _loaded = true;
            _index = 0;
            if (!_themes.length) {
                renderState('Каталог пуст. Темы ещё не добавлены.');
                setLoadButton(false);
            } else {
                renderCard();
            }
        } catch (e) {
            renderState('Не удалось загрузить каталог. Проверьте соединение и попробуйте снова.');
            setLoadButton(true, true); // показать кнопку повтора
            console.error('FP Tools theme gallery: load error', e);
        } finally {
            _loading = false;
        }
    }

    function setLoadButton(visible, isRetry) {
        const btn = document.getElementById('fptg-load');
        if (!btn) return;
        if (visible) {
            btn.style.display = '';
            btn.innerHTML = `<span class="material-icons" style="font-size:18px;">${isRetry ? 'refresh' : 'cloud_download'}</span>${isRetry ? 'Повторить' : 'Загрузить каталог'}`;
            btn.disabled = false;
        } else {
            btn.style.display = 'none';
        }
    }

    // --- Рендер -----------------------------------------------------------------
    function renderState(msg) {
        const body = document.getElementById('fptg-body');
        if (body) body.innerHTML = `<div class="fptg-state">${msg}</div>`;
        const counter = document.getElementById('fptg-counter');
        if (counter) counter.textContent = '';
        updateArrows();
    }

    function renderCard() {
        const body = document.getElementById('fptg-body');
        if (!body) return;
        const t = _themes[_index];
        if (!t) { renderState('Тема не найдена.'); return; }

        const preview = t.previewUrl
            ? `<img class="fptg-preview" data-fptg-img src="${t.previewUrl}" alt="" loading="lazy">`
            : `<div class="fptg-preview-empty">Без превью</div>`;

        const author = t.author ? `<div class="fptg-author">Автор: ${escapeHtml(t.author)}</div>` : '';
        const desc = t.desc ? `<div class="fptg-desc">${escapeHtml(t.desc)}</div>` : '';

        body.innerHTML = `
            <div class="fptg-card">
                ${preview}
                <div class="fptg-meta">
                    <div class="fptg-name">${escapeHtml(t.name)}</div>
                    ${desc}
                    ${author}
                </div>
            </div>
        `;

        // Кнопку «Загрузить каталог» превращаем в «Применить тему».
        const btn = document.getElementById('fptg-load');
        if (btn) {
            btn.style.display = '';
            btn.disabled = _applying;
            btn.innerHTML = `<span class="material-icons" style="font-size:18px;">check_circle</span>${_applying ? 'Применяю…' : 'Применить тему'}`;
        }

        const counter = document.getElementById('fptg-counter');
        if (counter) counter.textContent = `${_index + 1} / ${_themes.length}`;
        updateArrows();

        // обработчик ошибки превью вешаем через JS (инлайновый onerror может
        // блокироваться CSP страницы funpay.com)
        const img = body.querySelector('img[data-fptg-img]');
        if (img) {
            img.addEventListener('error', () => {
                const ph = document.createElement('div');
                ph.className = 'fptg-preview-empty';
                ph.textContent = 'Превью недоступно';
                img.replaceWith(ph);
            }, { once: true });
        }
    }

    function updateArrows() {
        const prev = document.getElementById('fptg-prev');
        const next = document.getElementById('fptg-next');
        const has = _loaded && _themes.length > 1;
        if (prev) prev.disabled = !has;
        if (next) next.disabled = !has;
    }

    function move(dir) {
        if (!_themes.length) return;
        _index = (_index + dir + _themes.length) % _themes.length;
        renderCard();
    }

    // --- Клик по главной кнопке -------------------------------------------------
    async function onLoadOrApply() {
        if (!_loaded) {
            await loadCatalog();
        } else {
            await applyCurrent();
        }
    }

    // --- Применение темы --------------------------------------------------------
    async function applyCurrent() {
        if (_applying) return;
        const t = _themes[_index];
        if (!t || !t.fileUrl) return;
        _applying = true;
        renderCard(); // покажет «Применяю…»
        try {
            const resp = await fetch(t.fileUrl, { cache: 'no-store' });
            if (!resp.ok) throw new Error('HTTP ' + resp.status);
            const text = await resp.text();
            let theme;
            try { theme = JSON.parse(text); }
            catch { throw new Error('файл темы повреждён'); }

            // Тот же контракт, что и при ручном импорте .fptheme.
            if (!theme || !theme.bgColor1 || !theme.font) {
                throw new Error('неверный формат темы');
            }

            await chrome.storage.local.set({ fpToolsTheme: theme });
            // Применяем теми же функциями, что использует ручной импорт.
            if (typeof applyCustomTheme === 'function') await applyCustomTheme();
            if (typeof applyHeaderPosition === 'function') await applyHeaderPosition();
            if (typeof updateThemePreview === 'function') await updateThemePreview();

            if (typeof showNotification === 'function') {
                showNotification(`Тема «${t.name}» применена!`);
            }
        } catch (e) {
            if (typeof showNotification === 'function') {
                showNotification(`Не удалось применить тему: ${e.message}`, true);
            }
            console.error('FP Tools theme gallery: apply error', e);
        } finally {
            _applying = false;
            renderCard();
        }
    }

    // --- Утилиты ----------------------------------------------------------------
    function escapeHtml(s) {
        return String(s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    // --- Инициализация: ждём, пока попап с вкладкой темы появится в DOM ----------
    function tryMount() {
        return mountContainer();
    }

    function init() {
        if (tryMount()) return;
        // Попап FP Tools монтируется не сразу — ждём появления .theme-actions-grid.
        const obs = new MutationObserver(() => {
            if (tryMount()) obs.disconnect();
        });
        obs.observe(document.documentElement, { childList: true, subtree: true });
        // Подстраховка: остановить наблюдение через 30с, чтобы не висеть вечно.
        setTimeout(() => obs.disconnect(), 30000);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
