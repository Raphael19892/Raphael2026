// External food databases: Open Food Facts (barcodes, packaged products) and, optionally,
// USDA FoodData Central search (set FDC_API_KEY). Results are normalised to the app's per-100 g shape.
import { analyzeIngredients, nutrientDensity, highIn } from '../shared/nova.js';
import { assessNova } from '../shared/novaAssess.js';

const OFF = 'https://world.openfoodfacts.org';
const UA = 'NutriLongevityAI/1.0 (open-source nutrition app)';

const num = (v) => (v === undefined || v === null || v === '' || Number.isNaN(Number(v)) ? null : Number(v));

export function normalizeOff(p, barcode) {
  const n = p.nutriments || {};
  const g2mg = (v) => (num(v) == null ? null : num(v) * 1000);
  const sodium = num(n.sodium_100g) != null ? g2mg(n.sodium_100g) : (num(n.salt_100g) != null ? num(n.salt_100g) * 400 : null);
  const per100 = {
    kcal: num(n['energy-kcal_100g']) ?? (num(n.energy_100g) != null ? num(n.energy_100g) / 4.184 : null),
    protein: num(n.proteins_100g), carbs: num(n.carbohydrates_100g), fat: num(n.fat_100g),
    satFat: num(n['saturated-fat_100g']), fiber: num(n.fiber_100g), sugars: num(n.sugars_100g),
    addedSugar: num(n['added-sugars_100g']), sodium,
    potassium: g2mg(n.potassium_100g), calcium: g2mg(n.calcium_100g), iron: g2mg(n.iron_100g),
    magnesium: g2mg(n.magnesium_100g), vitC: g2mg(n['vitamin-c_100g']),
    folate: null, vitB12: null, vitD: null,
  };
  const ingredientsText = p.ingredients_text_en || p.ingredients_text || p.ingredients_text_he || '';
  const analysis = analyzeIngredients(ingredientsText);
  if (per100.addedSugar == null && analysis.addedSugars.length === 0 && ingredientsText) per100.addedSugar = 0;
  const offNova = num(p.nova_group);
  const own = ingredientsText ? assessNova(ingredientsText).group : null;
  return {
    id: `off:${barcode}`, barcode, source: 'openfoodfacts', status: 'label-declared',
    name: { en: p.product_name_en || p.product_name || p.generic_name || barcode, he: p.product_name_he || p.product_name || p.product_name_en || barcode },
    brand: p.brands || '', image: p.image_front_small_url || p.image_small_url || null,
    quantity: p.quantity || '', servingG: num(p.serving_quantity),
    per100, ingredientsText, analysis,
    // Our own ingredient-based assessment is primary; OFF's automatic group is kept as a second opinion.
    nova: own ?? offNova ?? null, novaSource: own ? 'ingredients' : offNova ? 'openfoodfacts' : 'ingredients', offNova,
    allergens: (p.allergens_tags || []).map((t) => t.replace(/^en:/, '')),
    tags: [], plant: null, emoji: '📦', group: 'packaged',
    density: nutrientDensity(per100), highIn: highIn(per100),
    link: `${OFF}/product/${barcode}`,
  };
}

async function fetchJson(url, timeoutMs = 8000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' }, signal: ctrl.signal });
    if (!r.ok) throw Object.assign(new Error(`HTTP ${r.status}`), { status: r.status });
    return await r.json();
  } finally { clearTimeout(t); }
}

export async function lookupBarcode(db, barcode) {
  const cached = db.prepare("SELECT data FROM products WHERE barcode = ? AND fetched_at > datetime('now', '-30 days')").get(barcode);
  if (cached) return { product: JSON.parse(cached.data), cached: true };
  const data = await fetchJson(`${OFF}/api/v2/product/${encodeURIComponent(barcode)}.json`);
  if (!data || data.status !== 1 || !data.product) return { product: null };
  const product = normalizeOff(data.product, barcode);
  db.prepare('INSERT OR REPLACE INTO products (barcode, data, fetched_at) VALUES (?, ?, datetime(\'now\'))').run(barcode, JSON.stringify(product));
  return { product };
}

export async function searchOff(q) {
  const url = `${OFF}/cgi/search.pl?search_terms=${encodeURIComponent(q)}&search_simple=1&action=process&json=1&page_size=12`;
  const data = await fetchJson(url);
  return (data.products || []).filter((p) => p.code).map((p) => normalizeOff(p, p.code));
}

// USDA FoodData Central search (Foundation + SR Legacy only: analytical reference data).
const FDC_IDS = { 1008: 'kcal', 1003: 'protein', 1005: 'carbs', 1004: 'fat', 1258: 'satFat', 1079: 'fiber', 2000: 'sugars', 1235: 'addedSugar', 1093: 'sodium', 1092: 'potassium', 1087: 'calcium', 1089: 'iron', 1090: 'magnesium', 1162: 'vitC', 1177: 'folate', 1178: 'vitB12', 1114: 'vitD' };
export async function searchFdc(q, apiKey) {
  if (!apiKey) return [];
  const url = `https://api.nal.usda.gov/fdc/v1/foods/search?api_key=${encodeURIComponent(apiKey)}&query=${encodeURIComponent(q)}&dataType=Foundation,SR%20Legacy&pageSize=10`;
  const data = await fetchJson(url);
  return (data.foods || []).map((f) => {
    const per100 = {};
    for (const n of f.foodNutrients || []) {
      const k = FDC_IDS[n.nutrientId];
      if (k && per100[k] == null) per100[k] = n.value;
    }
    if (per100.kcal == null) {
      const e = (f.foodNutrients || []).find((n) => n.nutrientId === 2047 || n.nutrientId === 2048);
      if (e) per100.kcal = e.value;
    }
    return {
      id: `fdc:${f.fdcId}`, fdcId: f.fdcId, source: 'usda-fdc', status: 'usda-verified',
      name: { en: f.description, he: f.description }, per100, nova: null, emoji: '🧪', group: 'usda', tags: [], allergens: [],
      density: nutrientDensity(per100), link: `https://fdc.nal.usda.gov/food-details/${f.fdcId}/nutrients`,
    };
  });
}
