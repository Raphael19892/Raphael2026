// NutriLongevity AI — ingredient analysis, NOVA estimation, added-sugar detection, nutrient density
// and product comparison. Rule-based and transparent: every conclusion lists the matched ingredients.

// Markers of ultra-processing per Monteiro et al. 2019 (industrial ingredients + cosmetic additives).
const UPF_MARKERS = [
  // substances rarely used in kitchens
  ['hydrolysed protein', /hydroly[sz]ed\s+(vegetable\s+)?protein/], ['protein isolate', /protein isolate|soy isolate|whey isolate/],
  ['maltodextrin', /maltodextrin/], ['dextrose', /dextrose/], ['glucose syrup', /glucose(-|\s)?(fructose\s)?syrup/],
  ['fructose syrup / HFCS', /(high[-\s]fructose|fructose)\s+(corn\s+)?syrup|hfcs|isoglucose/], ['invert sugar', /invert(ed)? sugar/],
  ['hydrogenated / interesterified oil', /hydrogenated|interesterified/], ['modified starch', /modified\s+(corn\s+|maize\s+|potato\s+|tapioca\s+)?starch|e14\d\d/],
  ['mechanically separated meat', /mechanically separated/], ['soy protein concentrate', /protein concentrate/],
  // cosmetic additives
  ['flavourings', /\b(natural\s+|artificial\s+)?(flavou?rings?|flavou?r|aroma)s?\b/],
  ['emulsifiers', /emulsifier|mono-?\s*and\s*di-?glycerides|e47[0-9]|e481|e482|polysorbate|e43[2-6]|lecithin|e322/],
  ['thickeners/gums', /carrageenan|e407|carboxymethyl\s*cellulose|cellulose gum|e466|xanthan|e415|guar gum|e412|e410|locust bean/],
  ['colours', /colou?r(s|ing)?\b|e1[0-8]\d\b|caramel colou?r|e150[a-d]?|titanium dioxide/],
  ['non-sugar sweeteners', /aspartame|sucralose|acesulfame|saccharin|steviol|stevia|cyclamate|e95[0-9]|e96[0-9]|sorbitol|maltitol|xylitol|erythritol/],
  ['flavour enhancers', /monosodium glutamate|\bmsg\b|e62[0-9]|e63[0-9]|yeast extract/],
  ['glazing/anti-foaming/bulking agents', /glazing agent|anti-?foaming|bulking agent|polydextrose|e1200|e900/],
];

// Added (free) sugars — WHO definition includes honey, syrups and fruit-juice concentrates.
const ADDED_SUGARS = [
  /\bsugar\b/, /cane sugar|brown sugar|raw sugar|coconut sugar|beet sugar|icing sugar|caster sugar/, /sucrose/, /glucose/, /fructose/, /dextrose/, /maltose/,
  /syrup/, /honey/, /agave/, /molasses|treacle/, /fruit juice concentrate|juice concentrate|concentrated (apple|grape) juice/, /invert/, /malt extract|barley malt/, /date syrup|silan/,
];

const PRESERVATIVES = [/sorbate|e20[0-3]/, /benzoate|e21[0-3]/, /nitrite|nitrate|e25[0-2]/, /sulphite|sulfite|e22[0-8]/, /propionate|e28[0-3]/, /bha|bht|e32[01]/];

export function splitIngredients(text = '') {
  return String(text).toLowerCase()
    .replace(/\([^)]*\)/g, (m) => `, ${m.slice(1, -1)}`) // flatten parenthetical sub-ingredients
    .split(/[,;•·\n]|\band\b(?=\s+[a-z]{3,}\s*[,;])/)
    .map((s) => s.replace(/[\d.]+\s*%/g, '').replace(/[*_:]/g, '').trim())
    .filter((s) => s.length > 1);
}

export function analyzeIngredients(text = '') {
  const lower = String(text).toLowerCase();
  const parts = splitIngredients(text);
  const upfMarkers = [];
  for (const [label, re] of UPF_MARKERS) {
    const hits = parts.filter((p) => re.test(p));
    if (hits.length) upfMarkers.push({ label, matches: [...new Set(hits)].slice(0, 4) });
  }
  const addedSugars = [...new Set(parts.filter((p) => ADDED_SUGARS.some((re) => re.test(p)) && !/sugar[-\s]?free|no added sugar|sugars? \d/.test(p)))];
  const preservatives = [...new Set(parts.filter((p) => PRESERVATIVES.some((re) => re.test(p))))];
  const hasSalt = parts.some((p) => /\bsalt\b|sodium chloride|sea salt/.test(p));
  const hasOil = parts.some((p) => /\boil\b|butter|fat\b/.test(p));
  const n = parts.length;

  let nova; let reason;
  if (!n) { nova = null; reason = 'No ingredient list available.'; }
  else if (upfMarkers.length) { nova = 4; reason = 'Contains industrial ingredients or cosmetic additives that mark ultra-processed foods (NOVA 4).'; }
  else if (n === 1 && /oil|sugar|salt|butter|honey|vinegar|flour/.test(parts[0])) { nova = 2; reason = 'Single culinary ingredient (NOVA 2).'; }
  else if (n === 1) { nova = 1; reason = 'Single whole-food ingredient (NOVA 1).'; }
  else if (addedSugars.length || hasSalt || hasOil || preservatives.length) { nova = 3; reason = 'Food with added salt, sugar, oil or preservatives but no ultra-processing markers (NOVA 3).'; }
  else { nova = 1; reason = 'Only whole-food ingredients detected (NOVA 1).'; }
  return { ingredients: parts, nova, reason, upfMarkers, addedSugars, preservatives, hasSalt, confidence: n ? (n > 3 ? 'moderate' : 'low') : 'none', raw: lower };
}

