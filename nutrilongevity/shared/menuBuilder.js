// Weekly menu builder — the user's weekly-menu-builder agent ported into the app.
// Builds a 7-day × 4-meal menu from the food database (so fibre is calculated, not guessed), enforces the
// fixed rules, runs the quality checks, and produces a shopping list by department and one alternative per meal.
import { FOOD_MAP, foodIsAllowed } from './foods.js';
import { sumItems, indicators, roundGrams } from './nutrition.js';
import { shoppingList, rng } from './planner.js';
import { findFoods } from './mealParser.js';

// Default rules = the user's weekly-menu-builder skill.
export const DEFAULT_MENU_RULES = {
  fiberMin: 30, fiberMax: 45,
  exclude: ['fish', 'seafood', 'leafy', 'processedmeat', 'whitebread', 'cereals'],
  daily: ['legume', 'wholegrain', 'vegetable', 'fruit', 'nuts', 'oliveoil'],
  kosher: true, simplePrep: true,
  favorites: ['overnight_oats', 'yogurt_bowl', 'eggs', 'lentils', 'hummus', 'avocado', 'sweet_potato', 'broccoli', 'rye_sourdough', 'oat_pancake'],
};

export const EXCLUDE_GROUPS = {
  fish: ['salmon', 'sardines', 'tuna', 'cod'], seafood: [],
  leafy: ['spinach', 'kale', 'arugula', 'romaine', 'parsley'],
  processedmeat: ['hot_dog', 'deli_turkey'], whitebread: ['white_bread', 'pita_white', 'hamburger_bun', 'croissant'],
  cereals: ['granola'], redmeat: ['beef_ground'], dairy: ['greek_yogurt', 'yogurt_plain', 'kefir', 'cottage', 'feta', 'cheese_yellow', 'milk'], eggs: ['eggs'], poultry: ['chicken'],
};

const MEAT = new Set(['chicken', 'beef_ground', 'hot_dog', 'deli_turkey']);
const isDairy = (id) => FOOD_MAP[id]?.animal === 'dairy';

