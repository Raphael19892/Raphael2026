// Offline assistant + context builder, shared by the server and the browser-only demo.
import { REF_MAP, REFERENCES } from './evidence.js';
import { FOODS, FOOD_MAP } from './foods.js';
import { sumItems } from './nutrition.js';
import { analyzeIngredients } from './nova.js';

const LIBRARY = REFERENCES.map((r) => `[${r.id}] ${r.title} — ${r.journal} ${r.year}. Design: ${r.design}${r.n ? `, n=${r.n}` : ''}. Inference: ${r.inference}. Finding: ${r.findings} Limitations: ${r.limitations}`).join('\n');

export const SYSTEM_PROMPT = `You are the nutrition assistant inside NutriLongevity AI, an evidence-based app focused on healthy ageing, cardiometabolic health, gut health and diet quality.

How to answer:
- Be practical and specific to the user's profile, targets and logged/planned food (given in <user_context>). Prefer whole-food, Mediterranean / Green-Mediterranean, DASH and plant-forward patterns.
- Ground claims in the evidence library below. Cite with the exact tag [ref:ID] using only IDs from the library. Never invent studies, numbers or DOIs. If no library entry supports a point, say it is general nutrition knowledge or that evidence is limited.
- Always distinguish association from causation, and established findings from emerging research (e.g. most microbiome findings are emerging). State uncertainty plainly, including inter-individual variation (e.g. glucose responses).
- Nutrient numbers for foods must come from the food table provided in the user context; if a value is not there, say it is an estimate.
- Safety: you do not diagnose, treat or replace a physician or registered dietitian. Respect the user's allergies, conditions and medications; flag anything potentially unsafe (e.g. warfarin and vitamin K, kidney disease and potassium/protein, glucose-lowering drugs and carbohydrate changes, pregnancy, eating-disorder history — never encourage restriction in that case). Recommend professional care for symptoms, red flags or medical decisions.
- Do not present any composite score as a validated measure of longevity.
- Reply in the user's language (Hebrew or English as given). Keep answers concise: short paragraphs or bullets, under ~250 words unless asked for more.

<evidence_library>
${LIBRARY}
</evidence_library>`;

function foodTable(ids) {
  return ids.map((id) => FOOD_MAP[id]).filter(Boolean).map((f) => {
    const p = f.per100;
    return `${f.id}: ${f.name.en} per100g kcal ${p.kcal}, protein ${p.protein} g, carbs ${p.carbs} g, fiber ${p.fiber} g, fat ${p.fat} g (sat ${p.satFat}), sugars ${p.sugars} g, sodium ${p.sodium} mg, NOVA ${f.nova}, source ${f.status}`;
  }).join('\n');
}

