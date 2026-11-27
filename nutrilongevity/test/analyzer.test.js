import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseMeal } from '../shared/mealParser.js';
import { analyzeMeal, scoreMeal } from '../shared/mealScore.js';
import { normalizeAiMeal } from '../shared/assistant.js';
import { ALIASES } from '../shared/aliases.js';
import { FOOD_MAP } from '../shared/foods.js';

const ids = (r) => r.items.map((i) => i.foodId);

test('aliases cover every food and point to real foods', () => {
  for (const id of Object.keys(ALIASES)) assert.ok(FOOD_MAP[id], id);
  for (const id of Object.keys(FOOD_MAP)) assert.ok(ALIASES[id]?.length, `no alias for ${id}`);
});

test('parses the specification examples (English)', () => {
  assert.deepEqual(ids(parseMeal('I ate yogurt with oats, chia seeds and kiwi.')), ['yogurt_plain', 'oats', 'chia', 'kiwi']);
  const bread = parseMeal('I ate two slices of whole wheat bread with avocado and eggs.');
  assert.deepEqual(ids(bread), ['ww_bread', 'avocado', 'eggs']);
  assert.equal(bread.items[0].grams, 64);
  assert.equal(bread.items[0].quantity, 'stated');
  assert.equal(bread.items[2].grams, 100); // plural "eggs" → 2
  assert.deepEqual(ids(parseMeal('I ate pizza and drank Coca-Cola.')), ['pizza', 'cola']);
  const pancake = parseMeal('I ate a protein pancake with banana and peanut butter.');
  assert.ok(ids(pancake).includes('banana') && ids(pancake).includes('peanut_butter'));
  assert.ok(pancake.unrecognized.some((u) => u.includes('pancake')), 'unknown dish reported');
});

test('parses Hebrew with prefixes, number words and units', () => {
  const r = parseMeal('אכלתי שתי פרוסות לחם מלא עם אבוקדו וחביתה משתי ביצים');
  assert.deepEqual(ids(r).slice(0, 3), ['ww_bread', 'avocado', 'eggs']);
  assert.equal(r.items[2].grams, 100);
  assert.equal(r.items[2].cooking, 'fried');
  assert.ok(ids(r).includes('canola_oil'), 'frying oil added');
  const r2 = parseMeal('150 גרם חזה עוף צלוי, כף שמן זית');
  assert.equal(r2.items.find((i) => i.foodId === 'chicken').grams, 150);
  assert.equal(r2.items.find((i) => i.foodId === 'evoo').grams, 14);
});

test('explicit grams and fractions', () => {
  const r = parseMeal('200g greek yogurt, 1 tbsp honey, half a cup of blueberries');
  assert.equal(r.items.find((i) => i.foodId === 'greek_yogurt').grams, 200);
  assert.equal(r.items.find((i) => i.foodId === 'honey').grams, 15);
  assert.equal(r.items.find((i) => i.foodId === 'blueberries').grams, 74);
});

test('meal score ranks whole-food meals above ultra-processed ones and is portion-independent', () => {
  const good = scoreMeal(parseMeal('lentil stew with brown rice, salad with olive oil').items).score;
  const ok = scoreMeal(parseMeal('yogurt with oats, chia seeds and kiwi').items).score;
  const bad = scoreMeal(parseMeal('2 slices of pizza and a can of coke').items).score;
  assert.ok(good > ok && ok > bad, `${good} > ${ok} > ${bad}`);
  assert.ok(bad < 40);
  const one = scoreMeal([{ foodId: 'lentils', grams: 150 }, { foodId: 'tomato', grams: 100 }]).score;
  const two = scoreMeal([{ foodId: 'lentils', grams: 300 }, { foodId: 'tomato', grams: 200 }]).score;
  assert.equal(one, two);
  assert.equal(scoreMeal([{ foodId: 'water', grams: 300 }]).score, null);
  const s = scoreMeal(parseMeal('pizza and cola').items);
  assert.equal(s.components.reduce((a, c) => a + c.max, 0), 100);
});

