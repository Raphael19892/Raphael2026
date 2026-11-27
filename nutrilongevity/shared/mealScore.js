// NutriLongevity AI — meal evaluation.
// A transparent, rule-based Meal Quality Score (0–100) built from eight components, each shown
// with its value, points and the reason. It describes diet quality against current guidelines;
// it is NOT a validated medical measurement and does not predict longevity.
import { FOOD_MAP } from './foods.js';
import { sumItems, indicators, resolveFood } from './nutrition.js';
import { isFoodOk } from './planner.js';

const clamp01 = (x) => Math.max(0, Math.min(1, x));
const r1 = (x) => Math.round(x * 10) / 10;
const DV2 = { potassium: 4700, calcium: 1300, iron: 18, magnesium: 420, vitC: 90, folate: 400 }; // FDA daily values

function tagsOf(it) { return resolveFood(it)?.tags || []; }
function has(items, tag) { return items.some((it) => tagsOf(it).includes(tag) && it.grams >= 5); }

/** Score a list of items. Returns null for (near) zero-energy intakes like water or black coffee. */
export function scoreMeal(items) {
  const n = sumItems(items);
  const ind = indicators(items);
  if (n.kcal < 40) return { score: null, components: [], totals: n, ind, reason: 'too_few_kcal' };
  const E = n.kcal;
  const comp = [];
  const add = (key, max, frac, value, en, he) => comp.push({ key, max, points: r1(max * clamp01(frac)), value, en, he });

  // 1 Fibre density (reference: 14 g per 1000 kcal)
  const fd = (n.fiber / E) * 1000;
  add('fiber', 15, (fd - 4) / (20 - 4), r1(n.fiber),
    `${r1(n.fiber)} g fibre = ${r1(fd)} g per 1000 kcal (reference 14 g/1000 kcal; full points at 20).`,
    `${r1(n.fiber)} ג׳ סיבים = ${r1(fd)} ג׳ ל-1000 קק״ל (ייחוס 14 ג׳; ניקוד מלא ב-20).`);

  // 2 Protein share of energy and source quality
  const ps = (n.protein * 4) / E;
  const procMeat = has(items, 'processedmeat');
  add('protein', 10, (ps - 0.05) / (0.18 - 0.05) - (procMeat ? 0.3 : 0), r1(n.protein),
    `${r1(n.protein)} g protein (${Math.round(ps * 100)}% of energy; full points at ≥18%)${procMeat ? '; reduced because part comes from processed meat' : ''}.`,
    `${r1(n.protein)} ג׳ חלבון (${Math.round(ps * 100)}% מהאנרגיה; ניקוד מלא ב-18%)${procMeat ? '; הופחת כי חלק מבשר מעובד' : ''}.`);

  // 3 Fat quality: saturated fat share of energy (neutral when the meal has almost no fat)
  const sp = (n.satFat * 9) / E;
  const fatShare = (n.fat * 9) / E;
  add('fatQuality', 15, fatShare < 0.05 ? 0.5 : (0.15 - sp) / (0.15 - 0.06), r1(n.satFat),
    fatShare < 0.05 ? 'Almost no fat in this meal: neutral score.' : `Saturated fat ${r1(n.satFat)} g = ${Math.round(sp * 100)}% of energy (full points ≤6%, zero ≥15%; guideline <10%).`,
    fatShare < 0.05 ? 'כמעט אין שומן בארוחה: ניקוד ניטרלי.' : `שומן רווי ${r1(n.satFat)} ג׳ = ${Math.round(sp * 100)}% מהאנרגיה (מלא עד 6%, אפס מ-15%; המלצה <10%).`);

  // 4 Added / free sugar share of energy
  const as = (n.addedSugar * 4) / E;
  add('addedSugar', 15, 1 - as / 0.10, r1(n.addedSugar),
    `Added/free sugar ${r1(n.addedSugar)} g = ${Math.round(as * 100)}% of energy (zero points at ≥10%, the WHO limit).`,
    `סוכר מוסף/חופשי ${r1(n.addedSugar)} ג׳ = ${Math.round(as * 100)}% מהאנרגיה (אפס ב-10%, גבול ה-WHO).`);

  // 5 Sodium density
  const nd = (n.sodium / E) * 1000;
  add('sodium', 10, (1600 - nd) / (1600 - 600), Math.round(n.sodium),
    `${Math.round(n.sodium)} mg sodium = ${Math.round(nd)} mg per 1000 kcal (full ≤600, zero ≥1600; the daily limit equals ~1000 mg/1000 kcal).`,
    `${Math.round(n.sodium)} מ״ג נתרן = ${Math.round(nd)} מ״ג ל-1000 קק״ל (מלא עד 600, אפס מ-1600).`);

  // 6 Processing (NOVA energy shares). Only foods with a known processing level count; unknown is never treated as ultra-processed.
  const known = E - ind.novaKcal.unknown;
  if (known / E < 0.5) {
    add('processing', 15, 0.5, null,
      `Processing level unknown for ${Math.round((ind.novaKcal.unknown / E) * 100)}% of the energy (no ingredient list) — neutral score, not counted as ultra-processed.`,
      `רמת העיבוד אינה ידועה ל-${Math.round((ind.novaKcal.unknown / E) * 100)}% מהאנרגיה (אין רשימת רכיבים) — ניקוד ניטרלי, לא נספר כאולטרה-מעובד.`);
  } else {
    const n4 = ind.novaKcal[4] / known; const n3 = ind.novaKcal[3] / known;
    add('processing', 15, 1 - n4 - 0.3 * n3, Math.round(n4 * 100),
      `${Math.round(n4 * 100)}% of the energy from foods that are typically ultra-processed (NOVA 4) and ${Math.round(n3 * 100)}% typically processed (NOVA 3) — typical levels for these food types, not checked against product labels${ind.novaKcal.unknown ? '; foods with unknown processing are excluded' : ''}.`,
      `${Math.round(n4 * 100)}% מהאנרגיה ממזונות שבדרך כלל אולטרה-מעובדים (NOVA 4) ו-${Math.round(n3 * 100)}% בדרך כלל מעובדים (NOVA 3) — רמות טיפוסיות לסוגי המזון, לא נבדקו מול תוויות${ind.novaKcal.unknown ? '; מזונות שרמת עיבודם אינה ידועה לא נכללו' : ''}.`);
  }

  // 7 Plant diversity
  const pc = ind.plantCount;
  add('plants', 10, [0, 0.3, 0.5, 0.7, 0.85, 1][Math.min(pc, 5)], pc,
    `${pc} different plant food${pc === 1 ? '' : 's'} (full points at 5+).`, `${pc} מזונות צמחיים שונים (ניקוד מלא ב-5 ומעלה).`);

  // 8 Micronutrient density (K, Ca, Fe, Mg, vit C, folate per 1000 kcal vs half the daily value)
  const micro = Object.entries(DV2).map(([k, dv]) => clamp01(((n[k] || 0) / E * 1000) / (dv / 2)));
  const mAvg = micro.reduce((a, b) => a + b, 0) / micro.length;
  add('micros', 10, mAvg, Math.round(mAvg * 100),
    `Potassium, calcium, iron, magnesium, vitamin C and folate supplied at ${Math.round(mAvg * 100)}% of a nutrient-dense reference per 1000 kcal.`,
    `אשלגן, סידן, ברזל, מגנזיום, ויטמין C וחומצה פולית: ${Math.round(mAvg * 100)}% מרמת ייחוס עשירה ל-1000 קק״ל.`);

  const score = Math.round(comp.reduce((a, c) => a + c.points, 0));
  return { score, components: comp, totals: n, ind };
}

