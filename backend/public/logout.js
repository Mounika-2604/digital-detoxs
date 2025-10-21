document.getElementById("logoutBtn").addEventListener("click", async () => {
  // Clear from localStorage
  localStorage.removeItem("userId");
  localStorage.removeItem("userEmail");
  console.log("🗑️ Cleared user from localStorage");

  // Clear from Chrome Extension storage
  if (typeof chrome !== "undefined" && chrome.storage) {
    chrome.storage.local.remove(["userId", "userEmail"], () => {
      console.log("🗑️ Cleared user from extension storage");
    });
  }

  // Destroy session on server then redirect
  try {
    await fetch('/logout', { credentials: 'include' });
  } catch (_) {}
  window.location.href = "/login.html";
});
