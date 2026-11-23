// Rule-based meal parser (Hebrew + English). Turns "I ate yogurt with oats, chia and a kiwi" /
// "אכלתי שתי פרוסות לחם מלא עם אבוקדו וביצה" into food items with gram amounts.
// Used offline and as the safety net behind the AI parser. Every quantity is marked as
// 'stated' (the user gave it) or 'assumed' (a standard portion), so the UI can ask about it.
import { FOOD_MAP } from './foods.js';
import { ALIASES } from './aliases.js';

const HEB = /[֐-׿]/;
const norm = (s) => String(s || '').toLowerCase().replace(/[״“”]/g, '"').replace(/[׳’`]/g, "'").replace(/\s+/g, ' ');

const ALIAS_LIST = Object.entries(ALIASES)
  .flatMap(([id, arr]) => arr.map((a) => ({ id, alias: norm(a) })))
  .sort((a, b) => b.alias.length - a.alias.length);

const NUM_WORDS = {
  a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, half: 0.5, quarter: 0.25, couple: 2, few: 3, several: 3, double: 2,
  'אחד': 1, 'אחת': 1, 'שתי': 2, 'שני': 2, 'שניים': 2, 'שתיים': 2, 'שלוש': 3, 'שלושה': 3, 'ארבע': 4, 'ארבעה': 4, 'חמש': 5, 'חמישה': 5, 'שש': 6, 'חצי': 0.5, 'רבע': 0.25, 'כמה': 3, 'זוג': 2,
};
const UNITS = [
  ['kg', /^(kg|kilo|kilos|ק"ג|קילו)$/], ['g', /^(g|gr|gram|grams|grm|גרם|ג'|גר')$/], ['ml', /^(ml|מ"ל|מל)$/],
  ['cup', /^(cup|cups|glass|glasses|mug|mugs|כוס|כוסות|ספל|ספלים)$/], ['tbsp', /^(tbsp|tablespoon|tablespoons|spoon|spoons|כף|כפות)$/],
  ['tsp', /^(tsp|teaspoon|teaspoons|כפית|כפיות)$/], ['slice', /^(slice|slices|פרוסה|פרוסות|משולש|משולשים)$/],
  ['piece', /^(piece|pieces|unit|units|יחידה|יחידות|חתיכה|חתיכות)$/], ['can', /^(can|cans|bottle|bottles|פחית|פחיות|בקבוק|בקבוקים|בקבוקון)$/],
  ['bowl', /^(bowl|bowls|קערה|קערית|קערות)$/], ['handful', /^(handful|handfuls|חופן|חופנים|חופניים)$/],
  ['scoop', /^(scoop|scoops|סקופ|כדור|כדורים)$/], ['serving', /^(serving|servings|portion|portions|plate|plates|מנה|מנות|צלחת|צלחות)$/],
];
const DEFAULT_G = {
  oats: 40, granola: 45, yogurt_plain: 150, greek_yogurt: 150, yogurt_fruit: 150, soy_yogurt: 150, kefir: 200, cottage: 120, chia: 10, flax: 10, pumpkin_seeds: 15,
  hummus: 60, tahini: 20, evoo: 10, canola_oil: 10, butter: 10, peanut_butter: 20, choc_spread: 20, jam: 20, honey: 10, sugar: 5,
  white_rice: 150, brown_rice: 150, quinoa: 150, bulgur: 150, barley: 150, buckwheat: 150, white_pasta: 180, ww_pasta: 180,
  lentils: 150, chickpeas: 150, black_beans: 150, white_beans: 150, kidney_beans: 150, edamame: 100, green_peas: 100, tofu: 120,
  tomato: 100, cucumber: 100, romaine: 50, spinach: 50, kale: 40, arugula: 30, broccoli: 100, cauliflower: 100, red_cabbage: 80, carrot: 70,
  red_pepper: 80, onion: 40, mushrooms: 80, zucchini: 120, eggplant: 120, beetroot: 80, corn: 100, parsley: 10, garlic: 3, lemon_juice: 10,
  chicken: 120, salmon: 130, cod: 150, tuna: 100, sardines: 90, beef_ground: 120, deli_turkey: 40, cheese_yellow: 40, feta: 40,
  almonds: 25, walnuts: 25, hazelnuts: 25, pistachios: 25, dark_chocolate: 20, cocoa: 5, blueberries: 80, raspberries: 80, strawberries: 120,
  cherries: 100, grapes: 120, pomegranate: 50, mango: 150, watermelon: 300, olives: 30, avocado: 70, sauerkraut: 50, kimchi: 50, miso: 15,
  pizza: 214, fries: 117, chips: 50, ice_cream: 130, cookies: 32, milk: 200, almond_milk: 200, coffee: 240, green_tea: 240, cola: 330,
  diet_cola: 330, orange_juice: 250, water: 250, whey: 30, croissant: 57, potato: 170, sweet_potato: 150,
};
const COUNTABLE = new Set(['slice', 'medium', 'fruit', 'egg', 'pita', 'bun', 'croissant', 'cookie', 'date', 'prune', 'fig', 'olive', 'sausage', 'patty', 'fillet', 'breast', 'can', 'half', 'cob', 'wedge', 'clove', 'spear', 'square', 'scoop', 'bag', 'block 1/4', 'medium serving']);
const DRINKS = new Set(['cola', 'diet_cola', 'orange_juice', 'water', 'milk', 'almond_milk', 'coffee', 'green_tea', 'kefir']);
const COOKING = [
  ['fried', /(deep[- ]?fried|fried|pan[- ]fried|sauteed|sautéed|scrambled|omelett?e|מטוגנ\S*|מטוגן|טיגון|מוקפצ\S*|חביתה|שניצל)/],
  ['baked', /(baked|roasted|oven|אפוי\S*|בתנור|קלוי\S*)/],
  ['grilled', /(grilled|bbq|barbecue|on the grill|צלוי\S*|על האש|בגריל|גריל)/],
  ['boiled', /(boiled|steamed|poached|מבושל\S*|מאודה\S*|שלוק\S*|קשה)/],
  ['raw', /(raw|fresh|טרי\S*|חי )/],
];
const STOP = /^(salad|סלט|ירקות|i|ate|had|have|drank|drink|eat|for|my|breakfast|lunch|dinner|snack|today|this|morning|evening|with|and|of|the|some|a|an|also|then|plus|אכלתי|שתיתי|אכלנו|לארוחת|ארוחת|בוקר|צהריים|ערב|היום|עם|של|גם|ועוד|קצת|את|ה|ו|ב|ל|ארוחה|ביניים)$/;
const SPLIT = /\s*(?:,|;|\.|\+|\n|\band\b|\bwith\b|\bthen\b|\bplus\b|\s+עם\s+|\s+ועם\s+|\s+וגם\s+|\s+ואז\s+)\s*/;

function readNumber(tok) {
  if (!tok) return null;
  const t = tok.replace(',', '.');
  if (/^\d+(\.\d+)?$/.test(t)) return Number(t);
  if (t === '½') return 0.5; if (t === '¼') return 0.25; if (t === '¾') return 0.75;
  const m = t.match(/^(\d+(?:\.\d+)?)(g|gr|גרם|ml|kg)$/);
  if (m) return Number(m[1]);
  return NUM_WORDS[t] ?? NUM_WORDS[t.replace(/^[ומבהלש]/, '')] ?? NUM_WORDS[t.replace(/^[ומבהלש]{2}/, '')] ?? null;
}
function readUnit(tok) {
  if (!tok) return null;
  const t = tok.replace(/^[ו]/, '');
  const glued = t.match(/^\d+(?:[.,]\d+)?(g|gr|גרם|ml|kg)$/);
  if (glued) return glued[1] === 'kg' ? 'kg' : glued[1] === 'ml' ? 'ml' : 'g';
  for (const [u, re] of UNITS) if (re.test(t)) return u;
  return null;
}

function gramsFor(foodId, n, unit) {
  const f = FOOD_MAP[foodId];
  const unitG = f.unit?.[1];
  const unitName = f.unit?.[0];
  const count = n ?? 1;
  switch (unit) {
    case 'g': return n;
    case 'kg': return n * 1000;
    case 'ml': return n;
    case 'cup': return count * (unitName === 'cup' ? unitG : DRINKS.has(foodId) ? 240 : 150);
    case 'tbsp': return count * (unitName === 'tbsp' ? unitG : foodId === 'evoo' ? 13.5 : 15);
    case 'tsp': return count * (unitName === 'tsp' ? unitG : 5);
    case 'slice': return count * (unitName === 'slice' ? unitG : f.group === 'grains' ? 30 : 20);
    case 'can': return count * (unitName === 'can' ? unitG : 330);
    case 'bowl': return count * (['oats', 'granola'].includes(foodId) ? 60 : 250);
    case 'handful': return count * 28;
    case 'scoop': return count * (unitName === 'scoop' ? unitG : 30);
    case 'serving': return count * (DEFAULT_G[foodId] || unitG || 100);
    case 'piece': return count * (unitG && COUNTABLE.has(unitName) ? unitG : DEFAULT_G[foodId] || 100);
    default:
      if (n == null) return DEFAULT_G[foodId] || unitG || 100;
      if (unitG && COUNTABLE.has(unitName)) return n * unitG;
      return n * (DEFAULT_G[foodId] || unitG || 100);
  }
}

function findMatches(text) {
  const taken = new Array(text.length).fill(false);
  const out = [];
  for (const { id, alias } of ALIAS_LIST) {
    const heb = HEB.test(alias);
    const esc = alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = heb
      ? new RegExp(`(^|[\\s,.;:()\\-+/"'])([ובהלמשכ]{0,2})(${esc})(?=$|[\\s,.;:()\\-+/!?"'])`, 'g')
      : new RegExp(`(^|[^a-z])(${esc})(s|es)?(?=$|[^a-z])`, 'g');
    let m;
    while ((m = re.exec(text))) {
      const start = m.index + m[1].length + (heb ? m[2].length : 0);
      const end = start + (heb ? m[3].length : m[2].length + (m[3] || '').length);
      if (taken.slice(start, end).some(Boolean)) continue;
      for (let i = start; i < end; i++) taken[i] = true;
      out.push({ id, start, end, alias });
    }
  }
  return out.sort((a, b) => a.start - b.start);
}

/** Food ids mentioned in a text (Hebrew/English aliases), in order of appearance. */
export function findFoods(input) {
  return [...new Set(findMatches(norm(input)).map((m) => m.id))];
}

/**
 * Parse a free-text meal description.
 * Returns { items: [{foodId, grams, label, quantity: 'stated'|'assumed', cooking}], questions: [...], unrecognized: [...] }
 */
export function parseMeal(input) {
  const text = norm(input);
  const matches = findMatches(text);
  const items = [];
  let prevEnd = 0;
  matches.forEach((mt, i) => {
    // Quantity: words between the previous food (or clause start) and this food.
    const before = text.slice(prevEnd, mt.start);
    const clauseStart = Math.max(before.search(/[^,;.+\n]*$/), 0);
    const toks = before.slice(clauseStart).split(/\s+/).map((x) => x.replace(/[(),:]/g, '')).filter(Boolean).filter((x) => !/^(of|של|מ|from)$/.test(x));
    let n = null; let unit = null;
    for (let k = toks.length - 1; k >= Math.max(0, toks.length - 4); k--) {
      const tk = toks[k];
      if (unit == null) { const u = readUnit(tk); if (u) { unit = u; const num = readNumber(tk); if (num != null && /^\d/.test(tk)) { n = num; break; } continue; } }
      const num = readNumber(tk);
      if (num != null) {
        n = num;
        if (/^(a|an)$/.test(tk) && /^(half|חצי)$/.test(toks[k - 1] || '')) n = 0.5;
        break;
      }
    }
    // Quantity written after the food: "yogurt 200g", "יוגורט (200 גרם)".
    const after = text.slice(mt.end, matches[i + 1]?.start ?? text.length).slice(0, 18);
    const am = after.match(/^\s*\(?\s*(\d+(?:[.,]\d+)?)\s*(g|gr|grams?|גרם|ג'|ml|מ"ל)\b/);
    if (am) { n = Number(am[1].replace(',', '.')); unit = /ml|מ"ל/.test(am[2]) ? 'ml' : 'g'; }
    if (n === 1 && unit == null && /^(a|an)$/.test(toks[toks.length - 1] || '')) n = 1;

    const clause = text.slice(prevEnd, matches[i + 1]?.start ?? text.length);
    const cooking = COOKING.find(([, re]) => re.test(clause))?.[0] || null;
    const plural = HEB.test(mt.alias) ? /(ים|ות)$/.test(mt.alias) : /s$/.test(mt.alias) || /s$/.test(text.slice(mt.end - 1, mt.end));
    const countable = COUNTABLE.has(FOOD_MAP[mt.id].unit?.[0]);
    const stated = n != null || unit != null;
    if (!stated && plural && countable && FOOD_MAP[mt.id].unit[1] < 100) n = 2;
    let grams = Math.max(1, Math.round(gramsFor(mt.id, n, unit)));
    if (!stated && mt.id === 'milk' && /(coffee|tea|קפה|תה)/.test(text)) grams = 50;
    // Merge repeated mentions of the same food.
    const existing = items.find((x) => x.foodId === mt.id);
    if (existing) { if (stated) { existing.grams = grams; existing.quantity = 'stated'; } }
    else items.push({ foodId: mt.id, grams, label: text.slice(mt.start, mt.end), quantity: stated ? 'stated' : 'assumed', cooking });
    prevEnd = mt.end;
  });

  // A plain "salad" with no vegetables named: assume a typical chopped vegetable salad.
  if (/(^|[^a-z\u0590-\u05FF])(salad|סלט|סלט ירקות|סלט ישראלי)($|[^a-z\u0590-\u05FF])/.test(text) && !items.some((x) => ['tomato', 'cucumber', 'romaine', 'spinach', 'arugula', 'kale', 'red_pepper', 'red_cabbage', 'carrot'].includes(x.foodId))) {
    items.push({ foodId: 'tomato', grams: 80, label: 'salad', quantity: 'assumed', cooking: 'raw', note: 'salad_assumed' },
      { foodId: 'cucumber', grams: 80, label: 'salad', quantity: 'assumed', cooking: 'raw' }, { foodId: 'romaine', grams: 30, label: 'salad', quantity: 'assumed', cooking: 'raw' });
  }

  // Frying adds oil the description rarely mentions.
  const fried = items.filter((x) => x.cooking === 'fried' && (FOOD_MAP[x.foodId].per100.fat < 15) && FOOD_MAP[x.foodId].id !== 'fries');
  if (fried.length && !items.some((x) => ['evoo', 'canola_oil', 'butter'].includes(x.foodId))) {
    items.push({ foodId: 'canola_oil', grams: 5 * fried.length, label: 'frying oil', quantity: 'assumed', cooking: null, note: 'fry_oil' });
  }

  // Questions for assumed quantities that matter for the totals.
  const questions = items.filter((x) => x.quantity === 'assumed' && (FOOD_MAP[x.foodId].per100.kcal * x.grams) / 100 >= 90)
    .map((x) => ({ foodId: x.foodId, grams: x.grams, unit: FOOD_MAP[x.foodId].unit }));

  // Clauses with no recognised food.
  const unrecognized = [];
  for (const part of text.split(SPLIT)) {
    if (!part.trim()) continue;
    const hit = matches.some((m) => text.indexOf(part) <= m.start && m.start < text.indexOf(part) + part.length);
    if (hit || /^(salad|סלט)/.test(part.trim())) continue;
    const words = part.split(/\s+/).filter((w) => w && !STOP.test(w) && !STOP.test(w.replace(/^[ובהל]/, '')) && readNumber(w) == null && !readUnit(w));
    if (words.length) unrecognized.push(words.join(' '));
  }
  return { items, questions, unrecognized, mode: 'rules' };
}
