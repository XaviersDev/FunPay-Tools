// content/features/epic_nicknames.js - FunPay Tools
// Epic Nicknames Engine (CSS + Canvas Particles)

(function() {
    'use strict';

    const CACHE_KEY = 'fpt_donaters_cache';
    const CACHE_TIME_KEY = 'fpt_donaters_time';
    const CACHE_DURATION = 60 * 1000; // 60 секунд

    let donatersMap = {}; 
    let parsedConfigs = {}; // Имя пользователя -> Распакованный конфиг
    let globalStyleEl = null; // Для динамического обновления стилей
    
    // Canvas Engine state
    let canvases = [];
    let visibleCanvases = new Set();
    let engineRunning = false;

    // Observer для оптимизации рендеринга частиц
    const io = new IntersectionObserver(entries => {
        entries.forEach(entry => {
            if(entry.isIntersecting) visibleCanvases.add(entry.target);
            else visibleCanvases.delete(entry.target);
        });
    }, { rootMargin: "100px" });

    // --- 1. КЭШИРОВАНИЕ И ЗАГРУЗКА БАЗЫ ---
    // Тянет свежую базу из сети и, если она изменилась, перекрашивает ники на лету.
    async function refreshFromNetwork() {
        try {
            const response = await new Promise(resolve => {
                chrome.runtime.sendMessage({ action: 'fetchDonaters' }, resolve);
            });

            if (response && response.success && response.data &&
                typeof response.data === 'object' && Object.keys(response.data).length > 0) {

                const fresh = response.data;
                const changed = JSON.stringify(fresh) !== JSON.stringify(donatersMap);

                donatersMap = fresh;
                await chrome.storage.local.set({
                    [CACHE_KEY]: donatersMap,
                    [CACHE_TIME_KEY]: Date.now()
                });

                // Если данные реально поменялись - пересобрать стили и перерисовать
                if (changed) {
                    parsedConfigs = {};
                    injectGlobalCSS();
                    scanDOM(document.body);
                }
            }
        } catch (e) {
            console.error('FPT Epic Nicks: refresh error', e);
        }
    }

    // stale-while-revalidate: мгновенно отдаём кэш, в фоне всегда обновляем.
    async function fetchDonaters() {
        const cache = await chrome.storage.local.get([CACHE_KEY, CACHE_TIME_KEY]);
        const now = Date.now();
        const fresh = cache[CACHE_KEY] && cache[CACHE_TIME_KEY] &&
                      (now - cache[CACHE_TIME_KEY] < CACHE_DURATION);

        // Всегда сначала показываем что есть в кэше (быстрый старт)
        if (cache[CACHE_KEY]) donatersMap = cache[CACHE_KEY];

        if (fresh) {
            // Кэш свежий - рисуем из него сразу, но всё равно тихо обновим в фоне
            refreshFromNetwork();
            return;
        }

        // Кэш протух (или его нет) - дожидаемся сети
        await refreshFromNetwork();
    }

    // --- 2. РАСПАКОВКА И ИНЪЕКЦИЯ CSS ---
    function hashStr(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) hash = Math.imul(31, hash) + str.charCodeAt(i) | 0;
        return Math.abs(hash).toString(16);
    }

    function hexToRgbObj(hex) {
        let r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16);
        return {r,g,b};
    }

    function injectGlobalCSS() {
        let cssRules = `
            /* Базовые стили для обертки и текста */
            .fpt-epic-wrap {
                position: relative; display: inline-flex; align-items: center; justify-content: center; 
                white-space: pre; vertical-align: bottom;
            }
            .fpt-epic-text {
                position: relative; z-index: 5; line-height: inherit;
                -webkit-background-clip: text !important;
                background-clip: text !important;
                -webkit-text-fill-color: transparent !important;
                color: transparent !important;
                display: inline-block !important;
                font-weight: 800 !important;
                text-shadow: none !important;
            }
            /* Ключевые кадры анимаций (общие для всех) */
            @keyframes fpt-wave { 0% { background-position: 0% 50%; } 100% { background-position: 100% 50%; } }
            @keyframes fpt-glitch { 0% { transform: skew(0deg); } 20% { transform: skew(-15deg); } 21% { transform: skew(15deg); } 25% { transform: skew(0deg); } 100% { transform: skew(0deg); } }
        `;

        for (const [nick, key] of Object.entries(donatersMap)) {
            if (!key || !key.startsWith('FPT-STYLE-')) continue;
            try {
                const cfg = JSON.parse(atob(key.split('FPT-STYLE-')[1]));
                parsedConfigs[nick] = cfg;
                
                const clsName = `fpt-nick-${hashStr(nick)}`;
                
                const useC3 = !!cfg.c3;
                const bg = useC3 
                    ? `linear-gradient(${cfg.ang}deg, ${cfg.c1}, ${cfg.c2}, ${cfg.c3})` 
                    : `linear-gradient(${cfg.ang}deg, ${cfg.c1}, ${cfg.c2})`;
                
                const c1rgb = hexToRgbObj(cfg.c1);
                const shadow = `rgba(${c1rgb.r},${c1rgb.g},${c1rgb.b}, 0.8)`;
                
                const anims = Array.isArray(cfg.an) ? cfg.an : (cfg.an ? [cfg.an] : []);
                const sclFix = (anims.includes('wave') && parseInt(cfg.scl) <= 100) ? '200' : cfg.scl;

                if (anims.includes('glow')) {
                    cssRules += `@keyframes fpt-glow-${clsName} { 0% { filter: drop-shadow(0 0 6px ${shadow}); } 100% { filter: drop-shadow(0 0 16px ${shadow}); } }\n`;
                }
                if (anims.includes('pulse')) {
                    cssRules += `@keyframes fpt-pulse-${clsName} { 0%, 100% { opacity: 1; filter: drop-shadow(0 0 15px ${shadow}); } 50% { opacity: 0.4; filter: drop-shadow(0 0 2px rgba(0,0,0,0)); } }\n`;
                }

                let activeAnimations = [];
                if (anims.includes('glow')) activeAnimations.push(`fpt-glow-${clsName} 2s ease-in-out infinite alternate`);
                if (anims.includes('wave')) activeAnimations.push(`fpt-wave ${cfg.spd}s ease-in-out infinite alternate`);
                if (anims.includes('pulse')) activeAnimations.push(`fpt-pulse-${clsName} ${cfg.spd}s ease-in-out infinite alternate`);
                if (anims.includes('glitch')) activeAnimations.push(`fpt-glitch calc(${cfg.spd}s / 2) infinite linear alternate-reverse`);

                cssRules += `
                    .${clsName} .fpt-epic-text {
                        background-image: ${bg} !important;
                        background-size: ${sclFix}% 100% !important;
                        ${activeAnimations.length > 0 ? `animation: ${activeAnimations.join(', ')} !important;` : ''}
                    }
                `;
            } catch (e) {
                console.warn(`[FPT] Invalid key for user ${nick}`);
            }
        }

        if (!globalStyleEl) {
            globalStyleEl = document.createElement('style');
            globalStyleEl.id = 'fpt-epic-styles';
            document.head.appendChild(globalStyleEl);
        }
        globalStyleEl.textContent = cssRules;
    }

    // --- 3. CANVAS ДВИЖОК ЧАСТИЦ ---
    function getPartColor(cfg, defR, defG, defB, alpha) {
        if(cfg.pc) { let c = hexToRgbObj(cfg.pc); return `rgba(${c.r}, ${c.g}, ${c.b}, ${alpha})`; }
        return `rgba(${defR}, ${defG}, ${defB}, ${alpha})`;
    }

    function renderLoop() {
        canvases = canvases.filter(item => {
            if(!document.body.contains(item.canvas)) {
                io.unobserve(item.canvas);
                visibleCanvases.delete(item.canvas);
                return false;
            }
            return true;
        });

        if (canvases.length === 0) {
            engineRunning = false;
            return;
        }

        canvases.forEach(item => {
            const {canvas, ctx, parts, cfg} = item;
            if(!visibleCanvases.has(canvas)) return;

            let w = canvas.offsetWidth;
            let h = canvas.offsetHeight;
            if(w === 0 || h === 0) return;

            if(canvas.width !== w) canvas.width = w;
            if(canvas.height !== h) canvas.height = h;

            ctx.clearRect(0,0,w,h);
            ctx.globalCompositeOperation = 'source-over';
            ctx.shadowBlur = 0;

            let textStartX = 80;
            let textWidth = w - 160;
            let textBaseY = h / 2 + 15;
            let textTopY = h / 2 - 2;

            if(cfg.ov === 'fire') {
                ctx.globalCompositeOperation = 'screen';
                for(let i=0; i<2; i++) {
                    if(Math.random() < 0.6) parts.push({ x: textStartX + 4 + Math.random() * (textWidth - 8), y: textTopY + Math.random() * 4, s: Math.random() * 4 + 2, sy: Math.random() * -1.2 - 0.5, sx: (Math.random() - 0.5) * 0.8, a: 1 });
                }
                for(let i=parts.length-1; i>=0; i--) {
                    let p = parts[i]; p.y += p.sy; p.x += p.sx + Math.sin(p.y * 0.1) * 0.3; p.s *= 0.94; p.a -= 0.04;
                    ctx.fillStyle = getPartColor(cfg, 255, Math.max(0, 220 * p.a), 0, p.a);
                    ctx.beginPath(); ctx.arc(p.x, p.y, p.s, 0, Math.PI*2); ctx.fill();
                    if(p.a <= 0 || p.s <= 0.5) parts.splice(i,1);
                }
            } else if(cfg.ov === 'snow') {
                if(Math.random()<0.2) parts.push({x: Math.random()*w, y: 0, s: Math.random()*2.5+1, sy: Math.random()*1+0.5, sx: Math.random()*1-0.5, a: 1});
                for(let i=parts.length-1; i>=0; i--) { let p = parts[i]; p.y += p.sy; p.x += p.sx; p.a = (h - p.y)/h; ctx.fillStyle = getPartColor(cfg, 255, 255, 255, p.a); ctx.beginPath(); ctx.arc(p.x, p.y, p.s, 0, Math.PI*2); ctx.fill(); if(p.y>h) parts.splice(i,1); }
            } else if(cfg.ov === 'sparks') {
                ctx.globalCompositeOperation = 'screen';
                if(Math.random()<0.3) parts.push({x: textStartX + Math.random()*textWidth, y: textBaseY - 5, s: Math.random()*2+1, sy: Math.random()*-4-1, sx: Math.random()*3-1.5, a: 1});
                for(let i=parts.length-1; i>=0; i--) { let p = parts[i]; p.y += p.sy; p.x += p.sx; p.a -= 0.03; ctx.fillStyle = getPartColor(cfg, 255, 255, 50, p.a); ctx.fillRect(p.x, p.y, p.s, p.s*2); if(p.a<=0) parts.splice(i,1); }
            } else if(cfg.ov === 'matrix') {
                if(Math.random()<0.15) parts.push({x: Math.floor(Math.random()*(w/12))*12, y: 0, txt: String.fromCharCode(0x30A0 + Math.random()*96)});
                ctx.font = '14px monospace';
                for(let i=parts.length-1; i>=0; i--) { let p = parts[i]; p.y += 3; ctx.fillStyle = getPartColor(cfg, 0, 255, 0, (h-p.y)/h); ctx.fillText(p.txt, p.x, p.y); if(p.y>h) parts.splice(i,1); }
            } else if(cfg.ov === 'smoke') {
                if(Math.random()<0.1) parts.push({ x: textStartX + Math.random()*textWidth, y: textBaseY - 2, s: Math.random()*5 + 3, sy: Math.random()*-0.5 - 0.2, sx: (Math.random()-0.5)*0.8, a: 0.2 });
                for(let i=parts.length-1; i>=0; i--) {
                    let p = parts[i]; p.y += p.sy; p.x += p.sx; p.s += 0.25; p.a -= 0.003;
                    let edgeFade = Math.min(1, p.y / 50, p.x / 40, (w - p.x) / 40);
                    ctx.fillStyle = getPartColor(cfg, 150, 150, 160, p.a * edgeFade);
                    ctx.beginPath(); ctx.arc(p.x, p.y, p.s, 0, Math.PI*2); ctx.fill();
                    if(p.a <= 0 || edgeFade <= 0) parts.splice(i,1);
                }
            } else if(cfg.ov === 'lightning') {
                ctx.globalCompositeOperation = 'screen';
                if(Math.random()<0.05) {
                    ctx.strokeStyle = getPartColor(cfg, 150, 255, 255, 0.9); ctx.lineWidth = 2; ctx.beginPath();
                    let lx = 60 + Math.random()*(w-120), ly = 0; ctx.moveTo(lx, ly);
                    while(ly<h) { lx += Math.random()*30-15; ly += Math.random()*20+10; ctx.lineTo(lx, ly); }
                    ctx.stroke();
                }
            } else if(cfg.ov === 'stars') {
                if(Math.random()<0.3) parts.push({x: Math.random()*w, y: Math.random()*h, s: Math.random()*2.5+0.5, a: 0, da: 0.04});
                for(let i=parts.length-1; i>=0; i--) { let p = parts[i]; p.a += p.da; if(p.a>1) p.da = -0.02; ctx.fillStyle = getPartColor(cfg, 255, 255, 255, p.a); ctx.beginPath(); ctx.arc(p.x, p.y, p.s, 0, Math.PI*2); ctx.fill(); if(p.a<0) parts.splice(i,1); }
            } else if(cfg.ov === 'orbs') {
                ctx.globalCompositeOperation = 'screen';
                if(Math.random()<0.1) parts.push({x: textStartX - 20 + Math.random()*(textWidth+40), y: textBaseY + 20, s: Math.random()*6+3, sy: Math.random()*-2-0.5, a: 0.8, ox: Math.random()*w, ang: Math.random()*Math.PI*2});
                for(let i=parts.length-1; i>=0; i--) { let p = parts[i]; p.ang += 0.04; p.x = p.ox + Math.sin(p.ang)*20; p.y += p.sy; p.a -= 0.015; ctx.fillStyle = getPartColor(cfg, 220, 150, 255, p.a); ctx.beginPath(); ctx.arc(p.x, p.y, p.s, 0, Math.PI*2); ctx.fill(); if(p.a<=0) parts.splice(i,1); }
            }
        });
        
        requestAnimationFrame(renderLoop);
    }

    // --- 4. ЗАМЕНА В ДОМ ДЕРЕВЕ ---
    function applyStylesToNode(node, nick, textContent) {
        const parent = node.parentNode;
        if (!parent) return;

        // Защита от двойного применения и исключение текста внутри сообщений.
        // .fpt-gc-* - наш собственный Общий чат: там декор-ники не нужны
        // (узкий контейнер, партиклы торчат и мешают).
        if (parent.closest('.fpt-epic-wrap') || parent.closest('.chat-msg-text')
            || parent.closest('#fpt-gc-feed') || parent.closest('.fpt-gc-msg')
            || parent.closest('.fpt-gc-author')) return;

        const cfg = parsedConfigs[nick];
        if (!cfg) return;

        const clsName = `fpt-nick-${hashStr(nick)}`;
        const wrap = document.createElement('span');
        wrap.className = `fpt-epic-wrap ${clsName}`;

        if (cfg.ov && cfg.ov !== 'none') {
            const canvas = document.createElement('canvas');
            const zIndex = ['smoke', 'snow', 'matrix', 'stars'].includes(cfg.ov) ? '1' : '10';
            canvas.style.cssText = `position:absolute; top:-80px; left:-80px; width:calc(100% + 160px); height:calc(100% + 160px); pointer-events:none; z-index:${zIndex};`;
            wrap.appendChild(canvas);
            io.observe(canvas);
            canvases.push({ canvas, ctx: canvas.getContext('2d'), parts: [], cfg });
            
            if (!engineRunning) {
                engineRunning = true;
                requestAnimationFrame(renderLoop);
            }
        }

        const textSpan = document.createElement('span');
        textSpan.className = 'fpt-epic-text';
        textSpan.textContent = textContent;

        wrap.appendChild(textSpan);
        parent.replaceChild(wrap, node);
    }

    function scanDOM(rootNode) {
        if (Object.keys(parsedConfigs).length === 0) return;

        const walk = document.createTreeWalker(rootNode, NodeFilter.SHOW_TEXT, null, false);
        let node;
        const nodesToProcess = [];

        while (node = walk.nextNode()) {
            const val = node.nodeValue.trim();
            if (parsedConfigs[val]) {
                nodesToProcess.push({ node, nick: val, text: node.nodeValue });
            }
        }

        nodesToProcess.forEach(item => applyStylesToNode(item.node, item.nick, item.text));
    }


    // --- 5. ФУНКЦИЯ ДЛЯ UI ПОПАПА (ПРЕДПРОСМОТР) ---
    window.renderEpicPreviews = function() {
        const container = document.getElementById('fpt-epic-previews-container');
        if (!container) return;

        let myNick = "ТвойНик";
        const myNickEl = document.querySelector('.user-link-name');
        if (myNickEl && myNickEl.textContent) myNick = myNickEl.textContent.trim();

        const presets = [
            "FPT-STYLE-eyJjMSI6IiNmZjg4MDAiLCJjMiI6IiNmZjAwMDAiLCJjMyI6IiNmZmZmMDAiLCJhbmciOiI5OSIsInNjbCI6IjU2Iiwic3BkIjoiNyIsImFuIjpbImdsb3ciLCJ3YXZlIl0sIm92IjoibGlnaHRuaW5nIiwicGMiOiIjZmZmNzAwIn0=",
            "FPT-STYLE-eyJjMSI6IiNmNzA5ZmIiLCJjMiI6IiNmZjAwNTUiLCJjMyI6IiNmZmZmZmYiLCJhbmciOiIxMzEiLCJzY2wiOiIxNjkiLCJzcGQiOiI3IiwiYW4iOlsiZ2xvdyIsIndhdmUiXSwib3YiOiJzcGFya3MiLCJwYyI6IiNmZjAwNDAifQ==",
            "FPT-STYLE-eyJjMSI6IiNmZjE5MDAiLCJjMiI6IiNmZjU5MDAiLCJjMyI6bnVsbCwiYW5nIjoiMzI4Iiwic2NsIjoiODgiLCJzcGQiOiIxIiwiYW4iOlsiZ2xvdyIsIndhdmUiLCJwdWxzZSIsImdsaXRjaCJdLCJvdiI6ImZpcmUiLCJwYyI6IiNmZjI2MDAifQ=="
        ];

        const previewMap = {};
        presets.forEach((preset, i) => {
            previewMap[`${myNick} ${i+1}`] = preset;
        });

        // Добавляем тестовые ники и ПРИНУДИТЕЛЬНО обновляем стили и парсер
        Object.assign(donatersMap, previewMap);
        injectGlobalCSS();

        container.innerHTML = ''; // Очищаем контейнер

        presets.forEach((preset, i) => {
            const nick = `${myNick} ${i+1}`;
            
            const row = document.createElement('div');
            row.style.cssText = "display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid #1e2030; padding-bottom: 15px;";
            
            const nameCol = document.createElement('div');
            nameCol.style.cssText = "font-size: 16px;";
            
            const textNode = document.createTextNode(nick);
            nameCol.appendChild(textNode);
            
            const infoCol = document.createElement('div');
            infoCol.style.cssText = "font-size: 12px; color: #5a5f7a;";
            infoCol.textContent = `Пример ${i+1}`;

            row.appendChild(nameCol);
            row.appendChild(infoCol);
            container.appendChild(row);

            // Рендерим стили и канвас в этот конкретный узел
            applyStylesToNode(textNode, nick, nick);
        });
    };


    // --- ИНИЦИАЛИЗАЦИЯ ---
    async function init() {
        await fetchDonaters();
        if (Object.keys(donatersMap).length > 0) {
            injectGlobalCSS();
            scanDOM(document.body);

            const observer = new MutationObserver(mutations => {
                mutations.forEach(m => {
                    m.addedNodes.forEach(node => {
                        if (node.nodeType === Node.ELEMENT_NODE) scanDOM(node);
                    });
                });
            });
            observer.observe(document.body, { childList: true, subtree: true });
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();