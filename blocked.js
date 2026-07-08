// blocked.js — לוגיקת עמוד החסימה (מופרד מה-HTML בשל מדיניות ה-CSP של MV3)

const REASONS = {
  twitter: "רשת X / טוויטר נחסמה באופן הרמטי",
  adult: "אתר תוכן לא צנוע (לבוגרים)",
  "adult-tld": "סיומת דומיין של תוכן לבוגרים",
  "adult-keyword": "זוהתה מילת מפתח של תוכן לא צנוע"
};

const params = new URLSearchParams(location.search);
const src = params.get("src");
const reasonEl = document.getElementById("reason");
if (reasonEl && REASONS[src]) {
  reasonEl.textContent = REASONS[src];
}

document.getElementById("back").addEventListener("click", (e) => {
  e.preventDefault();
  if (history.length > 1) {
    history.back();
  } else {
    location.href = "https://www.google.com";
  }
});
