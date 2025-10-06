document.getElementById("logoutBtn").addEventListener("click", () => {
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

  // Redirect to login page
  window.location.href = "/login.html";
});
