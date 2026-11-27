# העלאת NutriLongevity AI לאתר משלך

בגרסה זו האפליקציה קוראת קישורים למוצרים בעצמה, Claude מנתח ארוחות, תוויות ומפרטי PDF, ויש חשבונות משתמש והיסטוריה שנשמרת.

## מה צריך
1. **מפתח Anthropic API**: ב-console.anthropic.com → API Keys → Create Key. החיוב לפי שימוש.
2. **חשבון GitHub** עם המאגר הזה.
3. **חשבון באחד משירותי האירוח:** Render או Railway.

## אפשרות א׳: Render
1. נכנסים ל-render.com ומתחברים עם GitHub.
2. **New → Blueprint**, ובוחרים את המאגר `Raphael2026`. Render מוצא לבד את הקובץ `render.yaml`.
3. כשמתבקשים, מדביקים את מפתח ה-API בשדה `ANTHROPIC_API_KEY`. השדה `FDC_API_KEY` הוא רשות: מפתח חינמי של USDA לחיפוש מזון.
4. לוחצים **Apply**. אחרי כמה דקות מתקבלת כתובת בצורה `https://nutrilongevity-xxxx.onrender.com`.
5. פותחים את הכתובת בטלפון, ובתפריט של Chrome בוחרים **הוספה למסך הבית**. האפליקציה תופיע כמו אפליקציה רגילה.

לגבי עלות: הדיסק ששומר את החשבונות והיומן דורש מסלול בתשלום, Starter. במסלול החינמי האפליקציה עובדת, אבל הנתונים נמחקים בכל עדכון.

## אפשרות ב׳: Railway
1. נכנסים ל-railway.app → **New Project → Deploy from GitHub repo** ובוחרים את המאגר.
2. ב-**Settings** מגדירים **Root Directory** = `nutrilongevity`. Railway יבנה את האפליקציה מה-Dockerfile.
3. ב-**Variables** מוסיפים `ANTHROPIC_API_KEY`.
4. מוסיפים **Volume** עם Mount path = `/data`, כדי שהנתונים יישמרו.
5. ב-**Settings → Networking → Generate Domain** מקבלים כתובת.

## הרצה על המחשב (בלי אירוח)
```bash
cd nutrilongevity
npm install
ANTHROPIC_API_KEY=המפתח_שלך npm start
```
ופותחים את http://localhost:3000. הכתובת עובדת רק מאותו מחשב.

## חשוב לדעת
- יש אתרי סופר שחוסמים קוראים אוטומטיים, או מציגים את טבלת הערכים כתמונה. במקרים האלה האפליקציה תכתוב במפורש שלא קראה את הדף, ותציע העתקה או צילום מסך.
- הכתובת שלך פרטית רק אם לא משתפים אותה. כל מי שנכנס אליה צריך לפתוח חשבון משלו.
