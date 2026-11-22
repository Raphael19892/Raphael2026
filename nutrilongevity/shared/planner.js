// NutriLongevity AI — meal-plan generation, portion scaling, substitutions and shopping lists.
import { FOODS, FOOD_MAP, foodIsAllowed } from './foods.js';
import { TEMPLATES, TEMPLATE_MAP } from './templates.js';
import { conditionFoodRules } from './engine.js';
import { sumItems, roundGrams, dayTotals } from './nutrition.js';

export function rng(seed) {
  let a = (Number(seed) >>> 0) || 1;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const SLOT_SPLITS = {
  3: [['breakfast', 0.30], ['lunch', 0.37], ['dinner', 0.33]],
  4: [['breakfast', 0.25], ['lunch', 0.32], ['dinner', 0.30], ['snack', 0.13]],
  5: [['breakfast', 0.22], ['snack', 0.10], ['lunch', 0.29], ['snack', 0.10], ['dinner', 0.29]],
  6: [['breakfast', 0.20], ['snack', 0.09], ['lunch', 0.27], ['snack', 0.09], ['dinner', 0.26], ['snack', 0.09]],
};

const CONDIMENTS = new Set(['lemon_juice', 'garlic', 'parsley', 'cocoa', 'green_tea', 'coffee']);

// Cooked → dry purchase factors (approximate yields) for shopping lists.
const DRY_FACTOR = {
  brown_rice: 0.37, white_rice: 0.36, quinoa: 0.36, bulgur: 0.4, barley: 0.36, buckwheat: 0.4, ww_pasta: 0.45,
  lentils: 0.42, chickpeas: 0.45, black_beans: 0.45, white_beans: 0.45, kidney_beans: 0.45,
};

/** Effective profile used for filtering foods (merges medical conditions into allergy rules). */
export function filterProfile(profile = {}) {
  const allergies = new Set(profile.allergies || []);
  if ((profile.conditions || []).includes('celiac')) allergies.add('gluten');
  return { ...profile, allergies: [...allergies] };
}

export function isFoodOk(foodId, profile) {
  const f = FOOD_MAP[foodId];
  if (!f) return false;
  const fp = filterProfile(profile);
  if (!foodIsAllowed(f, fp)) return false;
  const { exclude } = conditionFoodRules(profile.conditions || []);
  return !exclude.has(foodId);
}

// Foods kept in the database for logging real meals but never proposed by the planner.
const NOT_PLANNED = new Set(['water', 'sugar', 'butter', 'fries', 'chips', 'canola_oil']);
export function planFriendly(f) {
  return f.nova !== 4 && !NOT_PLANNED.has(f.id) && !f.tags.some((t) => ['addedsugar', 'processedmeat', 'sweetdrink', 'redmeat'].includes(t));
}

/** Alternatives for an ingredient: same substitution group, allowed for this person. */
export function swapOptions(foodId, profile = {}) {
  const f = FOOD_MAP[foodId];
  if (!f) return [];
  const groupMates = FOODS.filter((x) => x.id !== foodId && x.swap && x.swap === f.swap);
  // Broaden a few groups so every ingredient has useful alternatives.
  const related = { protein: ['legume', 'egg'], legume: ['protein'], berry: ['fruit'], fruit: ['berry'], nut: ['seed'], seed: ['nut'], ferment_dairy: ['cheese'], cheese: ['ferment_dairy'], veg: ['leafy'], leafy: ['veg'], starch: ['grain'], grain: ['starch', 'bread'], bread: ['grain'], spread: ['nut'] };
  const extra = FOODS.filter((x) => x.id !== foodId && (related[f.swap] || []).includes(x.swap));
  return [...groupMates, ...extra].filter((x) => planFriendly(x) && isFoodOk(x.id, profile)).map((x) => x.id);
}

/** Replace disallowed ingredients with allowed ones from the same group; null if the meal no longer works. */
export function adaptTemplate(t, profile) {
  const items = [];
  const adaptations = [];
  let lostKcal = 0;
  const baseKcal = sumItems(t.items).kcal || 1;
  for (const it of t.items) {
    if (isFoodOk(it.foodId, profile)) { items.push({ ...it }); continue; }
    const opts = swapOptions(it.foodId, profile).filter((id) => FOOD_MAP[id].swap === FOOD_MAP[it.foodId].swap);
    const pick = opts.sort((a, b) => FOOD_MAP[a].cost - FOOD_MAP[b].cost)[0];
    if (pick) {
      const kcalOld = (FOOD_MAP[it.foodId].per100.kcal * it.grams) / 100;
      const g = FOOD_MAP[pick].per100.kcal > 5 ? (kcalOld / FOOD_MAP[pick].per100.kcal) * 100 : it.grams;
      items.push({ foodId: pick, grams: roundGrams(Math.min(g, it.grams * 2.5)) });
      adaptations.push({ from: it.foodId, to: pick });
    } else {
      lostKcal += (FOOD_MAP[it.foodId].per100.kcal * it.grams) / 100;
      adaptations.push({ from: it.foodId, to: null });
    }
  }
  if (lostKcal / baseKcal > 0.4 || items.length < 2) return null;
  return { ...t, items, adaptations };
}

/** Scale a meal to a target energy, keeping condiments roughly constant. */
export function scaleMealTo(meal, targetKcal, clamp = [0.5, 2.2]) {
  const kcal = sumItems(meal.items).kcal || 1;
  const factor = Math.min(clamp[1], Math.max(clamp[0], targetKcal / kcal));
  return scaleMealBy(meal, factor, targetKcal);
}

export function scaleMealBy(meal, factor, targetKcal = meal.targetKcal) {
  return {
    ...meal, targetKcal,
    items: meal.items.map((it) => {
      const f = CONDIMENTS.has(it.foodId) ? Math.sqrt(factor) : factor;
      return { ...it, grams: roundGrams(it.grams * f) };
    }),
  };
}

function plantsOf(items) { return items.map((i) => FOOD_MAP[i.foodId]?.plant).filter(Boolean); }

function templateScore(t, ctx) {
  const totals = sumItems(t.items);
  const pDensity = totals.kcal ? (totals.protein * 4) / totals.kcal : 0;
  let s = 0;
  const newPlants = new Set(plantsOf(t.items).filter((p) => !ctx.weekPlants.has(p))).size;
  s += 2.5 * newPlants;
  const pr = pDensity / Math.max(ctx.proteinRatio, 0.08);
  s += 8 * Math.min(pr, 1.1) - 5 * Math.max(0, pr - 1.5);
  // Fibre: reward up to the per-meal share of ~1.4× target, then penalise (very high jumps cause GI upset).
  const scaledFiber = totals.kcal ? (totals.fiber * ctx.slotKcal) / totals.kcal : 0;
  const fiberBudget = ctx.fiberTarget * 1.4 * ctx.slotFrac;
  s += 3 * Math.min(scaledFiber / Math.max(fiberBudget, 1), 1);
  s -= 1.0 * Math.max(0, scaledFiber - fiberBudget);
  s -= 5 * (t.adaptations?.length || 0);
  for (const [tag, w] of Object.entries(ctx.boostTags || {})) {
    const hits = t.items.filter((i) => FOOD_MAP[i.foodId]?.tags.includes(tag)).length;
    s += w * hits;
  }
  for (const st of t.style) if (ctx.frameworks?.includes(st)) s += 2;
  const used = ctx.usage[t.id] || 0;
  s -= 6 * used;
  if (ctx.recent.has(t.id)) s -= 12;
  if (ctx.budget === 'low') s -= 3 * Math.max(0, t.items.reduce((a, i) => a + FOOD_MAP[i.foodId].cost, 0) / t.items.length - 1.8);
  if (ctx.maxMinutes && t.minutes > ctx.maxMinutes) s -= 6;
  if (ctx.favorites?.has(t.id)) s += 3;
  s += ctx.rand() * 4;
  return s;
}

function mealFromTemplate(t, slot, targetKcal) {
  const base = {
    id: `${t.id}-${Math.random().toString(36).slice(2, 8)}`, slot, templateId: t.id, name: t.name, emoji: t.emoji,
    hue: t.hue, prep: t.prep, minutes: t.minutes, items: t.items.map((i) => ({ ...i })),
    adaptations: t.adaptations || [],
  };
  return scaleMealTo(base, targetKcal);
}

export function candidatesFor(slot, profile) {
  return TEMPLATES.filter((t) => t.slot === slot).map((t) => adaptTemplate(t, profile)).filter(Boolean);
}

function isoDate(d) { return d.toISOString().slice(0, 10); }

/**
 * Generate a plan.
 * opts: { seed, startDate (YYYY-MM-DD), days (default 7), boostTags {tag: weight}, favorites [templateId] }
 */
export function generatePlan(profile, targets, opts = {}) {
  const seed = opts.seed ?? Math.floor(Math.random() * 1e9);
  const rand = rng(seed);
  const days = opts.days || 7;
  const start = opts.startDate ? new Date(`${opts.startDate}T00:00:00Z`) : new Date(`${isoDate(new Date())}T00:00:00Z`);
  const split = SLOT_SPLITS[profile.mealsPerDay] || SLOT_SPLITS[4];
  const ctx = {
    weekPlants: new Set(), usage: {}, recent: new Set(), rand,
    proteinRatio: (targets.protein * 4) / targets.kcal, fiberTarget: targets.fiber, boostTags: opts.boostTags || {},
    frameworks: profile.frameworks || ['med', 'greenmed'], budget: profile.budget,
    maxMinutes: profile.cookingTime ? Number(profile.cookingTime) : null,
    favorites: new Set(opts.favorites || []),
  };
  const cands = {};
  const plan = { seed, startDate: isoDate(start), createdAt: new Date().toISOString(), days: [] };
  const recentQueue = [];
  for (let d = 0; d < days; d++) {
    const date = new Date(start.getTime() + d * 86400000);
    const meals = [];
    const usedToday = new Set();
    for (const [slot, frac] of split) {
      cands[slot] = cands[slot] || candidatesFor(slot, profile);
      const pool = cands[slot].filter((t) => !usedToday.has(t.id));
      if (!pool.length) continue;
      ctx.slotKcal = targets.kcal * frac; ctx.slotFrac = frac;
      const best = pool.map((t) => [templateScore(t, ctx), t]).sort((a, b) => b[0] - a[0])[0][1];
      usedToday.add(best.id);
      ctx.usage[best.id] = (ctx.usage[best.id] || 0) + 1;
      plantsOf(best.items).forEach((p) => ctx.weekPlants.add(p));
      meals.push(mealFromTemplate(best, slot, targets.kcal * frac));
    }
    // Protein balancing: nudge protein-dense meals up and others down within ±12% when needed.
    let day = { date: isoDate(date), meals };
    day = balanceProtein(day, targets);
    plan.days.push(day);
    recentQueue.push([...usedToday]);
    if (recentQueue.length > 2) recentQueue.shift();
    ctx.recent = new Set(recentQueue.flat());
  }
  return plan;
}

export function balanceProtein(day, targets) {
  const t = dayTotals(day);
  const gap = targets.protein - t.protein;
  if (Math.abs(gap) < targets.protein * 0.08) return day;
  const dens = day.meals.map((m) => { const s = sumItems(m.items); return s.kcal ? (s.protein * 4) / s.kcal : 0; });
  const avg = dens.reduce((a, b) => a + b, 0) / (dens.length || 1);
  const meals = day.meals.map((m, i) => {
    const up = gap > 0 ? dens[i] > avg : dens[i] < avg;
    return scaleMealBy(m, up ? 1.12 : 0.92);
  });
  return { ...day, meals };
}

/** Replace a meal with a different template for the same slot, matched to the same energy target. */
export function alternativeMeal(meal, profile, seed = Date.now(), excludeIds = []) {
  const rand = rng(seed);
  const pool = candidatesFor(meal.slot, profile).filter((t) => t.id !== meal.templateId && !excludeIds.includes(t.id));
  if (!pool.length) return meal;
  const pick = pool[Math.floor(rand() * pool.length)];
  const target = meal.targetKcal || sumItems(meal.items).kcal;
  return mealFromTemplate(pick, meal.slot, target);
}

/** Swap one ingredient. mode 'kcal' keeps energy equal (bounded); 'grams' keeps weight. */
export function swapIngredient(meal, index, newFoodId, mode = 'kcal') {
  const old = meal.items[index];
  const fo = FOOD_MAP[old.foodId]; const fn = FOOD_MAP[newFoodId];
  if (!fn) return meal;
  let grams = old.grams;
  if (mode === 'kcal' && fo && fn.per100.kcal > 5 && fo.per100.kcal > 5) {
    grams = (old.grams * fo.per100.kcal) / fn.per100.kcal;
    grams = Math.min(grams, old.grams * 3);
  }
  const items = meal.items.slice();
  items[index] = { foodId: newFoodId, grams: roundGrams(grams) };
  return { ...meal, items, edited: true };
}

export function setItemGrams(meal, index, grams) {
  const items = meal.items.slice();
  items[index] = { ...items[index], grams: Math.max(0, Math.round(Number(grams) || 0)) };
  return { ...meal, items, edited: true };
}

/** Aggregate a plan into a shopping list grouped by food group. */
export function shoppingList(plan, dayIndexes = null) {
  const totals = {};
  plan.days.forEach((d, i) => {
    if (dayIndexes && !dayIndexes.includes(i)) return;
    for (const m of d.meals) for (const it of m.items) {
      if (!it.foodId) continue;
      totals[it.foodId] = (totals[it.foodId] || 0) + it.grams;
    }
  });
  const groups = {};
  for (const [id, g] of Object.entries(totals)) {
    const f = FOOD_MAP[id];
    const dry = DRY_FACTOR[id];
    const entry = { foodId: id, grams: Math.round(g), purchaseGrams: dry ? Math.round(g * dry) : Math.round(g), dry: !!dry, units: f.unit ? Math.ceil(g / f.unit[1]) : null, unitName: f.unit?.[0] };
    (groups[f.group] = groups[f.group] || []).push(entry);
  }
  return groups;
}

export { TEMPLATE_MAP };
