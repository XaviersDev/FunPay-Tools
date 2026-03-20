(function initAprilFools() {
    'use strict';

    const now = new Date();

    if (now.getMonth() !== 3 || now.getDate() !== 1) return;

    const h = now.getHours(), m = now.getMinutes();
    const afterStart = h > 5 || (h === 5 && m >= 0);
    const beforeEnd  = h < 19 || (h === 19 && m < 50);
    if (!afterStart || !beforeEnd) return;

    const LS_KEY = `fpApril_${now.getFullYear()}_done`;
    if (localStorage.getItem(LS_KEY) === '1') return;

    const RELOAD_KEY = 'fpAprilReloads';
    const reloads = parseInt(sessionStorage.getItem(RELOAD_KEY) || '0', 10) + 1;
    sessionStorage.setItem(RELOAD_KEY, String(reloads));

    if (reloads >= 3) {
        localStorage.setItem(LS_KEY, '1');
        return;
    }

    let username = 'Пользователь';
    let avatarUrl = '';

    try {
        const nameEl = document.querySelector('.user-link-name');
        if (nameEl) username = nameEl.textContent.trim();
    } catch (_) {}

    try {
        const imgEl = document.querySelector('.navbar-right .user-link-photo img, .user-link-photo img');
        if (imgEl && imgEl.src) avatarUrl = imgEl.src;
    } catch (_) {}

    const avatarStyle = avatarUrl
        ? `background-image:url('${avatarUrl}');background-size:cover;background-position:center;`
        : 'background-color:#4a752c;';

    const MONTHS = ['января','февраля','марта','апреля','мая','июня',
                    'июля','августа','сентября','октября','ноября','декабря'];
    const fd = new Date(now.getTime() + 180 * 86400000);
    const freezeStr = `${fd.getDate()} ${MONTHS[fd.getMonth()]} 2926 года, 3:32`;

    document.open();
    document.write(`<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>Аккаунт заблокирован - FunPay</title>
<link rel="icon" href="https://funpay.com/img/favicon.ico">
<style>
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
*{margin:0;padding:0;box-sizing:border-box}
html{zoom:1}
body,html{width:100%;height:100%;font-family:'Inter',-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;color:#222;background:#fff;overscroll-behavior:none}
header{display:flex;align-items:center;height:70px;padding:0 40px;border-bottom:1px solid #f0f0f0;background:#fff;position:relative;z-index:10}
.hc{width:100%;max-width:1400px;margin:0 auto;display:flex;align-items:center;justify-content:space-between}
.hl{display:flex;align-items:center;gap:30px}
.logo{height:24px}
.sb{color:#888;font-size:14px;display:flex;align-items:center;gap:5px;cursor:pointer}
.si{font-weight:bold;font-size:16px}
.hr{display:flex;align-items:center;gap:20px;font-size:14px;color:#666}
.hm{display:flex;align-items:center;gap:4px;cursor:pointer}
.pp{width:32px;height:32px;border-radius:50%;cursor:pointer;position:relative;${avatarStyle}}
.pp::after{content:"▼";font-size:8px;position:absolute;right:-12px;top:12px;color:#888}
.fp-drop{position:fixed;background:#fff;border:1px solid #e0e0e0;border-radius:8px;box-shadow:0 4px 16px rgba(0,0,0,.15);display:none;z-index:99999}
.fp-drop.open{display:block}
.fp-drop a,.fp-drop button{display:block;width:100%;padding:10px 16px;font-size:14px;color:#333;text-decoration:none;background:none;border:none;text-align:left;cursor:pointer;font-family:inherit;white-space:nowrap}
.fp-drop a:hover,.fp-drop button:hover{background:#f5f5f5}
.fp-drop .f-unlock{color:#0088cc;font-weight:600}
.fp-drop .f-wait{color:#999}
main{max-width:1200px;margin:0 auto;padding:50px 20px;position:relative;height:calc(100vh - 70px);display:flex}
.cl{width:60%;max-width:680px;z-index:2;position:relative}
.cl h1,.cl p,.ft,.fr{cursor:text;user-select:text}
h1{font-size:32px;font-weight:700;margin-bottom:30px;color:#111}
p{font-size:14px;line-height:1.5;margin-bottom:16px;color:#333}
a{color:#0088cc;text-decoration:none}
a:hover{text-decoration:underline}
.fs{margin-top:40px}
.fti{font-size:10px;text-transform:uppercase;letter-spacing:1px;color:#888;margin-bottom:10px}
.fb{background:#f7f7f7;border-radius:4px;padding:20px}
.ft{font-size:12px;color:#333;margin-bottom:15px;line-height:1.4}
.fr{font-size:13px;margin-bottom:10px;color:#333}
.fn{font-size:12px;color:#666;margin-bottom:20px}
.bc{display:flex;gap:15px;align-items:center}
.bw{display:inline-block;background:#fff;color:#0088cc;border:1px solid #dcdcdc;padding:8px 16px;border-radius:4px;font-size:14px;font-weight:500;cursor:default}
.bu{display:none;background:#ffcc00;color:#222;border:none;padding:9px 20px;border-radius:4px;font-size:14px;font-weight:600;cursor:pointer;transition:opacity .3s}
.bu:hover{opacity:.8}
.sg{position:fixed;top:100px;right:-450px;width:900px;height:900px;border-radius:50%;background-image:url('https://funpay.com/img/circles/to420_spiders.jpg');background-size:cover;background-position:left center;z-index:0}
.ee{position:fixed;bottom:15px;left:20px;font-size:11px;color:#dcdcdc;z-index:100;max-width:700px;line-height:1.4;cursor:text;user-select:text}
</style>
</head>
<body>
<header>
  <div class="hc">
    <div class="hl">
      <img src="https://funpay.com/img/layout/logo-funpay.svg" alt="FunPay Logo" class="logo">
      <div class="sb">Поиск по 790 играм <span class="si">&#9906;</span></div>
    </div>
    <div class="hr">
      <div class="hm" id="helpBtn">Помощь &#9660;</div>
      <div class="pp" id="avBtn"></div>
    </div>
  </div>
</header>
<div class="fp-drop" id="helpDrop">
  <a href="https://funpay.com/trade/info" target="_blank">Правила</a>
  <a href="https://support.funpay.com/" target="_blank">Центр помощи</a>
  <a href="https://support.funpay.com/tickets/new" target="_blank">Отправить запрос</a>
  <button class="f-unlock" onclick="endJoke()">Разблокировать</button>
</div>
<div class="fp-drop" id="avPop">
  <button class="f-unlock" onclick="endJoke()">Разблокировать</button>
  <button class="f-wait" onclick="closeDrop('avPop')">Подождать ещё</button>
</div>
<div class="sg"></div>
<main>
  <div class="cl">
    <h1>Аккаунт заблокирован</h1>
    <p>Ваш аккаунт <strong>${username}</strong> заблокирован.</p>
    <p>Причина блокировки: попытка выставить на продажу саму службу поддержки FunPay, а также передача покупателю GPS-координат места закладки логина и пароля в лесополосе. Наши алгоритмы зафиксировали, что вы требовали от покупателя произвести оплату борзыми щенками и талонами на интернет, что грубо нарушает правила площадки. Кроме того, вы установили гарантию на цифровой товар «до конца света», что невозможно проверить технически.</p>
    <p>Мы хотим разобраться в ситуации, поэтому, пожалуйста, <a href="https://support.funpay.com/tickets/new">напишите нам</a>. Обычно отвечаем за 9 лет, но постараемся быстрее.</p>
    <p>Просим вас не писать каких-либо отзывов и не начинать публичное обсуждение до окончания разбирательства. Нам важно поддерживать порядок на площадке, но, к сожалению, добиться этого без блокировок не представляется возможным.</p>
    <div class="fs">
      <div class="fti">ФИНАНСЫ</div>
      <div class="fb">
        <div class="ft">В соответствии с правилами платёжной системы Visa, правилами платёжной системы Mastercard, а также иными правилами, установленными поставщиками платёжных услуг, максимальный срок заморозки денежных средств: 180 календарных дней. Если в течение этого срока не поступит опротестований со стороны заказчиков и/или международных платёжных систем и не наступит последующего возврата денежных средств (в том числе по причине нарушения правил сервиса), то ваши денежные средства будут автоматически разморожены.</div>
        <div class="fr">Дата разморозки денежных средств: ${freezeStr}</div>
        <div class="fr" style="font-weight:600">Текущий остаток денежных средств: 3 145 920.00 RUB</div>
        <div class="fn">Денежные средства по операциям, находящимся в процессе выполнения, не отображены.</div>
        <div class="bc">
          <div class="bw">Вывести деньги</div>
          <button id="unlockBtn" class="bu">Разблокировать аккаунт</button>
        </div>
      </div>
    </div>
  </div>
</main>
<div class="ee">Это первоапрельская шутка от расширения FunPay Tools! Не пугайтесь, ваш аккаунт в полной безопасности и не был заблокирован. Этот розыгрыш исчезнет сам по себе ровно через 15 минут. А для самых нетерпеливых — просто обновите эту вкладку 3 раза подряд, и всё вернётся в норму. С 1 апреля!</div>
</body>
</html>`);
    document.close();

    (function applyZoom() {
        var scaleW = window.innerWidth / 1440;
        var scaleH = window.innerHeight / 860;
        var scale = Math.min(scaleW, scaleH, 1);
        document.documentElement.style.zoom = scale;
    })();

    function endJoke() {
        try { localStorage.setItem(LS_KEY, '1'); } catch(e) {}
        try { sessionStorage.removeItem('fpAprilReloads'); } catch(e) {}
        window.location.replace('https://funpay.com/');
    }

    function openDrop(id, anchor, alignRight) {
        document.querySelectorAll('.fp-drop.open').forEach(function(el) { el.classList.remove('open'); });
        var drop = document.getElementById(id);
        var r = anchor.getBoundingClientRect();
        drop.style.top = (r.bottom + 8) + 'px';
        if (alignRight) {
            drop.style.left = '';
            drop.style.right = (window.innerWidth - r.right) + 'px';
        } else {
            drop.style.right = '';
            drop.style.left = r.left + 'px';
        }
        drop.classList.add('open');
    }

    document.getElementById('helpBtn').addEventListener('click', function(e) {
        e.stopPropagation();
        var drop = document.getElementById('helpDrop');
        if (drop.classList.contains('open')) { drop.classList.remove('open'); return; }
        openDrop('helpDrop', this, false);
    });

    document.getElementById('avBtn').addEventListener('click', function(e) {
        e.stopPropagation();
        var drop = document.getElementById('avPop');
        if (drop.classList.contains('open')) { drop.classList.remove('open'); return; }
        openDrop('avPop', this, true);
    });

    document.getElementById('helpDrop').querySelector('.f-unlock').addEventListener('click', endJoke);
    document.getElementById('avPop').querySelectorAll('button')[0].addEventListener('click', endJoke);
    document.getElementById('avPop').querySelectorAll('button')[1].addEventListener('click', function() {
        document.getElementById('avPop').classList.remove('open');
    });

    document.getElementById('helpDrop').addEventListener('click', function(e) { e.stopPropagation(); });
    document.getElementById('avPop').addEventListener('click', function(e) { e.stopPropagation(); });

    document.addEventListener('click', function() {
        document.querySelectorAll('.fp-drop.open').forEach(function(el) { el.classList.remove('open'); });
    });

    setTimeout(function() {
        var b = document.getElementById('unlockBtn');
        if (b) { b.style.display = 'inline-block'; b.addEventListener('click', endJoke); }
    }, 90000);

    setTimeout(endJoke, 900000);
})();