// content/features/custom_sound_editor.js
// Загрузка своей мелодии для уведомлений + обрезка до 5 секунд (перетаскиваемое
// выделение по волне, прослушивание, сохранение). Сохранённый отрезок кодируется
// в WAV (data URL) и хранится в chrome.storage.local.fpToolsCustomSoundData.

(function () {
    'use strict';

    const MAX_CLIP = 5;
    let clipSeconds = 5;        // 1..5, по умолчанию 5
    const STORE_DATA = 'fpToolsCustomSoundData'; // data:audio/wav;base64,...
    const STORE_META = 'fpToolsCustomSoundMeta'; // { length }

    let audioCtx = null;
    let decodedBuffer = null;   // AudioBuffer всего загруженного файла
    let selStart = 0;           // секунда начала выделения
    let previewSource = null;   // текущий проигрываемый источник
    let playRAF = null;

    function $(id) { return document.getElementById(id); }

    function getCtx() {
        if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        return audioCtx;
    }

    function fmtTime(sec) {
        sec = Math.max(0, sec);
        const m = Math.floor(sec / 60);
        const s = Math.floor(sec % 60);
        return `${m}:${String(s).padStart(2, '0')}`;
    }

    // ── waveform ────────────────────────────────────────────────────────────────
    function drawWave() {
        const canvas = $('fptWaveCanvas');
        if (!canvas || !decodedBuffer) return;
        const wrap = $('fptWaveWrap');
        const dpr = window.devicePixelRatio || 1;
        const w = wrap.clientWidth, h = wrap.clientHeight;
        canvas.width = Math.max(1, Math.floor(w * dpr));
        canvas.height = Math.max(1, Math.floor(h * dpr));
        const ctx = canvas.getContext('2d');
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, w, h);

        const data = decodedBuffer.getChannelData(0);
        const step = Math.max(1, Math.floor(data.length / w));
        const mid = h / 2;

        ctx.strokeStyle = 'rgba(144,153,184,0.65)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let x = 0; x < w; x++) {
            let min = 1, max = -1;
            for (let j = 0; j < step; j++) {
                const v = data[x * step + j] || 0;
                if (v < min) min = v;
                if (v > max) max = v;
            }
            ctx.moveTo(x + 0.5, mid + min * mid * 0.9);
            ctx.lineTo(x + 0.5, mid + max * mid * 0.9);
        }
        ctx.stroke();
    }

    function updateSelectionUI() {
        const wrap = $('fptWaveWrap');
        const sel = $('fptWaveSel');
        const hL = $('fptWaveSelHandleL');
        const hR = $('fptWaveSelHandleR');
        const rangeEl = $('fptCustomSoundRange');
        if (!wrap || !sel || !decodedBuffer) return;

        const dur = decodedBuffer.duration;
        const clip = Math.min(clipSeconds, dur);
        // фиксируем длину окна = clip, двигаем только начало
        selStart = Math.max(0, Math.min(selStart, dur - clip));
        const w = wrap.clientWidth;
        const left = (selStart / dur) * w;
        const width = (clip / dur) * w;

        sel.style.left = left + 'px';
        sel.style.width = width + 'px';
        hL.style.left = left + 'px';
        hR.style.left = (left + width) + 'px';

        if (rangeEl) rangeEl.textContent = `${fmtTime(selStart)} - ${fmtTime(selStart + clip)} (${clip.toFixed(1)} сек)`;
    }

    // ── drag selection ──────────────────────────────────────────────────────────
    function bindDrag() {
        const wrap = $('fptWaveWrap');
        if (!wrap || wrap.dataset.dragBound) return;
        wrap.dataset.dragBound = '1';

        let dragging = false;

        const posToSec = (clientX) => {
            const rect = wrap.getBoundingClientRect();
            const x = Math.max(0, Math.min(clientX - rect.left, rect.width));
            return (x / rect.width) * decodedBuffer.duration;
        };

        const startDrag = (clientX) => {
            if (!decodedBuffer) return;
            dragging = true;
            const clip = Math.min(clipSeconds, decodedBuffer.duration);
            // центрируем окно по точке клика
            selStart = posToSec(clientX) - clip / 2;
            updateSelectionUI();
        };
        const moveDrag = (clientX) => {
            if (!dragging || !decodedBuffer) return;
            const clip = Math.min(clipSeconds, decodedBuffer.duration);
            selStart = posToSec(clientX) - clip / 2;
            updateSelectionUI();
        };
        const endDrag = () => { dragging = false; };

        wrap.addEventListener('mousedown', (e) => { e.preventDefault(); startDrag(e.clientX); });
        window.addEventListener('mousemove', (e) => moveDrag(e.clientX));
        window.addEventListener('mouseup', endDrag);

        // touch
        wrap.addEventListener('touchstart', (e) => { if (e.touches[0]) startDrag(e.touches[0].clientX); }, { passive: true });
        wrap.addEventListener('touchmove', (e) => { if (e.touches[0]) moveDrag(e.touches[0].clientX); }, { passive: true });
        wrap.addEventListener('touchend', endDrag);
    }

    // ── preview selected clip ─────────────────────────────────────────────────────
    function stopPreview() {
        if (previewSource) { try { previewSource.stop(); } catch (_) {} previewSource = null; }
        if (playRAF) { cancelAnimationFrame(playRAF); playRAF = null; }
        const ph = $('fptWavePlayhead');
        if (ph) ph.style.display = 'none';
    }

    async function previewSelection() {
        if (!decodedBuffer) return;
        stopPreview();
        const ctx = getCtx();
        if (ctx.state === 'suspended') await ctx.resume();

        const clip = Math.min(clipSeconds, decodedBuffer.duration);
        const src = ctx.createBufferSource();
        src.buffer = decodedBuffer;

        const gain = ctx.createGain();
        // громкость из настроек
        const { notificationVolume } = await chrome.storage.local.get('notificationVolume');
        gain.gain.value = (typeof notificationVolume === 'number') ? Math.max(0, Math.min(1, notificationVolume)) : 1;

        src.connect(gain).connect(ctx.destination);
        previewSource = src;
        src.start(0, selStart, clip);

        // playhead animation
        const wrap = $('fptWaveWrap');
        const ph = $('fptWavePlayhead');
        const startedAt = ctx.currentTime;
        if (ph && wrap) {
            ph.style.display = 'block';
            const dur = decodedBuffer.duration;
            const tick = () => {
                const elapsed = ctx.currentTime - startedAt;
                if (elapsed >= clip) { stopPreview(); return; }
                const sec = selStart + elapsed;
                ph.style.left = ((sec / dur) * wrap.clientWidth) + 'px';
                playRAF = requestAnimationFrame(tick);
            };
            playRAF = requestAnimationFrame(tick);
        }
        src.onended = () => stopPreview();
    }

    // ── encode selected clip to WAV ───────────────────────────────────────────────
    function sliceToWav() {
        const dur = decodedBuffer.duration;
        const clip = Math.min(clipSeconds, dur);
        const rate = decodedBuffer.sampleRate;
        const startSample = Math.floor(selStart * rate);
        const clipSamples = Math.floor(clip * rate);
        const channels = Math.min(2, decodedBuffer.numberOfChannels);

        // собираем PCM 16-bit
        const chData = [];
        for (let c = 0; c < channels; c++) chData.push(decodedBuffer.getChannelData(c));

        const numSamples = clipSamples;
        const bytesPerSample = 2;
        const blockAlign = channels * bytesPerSample;
        const dataSize = numSamples * blockAlign;
        const buffer = new ArrayBuffer(44 + dataSize);
        const view = new DataView(buffer);

        const writeStr = (off, s) => { for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i)); };

        writeStr(0, 'RIFF');
        view.setUint32(4, 36 + dataSize, true);
        writeStr(8, 'WAVE');
        writeStr(12, 'fmt ');
        view.setUint32(16, 16, true);
        view.setUint16(20, 1, true);            // PCM
        view.setUint16(22, channels, true);
        view.setUint32(24, rate, true);
        view.setUint32(28, rate * blockAlign, true);
        view.setUint16(32, blockAlign, true);
        view.setUint16(34, 16, true);
        writeStr(36, 'data');
        view.setUint32(40, dataSize, true);

        let offset = 44;
        for (let i = 0; i < numSamples; i++) {
            for (let c = 0; c < channels; c++) {
                let sample = chData[c][startSample + i] || 0;
                sample = Math.max(-1, Math.min(1, sample));
                view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7FFF, true);
                offset += 2;
            }
        }

        // → base64 data URL
        const bytes = new Uint8Array(buffer);
        let binary = '';
        const chunk = 0x8000;
        for (let i = 0; i < bytes.length; i += chunk) {
            binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
        }
        return 'data:audio/wav;base64,' + btoa(binary);
    }

    // ── file load ─────────────────────────────────────────────────────────────────
    async function handleFile(file) {
        const nameEl = $('fptCustomSoundFileName');
        if (nameEl) nameEl.textContent = file.name;
        const editor = $('fptCustomSoundEditor');

        try {
            const arrBuf = await file.arrayBuffer();
            const ctx = getCtx();
            decodedBuffer = await ctx.decodeAudioData(arrBuf.slice(0));
            selStart = 0;
            if (editor) editor.style.display = 'block';
            drawWave();
            updateSelectionUI();
            bindDrag();
        } catch (e) {
            if (typeof showNotification === 'function') showNotification('Не удалось прочитать аудиофайл: ' + e.message, true);
            if (editor) editor.style.display = 'none';
        }
    }

    async function saveClip() {
        if (!decodedBuffer) return;
        const saveBtn = $('fptCustomSoundSaveBtn');
        if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = 'Сохраняю…'; }
        try {
            const dataUrl = sliceToWav();
            const clip = Math.min(clipSeconds, decodedBuffer.duration);
            await chrome.storage.local.set({
                [STORE_DATA]: dataUrl,
                [STORE_META]: { length: clip },
                notificationSound: 'custom'
            });
            // отметить радио «Своя мелодия»
            const radio = document.querySelector('input[name="notificationSound"][value="custom"]');
            if (radio) radio.checked = true;
            const savedEl = $('fptCustomSoundSaved');
            const lenEl = $('fptCustomSoundSavedLen');
            if (lenEl) lenEl.textContent = clip.toFixed(1);
            if (savedEl) savedEl.style.display = 'block';
            if (typeof showNotification === 'function') showNotification('Своя мелодия сохранена!');
        } catch (e) {
            if (typeof showNotification === 'function') showNotification('Ошибка сохранения: ' + e.message, true);
        } finally {
            if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = 'Сохранить мелодию'; }
        }
    }

    // ── visibility toggle (radio = custom) ────────────────────────────────────────
    async function syncCustomBlockVisibility() {
        const block = $('fptCustomSoundBlock');
        if (!block) return;
        const selected = document.querySelector('input[name="notificationSound"]:checked');
        const isCustom = selected && selected.value === 'custom';
        block.style.display = isCustom ? 'block' : 'none';

        // показать «сохранено», если уже есть сохранённый клип
        const { [STORE_META]: meta, [STORE_DATA]: data } = await chrome.storage.local.get([STORE_META, STORE_DATA]);
        const savedEl = $('fptCustomSoundSaved');
        const lenEl = $('fptCustomSoundSavedLen');
        const nameEl = $('fptCustomSoundFileName');
        if (savedEl) savedEl.style.display = (isCustom && data) ? 'block' : 'none';
        if (lenEl && meta && meta.length) lenEl.textContent = Number(meta.length).toFixed(1);
        // Если клип уже сохранён ранее - показываем это, а не «Файл не выбран».
        if (nameEl && !decodedBuffer) {
            if (data) {
                const len = (meta && meta.length) ? Number(meta.length).toFixed(1) : '5.0';
                nameEl.textContent = `Установлена своя мелодия (${len} сек). Выберите файл, чтобы заменить.`;
                nameEl.style.color = 'var(--fpt-text,#cfd2dc)';
            } else {
                nameEl.textContent = 'Файл не выбран';
                nameEl.style.color = '';
            }
        }
    }

    // публичная инициализация - вызывается при построении попапа
    function initializeCustomSoundEditor() {
        const block = $('fptCustomSoundBlock');
        if (!block || block.dataset.init) {
            syncCustomBlockVisibility();
            return;
        }
        block.dataset.init = '1';

        // реагируем на выбор радио
        document.querySelectorAll('input[name="notificationSound"]').forEach(r => {
            r.addEventListener('change', syncCustomBlockVisibility);
        });

        const uploadBtn = $('fptCustomSoundUploadBtn');
        const input = $('fptCustomSoundInput');
        uploadBtn && uploadBtn.addEventListener('click', () => input && input.click());
        input && input.addEventListener('change', (e) => {
            const f = e.target.files && e.target.files[0];
            if (f) handleFile(f);
        });

        $('fptCustomSoundPreviewBtn') && $('fptCustomSoundPreviewBtn').addEventListener('click', previewSelection);
        $('fptCustomSoundSaveBtn') && $('fptCustomSoundSaveBtn').addEventListener('click', saveClip);

        // крутилка длительности (1..5 сек)
        const secInput = $('fptClipSeconds');
        const setSeconds = (v) => {
            clipSeconds = Math.max(1, Math.min(MAX_CLIP, v));
            if (secInput) secInput.value = String(clipSeconds);
            if (decodedBuffer) updateSelectionUI();
        };
        $('fptClipSecUp') && $('fptClipSecUp').addEventListener('click', () => setSeconds(clipSeconds + 1));
        $('fptClipSecDown') && $('fptClipSecDown').addEventListener('click', () => setSeconds(clipSeconds - 1));
        // ручной ввод: можно кликнуть и вписать свою цифру; >MAX_CLIP заменяется на MAX_CLIP
        if (secInput) {
            secInput.addEventListener('input', () => {
                const digits = secInput.value.replace(/[^0-9]/g, '');
                if (!digits) return; // дать стереть/перепечатать
                let n = parseInt(digits, 10);
                if (isNaN(n)) return;
                if (n > MAX_CLIP) n = MAX_CLIP;
                if (n < 1) n = 1;
                setSeconds(n);
            });
            secInput.addEventListener('blur', () => {
                const n = parseInt(secInput.value, 10);
                setSeconds(isNaN(n) ? clipSeconds : n);
            });
            secInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') { e.preventDefault(); secInput.blur(); }
                else if (e.key === 'ArrowUp') { e.preventDefault(); setSeconds(clipSeconds + 1); }
                else if (e.key === 'ArrowDown') { e.preventDefault(); setSeconds(clipSeconds - 1); }
            });
        }
        // колесо мыши над крутилкой
        const spin = secInput && secInput.closest('.fpt-sec-spin');
        spin && spin.addEventListener('wheel', (e) => { e.preventDefault(); setSeconds(clipSeconds + (e.deltaY < 0 ? 1 : -1)); }, { passive: false });

        window.addEventListener('resize', () => { if (decodedBuffer) { drawWave(); updateSelectionUI(); } });

        syncCustomBlockVisibility();
    }

    if (typeof window !== 'undefined') {
        window.initializeCustomSoundEditor = initializeCustomSoundEditor;
    }
})();