export function band(score) {
  if (score == null) return 'na';
  return score >= 75 ? 'excellent' : score >= 60 ? 'good' : score >= 45 ? 'fair' : 'poor';
}

const L = (en, he, refs = []) => ({ en, he, refs });

/** Health evaluation: what is beneficial, less beneficial, missing — with references. */
export function evaluateMeal(items, scored = scoreMeal(items)) {
  const { totals: n, ind } = scored;
  const good = []; const bad = []; const missing = [];
  if (n.kcal < 40) return { good, bad, missing, frameworks: {} };
  const E = n.kcal;
  const fd = (n.fiber / E) * 1000;
  const names = (tag) => items.filter((it) => tagsOf(it).includes(tag) && it.grams >= 5).map((it) => resolveFood(it).name).map((x) => x.en);
  const namesHe = (tag) => items.filter((it) => tagsOf(it).includes(tag) && it.grams >= 5).map((it) => resolveFood(it).name.he);

  if (fd >= 14) good.push(L(`Good fibre: ${r1(n.fiber)} g (${r1(fd)} g/1000 kcal).`, `סיבים טובים: ${r1(n.fiber)} ג׳.`, ['reynolds2019']));
  if (has(items, 'legume')) good.push(L(`Contains legumes (${names('legume').join(', ')}) — fibre, plant protein and resistant starch.`, `מכיל קטניות (${namesHe('legume').join(', ')}) — סיבים, חלבון צמחי ועמילן עמיד.`, ['reynolds2019', 'fadnes2022']));
  if (has(items, 'wholegrain')) good.push(L(`Whole grains (${names('wholegrain').join(', ')}).`, `דגנים מלאים (${namesHe('wholegrain').join(', ')}).`, ['aune2016wg']));
  if (has(items, 'nut') || has(items, 'seed')) good.push(L('Nuts or seeds — unsaturated fat, fibre and minerals.', 'אגוזים או זרעים — שומן בלתי רווי, סיבים ומינרלים.', ['aune2016nuts']));
  if (has(items, 'oliveoil')) good.push(L('Extra-virgin olive oil as the fat source.', 'שמן זית כתית כמקור השומן.', ['predimed2018', 'guaschferre2022']));
  if (has(items, 'oilyfish')) good.push(L('Oily fish — long-chain omega-3 fats.', 'דג שמן — אומגה 3 ארוכת שרשרת.', ['dinu2018']));
  if (has(items, 'fermented')) good.push(L('Fermented food (emerging evidence for gut-microbiome benefits).', 'מזון מותסס (ראיות מתפתחות לתועלת למיקרוביום).', ['wastyk2021']));
  if (ind.polyphenolServings > 0) good.push(L('Polyphenol-rich foods (e.g. berries, cocoa, tea, olives, nuts).', 'מזונות עשירים בפוליפנולים.', ['perezjimenez2010']));
  if (ind.fruitVegG >= 150) good.push(L(`${Math.round(ind.fruitVegG)} g fruit and vegetables.`, `${Math.round(ind.fruitVegG)} ג׳ פירות וירקות.`, ['aune2017fv']));
  if (ind.plantCount >= 4) good.push(L(`${ind.plantCount} different plant foods — good diversity.`, `${ind.plantCount} מזונות צמחיים שונים — מגוון טוב.`, ['mcdonald2018']));
  if (n.protein >= 20) good.push(L(`${Math.round(n.protein)} g protein supports muscle maintenance.`, `${Math.round(n.protein)} ג׳ חלבון תומכים בשמירת שריר.`, ['bauer2013', 'jager2017']));

  const knownE = E - ind.novaKcal.unknown;
  const n4 = knownE > 0 ? ind.novaKcal[4] / knownE : 0;
  const upfNames = items.filter((it) => resolveFood(it)?.nova === 4);
  if ((knownE / E >= 0.5 && n4 >= 0.3) || ind.novaKcal[4] / E >= 0.3) bad.push(L(`Foods that are usually ultra-processed (${upfNames.map((it) => resolveFood(it).name.en).join(', ')}) — typical for this food type; check the actual product's ingredient list to confirm.`, `מזונות שבדרך כלל אולטרה-מעובדים (${upfNames.map((it) => resolveFood(it).name.he).join(', ')}) — טיפוסי לסוג המזון; כדי לאשר יש לבדוק את רשימת הרכיבים של המוצר בפועל.`, ['hall2019', 'lane2024']));
  if (has(items, 'sweetdrink')) bad.push(L('Sugar-sweetened drink or juice: sugar without fibre; regular intake is associated with higher type 2 diabetes risk.', 'משקה ממותק או מיץ: סוכר ללא סיבים; צריכה קבועה קשורה לסיכון מוגבר לסוכרת סוג 2.', ['imamura2015', 'who2015sugars']));
  else if ((n.addedSugar * 4) / E >= 0.1 || n.addedSugar >= 15) bad.push(L(`${r1(n.addedSugar)} g added sugar.`, `${r1(n.addedSugar)} ג׳ סוכר מוסף.`, ['who2015sugars']));
  if ((n.satFat * 9) / E > 0.1 && n.satFat >= 5) bad.push(L(`Saturated fat ${r1(n.satFat)} g (${Math.round((n.satFat * 900) / E)}% of energy; guideline <10%).`, `שומן רווי ${r1(n.satFat)} ג׳.`, ['dga2020']));
  if (n.sodium >= 800 || (n.sodium / E) * 1000 > 1200) bad.push(L(`${Math.round(n.sodium)} mg sodium (daily limit ~2000 mg).`, `${Math.round(n.sodium)} מ״ג נתרן (גבול יומי ~2000).`, ['he2013']));
  if (has(items, 'processedmeat')) bad.push(L('Processed meat (IARC Group 1 for colorectal cancer).', 'בשר מעובד (IARC קבוצה 1 לסרטן המעי הגס).', ['bouvard2015']));
  else if (has(items, 'redmeat')) bad.push(L('Red meat — keep to moderate amounts.', 'בשר אדום — במתינות.', ['bouvard2015']));
  if (has(items, 'refinedgrain') && !has(items, 'wholegrain')) bad.push(L('Refined grains instead of whole grains.', 'דגנים מזוקקים במקום מלאים.', ['reynolds2019']));

  const main = E >= 300;
  if (ind.fruitVegG < 50) missing.push(L('Vegetables or fruit.', 'ירקות או פירות.', ['aune2017fv']));
  if (main && n.fiber < 6) missing.push(L('A fibre source (legumes, whole grains, vegetables, seeds).', 'מקור סיבים (קטניות, דגנים מלאים, ירקות, זרעים).', ['reynolds2019']));
  if (main && n.protein < 15) missing.push(L('A protein source (~20–30 g per main meal).', 'מקור חלבון (~20–30 ג׳ בארוחה עיקרית).', ['bauer2013']));
  if (main && fatShareLow(n) && !has(items, 'nut') && !has(items, 'oliveoil')) missing.push(L('A healthy fat (olive oil, nuts, avocado, tahini).', 'שומן בריא (שמן זית, אגוזים, אבוקדו, טחינה).', ['predimed2018']));

  return { good, bad, missing, frameworks: frameworkFit(items, scored) };
}
const fatShareLow = (n) => (n.fat * 9) / Math.max(n.kcal, 1) < 0.15;

