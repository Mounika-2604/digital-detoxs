const API_CONFIG = {
    BASE_URL: '',
    REFRESH_INTERVAL: 30000
};

const EXTENSION_ID = 'mcdpoekdhepkkmdhodgejlijmpifimhj';

let focusInterval = null;
let focusEndTime = null;
let currentUser = null;

console.log('Dashboard.js loaded');

function openTrackedSite(url, siteName) {
    console.log('Opening ' + siteName);
    try {
        if (typeof chrome !== 'undefined' && chrome.runtime && EXTENSION_ID) {
            chrome.runtime.sendMessage(
                EXTENSION_ID,
                { type: 'generateSessionToken' },
                (response) => {
                    let finalUrl = url;
                    if (response && response.token) {
                        const u = new URL(url);
                        u.searchParams.set('_st', response.token);
                        finalUrl = u.toString();
                    }
                    window.open(finalUrl, '_blank');
                }
            );
        } else {
            window.open(url, '_blank');
        }
    } catch (e) {
        window.open(url, '_blank');
    }
}

document.addEventListener('DOMContentLoaded', async () => {
    console.log('Dashboard loaded');
    await checkAuth();
    await refreshDashboard();
    setupEventListeners();
    startAutoRefresh();
});

async function checkAuth() {
    try {
        const response = await fetch(API_CONFIG.BASE_URL + '/api/check-auth', {
            credentials: 'include'
        });
        if (!response.ok) {
            window.location.href = '/index.html';
            return;
        }
        const data = await response.json();
        currentUser = data.user;
    } catch (error) {
        console.error('Auth check failed:', error);
        window.location.href = '/index.html';
    }
}

function setupEventListeners() {
    const logBtn = document.getElementById('logUsageBtn');
    if (logBtn) logBtn.addEventListener('click', logUsage);
    
    const focusBtn = document.getElementById('startFocusBtn');
    if (focusBtn) focusBtn.addEventListener('click', startFocusMode);
    
    const accessBtn = document.getElementById('requestAccessBtn');
    if (accessBtn) accessBtn.addEventListener('click', requestEmergencyAccess);
    
    const chatFloat = document.getElementById('chatFloatBtn');
    if (chatFloat) chatFloat.addEventListener('click', toggleChat);
    
    const chatClose = document.getElementById('chatCloseBtn');
    if (chatClose) chatClose.addEventListener('click', toggleChat);
    
    const sendChat = document.getElementById('sendPopupChatBtn');
    if (sendChat) sendChat.addEventListener('click', sendChatMessage);
    
    const chatInput = document.getElementById('chatPopupInput');
    if (chatInput) {
        chatInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') sendChatMessage();
        });
    }
    
    const buttons = document.querySelectorAll('.tracked-site-btn');
    buttons.forEach(button => {
        button.addEventListener('click', function() {
            const url = this.getAttribute('data-url');
            const name = this.getAttribute('data-name');
            openTrackedSite(url, name);
        });
        
        button.addEventListener('mouseenter', function() {
            this.style.transform = 'scale(1.05)';
        });
        button.addEventListener('mouseleave', function() {
            this.style.transform = 'scale(1)';
        });
    });
}

function startAutoRefresh() {
    setInterval(refreshDashboard, API_CONFIG.REFRESH_INTERVAL);
}

async function manualRefresh() {
    const btn = document.getElementById('manual-refresh-btn');
    if (btn) {
        const icon = btn.querySelector('span');
        if (icon) {
            icon.style.transform = 'rotate(360deg)';
            setTimeout(() => icon.style.transform = 'rotate(0deg)', 500);
        }
    }
    await refreshDashboard();
}

async function refreshDashboard() {
    try {
        const response = await fetch(API_CONFIG.BASE_URL + '/api/stats', {
            credentials: 'include'
        });
        
        if (!response.ok) throw new Error('HTTP error! status: ' + response.status);
        
        const result = await response.json();
        const data = result.data || result;
        
        updateDashboard(data);
        updateConnectionStatus(true);
        updateLastUpdateTime();
    } catch (error) {
        console.error('Error fetching stats:', error);
        updateConnectionStatus(false);
    }
}

