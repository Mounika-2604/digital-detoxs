document.getElementById("loginForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  
  const email = document.querySelector('input[type="email"]').value;
  const password = document.querySelector('input[type="password"]').value;

  try {
    const res = await fetch('/login', {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: 'include',  // IMPORTANT: Add this to send/receive cookies
      body: JSON.stringify({ email, password })
    });
    
    const data = await res.json();
    
    if (data.success) {
      // Store in localStorage for extension to access
      localStorage.setItem('userId', data.userId);
      localStorage.setItem('userEmail', data.email);
      
      // Notify extension if installed
      try {
        const extensionId = 'mcdpoekdhepkkmdhodgejlijmpifimhj';
        
        chrome.runtime.sendMessage(
          extensionId,
          {
            type: 'LOGIN_SUCCESS',
            userId: data.userId,
            email: data.email
          },
          function(response) {
            if (chrome.runtime.lastError) {
              console.log('Extension not installed or not accessible');
            } else {
              console.log('Extension notified successfully:', response);
            }
          }
        );
      } catch (e) {
        console.log('Could not notify extension:', e);
      }
      
      // Redirect ONCE after everything is done
      window.location.href = '/dashboard.html';
    } else {
      alert(data.message || "Login failed");
    }
  } catch (err) {
    console.error(err);
    alert("Server error!");
  }
});