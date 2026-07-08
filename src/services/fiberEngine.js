// =============================================================================
// fiberEngine.js
// -----------------------------------------------------------------------------
// The "Is this healthy for me?" engine.
//
// A deterministic, science-based scorer that turns a day's meals into a 0–100
// health score plus plain-language insights. This runs 100% on-device (no AI
// call) so the dashboard is instant, private, and reproducible.
//
// Scientific anchors:
//  • Total fiber target: WHO / EFSA recommend ~25–30 g/day for adults; higher
//    intakes (30–38 g) associate with lower all-cause mortality
//    (Reynolds et al., Lancet 2019). We target 30 g.
//  • Fiber-type balance: a healthy gut microbiome is fed by a MIX of fibers.
//    Soluble & resistant starch are the primary fermentable "prebiotic"
//    fractions (butyrate production); insoluble drives motility. We reward
//    diversity rather than one dominant type.
//  • Diversity of plant sources correlates with microbiome richness
//    (McDonald et al., American Gut, mSystems 2018 — "~30 plants/week").
// =============================================================================

export const TARGETS = {
  totalFiberG: 30, // WHO-aligned daily goal
  fermentableShareIdeal: 0.5, // soluble + resistant ideally ~half of intake
  plantsPerDayIdeal: 6, // ~30 unique plants / week
};

// Weight of each sub-score in the final 0–100.
const WEIGHTS = {
  quantity: 0.5, // did you hit enough total fiber?
  balance: 0.3, // is the fiber-type mix microbiome-friendly?
  diversity: 0.2, // how many distinct plant sources?
};

/**
 * Assess a full day of analyzed meals.
 * @param {AnalyzedMeal[]} meals  meals already parsed by aiAnalysis.analyzeMeal
 * @returns {DayAssessment}
 */
export function assessDay(meals = []) {
  const totals = meals.reduce(
    (acc, m) => {
      acc.soluble += m.soluble || 0;
      acc.insoluble += m.insoluble || 0;
      acc.resistant += m.resistant || 0;
      return acc;
    },
    { soluble: 0, insoluble: 0, resistant: 0 }
  );
  const totalFiber = totals.soluble + totals.insoluble + totals.resistant;
  const fermentable = totals.soluble + totals.resistant; // prebiotic fractions
  const plantCount = countUniquePlants(meals);

  // --- Sub-score 1: Quantity vs the 30 g WHO target (capped at 100). ---
  const quantityScore = clamp((totalFiber / TARGETS.totalFiberG) * 100, 0, 100);

  // --- Sub-score 2: Balance. Reward a fermentable share near 50%. ---
  const fermentableShare = totalFiber > 0 ? fermentable / totalFiber : 0;
  const balanceScore =
    totalFiber > 0
      ? clamp(100 - Math.abs(fermentableShare - TARGETS.fermentableShareIdeal) * 200, 0, 100)
      : 0;

  // --- Sub-score 3: Diversity of plant sources. ---
  const diversityScore = clamp((plantCount / TARGETS.plantsPerDayIdeal) * 100, 0, 100);

  const score = Math.round(
    quantityScore * WEIGHTS.quantity +
      balanceScore * WEIGHTS.balance +
      diversityScore * WEIGHTS.diversity
  );

  return {
    score,
    grade: gradeFor(score),
    totalFiber: round1(totalFiber),
    soluble: round1(totals.soluble),
    insoluble: round1(totals.insoluble),
    resistant: round1(totals.resistant),
    fermentableShare,
    plantCount,
    remainingToTarget: round1(Math.max(0, TARGETS.totalFiberG - totalFiber)),
    subScores: {
      quantity: Math.round(quantityScore),
      balance: Math.round(balanceScore),
      diversity: Math.round(diversityScore),
    },
    insights: buildInsights({ totals, totalFiber, fermentableShare, plantCount, score }),
  };
}

