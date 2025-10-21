// background.js - COMPLETE FIXED VERSION
const BACKEND_URL = 'https://digital-detoxs.onrender.com';
const BLOCKED_SITES = ['instagram.com', 'tiktok.com', 'youtube.com', 'facebook.com', 'twitter.com', 'reddit.com', 'netflix.com'];

const SITE_TO_APP_ID = {
  'instagram.com': 'instagram',
  'tiktok.com': 'tiktok',
  'facebook.com': 'facebook',
  'twitter.com': 'twitter',
  'youtube.com': 'youtube',
  'netflix.com': 'netflix',
  'reddit.com': 'reddit'
};

let currentTab = null;
let startTime = null;
let dailyUsage = {};
let dailyLimits = {};
let isBlocking = true;
let userId = null;
let blockedSites = new Set();
let emergencyAccess = {};
let trackingInterval = null;
const websiteOpenedTabs = new Set();
const sessionTokens = new Map();
const lastWarningShown = {}; // domain -> timestamp ms

function getDomain(url) {
  try {
    const urlObj = new URL(url);
    const hostname = urlObj.hostname.replace('www.', '').toLowerCase();
    for (const site of BLOCKED_SITES) {
      if (hostname === site || hostname.endsWith('.' + site)) {
        return site;
      }
    }
    return null;
  } catch {
    return null;
  }
}

chrome.runtime.onInstalled.addListener(async () => {
  console.log('Digital Detox Extension installed');
  await loadStoredData();
  initializeAlarms();
  startContinuousTracking();
  await updateBlockingRules();
});

chrome.runtime.onStartup.addListener(async () => {
  console.log('Extension started');
  await loadStoredData();
  startContinuousTracking();
  await updateBlockingRules();
});

function startContinuousTracking() {
  if (trackingInterval) {
    clearInterval(trackingInterval);
  }
  
  trackingInterval = setInterval(async () => {
    if (!currentTab || !startTime) {
      return;
    }

    try {
      const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
      const windows = await chrome.windows.getCurrent();
      
      if (!activeTab || activeTab.id !== currentTab.id || !windows.focused) {
        return;
      }

      dailyUsage[currentTab.domain] = (dailyUsage[currentTab.domain] || 0) + 1;
      
      if (dailyUsage[currentTab.domain] % 10 === 0) {
        const minutes = Math.floor(dailyUsage[currentTab.domain] / 60);
        const seconds = dailyUsage[currentTab.domain] % 60;
        console.log(`${currentTab.domain}: ${minutes}m ${seconds}s`);
      }
      
      maybeWarnNearLimit(currentTab.domain);

      saveData();
      
      if (shouldBlockDomain(currentTab.domain)) {
        const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tabs[0]) {
          redirectToBlockedPage(tabs[0].id, currentTab.domain);
        }
      }
    } catch (error) {
      console.error('Tracking error:', error);
    }
  }, 1000);
  
  console.log('Continuous tracking started');
}
const API_URL = `${BACKEND_URL}/api`;
async function loadStoredData() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['userId', 'dailyUsage', 'dailyLimits', 'lastResetDate', 'isBlocking'], (data) => {
      userId = data.userId || null;
      dailyUsage = data.dailyUsage || {};
      dailyLimits = data.dailyLimits || {};
      isBlocking = data.isBlocking !== undefined ? data.isBlocking : true;
      
      const today = new Date().toDateString();
      if (data.lastResetDate !== today) {
        dailyUsage = {};
        chrome.storage.local.set({ dailyUsage: {}, lastResetDate: today });
        // Reset in-memory warning state on new day
        for (const key in lastWarningShown) delete lastWarningShown[key];
      }
      
      console.log('Loaded data:', { userId, dailyUsage, dailyLimits });
      
      if (userId) {
        fetchLimitsFromBackend();
      }
      
      resolve();
    });
  });
}

function saveData() {
  chrome.storage.local.set({ 
    dailyUsage, 
    dailyLimits, 
    lastResetDate: new Date().toDateString() 
  });
}

