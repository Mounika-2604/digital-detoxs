// register.js - Registration handler
const registerForm = document.getElementById("registerForm");

registerForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  const username = registerForm[0].value;
  const email = registerForm[1].value;
  const password = registerForm[2].value;
  const confirmPassword = registerForm[3].value;

  if (password !== confirmPassword) {
    alert("Passwords do not match");
    return;
  }

  if (password.length < 6) {
    alert("Password must be at least 6 characters");
    return;
  }

  try {
    const res = await fetch("http://localhost:3001/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, email, password })
    });

    const data = await res.json();
    console.log("Server response:", data);

    if (data.success) {
      // Store user info
      localStorage.setItem("userId", data.userId);
      localStorage.setItem("userEmail", email);

      // Notify Chrome extension
      const extensionId = 'mcdpoekdhepkkmdhodgejlijmpifimhj'; // Replace with your actual extension ID
      
      if (typeof chrome !== "undefined" && chrome.runtime) {
        chrome.runtime.sendMessage(
          extensionId,
          { 
            type: 'LOGIN_SUCCESS', 
            userId: data.userId,
            email: email 
          },
          (response) => {
            if (chrome.runtime.lastError) {
              console.log('Extension message failed:', chrome.runtime.lastError);
            } else {
              console.log('Extension notified of registration');
            }
          }
        );
      }

      // Redirect to dashboard
      window.location.href = data.redirect || "/dashboard.html";
    } else {
      alert(data.message || "Registration failed");
    }
  } catch (err) {
    console.error("Error:", err);
    alert("Server error! Make sure the server is running on port 3000");
  }
});