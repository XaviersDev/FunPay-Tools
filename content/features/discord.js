// /features/discord.js
async function sendToDiscordWebhook(node) {
    const userName = node.querySelector('.media-user-name').textContent.trim();
    const messageText = node.querySelector('.contact-item-message').textContent.trim();
    const avatarUrl = node.querySelector('.avatar-photo').style.backgroundImage.slice(5, -2);

    const { discordWebhookUrl } = await chrome.storage.local.get('discordWebhookUrl');
    if (!discordWebhookUrl) return;

    const payload = { username: userName, avatar_url: avatarUrl, embeds: [{ description: messageText, color: 0x00FF00 }] };
    try {
        const response = await fetch(discordWebhookUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        if (!response.ok) console.error('Failed to send message to Discord');
    } catch (error) { console.error('Error sending message to Discord:', error); }
}

async function logNewMessagesToDiscord() {
    const { logToDiscord } = await chrome.storage.local.get('logToDiscord');
    if (logToDiscord !== true) return;
    const unreadMessages = document.querySelectorAll('.contact-item.unread');
    unreadMessages.forEach(async (message) => {
        const messageId = message.getAttribute('data-id');
        if (messageId) {
            const storageKey = `discordSent_${messageId}`;
            const sentStatus = await chrome.storage.local.get(storageKey);
            if (!sentStatus[storageKey]) {
                sendToDiscordWebhook(message);
                await chrome.storage.local.set({ [storageKey]: true });
            }
        }
    });
}