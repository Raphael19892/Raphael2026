/**
 * שירות ניתוח הארוחות באמצעות LLM (OpenAI Chat Completions + Function Calling).
 *
 * זרימה:
 *   טקסט חופשי של המשתמש ("אכלתי קערת שיבולת שועל עם תפוח וכף צ'יה")
 *     → פרומפט מערכת תזונתי + הגדרת פונקציה (JSON Schema)
 *     → המודל מחויב להחזיר קריאת פונקציה מובנית
 *     → ולידציה והמרה ל-MealAnalysis.
 *
 * הערת אבטחה: בפרודקשן יש לנתב את הקריאה דרך שרת-ביניים (proxy) כדי לא
 * לחשוף את מפתח ה-API באפליקציית הלקוח. הקבוע API_BASE_URL מאפשר זאת.
 */

import type {
  AnalyzedFoodItem,
  MealAnalysis,
  PrebioticCompound,
} from '../types/nutrition';

// ---------------------------------------------------------------------------
// תצורה
// ---------------------------------------------------------------------------

/** בפרודקשן: כתובת שרת-הביניים שלכם. בפיתוח אפשר לפנות ישירות ל-OpenAI. */
const API_BASE_URL =
  process.env.EXPO_PUBLIC_LLM_PROXY_URL ?? 'https://api.openai.com/v1';

/** מפתח נדרש רק בפנייה ישירה; שרת-ביניים אמור להזריק אותו בעצמו. */
const API_KEY = process.env.EXPO_PUBLIC_OPENAI_API_KEY ?? '';

const MODEL = 'gpt-4o-mini';

// ---------------------------------------------------------------------------
// הפרומפט
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `אתה דיאטן קליני מומחה לסיבים תזונתיים ולבריאות המיקרוביום.
המשתמש מתאר ארוחה בשפה חופשית בעברית. תפקידך:

1. לפרק את התיאור לפריטי מזון בודדים ולהעריך כמות סבירה בגרמים לכל פריט
   (אם לא צוינה כמות, השתמש במנה ביתית טיפוסית: קערה = ~240 גרם דגני בוקר
   מבושלים, כף = ~12 גרם זרעים, פרי בינוני = ~180 גרם).
2. להעריך לכל פריט את תכולת הסיבים לפי בסיסי נתונים תזונתיים מקובלים
   (USDA FoodData Central), בחלוקה לשלושה סוגים:
   - סיבים מסיסים (soluble)
   - סיבים בלתי-מסיסים (insoluble)
   - עמילן עמיד (resistant starch) — שים לב: עולה משמעותית באורז/תפו"א
     שבושלו וקוררו, בבננה ירוקה ובקטניות.
3. לזהות תרכובות פרה-ביוטיות מרכזיות (בטא-גלוקן, אינולין, פקטין, ריר צמחי,
   פרוקטנים, ארבינוקסילן).
4. לנסח תובנה מדעית אחת קצרה בעברית פשוטה (עד 2 משפטים) על ההשפעה
   הבריאותית הבולטת ביותר של הארוחה, מבוססת על ממצאים קליניים מוכרים.
   דוגמה: "הצ'יה שאכלת מספקת ריר צמחי (mucilage) שיוצר ג'ל במעי ומאט את
   ספיגת הגלוקוז — מחקרים קליניים מצאו שיפור באיזון סוכר לאחר ארוחה."

כללים מחייבים:
- החזר תמיד תשובה אך ורק דרך קריאה לפונקציה log_fiber_analysis.
- אל תמציא ערכים מדויקים מדי; עגל לעשירית גרם וסמן confidence נמוך
  כשהתיאור עמום.
- אם התיאור עמום מכדי לנתח (למשל "אכלתי משהו"), החזר items ריק ומלא את
  clarification_needed בשאלת הבהרה קצרה בעברית.
- solubleFiberG + insolubleFiberG חייבים לסכום בקירוב ל-totalFiberG
  (עמילן עמיד נספר בנפרד ואינו חלק מהסכום).
- אל תכלול המלצות רפואיות אישיות; רק מידע תזונתי כללי.`;

// ---------------------------------------------------------------------------
// הגדרת הפונקציה (Function / Tool Schema)
// ---------------------------------------------------------------------------

const PREBIOTIC_ENUM: PrebioticCompound[] = [
  'beta_glucan',
  'inulin',
  'pectin',
  'mucilage',
  'fructan',
  'arabinoxylan',
];

