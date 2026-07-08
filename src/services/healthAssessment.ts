/**
 * מנוע "האם זה בריא לי?" — הערכה דטרמיניסטית של יום התזונה.
 *
 * הציון (0–100) מורכב מארבעה רכיבים מבוססי-ספרות:
 *
 *   1. כמות (40 נק'):    יעד WHO ≥ 30 גרם סיבים ליום
 *                        (Reynolds et al., The Lancet 2019; הנחיות WHO 2023).
 *   2. איזון (25 נק'):   יחס מסיס:בלתי-מסיס — טווח מיטבי ~1:1 עד 1:3,
 *                        המשקף תזונה מגוונת של דגנים מלאים, פירות וקטניות.
 *   3. מיקרוביום (25 נק'): עמילן עמיד (מצע לייצור בוטיראט; Baxter et al.,
 *                        mBio 2019) + מגוון תרכובות פרה-ביוטיות.
 *   4. גיוון (10 נק'):   מספר מקורות צמחיים ביום — בהשראת ממצאי
 *                        American Gut Project (McDonald et al., mSystems 2018)
 *                        על יתרון של ~30 צמחים שונים בשבוע.
 */

import type {
  DailyTotals,
  HealthAssessment,
  HealthInsight,
  MealEntry,
  PrebioticCompound,
} from '../types/nutrition';

export const WHO_DAILY_FIBER_TARGET_G = 30;
const RESISTANT_STARCH_TARGET_G = 6; // יעד יומי מעשי המופיע במחקרי התערבות
const DAILY_PLANT_DIVERSITY_TARGET = 5; // ~30 צמחים בשבוע ≈ 4–5 ביום

const round1 = (n: number) => Math.round(n * 10) / 10;

/** צבירת סך הצריכה היומית מרשומות היומן. */
export function aggregateDailyTotals(meals: MealEntry[]): DailyTotals {
  const totals: DailyTotals = {
    totalFiberG: 0,
    solubleFiberG: 0,
    insolubleFiberG: 0,
    resistantStarchG: 0,
    plantSourceCount: 0,
    prebioticVariety: [],
  };

  const plants = new Set<string>();
  const prebiotics = new Set<PrebioticCompound>();

  for (const meal of meals) {
    for (const item of meal.analysis.items) {
      totals.totalFiberG += item.totalFiberG;
      totals.solubleFiberG += item.solubleFiberG;
      totals.insolubleFiberG += item.insolubleFiberG;
      totals.resistantStarchG += item.resistantStarchG;
      if (item.isPlantSource) plants.add(item.name);
      item.prebioticCompounds.forEach((p) => prebiotics.add(p));
    }
  }

  totals.totalFiberG = round1(totals.totalFiberG);
  totals.solubleFiberG = round1(totals.solubleFiberG);
  totals.insolubleFiberG = round1(totals.insolubleFiberG);
  totals.resistantStarchG = round1(totals.resistantStarchG);
  totals.plantSourceCount = plants.size;
  totals.prebioticVariety = [...prebiotics];
  return totals;
}

/** הרצת מנוע ההערכה על סך יומי. */
export function assessDailyHealth(totals: DailyTotals): HealthAssessment {
  // --- 1. כמות: ליניארי עד יעד ה-WHO --------------------------------------
  const quantityRatio = Math.min(totals.totalFiberG / WHO_DAILY_FIBER_TARGET_G, 1);
  const quantityScore = Math.round(quantityRatio * 40);

  // --- 2. איזון מסיס/בלתי-מסיס --------------------------------------------
  let balanceScore = 0;
  if (totals.solubleFiberG > 0 && totals.insolubleFiberG > 0) {
    const ratio = totals.insolubleFiberG / totals.solubleFiberG; // מיטבי: 1–3
    if (ratio >= 1 && ratio <= 3) balanceScore = 25;
    else if (ratio >= 0.5 && ratio <= 4.5) balanceScore = 15;
    else balanceScore = 8;
  } else if (totals.totalFiberG > 0) {
    balanceScore = 5; // סוג יחיד בלבד — חסר איזון
  }

  // --- 3. מיקרוביום: עמילן עמיד + מגוון פרה-ביוטי --------------------------
  const rsScore = Math.min(totals.resistantStarchG / RESISTANT_STARCH_TARGET_G, 1) * 13;
  const varietyScore = Math.min(totals.prebioticVariety.length / 4, 1) * 12;
  const microbiomeScore = Math.round(rsScore + varietyScore);

  // --- 4. גיוון צמחי --------------------------------------------------------
  const diversityScore = Math.round(
    Math.min(totals.plantSourceCount / DAILY_PLANT_DIVERSITY_TARGET, 1) * 10
  );

  const score = quantityScore + balanceScore + microbiomeScore + diversityScore;

  return {
    score,
    label: scoreLabel(score),
    whoTargetPct: Math.min(
      Math.round((totals.totalFiberG / WHO_DAILY_FIBER_TARGET_G) * 100),
      150
    ),
    breakdown: { quantityScore, balanceScore, microbiomeScore, diversityScore },
    insights: buildInsights(totals),
  };
}

