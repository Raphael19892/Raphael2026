import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bmrMifflin, computeTargets, safetyScreen } from '../shared/engine.js';
import { FOODS, FOOD_MAP, NUTRIENT_KEYS } from '../shared/foods.js';
import { itemNutrients, sumItems, indicators, dayTotals } from '../shared/nutrition.js';
import { generatePlan, swapIngredient, swapOptions, shoppingList, isFoodOk } from '../shared/planner.js';
import { analyzeIngredients, compareProducts, nutrientDensity } from '../shared/nova.js';
import { analyzeWeek } from '../shared/analysis.js';
import { REFERENCES, REF_MAP, FRAMEWORKS, GUT_TOPICS } from '../shared/evidence.js';
import { TEMPLATES } from '../shared/templates.js';

const base = { age: 45, sex: 'female', heightCm: 165, weightKg: 68, activity: 'moderate', goal: 'longevity', mealsPerDay: 4, diet: 'omnivore', allergies: [], conditions: [] };

test('Mifflin–St Jeor matches hand calculation', () => {
  // 10*68 + 6.25*165 - 5*45 - 161 = 1325.25
  assert.equal(Math.round(bmrMifflin(base)), 1325);
  assert.equal(Math.round(bmrMifflin({ ...base, sex: 'male' })), 1491);
});

test('targets: TDEE, protein rules, fibre floor and limits', () => {
  const t = computeTargets(base);
  assert.equal(t.tdee, Math.round(1325.25 * 1.55));
  assert.equal(t.protein, 68); // 1.0 g/kg
  assert.ok(t.fiber >= 25);
  assert.equal(t.fiber, Math.round(Math.max(25, (t.kcal / 1000) * 14)));
  assert.equal(t.sodiumMax, 2000);
  assert.equal(computeTargets({ ...base, age: 70 }).proteinPerKg, 1.2);
  assert.equal(computeTargets({ ...base, strengthTraining: 3 }).proteinPerKg, 1.6);
  assert.equal(computeTargets({ ...base, conditions: ['ckd'], strengthTraining: 3 }).proteinPerKg, 0.8);
  assert.equal(computeTargets({ ...base, conditions: ['hypertension'] }).sodiumMax, 1500);
});

test('safety: no deficit for eating-disorder history, underweight or pregnancy', () => {
  for (const p of [{ ...base, goal: 'lose', conditions: ['eating_disorder'] }, { ...base, goal: 'lose', weightKg: 48 }, { ...base, goal: 'lose', conditions: ['pregnancy'] }]) {
    const t = computeTargets(p);
    assert.notEqual(t.goalApplied, 'lose');
  }
  const lose = computeTargets({ ...base, goal: 'lose', activity: 'sedentary', weightKg: 50, heightCm: 150 });
  assert.ok(lose.kcal >= 1200, 'calorie floor');
  assert.ok(safetyScreen({ ...base, conditions: ['warfarin'] }).some((f) => f.code === 'vitk'));
  assert.ok(safetyScreen({ ...base, age: 16 }).some((f) => f.level === 'stop'));
});

test('food table is complete and plausible (Atwater check)', () => {
  for (const f of FOODS) {
    for (const k of NUTRIENT_KEYS) assert.equal(typeof f.per100[k], 'number', `${f.id}.${k}`);
    const p = f.per100;
    assert.ok(p.satFat <= p.fat + 0.01, `${f.id} sat ≤ fat`);
    assert.ok(p.fiber <= p.carbs + 0.5 || p.carbs === 0, `${f.id} fibre ≤ carbs`);
    // USDA uses food-specific Atwater factors; cocoa's are much lower than the general 4/4/9 factors.
    if (p.kcal > 40 && f.id !== 'cocoa') {
      const est = 4 * p.protein + 4 * (p.carbs - p.fiber) + 2 * p.fiber + 9 * p.fat;
      assert.ok(Math.abs(est - p.kcal) / p.kcal < 0.2, `${f.id}: Atwater ${est.toFixed(0)} vs ${p.kcal}`);
    }
    assert.ok(f.name.en && f.name.he, `${f.id} names`);
  }
  for (const t of TEMPLATES) for (const i of t.items) assert.ok(FOOD_MAP[i.foodId], `${t.id} uses unknown ${i.foodId}`);
});

test('nutrients are computed from grams', () => {
  const n = itemNutrients({ foodId: 'lentils', grams: 200 });
  assert.equal(n.kcal, 232);
  assert.equal(Number(n.fiber.toFixed(1)), 15.8);
  const s = sumItems([{ foodId: 'lentils', grams: 100 }, { foodId: 'evoo', grams: 10 }]);
  assert.equal(Number(s.kcal.toFixed(1)), 116 + 88.4);
});

test('planner respects diet, allergies and conditions and lands near energy target', () => {
  const profiles = [
    base,
    { ...base, diet: 'vegan', allergies: ['tree_nuts', 'soy'] },
    { ...base, diet: 'vegetarian', allergies: ['gluten', 'milk'], conditions: ['maoi'] },
    { ...base, mealsPerDay: 3, sex: 'male', weightKg: 90, heightCm: 182, strengthTraining: 3 },
    { ...base, mealsPerDay: 6, conditions: ['celiac'] },
  ];
  for (const p of profiles) {
    const t = computeTargets(p);
    const plan = generatePlan(p, t, { seed: 123, startDate: '2026-01-05' });
    assert.equal(plan.days.length, 7);
    for (const d of plan.days) {
      const tot = dayTotals(d);
      assert.ok(Math.abs(tot.kcal - t.kcal) / t.kcal < 0.15, `${p.diet} kcal ${tot.kcal} vs ${t.kcal}`);
      assert.ok(tot.protein >= t.protein * 0.85, `protein ${tot.protein} vs ${t.protein}`);
      for (const m of d.meals) for (const it of m.items) assert.ok(isFoodOk(it.foodId, p), `${it.foodId} not allowed for ${JSON.stringify(p.allergies)} ${p.diet}`);
    }
  }
});