export function buildContext({ profile, targets, todayMeals, week, lang, todayLogs = [] }) {
  const lines = [];
  lines.push(`Language: ${lang === 'he' ? 'Hebrew' : 'English'}`);
  if (profile) lines.push(`Profile: age ${profile.age}, sex ${profile.sex}, ${profile.heightCm} cm, ${profile.weightKg} kg, activity ${profile.activity}, goal ${profile.goal}, diet ${profile.diet}, allergies ${(profile.allergies || []).join(', ') || 'none'}, conditions ${(profile.conditions || []).join(', ') || 'none'}, medications: ${profile.medications || 'none stated'}, strength sessions/week ${profile.strengthTraining || 0}.`);
  if (targets) lines.push(`Targets: ${targets.kcal} kcal, protein ≥${targets.protein} g, fibre ≥${targets.fiber} g, sat fat <${targets.satFatMax} g, sodium <${targets.sodiumMax} mg, added sugar <${targets.addedSugarMax} g.`);
  const ids = new Set();
  if (todayMeals?.length) {
    lines.push("Today's planned meals:");
    for (const m of todayMeals) {
      const t = sumItems(m.items);
      m.items.forEach((i) => i.foodId && ids.add(i.foodId));
      lines.push(`- ${m.slot}: ${m.name?.en || m.title} — ${m.items.map((i) => `${i.foodId || i.product?.name?.en} ${i.grams} g`).join(', ')} | ${Math.round(t.kcal)} kcal, P ${Math.round(t.protein)} g, fibre ${Math.round(t.fiber)} g, sodium ${Math.round(t.sodium)} mg`);
    }
  }
  if (todayLogs.length) {
    lines.push("Meals logged today (food diary, most recent last):");
    for (const l of todayLogs) {
      const t = sumItems(l.items);
      lines.push(`- ${l.slot}: ${l.title || ''} — ${l.items.map((i) => `${i.foodId || i.product?.name?.en} ${i.grams} g`).join(', ')} | ${Math.round(t.kcal)} kcal, P ${Math.round(t.protein)} g, fibre ${Math.round(t.fiber)} g, added sugar ${Math.round(t.addedSugar)} g, sodium ${Math.round(t.sodium)} mg${l.meta?.score != null ? `, meal quality score ${l.meta.score}/100 (app's descriptive index)` : ''}`);
      l.items.forEach((i) => i.foodId && ids.add(i.foodId));
    }
  }
  if (week && week.nDays) {
    lines.push(`Last 7 days (${week.nDays} days logged): avg ${Math.round(week.avg.kcal)} kcal, protein ${Math.round(week.avg.protein)} g, fibre ${Math.round(week.avg.fiber)} g, sodium ${Math.round(week.avg.sodium)} mg, ${week.ind.plantCount} different plants, UPF ${Math.round(week.ind.upfPct)}% of energy.`);
  }
  // Fibre-rich and relevant foods so the model can quote real values.
  ['lentils', 'chickpeas', 'black_beans', 'white_beans', 'oats', 'chia', 'flax', 'raspberries', 'pear', 'kiwi', 'almonds', 'bulgur', 'barley', 'avocado', 'prunes'].forEach((i) => ids.add(i));
  lines.push('Food table (USDA SR Legacy reference values unless stated):');
  lines.push(foodTable([...ids]));
  return lines.join('\n');
}

export function extractRefs(text) {
  const ids = [...new Set([...String(text).matchAll(/\[ref:([a-z0-9_]+)\]/gi)].map((m) => m[1]))];
  return ids.filter((id) => REF_MAP[id]);
}

export function stripUnknownRefs(text) {
  return String(text).replace(/\[ref:([a-z0-9_]+)\]/gi, (m, id) => (REF_MAP[id] ? m : ''));
}

// ── Offline, rule-based assistant ─────────────────────────────────────────
// Deterministic answers built from the food table and evidence library, used when no API key is set.
function topBy(key, n = 8, filter = () => true) {
  return FOODS.filter(filter).filter((f) => f.per100.kcal > 0).sort((a, b) => b.per100[key] - a.per100[key]).slice(0, n);
}

export function fallbackAnswer(message, contextText = '', extra = {}) {
  const q = String(message || '').toLowerCase();
  const he = /[֐-׿]/.test(q);
  const L = (en, h) => (he ? h : en);
  const has = (...w) => w.some((x) => q.includes(x));
  let text; let refs = [];

  const last = extra.lastMeal;
  if (last && extra.analyze && has('i ate', 'what i ate', 'my meal', 'this meal', 'improve', 'target', 'אכלתי', 'הארוחה', 'לשפר', 'יעד')) {
    const a = extra.analyze(last.items);
    const tg = extra.targets;
    const pct = (v, tv) => (tv ? Math.round((v / tv) * 100) : null);
    const lines = he
      ? [`הארוחה האחרונה ביומן: ${last.title || ''} — ציון איכות ${a.score ?? '—'}/100 (מדד תיאורי, לא מדד רפואי).`,
        a.evaluation.good.length ? `מה טוב: ${a.evaluation.good.map((g) => g.he).join(' ')}` : '',
        a.evaluation.bad.length ? `פחות מיטיב: ${a.evaluation.bad.map((g) => g.he).join(' ')}` : '',
        a.evaluation.missing.length ? `חסר: ${a.evaluation.missing.map((g) => g.he).join(' ')}` : '',
        a.suggestions.length ? `שיפור: ${a.suggestions.slice(0, 2).map((x) => `${x.he} (${x.before}→${x.after})`).join(' ')}` : '',
        tg ? `תרומה ליעד היומי: ${pct(a.totals.fiber, tg.fiber)}% מהסיבים, ${pct(a.totals.protein, tg.protein)}% מהחלבון.` : '']
      : [`Your last logged meal: ${last.title || ''} — meal quality score ${a.score ?? '—'}/100 (a descriptive index, not a medical measure).`,
        a.evaluation.good.length ? `Good: ${a.evaluation.good.map((g) => g.en).join(' ')}` : '',
        a.evaluation.bad.length ? `Less beneficial: ${a.evaluation.bad.map((g) => g.en).join(' ')}` : '',
        a.evaluation.missing.length ? `Missing: ${a.evaluation.missing.map((g) => g.en).join(' ')}` : '',
        a.suggestions.length ? `To improve: ${a.suggestions.slice(0, 2).map((x) => `${x.en} (score ${x.before}→${x.after})`).join(' ')}` : '',
        tg ? `Contribution to your daily targets: ${pct(a.totals.fiber, tg.fiber)}% of fibre, ${pct(a.totals.protein, tg.protein)}% of protein, ${pct(a.totals.kcal, tg.kcal)}% of energy.` : ''];
    const refs = [...new Set([...a.evaluation.good, ...a.evaluation.bad, ...a.evaluation.missing].flatMap((x) => x.refs))].slice(0, 6);
    return { text: lines.filter(Boolean).join('\n') + (refs.length ? '\n' + refs.map((r) => `[ref:${r}]`).join(' ') : ''), refs };
  }
  if (has('fiber', 'fibre', 'סיב')) {
    const list = topBy('fiber', 10, (f) => f.per100.kcal < 450 || ['chia', 'flax'].includes(f.id))
      .map((f) => `• ${f.name[he ? 'he' : 'en']}: ${f.per100.fiber} g/100 g${f.unit ? ` (~${(f.per100.fiber * f.unit[1] / 100).toFixed(1)} g per ${f.unit[0]})` : ''}`).join('\n');
    text = L(`Foods in the app's database with the most fibre (USDA reference values):\n${list}\n\nPractical: legumes (≈7–10 g per 100 g cooked) are the easiest big win. Higher fibre intake is associated with lower mortality and chronic disease in cohort studies, and trials show improved risk factors [ref:reynolds2019]. Increase gradually (~5 g/week) with fluids.`,
      `המזונות עם הכי הרבה סיבים במאגר (ערכי ייחוס USDA):\n${list}\n\nבפועל: קטניות (≈7–10 ג׳ ל-100 ג׳ מבושל) הן הדרך הקלה ביותר. צריכת סיבים גבוהה קשורה לתמותה ותחלואה נמוכות במחקרי עוקבה, וניסויים מראים שיפור בגורמי סיכון [ref:reynolds2019]. להעלות בהדרגה (~5 ג׳ בשבוע) עם שתייה.`);
  } else if (has('glucose', 'sugar spike', 'blood sugar', 'insulin', 'סוכר בדם', 'גלוקוז')) {
    text = L('Blood-glucose response to a meal depends on the amount and type of carbohydrate, fibre, protein and fat in the meal, food structure (intact grains and legumes digest slower), and the individual. Glycaemic index tables give average responses [ref:atkinson2021], but people respond very differently to the same foods [ref:zeevi2015]. Practical: pair starches with legumes/vegetables and protein, prefer intact whole grains, and keep fruit whole rather than juiced. If you take glucose-lowering medication, discuss changes with your clinician (risk of hypoglycaemia).',
      'תגובת הסוכר לארוחה תלויה בכמות ובסוג הפחמימה, בסיבים, בחלבון ובשומן, במבנה המזון (דגנים שלמים וקטניות מתעכלים לאט) ובאדם עצמו. טבלאות אינדקס גליקמי מציגות ממוצעים [ref:atkinson2021], אך אנשים מגיבים שונה מאוד לאותו מזון [ref:zeevi2015]. בפועל: לשלב פחמימות עם קטניות/ירקות וחלבון, להעדיף דגנים שלמים ופרי שלם. אם את/ה נוטל/ת תרופות להורדת סוכר — להתייעץ לפני שינויים.');
    refs = ['atkinson2021', 'zeevi2015'];
  } else if (has('ultra', 'processed', 'nova', 'מעובד')) {
    const a = analyzeIngredients(message.split(':').slice(1).join(':'));
    text = L(`NOVA classifies foods by processing. Ultra-processed foods (NOVA 4) are identified by industrial ingredients and cosmetic additives such as flavourings, emulsifiers, sweeteners or hydrolysed proteins [ref:monteiro2019]. In a small inpatient RCT, people ate ~500 kcal/day more on an ultra-processed diet [ref:hall2019]; large observational studies associate high UPF intake with many adverse outcomes, which shows association rather than proof of causation [ref:lane2024].${a.ingredients.length ? `\n\nYour ingredients → estimated NOVA ${a.nova}. ${a.reason}${a.upfMarkers.length ? ' Markers: ' + a.upfMarkers.map((m) => m.label).join(', ') + '.' : ''}` : '\n\nTip: paste the ingredient list after a colon (e.g. "Is this ultra-processed: oats, sugar, palm oil, emulsifier…") or use the Scanner.'}`,
      `NOVA מסווג מזון לפי מידת העיבוד. מזון אולטרה-מעובד (NOVA 4) מזוהה לפי רכיבים תעשייתיים ותוספים קוסמטיים כמו חומרי טעם, מתחלבים, ממתיקים או חלבונים מפורקים [ref:monteiro2019]. בניסוי קטן במחלקה אנשים אכלו כ-500 קק״ל ביום יותר בתזונה אולטרה-מעובדת [ref:hall2019]; מחקרים תצפיתיים גדולים מקשרים צריכה גבוהה לתוצאים שליליים רבים — קשר ולא הוכחה לסיבתיות [ref:lane2024].${a.ingredients.length ? `\n\nהרכיבים שלך ← NOVA משוער ${a.nova}.` : '\n\nטיפ: הדביקו את רשימת הרכיבים אחרי נקודתיים או השתמשו בסורק.'}`);
  } else if (has('exercise', 'workout', 'training', 'after gym', 'אימון', 'ספורט')) {
    text = L('After exercise, aim for a meal or snack with ~0.25–0.4 g protein per kg body weight (often 20–40 g) within a few hours, plus carbohydrate if you trained long or hard or train again soon [ref:jager2017]. Total daily protein matters most; gains from extra protein plateau around 1.6 g/kg/day [ref:morton2018]. Examples from your database: Greek yogurt (10 g protein/100 g) with fruit and oats; lentil–quinoa bowl; salmon with potatoes; tofu stir-fry with rice.',
      'אחרי אימון כדאי ארוחה/חטיף עם ~0.25–0.4 ג׳ חלבון לק״ג (לרוב 20–40 ג׳) בתוך כמה שעות, ופחמימה אם האימון היה ארוך/קשה [ref:jager2017]. סך החלבון היומי חשוב ביותר; התועלת מתוספת חלבון מתמתנת סביב 1.6 ג׳/ק״ג ליום [ref:morton2018]. דוגמאות: יוגורט יווני עם פרי ושיבולת שועל; קערת עדשים-קינואה; סלמון עם תפו״א; טופו מוקפץ עם אורז.');
  } else if (has('plant', 'diversity', 'variety', 'צמחים', 'מגוון')) {
    text = L('Plant diversity counts each different plant food (fruit, vegetables, legumes, whole grains, nuts, seeds, herbs) once per week. People reporting >30 plant types/week had more diverse gut microbiota in a cross-sectional study — an association, and the number 30 is a descriptive cut-off, not a proven target [ref:mcdonald2018]. Easy wins: a mixed-seed topping (chia + flax + pumpkin = 3), rotate your bean each meal, add herbs (parsley counts), buy a mixed bag of frozen berries, and swap one grain for buckwheat or barley.',
      'מגוון צמחים סופר כל מזון צמחי שונה פעם אחת בשבוע. אנשים שדיווחו על יותר מ-30 צמחים בשבוע היו בעלי מיקרוביום מגוון יותר במחקר חתך — קשר בלבד, והמספר 30 הוא נקודת חיתוך תיאורית [ref:mcdonald2018]. דרכים קלות: תערובת זרעים (צ׳יה + פשתן + דלעת = 3), לגוון שעועית, להוסיף עשבי תיבול, פירות יער קפואים מעורבים, ולהחליף דגן בכוסמת או גריסים.');
  } else if (has('breakfast', 'ארוחת בוקר')) {
    text = L('To improve a breakfast: (1) add a protein source (Greek yogurt, kefir, eggs, tofu, or legumes) — aim ~20–30 g; (2) add fibre and plants — oats, berries, ground flax or chia, a piece of fruit; (3) choose intact whole grains over sweetened cereals (often NOVA 4 with added sugars); (4) add a few nuts. Example from the app: overnight oats with kefir, blueberries, walnuts and chia ≈ 10+ g fibre. Fibre and whole grains are associated with lower chronic-disease risk [ref:reynolds2019] [ref:aune2016wg].',
      'לשיפור ארוחת בוקר: (1) להוסיף חלבון (יוגורט יווני, קפיר, ביצים, טופו או קטניות) — ~20–30 ג׳; (2) להוסיף סיבים וצמחים — שיבולת שועל, פירות יער, פשתן או צ׳יה, פרי; (3) להעדיף דגנים מלאים על פני דגני בוקר ממותקים; (4) להוסיף מעט אגוזים. דוגמה: לילה-אוטס עם קפיר, אוכמניות, אגוזי מלך וצ׳יה ≈ 10+ ג׳ סיבים [ref:reynolds2019] [ref:aune2016wg].');
  } else if (has('healthy', 'בריא', 'meal')) {
    const m = contextText.match(/Today's planned meals:\n([\s\S]*?)(\nLast 7|\nFood table)/);
    text = L(`"Healthy" depends on the whole diet, but a meal is generally better when it includes vegetables and/or fruit, a fibre-rich carbohydrate (whole grain or legume), a protein source, and unsaturated fat (olive oil, nuts), and is low in sodium, added sugar and ultra-processed ingredients. Check the meal card for its computed fibre, protein, sodium and NOVA mix.${m ? '\n\nYour meals today:\n' + m[1] : ''}\n\nThis pattern reflects Mediterranean-style evidence [ref:predimed2018] [ref:dinu2018]. Offline mode: connect an API key for a personalised analysis.`,
      `"בריא" תלוי בתזונה כולה, אך ארוחה טובה יותר כשהיא כוללת ירקות/פירות, פחמימה עשירה בסיבים (דגן מלא או קטנית), מקור חלבון ושומן בלתי רווי (שמן זית, אגוזים), ומעט נתרן, סוכר מוסף ורכיבים אולטרה-מעובדים [ref:predimed2018] [ref:dinu2018]. מצב לא מקוון: חברו מפתח API לניתוח אישי.`);
  } else {
    text = L('I’m running in offline mode (no AI key configured), so I can answer common questions about fibre, plant diversity, blood glucose, ultra-processed foods, post-exercise eating, and improving breakfast. Try one of those topics — or ask your administrator to set ANTHROPIC_API_KEY for full personalised answers.',
      'אני פועל במצב לא מקוון (ללא מפתח AI), ולכן אוכל לענות על שאלות נפוצות: סיבים, מגוון צמחים, סוכר בדם, מזון אולטרה-מעובד, תזונה אחרי אימון ושיפור ארוחת בוקר. נסו אחד מהנושאים — או בקשו מהמנהל להגדיר ANTHROPIC_API_KEY.');
  }
  refs = [...new Set([...refs, ...extractRefs(text)])];
  return { text, refs };
}


// ── AI meal parsing (shared by the Node server and the claude.ai page) ────
import { FOODS as ALL_FOODS } from './foods.js';
import { parseMeal } from './mealParser.js';

const VOCAB = ALL_FOODS.map((f) => `${f.id}: ${f.name.en} / ${f.name.he}${f.unit ? ` (1 ${f.unit[0]} ≈ ${f.unit[1]} g)` : ''}`).join('\n');

export const MEAL_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['items', 'questions', 'mealName'],
  properties: {
    mealName: { type: 'string' },
    items: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false,
        required: ['name', 'foodId', 'grams', 'quantity', 'cooking', 'per100', 'nova'],
        properties: {
          name: { type: 'string' },
          foodId: { type: ['string', 'null'] },
          grams: { type: 'number' },
          quantity: { type: 'string', enum: ['stated', 'estimated'] },
          cooking: { type: ['string', 'null'] },
          nova: { type: ['integer', 'null'] },
          per100: {
            type: ['object', 'null'], additionalProperties: false,
            required: ['kcal', 'protein', 'carbs', 'fat', 'satFat', 'fiber', 'sugars', 'addedSugar', 'sodium'],
            properties: Object.fromEntries(['kcal', 'protein', 'carbs', 'fat', 'satFat', 'fiber', 'sugars', 'addedSugar', 'sodium'].map((k) => [k, { type: 'number' }])),
          },
        },
      },
    },
    questions: { type: 'array', items: { type: 'string' } },
  },
};