test('evaluation flags real issues with references and suggestions improve the score', () => {
  const a = analyzeMeal(parseMeal('2 hot dogs in white buns with fries and a coke').items, {});
  const badKeys = a.evaluation.bad.flatMap((b) => b.refs);
  assert.ok(badKeys.includes('bouvard2015') && badKeys.includes('imamura2015') && badKeys.includes('hall2019'));
  assert.ok(a.evaluation.missing.length > 0);
  assert.ok(a.suggestions.length > 0);
  for (const s of a.suggestions) assert.ok(s.after > s.before);
  const veg = analyzeMeal(parseMeal('2 hot dogs with fries').items, { diet: 'vegan' });
  for (const s of veg.suggestions) for (const it of s.items.filter((x) => !parseMeal('2 hot dogs with fries').items.some((o) => o.foodId === x.foodId))) assert.ok(!FOOD_MAP[it.foodId].animal, 'suggestions respect diet');
});

test('AI output is normalised; unknown foods become labelled estimates', () => {
  const r = normalizeAiMeal({ mealName: 'Schnitzel plate', questions: ['How big was the schnitzel?'], items: [
    { name: 'schnitzel', foodId: null, grams: 150, quantity: 'estimated', cooking: 'fried', nova: 3, per100: { kcal: 260, protein: 20, carbs: 12, fat: 15, satFat: 2.5, fiber: 0.8, sugars: 1, addedSugar: 0, sodium: 450 } },
    { name: 'mashed potatoes', foodId: 'potato', grams: 200, quantity: 'estimated', cooking: null, nova: null, per100: null },
    { name: 'bogus', foodId: 'not_a_food', grams: 50, quantity: 'stated', cooking: null, nova: null, per100: null },
  ] }, 'schnitzel with potatoes');
  assert.equal(r.mode, 'ai');
  assert.equal(r.items.length, 2);
  assert.equal(r.items[0].product.status, 'ai-estimate');
  assert.equal(r.items[1].foodId, 'potato');
  assert.equal(normalizeAiMeal({ items: [] }, 'lentils').mode, 'rules');
});

test('unknown processing is never counted as NOVA 4 (regression)', () => {
  // An AI-recognised dish without an ingredient list, even if the model "guessed" NOVA 4
  const parsed = normalizeAiMeal({ mealName: 'Schnitzel', questions: [], items: [
    { name: 'schnitzel', foodId: null, grams: 150, quantity: 'estimated', cooking: 'fried', nova: 4, per100: { kcal: 260, protein: 20, carbs: 12, fat: 15, satFat: 2.5, fiber: 0.8, sugars: 1, addedSugar: 0, sodium: 450 } },
  ] }, 'schnitzel');
  assert.equal(parsed.items[0].product.nova, null, 'AI-guessed NOVA is discarded');
  const a = analyzeMeal(parsed.items, {});
  const proc = a.components.find((c) => c.key === 'processing');
  assert.equal(proc.points, 7.5, 'neutral, not zero');
  assert.match(proc.en, /unknown/);
  assert.ok(!a.evaluation.bad.some((b) => /ultra-processed/i.test(b.en)), 'no ultra-processed claim');
  assert.notEqual(a.evaluation.frameworks.nova.fit, 'low');
});

test('generic foods whose processing depends on the product (bread, dark chocolate, plant milks) get no NOVA 4 verdict', () => {
  for (const id of ['white_bread', 'dark_chocolate', 'almond_milk', 'soy_yogurt', 'whey', 'croissant', 'pizza', 'fries', 'cookies', 'yogurt_fruit', 'chips', 'ice_cream', 'hamburger_bun', 'deli_turkey']) {
    assert.equal(FOOD_MAP[id].nova, null, `${id} should not carry a fixed NOVA`);
    assert.deepEqual(FOOD_MAP[id].novaRange, [3, 4], id);
  }
  // Foods that are ultra-processed by definition keep their typical NOVA 4.
  for (const id of ['cola', 'diet_cola', 'choc_spread', 'hot_dog']) assert.equal(FOOD_MAP[id].nova, 4, id);
  const r = analyzeMeal(parseMeal('2 פרוסות לחם עם חמאה ושוקולד מריר').items, {});
  const text = JSON.stringify(r.evaluation);
  assert.ok(!/אולטרה-מעובדים \(|ultra-processed \(/.test(text), 'bread/chocolate must not be named as ultra-processed');
  assert.ok(r.ind.novaKcal.unknown > 0, 'their energy counts as processing unknown');
});