chrome.runtime.onMessageExternal.addListener((request, sender, sendResponse) => {
  console.log('Message from website:', request);
  
  if (request.type === 'LOGIN_SUCCESS') {
    const oldUserId = userId;
    userId = request.userId;
    
    if (oldUserId && oldUserId !== userId) {
      console.log('Different user, clearing old usage');
      dailyUsage = {};
      emergencyAccess = {};
    }
    
    chrome.storage.local.set({ 
      userId: request.userId, 
      userEmail: request.email, 
      isLoggedIn: true
    }, () => {
      console.log('User logged in via extension:', request.email);
      fetchLimitsFromBackend();
      updateBlockingRules();
      sendResponse({ success: true });
    });
    return true;
  }
});

// SINGLE MESSAGE LISTENER
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'GET_STATUS') {
    sendResponse({
      dailyUsage,
      dailyLimits,
      isBlocking,
      userId
    });
  } 
  else if (message.type === 'SET_USER_ID') {
    userId = message.userId;
    chrome.storage.local.set({ 
      userId: message.userId,
      userEmail: message.email,
      isLoggedIn: true 
    }, () => {
      fetchLimitsFromBackend();
      sendResponse({ success: true });
    });
    return true;
  } 
  else if (message.type === 'TOGGLE_BLOCKING') {
    isBlocking = message.enabled;
    chrome.storage.local.set({ isBlocking }, () => {
      updateBlockingRules();
      sendResponse({ success: true });
    });
    return true;
  }
  else if (message.type === 'REQUEST_EMERGENCY_ACCESS') {
    handleEmergencyAccess(message).then(sendResponse);
    return true;
  }
  else if (message.type === 'USER_LOGGED_OUT') {
    console.log('User logged out, clearing all data');
    userId = null;
    dailyUsage = {};
    dailyLimits = {};
    emergencyAccess = {};
    blockedSites.clear();
    websiteOpenedTabs.clear();
    for (const key in lastWarningShown) delete lastWarningShown[key];
    
    chrome.storage.local.remove(['userId', 'userEmail', 'dailyUsage']);
    updateBlockingRules();
    sendResponse({ success: true });
  }
  else if (message.type === 'verifySessionToken') {
    const isValid = sessionTokens.has(message.token);
    if (isValid && sender.tab) {
      websiteOpenedTabs.add(sender.tab.id);
      sessionTokens.delete(message.token);
      console.log('Tab marked as website-opened:', sender.tab.id);
    }
    sendResponse({ valid: isValid });
    return true;
  }
  else if (message.type === 'generateSessionToken') {
    const token = Math.random().toString(36).substring(7);
    sessionTokens.set(token, Date.now());
    setTimeout(() => sessionTokens.delete(token), 30000);
    console.log('Generated session token:', token);
    sendResponse({ token });
    return true;
  }
  
  return true;
});

async function handleEmergencyAccess(request) {
  const { site, reason } = request;
  
  const validKeywords = [
    'work', 'school', 'homework', 'project', 'research', 
    'important', 'urgent', 'deadline', 'assignment', 'class',
    'study', 'education', 'learning', 'job', 'meeting'
  ];
  
  const reasonLower = reason.toLowerCase();
  const hasValidKeyword = validKeywords.some(keyword => reasonLower.includes(keyword));
  
  if (hasValidKeyword && reason.length >= 20) {
    const duration = 15 * 60 * 1000;
    
    emergencyAccess[site] = {
      grantedAt: Date.now(),
      expiresAt: Date.now() + duration,
      reason: reason
    };
    
    await updateBlockingRules();
    
    setTimeout(() => {
      delete emergencyAccess[site];
      updateBlockingRules();
    }, duration);
    
    return {
      granted: true,
      duration: 15,
      message: 'Emergency access granted for 15 minutes. Use it wisely!'
    };
  } else {
    return {
      granted: false,
      message: reason.length < 20 
        ? 'Please provide a more detailed reason (at least 20 characters)'
        : 'Please include why this is urgent (work, school, deadline, etc.)'
    };
  }
}