export function mealParsePrompt(text, lang, hasImage) {
  return `You convert a person's description${hasImage ? ' and photo' : ''} of what they ate into structured food items for a nutrition app.

Food database (id: English / Hebrew, typical unit):
${VOCAB}

Rules:
- Split the meal into its foods. Map each to the database id of the SAME food (e.g. "whole wheat toast" → ww_bread, "omelette" → eggs plus oil). Break home-made or composite dishes into their likely ingredients from the database when that is reasonable (e.g. a home-made protein pancake → oats, eggs, whey, banana; shakshuka → eggs, tomato, onion, red_pepper, evoo).
- For a food that is not in the database and cannot be broken down (e.g. a branded product, schnitzel, falafel), set foodId to null and give your best per-100 g estimate in per100; otherwise set per100 to null. Always set nova to null — processing is assessed only from a real ingredient list, never guessed.
- grams: use the stated amount; otherwise estimate a typical adult portion and set quantity "estimated". Weights are as eaten (cooked grains and legumes are cooked weight). Add cooking oil when something was fried or sautéed and no fat is mentioned (typically 5 g per item).
- cooking: fried, baked, grilled, boiled, raw or null.
- questions: at most 2 short questions, only where an unclear amount would change the result a lot (e.g. "How many slices of pizza?"). Write them in ${lang === 'he' ? 'Hebrew' : 'English'}.
- mealName: a short name for the meal in ${lang === 'he' ? 'Hebrew' : 'English'}.
- Never invent nutrition values for foods that have a database id.

Meal description: """${String(text || '').slice(0, 2000)}"""`;
}