// Simple, mostly assembled meals built around the user's favourites. fav = which favourite it serves.
const M = (id, slot, he, en, emoji, hue, items, prepHe, prepEn, minutes, fav = [], opts = {}) => ({ id, slot, name: { he, en }, emoji, hue, items: items.map(([foodId, grams]) => ({ foodId, grams })), prep: { he: prepHe, en: prepEn }, minutes, fav, ...opts });
export const MENU_MEALS = [
  // Breakfast
  M('mb_overnight_oats', 'breakfast', 'אוברנייט אוטס עם פירות יער ואגוזי מלך', 'Overnight oats with berries & walnuts', '🫐', 250, [['oats', 50], ['yogurt_plain', 150], ['chia', 10], ['blueberries', 80], ['walnuts', 15]], 'לערבב בערב שיבולת שועל, צ׳יה ויוגורט; בבוקר להוסיף פירות ואגוזים.', 'Mix oats, chia and yogurt the night before; add fruit and nuts in the morning.', 5, ['overnight_oats']),
  M('mb_yogurt_bowl', 'breakfast', 'קערת יוגורט עם אגס, שיבולת שועל ושקדים', 'Yogurt bowl with pear, oats & almonds', '🥣', 340, [['greek_yogurt', 170], ['oats', 30], ['pear', 120], ['flax', 10], ['almonds', 15]], 'להרכיב בקערה: יוגורט, שיבולת שועל, אגס חתוך, פשתן ושקדים.', 'Assemble: yogurt, oats, sliced pear, flax and almonds.', 5, ['yogurt_bowl']),
  M('mb_shakshuka', 'breakfast', 'שקשוקה עם לחם שיפון', 'Shakshuka with rye bread', '🍳', 15, [['eggs', 100], ['tomato', 200], ['onion', 50], ['red_pepper', 60], ['evoo', 10], ['rye_bread', 64]], 'לטגן בצל ופלפל בשמן זית, להוסיף עגבניות 5 דק׳, לשבור ביצים ולכסות.', 'Soften onion and pepper in olive oil, add tomatoes for 5 min, crack in the eggs and cover.', 15, ['eggs', 'rye_sourdough']),
  M('mb_omelette_toast', 'breakfast', 'חביתה, אבוקדו וסלט עם לחם מחמצת מלא', 'Omelette, avocado & salad on wholemeal sourdough', '🥑', 110, [['eggs', 100], ['ww_bread', 64], ['avocado', 50], ['tomato', 100], ['cucumber', 100], ['evoo', 5]], 'חביתה במחבת עם מעט שמן זית; לצד לחם, אבוקדו וירקות חתוכים.', 'Omelette with a little olive oil; serve with bread, avocado and chopped vegetables.', 10, ['eggs', 'avocado', 'rye_sourdough']),
  M('mb_oat_pancake', 'breakfast', 'פנקייק שיבולת שועל עם יוגורט ותותים', 'Oat pancakes with yogurt & strawberries', '🥞', 30, [['oats', 50], ['eggs', 50], ['banana', 100], ['greek_yogurt', 100], ['strawberries', 100], ['walnuts', 10]], 'לטחון שיבולת שועל, ביצה ובננה; לאפות פנקייקים קטנים במחבת; להגיש עם יוגורט ותותים.', 'Blend oats, egg and banana; cook small pancakes; serve with yogurt and strawberries.', 15, ['oat_pancake']),
  M('mb_hummus_toast', 'breakfast', 'טוסט שיפון עם חומוס, אבוקדו ועגבנייה', 'Rye toast with hummus, avocado & tomato', '🍞', 90, [['rye_bread', 64], ['hummus', 40], ['avocado', 50], ['tomato', 100], ['pumpkin_seeds', 10]], 'למרוח חומוס ואבוקדו על טוסט, להוסיף עגבנייה וגרעיני דלעת.', 'Spread hummus and avocado on toast; top with tomato and pumpkin seeds.', 5, ['hummus', 'avocado', 'rye_sourdough']),
  // Lunch
  M('mb_lentil_bowl', 'lunch', 'קערת עדשים, בורגול וירקות', 'Lentil, bulgur & vegetable bowl', '🥗', 95, [['lentils', 150], ['bulgur', 100], ['tomato', 100], ['cucumber', 100], ['red_pepper', 60], ['evoo', 10], ['lemon_juice', 10]], 'עדשים מבושלות (מוכנות/קופסה) עם בורגול וירקות קצוצים, שמן זית ולימון.', 'Ready-cooked lentils with bulgur, chopped vegetables, olive oil and lemon.', 10, ['lentils']),
  M('mb_hummus_plate', 'lunch', 'צלחת חומוס עם גרגירים, פיתה מלאה וירקות', 'Hummus plate with chickpeas, wholemeal pita & veg', '🥙', 300, [['hummus', 80], ['chickpeas', 60], ['pita_ww', 64], ['tomato', 100], ['cucumber', 100], ['carrot', 60], ['evoo', 5]], 'להרכיב: חומוס, גרגירים, ירקות חתוכים ופיתה מלאה.', 'Assemble: hummus, chickpeas, sliced vegetables and wholemeal pita.', 5, ['hummus']),
  M('mb_sweetpotato_bowl', 'lunch', 'בטטה עם שעועית שחורה, תירס ואבוקדו', 'Sweet potato with black beans, corn & avocado', '🍠', 280, [['sweet_potato', 200], ['black_beans', 120], ['corn', 60], ['avocado', 50], ['red_pepper', 60], ['evoo', 5], ['lemon_juice', 10]], 'בטטה במיקרוגל/תנור; למלא בשעועית מקופסה, תירס, פלפל ואבוקדו.', 'Microwave or bake the sweet potato; fill with canned beans, corn, pepper and avocado.', 15, ['sweet_potato', 'avocado']),
  M('mb_broccoli_quinoa', 'lunch', 'קינואה, ברוקולי וגרגירים עם טחינה', 'Quinoa, broccoli & chickpeas with tahini', '🥦', 120, [['quinoa', 150], ['broccoli', 150], ['chickpeas', 80], ['tahini', 15], ['lemon_juice', 10], ['evoo', 5]], 'ברוקולי קפוא מאודה; לערבב עם קינואה מוכנה וגרגירים; לזלף טחינה ולימון.', 'Steam frozen broccoli; mix with ready quinoa and chickpeas; drizzle tahini and lemon.', 10, ['broccoli']),
  M('mb_bean_salad', 'lunch', 'סלט שעועית לבנה וירקות עם לחם שיפון', 'White bean salad with rye bread', '🫘', 60, [['white_beans', 150], ['tomato', 120], ['red_pepper', 60], ['onion', 30], ['evoo', 10], ['lemon_juice', 10], ['rye_bread', 32]], 'לערבב שעועית מקופסה עם ירקות קצוצים, שמן זית ולימון.', 'Toss canned beans with chopped vegetables, olive oil and lemon.', 5, ['rye_sourdough'], { cold: true }),
  M('mb_chickpea_salad', 'lunch', 'סלט גרגירי חומוס, בורגול ואבוקדו', 'Chickpea, bulgur & avocado salad', '🥗', 200, [['chickpeas', 150], ['bulgur', 100], ['avocado', 50], ['tomato', 100], ['cucumber', 100], ['evoo', 10], ['lemon_juice', 10]], 'להרכיב בקערה גרגירים, בורגול מוכן, ירקות ואבוקדו; לתבל.', 'Combine chickpeas, ready bulgur, vegetables and avocado; dress.', 5, ['hummus', 'avocado'], { cold: true }),
  // Dinner
  M('mb_lentil_soup', 'dinner', 'מרק עדשים פשוט עם לחם שיפון', 'Simple lentil soup with rye bread', '🍲', 35, [['lentils', 180], ['carrot', 80], ['onion', 50], ['tomato', 100], ['evoo', 10], ['rye_bread', 32]], 'לבשל 20 דק׳ עדשים עם גזר, בצל ועגבניות; לסיים בשמן זית.', 'Simmer lentils with carrot, onion and tomato for 20 min; finish with olive oil.', 25, ['lentils', 'rye_sourdough']),
  M('mb_shakshuka_beans', 'dinner', 'שקשוקה עם שעועית לבנה ופיתה מלאה', 'Bean shakshuka with wholemeal pita', '🍳', 20, [['eggs', 100], ['white_beans', 100], ['tomato', 200], ['onion', 40], ['red_pepper', 60], ['evoo', 10], ['pita_ww', 64]], 'כמו שקשוקה רגילה, עם שעועית מקופסה ברוטב.', 'Like regular shakshuka, with canned beans in the sauce.', 15, ['eggs']),
  M('mb_chicken_tray', 'dinner', 'מגש עוף, בטטה וברוקולי בתנור', 'Chicken, sweet potato & broccoli tray bake', '🍗', 330, [['chicken', 120], ['sweet_potato', 180], ['broccoli', 150], ['chickpeas', 60], ['evoo', 10]], 'הכול על מגש אחד עם שמן זית ותבלינים, 30 דק׳ ב-200 מעלות.', 'Everything on one tray with olive oil and spices, 30 min at 200 °C.', 10, ['sweet_potato', 'broccoli'], { meat: true }),
  M('mb_pasta_beans', 'dinner', 'פסטה מלאה עם שעועית לבנה וברוקולי', 'Wholemeal pasta with white beans & broccoli', '🍝', 120, [['ww_pasta', 150], ['white_beans', 80], ['broccoli', 150], ['garlic', 5], ['evoo', 10]], 'לבשל פסטה ולהוסיף ברוקולי ב-3 הדקות האחרונות; לערבב עם שעועית ושום בשמן זית.', 'Cook pasta, adding broccoli for the last 3 min; toss with beans and garlic in olive oil.', 15, ['broccoli']),
  M('mb_sweetpotato_cottage', 'dinner', 'בטטה אפויה עם קוטג׳, עדשים וברוקולי', 'Baked sweet potato with cottage cheese, lentils & broccoli', '🍠', 30, [['sweet_potato', 200], ['cottage', 100], ['lentils', 80], ['broccoli', 120], ['evoo', 5], ['pumpkin_seeds', 10]], 'בטטה במיקרוגל/תנור, לצד קוטג׳, עדשים מוכנות וברוקולי מאודה.', 'Microwave or bake the sweet potato; serve with cottage cheese, ready lentils and steamed broccoli.', 10, ['sweet_potato', 'broccoli']),
  M('mb_tofu_rice', 'dinner', 'טופו מוקפץ עם ירקות ואורז מלא', 'Tofu & vegetable stir-fry with brown rice', '🥢', 160, [['tofu', 150], ['broccoli', 100], ['red_pepper', 80], ['onion', 40], ['evoo', 8], ['brown_rice', 140]], 'להקפיץ טופו וירקות קפואים 8 דק׳; להגיש עם אורז מלא מוכן.', 'Stir-fry tofu with frozen vegetables for 8 min; serve with ready brown rice.', 15, ['broccoli']),
  M('mb_shabbat', 'dinner', 'ארוחת שבת: עוף בתנור, אורז מלא וירקות צלויים', 'Shabbat dinner: roast chicken, brown rice & roasted vegetables', '🕯️', 40, [['chicken', 140], ['brown_rice', 150], ['zucchini', 120], ['carrot', 80], ['chickpeas', 60], ['evoo', 10]], 'מכינים ביום שישי: עוף וירקות על מגש בתנור, אורז מלא בסיר.', 'Prepare on Friday: chicken and vegetables on one tray, brown rice in a pot.', 15, [], { meat: true, shabbat: true }),
  // Snacks
  M('mb_apple_walnuts', 'snack', 'תפוח ואגוזי מלך', 'Apple & walnuts', '🍎', 0, [['apple', 160], ['walnuts', 25]], 'מוכן לאכילה.', 'Ready to eat.', 1),
  M('mb_dates_almonds', 'snack', 'תמרים ושקדים', 'Dates & almonds', '🌴', 25, [['dates', 48], ['almonds', 25]], 'מוכן לאכילה.', 'Ready to eat.', 1),
  M('mb_kiwi_pistachio', 'snack', 'שני קיווי ופיסטוקים', 'Two kiwis & pistachios', '🥝', 90, [['kiwi', 140], ['pistachios', 25]], 'לחצות ולאכול בכפית.', 'Halve and scoop.', 2),
  M('mb_yogurt_fruit', 'snack', 'יוגורט עם תותים ושקדים', 'Yogurt with strawberries & almonds', '🍓', 345, [['yogurt_plain', 150], ['strawberries', 100], ['almonds', 20]], 'להרכיב בכוס.', 'Assemble in a cup.', 2),
  M('mb_veg_hummus', 'snack', 'מקלות גזר ומלפפון עם חומוס ואגוזים', 'Carrot & cucumber sticks with hummus and nuts', '🥕', 30, [['carrot', 100], ['cucumber', 100], ['hummus', 50], ['almonds', 20]], 'לחתוך ירקות למקלות.', 'Cut vegetables into sticks.', 5, ['hummus']),
  M('mb_orange_hazelnut', 'snack', 'תפוז ואגוזי לוז', 'Orange & hazelnuts', '🍊', 35, [['orange', 150], ['hazelnuts', 25]], 'לקלף וליהנות.', 'Peel and enjoy.', 2),
];