// ---------------------------------------------------------------------------
// Insight generation — the "Science UI" text layer.
// Each insight: { tone, title, body } explaining WHY, in plain Hebrew.
// ---------------------------------------------------------------------------
function buildInsights({ totals, totalFiber, fermentableShare, plantCount, score }) {
  const out = [];

  // Total quantity.
  if (totalFiber >= TARGETS.totalFiberG) {
    out.push({
      tone: 'good',
      title: 'עמדת ביעד הסיבים היומי 🎉',
      body: `צרכת ${round1(totalFiber)} גרם סיבים — מעל המלצת ה‑WHO (30 גרם). צריכה כזו נקשרה במחקרים לירידה בסיכון לתחלואת לב וסוכרת מסוג 2.`,
    });
  } else if (totalFiber >= TARGETS.totalFiberG * 0.6) {
    out.push({
      tone: 'warn',
      title: 'קרוב ליעד, עוד קצת',
      body: `צרכת ${round1(totalFiber)} גרם. חסרים כ‑${round1(TARGETS.totalFiberG - totalFiber)} גרם ליעד היומי — תוספת של קטנייה או פרי תשלים את הפער.`,
    });
  } else {
    out.push({
      tone: 'bad',
      title: 'צריכת הסיבים נמוכה היום',
      body: `רק ${round1(totalFiber)} גרם עד כה. הגדלה הדרגתית (עם הרבה מים) מפחיתה אי‑נוחות ומטפחת חיידקי מעי מועילים.`,
    });
  }

  // Balance / microbiome.
  if (totalFiber > 0) {
    if (fermentableShare < 0.35) {
      out.push({
        tone: 'warn',
        title: 'המיקרוביום שלך רעב לסיבים מסיסים',
        body: 'רוב הסיבים שלך היום בלתי‑מסיסים (מוסיפים נפח ומאיצים מעבר). הוסף שיבולת שועל, קטניות או צ׳יה — הסיבים המסיסים והעמילן העמיד עוברים תסיסה במעי הגס ומייצרים בּוּטִירָט המזין את דופן המעי.',
      });
    } else if (fermentableShare > 0.65) {
      out.push({
        tone: 'warn',
        title: 'שווה להוסיף סיבים בלתי‑מסיסים',
        body: 'רוב הסיבים שלך מסיסים/עמילן עמיד. תוספת ירקות עליים, קליפות פירות או דגנים מלאים תשפר את סדירות המעבר במעי.',
      });
    } else {
      out.push({
        tone: 'good',
        title: 'איזון מצוין בין סוגי הסיבים',
        body: 'היחס בין הסיבים המסיסים, הבלתי‑מסיסים והעמילן העמיד קרוב לאופטימום — שילוב כזה מזין מגוון רחב של חיידקי מעי בריאים.',
      });
    }
  }

  // Resistant starch spotlight.
  if (totals.resistant >= 4) {
    out.push({
      tone: 'good',
      title: 'עמילן עמיד — פּרֵבּיוֹטִיקָה חזקה',
      body: `היום צרכת ${round1(totals.resistant)} גרם עמילן עמיד. הוא אינו מתעכל במעי הדק ומגיע למעי הגס, שם הוא מותסס לחומצות שומן קצרות‑שרשרת התומכות במטבוליזם ובחסינות.`,
    });
  }

  // Diversity.
  if (plantCount >= TARGETS.plantsPerDayIdeal) {
    out.push({
      tone: 'good',
      title: `מגוון צמחי מרשים (${plantCount} מקורות)`,
      body: 'מחקר ה‑American Gut מצא שאנשים הצורכים ~30 סוגי צמחים בשבוע נהנים ממיקרוביום עשיר ומגוון יותר. אתה בכיוון הנכון.',
    });
  } else if (plantCount > 0) {
    out.push({
      tone: 'info',
      title: `${plantCount} מקורות צמחיים היום`,
      body: 'שאיפה ל‑6 סוגי צמחים ביום (~30 בשבוע) מגבירה את עושר המיקרוביום. גוון בין ירקות, פירות, קטניות, אגוזים וזרעים.',
    });
  }

  return out;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function countUniquePlants(meals) {
  const set = new Set();
  for (const m of meals) {
    for (const ing of m.ingredients || []) {
      const key = (ing.name || '').trim().toLowerCase();
      if (key) set.add(key);
    }
  }
  return set.size;
}

function gradeFor(score) {
  if (score >= 85) return { letter: 'A', label: 'מצוין', color: '#37B87C' };
  if (score >= 70) return { letter: 'B', label: 'טוב', color: '#7DBB4E' };
  if (score >= 50) return { letter: 'C', label: 'סביר', color: '#E9A23B' };
  if (score >= 30) return { letter: 'D', label: 'נמוך', color: '#E97B3B' };
  return { letter: 'E', label: 'התחלה', color: '#D9534F' };
}

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
const round1 = (n) => Math.round(n * 10) / 10;