/** Convert the AI's JSON into app items; anything unusable falls back to the rule-based parser. */
export function normalizeAiMeal(json, text) {
  const items = [];
  for (const it of json?.items || []) {
    const grams = Math.max(1, Math.min(3000, Math.round(Number(it.grams) || 0)));
    if (!grams) continue;
    if (it.foodId && FOOD_MAP[it.foodId]) { items.push({ foodId: it.foodId, grams, label: it.name, quantity: it.quantity === 'stated' ? 'stated' : 'assumed', cooking: it.cooking || null }); continue; }
    const p = it.per100;
    if (!p || !Number.isFinite(Number(p.kcal))) continue;
    const per100 = {};
    for (const k of ['kcal', 'protein', 'carbs', 'fat', 'satFat', 'fiber', 'sugars', 'addedSugar', 'sodium']) per100[k] = Math.max(0, Number(p[k]) || 0);
    items.push({ grams, label: it.name, quantity: it.quantity === 'stated' ? 'stated' : 'assumed', cooking: it.cooking || null,
      product: { id: `ai:${String(it.name).slice(0, 40)}`, name: { en: it.name, he: it.name }, per100, nova: null, novaBasis: 'unknown', status: 'ai-estimate', emoji: '🍽️', tags: [] } });
  }
  if (!items.length) return parseMeal(text);
  return { items, questions: (json.questions || []).slice(0, 3).map((q) => ({ text: String(q) })), unrecognized: [], mealName: json.mealName || '', mode: 'ai' };
}