function updateDashboard(data) {
    const totalToday = document.getElementById('totalToday');
    const mostUsed = document.getElementById('mostUsed');
    const detoxStreak = document.getElementById('detoxStreak');
    const focusTime = document.getElementById('focusTime');
    
    if (totalToday) {
        const minutes = data.dailyTotal || 0;
        totalToday.textContent = minutes >= 60 ? Math.floor(minutes / 60) + 'h ' + (minutes % 60) + 'm' : minutes + 'min';
    }
    
    if (mostUsed) {
        const app = data.mostUsed?.app || data.mostUsed?.name || 'None';
        mostUsed.textContent = app;
    }
    
    if (detoxStreak) detoxStreak.textContent = (data.detoxStreak || 0) + ' days';
    
    if (focusTime) {
        const minutes = data.focusTime || 0;
        focusTime.textContent = minutes >= 60 ? Math.floor(minutes / 60) + 'h ' + (minutes % 60) + 'm' : minutes + 'min';
    }
    
    updateRankings(data.addictionRanking || []);
    updateHistory(data.recentActivity || []);
}

function updateRankings(rankings) {
    const rankingsList = document.getElementById('rankingsList');
    if (!rankingsList) return;
    
    if (!rankings || rankings.length === 0) {
        rankingsList.innerHTML = '<div class="empty-state"><p>No rankings yet</p><p>Extension will track your usage automatically</p></div>';
        return;
    }
    
    let html = '';
    for (let i = 0; i < rankings.length; i++) {
        const item = rankings[i];
        html += '<div class="ranking-item ' + item.level.toLowerCase() + '">';
        html += '<div class="ranking-header">';
        html += '<span class="ranking-rank">#' + (i + 1) + '</span>';
        html += '<span class="ranking-name">' + item.name + '</span>';
        html += '<span class="ranking-time">' + item.minutes + 'min</span>';
        html += '</div>';
        html += '<div class="ranking-bar">';
        html += '<div class="ranking-fill" style="width: ' + item.percentage + '%"></div>';
        html += '</div>';
        html += '<span class="ranking-level">' + item.level.toUpperCase() + '</span>';
        html += '</div>';
    }
    rankingsList.innerHTML = html;
}

function updateHistory(history) {
    const historyList = document.getElementById('historyList');
    if (!historyList) return;
    
    if (!history || history.length === 0) {
        historyList.innerHTML = '<div class="empty-state"><p>No activity yet today</p></div>';
        return;
    }
    
    let html = '';
    for (let i = 0; i < history.length; i++) {
        const item = history[i];
        html += '<div class="history-item">';
        html += '<span class="history-app">' + item.appName + '</span>';
        html += '<span class="history-time">' + item.minutes + 'min</span>';
        html += '<span class="history-timestamp">' + formatTimestamp(item.timestamp) + '</span>';
        html += '</div>';
    }
    historyList.innerHTML = html;
}

async function logUsage() {
    const appSelect = document.getElementById('appSelect');
    const minutesInput = document.getElementById('minutesInput');
    const app = appSelect ? appSelect.value : '';
    const minutes = minutesInput ? parseInt(minutesInput.value) : 0;
    
    if (!app) {
        showMessage('usageMsg', 'Please select an app', 'error');
        return;
    }
    
    if (!minutes || minutes < 1) {
        showMessage('usageMsg', 'Please enter valid minutes', 'error');
        return;
    }
    
    try {
        const response = await fetch(API_CONFIG.BASE_URL + '/api/log-usage', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ app: app, minutes: minutes })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            showMessage('usageMsg', data.message, 'success');
            if (appSelect) appSelect.value = '';
            if (minutesInput) minutesInput.value = '';
            await refreshDashboard();
        } else {
            showMessage('usageMsg', data.error || 'Failed to log usage', 'error');
        }
    } catch (error) {
        console.error('Error logging usage:', error);
        showMessage('usageMsg', 'Failed to log usage', 'error');
    }
}

async function startFocusMode() {
    const durationInput = document.getElementById('focusDuration');
    const duration = durationInput ? parseInt(durationInput.value) : 0;
    
    if (!duration || duration < 1 || duration > 120) {
        showMessage('focusTimer', 'Enter duration between 1-120 minutes', 'error');
        return;
    }
    
    try {
        const response = await fetch(API_CONFIG.BASE_URL + '/api/focus-mode', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ duration: duration })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            focusEndTime = Date.now() + (duration * 60 * 1000);
            startFocusTimer();
            showMessage('motivationMsg', getMotivationMessage(), 'success');
            if (durationInput) durationInput.value = '';
        } else {
            showMessage('focusTimer', data.error || 'Failed to start focus mode', 'error');
        }
    } catch (error) {
        console.error('Error starting focus mode:', error);
        showMessage('focusTimer', 'Failed to start focus mode', 'error');
    }
}

function startFocusTimer() {
    if (focusInterval) clearInterval(focusInterval);
    
    focusInterval = setInterval(() => {
        const remaining = focusEndTime - Date.now();
        
        if (remaining <= 0) {
            clearInterval(focusInterval);
            showMessage('focusTimer', 'Focus session complete!', 'success');
            refreshDashboard();
            return;
        }
        
        const minutes = Math.floor(remaining / 60000);
        const seconds = Math.floor((remaining % 60000) / 1000);
        const secStr = seconds < 10 ? '0' + seconds : '' + seconds;
        showMessage('focusTimer', minutes + ':' + secStr + ' remaining', 'success focus-timer');
    }, 1000);
}

