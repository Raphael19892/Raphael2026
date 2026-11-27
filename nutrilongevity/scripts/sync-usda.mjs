// Verifies the transcribed food table against USDA FoodData Central (SR Legacy) and writes a report.
// Usage: FDC_API_KEY=... npm run sync-usda   (get a free key at https://fdc.nal.usda.gov/api-key-signup)
// For each food it searches SR Legacy for the exact description stored in `usda`, compares every
// nutrient and prints differences > 5 %. With --write it saves data/usda-verified.json with the FDC
// values and IDs. Apply corrections to shared/foods.js and set status: 'usda-verified' and fdcId on
// each verified food (the table is shared by server and browser, so it is updated at source).
import fs from 'node:fs';
import { FOODS, NUTRIENT_KEYS } from '../shared/foods.js';

const KEY = process.env.FDC_API_KEY;
if (!KEY) { console.error('Set FDC_API_KEY (free from https://fdc.nal.usda.gov/api-key-signup).'); process.exit(2); }
const IDS = { 1008: 'kcal', 1003: 'protein', 1005: 'carbs', 1004: 'fat', 1258: 'satFat', 1079: 'fiber', 2000: 'sugars', 1093: 'sodium', 1092: 'potassium', 1087: 'calcium', 1089: 'iron', 1090: 'magnesium', 1162: 'vitC', 1177: 'folate', 1178: 'vitB12', 1114: 'vitD' };
const out = {}; let diffs = 0;
for (const f of FOODS.filter((x) => x.usda)) {
  const url = `https://api.nal.usda.gov/fdc/v1/foods/search?api_key=${KEY}&dataType=SR%20Legacy&pageSize=5&query=${encodeURIComponent(`"${f.usda}"`)}`;
  const data = await (await fetch(url)).json();
  const hit = (data.foods || []).find((x) => x.description.toLowerCase() === f.usda.toLowerCase()) || data.foods?.[0];
  if (!hit) { console.log(`NOT FOUND ${f.id}: ${f.usda}`); continue; }
  const v = {};
  for (const n of hit.foodNutrients || []) if (IDS[n.nutrientId]) v[IDS[n.nutrientId]] = n.value;
  const bad = NUTRIENT_KEYS.filter((k) => v[k] != null && Math.abs(v[k] - f.per100[k]) > Math.max(0.05 * Math.abs(v[k]), 0.15));
  if (bad.length) { diffs++; console.log(`DIFF ${f.id} (fdc ${hit.fdcId}): ${bad.map((k) => `${k} ${f.per100[k]}→${v[k]}`).join(', ')}`); }
  else console.log(`OK   ${f.id} (fdc ${hit.fdcId})`);
  out[f.id] = { fdcId: hit.fdcId, description: hit.description, per100: v };
}
if (process.argv.includes('--write')) { fs.mkdirSync('data', { recursive: true }); fs.writeFileSync('data/usda-verified.json', JSON.stringify(out, null, 1)); console.log('Wrote data/usda-verified.json'); }
console.log(`${diffs} food(s) differ from FDC.`);