function frameworkFit(items, { totals: n, ind }) {
  const E = n.kcal;
  const fv = ind.fruitVegG >= 100; const fiberOk = (n.fiber / E) * 1000 >= 12;
  const plantProt = has(items, 'legume') || has(items, 'nut') || has(items, 'seed');
  const healthyFat = has(items, 'oliveoil') || has(items, 'nut') || items.some((i) => ['avocado', 'tahini', 'olives'].includes(i.foodId));
  const meat = has(items, 'redmeat') || has(items, 'processedmeat');
  const knownE = E - ind.novaKcal.unknown; const upf = knownE / E >= 0.5 && ind.novaKcal[4] / knownE >= 0.3;
  const sugar = (n.addedSugar * 4) / E >= 0.1;
  const lowSod = (n.sodium / E) * 1000 <= 1000;
  const lowSat = (n.satFat * 9) / E <= 0.1;
  const rate = (pos, neg) => (neg >= 2 || pos <= 1 ? 'low' : pos >= 3 && neg === 0 ? 'high' : 'partial');
  const polys = ind.polyphenolServings;
  return {
    med: { fit: rate([fv, fiberOk, healthyFat, plantProt || has(items, 'fish')].filter(Boolean).length, [meat, upf, sugar].filter(Boolean).length), refs: ['predimed2018', 'dinu2018'] },
    greenmed: { fit: rate([polys >= 1, plantProt, fv, items.some((i) => ['green_tea', 'walnuts'].includes(i.foodId))].filter(Boolean).length, [meat, upf].filter(Boolean).length), refs: ['tsaban2021'] },
    dash: { fit: rate([fv, lowSod, lowSat, plantProt || has(items, 'dairy')].filter(Boolean).length, [!lowSod, sugar].filter(Boolean).length), refs: ['appel1997', 'sacks2001'] },
    nova: { fit: knownE / E < 0.5 ? 'unknown' : upf ? 'low' : ind.novaKcal[4] / knownE > 0.1 ? 'partial' : 'high', share4: knownE > 0 ? Math.round((ind.novaKcal[4] / knownE) * 100) : null, typical: true, refs: ['monteiro2019'] },
    gut: { fit: rate([fiberOk, ind.plantCount >= 3, ind.prebioticServings > 0, ind.fermentedServings > 0 || ind.rsServings > 0].filter(Boolean).length, [upf && !fiberOk].filter(Boolean).length), refs: ['makki2018', 'wastyk2021'] },
    cardio: { fit: rate([fiberOk, lowSat, lowSod, fv].filter(Boolean).length, [!lowSat, !lowSod, sugar].filter(Boolean).length), refs: ['reynolds2019', 'he2013'] },
  };
}

