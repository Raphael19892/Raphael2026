// NutriLongevity AI — daily/weekly analysis of what was actually eaten, gap detection and
// realistic improvement suggestions. Indicators are shown individually against reference
// targets; no composite "longevity score" is computed (none is validated).
import { sumItems, indicators, round } from './nutrition.js';

const MICRO_LABEL = {
  potassium: ['Potassium', 'אשלגן'], calcium: ['Calcium', 'סידן'], iron: ['Iron', 'ברזל'], magnesium: ['Magnesium', 'מגנזיום'],
  vitC: ['Vitamin C', 'ויטמין C'], folate: ['Folate', 'חומצה פולית'], vitB12: ['Vitamin B12', 'ויטמין B12'], vitD: ['Vitamin D', 'ויטמין D'],
};

export function groupByDate(logs) {
  const by = {};
  for (const l of logs) (by[l.date] = by[l.date] || []).push(...(l.items || [l.item]).filter(Boolean));
  return by;
}

export function dateRange(endDate, days) {
  const end = new Date(`${endDate}T00:00:00Z`);
  return Array.from({ length: days }, (_, i) => new Date(end.getTime() - (days - 1 - i) * 86400000).toISOString().slice(0, 10));
}

export function dailySeries(logs, endDate, days = 14) {
  const by = groupByDate(logs);
  return dateRange(endDate, days).map((date) => {
    const items = by[date] || [];
    const t = sumItems(items);
    const ind = indicators(items);
    return { date, logged: items.length > 0, totals: t, ind };
  });
}

/**
 * Weekly analysis over the 7 days ending at endDate.
 * Averages are over days with at least one logged item (unlogged days are reported, not assumed zero).
 */
