// Evidence-based NOVA assessment of a product from its ACTUAL ingredient list
// (Monteiro et al., Public Health Nutr 2019; doi:10.1017/S1368980018003762).
//
// Principles enforced here:
//  * Never classify from a product name, category, brand or marketing text — only from ingredients
//    (and explicit processing information when the source states it).
//  * Judge each additive by its PURPOSE. Preservatives, antioxidants, acidity regulators, processing
//    aids and fortificants do not by themselves make a food ultra-processed. Ultra-processing is marked
//    by industrial substances rarely used in kitchens and by "cosmetic" additives (flavours, colours,
//    sweeteners, flavour enhancers, emulsifiers, thickeners/gelling agents, glazing agents...), weighed
//    against the overall formulation.
//  * Report confidence and missing information; with too little information return no group.
import { splitIngredients } from './nova.js';
import { ALIASES } from './aliases.js';
import { FOOD_MAP } from './foods.js';

export const INSUFFICIENT = {
  he: 'לא ניתן לקבוע סיווג NOVA באופן אמין על סמך המידע הזמין.',
  en: 'A NOVA group cannot be determined reliably from the available information.',
};

// cls: whole | culinary | preservative | acidity | fortificant | aid | substance | cosmetic | other
// strength (for substance/cosmetic): 'strong' = clear ultra-processing marker; 'moderate' = depends on formulation
const L = (re, cls, purpose, strength = null) => ({ re, cls, purpose, strength });
const LEX = [
  // Industrial substances (rarely or never used in home kitchens)
  L(/hydroly[sz]ed|חלבון מפורק|hydrolysate/, 'substance', 'hydrolysed protein', 'strong'),
  L(/protein isolate|isolated (soy|pea|whey)|soy isolate|חלבון .*מבודד|מבודד חלבון/, 'substance', 'protein isolate', 'strong'),
  // Added milk proteins in any form (concentrate, whey protein, casein) share one purpose and are counted once.
  L(/milk protein concentrate|milk proteins?\b|תרכיז חלבוני חלב|תרכיז חלבון חלב|חלבוני חלב|חלבון חלב|whey protein|whey powder|אבקת מי גבינה|חלבון מי גבינה|casein|caseinate|קזאין|קזאינט/, 'substance', 'added milk protein', 'moderate'),
  L(/protein concentrate|תרכיז חלבון|תרכיז חלבוני/, 'substance', 'protein concentrate', 'moderate'),
  L(/maltodextrin|מלטודקסטרין/, 'substance', 'maltodextrin', 'strong'),
  L(/glucose[- ]fructose|high[- ]fructose|fructose[- ]glucose|hfcs|isoglucose|corn syrup|סירופ תירס|סירופ גלוקוז[- ]פרוקטוז/, 'substance', 'high-fructose / glucose-fructose syrup', 'strong'),
  L(/glucose syrup|סירופ גלוקוז/, 'substance', 'glucose syrup', 'strong'),
  L(/invert(ed)? sugar|סוכר אינוורטי|סוכר אינברטי/, 'substance', 'invert sugar', 'strong'),
  L(/\bdextrose\b|דקסטרוז/, 'substance', 'dextrose', 'strong'),
  L(/\bfructose\b|פרוקטוז/, 'substance', 'fructose', 'moderate'),
  L(/juice concentrate|concentrated .*juice|מיץ מרוכז|תרכיז מיץ/, 'substance', 'fruit-juice concentrate', 'moderate'),
  L(/hydrogenated|interesterified|מוקשה|מעובר אסטר/, 'substance', 'hydrogenated / interesterified fat', 'strong'),
  L(/modified (corn |maize |potato |tapioca |wheat )?starch|e14\d\d|עמילן מעובד|עמילן מותמר/, 'substance', 'modified starch', 'moderate'),
  L(/mechanically separated|בשר מופרד מכנית/, 'substance', 'mechanically separated meat', 'strong'),
  L(/vital wheat gluten|wheat gluten|גלוטן חיטה/, 'substance', 'gluten', 'moderate'),
  L(/polydextrose|e1200|פולידקסטרוז/, 'cosmetic', 'bulking agent', 'strong'),
  L(/inulin|fructooligosaccharide|oligofructose|אינולין/, 'substance', 'added fibre isolate', 'moderate'),
  // Cosmetic additives
  L(/flavou?r(ing)?s?\b|aroma\b|חומרי? טעם וריח|חומר טעם|תמצית(?! וניל טבעית)/, 'cosmetic', 'flavouring', 'strong'),
  L(/colou?r(s|ing)?\b|e1[0-8]\d\b|caramel colou?r|e150[a-d]?|titanium dioxide|beta[- ]carotene \(colou?r\)|צבע מאכל|צבעי מאכל|\bצבע\b|קרמל \(צבע\)/, 'cosmetic', 'colour', 'strong'),
  L(/sweetener|aspartame|sucralose|acesulfame|saccharin|cyclamate|steviol|stevia|e95[0-9]|e96[0-9]|neotame|advantame|ממתיק|אספרטיים|אספרטם|סוכרלוז|אצסולפם|סכרין|ציקלמט|סטיביה/, 'cosmetic', 'non-sugar sweetener', 'strong'),
  L(/sorbitol|maltitol|xylitol|erythritol|isomalt|lactitol|e42[01]|e96[5-8]|סורביטול|מלטיטול|קסיליטול|אריתריטול/, 'cosmetic', 'sugar alcohol (sweetener)', 'strong'),
  L(/monosodium glutamate|\bmsg\b|e62[0-9]|e63[0-9]|disodium (inosinate|guanylate)|yeast extract|flavou?r enhancer|מונוסודיום גלוטמט|משפרי? טעם|תמצית שמרים/, 'cosmetic', 'flavour enhancer', 'strong'),
  L(/emulsifier|lecithin|e322|mono-? ?and di-?glycerides|e47[0-9]|e481|e482|polysorbate|e43[2-6]|e491|e492|מתחלב|לציטין/, 'cosmetic', 'emulsifier', 'moderate'),
  L(/carrageenan|e407|carboxymethyl ?cellulose|cellulose gum|e466|xanthan|e415|guar|e412|locust bean|carob gum|e410|gellan|e418|agar|e406|methylcellulose|e461|e464|קרגינן|קסנטן|גואר|חרובית|מסמיך|מייצב|ג'לן|גלאן/, 'cosmetic', 'thickener / stabiliser', 'moderate'),
  L(/pectin|e440|gelatin|gelling agent|פקטין|ג'לטין|ג׳לטין|חומר ג'ל/, 'cosmetic', 'gelling agent', 'moderate'),
  L(/glazing agent|shellac|carnauba|e90[1-4]|חומר הברקה|שלאק/, 'cosmetic', 'glazing agent', 'strong'),
  L(/anti-?foaming|dimethylpolysiloxane|e900|נוגד קצף/, 'cosmetic', 'anti-foaming agent', 'strong'),
  L(/emulsifying salts?|sodium (citrate|phosphate)s? \(emulsif|e33[19] \(emulsif|e45[0-2]|polyphosphate|diphosphate|triphosphate|מלחי התחלבות|פוספט/, 'cosmetic', 'emulsifying salts / phosphates', 'moderate'),
  L(/carbonat(ing|ed)|carbon dioxide|e290|פחמן דו חמצני|מוגז/, 'cosmetic', 'carbonation', 'moderate'),
  // Purposes that do NOT by themselves indicate ultra-processing
  L(/preservative|sorbate|sorbic|benzoate|benzoic|e2[01]\d\b|nitrite|nitrate|e25[0-2]|sulphite|sulfite|metabisulphite|e22[0-8]|propionate|e28[0-3]|natamycin|nisin|חומר משמר|חומרים משמרים|משמר|סורבט|בנזואט|ניטריט|ניטראט|סולפיט|פרופיונט/, 'preservative', 'preservative'),
  L(/antioxidant|ascorbic|ascorbate|tocopherol|rosemary extract|e30[0-9]|e31[0-9]|e320|e321|bha|bht|נוגד חמצון|נוגדי חמצון|חומצה אסקורבית|טוקופרול/, 'preservative', 'antioxidant'),
  L(/citric acid|lactic acid|acetic acid|malic acid|acidity regulator|acidifier|e33[0-3]|e270|e26[0-3]|e296|sodium bicarbonate \(acid|חומצת לימון|חומצה ציטרית|חומצה לקטית|מווסת חומציות|מחמצן/, 'acidity', 'acidity regulator'),
  L(/vitamin|niacin|riboflavin|thiamin|folic acid|cholecalciferol|calcium carbonate|tricalcium phosphate|iron|ferrous|zinc|iodine|iodate|ויטמין|ניאצין|ריבופלבין|תיאמין|חומצה פולית|ברזל|אבץ|יוד|סידן/, 'fortificant', 'fortificant (vitamin/mineral)'),
  L(/\byeast\b|sourdough|culture|cultures|starter|enzymes?|rennet|baking powder|raising agent|leavening|sodium bicarbonate|baking soda|e500|e503|שמרים|מחמצת|תרבית|תרביות|חיידקי|אנזים|אבקת אפייה|סודה לשתייה|מחמיר/, 'aid', 'processing aid / culture'),
  L(/anti-?caking|silicon dioxide|e551|e470|e341|e170 \(anti|נוגד התגבשות|נוגד גיבוש/, 'other', 'anti-caking agent'),
  // Culinary ingredients (NOVA 2)
  L(/^(cane |brown |raw |white |coconut )?sugar$|^sucrose$|^סוכר( קנים| חום| לבן)?$/, 'culinary', 'sugar'),
  L(/\bsalt\b|sea salt|sodium chloride|^מלח|מלח ים/, 'culinary', 'salt'),
  L(/\b(olive|sunflower|rapeseed|canola|palm|coconut|soybean|soya|vegetable|corn|sesame|peanut|cottonseed|avocado|rice bran) oil\b|^oil$|palm fat|vegetable fat|שמן|שומן צמחי|שומן דקלים|שמן דקל/, 'culinary', 'oil / fat'),
  L(/\bbutter\b|ghee|lard|tallow|חמאה|גהי|שומן חזיר/, 'culinary', 'butter / animal fat'),
  L(/vinegar|חומץ/, 'culinary', 'vinegar'),
  L(/\bhoney\b|maple syrup|molasses|date syrup|silan|דבש|סילאן|מולסה|סירופ מייפל/, 'culinary', 'honey / syrup'),
  L(/^(corn |potato |tapioca |wheat |rice )?starch$|^עמילן( תירס| תפוחי אדמה)?$/, 'culinary', 'starch'),
  L(/\bwater\b|^מים$/, 'aid', 'water'),
];

// Whole foods (NOVA 1 items as ingredients): from the food database aliases plus common ingredient words.
const WHOLE_WORDS = [
  'wheat', 'flour', 'whole wheat', 'whole grain', 'wholemeal', 'oat', 'oats', 'rice', 'corn', 'maize', 'barley', 'rye', 'spelt', 'semolina', 'durum', 'buckwheat', 'quinoa', 'millet',
  'milk', 'skimmed milk', 'cream', 'yogurt', 'cheese', 'egg', 'eggs', 'chicken', 'beef', 'pork', 'turkey', 'fish', 'tuna', 'salmon',
  'tomato', 'tomatoes', 'potato', 'potatoes', 'onion', 'garlic', 'carrot', 'pepper', 'peppers', 'spinach', 'peas', 'beans', 'lentils', 'chickpeas', 'soy', 'soybeans', 'soya beans',
  'cocoa', 'cocoa butter', 'cocoa mass', 'peanuts', 'almonds', 'hazelnuts', 'walnuts', 'cashews', 'sesame', 'tahini', 'raisins', 'dates', 'apple', 'apples', 'strawberries', 'banana', 'fruit', 'fruits', 'vegetables',
  'spices', 'herbs', 'paprika', 'turmeric', 'cumin', 'cinnamon', 'black pepper', 'oregano', 'basil', 'parsley', 'vanilla', 'vanilla bean', 'chia', 'flaxseed', 'sunflower seeds', 'pumpkin seeds', 'coffee', 'tea',
  'קמח', 'קמח חיטה', 'קמח חיטה מלא', 'קמח מלא', 'חיטה', 'שיבולת שועל', 'אורז', 'תירס', 'שעורה', 'שיפון', 'כוסמין', 'סולת', 'קוואקר',
  'חלב', 'אבקת חלב', 'שמנת', 'יוגורט', 'גבינה', 'ביצים', 'ביצה', 'אבקת ביצים', 'עוף', 'בקר', 'הודו', 'דג', 'טונה',
  'עגבניות', 'עגבנייה', 'רסק עגבניות', 'תפוחי אדמה', 'בצל', 'שום', 'גזר', 'פלפל', 'תרד', 'אפונה', 'שעועית', 'עדשים', 'חומוס', 'סויה', 'פולי סויה',
  'קקאו', 'אבקת קקאו', 'חמאת קקאו', 'מסת קקאו', 'בוטנים', 'שקדים', 'אגוזי לוז', 'אגוזי מלך', 'קשיו', 'שומשום', 'טחינה', 'צימוקים', 'תמרים', 'תפוחים', 'תותים', 'בננה', 'פירות', 'ירקות',
  'תבלינים', 'פפריקה', 'כורכום', 'כמון', 'קינמון', 'פלפל שחור', 'אורגנו', 'בזיליקום', 'פטרוזיליה', 'וניל', 'צ׳יה', 'צ\'יה', 'פשתן', 'גרעיני חמנייה', 'גרעיני דלעת', 'קפה', 'תה', 'שקדים טחונים', 'מלח ים',
];
const WHOLE_SET = new Set([...WHOLE_WORDS, ...Object.entries(ALIASES).filter(([id]) => (FOOD_MAP[id]?.nova || 1) === 1).flatMap(([, a]) => a)].map((s) => s.toLowerCase()));

export const PURPOSE_HE = {
  'hydrolysed protein': 'חלבון מפורק', 'protein isolate': 'חלבון מבודד', 'protein concentrate': 'תרכיז חלבון', 'added milk protein': 'חלבון חלב מוסף', 'whey protein': 'חלבון מי גבינה', casein: 'קזאין',
  maltodextrin: 'מלטודקסטרין', 'high-fructose / glucose-fructose syrup': 'סירופ גלוקוז-פרוקטוז', 'glucose syrup': 'סירופ גלוקוז', 'invert sugar': 'סוכר אינוורטי', dextrose: 'דקסטרוז', fructose: 'פרוקטוז',
  'fruit-juice concentrate': 'תרכיז מיץ פירות', 'hydrogenated / interesterified fat': 'שומן מוקשה / מעובר אסטר', 'modified starch': 'עמילן מעובד', 'mechanically separated meat': 'בשר מופרד מכנית', gluten: 'גלוטן',
  'bulking agent': 'חומר מנפח', 'added fibre isolate': 'סיב מבודד מוסף', flavouring: 'חומרי טעם וריח', colour: 'צבע מאכל', 'non-sugar sweetener': 'ממתיק', 'sugar alcohol (sweetener)': 'רב-כוהל (ממתיק)',
  'flavour enhancer': 'משפר טעם', emulsifier: 'מתחלב', 'thickener / stabiliser': 'מסמיך / מייצב', 'gelling agent': 'חומר ג׳ל', 'glazing agent': 'חומר הברקה', 'anti-foaming agent': 'נוגד קצף',
  'emulsifying salts / phosphates': 'מלחי התחלבות / פוספטים', carbonation: 'הגזה', preservative: 'חומר משמר', antioxidant: 'נוגד חמצון', 'acidity regulator': 'מווסת חומציות',
  'fortificant (vitamin/mineral)': 'העשרה (ויטמין/מינרל)', 'processing aid / culture': 'חומר עזר / תרבית', 'anti-caking agent': 'נוגד התגבשות', sugar: 'סוכר', salt: 'מלח', 'oil / fat': 'שמן / שומן',
  'butter / animal fat': 'חמאה / שומן מן החי', vinegar: 'חומץ', 'honey / syrup': 'דבש / סירופ', starch: 'עמילן', water: 'מים', 'whole food': 'מזון מלא',
};
const he = (p) => PURPOSE_HE[p] || p;

const clean = (s) => s.toLowerCase().replace(/[*•]/g, '').replace(/\b(organic|אורגני(ת|ים)?)\b/g, '').replace(/\s+/g, ' ').trim();

function classifyIngredient(raw) {
  const s = clean(raw);
  for (const e of LEX) if (e.re.test(s)) return { text: raw, cls: e.cls, purpose: e.purpose, purposeHe: he(e.purpose), strength: e.strength };
  if (WHOLE_SET.has(s)) return { text: raw, cls: 'whole', purpose: 'whole food', purposeHe: 'מזון מלא' };
  // Partial match: "toasted hazelnuts", "קמח חיטה מלא (60%)"
  for (const w of WHOLE_SET) if (w.length >= 3 && (s.startsWith(w + ' ') || s.endsWith(' ' + w) || s === w || s.includes(` ${w} `))) return { text: raw, cls: 'whole', purpose: 'whole food', purposeHe: 'מזון מלא' };
  return { text: raw, cls: 'unknown', purpose: null, purposeHe: null };
}

const PROC_INDICATORS = [
  [/extru(ded|sion)|puffed|נפוח|אקסטרוז/, 'extrusion / puffing', 'strong'],
  [/reconstituted|reformed|moulded|molded|משוחזר|מעוצב/, 'reconstitution / moulding', 'strong'],
  [/pre-?fried|deep-?fried|מטוגן מראש/, 'pre-frying', 'moderate'],
  [/hydrogenat/, 'hydrogenation', 'strong'],
  [/pasteuri[sz]ed|uht|sterili[sz]ed|מפוסטר|מעוקר/, 'pasteurisation / sterilisation (compatible with NOVA 1–3)', 'neutral'],
  [/fermented|מותסס/, 'fermentation (compatible with NOVA 1–3)', 'neutral'],
  [/smoked|cured|מעושן|כבוש/, 'smoking / curing', 'neutral'],
];

/**
 * @param {string} ingredientsText  verbatim ingredient list (may be Hebrew or English)
 * @param {object} opts { processingInfo?: string, listComplete?: boolean, source?: string }
 */
export function assessNova(ingredientsText, opts = {}) {
  const text = String(ingredientsText || '').trim();
  const missing = [];
  if (!text || text.length < 3) {
    missing.push({ en: 'Ingredient list not available.', he: 'רשימת הרכיבים אינה זמינה.' });
    if (!opts.processingInfo) missing.push({ en: 'No information about processing methods.', he: 'אין מידע על שיטות העיבוד.' });
    return { group: null, confidence: null, insufficient: true, message: INSUFFICIENT, explanation: { en: 'NOVA is assessed only from the actual ingredient list, never from a product name, brand or category.', he: 'סיווג NOVA נקבע רק לפי רשימת הרכיבים בפועל, לעולם לא לפי שם המוצר, המותג או הקטגוריה.' }, ingredients: [], supporting: [], indicators: [], missing };
  }
  const parts = splitIngredients(text);
  const ings = parts.map(classifyIngredient);
  const by = (cls) => ings.filter((i) => i.cls === cls);
  // Count each additive PURPOSE once ("emulsifiers (E471, E481)" is one emulsifier function).
  const distinct = (arr) => arr.filter((x, i, a) => a.findIndex((y) => y.purpose === x.purpose) === i);
  const strong = distinct(ings.filter((i) => (i.cls === 'cosmetic' || i.cls === 'substance') && i.strength === 'strong'));
  const moderate = distinct(ings.filter((i) => (i.cls === 'cosmetic' || i.cls === 'substance') && i.strength === 'moderate'));
  const unknown = by('unknown');
  const whole = by('whole'); const culinary = by('culinary');
  const procText = `${opts.processingInfo || ''}`.toLowerCase();
  const indicators = PROC_INDICATORS.filter(([re]) => re.test(procText) || re.test(text.toLowerCase())).map(([, label, weight]) => ({ label, weight }));
  const strongProc = indicators.filter((x) => x.weight === 'strong').length;

  const unknownShare = ings.length ? unknown.length / ings.length : 1;
  const firstThree = ings.slice(0, 3);
  const culinaryLed = firstThree.some((i) => i.cls === 'culinary' && /sugar|oil/.test(i.purpose));

  let group; let confidence; let borderline = false; let explanation;
  if (strong.length + strongProc >= 1 || moderate.length >= 2) {
    group = 4;
    confidence = strong.length + strongProc >= 2 || (strong.length >= 1 && moderate.length >= 1) ? 'high' : 'medium';
    explanation = {
      en: `Contains ${[...strong, ...moderate].map((i) => i.purpose).filter((v, i, a) => a.indexOf(v) === i).join(', ')}${strongProc ? ' and industrial processing indicators' : ''} — ingredients/processes used to make industrial formulations, not found in home cooking. This fits NOVA group 4 (ultra-processed).`,
      he: `מכיל ${[...strong, ...moderate].map((i) => i.purposeHe).filter((v, i, a) => a.indexOf(v) === i).join(', ')} — רכיבים/תהליכים של פורמולציה תעשייתית שאינם בשימוש בבישול ביתי. מתאים לקבוצת NOVA 4 (אולטרה-מעובד).`,
    };
  } else if (moderate.length === 1) {
    borderline = true;
    group = culinaryLed || whole.length === 0 ? 4 : 3;
    confidence = 'low';
    explanation = {
      en: `Only one ${moderate[0].cls === 'substance' ? 'industrial ingredient (rarely used in home cooking)' : 'additive with a cosmetic function'} (${moderate[0].purpose}: “${moderate[0].text}”). Whether this is processed (NOVA 3) or ultra-processed (NOVA 4) depends on the overall formulation; ${group === 4 ? 'sugar/oil-led formulation suggests NOVA 4' : 'a mostly whole-food formulation suggests NOVA 3'}. Treat as borderline.`,
      he: `רק ${moderate[0].cls === 'substance' ? 'רכיב תעשייתי אחד (שאינו בשימוש רגיל בבישול ביתי)' : 'תוסף אחד בעל תפקיד קוסמטי'} (${moderate[0].purposeHe}: ״${moderate[0].text}״). האם מדובר במזון מעובד (NOVA 3) או אולטרה-מעובד (NOVA 4) תלוי בפורמולציה הכוללת; ${group === 4 ? 'פורמולציה המבוססת על סוכר/שמן מרמזת על NOVA 4' : 'פורמולציה המבוססת בעיקר על מזון מלא מרמזת על NOVA 3'}. גבולי.`,
    };
  } else if (whole.length && !culinary.length && !by('preservative').length && !by('acidity').length) {
    group = 1; confidence = 'high';
    explanation = { en: 'Only whole or minimally processed foods (plus water, cultures or fortificants). This fits NOVA group 1.', he: 'רק מזון מלא או מעובד מינימלית (ועוד מים, תרביות או העשרה). מתאים לקבוצת NOVA 1.' };
  } else if (!whole.length && culinary.length) {
    group = 2; confidence = 'high';
    explanation = { en: 'A culinary ingredient (oil, sugar, salt, butter, vinegar, honey or starch). This fits NOVA group 2.', he: 'רכיב בישול (שמן, סוכר, מלח, חמאה, חומץ, דבש או עמילן). מתאים לקבוצת NOVA 2.' };
  } else {
    group = 3; confidence = 'high';
    const extrasAll = [...culinary, ...by('preservative'), ...by('acidity')];
    const extras = extrasAll.map((i) => i.purpose).filter((v, i, a) => a.indexOf(v) === i);
    const extrasHe = extrasAll.map((i) => i.purposeHe).filter((v, i, a) => a.indexOf(v) === i);
    explanation = { en: `Whole foods with added ${extras.join(', ')}; preservatives and acidity regulators keep the food stable but are not ultra-processing markers. This fits NOVA group 3 (processed).`, he: `מזון מלא בתוספת ${extrasHe.join(', ')}; חומרים משמרים ומווסתי חומציות שומרים על יציבות המזון אך אינם סמני אולטרה-עיבוד. מתאים לקבוצת NOVA 3 (מעובד).` };
  }

  // Confidence adjustments
  const down = (c) => (c === 'high' ? 'medium' : 'low');
  if (unknownShare > 0.3) { confidence = down(confidence); missing.push({ en: `${unknown.length} ingredient(s) could not be identified: ${unknown.map((u) => u.text).slice(0, 5).join(', ')}.`, he: `${unknown.length} רכיבים לא זוהו: ${unknown.map((u) => u.text).slice(0, 5).join(', ')}.` }); }
  if (opts.listComplete === false || /\.\.\.|…$/.test(text)) { confidence = down(confidence); missing.push({ en: 'The ingredient list may be incomplete.', he: 'ייתכן שרשימת הרכיבים חלקית.' }); }
  if (!opts.processingInfo) missing.push({ en: 'The source gives no information about manufacturing processes (e.g. extrusion, frying).', he: 'המקור אינו מספק מידע על תהליכי הייצור (למשל אקסטרוזיה, טיגון).' });
  if (ings.length > 0 && unknownShare > 0.6) {
    return { group: null, confidence: null, insufficient: true, message: INSUFFICIENT, explanation: { en: 'Most ingredients could not be identified, so the formulation cannot be judged.', he: 'רוב הרכיבים לא זוהו, ולכן לא ניתן להעריך את הפורמולציה.' }, ingredients: ings, supporting: [], indicators, missing };
  }

  const supporting = ings.filter((i) => ['substance', 'cosmetic', 'preservative', 'acidity', 'culinary'].includes(i.cls) || (group === 1 && i.cls === 'whole'));
  return { group, confidence, borderline, insufficient: false, explanation, ingredients: ings, supporting, indicators, missing, counts: { total: ings.length, whole: whole.length, culinary: culinary.length, strong: strong.length, moderate: moderate.length, unknown: unknown.length } };
}
