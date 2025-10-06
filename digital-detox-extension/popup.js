// blocked.js - Blocked page script

const QUOTES = [
    "The time you enjoy wasting is not wasted time, but the time you spend scrolling mindlessly? That's time you'll never get back.",
    "You picked up your phone to check one thing. Three hours later, here we are.",
    "Every scroll is a choice. Choose wisely.",
    "Your future self will thank you for this break.",
    "Social media will still be there tomorrow. But this moment? It's gone forever.",
    "What could you do with 30 extra minutes today? Read? Exercise? Call a friend?",
    "You're not missing out. You're opting in to something better: real life."
];

const APP_NAMES = {
    instagram: 'Instagram',
    tiktok: 'TikTok',
    facebook: 'Facebook',
    twitter: 'Twitter',
    youtube: 'YouTube',
    netflix: 'Netflix'
};

// Initialize page
window.addEventListener('load', () => {
    const params = new URLSearchParams(window.location.search);
    const site = params.get('site') || 'instagram.com';
    const used = parseInt(params.get('usage')) || 0;
    const limit = parseInt(params.get('limit')) || 60;

    // Extract app name from site
    const appId = site.replace('.com', '');
    const appName = APP_NAMES[appId] || appId.charAt(0).toUpperCase() + appId.slice(1);

    // Update display
    document.getElementById('appName').textContent = appName;
    document.getElementById('usedTime').textContent = used;
    document.getElementById('limitTime').textContent = limit;

    const percentage = Math.min(Math.round((used / limit) * 100), 100);
    document.getElementById('progressBar').style.width = percentage + '%';
    document.getElementById('progressBar').textContent = percentage + '%';

    // Show random quote
    const randomQuote = QUOTES[Math.floor(Math.random() * QUOTES.length)];
    document.getElementById('motivationalQuote').textContent = randomQuote;

    // Calculate time until reset
    updateResetTimer();
    setInterval(updateResetTimer, 60000);
});

function updateResetTimer() {
    const now = new Date();
    const midnight = new Date();
    midnight.setHours(24, 0, 0, 0);
    
    const diff = midnight - now;
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    
    document.getElementById('resetTimer').textContent = 
        `Resets in ${hours} hours and ${minutes} minutes`;
}

async function requestEmergency() {
    const reason = document.getElementById('emergencyReason').value.trim();
    const resultEl = document.getElementById('emergencyResult');
    
    resultEl.innerHTML = '';
    
    if (!reason || reason.length < 20) {
        resultEl.innerHTML = '<div class="result error">Please provide a detailed reason (at least 20 characters)</div>';
        return;
    }

    const params = new URLSearchParams(window.location.search);
    const site = params.get('site') || 'instagram.com';

    try {
        const response = await chrome.runtime.sendMessage({
            type: 'REQUEST_EMERGENCY_ACCESS',
            site: site,
            reason: reason
        });

        if (response && response.granted) {
            resultEl.innerHTML = `
                <div class="result success">
                    <strong>Access Granted!</strong><br>
                    You have ${response.duration || 15} minutes of emergency access.<br>
                    ${response.message || 'Use this time wisely.'}
                </div>
            `;
            
            // Redirect back after 3 seconds
            setTimeout(() => {
                window.location.href = 'https://' + site;
            }, 3000);
        } else {
            resultEl.innerHTML = `
                <div class="result error">
                    <strong>Access Denied</strong><br>
                    ${response?.message || 'Your reason was not sufficient for emergency access.'}
                </div>
            `;
        }
    } catch (error) {
        console.error('Emergency request failed:', error);
        resultEl.innerHTML = '<div class="result error">Error: Could not connect to extension.</div>';
    }
}