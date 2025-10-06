// Content script that runs on tracked websites

console.log('Digital Detox: Content script loaded on', window.location.hostname);

// ============================================
// SESSION TOKEN VERIFICATION (runs first)
// ============================================
const params = new URLSearchParams(window.location.search);
const sessionToken = params.get('_st'); // _st = session token

if (sessionToken) {
  console.log('🎫 Session token detected, verifying...');
  
  // Verify token with background script
  chrome.runtime.sendMessage(
    { type: 'verifySessionToken', token: sessionToken },
    (response) => {
      if (response && response.valid) {
        console.log('✅ Session token verified - this tab will be tracked');
        
        // Remove token from URL for cleaner appearance
        const url = new URL(window.location.href);
        url.searchParams.delete('_st');
        window.history.replaceState({}, document.title, url.toString());
        
        // Now notify that page is active (for tracking)
        chrome.runtime.sendMessage({ 
          action: 'pageActive', 
          url: window.location.href 
        });
      } else {
        console.log('❌ Invalid session token');
      }
    }
  );
} else {
  console.log('ℹ️ No session token - opened directly (no tracking)');
  
  // Still notify for legacy functionality, but won't be tracked
  // because tab is not in websiteOpenedTabs set
  chrome.runtime.sendMessage({ 
    action: 'pageActive', 
    url: window.location.href 
  });
}

// ============================================
// VISIBILITY TRACKING
// ============================================
// Track visibility changes
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    console.log('Digital Detox: Page hidden');
    chrome.runtime.sendMessage({ action: 'pageHidden' });
  } else {
    console.log('Digital Detox: Page visible');
    chrome.runtime.sendMessage({ 
      action: 'pageActive', 
      url: window.location.href 
    });
  }
});

// ============================================
// WARNING OVERLAY
// ============================================
// Optional: Show warning overlay for excessive usage
let warningShown = false;

function showWarningOverlay(minutes) {
  if (warningShown) return;
  
  const overlay = document.createElement('div');
  overlay.id = 'digital-detox-warning';
  overlay.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
    padding: 15px;
    text-align: center;
    z-index: 999999;
    font-family: system-ui, -apple-system, sans-serif;
    box-shadow: 0 2px 10px rgba(0,0,0,0.2);
  `;
  
  overlay.innerHTML = `
    <div style="max-width: 600px; margin: 0 auto;">
      <h3 style="margin: 0 0 5px 0; font-size: 18px;">⏰ Digital Detox Reminder</h3>
      <p style="margin: 0; font-size: 14px;">You've spent ${minutes} minutes here today. Time for a break?</p>
    </div>
  `;
  
  document.body.appendChild(overlay);
  warningShown = true;
  
  setTimeout(() => {
    overlay.remove();
    warningShown = false;
  }, 5000);
}

// Listen for messages from background
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'showWarning') {
    showWarningOverlay(request.minutes);
  }
});

console.log('✅ Digital Detox content script fully loaded');