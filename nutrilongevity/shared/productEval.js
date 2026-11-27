// Product evaluation: a transparent 0–100 NUTRITIONAL quality score (processing is assessed separately
// by NOVA and is deliberately not part of this score), advantages/disadvantages with references,
// goal-aware multi-product comparison and better alternatives.
import { assessNova } from './novaAssess.js';

const clamp01 = (x) => Math.max(0, Math.min(1, x));
const r1 = (x) => Math.round(x * 10) / 10;
const val = (p, k) => (p?.[k]?.value ?? p?.[k] ?? null);
const num = (v) => (v == null || Number.isNaN(Number(v)) ? null : Number(v));

/** Flatten a nutrition record whose values may be {value, prov} objects. */
export function per100Values(nutrition) {
  const out = {};
  for (const [k, v] of Object.entries(nutrition?.per100 || {})) out[k] = num(typeof v === 'object' && v !== null ? v.value : v);
  return out;
}

/**
 * Nutritional score (0–100) per 100 kcal. Components with missing data are excluded and the score is
 * rescaled, which lowers its reliability (reported in `limitations`).
 */
export function productScore(nutrition, novaResult) {
  const p = per100Values(nutrition);
  const limitations = [];
  if (p.kcal == null) return { score: null, components: [], limitations: [{ en: 'Energy value not available — the score cannot be calculated.', he: 'ערך האנרגיה אינו זמין — לא ניתן לחשב ציון.' }] };
  if (p.kcal < 20) return { score: null, components: [], limitations: [{ en: 'Very low-energy product (e.g. water, diet drink, spices): a per-calorie nutrition score is not meaningful.', he: 'מוצר דל אנרגיה מאוד (מים, משקה דיאט, תבלינים): ציון תזונתי לפי קלוריות אינו משמעותי.' }] };
  const E = p.kcal; const c = [];
  const add = (key, max, frac, en, he, estimated = false) => c.push({ key, max, points: r1(max * clamp01(frac)), en, he, estimated });

  if (p.fiber != null) { const d = (p.fiber / E) * 100; add('fiber', 20, d / 3, `Fibre ${r1(p.fiber)} g/100 g = ${r1(d)} g per 100 kcal (full points ≥3).`, `סיבים ${r1(p.fiber)} ג׳/100 ג׳ = ${r1(d)} ג׳ ל-100 קק״ל (מלא מ-3).`); }
  else limitations.push({ en: 'Fibre not declared.', he: 'סיבים תזונתיים לא הוצהרו.' });
  if (p.protein != null) { const s = (p.protein * 4) / E; add('protein', 15, (s - 0.03) / (0.2 - 0.03), `Protein ${r1(p.protein)} g/100 g = ${Math.round(s * 100)}% of energy (full ≥20%).`, `חלבון ${r1(p.protein)} ג׳ = ${Math.round(s * 100)}% מהאנרגיה (מלא מ-20%).`); }
  else limitations.push({ en: 'Protein not declared.', he: 'חלבון לא הוצהר.' });
  if (p.satFat != null) { const s = (p.satFat * 9) / E; add('satFat', 15, (0.2 - s) / (0.2 - 0.05), `Saturated fat ${r1(p.satFat)} g/100 g = ${Math.round(s * 100)}% of energy (full ≤5%, zero ≥20%).`, `שומן רווי ${r1(p.satFat)} ג׳ = ${Math.round(s * 100)}% מהאנרגיה.`); }
  else limitations.push({ en: 'Saturated fat not declared.', he: 'שומן רווי לא הוצהר.' });
  if (p.addedSugar != null) { const s = (p.addedSugar * 4) / E; add('sugar', 20, 1 - s / 0.25, `Added sugar ${r1(p.addedSugar)} g/100 g = ${Math.round(s * 100)}% of energy (zero ≥25%).`, `סוכר מוסף ${r1(p.addedSugar)} ג׳ = ${Math.round(s * 100)}% מהאנרגיה.`); }
  else if (p.sugars != null) {
    const s = (p.sugars * 4) / E;
    add('sugar', 20, 1 - s / 0.4, `Total sugars ${r1(p.sugars)} g/100 g = ${Math.round(s * 100)}% of energy. Added sugar not declared, so total sugars are used with a looser threshold (some may be natural fruit/milk sugars).`, `סך סוכרים ${r1(p.sugars)} ג׳ = ${Math.round(s * 100)}% מהאנרגיה. סוכר מוסף לא הוצהר — נעשה שימוש בסך הסוכרים בסף מקל.`, true);
    limitations.push({ en: 'Added sugar not declared; total sugars used instead.', he: 'סוכר מוסף לא הוצהר; נעשה שימוש בסך הסוכרים.' });
  } else limitations.push({ en: 'Sugars not declared.', he: 'סוכרים לא הוצהרו.' });
  if (p.sodium != null) { const d = (p.sodium / E) * 100; add('sodium', 15, (250 - d) / (250 - 50), `Sodium ${Math.round(p.sodium)} mg/100 g = ${Math.round(d)} mg per 100 kcal (full ≤50, zero ≥250).`, `נתרן ${Math.round(p.sodium)} מ״ג = ${Math.round(d)} מ״ג ל-100 קק״ל.`); }
  else limitations.push({ en: 'Sodium/salt not declared.', he: 'נתרן/מלח לא הוצהרו.' });
  const ings = novaResult?.ingredients || [];
  if (ings.length) {
    const first = ings.slice(0, 3);
    const w = { whole: 1, culinary: 0.3, aid: 0.6, fortificant: 0.6, preservative: 0.4, acidity: 0.4, other: 0.4, substance: 0, cosmetic: 0, unknown: 0.4 };
    const q = first.reduce((a, i) => a + (w[i.cls] ?? 0.4), 0) / first.length;
    add('ingredients', 15, q, `Ingredient quality: ${first.map((i) => `“${i.text}” (${i.purpose || 'unidentified'})`).join(', ')} lead the list (whole foods score highest).`, `איכות רכיבים: ${first.map((i) => `״${i.text}״`).join(', ')} בראש הרשימה (מזון מלא מקבל את הניקוד הגבוה).`);
  } else limitations.push({ en: 'No ingredient list: ingredient quality not assessed.', he: 'אין רשימת רכיבים: איכות הרכיבים לא הוערכה.' });

  const max = c.reduce((a, x) => a + x.max, 0);
  if (max < 50) return { score: null, components: c, limitations: [{ en: 'Too little nutrition information for a reliable score.', he: 'מידע תזונתי חלקי מדי לציון אמין.' }, ...limitations] };
  const score = Math.round((c.reduce((a, x) => a + x.points, 0) / max) * 100);
  const reliability = max === 100 && !c.some((x) => x.estimated) ? 'high' : max >= 80 ? 'medium' : 'low';
  return { score, components: c, maxAvailable: max, reliability, limitations };
}