// ── Improvement suggestions with before/after deltas ─────────────────────
const idx = (items, ids) => items.findIndex((i) => ids.includes(i.foodId));
const SWAPS = [
  ['white_bread', 'ww_bread'], ['yogurt_plain', 'greek_yogurt'], ['pita_white', 'pita_ww'], ['hamburger_bun', 'ww_bread'], ['white_rice', 'brown_rice'], ['white_pasta', 'ww_pasta'],
  ['yogurt_fruit', 'greek_yogurt'], ['butter', 'evoo'], ['cola', 'water'], ['orange_juice', 'orange'], ['choc_spread', 'peanut_butter'],
  ['jam', 'strawberries'], ['fries', 'potato'], ['chips', 'almonds'], ['hot_dog', 'chickpeas'], ['deli_turkey', 'eggs'], ['granola', 'oats'],
  ['cookies', 'dark_chocolate'], ['ice_cream', 'greek_yogurt'], ['canola_oil', 'evoo'], ['croissant', 'ww_bread'], ['cheese_yellow', 'cottage'],
];
const SWAP_G = { cola: 330, orange_juice: 130, chips: 28, cookies: 15, ice_cream: 150, jam: 60, choc_spread: 15, granola: 40 };

/**
 * Candidate improvements, each applied to a copy of the meal and re-scored.
 * Returns up to `max` suggestions with positive score gain, filtered by the person's diet/allergies.
 */
