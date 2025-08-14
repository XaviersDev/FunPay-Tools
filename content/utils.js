function throttle(func, limit) {
    let inThrottle;
    return function() {
        const args = arguments;
        const context = this;
        if (!inThrottle) {
            func.apply(context, args);
            inThrottle = true;
            setTimeout(() => inThrottle = false, limit);
        }
    }
}

function createElement(tag, attributes = {}, styles = {}, innerHTML = '') {
    const element = document.createElement(tag);
    for (const [key, value] of Object.entries(attributes)) {
        element.setAttribute(key, value);
    }
    for (const [key, value] of Object.entries(styles)) {
        element.style[key] = value;
    }
    element.innerHTML = innerHTML;
    return element;
}

function waitForElementToBeEnabled(element, timeout = 2000) {
    return new Promise((resolve) => {
        if (!element.disabled) {
            return resolve();
        }
        const interval = 50;
        let elapsedTime = 0;
        const checker = setInterval(() => {
            elapsedTime += interval;
            if (!element.disabled || elapsedTime >= timeout) {
                clearInterval(checker);
                resolve();
            }
        }, interval);
    });
}

function showNotification(message, isError = false) {
    const notification = createElement('div', {}, {
        position: 'fixed',
        bottom: '30px',
        right: '30px',
        background: isError ? 'linear-gradient(45deg, #FF6B6B, #D32F2F)' : 'linear-gradient(45deg, #00C9FF, #92FE9D)',
        color: 'white',
        padding: '20px 30px',
        borderRadius: '50px',
        fontSize: '18px',
        fontWeight: 'bold',
        boxShadow: '0 10px 30px rgba(0, 0, 0, 0.3)',
        zIndex: '20000',
        animation: 'slideIn 0.5s forwards, fadeOut 0.5s 2.5s forwards'
    }, message);

    if (!document.querySelector('style[data-fp-tools-notify-keyframes]')) {
        const keyframesStyle = `@keyframes slideIn { from { transform: translateX(100%); opacity: 0; } to { transform: translateX(0); opacity: 1; } } @keyframes fadeOut { from { opacity: 1; } to { opacity: 0; } }`;
        const keyframesStyleSheet = createElement("style", { 'data-fp-tools-notify-keyframes': 'true' }, {}, keyframesStyle);
        document.head.appendChild(keyframesStyleSheet);
    }

    document.body.appendChild(notification);
    setTimeout(() => { if (document.body.contains(notification)) document.body.removeChild(notification); }, 3000);
}