function scoreLabel(score: number): string {
  if (score >= 85) return 'מצוין! המעיים שלך חוגגים 🎉';
  if (score >= 65) return 'טוב מאוד — בדרך הנכונה';
  if (score >= 40) return 'סביר — יש מקום לשיפור';
  if (score > 0) return 'נמוך — המיקרוביום רעב לסיבים';
  return 'עדיין לא נרשמו ארוחות היום';
}

// ---------------------------------------------------------------------------
// תובנות מדעיות מבוססות-כללים (משלימות את תובנת ה-LLM לכל ארוחה)
// ---------------------------------------------------------------------------

function buildInsights(totals: DailyTotals): HealthInsight[] {
  const insights: HealthInsight[] = [];

  if (totals.totalFiberG >= WHO_DAILY_FIBER_TARGET_G) {
    insights.push({
      level: 'positive',
      title: 'עמדת ביעד ה-WHO! 🏆',
      body:
        `צרכת ${totals.totalFiberG} גרם סיבים — מעל היעד של 30 גרם. מטא-אנליזה ` +
        'ב-Lancet מצאה שצריכה כזו קשורה בירידה של 15–30% בתמותה ממחלות לב.',
      reference: 'Reynolds et al., The Lancet 2019; WHO 2023',
    });
  } else if (totals.totalFiberG > 0) {
    const gap = round1(WHO_DAILY_FIBER_TARGET_G - totals.totalFiberG);
    insights.push({
      level: totals.totalFiberG >= 20 ? 'info' : 'warning',
      title: `חסרים ${gap} גרם ליעד היומי`,
      body:
        'ארגון הבריאות העולמי ממליץ על 30+ גרם סיבים ביום. השלמה קלה: ' +
        'כוס עדשים מבושלות (~15 גרם) או אבוקדו שלם (~10 גרם).',
      reference: 'WHO Carbohydrate Intake Guideline 2023',
    });
  }

  if (totals.resistantStarchG >= 3) {
    insights.push({
      level: 'positive',
      title: 'עמילן עמיד — דלק לבוטיראט',
      body:
        `${totals.resistantStarchG} גרם עמילן עמיד מגיעים היום למעי הגס שלמים, ` +
        'שם חיידקי המעי מתסיסים אותם לבוטיראט — חומצת שומן קצרת-שרשרת שמזינה ' +
        'את תאי דופן המעי ומפחיתה דלקתיות.',
      reference: 'Baxter et al., mBio 2019',
    });
  }

  if (totals.prebioticVariety.includes('mucilage')) {
    insights.push({
      level: 'positive',
      title: 'ריר צמחי מאזן סוכר',
      body:
        "הצ'יה/פשתן/פסיליום שאכלת מכילים ריר צמחי היוצר ג'ל במעי, מאט את " +
        'ספיגת הגלוקוז ומקהה את קפיצת הסוכר שאחרי הארוחה — אפקט שנצפה ' +
        'בניסויים קליניים מבוקרים.',
      reference: 'Vuksan et al., Nutr Metab Cardiovasc Dis 2017',
    });
  }

  if (totals.prebioticVariety.includes('beta_glucan')) {
    insights.push({
      level: 'positive',
      title: 'בטא-גלוקן מוריד כולסטרול',
      body:
        'שיבולת השועל/שעורה שבתפריט מספקות בטא-גלוקן. צריכה של ~3 גרם ביום ' +
        'מפחיתה כולסטרול LDL בכ-5–10% — טענה בריאותית שאושרה על-ידי ה-FDA ' +
        'וה-EFSA.',
      reference: 'Whitehead et al., Am J Clin Nutr 2014',
    });
  }

  if (totals.plantSourceCount >= DAILY_PLANT_DIVERSITY_TARGET) {
    insights.push({
      level: 'positive',
      title: `${totals.plantSourceCount} מקורות צמחיים היום 🌈`,
      body:
        'מחקר ה-American Gut מצא שאנשים שאוכלים 30+ צמחים שונים בשבוע ' +
        'מציגים מיקרוביום מגוון ועשיר יותר מאלה שאוכלים פחות מ-10.',
      reference: 'McDonald et al., mSystems 2018',
    });
  }

  if (
    totals.totalFiberG > 0 &&
    totals.solubleFiberG > 0 &&
    totals.insolubleFiberG / Math.max(totals.solubleFiberG, 0.1) > 4.5
  ) {
    insights.push({
      level: 'info',
      title: 'כדאי להוסיף סיבים מסיסים',
      body:
        'רוב הסיבים שלך היום בלתי-מסיסים (מעולה לתנועתיות המעי!). הוספת ' +
        'קטניות, שיבולת שועל או פרי הדר תזין גם את חיידקי המעי המתסיסים.',
      reference: 'Gill et al., Nat Rev Gastroenterol Hepatol 2021',
    });
  }

  if (totals.totalFiberG === 0) {
    insights.push({
      level: 'info',
      title: 'רשמו את הארוחה הראשונה',
      body:
        'תארו במילים חופשיות מה אכלתם, וה-AI יפרק את הארוחה לסוגי הסיבים ' +
        'ויסביר מה הם עושים לגוף.',
      reference: 'FiberTrack',
    });
  }

  return insights;
}