export function analyzeWeek(logs, targets, endDate) {
  const series = dailySeries(logs, endDate, 7);
  const logged = series.filter((d) => d.logged);
  const nDays = logged.length;
  const allItems = Object.entries(groupByDate(logs)).filter(([d]) => series.some((s) => s.date === d)).flatMap(([, it]) => it);
  const totals = sumItems(allItems);
  const ind = indicators(allItems);
  const avg = {};
  for (const k of Object.keys(totals)) avg[k] = nDays ? totals[k] / nDays : 0;
  const perDay = (x) => (nDays ? x / nDays : 0);

  const metrics = {
    kcal: { value: avg.kcal, target: targets.kcal, kind: 'range', tol: 0.1 },
    protein: { value: avg.protein, target: targets.protein, kind: 'min' },
    fiber: { value: avg.fiber, target: targets.fiber, kind: 'min' },
    satFat: { value: avg.satFat, target: targets.satFatMax, kind: 'max' },
    sodium: { value: avg.sodium, target: targets.sodiumMax, kind: 'max' },
    addedSugar: { value: avg.addedSugar, target: targets.addedSugarMax, kind: 'max' },
    fruitVegG: { value: perDay(ind.fruitVegG), target: targets.daily.fruitVegG, kind: 'min' },
    wholeGrainServings: { value: perDay(ind.wholeGrainServings), target: targets.daily.wholeGrainServings, kind: 'min' },
    nutsSeedsG: { value: perDay(ind.nutsSeedsG), target: 20, kind: 'min' },
    oliveOilG: { value: perDay(ind.oliveOilG), target: targets.daily.oliveOilG, kind: 'min' },
    plantCount: { value: ind.plantCount, target: targets.weekly.plants, kind: 'min', weekly: true },
    legumeServings: { value: ind.legumeServings, target: targets.weekly.legumeServings, kind: 'min', weekly: true },
    fermentedServings: { value: ind.fermentedServings, target: 7, kind: 'min', weekly: true },
    upfPct: { value: ind.upfPct, target: 15, kind: 'max' },
  };
  for (const [k, v] of Object.entries(targets.micros)) metrics[k] = { value: avg[k], target: v, kind: 'min', micro: true };
  for (const m of Object.values(metrics)) {
    m.pct = m.target ? (m.value / m.target) * 100 : null;
    m.status = status(m);
  }

  const gaps = []; const excesses = [];
  const add = (arr, key, en, he, refs, boost) => arr.push({ key, en, he, refs, boost });
  if (nDays === 0) return { series, nDays, metrics, gaps, excesses, suggestions: [], boostTags: {}, ind, avg };

  if (metrics.fiber.status === 'low') add(gaps, 'fiber', `Fibre averaged ${round(avg.fiber)} g/day vs a ${targets.fiber} g target. Add a legume portion or swap a refined grain for a whole grain; raise fibre gradually (~5 g/week) with fluids.`, `הסיבים עמדו על ${round(avg.fiber)} ג׳ ביום לעומת יעד של ${targets.fiber} ג׳. הוסיפו מנת קטניות או החליפו דגן מזוקק בדגן מלא; העלו בהדרגה (~5 ג׳ בשבוע) עם שתייה.`, ['reynolds2019'], { legume: 3, wholegrain: 2 });
  if (metrics.protein.status === 'low') add(gaps, 'protein', `Protein averaged ${round(avg.protein)} g/day vs ${targets.protein} g. Distribute ~25–35 g per main meal (legumes, tofu, fish, yogurt, eggs).`, `החלבון עמד על ${round(avg.protein)} ג׳ ביום לעומת ${targets.protein} ג׳. פזרו ~25–35 ג׳ בכל ארוחה עיקרית.`, ['bauer2013', 'jager2017'], { legume: 1, fish: 1, soy: 1, dairy: 1 });
  if (metrics.plantCount.status === 'low') add(gaps, 'plants', `You ate ${ind.plantCount} different plants this week. Easy wins: a mixed-seed topping, a different bean, herbs, a new fruit.`, `אכלת ${ind.plantCount} צמחים שונים השבוע. דרכים קלות: תערובת זרעים, סוג שעועית אחר, עשבי תיבול, פרי חדש.`, ['mcdonald2018'], { seed: 1, berry: 1, leafy: 1 });
  if (metrics.fruitVegG.status === 'low') add(gaps, 'fruitveg', `Fruit & vegetables averaged ${round(metrics.fruitVegG.value)} g/day (target ≥400 g; benefits observed up to ~800 g).`, `פירות וירקות: ${round(metrics.fruitVegG.value)} ג׳ ביום (יעד ≥400 ג׳; תועלת נצפתה עד ~800 ג׳).`, ['aune2017fv'], { fv: 2, leafy: 1 });
  if (metrics.legumeServings.status === 'low') add(gaps, 'legumes', `Only ${round(ind.legumeServings, 1)} legume servings this week (target ≥${targets.weekly.legumeServings}).`, `רק ${round(ind.legumeServings, 1)} מנות קטניות השבוע (יעד ≥${targets.weekly.legumeServings}).`, ['fadnes2022', 'reynolds2019'], { legume: 3 });
  if (metrics.wholeGrainServings.status === 'low') add(gaps, 'wholegrain', `Whole grains averaged ${round(metrics.wholeGrainServings.value, 1)} servings/day (≈3 servings/day is associated with lower risk).`, `דגנים מלאים: ${round(metrics.wholeGrainServings.value, 1)} מנות ביום (≈3 מנות ביום קשורות לסיכון נמוך יותר).`, ['aune2016wg'], { wholegrain: 2 });
  if (metrics.nutsSeedsG.status === 'low') add(gaps, 'nuts', `Nuts & seeds averaged ${round(metrics.nutsSeedsG.value)} g/day; a 28 g handful is associated with lower cardiovascular risk.`, `אגוזים וזרעים: ${round(metrics.nutsSeedsG.value)} ג׳ ביום; חופן של 28 ג׳ קשור לסיכון לבבי נמוך יותר.`, ['aune2016nuts', 'predimed2018'], { nut: 2, seed: 1 });
  if (metrics.oliveOilG.status === 'low') add(gaps, 'oliveoil', 'Olive oil intake was low. Use extra-virgin olive oil as your main added fat instead of butter or margarine.', 'צריכת שמן הזית נמוכה. השתמשו בשמן זית כתית כשומן העיקרי במקום חמאה/מרגרינה.', ['guaschferre2022', 'predimed2018'], { oliveoil: 2 });
  if (metrics.fermentedServings.status === 'low') add(gaps, 'fermented', `${ind.fermentedServings} fermented-food servings this week. Plain yogurt, kefir or unpasteurised sauerkraut/kimchi are options (emerging evidence).`, `${ind.fermentedServings} מנות מזון מותסס השבוע. יוגורט טבעי, קפיר או כרוב כבוש לא מפוסטר הם אפשרויות (ראיות מתפתחות).`, ['wastyk2021'], { fermented: 2 });
  for (const k of Object.keys(targets.micros)) {
    if (metrics[k].pct !== null && metrics[k].pct < 70) {
      const note = k === 'vitB12' ? ' Vitamin B12 is essentially absent from plant foods — vegans need fortified foods or a supplement.' : k === 'vitD' ? ' Vitamin D comes mainly from sunlight; dietary sources are few (oily fish, eggs, fortified foods) — discuss testing/supplementation with a clinician.' : '';
      add(gaps, k, `${MICRO_LABEL[k][0]} averaged ${round(metrics[k].pct)}% of the reference intake.${note}`, `${MICRO_LABEL[k][1]} עמד על ${round(metrics[k].pct)}% מצריכת הייחוס.${note ? ' ' + (k === 'vitB12' ? 'ויטמין B12 כמעט אינו קיים במזון צמחי — טבעונים זקוקים למזון מועשר או תוסף.' : 'ויטמין D מגיע בעיקר מהשמש; יש להתייעץ על בדיקה/תוסף.') : ''}`, ['iom2005'], {});
    }
  }
  if (metrics.sodium.status === 'high') add(excesses, 'sodium', `Sodium averaged ${round(avg.sodium)} mg/day (limit ${targets.sodiumMax} mg). Biggest sources: bread, cheese, olives, brined/fermented foods and packaged products.`, `נתרן: ${round(avg.sodium)} מ״ג ביום (גבול ${targets.sodiumMax}). מקורות עיקריים: לחם, גבינות, זיתים, כבושים ומוצרים ארוזים.`, ['he2013', 'sacks2001'], {});
  if (metrics.satFat.status === 'high') add(excesses, 'satFat', `Saturated fat averaged ${round(avg.satFat)} g/day (limit ${targets.satFatMax} g, <10% of energy).`, `שומן רווי: ${round(avg.satFat)} ג׳ ביום (גבול ${targets.satFatMax} ג׳).`, ['dga2020'], { oliveoil: 1, nut: 1 });
  if (metrics.addedSugar.status === 'high') add(excesses, 'addedSugar', `Added sugar averaged ${round(avg.addedSugar)} g/day (limit ${targets.addedSugarMax} g).`, `סוכר מוסף: ${round(avg.addedSugar)} ג׳ ביום (גבול ${targets.addedSugarMax} ג׳).`, ['who2015sugars'], { fruit: 1 });
  if (metrics.upfPct.status === 'high') add(excesses, 'upf', `${round(ind.upfPct)}% of energy came from ultra-processed foods (NOVA 4).`, `${round(ind.upfPct)}% מהאנרגיה הגיעו ממזון אולטרה-מעובד (NOVA 4).`, ['hall2019', 'lane2024'], {});
  if (metrics.kcal.status === 'high') add(excesses, 'kcal', `Energy averaged ${round(avg.kcal)} kcal/day, above the ${targets.kcal} kcal target.`, `אנרגיה: ${round(avg.kcal)} קק״ל ביום, מעל היעד של ${targets.kcal}.`, ['mifflin1990'], {});
  if (metrics.kcal.status === 'low' && avg.kcal < targets.kcal * 0.75) add(gaps, 'kcal', `Energy averaged ${round(avg.kcal)} kcal/day — well below target. If this is not incomplete logging, very low intake can compromise nutrient adequacy.`, `אנרגיה: ${round(avg.kcal)} קק״ל ביום — הרבה מתחת ליעד. אם אין זה רישום חסר, צריכה נמוכה מאוד עלולה לפגוע בהלימה התזונתית.`, ['iom2005'], {});

  const boostTags = {};
  for (const g of [...gaps, ...excesses]) for (const [t, w] of Object.entries(g.boost || {})) boostTags[t] = (boostTags[t] || 0) + w;
  const suggestions = [...excesses, ...gaps].slice(0, 6);
  return { series, nDays, metrics, gaps, excesses, suggestions, boostTags, ind, avg };
}

function status(m) {
  if (m.value == null || m.target == null) return 'na';
  if (m.kind === 'min') return m.value >= m.target ? 'good' : m.value >= m.target * 0.75 ? 'near' : 'low';
  if (m.kind === 'max') return m.value <= m.target ? 'good' : m.value <= m.target * 1.15 ? 'near' : 'high';
  if (m.kind === 'range') {
    const lo = m.target * (1 - m.tol); const hi = m.target * (1 + m.tol);
    return m.value < lo ? 'low' : m.value > hi ? 'high' : 'good';
  }
  return 'na';
}
