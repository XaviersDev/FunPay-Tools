// content/theme_flash_fix.js

(async () => {
    const HIDE_STYLE_ID = 'fp-tools-flash-hide-style';
    const THEME_STYLE_ID = 'fp-tools-custom-theme';
    const FONT_STYLE_ID = 'fp-tools-google-fonts';

    const hideStyle = document.createElement('style');
    hideStyle.id = HIDE_STYLE_ID;
    hideStyle.textContent = `body { visibility: hidden !important; background: #0b0b0b !important; }`;
    document.documentElement.appendChild(hideStyle);

    const GOOGLE_FONTS = ['Roboto', 'Open Sans', 'Lato', 'Montserrat', 'Source Sans Pro'];
    const DEFAULT_THEME = {
        bgColor1: '#ff6d15',
        bgColor2: '#f4cf78',
        containerBgColor: '#0b0b0b',
        containerBgOpacity: 1,
        textColor: '#f0f0f0',
        linkColor: '#2d6bb3',
        bgImage: null,
        font: 'Helvetica Neue',
        bgBlur: 0,
        bgBrightness: 100,
        borderRadius: 8,
        enableCircleCustomization: false,
        showCircles: true,
        circleSize: 100,
        circleOpacity: 100,
        circleBlur: 0,
        enableImprovedSeparators: false,
        headerPosition: 'top',
        enableGlassmorphism: false,
        glassmorphismBlur: 10,
        enableCustomScrollbar: false,
        scrollbarThumbColor: '#555555',
        scrollbarTrackColor: '#222222',
        scrollbarWidth: 8
    };

    function hexToRgba(hex, alpha) {
        let r = 0, g = 0, b = 0;
        if (hex.length == 4) {
            r = "0x" + hex[1] + hex[1]; g = "0x" + hex[2] + hex[2]; b = "0x" + hex[3] + hex[3];
        } else if (hex.length == 7) {
            r = "0x" + hex[1] + hex[2]; g = "0x" + hex[3] + hex[4]; b = "0x" + hex[5] + hex[6];
        }
        return `rgba(${+r},${+g},${+b},${alpha})`;
    }

    function manageFontImports(settings) {
        if (document.getElementById(FONT_STYLE_ID)) return;
        const font = settings.font;
        const isGoogleFont = GOOGLE_FONTS.includes(font);
        if (isGoogleFont) {
            const styleEl = document.createElement('style');
            styleEl.id = FONT_STYLE_ID;
            styleEl.textContent = `@import url('https://fonts.googleapis.com/css2?family=${font.replace(/ /g, '+')}:wght@400;700&display=swap');`;
            document.head.appendChild(styleEl);
        }
    }
    
    function getCustomThemeCss(settings) {
        const bgImageUrl = settings.bgImage ? `url(${settings.bgImage})` : 'url(https://i.ibb.co/ZpS0d56R/PH6-UEvp-Kn-KI.jpg)';
        const containerBgRgba = hexToRgba(settings.containerBgColor, settings.containerBgOpacity);

        let baseCss = `
            body::before {
                content: ''; position: fixed; left: 0; top: 0; width: 100vw; height: 100vh;
                background: ${bgImageUrl} no-repeat center center fixed;
                background-size: cover;
                filter: blur(${settings.bgBlur}px) brightness(${settings.bgBrightness}%);
                z-index: -1;
            }
            html { background-color: #0b0b0b !important; } /* Fallback */
            .wrapper-content, .wrapper-footer, body, .wrapper, .content-orders, .bg-light-color #header, .bg-light-color #footer, .wrapper-footer { background: transparent !important; }
            .wrapper-content, .wrapper-footer { background-color: rgba(0,0,0,0.4) !important; }
            body { font-family: '${settings.font}', Helvetica Neue, Helvetica, Arial, sans-serif; font-size: 14px; line-height: 1.428571429; color: #TEXT_COLOR# }
            .profile-cover-img { background-clip: border-box; background: url(https://funpay.com/img/layout/profile-header.jpg) no-repeat center bottom; background-size: 100% auto } .profile-cover { overflow: unset } .media-user-name { color: #ACCENT_COLOR# } .media-user-name a { color: #fff } .bg-light-color { background-color: #fff0 } header { background: rgba(0,0,0,0.08) !important } .game-title a { color: #ACCENT_COLOR#; text-decoration: none } .navbar-right.logged .dropdown-menu { border-radius: 8px } .user-link-name { color: #ACCENT_COLOR# } .product-page .page-content { background-color: #0009; border-radius: 10px; margin-top: 12px; margin-bottom: 20px; padding: 20px } .chat-btn-image { background-color: #ff6d1500; border: 0px; color: #fff } .chat-btn-image:hover { background-color: transparent; border: 0px; color: #fff } .chat-btn-image:focus { background-color: transparent; border: 0px; color: #fff } .btn-default:active:hover, .btn-default:active:focus, .btn-default:active.focus, .btn-default.active:hover, .btn-default.active:focus, .btn-default.active.focus { color: #fff; background-color: #ff6d1500; border: 0px } .fa-info-circle:before { filter: brightness(0) invert(1) } .chat-form-input .form-group { transform: translate(-10px); width: 103% } .tc.table-hover .tc-item.transaction-status-waiting { background-color: #b17f2e94 } .tc.table-hover .tc-item.transaction-status-waiting:hover { background-color: #b37f2abf } .tc-finance .tc-header>div, .tc-finance .tc-item>div { border-bottom: #505050 1px solid; border-top: #505050 0px solid } .tc.table-hover .tc-item.info { background-color: #1f508994 } .tc.table-hover .tc-item.info:hover { background-color: #1f5089bf } .tc.table-hover .tc-item:hover { background-color: ${containerBgRgba} } .navbar-default .navbar-nav>.active>a, .navbar-default .navbar-nav>.active>a:hover, .navbar-default .navbar-nav>.active>a:focus { color: #LINK_COLOR#; font-weight: 700; background-color: #0000 } .counter-list .counter-item { background: #14141480; border: 0px solid #feff00; border-radius: 20px; outline: 0 } .content-with-cd-wide { background: ${containerBgRgba}; border-radius: 10px } a.tc-item { color: #TEXT_COLOR#; text-decoration: none } .cd { position: relative; z-index: 100; border-radius: 50%; width: 700px; height: 700px; filter: brightness(.8); border: 0px } a.cd-satellite { transform: translate(-25px) } .offer { background: ${containerBgRgba}; padding: 20px; border-radius: 10px } .tc { background-color: ${containerBgRgba}; border-radius: 10px } .tc-finance { border-top: 0px solid #322f34; border-bottom: #322f34 0px solid; border-left: #322f34 0px solid; border-right: #322f34 0px solid; border-radius: 10px } .modal-content { background-color: ${containerBgRgba}; border: 0px solid #999; border-radius: 10px; -webkit-box-shadow: 0 3px 9px rgba(0, 0, 0, .5); box-shadow: 0 3px 9px #00000080; background-clip: padding-box; outline: 0 } label.control-label { color: #ffba4cc4 } .counter-item { background: #0b0b0b90; color: #TEXT_COLOR# } .counter-item:hover, .counter-item:focus, .counter-item:active, .counter-item:active:hover { background: #0b0b0bad; color: #TEXT_COLOR# } .counter-item.active { background: ${containerBgRgba}; color: #fff } .counter-item.active:hover, .counter-item.active:focus, .counter-item.active:active, .counter-item.active:active:hover { background: #101010; color: #fff } .form-control-box { background: transparent; border: 1px solid #fff; border-radius: 10px } h5, .h5, .form-group>label { color: #fff } .bootstrap-select .dropdown-menu.inner { background-color: #0f0f0f } .lot-field .lot-field-radio-box button { background-color: #161617; color: #fbfbfb } .lot-field .lot-field-radio-box button:hover { color: #fff; background-color: #1b1b1b } .btn-dark { background-color: #222; border-radius: 10px; border-color: #fff } .btn-gray:hover { background-color: #fff; color: #fff; border-radius: 10px; border-color: #fff } .chat-promo { border-radius: 10px; border: 0px; background: #00000073; transform: translate(-10px) } .dropdown-menu { background-color: #0f0f0f; border-radius: 8px } .navbar-default { border-color: #e4e4e466 } .chat-form-btn .btn-round { background-color: #cbcbcb1f; color: #fff; border-radius: 100px; border: 0px } .chat-form-btn .btn-round:hover { background-color: #3466a1; color: #fff } .chat-img { border-radius: 8px } .btn-danger { border: 0px; border-radius: 8px } .btn-gray { background-color: #3466a1; border-radius: 8px; color: #fff; border: 0px } .btn-gray:hover { color: #3466a1 } .btn-primary { border: 0px solid #fff; border-radius: 8px; background-color: #PRIMARY_COLOR#; color: #fff } .btn-primary:hover, .btn-primary:focus, .btn-primary:active, .btn-primary:active:hover, .btn-primary:active:focus, .btn-primary[disabled]:hover, .btn-primary[disabled]:focus, .btn-primary[disabled]:active, .btn-primary[disabled]:active:hover, .btn-primary[disabled]:active:focus { background-color: #fff; color: #PRIMARY_COLOR# } .btn-default { border: 0px solid #fff; border-radius: 8px; background-color: #PRIMARY_COLOR#60; color: #fff } .btn-default:hover, .btn-default:focus, .btn-default:active, .btn-default:active:hover, .btn-default:active:focus, .btn-default[disabled]:hover, .btn-default[disabled]:focus, .btn-default[disabled]:active, .btn-default[disabled]:active:hover, .btn-default[disabled]:active:focus { border: 0px solid #1e4f8700; background-color: #PRIMARY_COLOR#; color: #fff } .bg-light-style .btn-default { background-color: transparent; border: 0px; color: #fff } .block-info { color: #ffffffd9 } .navbar-form .form-control { background-color: transparent } .logo-color, .footer-block-als { filter: brightness(0) invert(1) } .nav-abc ul .active a, .nav-abc ul .active a:hover, .nav-abc ul .active a:focus { text-decoration: none; cursor: default; color: #ACCENT_COLOR# } .nav-abc .nav>li>a:hover, .nav-abc .nav>li>a:focus { text-decoration: none; cursor: default; color: #ACCENT_COLOR# } a:focus { text-decoration: none; cursor: default; color: #fff } .list-inline>li:after { content: " ·"; color: #919191 } .media-user.style-circle .avatar-photo:after { background: #a6a6a6; border: 3px solid ${containerBgRgba} } .counter-list-wide { padding-bottom: 20px; padding-top: 20px } .dropdown-menu>li+li, .dropdown-menu .dropdown-menu>li { border-top: #6a6a6a70 1px solid; border: 0px } .dropdown-menu>li:first-child>a { border-radius: 8px 8px 0 0 } .dropdown-menu>li:last-child>a { border-radius: 0 0 8px 8px } .navbar-nav>li>.dropdown-menu, .dropdown-menu, .nav-tabs .dropdown-menu { border-radius: 8px } .navbar-default .navbar-nav>li>a { color: #TEXT_COLOR# } .navbar-default .navbar-nav>li>a:hover, .navbar-default .navbar-nav>li>a:focus { color: #ddd } .ajax-alert { border-radius: 10px } .navbar-default { background-color: transparent } .offer-tc-container { border-top: #ff0000 0px solid } .tc:not(.tc-selling):not(.tc-finance) .tc-item>div { border-top: #505050 1px solid } .review-container { border-top: #505050 1px solid } .panel { background-color: #423e3e } .contact-item:hover { background: #4040956b } a { color: #LINK_COLOR#; text-decoration: none } .panel-default>.panel-heading { background-color: #292929; border-color: #2d2d2d61 } .tc.table-hover .tc-item.warning { background-color: #b17f2e94 } .tc.table-hover .tc-item.warning:hover { background-color: #b37f2abf } .tc.table-hover .tc-item { background-color: ${containerBgRgba} } .tc.table-hover a.tc-item:hover { background-color: #1b1b1b } .chat-not-selected .chat-message-container { border-top: 0px solid #fff } .chat-not-selected .chat-message-container { border-bottom: 0px solid #fff } .chat-message-container { border-left: 0px solid #fff; border-right: 0px solid #fff } .dropdown-menu>li>a:hover, .dropdown-menu>li>a:focus { color: #fff; background-color: #292828 } .navbar-nav>li>.dropdown-menu>.active>a { background: #LINK_COLOR#85; color: #fff } .navbar-nav>li>.dropdown-menu>.active>a:hover { background: #LINK_COLOR#b5 } .navbar-default .navbar-nav>.open>a, .navbar-default .navbar-nav>.open>a:hover, .navbar-default .navbar-nav>.open>a:focus { color: #LINK_COLOR# } .btn-default:active, .btn-default.active, .open>.btn-default.dropdown-toggle { color: #4384d0; background-color: #ff6c1130; border-color: red } .contact-item-message { color: #ffffff73 } .contact-item.active { background: #6f6dff90; color: #ffffffd4 } .contact-item.active:hover, .contact-item.active:focus { background: #6f6dffb5 } .contact-item.unread { background: #ff9d00a1 } .contact-item.unread, .contact-item.unread .contact-item-message { color: #ffffffd4 } .chat-form { border: #8924b100 0px solid } .chat-form-input .form-control, .chat-form-input .hiddendiv { padding: 11px 10px 10px; background-color: ${containerBgRgba}; border-radius: 10px } .badge { display: inline-block; min-width: 20px; padding: 3px 5px 5px; font-size: 12px; font-weight: 500; color: #fff; line-height: 12px; vertical-align: middle; white-space: nowrap; text-align: center; background-color: #0b0b0b55; border-radius: 10px } .payment-card { background: #0009; padding: 20px; border-radius: 10px; margin: 12px 0 } .form-control { border: 0px solid #fff; background-color: #060606; color: #TEXT_COLOR#; border-radius: 10px } .panel-default>.panel-heading { color: #ddd } .review-item-answer { display: inline-block; padding: 15px; background: #0f0f0f; border-radius: 10px; position: relative; color: #fff } .setting-item .btn-gray { background-color: #LINK_COLOR#; color: #fff; border-radius: 8px } .setting-item .btn-gray:hover, .setting-item .btn-gray:focus, .setting-item .btn-gray:active { background-color: #244f81; color: #fff } p { color: #ffffffd9 } .btn-success { border-radius: 8px; border: 0px } .drop-area { background-color: #1e1e1e; border-radius: 8px; color: #d3d3d3; border: 1px solid #0f0f0f } .drop-area.hover { background-color: #323232 } .drop-area.error { background: #ff3434c7; border: #f00; color: #TEXT_COLOR# } .btn-info { border-radius: 8px; background-color: #11a8d5; border: 0px; margin-right: 5px } .btn-warning { border-radius: 8px; background-color: #ffa002; border: 0px } .details, .form-narrow { background-color: #0009; padding: 20px; margin-bottom: 20px; border-radius: 10px } .form-narrow .btn-block, .form-narrow .form-control, .form-narrow .input-group { background-color: #0f0f0f; border-radius: 8px } .nav-tabs>li.active>a, .nav-tabs>li.active>a:hover, .nav-tabs>li.active>a:focus { color: #fff; background-color: #0000 } .lot-fields-multilingual .nav-tabs a { color: #b5b5b5 } table.table-clickable tbody tr a { color: #14e6a4; text-decoration: none } .caret { color: #fff } .bootstrap-select .dropdown-toggle .filter-option { background: #65a91a; height: 100%; width: 100%; border: 0px #fff solid; border-radius: 8px; color: #fff } .bootstrap-select .dropdown-toggle .filter-option:hover { background: #65a91a; border-radius: 8px } .bootstrap-select .dropdown-toggle .filter-option:focus { background: #65a91a; border-radius: 8px } .has-feedback .form-control { border-radius: 8px } .withdraw-box .slave { background-color: #303030; border-radius: 8px } .withdraw-box .slave:hover { background-color: #3e3e3e; border-radius: 8px } .input-group .form-control:first-child, .input-group-addon:first-child, .input-group-btn:first-child>.btn, .input-group-btn:first-child>.btn-group>.btn, .input-group-btn:first-child>.dropdown-toggle, .input-group-btn:last-child>.btn:not(:last-child):not(.dropdown-toggle), .input-group-btn:last-child>.btn-group:not(:last-child)>.btn { border-radius: 10px 0 0 10px } .bootstrap-select.input-lg .btn, .input-group-lg>.bootstrap-select.form-control .btn, .input-group-lg>.bootstrap-select.input-group-addon .btn, .input-group-lg>.input-group-btn>.bootstrap-select.btn .btn, .bootstrap-select.input-lg .dropdown-menu>li>a, .input-group-lg>.bootstrap-select.form-control .dropdown-menu>li>a, .input-group-lg>.bootstrap-select.input-group-addon .dropdown-menu>li>a, .input-group-lg>.input-group-btn>.bootstrap-select.btn .dropdown-menu>li>a, .input-group-lg>.input-group-btn>.bootstrap-select.btn .dropdown-menu>li>a:hover, .input-group-lg>.input-group-btn>.bootstrap-select.btn .dropdown-menu>li>a:focus { background: transparent; border-radius: 8px } :not(.input-group)>.bootstrap-select.form-control:not([class*=col-]) { background: transparent; border-radius: 8px } .btn-default.dropdown-toggle { color: #fff; border: 0px; background-color: #PRIMARY_COLOR# } .btn-default.dropdown-toggle:hover, .btn-default.dropdown-toggle:focus, .btn-default.dropdown-toggle:active, .btn-default.dropdown-toggle:active:hover, .open>.btn-default.dropdown-toggle, .open>.btn-default.dropdown-toggle:hover, .open>.btn-default.dropdown-toggle:focus, .open>.btn-default.dropdown-toggle:active { color: #PRIMARY_COLOR#; border: 0px; background-color: #fff } .form-control[disabled], .form-control[readonly], fieldset[disabled] .form-control { background-color: #484343 } .payment-title { color: #fff; font-weight: old } .bootstrap-select .dropdown-menu>li>a { color: #646464 } .bootstrap-select .dropdown-menu>.active>a, .bootstrap-select .dropdown-menu>.active>a:hover, .bootstrap-select .dropdown-menu>.active>a:focus { background-color: #1b1b1b; color: #82dd1e } .chat-header { border: #bd59be00 0px solid } .form-inline .form-control { background-color: #0f0f0f; border-radius: 8px } .chat-contacts, .chat-detail { background: #0009; border: #fff 0px solid } .chat-contacts { border-radius: 10px 0 0 10px } .chat-detail { border-radius: 0 10px 10px 0 } .chat { background: #0009; border-radius: 10px } .contact-item { border-bottom: #fff 0px } .chat-full-header { border-bottom: #fff 0px solid } .chat-full .chat { border-bottom: 0px solid #fff; background-color: #0009; border-radius: 0 } .chat { border-top: 0px solid #fff } .alert-info { background-color: #709fdc3b; border-color: #709fdc; color: #fff; border-radius: 8px } .fa-exclamation-circle:before { filter: brightness(0) invert(1) } .chat-message-list-date .inside { background-color: #0f0f0f; color: #fff; border-radius: 8px } .custom-scroll::-webkit-scrollbar, .chat-message-list::-webkit-scrollbar, .chat-empty::-webkit-scrollbar, .chat-form-input .form-control::-webkit-scrollbar, .chat-form-input .hiddendiv::-webkit-scrollbar { background: #e600ff00; width: 5px; height: 10px } .custom-scroll::-webkit-scrollbar-thumb, .chat-message-list::-webkit-scrollbar-thumb, .chat-empty::-webkit-scrollbar-thumb, .chat-form-input .form-control::-webkit-scrollbar-thumb, .chat-form-input .hiddendiv::-webkit-scrollbar-thumb { background: #1f1f2090 } a:hover { color: #ACCENT_COLOR#; text-decoration: underline; } .chat { border-bottom: 0px solid #90f; background: #0009; border-radius: 10px } .chat-form-input .form-control, .chat-form-input .hiddendiv { transform: translate(-10px) } .form-inline .form-control { background-color: #171718; border-radius: 10px } .theme-select { color: #d3cfc9; background-color: #181a1b; background-image: none; border-color: #383c3f; box-shadow: #00000012 0 1px 1px inset }
        `;

        let themedCss = baseCss
            .replace(/#ff6d15/gi, settings.bgColor1).replace(/#PRIMARY_COLOR#/gi, settings.bgColor1)
            .replace(/#f4cf78/gi, settings.bgColor2).replace(/#ACCENT_COLOR#/gi, settings.bgColor2)
            .replace(/#f0f0f0/gi, settings.textColor).replace(/#TEXT_COLOR#/gi, settings.textColor)
            .replace(/#2d6bb3/gi, settings.linkColor).replace(/#LINK_COLOR#/gi, settings.linkColor);

        themedCss = themedCss.replace(/border-radius: \d+px/g, `border-radius: ${settings.borderRadius}px`);

        if (settings.enableCircleCustomization) {
            let circleCss = `.cd-container .cd, .corner-cd, .profile-cover-img {
                transition: transform 0.3s ease, filter 0.3s ease, opacity 0.3s ease;
                transform: scale(${settings.circleSize / 100});
                filter: blur(${settings.circleBlur}px);
                opacity: ${settings.circleOpacity / 100};
            }`;
            if (!settings.showCircles) { circleCss += ` .cd-container { display: none !important; }`; }
            themedCss += circleCss;
        }
        if (settings.enableImprovedSeparators) {
            themedCss += `
                .tc:not(.tc-selling):not(.tc-finance) .tc-item > div { position: relative; border-top: none !important; }
                .tc:not(.tc-selling):not(.tc-finance) .tc-item > div::before { content: ""; position: absolute; top: 0; left: 0; width: 100%; height: 1px; background: rgba(255, 255, 255, 0.2); filter: blur(2px); pointer-events: none; }
            `;
        }
        if (settings.enableGlassmorphism) {
            const glassBg = hexToRgba(settings.containerBgColor, settings.containerBgOpacity);
            themedCss += `
                .offer, .tc, .modal-content, .chat-contacts, .chat-detail, .chat, .dropdown-menu, .panel, .content-with-cd-wide, .payment-card, .details, .form-narrow {
                    background: ${glassBg} !important;
                    backdrop-filter: blur(${settings.glassmorphismBlur}px);
                    -webkit-backdrop-filter: blur(${settings.glassmorphismBlur}px);
                    border: 1px solid rgba(255, 255, 255, 0.1) !important;
                }
            `;
        }
        if (settings.enableCustomScrollbar) {
            themedCss += `
                ::-webkit-scrollbar { width: ${settings.scrollbarWidth}px; }
                ::-webkit-scrollbar-track { background: ${settings.scrollbarTrackColor}; }
                ::-webkit-scrollbar-thumb { background: ${settings.scrollbarThumbColor}; border-radius: ${settings.scrollbarWidth}px; }
                ::-webkit-scrollbar-thumb:hover { background: ${settings.scrollbarThumbColor}CC; }
            `;
        }
        if (settings.headerPosition === 'bottom') {
            themedCss += `
                body { padding-bottom: 65px !important; padding-top: 0 !important; }
                #header { top: auto !important; bottom: 0 !important; border-top: 1px solid #e4e4e4; border-bottom: none !important; position: fixed; width: 100%; z-index: 1040; }
                .navbar-default { border-color: rgba(0,0,0,0) !important; }
                #header .navbar-default { border-top: 1px solid #e4e4e466; border-bottom: none !important; }
                #header .dropup .dropdown-menu, #header .dropdown-menu { top: auto !important; bottom: calc(100% - 1px); margin-top: 0; margin-bottom: 7px; box-shadow: 0 -4px 12px rgba(0,0,0,.175); }
                .navbar-form .dropdown-autocomplete { top: auto !important; bottom: 100% !important; border-bottom: none !important; border-top: 1px solid #e4e4e4 !important; box-shadow: 0 -4px 12px rgba(0,0,0,.175); border-radius: 4px 4px 0 0; }
                @media (max-width: 991px) {
                    #navbar.in, #navbar.collapsing { top: auto; bottom: 100%; position: absolute; right: 1px; left: auto; width: 240px; margin-bottom: 12px; border-radius: 4px; }
                    .navbar-collapse { max-height: calc(100vh - 80px); }
                }
            `;
        }
        return themedCss;
    }


    try {
        const data = await chrome.storage.local.get(['enableCustomTheme', 'fpToolsTheme']);
        if (data.enableCustomTheme === false) return;
        
        const settings = { ...DEFAULT_THEME, ...(data.fpToolsTheme || {}) };

        manageFontImports(settings);

        if (!document.getElementById(THEME_STYLE_ID)) {
            const themeStyle = document.createElement('style');
            themeStyle.id = THEME_STYLE_ID;
            themeStyle.textContent = getCustomThemeCss(settings);
            document.documentElement.appendChild(themeStyle);
        }
    } catch (error) {
        console.error('FP Tools Flash Fix Error:', error);
    } finally {
        requestAnimationFrame(() => {
            const styleToRemove = document.getElementById(HIDE_STYLE_ID);
            if (styleToRemove) styleToRemove.remove();
        });
    }
})();