async function requestEmergencyAccess() {
    const appSelect = document.getElementById('emergencyAppSelect');
    const reasonInput = document.getElementById('emergencyReason');
    const app = appSelect ? appSelect.value : '';
    const reason = reasonInput ? reasonInput.value.trim() : '';
    
    if (!app) {
        showEmergencyResult('Please select an app', 'error');
        return;
    }
    
    if (!reason || reason.length < 10) {
        showEmergencyResult('Please provide a detailed reason (min 10 characters)', 'error');
        return;
    }
    
    try {
        const response = await fetch(API_CONFIG.BASE_URL + '/api/emergency-access', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ app: app, reason: reason })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            showEmergencyResult(data.message, data.approved ? 'success' : 'error');
            if (data.approved) {
                if (appSelect) appSelect.value = '';
                if (reasonInput) reasonInput.value = '';
            }
        } else {
            showEmergencyResult(data.error || 'Request failed', 'error');
        }
    } catch (error) {
        console.error('Error requesting emergency access:', error);
        showEmergencyResult('Failed to submit request', 'error');
    }
}

function toggleChat() {
    const popup = document.getElementById('chatPopup');
    const floatBtn = document.getElementById('chatFloatBtn');
    
    if (popup && floatBtn) {
        const isVisible = popup.style.display === 'flex';
        popup.style.display = isVisible ? 'none' : 'flex';
        floatBtn.style.display = isVisible ? 'flex' : 'none';
    }
}

async function sendChatMessage() {
    const input = document.getElementById('chatPopupInput');
    const message = input ? input.value.trim() : '';
    
    if (!message) return;
    
    addChatMessage(message, 'user');
    if (input) input.value = '';
    
    try {
        const response = await fetch(API_CONFIG.BASE_URL + '/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ message: message })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            addChatMessage(data.reply, 'assistant');
        } else {
            addChatMessage('Sorry, I encountered an error.', 'assistant');
        }
    } catch (error) {
        console.error('Chat error:', error);
        addChatMessage('Sorry, I could not connect.', 'assistant');
    }
}

function addChatMessage(text, type) {
    const chatBody = document.getElementById('chatPopupBody');
    if (!chatBody) return;
    
    const messageDiv = document.createElement('div');
    messageDiv.className = 'chat-message ' + type;
    
    if (type === 'assistant') {
        messageDiv.innerHTML = '<div class="ai-avatar">AI</div><span>' + text + '</span>';
    } else {
        messageDiv.innerHTML = '<span>' + text + '</span>';
    }
    
    chatBody.appendChild(messageDiv);
    chatBody.scrollTop = chatBody.scrollHeight;
}

function updateConnectionStatus(connected) {
    const statusText = document.getElementById('connectionText');
    const statusDot = document.querySelector('.connected-dot');
    
    if (statusText) statusText.textContent = connected ? 'Connected' : 'Disconnected';
    if (statusDot) statusDot.style.backgroundColor = connected ? '#4ade80' : '#ef4444';
}

function updateLastUpdateTime() {
    const timeElement = document.getElementById('last-update-time');
    if (timeElement) {
        const now = new Date();
        timeElement.textContent = 'Last updated: ' + now.toLocaleTimeString();
    }
}

function showMessage(elementId, message, type) {
    const element = document.getElementById(elementId);
    if (!element) return;
    
    element.textContent = message;
    element.className = 'message ' + type;
    element.style.display = 'block';
    
    if (type !== 'focus-timer') {
        setTimeout(() => {
            element.style.display = 'none';
        }, 5000);
    }
}

function showEmergencyResult(message, type) {
    const resultDiv = document.getElementById('emergencyResult');
    if (!resultDiv) return;
    
    resultDiv.innerHTML = '<p class="message ' + type + '">' + message + '</p>';
    
    setTimeout(() => {
        resultDiv.innerHTML = '';
    }, 5000);
}

function formatTimestamp(timestamp) {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return diffMins + 'm ago';
    if (diffMins < 1440) return Math.floor(diffMins / 60) + 'h ago';
    return date.toLocaleDateString();
}

function getMotivationMessage() {
    const messages = [
        'Great choice! Focus mode activated!',
        'You got this! Stay focused!',
        'Lock in! Time to be productive!',
        'Focus activated! Make it count!'
    ];
    return messages[Math.floor(Math.random() * messages.length)];
}