const P = (en, he, refs = []) => ({ en, he, refs });

/** Advantages / disadvantages based on declared values (per 100 g) and ingredients. */
export function prosCons(nutrition, nova, product = {}) {
  const p = per100Values(nutrition);
  const pros = []; const cons = [];
  const liquid = nutrition?.basis === 'per100ml';
  if (p.fiber != null && p.fiber >= 6) pros.push(P(`High in fibre (${r1(p.fiber)} g/100 g).`, `עשיר בסיבים (${r1(p.fiber)} ג׳/100 ג׳).`, ['reynolds2019']));
  else if (p.fiber != null && p.fiber >= 3) pros.push(P(`Source of fibre (${r1(p.fiber)} g/100 g).`, `מקור לסיבים (${r1(p.fiber)} ג׳/100 ג׳).`, ['reynolds2019']));
  if (p.protein != null && p.kcal && (p.protein * 4) / p.kcal >= 0.2) pros.push(P(`High in protein (${r1(p.protein)} g/100 g, ${Math.round((p.protein * 400) / p.kcal)}% of energy).`, `עשיר בחלבון (${r1(p.protein)} ג׳/100 ג׳).`, ['morton2018']));
  const sugarLimit = liquid ? 2.5 : 5;
  if (p.sugars != null && p.sugars <= sugarLimit) pros.push(P(`Low in sugars (${r1(p.sugars)} g/100 ${liquid ? 'ml' : 'g'}).`, `דל סוכרים (${r1(p.sugars)} ג׳).`, ['who2015sugars']));
  if (p.sodium != null && p.sodium <= 120) pros.push(P(`Low in salt (${Math.round(p.sodium)} mg sodium/100 g).`, `דל מלח (${Math.round(p.sodium)} מ״ג נתרן).`, ['he2013']));
  if (p.satFat != null && p.satFat <= 1.5 && (p.fat ?? 0) > 3) pros.push(P('Fat is mostly unsaturated.', 'השומן ברובו בלתי רווי.', ['predimed2018']));
  const ings = nova?.ingredients || [];
  if (ings[0]?.cls === 'whole') pros.push(P(`First ingredient is a whole food (“${ings[0].text}”).`, `הרכיב הראשון הוא מזון מלא (״${ings[0].text}״).`));
  if (ings.length && ings.length <= 4 && ings.every((i) => ['whole', 'culinary', 'aid', 'fortificant'].includes(i.cls))) pros.push(P('Short ingredient list of recognisable foods.', 'רשימת רכיבים קצרה של מזונות מוכרים.'));

  const sugarHigh = liquid ? 11.25 : 22.5;
  if (p.sugars != null && p.sugars > sugarHigh) cons.push(P(`High in sugars (${r1(p.sugars)} g/100 ${liquid ? 'ml' : 'g'}).`, `עתיר סוכרים (${r1(p.sugars)} ג׳).`, ['who2015sugars']));
  else if (p.addedSugar != null && p.addedSugar >= 10) cons.push(P(`${r1(p.addedSugar)} g added sugar per 100 g.`, `${r1(p.addedSugar)} ג׳ סוכר מוסף ל-100 ג׳.`, ['who2015sugars']));
  if (p.satFat != null && p.satFat > (liquid ? 2.5 : 5)) cons.push(P(`High in saturated fat (${r1(p.satFat)} g/100 g).`, `עתיר שומן רווי (${r1(p.satFat)} ג׳).`, ['dga2020']));
  if (p.sodium != null && p.sodium > (liquid ? 300 : 600)) cons.push(P(`High in salt (${Math.round(p.sodium)} mg sodium/100 g ≈ ${r1(p.sodium * 2.5 / 1000)} g salt).`, `עתיר מלח (${Math.round(p.sodium)} מ״ג נתרן ל-100 ג׳).`, ['he2013']));
  if (ings.some((i) => /sweetener|sugar alcohol/.test(i.purpose || ''))) cons.push(P('Contains non-sugar sweeteners (WHO advises against using them for weight control; long-term effects uncertain).', 'מכיל ממתיקים (ה-WHO ממליץ שלא להשתמש בהם לשליטה במשקל; ההשפעות ארוכות הטווח אינן ודאיות).', ['who2015sugars']));
  if (ings.some((i) => /hydrogenated/.test(i.purpose || ''))) cons.push(P('Contains hydrogenated fat (possible trans fat).', 'מכיל שומן מוקשה (ייתכן שומן טראנס).', ['dga2020']));
  if (nova?.group === 4 && !nova.borderline) cons.push(P('Ultra-processed formulation (NOVA 4).', 'פורמולציה אולטרה-מעובדת (NOVA 4).', ['hall2019', 'lane2024']));
  if (/sweetdrink|soft drink|soda|cola|משקה מוגז/.test(`${product.category || ''} ${product.name || ''}`.toLowerCase()) && (p.sugars ?? 0) > 5) cons.push(P('Sugar-sweetened beverage.', 'משקה ממותק.', ['imamura2015']));
  return { pros, cons };
}

