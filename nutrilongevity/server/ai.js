// AI integration (Claude via the official Anthropic SDK) with a transparent rule-based fallback
// that works without an API key. The model may only cite references from the curated library.
import Anthropic from '@anthropic-ai/sdk';
import { REFERENCES, REF_MAP } from '../shared/evidence.js';
import { FOODS, FOOD_MAP } from '../shared/foods.js';
import { sumItems, indicators } from '../shared/nutrition.js';
import { analyzeIngredients } from '../shared/nova.js';

const MODEL = process.env.NL_MODEL || 'claude-opus-5-5';
const EFFORT = process.env.NL_EFFORT || 'medium';

let client = null;
export function aiAvailable() {
  return Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
}
function getClient() {
  if (!client) client = new Anthropic();
  return client;
}

const LIBRARY = REFERENCES.map((r) => `[${r.id}] ${r.title} — ${r.journal} ${r.year}. Design: ${r.design}${r.n ? `, n=${r.n}` : ''}. Inference: ${r.inference}. Finding: ${r.findings} Limitations: ${r.limitations}`).join('\n');

const SYSTEM = `You are the nutrition assistant inside NutriLongevity AI, an evidence-based app focused on healthy ageing, cardiometabolic health, gut health and diet quality.

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

export function buildContext({ profile, targets, todayMeals, week, lang }) {
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

export async function chat({ history, message, contextText }) {
  if (!aiAvailable()) return { ...fallbackAnswer(message, contextText), mode: 'offline' };
  const messages = [
    ...history.map((h) => ({ role: h.role, content: h.content })),
    { role: 'user', content: `<user_context>\n${contextText}\n</user_context>\n\n${message}` },
  ];
  const resp = await getClient().beta.messages.create({
    model: MODEL,
    max_tokens: 16000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: { effort: EFFORT },
    system: [{ type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } }],
    messages,
  });
  if (resp.stop_reason === 'refusal') {
    return { text: 'I can’t help with that request. For medical questions please speak with your physician or a registered dietitian.', refs: [], mode: 'ai' };
  }
  const text = stripUnknownRefs(resp.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim());
  return { text, refs: extractRefs(text), mode: 'ai', model: resp.model };
}

const LABEL_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['productName', 'ingredientsText', 'per100', 'basis', 'servingSizeG', 'confidenceNotes'],
  properties: {
    productName: { type: 'string' },
    ingredientsText: { type: 'string' },
    basis: { type: 'string', enum: ['per100g', 'per100ml', 'perServingConverted', 'unknown'] },
    servingSizeG: { type: ['number', 'null'] },
    per100: {
      type: 'object', additionalProperties: false,
      required: ['kcal', 'protein', 'carbs', 'sugars', 'addedSugar', 'fat', 'satFat', 'fiber', 'sodium'],
      properties: Object.fromEntries(['kcal', 'protein', 'carbs', 'sugars', 'addedSugar', 'fat', 'satFat', 'fiber', 'sodium'].map((k) => [k, { type: ['number', 'null'] }])),
    },
    confidenceNotes: { type: 'string' },
  },
};

/** Read a nutrition label / ingredient list photo. Returns values exactly as printed (converted to per 100 g). */
export async function readLabel(imageBase64, mediaType) {
  if (!aiAvailable()) { const e = new Error('AI not configured'); e.status = 503; throw e; }
  const resp = await getClient().beta.messages.create({
    model: MODEL,
    max_tokens: 16000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: { effort: 'low', format: { type: 'json_schema', schema: LABEL_SCHEMA } },
    messages: [{
      role: 'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type: mediaType, data: imageBase64 } },
        { type: 'text', text: 'Transcribe this food label. Copy the ingredient list verbatim (translate to English only if it is not in English or Hebrew; keep Hebrew as is). Give nutrition values per 100 g (or per 100 ml); if only per-serving values are printed and the serving weight is printed, convert to per 100 g and set basis to perServingConverted. Sodium in mg (if only salt is printed, sodium = salt × 400 mg per g). Use null for anything not printed — never guess. Note any unreadable parts in confidenceNotes.' },
      ],
    }],
  });
  if (resp.stop_reason === 'refusal') { const e = new Error('Label could not be processed'); e.status = 422; throw e; }
  const text = resp.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
  return JSON.parse(text);
}

// ── Offline, rule-based assistant ─────────────────────────────────────────
// Deterministic answers built from the food table and evidence library, used when no API key is set.
function topBy(key, n = 8, filter = () => true) {
  return FOODS.filter(filter).filter((f) => f.per100.kcal > 0).sort((a, b) => b.per100[key] - a.per100[key]).slice(0, n);
}

export function fallbackAnswer(message, contextText = '') {
  const q = String(message || '').toLowerCase();
  const he = /[֐-׿]/.test(q);
  const L = (en, h) => (he ? h : en);
  const has = (...w) => w.some((x) => q.includes(x));
  let text; let refs = [];

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

export { sumItems, indicators };
