/*
 * Content Guardian - background service worker (Manifest V3)
 *
 * תפקידים:
 *  1. אימות המשתמש מול חשבון ה-Google המחובר בדפדפן (Chrome Identity API).
 *  2. הפעלת/כיבוי מנגנון החסימה (declarativeNetRequest) לפי הרשאת המשתמש.
 *
 * הערה חשובה: תוסף שרץ בצד הלקוח אינו יכול "לאכוף" חסימה שלא ניתן לעקוף
 * (המשתמש שהתקין אותו יכול גם להסירו). המנגנון כאן מיועד לסינון עצמי / הורי
 * מרצון, לא כפתרון אבטחה שלא ניתן לעקיפה.
 */

// ── הגדרות ──────────────────────────────────────────────────────────────
// רשימת האימיילים המורשים להפעיל את התוסף.
// השאירו ריק ( [] ) כדי לאפשר לכל משתמש Google מחובר.
const AUTHORIZED_EMAILS = [
  // "someone@gmail.com",
];

const RULESET_ID = "blocklist";

// ── עזרי אחסון ──────────────────────────────────────────────────────────
async function setState(patch) {
  await chrome.storage.local.set(patch);
}
async function getState() {
  return chrome.storage.local.get({
    authorized: false,
    email: null,
    lastCheck: 0
  });
}

// ── הפעלה/כיבוי של ה-ruleset ────────────────────────────────────────────
async function setBlockingEnabled(enabled) {
  try {
    await chrome.declarativeNetRequest.updateEnabledRulesets(
      enabled
        ? { enableRulesetIds: [RULESET_ID], disableRulesetIds: [] }
        : { enableRulesetIds: [], disableRulesetIds: [RULESET_ID] }
    );
  } catch (e) {
    console.error("[Guardian] updateEnabledRulesets failed:", e);
  }
}

// ── אימות מול Google ────────────────────────────────────────────────────
// getProfileUserInfo מחזיר את פרטי החשבון המחובר בדפדפן ללא צורך בהסכמת OAuth.
function getBrowserProfileEmail() {
  return new Promise((resolve) => {
    if (!chrome.identity || !chrome.identity.getProfileUserInfo) {
      resolve(null);
      return;
    }
    chrome.identity.getProfileUserInfo(
      { accountStatus: "ANY" },
      (info) => resolve(info && info.email ? info.email : null)
    );
  });
}

// אימות "חזק" יותר דרך OAuth token — אופציונלי, נדרש client_id תקין ב-manifest.
function getOAuthEmail(interactive = false) {
  return new Promise((resolve) => {
    if (!chrome.identity || !chrome.identity.getAuthToken) {
      resolve(null);
      return;
    }
    chrome.identity.getAuthToken({ interactive }, async (token) => {
      if (chrome.runtime.lastError || !token) {
        resolve(null);
        return;
      }
      try {
        const res = await fetch(
          "https://www.googleapis.com/oauth2/v3/userinfo",
          { headers: { Authorization: "Bearer " + token } }
        );
        const data = await res.json();
        resolve(data && data.email ? data.email : null);
      } catch {
        resolve(null);
      }
    });
  });
}

function isEmailAuthorized(email) {
  if (!email) return false;
  if (AUTHORIZED_EMAILS.length === 0) return true; // כל משתמש מחובר מורשה
  return AUTHORIZED_EMAILS.map((e) => e.toLowerCase()).includes(
    email.toLowerCase()
  );
}

// ── תהליך האימות המרכזי ─────────────────────────────────────────────────
async function verifyAndApply(interactive = false) {
  // מנסים קודם את החשבון המחובר לדפדפן; אם אין — נופלים ל-OAuth.
  let email = await getBrowserProfileEmail();
  if (!email) {
    email = await getOAuthEmail(interactive);
  }

  const authorized = isEmailAuthorized(email);
  await setState({ authorized, email, lastCheck: Date.now() });
  await setBlockingEnabled(authorized);

  console.log(
    `[Guardian] אימות: email=${email || "(לא נמצא)"} authorized=${authorized}`
  );
  return { email, authorized };
}

// ── מחזור חיים ─────────────────────────────────────────────────────────
chrome.runtime.onInstalled.addListener(() => verifyAndApply(false));
chrome.runtime.onStartup.addListener(() => verifyAndApply(false));

// אימות מחדש כשמשתמש הדפדפן מתחלף.
if (chrome.identity && chrome.identity.onSignInChanged) {
  chrome.identity.onSignInChanged.addListener(() => verifyAndApply(false));
}

// ממשק לפופאפ (בקשת סטטוס / כניסה יזומה).
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  (async () => {
    if (msg && msg.type === "GET_STATUS") {
      const state = await getState();
      sendResponse(state);
    } else if (msg && msg.type === "SIGN_IN") {
      const result = await verifyAndApply(true);
      sendResponse(result);
    } else {
      sendResponse({ error: "unknown message" });
    }
  })();
  return true; // תשובה אסינכרונית
});
