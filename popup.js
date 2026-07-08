// popup.js — מציג את סטטוס האימות ומאפשר כניסה יזומה

function render(state) {
  const dot = document.getElementById("dot");
  const statusText = document.getElementById("statusText");
  const email = document.getElementById("email");

  if (state && state.authorized) {
    dot.className = "dot on";
    statusText.textContent = "החסימה פעילה ✓";
  } else {
    dot.className = "dot off";
    statusText.textContent = "החסימה אינה פעילה";
  }
  email.textContent = state && state.email ? "משתמש: " + state.email : "לא זוהה חשבון Google";
}

chrome.runtime.sendMessage({ type: "GET_STATUS" }, render);

document.getElementById("signin").addEventListener("click", () => {
  document.getElementById("statusText").textContent = "מאמת…";
  chrome.runtime.sendMessage({ type: "SIGN_IN" }, (result) => {
    chrome.runtime.sendMessage({ type: "GET_STATUS" }, render);
  });
});
