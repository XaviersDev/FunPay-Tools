// content/error_page_reload.js
// FIX 2.9.0: когда FunPay отдаёт страницу ошибки nginx (502 Bad Gateway, 503, 504)
// или 429 (Too Many Requests), показываем аккуратную заглушку с таймером и
// "Подождите..." и сами перезагружаем страницу через 3.5 секунды, вместо голой
// чёрно-белой ошибки nginx.
(function () {
    // Признаки страницы-ошибки nginx/FunPay. Они очень компактные: <h1>NNN ...</h1>
    // + "nginx", без обычной разметки FunPay (нет navbar/app-config).
    function looksLikeErrorPage() {
        try {
            // если это нормальная страница FunPay - на ней есть data-app-config / navbar
            if (document.querySelector('[data-app-config], nav.navbar, #content')) return false;

            const bodyText = (document.body ? document.body.innerText || document.body.textContent || '' : '');
            const h1 = document.querySelector('h1');
            const h1text = h1 ? (h1.textContent || '').trim() : '';

            // коды, которые имеет смысл переждать и перезагрузить
            const RETRY_CODES = ['502', '503', '504', '429'];
            const PHRASES = ['bad gateway', 'gateway time-out', 'gateway timeout',
                             'service temporarily unavailable', 'too many requests'];

            const hasCode = RETRY_CODES.some(c => h1text.includes(c) || bodyText.includes(c));
            const hasPhrase = PHRASES.some(p => bodyText.toLowerCase().includes(p));
            const hasNginx = bodyText.toLowerCase().includes('nginx');

            // считаем ошибкой, если есть код+(nginx|фраза) ИЛИ явная фраза
            return (hasCode && (hasNginx || hasPhrase)) || (hasPhrase && hasNginx);
        } catch (_) {
            return false;
        }
    }

    function detectCode() {
        const t = (document.body ? (document.body.innerText || document.body.textContent || '') : '');
        const h1 = document.querySelector('h1');
        const h1text = h1 ? h1.textContent : '';
        const m = (h1text + ' ' + t).match(/\b(502|503|504|429)\b/);
        return m ? m[1] : null;
    }

    function showWaitOverlay(code) {
        const RELOAD_MS = 3500;
        const codeText = code === '429'
            ? 'Слишком много запросов'
            : 'FunPay временно недоступен';

        // заменяем содержимое страницы целиком
        document.documentElement.innerHTML = `
            <head><meta charset="utf-8"><title>Подождите...</title></head>
            <body style="margin:0;">
              <div id="fpt-err-wrap" style="
                  position:fixed;inset:0;display:flex;flex-direction:column;
                  align-items:center;justify-content:center;gap:22px;
                  background:#0f1016;color:#e6e7ee;
                  font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;">
                <div style="width:64px;height:64px;border-radius:50%;
                    border:5px solid rgba(192,38,211,.18);border-top-color:#C026D3;
                    animation:fptErrSpin .9s linear infinite;"></div>
                <div style="font-size:21px;font-weight:600;letter-spacing:.2px;">Подождите...</div>
                <div style="font-size:14px;color:#9a9db4;text-align:center;max-width:320px;line-height:1.5;">
                    ${codeText}${code ? ` (${code})` : ''}.<br>Страница обновится автоматически.
                </div>
                <div style="width:220px;height:4px;background:rgba(255,255,255,.08);border-radius:3px;overflow:hidden;">
                    <div id="fpt-err-bar" style="height:100%;width:0;background:#C026D3;border-radius:3px;
                        transition:width ${RELOAD_MS}ms linear;"></div>
                </div>
                <button id="fpt-err-now" style="
                    margin-top:4px;background:transparent;border:1px solid rgba(255,255,255,.18);
                    color:#c8cadc;padding:7px 16px;border-radius:8px;font-size:13px;cursor:pointer;">
                    Обновить сейчас</button>
              </div>
              <style>@keyframes fptErrSpin{to{transform:rotate(360deg)}}</style>
            </body>`;

        // запускаем прогресс-бар
        requestAnimationFrame(() => {
            const bar = document.getElementById('fpt-err-bar');
            if (bar) bar.style.width = '100%';
        });

        const reload = () => location.reload();
        const btn = document.getElementById('fpt-err-now');
        if (btn) btn.addEventListener('click', reload);
        setTimeout(reload, RELOAD_MS);
    }

    function run() {
        if (looksLikeErrorPage()) {
            showWaitOverlay(detectCode());
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', run, { once: true });
    } else {
        run();
    }
})();
