// popup.js - Extension popup logic (no UI/layout changes)

const DOMAIN_TO_APP_ID = {
  'instagram.com': 'instagram',
  'tiktok.com': 'tiktok',
  'youtube.com': 'youtube',
  'facebook.com': 'facebook',
  'twitter.com': 'twitter',
  'reddit.com': 'reddit',
  'netflix.com': 'netflix'
};

const APP_ID_TO_NAME = {
  instagram: 'Instagram',
  tiktok: 'TikTok',
  youtube: 'YouTube',
  facebook: 'Facebook',
  twitter: 'Twitter',
  reddit: 'Reddit',
  netflix: 'Netflix'
};

const APP_ID_TO_DOMAIN = Object.fromEntries(
  Object.entries(DOMAIN_TO_APP_ID).map(([domain, appId]) => [appId, domain])
);

let cachedStatus = {
  dailyUsage: {},
  dailyLimits: {},
  isBlocking: true,
  userId: null
};

document.addEventListener('DOMContentLoaded', () => {
  init();
});

function init() {
  // Sections
  const loadingSection = document.getElementById('loadingSection');
  const loginSection = document.getElementById('loginSection');
  const mainSection = document.getElementById('mainSection');
  if (loadingSection) loadingSection.style.display = 'block';
  if (loginSection) loginSection.style.display = 'none';
  if (mainSection) mainSection.style.display = 'none';

  // Events
  const toggle = document.getElementById('toggleSwitch');
  if (toggle) {
    toggle.addEventListener('click', onToggleClicked);
  }

  const loginBtn = document.getElementById('loginBtn');
  if (loginBtn) loginBtn.addEventListener('click', onConnectAccount);

  const skipBtn = document.getElementById('skipBtn');
  if (skipBtn) skipBtn.addEventListener('click', () => showMain());

  // Initial load and periodic refresh
  refreshStatus().then(() => {
    setInterval(refreshStatus, 30000);
  });
}

function getStatus() {
  return new Promise((resolve) => {
    try {
      chrome.runtime.sendMessage({ type: 'GET_STATUS' }, (res) => {
        if (chrome.runtime.lastError) {
          resolve(cachedStatus);
        } else {
          resolve(res || cachedStatus);
        }
      });
    } catch (e) {
      resolve(cachedStatus);
    }
  });
}

async function refreshStatus() {
  const status = await getStatus();
  cachedStatus = status || cachedStatus;
  updateUIFromStatus(cachedStatus);
}

function updateUIFromStatus(status) {
  const loadingSection = document.getElementById('loadingSection');
  const loginSection = document.getElementById('loginSection');
  const mainSection = document.getElementById('mainSection');

  if (loadingSection) loadingSection.style.display = 'none';
  if (status && status.userId) {
    showMain();
  } else {
    showLogin();
  }

  // Toggle state
  const toggle = document.getElementById('toggleSwitch');
  if (toggle) {
    const enabled = !!status.isBlocking;
    toggle.classList.toggle('active', enabled);
  }

  // Render stats
  renderStats(status.dailyUsage || {}, status.dailyLimits || {});

  function showLogin() {
    if (loginSection) loginSection.style.display = 'block';
    if (mainSection) mainSection.style.display = 'none';
  }

  function showMain() {
    if (loginSection) loginSection.style.display = 'none';
    if (mainSection) mainSection.style.display = 'block';
  }
}

function showMain() {
  const loginSection = document.getElementById('loginSection');
  const mainSection = document.getElementById('mainSection');
  if (loginSection) loginSection.style.display = 'none';
  if (mainSection) mainSection.style.display = 'block';
}

function onToggleClicked() {
  const toggle = document.getElementById('toggleSwitch');
  const newState = !toggle.classList.contains('active');
  try {
    chrome.runtime.sendMessage({ type: 'TOGGLE_BLOCKING', enabled: newState }, (res) => {
      if (!chrome.runtime.lastError && res && res.success) {
        toggle.classList.toggle('active', newState);
        cachedStatus.isBlocking = newState;
      }
    });
  } catch (e) {
    // noop
  }
}

function onConnectAccount() {
  const tokenInput = document.getElementById('tokenInput');
  if (!tokenInput) return;
  const token = (tokenInput.value || '').trim();
  if (!token) return;

  // Heuristic: if token looks like JSON { userId, email }, parse it; otherwise treat as userId
  let userId = token;
  let email = undefined;
  try {
    const parsed = JSON.parse(token);
    if (parsed && (parsed.userId || parsed.id)) {
      userId = parsed.userId || parsed.id;
      email = parsed.email;
    }
  } catch (_) {
    // not JSON; allow raw userId
  }

  try {
    chrome.runtime.sendMessage({ type: 'SET_USER_ID', userId, email }, (res) => {
      if (!chrome.runtime.lastError && res && res.success) {
        showMain();
        refreshStatus();
      }
    });
  } catch (e) {
    // noop
  }
}

function renderStats(dailyUsage, dailyLimits) {
  const container = document.getElementById('statsContainer');
  if (!container) return;

  const appIds = Object.keys(APP_ID_TO_DOMAIN);
  if (!appIds.length) {
    container.innerHTML = '';
    return;
  }

  let html = '';
  for (const appId of appIds) {
    const domain = APP_ID_TO_DOMAIN[appId];
    const appName = APP_ID_TO_NAME[appId] || appId;
    const usedSeconds = dailyUsage[domain] || 0;
    const usedMinutes = Math.floor(usedSeconds / 60);
    const limitMinutes = (dailyLimits[appId]?.dailyLimit ?? 60);
    const percentage = Math.min(100, limitMinutes > 0 ? Math.round((usedMinutes / limitMinutes) * 100) : 0);

    let fillClass = 'progress-fill';
    if (percentage >= 100) fillClass += ' danger';
    else if (percentage >= 75) fillClass += ' warning';

    html += `
      <div class="site-card">
        <div class="site-header">
          <div class="site-name">${appName}</div>
          <div class="site-time">${formatMinutes(usedMinutes)}</div>
        </div>
        <div class="progress-bar">
          <div class="${fillClass}" style="width: ${percentage}%"></div>
        </div>
        <div class="progress-text">${usedMinutes} / ${limitMinutes} min (${percentage}%)</div>
      </div>
    `;
  }

  container.innerHTML = html;
}

function formatMinutes(min) {
  if (min >= 60) {
    const h = Math.floor(min / 60);
    const m = min % 60;
    return `${h}h ${m}m`;
  }
  return `${min}m`;
}