test('planner is deterministic for a seed and boost tags shift selections', () => {
  const t = computeTargets(base);
  const a = generatePlan(base, t, { seed: 9, startDate: '2026-01-05' });
  const b = generatePlan(base, t, { seed: 9, startDate: '2026-01-05' });
  assert.deepEqual(a.days.map((d) => d.meals.map((m) => m.templateId)), b.days.map((d) => d.meals.map((m) => m.templateId)));
  const boosted = generatePlan(base, t, { seed: 9, startDate: '2026-01-05', boostTags: { fermented: 6 } });
  const count = (p) => indicators(p.days.flatMap((d) => d.meals.flatMap((m) => m.items))).fermentedServings;
  assert.ok(count(boosted) >= count(a));
});

test('ingredient swap is iso-caloric and options respect profile', () => {
  const meal = { slot: 'lunch', items: [{ foodId: 'lentils', grams: 150 }] };
  const sw = swapIngredient(meal, 0, 'chickpeas', 'kcal');
  assert.ok(Math.abs(sumItems(sw.items).kcal - sumItems(meal.items).kcal) < 6);
  assert.ok(!swapOptions('salmon', { diet: 'vegan' }).includes('chicken'));
  assert.ok(!swapOptions('almonds', { allergies: ['tree_nuts'] }).some((id) => FOOD_MAP[id].allergens.includes('tree_nuts')));
});

test('shopping list aggregates and converts cooked grains to dry weight', () => {
  const plan = { days: [{ meals: [{ items: [{ foodId: 'lentils', grams: 200 }, { foodId: 'tomato', grams: 100 }] }] }, { meals: [{ items: [{ foodId: 'lentils', grams: 100 }] }] }] };
  const g = shoppingList(plan);
  const l = g.legumes.find((e) => e.foodId === 'lentils');
  assert.equal(l.grams, 300);
  assert.equal(l.purchaseGrams, 126);
});

test('NOVA analyser detects ultra-processing markers and added sugars', () => {
  const upf = analyzeIngredients('Whole grain oats (60%), sugar, palm oil, glucose syrup, emulsifier (soy lecithin), salt, natural flavouring');
  assert.equal(upf.nova, 4);
  assert.ok(upf.upfMarkers.some((m) => m.label === 'emulsifiers'));
  assert.ok(upf.addedSugars.includes('sugar'));
  assert.equal(analyzeIngredients('chickpeas, water, salt').nova, 3);
  assert.equal(analyzeIngredients('rolled oats').nova, 1);
  assert.equal(analyzeIngredients('extra virgin olive oil').nova, 2);
  assert.equal(analyzeIngredients('').nova, null);
});

test('product comparison prefers the less processed, higher-fibre food', () => {
  const r = compareProducts({ ...FOOD_MAP.brown_rice, per100: FOOD_MAP.brown_rice.per100 }, { ...FOOD_MAP.white_rice });
  assert.equal(r.verdict, 'a');
  assert.ok(r.reasons.some((x) => x.key === 'fiber'));
  assert.ok(nutrientDensity(FOOD_MAP.spinach.per100).score > nutrientDensity(FOOD_MAP.dark_chocolate.per100).score);
});

test('weekly analysis finds gaps and excesses and ignores unlogged days', () => {
  const t = computeTargets(base);
  const logs = [{ date: '2026-01-10', items: [{ foodId: 'white_rice', grams: 600 }, { foodId: 'feta', grams: 250 }, { foodId: 'honey', grams: 80 }] }];
  const a = analyzeWeek(logs, t, '2026-01-11');
  assert.equal(a.nDays, 1);
  assert.ok(a.gaps.some((g) => g.key === 'fiber'));
  assert.ok(a.excesses.some((g) => g.key === 'satFat'));
  assert.ok(a.excesses.some((g) => g.key === 'addedSugar'));
  assert.ok(a.boostTags.legume > 0);
  assert.equal(analyzeWeek([], t, '2026-01-11').nDays, 0);
});

test('evidence library is internally consistent', () => {
  const ids = new Set();
  for (const r of REFERENCES) {
    assert.ok(!ids.has(r.id)); ids.add(r.id);
    assert.ok(r.doi || r.url, `${r.id} has a source link`);
    assert.ok(['causal', 'association', 'mixed', 'modelling', 'consensus', 'mechanistic'].includes(r.inference));
    for (const k of ['title', 'journal', 'year', 'design', 'findings', 'strengths', 'limitations']) assert.ok(r[k], `${r.id}.${k}`);
  }
  for (const f of FRAMEWORKS) for (const id of f.refs) assert.ok(REF_MAP[id], `framework ref ${id}`);
  for (const g of GUT_TOPICS) for (const id of g.refs) assert.ok(REF_MAP[id], `gut ref ${id}`);
});