export function suggestImprovements(items, profile = {}, max = 4) {
  const base = scoreMeal(items);
  if (base.score == null) return [];
  const n = base.totals; const ind = base.ind;
  const ok = (id) => isFoodOk(id, profile);
  const cands = [];
  const push = (key, newItems, en, he) => { if (newItems) cands.push({ key, items: newItems, en, he }); };
  const nameEn = (id) => FOOD_MAP[id].name.en.toLowerCase(); const nameHe = (id) => FOOD_MAP[id].name.he;

  for (const [from, to] of SWAPS) {
    const i = idx(items, [from]);
    if (i < 0 || !ok(to)) continue;
    const g = SWAP_G[from] ?? items[i].grams;
    const next = items.map((x, j) => (j === i ? { foodId: to, grams: to === 'water' ? items[i].grams : Math.round(Math.min(items[i].grams, g)) } : x));
    push(`swap_${from}`, next, `Swap ${nameEn(from)} for ${nameEn(to)}.`, `להחליף ${nameHe(from)} ב${nameHe(to)}.`);
  }
  const isBreakfasty = items.some((i) => ['oats', 'greek_yogurt', 'yogurt_plain', 'kefir', 'granola', 'soy_yogurt', 'cottage'].includes(i.foodId));
  if (isBreakfasty && !has(items, 'berry')) {
    const b = ['blueberries', 'raspberries', 'strawberries'].find(ok);
    if (b) push('add_berries', [...items, { foodId: b, grams: 80 }], `Add 80 g ${nameEn(b)} (more plant diversity and polyphenols).`, `להוסיף 80 ג׳ ${nameHe(b)} (מגוון צמחי ופוליפנולים).`);
  }
  if (isBreakfasty && !has(items, 'seed') && ok('chia')) push('add_chia', [...items, { foodId: 'chia', grams: 10 }], 'Add 1 tbsp chia seeds (+3.4 g fibre).', 'להוסיף כף זרעי צ׳יה (+3.4 ג׳ סיבים).');
  if (ind.fruitVegG < 100 && !isBreakfasty) push('add_salad', [...items, { foodId: 'tomato', grams: 100 }, { foodId: 'cucumber', grams: 100 }, ...(ok('evoo') ? [{ foodId: 'evoo', grams: 5 }] : [])], 'Add a tomato–cucumber salad with a little olive oil.', 'להוסיף סלט עגבניות ומלפפונים עם מעט שמן זית.');
  if (ind.fruitVegG < 100 && isBreakfasty && ok('kiwi')) push('add_fruit', [...items, { foodId: 'kiwi', grams: 70 }], 'Add a kiwifruit.', 'להוסיף קיווי.');
  if (n.kcal >= 300 && (n.fiber / n.kcal) * 1000 < 12 && !isBreakfasty) {
    const l = ['chickpeas', 'lentils', 'white_beans'].find(ok);
    if (l) push('add_legume', [...items, { foodId: l, grams: 80 }], `Add 80 g ${nameEn(l)}.`, `להוסיף 80 ג׳ ${nameHe(l)}.`);
  }
  if (!has(items, 'nut') && !has(items, 'seed') && n.kcal >= 200) {
    const nut = ['walnuts', 'almonds', 'pumpkin_seeds'].find(ok);
    if (nut) push('add_nuts', [...items, { foodId: nut, grams: 15 }], `Add 15 g ${nameEn(nut)}.`, `להוסיף 15 ג׳ ${nameHe(nut)}.`);
  }
  // Halve the saltiest high-sodium item.
  if (n.sodium > 800) {
    const salty = items.map((it, i) => ({ i, na: sumItems([it]).sodium })).sort((a, b) => b.na - a.na)[0];
    const it = items[salty.i];
    if (salty.na > 300) push('less_salt', items.map((x, j) => (j === salty.i ? { ...x, grams: Math.round(x.grams / 2) } : x)), `Halve the ${(resolveFood(it).name.en).toLowerCase()} (main sodium source).`, `לחצות את כמות ה${resolveFood(it).name.he} (מקור הנתרן העיקרי).`);
  }

  const out = cands.map((c) => {
    const after = scoreMeal(c.items);
    const d = (k) => after.totals[k] - n[k];
    return { ...c, before: base.score, after: after.score, gain: (after.score ?? 0) - base.score, delta: { kcal: d('kcal'), fiber: d('fiber'), protein: d('protein'), satFat: d('satFat'), addedSugar: d('addedSugar'), sodium: d('sodium'), polyphenols: d('polyphenols'), plants: after.ind.plantCount - ind.plantCount } };
  }).filter((c) => c.gain > 0).sort((a, b) => b.gain - a.gain);
  const seen = new Set();
  return out.filter((c) => { const k = c.key.split('_')[0] + c.key.split('_')[1]; if (seen.has(k)) return false; seen.add(k); return true; }).slice(0, max);
}

/** One-call analysis used by the analyzer, the diary and the assistant. */
export function analyzeMeal(items, profile = {}) {
  const scored = scoreMeal(items);
  return { ...scored, band: band(scored.score), evaluation: evaluateMeal(items, scored), suggestions: suggestImprovements(items, profile) };
}