// Better alternatives by product type (detected from the declared name/ingredients).
const ALTS = [
  [/cereal|granola|muesli|flakes|דגני בוקר|גרנולה|פתיתי/, { en: 'Plain rolled oats or unsweetened muesli with fresh fruit and nuts.', he: 'שיבולת שועל רגילה או מוזלי ללא סוכר עם פרי טרי ואגוזים.' }],
  [/yog(h)?urt|יוגורט|מעדן/, { en: 'Plain (unsweetened) yogurt or Greek yogurt with fresh fruit.', he: 'יוגורט טבעי ללא סוכר או יוגורט יווני עם פרי טרי.' }],
  [/cola|soda|soft drink|juice|nectar|drink|משקה|מיץ|נקטר|קולה|תרכיז/, { en: 'Water, sparkling water with lemon, or whole fruit instead of juice.', he: 'מים, סודה עם לימון, או פרי שלם במקום מיץ.' }],
  [/bread|bun|roll|toast|pita|לחם|לחמני|פיתה|טוסט/, { en: 'Whole-grain bread whose first ingredient is whole-grain flour and with a short ingredient list.', he: 'לחם מדגן מלא שהרכיב הראשון בו הוא קמח מלא, עם רשימת רכיבים קצרה.' }],
  [/chips|crisps|snack|puff|cracker|ביסלי|במבה|חטיף|קרקר|צ׳יפס|צ'יפס/, { en: 'Unsalted nuts, roasted chickpeas or vegetable sticks with hummus.', he: 'אגוזים לא מלוחים, חומוס קלוי או מקלות ירקות עם חומוס.' }],
  [/spread|nutella|ממרח/, { en: '100% nut butter or tahini (no added sugar or oil).', he: 'חמאת אגוזים 100% או טחינה גולמית (ללא סוכר או שמן מוספים).' }],
  [/sausage|salami|ham|hot dog|nugget|schnitzel|pastrami|נקניק|פסטרמה|שניצל|נאגטס|סלמי/, { en: 'Legumes, eggs, fish or plain chicken breast instead of processed meat.', he: 'קטניות, ביצים, דגים או חזה עוף טבעי במקום בשר מעובד.' }],
  [/(soy|almond|oat|rice) (drink|milk)|משקה (סויה|שקדים|שיבולת)/, { en: 'Unsweetened soy drink fortified with calcium and B12.', he: 'משקה סויה ללא סוכר מועשר בסידן ו-B12.' }],
  [/protein bar|bar\b|חטיף חלבון|חטיף אנרגיה/, { en: 'A handful of nuts with a piece of fruit, or plain yogurt.', he: 'חופן אגוזים עם פרי, או יוגורט טבעי.' }],
  [/chocolate|cookie|biscuit|cake|wafer|candy|sweets|שוקולד|עוגי|ביסקוויט|עוגה|וופל|ממתק/, { en: 'Fresh fruit, dates with nuts, or a small portion of ≥70% dark chocolate.', he: 'פרי טרי, תמרים עם אגוזים, או מנה קטנה של שוקולד מריר ‎70%+.' }],
];
export function alternatives(product = {}, nova) {
  const hay = `${product.name || ''} ${product.category || ''} ${(nova?.ingredients || []).slice(0, 3).map((i) => i.text).join(' ')}`.toLowerCase();
  const out = ALTS.filter(([re]) => re.test(hay)).map(([, a]) => a);
  if (!out.length) out.push({ en: 'A similar product with fewer ingredients, more fibre and less added sugar and salt — compare labels per 100 g.', he: 'מוצר דומה עם פחות רכיבים, יותר סיבים ופחות סוכר ומלח מוספים — השוו תוויות ל-100 ג׳.' });
  return out.slice(0, 3);
}

/** Full evaluation of one extracted product record. */
export function evaluateProduct(rec) {
  const nova = assessNova(rec.ingredientsText, { processingInfo: rec.processingInfo, listComplete: rec.ingredientsComplete });
  const score = productScore(rec.nutrition, nova);
  const pc = prosCons(rec.nutrition, nova, rec.identity || {});
  const good = score.score != null && score.score >= 80 && [1, 2, 3].includes(nova.group);
  return { nova, score, ...pc, alternatives: good ? [] : alternatives(rec.identity || {}, nova), alreadyGood: good };
}

// Goal weights for comparisons (keys = productScore components).
const GOAL_W = {
  heart: { satFat: 1.6, sodium: 1.6, fiber: 1.2 }, metabolic: { sugar: 1.6, fiber: 1.4 }, gut: { fiber: 1.7, ingredients: 1.3 },
  digestion: { fiber: 1.5 }, bodycomp: { protein: 1.7, sugar: 1.2 }, longevity: { fiber: 1.2, ingredients: 1.2 }, chronic: { sodium: 1.2, sugar: 1.2, fiber: 1.2 },
};
export function goalScore(evalResult, goals = []) {
  const comps = evalResult.score.components || [];
  if (!comps.length) return null;
  let pts = 0; let max = 0;
  for (const c of comps) {
    const w = goals.reduce((a, g) => a * (GOAL_W[g]?.[c.key] || 1), 1);
    pts += c.points * w; max += c.max * w;
  }
  return Math.round((pts / max) * 100);
}

/** Compare 2+ evaluated products for this person's goals. */
export function compareMany(entries, goals = []) {
  const rows = entries.map((e, i) => ({ i, name: e.rec.identity?.name || `#${i + 1}`, score: e.eval.score.score, goal: goalScore(e.eval, goals), nova: e.eval.nova.group, conf: e.eval.nova.confidence, v: per100Values(e.rec.nutrition) }));
  const ranked = rows.filter((r) => r.goal != null).sort((a, b) => b.goal - a.goal);
  if (ranked.length < 2) return { rows, best: null, reasons: [], close: false };
  const best = ranked[0]; const second = ranked[1];
  const reasons = [];
  const diff = (k, label, better, unit, min) => {
    const a = best.v[k]; const b = second.v[k];
    if (a == null || b == null) return;
    if (Math.abs(a - b) < min) return;
    const good = better === 'lower' ? a < b : a > b;
    reasons.push({ good, en: `${label}: ${r1(a)} vs ${r1(b)} ${unit} per 100 g`, he: `${label}: ${r1(a)} לעומת ${r1(b)} ${unit} ל-100 ג׳` });
  };
  diff('fiber', 'Fibre', 'higher', 'g', 1); diff('protein', 'Protein', 'higher', 'g', 2); diff('sugars', 'Sugars', 'lower', 'g', 2);
  diff('addedSugar', 'Added sugar', 'lower', 'g', 2); diff('satFat', 'Saturated fat', 'lower', 'g', 1); diff('sodium', 'Sodium', 'lower', 'mg', 60); diff('kcal', 'Energy', 'lower', 'kcal', 40);
  if (best.nova && second.nova && best.nova !== second.nova) reasons.push({ good: best.nova < second.nova, en: `Processing: NOVA ${best.nova} vs NOVA ${second.nova} (assessed separately from nutrition)`, he: `עיבוד: NOVA ${best.nova} לעומת NOVA ${second.nova} (מוערך בנפרד מהתזונה)` });
  return { rows, best, reasons, close: best.goal - second.goal < 6 };
}
