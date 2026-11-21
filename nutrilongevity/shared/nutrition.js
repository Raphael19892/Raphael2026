// NutriLongevity AI — nutrient calculation from ingredient quantities.
// Every number is computed as grams × (value per 100 g) / 100 from the food table or a product snapshot.
import { FOOD_MAP, NUTRIENT_KEYS } from './foods.js';

export const ALL_KEYS = [...NUTRIENT_KEYS, 'addedSugar'];

export function zero() {
  const z = {}; ALL_KEYS.forEach((k) => { z[k] = 0; });
  z.polyphenols = 0; z.polyCoverageG = 0; z.grams = 0;
  return z;
}

/** Resolve an item ({foodId, grams} or {product, grams}) to a food-like record. */
export function resolveFood(item) {
  if (item.product) return item.product;
  return FOOD_MAP[item.foodId] || null;
}

export function itemNutrients(item) {
  const f = resolveFood(item);
  const out = zero();
  if (!f) return out;
  const g = Number(item.grams) || 0;
  const r = g / 100;
  for (const k of ALL_KEYS) {
    const v = f.per100?.[k];
    out[k] = v == null || Number.isNaN(v) ? 0 : v * r;
  }
  if (f.poly != null) { out.polyphenols = f.poly * r; out.polyCoverageG = g; }
  out.grams = g;
  return out;
}

export function add(a, b) {
  const o = { ...a };
  for (const k of Object.keys(b)) o[k] = (o[k] || 0) + (b[k] || 0);
  return o;
}

export function sumItems(items = []) {
  return items.reduce((acc, it) => add(acc, itemNutrients(it)), zero());
}

export function mealTotals(meal) { return sumItems(meal.items); }

export function dayTotals(day) {
  return (day.meals || []).reduce((acc, m) => add(acc, mealTotals(m)), zero());
}

/** Which data sources contributed to these items — used to label estimates vs reference values. */
export function provenance(items = []) {
  const s = {};
  for (const it of items) {
    const f = resolveFood(it);
    if (!f) continue;
    const key = f.status || 'usda-transcribed';
    s[key] = (s[key] || 0) + (Number(it.grams) || 0);
  }
  return s;
}

/**
 * Longevity / gut indicators for a list of consumed items (any period).
 * Returns grams by category, servings, plant set, NOVA energy distribution.
 */
export function indicators(items = []) {
  const ind = {
    fruitVegG: 0, legumeG: 0, legumeServings: 0, wholeGrainServings: 0, refinedGrainG: 0,
    nutsSeedsG: 0, oliveOilG: 0, fermentedServings: 0, fishServings: 0, oilyFishServings: 0,
    prebioticServings: 0, rsServings: 0, polyphenolServings: 0, leafyG: 0, cruciferG: 0, berryG: 0,
    plants: new Set(), fiberSources: new Set(), novaKcal: { 1: 0, 2: 0, 3: 0, 4: 0 }, kcal: 0,
  };
  for (const it of items) {
    const f = resolveFood(it);
    if (!f) continue;
    const g = Number(it.grams) || 0;
    const tags = f.tags || [];
    const kcal = ((f.per100?.kcal || 0) * g) / 100;
    ind.kcal += kcal;
    const nova = f.nova || 4;
    ind.novaKcal[nova] = (ind.novaKcal[nova] || 0) + kcal;
    if (tags.includes('fv')) ind.fruitVegG += g;
    if (tags.includes('legume')) { ind.legumeG += g; if (g >= 15) ind.legumeServings += g / 90; }
    if (tags.includes('wholegrain')) ind.wholeGrainServings += g / (f.wgServing || 90);
    if (tags.includes('refinedgrain')) ind.refinedGrainG += g;
    if (tags.includes('nut') || tags.includes('seed')) ind.nutsSeedsG += g;
    if (tags.includes('oliveoil')) ind.oliveOilG += g;
    if (tags.includes('fermented') && g >= 15) ind.fermentedServings += 1;
    if (tags.includes('fish')) ind.fishServings += g / 100;
    if (tags.includes('oilyfish')) ind.oilyFishServings += g / 100;
    if (tags.includes('prebiotic') && g >= 3) ind.prebioticServings += 1;
    if (tags.includes('rs') && g >= 40) ind.rsServings += 1;
    if (tags.includes('polyphenol') && g >= 5) ind.polyphenolServings += 1;
    if (tags.includes('leafy')) ind.leafyG += g;
    if (tags.includes('crucifer')) ind.cruciferG += g;
    if (tags.includes('berry')) ind.berryG += g;
    if (f.plant && g >= 3) ind.plants.add(f.plant);
    if ((f.per100?.fiber || 0) * g / 100 >= 1) ind.fiberSources.add(f.plant || f.id);
  }
  const upfPct = ind.kcal > 0 ? (ind.novaKcal[4] / ind.kcal) * 100 : 0;
  return { ...ind, plants: [...ind.plants], plantCount: ind.plants.size, fiberSources: [...ind.fiberSources], upfPct };
}

export function round(x, dp = 0) { const m = 10 ** dp; return Math.round((x || 0) * m) / m; }

export function roundGrams(g) {
  if (g < 10) return Math.max(1, Math.round(g));
  if (g < 50) return Math.round(g / 2) * 2;
  return Math.round(g / 5) * 5;
}
