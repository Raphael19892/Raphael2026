/**
 * טיפוסי הליבה של FiberTrack — מודל הנתונים התזונתי.
 */

/** סוגי סיבים תזונתיים שהמנוע מזהה ומנתח. */
export type FiberKind = 'soluble' | 'insoluble' | 'resistantStarch';

/** תת-סוגי סיבים פרה-ביוטיים בעלי משמעות מיקרוביומית מיוחדת. */
export type PrebioticCompound =
  | 'beta_glucan'   // בטא-גלוקן: שיבולת שועל, שעורה — הורדת LDL
  | 'inulin'        // אינולין: עולש, ארטישוק ירושלמי, בצל — הזנת ביפידובקטריה
  | 'pectin'        // פקטין: תפוח, פירות הדר — ייצור בוטיראט
  | 'mucilage'      // ריר צמחי: צ'יה, פשתן, פסיליום — האטת ספיגת גלוקוז
  | 'fructan'       // פרוקטנים: חיטה, שום, כרישה
  | 'arabinoxylan'; // ארבינוקסילן: סובין חיטה ודגנים מלאים

/** פריט מזון בודד שחולץ מהטקסט החופשי של המשתמש על-ידי ה-LLM. */
export interface AnalyzedFoodItem {
  /** שם המזון כפי שזוהה, בעברית (למשל: "שיבולת שועל, קערה"). */
  name: string;
  /** הכמות המוערכת בגרמים. */
  estimatedGrams: number;
  /** סך סיבים תזונתיים בגרמים. */
  totalFiberG: number;
  /** סיבים מסיסים בגרמים. */
  solubleFiberG: number;
  /** סיבים בלתי-מסיסים בגרמים. */
  insolubleFiberG: number;
  /** עמילן עמיד בגרמים. */
  resistantStarchG: number;
  /** תרכובות פרה-ביוטיות מרכזיות שהפריט מכיל. */
  prebioticCompounds: PrebioticCompound[];
  /** האם זהו מקור צמחי (לצורך מדד גיוון "30 צמחים בשבוע"). */
  isPlantSource: boolean;
  /** רמת ביטחון של המודל בהערכה (0–1). */
  confidence: number;
}

/** תוצאת ניתוח מלאה של ארוחה אחת שהוחזרה מה-LLM. */
export interface MealAnalysis {
  items: AnalyzedFoodItem[];
  /** תובנה מדעית קצרה בעברית על הארוחה, מנוסחת למשתמש. */
  scienceInsight: string;
  /** שאלת הבהרה אם התיאור היה עמום מדי (null אם לא נדרש). */
  clarificationNeeded: string | null;
}

/** רשומת ארוחה שמורה ביומן. */
export interface MealEntry {
  id: string;
  /** הטקסט החופשי המקורי שהמשתמש הקליד. */
  rawText: string;
  /** חותמת זמן ISO. */
  loggedAt: string;
  analysis: MealAnalysis;
}

/** סיכום צריכה יומי מצטבר. */
export interface DailyTotals {
  totalFiberG: number;
  solubleFiberG: number;
  insolubleFiberG: number;
  resistantStarchG: number;
  plantSourceCount: number;
  prebioticVariety: PrebioticCompound[];
}

/** רמות חומרה של תובנה — קובעות צבע והדגשה בדשבורד. */
export type InsightLevel = 'positive' | 'info' | 'warning';

/** תובנה מדעית מוצגת בדשבורד. */
export interface HealthInsight {
  level: InsightLevel;
  title: string;
  body: string;
  /** אסמכתה מדעית מקוצרת (למשל: "WHO 2023; Reynolds et al., Lancet 2019"). */
  reference: string;
}

/** תוצאת מנוע "האם זה בריא לי?". */
export interface HealthAssessment {
  /** ציון בריאותי יומי 0–100. */
  score: number;
  /** תווית מילולית לציון ("מצוין", "בדרך הנכונה"...). */
  label: string;
  /** אחוז התקדמות אל יעד ה-WHO (30 גרם), חסום ב-150%. */
  whoTargetPct: number;
  /** פירוט רכיבי הציון לשקיפות מלאה. */
  breakdown: {
    quantityScore: number;   // 0–40: כמות מול יעד WHO
    balanceScore: number;    // 0–25: יחס מסיס/בלתי-מסיס
    microbiomeScore: number; // 0–25: עמילן עמיד + גיוון פרה-ביוטי
    diversityScore: number;  // 0–10: מספר מקורות צמחיים
  };
  insights: HealthInsight[];
}