function initializeAlarms() {
  // Chrome MV3 requires periodInMinutes >= 1
  chrome.alarms.create('syncUsage', { periodInMinutes: 2 });
  chrome.alarms.create('checkMidnight', { periodInMinutes: 1 });
  chrome.alarms.create('updateRules', { periodInMinutes: 1 });
}

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'syncUsage') {
    syncTimeWithBackend();
  } else if (alarm.name === 'checkMidnight') {
    checkAndResetDaily();
  } else if (alarm.name === 'updateRules') {
    updateBlockingRules();
  }
});

function checkAndResetDaily() {
  chrome.storage.local.get('lastResetDate', (data) => {
    const today = new Date().toDateString();
    if (data.lastResetDate !== today) {
      dailyUsage = {};
      emergencyAccess = {};
      chrome.storage.local.set({ dailyUsage: {}, lastResetDate: today });
      updateBlockingRules();
      console.log('Daily usage reset');
    }
  });
}

chrome.tabs.onActivated.addListener(async (activeInfo) => {
  await stopTracking();
  const tab = await chrome.tabs.get(activeInfo.tabId);
  await startTracking(tab);
  await updateBlockingRules();
});

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.active) {
    await stopTracking();
    await startTracking(tab);
  }
  
  if (changeInfo.status === 'loading' && tab.url) {
    const domain = getDomain(tab.url);
    if (domain && blockedSites.has(domain) && !tab.url.includes('blocked.html')) {
      redirectToBlockedPage(tabId, domain);
    }
  }
});

chrome.windows.onFocusChanged.addListener(async (windowId) => {
  if (windowId === chrome.windows.WINDOW_ID_NONE) {
    await stopTracking();
  } else {
    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (activeTab) {
      await startTracking(activeTab);
    }
  }
});

chrome.tabs.onRemoved.addListener(async (tabId, removeInfo) => {
  websiteOpenedTabs.delete(tabId);
  if (currentTab && currentTab.id === tabId) {
    await stopTracking();
  }
});

async function stopTracking() {
  if (currentTab && startTime) {
    // Usage is already incremented each second in the tracking interval.
    // Avoid double-counting here; just persist and clear state.
    saveData();
    console.log(`Stopped tracking ${currentTab.domain}`);
    
    currentTab = null;
    startTime = null;
  }
}

async function startTracking(tab) {
  if (!tab || !tab.url) return;
  
  // REMOVED THE CHECK - NOW TRACKS ALL TABS
  const domain = getDomain(tab.url);
  if (!domain) return;
  
  if (shouldBlockDomain(domain)) {
    redirectToBlockedPage(tab.id, domain);
    return;
  }
  
  currentTab = { id: tab.id, domain };
  startTime = Date.now();
  console.log('Started tracking:', domain);
}

async function fetchLimitsFromBackend() {
  if (!userId) {
    console.log('No userId, using unlimited limits');
    dailyLimits = {
      instagram: { dailyLimit: 999999 },
      tiktok: { dailyLimit: 999999 },
      youtube: { dailyLimit: 999999 },
      facebook: { dailyLimit: 999999 },
      twitter: { dailyLimit: 999999 },
      netflix: { dailyLimit: 999999 },
      reddit: { dailyLimit: 999999 }
    };
    chrome.storage.local.set({ dailyLimits });
    return;
  }
  
  console.log('Fetching limits for user:', userId);
  
  try {
    const response = await fetch(`${BACKEND_URL}/api/extension/config?userId=${userId}`, { 
      credentials: 'include' 
    });
    
    if (response.ok) {
      const data = await response.json();
      
      if (data.success && data.limits) {
        dailyLimits = data.limits;
        chrome.storage.local.set({ dailyLimits });
        console.log('Limits fetched:', dailyLimits);
        await updateBlockingRules();
      }
    } else {
      console.error('Failed to fetch limits');
    }
  } catch (error) {
    console.error('Fetch limits error:', error);
  }
}