// Daily reference values used for nutrient-density scoring (FDA 2016 DVs; protein 50 g).
const DV = { protein: 50, fiber: 28, calcium: 1300, iron: 18, potassium: 4700, magnesium: 420, vitC: 90, vitD: 20 };
const MRV = { satFat: 20, addedSugar: 50, sodium: 2300 };

/**
 * NRF-style nutrient density per 100 kcal — an ADAPTED version of the NRF9.3 index
 * (Fulgoni et al. 2009) using the nutrients available here. Descriptive only: it ranks nutrient
 * density, it does not predict health outcomes.
 */
export function nutrientDensity(per100) {
  const kcal = per100?.kcal;
  if (!kcal || kcal < 5) return null;
  const f = 100 / kcal;
  let pos = 0; let used = 0;
  for (const [k, dv] of Object.entries(DV)) {
    if (per100[k] == null) continue;
    pos += Math.min(100, (per100[k] * f / dv) * 100); used++;
  }
  let neg = 0;
  for (const [k, mrv] of Object.entries(MRV)) {
    const v = k === 'addedSugar' ? (per100.addedSugar ?? null) : per100[k];
    if (v == null) continue;
    neg += (v * f / mrv) * 100;
  }
  return { score: Math.round(pos - neg), positive: Math.round(pos), negative: Math.round(neg), nutrientsUsed: used };
}

/** Per-100-kcal profile + rules that produce a plain-language comparison. */
export function compareProducts(a, b) {
  const reasons = [];
  const per100kcal = (p, k) => (p.per100?.kcal ? (p.per100[k] ?? 0) * 100 / p.per100.kcal : null);
  const cmp = (k, label, better = 'higher', unit = 'g', factor = 1.3) => {
    const va = per100kcal(a, k); const vb = per100kcal(b, k);
    if (va == null || vb == null) return;
    if (Math.max(va, vb) < (unit === 'mg' ? 20 : 0.5)) return;
    const hi = va > vb ? 'a' : 'b';
    const ratio = Math.max(va, vb) / Math.max(Math.min(va, vb), 0.01);
    if (ratio < factor) return;
    const winner = better === 'higher' ? hi : (hi === 'a' ? 'b' : 'a');
    reasons.push({ winner, key: k, text: `${label}: ${va.toFixed(unit === 'mg' ? 0 : 1)} vs ${vb.toFixed(unit === 'mg' ? 0 : 1)} ${unit} per 100 kcal` });
  };
  cmp('fiber', 'Fibre', 'higher'); cmp('protein', 'Protein', 'higher');
  cmp('sodium', 'Sodium', 'lower', 'mg'); cmp('satFat', 'Saturated fat', 'lower');
  cmp('addedSugar', 'Added sugar', 'lower'); cmp('sugars', 'Total sugars', 'lower');
  cmp('potassium', 'Potassium', 'higher', 'mg');
  const na = a.nova; const nb = b.nova;
  if (na && nb && na !== nb) reasons.push({ winner: na < nb ? 'a' : 'b', key: 'nova', text: `Processing: NOVA ${na} vs NOVA ${nb}` });
  const da = nutrientDensity(a.per100); const db = nutrientDensity(b.per100);
  if (da && db && Math.abs(da.score - db.score) >= 10) reasons.push({ winner: da.score > db.score ? 'a' : 'b', key: 'density', text: `Nutrient density (adapted NRF): ${da.score} vs ${db.score}` });
  const wa = reasons.filter((r) => r.winner === 'a').length; const wb = reasons.filter((r) => r.winner === 'b').length;
  const verdict = wa === wb ? 'tie' : (wa > wb ? 'a' : 'b');
  return { verdict, reasons, densityA: da, densityB: db };
}

/** Front-of-pack style flags per 100 g (UK FSA "high" thresholds for foods). */
export function highIn(per100 = {}) {
  const flags = [];
  if ((per100.sugars ?? 0) > 22.5) flags.push('sugar');
  if ((per100.satFat ?? 0) > 5) flags.push('satFat');
  if ((per100.fat ?? 0) > 17.5) flags.push('fat');
  if ((per100.sodium ?? 0) > 600) flags.push('salt');
  return flags;
}