export const FIBER_ANALYSIS_TOOL = {
  type: 'function' as const,
  function: {
    name: 'log_fiber_analysis',
    description:
      'רישום ניתוח סיבים תזונתיים מובנה עבור ארוחה שתוארה בטקסט חופשי.',
    parameters: {
      type: 'object',
      properties: {
        items: {
          type: 'array',
          description: 'פריטי המזון שזוהו בארוחה.',
          items: {
            type: 'object',
            properties: {
              name: {
                type: 'string',
                description: 'שם המזון בעברית, כולל צורת הגשה.',
              },
              estimated_grams: {
                type: 'number',
                description: 'משקל מוערך בגרמים.',
              },
              total_fiber_g: {
                type: 'number',
                description: 'סך סיבים תזונתיים בגרמים.',
              },
              soluble_fiber_g: {
                type: 'number',
                description: 'סיבים מסיסים בגרמים.',
              },
              insoluble_fiber_g: {
                type: 'number',
                description: 'סיבים בלתי-מסיסים בגרמים.',
              },
              resistant_starch_g: {
                type: 'number',
                description: 'עמילן עמיד בגרמים (0 אם זניח).',
              },
              prebiotic_compounds: {
                type: 'array',
                items: { type: 'string', enum: PREBIOTIC_ENUM },
                description: 'תרכובות פרה-ביוטיות מרכזיות בפריט.',
              },
              is_plant_source: {
                type: 'boolean',
                description: 'האם הפריט הוא מקור צמחי מלא.',
              },
              confidence: {
                type: 'number',
                minimum: 0,
                maximum: 1,
                description: 'ביטחון ההערכה: 1 = כמות מפורשת, 0.5 = ניחוש מנה.',
              },
            },
            required: [
              'name',
              'estimated_grams',
              'total_fiber_g',
              'soluble_fiber_g',
              'insoluble_fiber_g',
              'resistant_starch_g',
              'prebiotic_compounds',
              'is_plant_source',
              'confidence',
            ],
          },
        },
        science_insight: {
          type: 'string',
          description:
            'תובנה מדעית קצרה בעברית פשוטה על ההשפעה הבריאותית של הארוחה.',
        },
        clarification_needed: {
          type: ['string', 'null'],
          description:
            'שאלת הבהרה בעברית אם התיאור עמום מדי; אחרת null.',
        },
      },
      required: ['items', 'science_insight', 'clarification_needed'],
    },
  },
};

// ---------------------------------------------------------------------------
// קריאת ה-API
// ---------------------------------------------------------------------------

export class MealAnalysisError extends Error {}

/**
 * שולח תיאור ארוחה חופשי ל-LLM ומחזיר ניתוח סיבים מובנה.
 *
 * @param mealText תיאור הארוחה כפי שהמשתמש הקליד.
 */
export async function analyzeMealText(mealText: string): Promise<MealAnalysis> {
  const trimmed = mealText.trim();
  if (!trimmed) {
    throw new MealAnalysisError('תיאור הארוחה ריק.');
  }

  const response = await fetch(`${API_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(API_KEY ? { Authorization: `Bearer ${API_KEY}` } : {}),
    },
    body: JSON.stringify({
      model: MODEL,
      temperature: 0.2,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: trimmed },
      ],
      tools: [FIBER_ANALYSIS_TOOL],
      // מחייב את המודל להחזיר את הפונקציה — בלי טקסט חופשי.
      tool_choice: {
        type: 'function',
        function: { name: 'log_fiber_analysis' },
      },
    }),
  });

  if (!response.ok) {
    const errBody = await response.text().catch(() => '');
    throw new MealAnalysisError(
      `שגיאת שרת הניתוח (${response.status}): ${errBody.slice(0, 200)}`
    );
  }

  const data = await response.json();
  const toolCall = data?.choices?.[0]?.message?.tool_calls?.[0];
  if (!toolCall || toolCall.function?.name !== 'log_fiber_analysis') {
    throw new MealAnalysisError('המודל לא החזיר ניתוח מובנה. נסו לנסח מחדש.');
  }

  let parsed: any;
  try {
    parsed = JSON.parse(toolCall.function.arguments);
  } catch {
    throw new MealAnalysisError('תשובת המודל לא הייתה JSON תקין.');
  }

  return normalizeAnalysis(parsed);
}

// ---------------------------------------------------------------------------
// ולידציה ונרמול — לעולם לא סומכים על פלט LLM כמות שהוא
// ---------------------------------------------------------------------------

const clampNonNegative = (n: unknown): number =>
  typeof n === 'number' && Number.isFinite(n) && n > 0 ? Math.round(n * 10) / 10 : 0;

function normalizeAnalysis(raw: any): MealAnalysis {
  const rawItems: any[] = Array.isArray(raw?.items) ? raw.items : [];

  const items: AnalyzedFoodItem[] = rawItems
    .filter((it) => typeof it?.name === 'string' && it.name.trim())
    .map((it) => {
      const soluble = clampNonNegative(it.soluble_fiber_g);
      const insoluble = clampNonNegative(it.insoluble_fiber_g);
      // אם total לא עקבי עם הרכיבים — נגזור אותו מחדש מהסכום.
      const reportedTotal = clampNonNegative(it.total_fiber_g);
      const componentSum = Math.round((soluble + insoluble) * 10) / 10;
      const total =
        reportedTotal > 0 && Math.abs(reportedTotal - componentSum) <= 1
          ? reportedTotal
          : componentSum;

      return {
        name: it.name.trim(),
        estimatedGrams: clampNonNegative(it.estimated_grams),
        totalFiberG: total,
        solubleFiberG: soluble,
        insolubleFiberG: insoluble,
        resistantStarchG: clampNonNegative(it.resistant_starch_g),
        prebioticCompounds: (Array.isArray(it.prebiotic_compounds)
          ? it.prebiotic_compounds
          : []
        ).filter((p: any): p is PrebioticCompound =>
          (PREBIOTIC_ENUM as string[]).includes(p)
        ),
        isPlantSource: it.is_plant_source === true,
        confidence:
          typeof it.confidence === 'number'
            ? Math.min(1, Math.max(0, it.confidence))
            : 0.5,
      };
    });

  return {
    items,
    scienceInsight:
      typeof raw?.science_insight === 'string' ? raw.science_insight.trim() : '',
    clarificationNeeded:
      typeof raw?.clarification_needed === 'string' &&
      raw.clarification_needed.trim()
        ? raw.clarification_needed.trim()
        : null,
  };
}