function syncTimeWithBackend() {
  if (!userId) {
    return;
  }

  const sites = Object.keys(dailyUsage).filter(domain => dailyUsage[domain] > 0);
  
  if (sites.length === 0) {
    return;
  }
  
  const usage = {};
  sites.forEach(domain => {
    const seconds = dailyUsage[domain];
    const appId = SITE_TO_APP_ID[domain];
    
    if (appId && seconds > 0) {
      usage[appId] = seconds;
    }
  });
  
  if (Object.keys(usage).length === 0) {
    return;
  }
  
  console.log('SYNCING TO BACKEND:', usage);
  
  fetch(`${BACKEND_URL}/api/track-time-extension`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ userId: userId, usage: usage })
  })
  .then(response => response.json())
  .then(result => {
    console.log('SYNC RESPONSE:', result);
    if (result.success) {
      console.log('Synced successfully');
    } else {
      console.error('Sync failed:', result.message);
    }
  })
  .catch(error => console.error('Sync error:', error));
}

function shouldBlockDomain(domain) {
  if (!isBlocking) return false;

  if (emergencyAccess[domain]) {
    if (Date.now() < emergencyAccess[domain].expiresAt) {
      return false;
    } else {
      delete emergencyAccess[domain];
    }
  }

  const appId = SITE_TO_APP_ID[domain];
  if (!appId) return false;

  const limitMinutes = dailyLimits[appId]?.dailyLimit;
  if (!limitMinutes) return false;

  const limitSeconds = limitMinutes * 60;
  const usedSeconds = dailyUsage[domain] || 0;

  return usedSeconds >= limitSeconds;
}

function redirectToBlockedPage(tabId, domain) {
  const appId = SITE_TO_APP_ID[domain];
  const usedMinutes = Math.floor((dailyUsage[domain] || 0) / 60);
  const limitMinutes = dailyLimits[appId]?.dailyLimit || 60;
  
  const blockedUrl = chrome.runtime.getURL(`blocked.html?site=${domain}&usage=${usedMinutes}&limit=${limitMinutes}`);
  
  try {
    chrome.tabs.update(tabId, { url: blockedUrl }, () => {
      if (chrome.runtime.lastError) {
        console.error('Redirect error:', chrome.runtime.lastError.message);
      }
    });
  } catch (err) {
    console.error('Redirect error:', err);
  }
}

async function updateBlockingRules() {
  const newBlockedSites = new Set();

  if (!isBlocking) {
    blockedSites.clear();
    return;
  }

  for (const domain of BLOCKED_SITES) {
    if (shouldBlockDomain(domain)) {
      newBlockedSites.add(domain);
    }
  }

  blockedSites = newBlockedSites;

  const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (activeTab && activeTab.url && !activeTab.url.includes('blocked.html')) {
    const domain = getDomain(activeTab.url);
    if (domain && blockedSites.has(domain)) {
      redirectToBlockedPage(activeTab.id, domain);
    }
  }
}

function maybeWarnNearLimit(domain) {
  try {
    const appId = SITE_TO_APP_ID[domain];
    const limitMinutes = dailyLimits[appId]?.dailyLimit;
    if (!limitMinutes) return;
    const usedSeconds = dailyUsage[domain] || 0;
    const usedMinutes = Math.floor(usedSeconds / 60);
    const percentage = (usedMinutes / limitMinutes) * 100;
    const now = Date.now();
    const lastShown = lastWarningShown[domain] || 0;

    // Warn once per 15 minutes when >= 90% and not already blocked
    if (percentage >= 90 && !shouldBlockDomain(domain) && now - lastShown > 15 * 60 * 1000) {
      chrome.tabs.sendMessage(currentTab.id, { action: 'showWarning', minutes: usedMinutes }, () => {
        // Ignore errors if content script not present on this page
      });
      lastWarningShown[domain] = now;
    }
  } catch (_) {
    // best-effort warning
  }
}

console.log('Background script loaded');