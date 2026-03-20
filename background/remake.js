// background/remake.js — FunPay Tools 3.0
// FIXED: auto_delivery no longer placed into "message after payment".
//        Cardinal `answer` → order_msg, `secrets` stays as auto-delivery goods.

const dropZone    = document.getElementById('drop-zone');
const fileInput   = document.getElementById('file-input');
const logElement  = document.getElementById('log');
const downloadBtn = document.getElementById('download-btn');
const clearBtn    = document.getElementById('clear-btn');
let allConvertedLots = [];

function log(message, type = 'normal') {
    const entry = document.createElement('div');
    if (type) entry.classList.add(`log-${type}`);
    entry.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
    logElement.appendChild(entry);
    logElement.scrollTop = logElement.scrollHeight;
}

function resetState() {
    allConvertedLots = [];
    logElement.innerHTML = '';
    downloadBtn.disabled = true;
    fileInput.value = '';
    log('Готов к работе...', 'info');
}
resetState();

dropZone.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', () => handleFiles(fileInput.files));
dropZone.addEventListener('dragover',  e => { e.preventDefault(); dropZone.classList.add('dragover'); });
dropZone.addEventListener('dragleave', ()  => dropZone.classList.remove('dragover'));
dropZone.addEventListener('drop', e => {
    e.preventDefault();
    dropZone.classList.remove('dragover');
    handleFiles(e.dataTransfer.files);
});
clearBtn.addEventListener('click', resetState);
downloadBtn.addEventListener('click', () => {
    if (!allConvertedLots.length) { log('Нет данных для скачивания.', 'error'); return; }
    const dateStr = new Date().toISOString().slice(0, 10);
    const blob = new Blob([JSON.stringify(allConvertedLots, null, 2)], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = `FP_Tools_Import_${dateStr}.json`;
    document.body.appendChild(a); a.click();
    document.body.removeChild(a); URL.revokeObjectURL(url);
    log('Файл скачан!', 'success');
});

async function handleFiles(files) {
    if (!files?.length) return;
    logElement.innerHTML = '';
    log(`Обрабатываю ${files.length} файл(ов)...`, 'info');

    const results = await Promise.all(Array.from(files).map(file => new Promise(resolve => {
        if (!file.name.endsWith('.json')) {
            log(`Пропущен: "${file.name}" — нужен .json.`, 'error');
            resolve([]); return;
        }
        const reader = new FileReader();
        reader.onerror = () => { log(`Ошибка чтения "${file.name}".`, 'error'); resolve([]); };
        reader.onload = e => {
            try {
                let raw = JSON.parse(e.target.result.replace(/^\uFEFF/, ''));
                // Support: array, { lots: [] }, { data: [] }, single object
                if (!Array.isArray(raw)) {
                    raw = raw?.lots || raw?.data || raw?.items || (raw?.offer_id !== undefined ? [raw] : null);
                    if (!raw) throw new Error('Неизвестный формат. Ожидается массив лотов Cardinal.');
                }
                if (!raw.length) { log(`"${file.name}": лотов не найдено.`, 'error'); resolve([]); return; }
                const converted = convertFormat(raw);
                log(`✓ "${file.name}" — ${converted.length} лот(ов).`, 'success');
                resolve(converted);
            } catch (err) {
                log(`Ошибка в "${file.name}": ${err.message}`, 'error');
                resolve([]);
            }
        };
        reader.readAsText(file, 'utf-8');
    })));

    allConvertedLots = results.flat();
    if (allConvertedLots.length > 0) {
        log(`Итого: ${allConvertedLots.length} лот(ов) готово к импорту.`, 'info');
        downloadBtn.disabled = false;
    } else {
        log('Подходящих лотов не найдено.', 'error');
        downloadBtn.disabled = true;
    }
}

function convertFormat(cardinalLots) {
    const metaKeys = ['query', 'location'];
    return cardinalLots.map((lot, idx) => {
        const data = {};
        for (const key in lot) {
            if (!metaKeys.includes(key)) data[key] = lot[key];
        }

        // Reset offer_id so FunPay creates a new lot
        if (data.offer_id !== undefined) data.offer_id = '0';

        // ── FIX: Cardinal field mapping ──────────────────────────────────
        // `secrets`  = array of goods for auto-delivery  → keep as `secrets`
        // `answer`   = message sent after order payment  → maps to `order_msg`
        //
        // BUG WAS: `answer` was leaking into auto_delivery section in FP Tools
        // because both used the same storage path.
        const hasSecrets = Array.isArray(data.secrets) && data.secrets.length > 0;
        const hasAnswer  = typeof data.answer === 'string' && data.answer.trim() !== '';

        // Auto-delivery: enable flag if secrets exist, clear if not
        data.auto_delivery = hasSecrets ? 'on' : '';

        // Message after payment: map `answer` → `order_msg`, do NOT put in secrets
        if (hasAnswer) {
            if (!data.order_msg) data.order_msg = data.answer;
            delete data.answer; // remove raw key to avoid double handling
        }

        const title =
            data['fields[summary][ru]'] ||
            data['fields[summary][en]'] ||
            data.title ||
            `Лот #${idx + 1}`;

        return {
            sourceTitle:    title,
            sourceCategory: data.nodeId ? String(data.nodeId) : '',
            data
        };
    });
}