const SLOTS = [['breakfast', 0.25], ['lunch', 0.32], ['dinner', 0.30], ['snack', 0.13]];
const DAY_NAMES = { he: ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'], en: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] };

export function excludedIds(rules, requests = {}) {
  const out = new Set((requests.remove || []));
  for (const g of rules.exclude || []) for (const id of EXCLUDE_GROUPS[g] || []) out.add(id);
  return out;
}
const tags = (id) => FOOD_MAP[id]?.tags || [];
const VEG = (id) => tags(id).includes('fv') && ['vegetables', 'starchy', 'legumes'].includes(FOOD_MAP[id].group);
const FRUIT = (id) => tags(id).includes('fv') && FOOD_MAP[id].group === 'fruits' && id !== 'avocado';
export const DAILY_CHECK = {
  legume: (items) => items.some((i) => tags(i.foodId).includes('legume')),
  wholegrain: (items) => items.some((i) => tags(i.foodId).includes('wholegrain')),
  vegetable: (items) => items.some((i) => VEG(i.foodId) && !tags(i.foodId).includes('legume')),
  fruit: (items) => items.some((i) => FRUIT(i.foodId)),
  nuts: (items) => items.filter((i) => tags(i.foodId).includes('nut') || tags(i.foodId).includes('seed')).reduce((a, i) => a + i.grams, 0) >= 20,
  oliveoil: (items) => items.some((i) => i.foodId === 'evoo'),
};

function kosherOk(items) {
  return !(items.some((i) => MEAT.has(i.foodId)) && items.some((i) => isDairy(i.foodId)));
}
function mealOk(meal, excluded, profile) {
  return meal.items.every((i) => !excluded.has(i.foodId) && foodIsAllowed(FOOD_MAP[i.foodId], profile));
}
function scale(meal, target) {
  const kcal = sumItems(meal.items).kcal || 1;
  const f = Math.max(0.7, Math.min(1.6, target / kcal));
  return { ...meal, targetKcal: target, items: meal.items.map((i) => ({ ...i, grams: roundGrams(['lemon_juice', 'garlic'].includes(i.foodId) ? i.grams : i.grams * f) })) };
}
const nextSunday = (from = new Date()) => { const d = new Date(Date.UTC(from.getFullYear(), from.getMonth(), from.getDate())); const add = (7 - d.getUTCDay()) % 7; return new Date(d.getTime() + add * 86400000).toISOString().slice(0, 10); };

// ── Special requests ─────────────────────────────────────────────────────
export function requestsPrompt(text, lang) {
  return `Interpret these special requests for a weekly menu (Sunday to Saturday). Reply with only JSON:
{"shabbat": boolean (true if a Shabbat meal is wanted), "skip": [{"day": 0-6 (0=Sunday), "slot": "breakfast"|"lunch"|"dinner"|"snack", "reason": string}], "add": [food names in English or Hebrew], "remove": [food names], "notes": string (${lang === 'en' ? 'English' : 'Hebrew'}, anything that could not be applied)}
Requests: """${String(text).slice(0, 1000)}"""`;
}
const DAY_RE = [/ראשון|sunday/i, /שני(?!ים)|monday/i, /שלישי|tuesday/i, /רביעי|wednesday/i, /חמישי|thursday/i, /שישי|friday/i, /שבת(?!ות)|saturday/i];
/** Rule-based request reader (works without AI). */
export function parseRequestsRules(text = '') {
  const t = String(text);
  const out = { shabbat: /שבת|shabbat|sabbath/i.test(t), skip: [], add: [], remove: [], notes: '' };
  for (const part of t.split(/[,.;\n]|\sו(?=ב?יום)/)) {
    if (/אירוע|מסעדה|בחוץ|חתונה|event|eating out|restaurant|wedding|party/i.test(part)) {
      const day = DAY_RE.findIndex((re) => re.test(part));
      if (day >= 0) out.skip.push({ day, slot: /צהריים|lunch/i.test(part) ? 'lunch' : /בוקר|breakfast/i.test(part) ? 'breakfast' : 'dinner', reason: part.trim() });
    }
    const rem = part.match(/(?:בלי|ללא|להוריד|להוציא|without|no |remove|skip)\s*(.+)/i);
    const addM = part.match(/(?:להוסיף|יותר|תוסיף|add|more|include)\s*(.+)/i);
    if (rem) out.remove.push(...findFoods(rem[1]));
    else if (addM) out.add.push(...findFoods(addM[1]));
  }
  return out;
}
export function normalizeRequests(r = {}) {
  const ids = (arr) => [...new Set((arr || []).flatMap((x) => (FOOD_MAP[x] ? [x] : findFoods(String(x)))))];
  return {
    shabbat: Boolean(r.shabbat), notes: r.notes || '',
    skip: (r.skip || []).filter((s) => Number.isInteger(s.day) && s.day >= 0 && s.day <= 6 && ['breakfast', 'lunch', 'dinner', 'snack'].includes(s.slot)),
    add: ids(r.add), remove: ids(r.remove),
  };
}

/**
 * Build the week. Returns { plan (compatible with the app's plan format), days[] with fibre/checks,
 * alternatives, shopping (by department), plants, qa[], notes[] }.
 */
export function buildWeeklyMenu({ rules = DEFAULT_MENU_RULES, profile = {}, kcalTarget = 2000, requests = {}, startDate, seed = Date.now() } = {}) {
  const R = { ...DEFAULT_MENU_RULES, ...rules };
  const req = normalizeRequests(requests);
  const rand = rng(seed);
  const excluded = excludedIds(R, req);
  const start = startDate || nextSunday();
  const allowed = MENU_MEALS.filter((m) => mealOk(m, excluded, profile) && (!R.kosher || kosherOk(m.items)) && (!R.simplePrep || m.minutes <= 25));
  const notes = [];
  const used = {};
  const days = [];
  for (let d = 0; d < 7; d++) {
    const date = new Date(new Date(`${start}T00:00:00Z`).getTime() + d * 86400000).toISOString().slice(0, 10);
    const dow = new Date(`${date}T00:00:00Z`).getUTCDay();
    const meals = [];
    for (const [slot, frac] of SLOTS) {
      const skip = req.skip.find((s) => s.day === dow && s.slot === slot);
      if (skip) { meals.push({ id: `skip-${d}-${slot}`, slot, skipped: true, reason: skip.reason, name: { he: 'אירוע — לא מתוכנן', en: 'Event — not planned' }, items: [] }); continue; }
      let pool = allowed.filter((m) => m.slot === slot && !m.shabbat);
      if (req.shabbat && dow === 5 && slot === 'dinner') { const sh = allowed.find((m) => m.shabbat); if (sh) pool = [sh]; }
      if (dow === 6 && slot === 'lunch' && req.shabbat) pool = pool.filter((m) => m.cold) .length ? pool.filter((m) => m.cold) : pool; // Shabbat lunch: no cooking
      // Fibre-aware choice: projected day fibre = fibre so far + this meal (scaled) + a typical share for the remaining slots.
      const soFar = sumItems(meals.flatMap((x) => x.items)).fiber;
      const fracLeft = SLOTS.slice(SLOTS.findIndex(([sl]) => sl === slot) + 1).reduce((a, [, fr]) => a + fr, 0);
      const mid = (R.fiberMin + R.fiberMax) / 2;
      const fiberOf = (m) => { const n = sumItems(m.items); return n.kcal ? (n.fiber * kcalTarget * frac) / n.kcal : 0; };
      const fiberPenalty = (m) => { const proj = soFar + fiberOf(m) + fracLeft * mid; return proj > R.fiberMax ? (proj - R.fiberMax) * 0.9 : proj < R.fiberMin ? (R.fiberMin - proj) * 0.5 : 0; };
      const score = (m) => -fiberPenalty(m) + (R.favorites || []).filter((f) => m.fav.includes(f)).length * 2
        + m.items.filter((i) => req.add.includes(i.foodId)).length * 4
        - (used[m.id] || 0) * 3 - (days[d - 1]?.meals.some((x) => x.templateId === m.id) ? 8 : 0) + rand() * 2.5;
      const pick = pool.sort((a, b) => score(b) - score(a))[0];
      if (!pick) { notes.push({ he: `לא נמצאה ארוחה מתאימה ל${slot} ביום ${DAY_NAMES.he[dow]}`, en: `No suitable ${slot} on ${DAY_NAMES.en[dow]}` }); continue; }
      used[pick.id] = (used[pick.id] || 0) + 1;
      const meal = scale({ ...pick, id: `${pick.id}-${d}`, templateId: pick.id, adaptations: [] }, kcalTarget * frac);
      const altPick = pool.filter((m) => m.id !== pick.id).sort((a, b) => score(b) - score(a))[0];
      meal.alternative = altPick ? scale({ ...altPick, id: `${altPick.id}-alt-${d}`, templateId: altPick.id }, kcalTarget * frac) : null;
      meals.push(meal);
    }
    let day = { date, dow, meals };
    const finalize = (dy) => { ensureDaily(dy, R, excluded, profile); tuneFiber(dy, R, excluded, profile); return dy; };
    const snapshot = JSON.stringify(day);
    day = finalize(day);
    // Still outside the fibre range after trimming? Swap the meal that pushes it most for a lower/higher-fibre option.
    for (let attempt = 0; attempt < 4; attempt++) {
      const f = sumItems(day.meals.flatMap((m) => m.items)).fiber;
      if (f >= R.fiberMin && f <= R.fiberMax) break;
      const fresh = JSON.parse(snapshot);
      const tooHigh = f > R.fiberMax;
      const fiberOfMeal = (m) => sumItems(m.items).fiber;
      const target = fresh.meals.filter((m) => !m.skipped && !m.shabbat).sort((a, b) => (tooHigh ? fiberOfMeal(b) - fiberOfMeal(a) : fiberOfMeal(a) - fiberOfMeal(b)))[attempt % 3];
      if (!target) break;
      const frac = SLOTS.find(([sl]) => sl === target.slot)[1];
      const options = allowed.filter((m) => m.slot === target.slot && !m.shabbat && m.id !== target.templateId)
        .map((m) => scale({ ...m, id: `${m.id}-${d}`, templateId: m.id, adaptations: [] }, kcalTarget * frac))
        .filter((m) => (tooHigh ? fiberOfMeal(m) < fiberOfMeal(target) : fiberOfMeal(m) > fiberOfMeal(target)))
        .sort((a, b) => (tooHigh ? fiberOfMeal(a) - fiberOfMeal(b) : fiberOfMeal(b) - fiberOfMeal(a)));
      if (!options.length) continue;
      const idx = fresh.meals.indexOf(target);
      fresh.meals[idx] = { ...options[0], alternative: target.alternative && target.alternative.templateId !== options[0].templateId ? target.alternative : scale({ ...target, id: `${target.templateId}-alt-${d}` }, kcalTarget * frac) };
      day = finalize(fresh);
    }
    topUpEnergy(day, kcalTarget * (1 - day.meals.filter((m) => m.skipped).reduce((a, m) => a + (SLOTS.find(([sl]) => sl === m.slot)?.[1] || 0), 0)), excluded, profile, R);
    days.push(day);
  }
  // Results, checks and shopping list
  const all = days.flatMap((d) => d.meals.flatMap((m) => m.items));
  for (const day of days) {
    const items = day.meals.flatMap((m) => m.items);
    day.fiber = Math.round(sumItems(items).fiber);
    day.kcal = Math.round(sumItems(items).kcal);
    day.fiberOk = day.fiber >= R.fiberMin && day.fiber <= R.fiberMax;
    day.missing = (R.daily || []).filter((k) => !DAILY_CHECK[k](items));
  }
  const plants = indicators(all).plantCount;
  const plan = { kind: 'weekly-menu', startDate: start, createdAt: new Date().toISOString(), seed, days: days.map((d) => ({ date: d.date, meals: d.meals.filter((m) => !m.skipped) })) };
  const shopping = departments(shoppingList(plan));
  const forbidden = all.filter((i) => excluded.has(i.foodId));
  const shopIds = Object.values(shopping).flat().map((e) => e.foodId);
  const qa = [
    { key: 'noForbidden', ok: forbidden.length === 0, detail: [...new Set(forbidden.map((i) => i.foodId))] },
    { key: 'fiberRange', ok: days.every((d) => d.fiberOk), detail: days.filter((d) => !d.fiberOk).map((d) => `${d.date}: ${d.fiber} g`) },
    { key: 'dailyFoods', ok: days.every((d) => !d.missing.length), detail: days.filter((d) => d.missing.length).map((d) => `${d.date}: ${d.missing.join(', ')}`) },
    { key: 'shoppingUsed', ok: shopIds.every((id) => all.some((i) => i.foodId === id)), detail: [] },
    ...(R.kosher ? [{ key: 'kosher', ok: days.every((d) => d.meals.every((m) => kosherOk(m.items))), detail: [] }] : []),
  ];
  return { plan, days, plants, shopping, qa, notes, requests: req, rules: R };
}

// Add what a day is missing (respecting exclusions and kosher rules).
const BOOST = {
  legume: [['chickpeas', 60, 'lunch'], ['lentils', 80, 'lunch'], ['hummus', 40, 'snack']],
  wholegrain: [['rye_bread', 32, 'lunch'], ['ww_bread', 32, 'lunch'], ['oats', 30, 'breakfast']],
  vegetable: [['tomato', 100, 'lunch'], ['cucumber', 100, 'lunch'], ['carrot', 80, 'snack']],
  fruit: [['apple', 150, 'snack'], ['orange', 150, 'snack'], ['kiwi', 70, 'snack']],
  nuts: [['almonds', 20, 'snack'], ['walnuts', 20, 'snack'], ['pumpkin_seeds', 15, 'snack']],
  oliveoil: [['evoo', 7, 'lunch'], ['evoo', 7, 'dinner']],
};
function addTo(day, slot, foodId, grams, excluded, profile) {
  if (excluded.has(foodId) || !foodIsAllowed(FOOD_MAP[foodId], profile)) return false;
  const meal = day.meals.find((m) => m.slot === slot && !m.skipped) || day.meals.find((m) => !m.skipped);
  if (!meal) return false;
  const next = [...meal.items, { foodId, grams }];
  if (!kosherOk(next)) return false;
  const ex = meal.items.find((i) => i.foodId === foodId);
  if (ex) ex.grams += grams; else meal.items.push({ foodId, grams });
  return true;
}
function ensureDaily(day, R, excluded, profile) {
  for (const k of R.daily || []) {
    const items = () => day.meals.flatMap((m) => m.items);
    if (DAILY_CHECK[k](items())) continue;
    for (const [id, g, slot] of BOOST[k] || []) {
      if (k === 'nuts') {
        const have = items().filter((i) => tags(i.foodId).includes('nut') || tags(i.foodId).includes('seed')).reduce((a, i) => a + i.grams, 0);
        if (addTo(day, slot, id, Math.max(10, 20 - have), excluded, profile)) break;
      } else if (addTo(day, slot, id, g, excluded, profile)) break;
    }
  }
}
function tuneFiber(day, R, excluded, profile) {
  const fiber = () => sumItems(day.meals.flatMap((m) => m.items)).fiber;
  const target = (R.fiberMin + R.fiberMax) / 2;
  for (let k = 0; k < 6 && fiber() < R.fiberMin; k++) {
    const adds = [['chia', 10, 'breakfast'], ['chickpeas', 50, 'lunch'], ['raspberries', 80, 'snack'], ['flax', 7, 'breakfast'], ['lentils', 60, 'dinner']];
    const [id, g, slot] = adds[k % adds.length];
    addTo(day, slot, id, g, excluded, profile);
  }
  // Too much fibre: trim the highest-fibre items step by step (never below half their original amount).
  const orig = new Map(day.meals.flatMap((m) => m.items).map((i) => [i, i.grams]));
  for (let k = 0; k < 30 && fiber() > R.fiberMax; k++) {
    const all = day.meals.flatMap((m) => m.items).filter((i) => !['evoo', 'lemon_juice', 'garlic'].includes(i.foodId) && i.grams > (orig.get(i) || i.grams) * 0.45 + 1);
    const top = all.sort((a, b) => sumItems([b]).fiber - sumItems([a]).fiber)[0];
    if (!top) break;
    top.grams = roundGrams(Math.max((orig.get(top) || top.grams) * 0.45, top.grams * 0.85));
  }
}

/** Keep energy near the target after fibre tuning, using low-fibre foods that fit the rules. */
function topUpEnergy(day, kcalTarget, excluded, profile, R) {
  const kcal = () => sumItems(day.meals.flatMap((m) => m.items)).kcal;
  const fiber = () => sumItems(day.meals.flatMap((m) => m.items)).fiber;
  const adds = [['evoo', 7, 'lunch'], ['eggs', 50, 'breakfast'], ['greek_yogurt', 100, 'snack'], ['evoo', 7, 'dinner'], ['tahini', 10, 'lunch'], ['cottage', 80, 'breakfast'], ['tofu', 60, 'dinner']];
  for (let k = 0; k < adds.length * 2 && kcal() < kcalTarget * 0.9; k++) {
    const [id, g, slot] = adds[k % adds.length];
    const before = fiber();
    if (addTo(day, slot, id, g, excluded, profile) && fiber() > R.fiberMax) {
      const meal = day.meals.find((m) => m.items.some((i) => i.foodId === id)); const it = meal.items.find((i) => i.foodId === id);
      it.grams -= g; if (it.grams <= 0) meal.items.splice(meal.items.indexOf(it), 1);
      if (fiber() !== before) break;
    }
  }
}

const DEPT = {
  vegetables: 'produce', fruits: 'produce', starchy: 'produce', legumes: 'legumes', grains: 'grains', dairy: 'dairy', fermented: 'dairy',
  nuts: 'nuts', seeds: 'nuts', fats: 'pantry', other: 'pantry', drinks: 'pantry', protein: 'protein',
};
function departments(groups) {
  const out = {};
  for (const [g, items] of Object.entries(groups)) {
    for (const e of items) {
      const dept = e.foodId === 'eggs' ? 'dairy' : (DEPT[g] || 'pantry');
      (out[dept] = out[dept] || []).push(e);
    }
  }
  return out;
}

export { DAY_NAMES, nextSunday };
