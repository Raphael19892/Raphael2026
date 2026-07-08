# FiberTrack AI 🥣🔬

אפליקציית מובייל (React Native / Expo) למעקב אחר צריכת **סיבים תזונתיים** בעזרת
בינה מלאכותית, עם פידבק מדעי מותאם אישית המבוסס על מחקרים קליניים עדכניים
והמלצות ה‑WHO.

> An AI‑powered dietary‑fiber tracker that parses free‑text meals with an LLM,
> scores each day against WHO / microbiome‑science targets, and explains the
> results in plain language.

---

## שלושת רכיבי הליבה

### 1. יומן תזונה חכם — *Smart Nutrition Diary*
המשתמש כותב בשפה חופשית מה אכל (למשל: *"אכלתי קערת שיבולת שועל עם תפוח וכף
צ'יה"*). הפונקציה [`analyzeMeal`](src/services/aiAnalysis.js) שולחת את הטקסט
ל‑LLM עם **structured tool‑calling**, כך שהמודל מוכרח להחזיר JSON טיפוסי לפי
`FIBER_SCHEMA`: פירוק לרכיבים, וכמות הסיבים לפי שלושת הסוגים —
**מסיס / בלתי‑מסיס / עמילן עמיד**.

### 2. מנוע "האם זה בריא לי?" — *Health Assessment*
[`assessDay`](src/services/fiberEngine.js) הוא מנוע דטרמיניסטי (רץ 100% על
המכשיר) שממיר יום שלם של ארוחות לציון 0–100. העוגנים המדעיים:

| מדד | עוגן מחקרי |
|-----|-------------|
| יעד סיבים יומי (30 גר׳) | WHO / EFSA · Reynolds et al., *Lancet* 2019 |
| איזון סיבים למיקרוביום | יחס פרֵביוטי (מסיס + עמילן עמיד) ≈ 50% |
| מגוון מקורות צמחיים | American Gut · McDonald et al., *mSystems* 2018 |

### 3. תצוגת תובנות מדעיות — *Science UI*
[`DashboardScreen`](src/screens/DashboardScreen.js) מציג טבעת ציון יומי, פילוח
סוגי סיבים מול יעד ה‑30 גרם, ומסביר בשפה פשוטה *למה* היום קיבל את הציון
(למשל: *"הצ'יה שאכלת מספקת ריר צמחי המסייע באיזון רמות הסוכר בדם"*).

---

## ארכיטקטורה

```
App.js                      ניווט תחתון: דשבורד + יומן
src/
├─ services/
│  ├─ aiAnalysis.js         🧠 Prompt + Function → LLM (deliverable A)
│  └─ fiberEngine.js        🔬 מנוע ציון בריאותי מדעי (deliverable B)
├─ screens/
│  ├─ DashboardScreen.js    📊 ה‑Science UI (deliverable C)
│  └─ DiaryScreen.js        🥣 הזנת ארוחות בטקסט חופשי
├─ components/              HealthScoreRing · FiberBreakdownCard · InsightCard · MealCard
├─ store/useNutritionStore.js   Zustand + AsyncStorage (persist)
└─ theme.js                 טוקני עיצוב
```

## הפעלה

```bash
npm install
cp .env.example .env        # הכניסו מפתח OpenAI (אופציונלי)
npm start                   # ואז i / a / w ל‑iOS / Android / Web
```

**ללא מפתח API** האפליקציה עדיין עובדת במלואה: `aiAnalysis.js` נופל חזרה
למעריך היוריסטי מקומי (`mockAnalyze`) כדי שאפשר להדגים מיד.

## בניית APK להתקנה על אנדרואיד

ראו מדריך מלא צעד‑אחר‑צעד ב‑[`BUILD_APK.md`](BUILD_APK.md). בקצרה:

```bash
npm install -g eas-cli
eas login          # חשבון Expo חינמי
eas init
npm run build:apk  # מפיק קובץ APK בענן + קישור להורדה
```

## כיצד עובד ה‑Prompt + Function (deliverable A)

`aiAnalysis.js` בונה:
1. **System prompt** שמקודד את המומחיות התזונתית — כיצד לאמוד את שלוש
   פרקציות הסיבים ולהישאר מעוגן בנתוני הרכב מזון (USDA).
2. **`FIBER_SCHEMA`** — חוזה פלט מובנה. `tool_choice` מכריח את המודל
   לקרוא לפונקציה ולהחזיר JSON תקין (ללא פרסום שביר של טקסט חופשי).
3. **`callLLM`** — שכבת התעבורה, מבודדת כדי שניתן להחליף ספק (OpenAI ↔
   Anthropic וכו') בלי לגעת בשאר הקוד.

## הערה
המידע חינוכי בלבד, מבוסס הנחיות WHO/EFSA ומחקרים קליניים, ואינו מהווה ייעוץ רפואי.
