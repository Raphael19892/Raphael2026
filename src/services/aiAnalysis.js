// =============================================================================
// aiAnalysis.js
// -----------------------------------------------------------------------------
// The "Smart Nutrition Diary" brain.
//
// analyzeMeal(freeText) takes a free-text meal description
// (e.g. "אכלתי קערת שיבולת שועל עם תפוח וכף צ'יה") and returns a strongly
// typed breakdown of the meal's dietary fiber: total grams plus a split into
// soluble / insoluble / resistant starch, per-ingredient detail, and a short
// science note.
//
// It uses an LLM with *structured tool calling* so the model is forced to
// return machine-readable JSON that matches FIBER_SCHEMA — no fragile parsing
// of prose. OpenAI is the default provider (as requested), but the transport
// is isolated in callLLM() so it can be swapped for Anthropic / any provider.
// =============================================================================

import Constants from 'expo-constants';

const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';
const MODEL = 'gpt-4o-mini'; // fast + cheap; upgrade to gpt-4o for max accuracy

// ---------------------------------------------------------------------------
// 1. THE STRUCTURED OUTPUT CONTRACT
// The model MUST call this "function" — that guarantees valid, typed JSON back.
// ---------------------------------------------------------------------------
export const FIBER_SCHEMA = {
  name: 'report_meal_fiber',
  description:
    'Report the dietary-fiber breakdown of a described meal, based on standard ' +
    'nutrition databases (USDA / peer-reviewed food composition data).',
  parameters: {
    type: 'object',
    properties: {
      dish_summary: {
        type: 'string',
        description: 'A short, clean restatement of the dish in the same language as the input.',
      },
      ingredients: {
        type: 'array',
        description: 'Each identified food component and its estimated fiber contribution.',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Ingredient name in the input language.' },
            estimated_grams: { type: 'number', description: 'Estimated edible weight in grams.' },
            soluble_fiber_g: { type: 'number' },
            insoluble_fiber_g: { type: 'number' },
            resistant_starch_g: { type: 'number' },
          },
          required: ['name', 'soluble_fiber_g', 'insoluble_fiber_g', 'resistant_starch_g'],
        },
      },
      total_soluble_g: { type: 'number', description: 'Sum of soluble fiber across ingredients.' },
      total_insoluble_g: { type: 'number', description: 'Sum of insoluble fiber across ingredients.' },
      total_resistant_starch_g: { type: 'number', description: 'Sum of resistant starch across ingredients.' },
      confidence: {
        type: 'string',
        enum: ['low', 'medium', 'high'],
        description: 'Model confidence given how specific the input portions were.',
      },
      science_note: {
        type: 'string',
        description:
          'ONE plain-language, evidence-based sentence about a notable fiber in this meal ' +
          '(e.g. chia mucilage & blood-sugar). Same language as the input. No medical claims.',
      },
    },
    required: [
      'dish_summary',
      'ingredients',
      'total_soluble_g',
      'total_insoluble_g',
      'total_resistant_starch_g',
      'confidence',
      'science_note',
    ],
  },
};

// ---------------------------------------------------------------------------
// 2. THE PROMPT
// System prompt encodes the "expertise": how to estimate the three fiber
// fractions and stay grounded in nutrition science.
// ---------------------------------------------------------------------------
const SYSTEM_PROMPT = `You are a registered dietitian and food-composition specialist.
Your single job: given a free-text meal description (any language, often Hebrew),
estimate its DIETARY FIBER content and split it into three physiologically
distinct fractions, then report it by calling the "report_meal_fiber" function.

The three fractions:
1. SOLUBLE fiber — dissolves in water, forms a gel, slows glucose absorption,
   lowers LDL. Rich sources: oats (beta-glucan), chia & flax (mucilage),
   psyllium, legumes, apples/citrus (pectin), barley.
2. INSOLUBLE fiber — "roughage", adds stool bulk, speeds transit. Rich sources:
   wheat bran, whole grains, vegetable & fruit skins, nuts, seeds.
3. RESISTANT STARCH — starch that escapes small-intestine digestion and is
   fermented in the colon (a potent prebiotic producing butyrate). Rich sources:
   cooked-then-cooled potato/rice/pasta, green bananas, legumes, whole oats.

Rules:
- Base estimates on standard food-composition data (USDA FoodData Central and
  peer-reviewed sources). Reason about realistic portion sizes when the user
  omits quantities (assume typical servings).
- Be numerically honest: a single apple has ~4 g total fiber, not 20 g.
- If portions are vague, still give best-estimate numbers and set confidence
  accordingly ("low"/"medium").
- The science_note must be a SINGLE evidence-based sentence, written in the SAME
  LANGUAGE as the user's input, easy for a layperson, and must NOT diagnose or
  promise cures.
- Always respond ONLY by calling the report_meal_fiber function.`;

// ---------------------------------------------------------------------------
// 3. TRANSPORT — the actual network call to the LLM.
//    Isolated so the provider can be swapped without touching analyzeMeal().
// ---------------------------------------------------------------------------
async function callLLM(userText, apiKey) {
  const res = await fetch(OPENAI_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: MODEL,
      temperature: 0.2, // low temperature -> stable, reproducible estimates
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userText },
      ],
      // Force the structured output.
      tools: [{ type: 'function', function: FIBER_SCHEMA }],
      tool_choice: { type: 'function', function: { name: FIBER_SCHEMA.name } },
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`LLM request failed (${res.status}): ${body}`);
  }

  const data = await res.json();
  const call = data?.choices?.[0]?.message?.tool_calls?.[0];
  if (!call?.function?.arguments) {
    throw new Error('LLM did not return a structured fiber report.');
  }
  return JSON.parse(call.function.arguments);
}

// ---------------------------------------------------------------------------
// 4. PUBLIC API — what the UI calls.
// ---------------------------------------------------------------------------

function resolveApiKey() {
  // Priority: runtime env (EXPO_PUBLIC_OPENAI_API_KEY) -> app.json extra.
  return (
    process.env.EXPO_PUBLIC_OPENAI_API_KEY ||
    Constants?.expoConfig?.extra?.openAiApiKey ||
    ''
  );
}

/**
 * Analyze one meal from free text.
 * @param {string} freeText  e.g. "קערת שיבולת שועל עם תפוח וכף צ'יה"
 * @returns {Promise<AnalyzedMeal>}  normalized, UI-ready object.
 */
export async function analyzeMeal(freeText) {
  const text = (freeText || '').trim();
  if (!text) throw new Error('Please describe what you ate.');

  const apiKey = resolveApiKey();
  const raw = apiKey ? await callLLM(text, apiKey) : mockAnalyze(text);
  return normalize(text, raw);
}

// Convert the LLM's raw structured output into the app's canonical shape,
// clamping negatives and recomputing totals defensively.
function normalize(inputText, raw) {
  const ingredients = (raw.ingredients || []).map((ing) => ({
    name: ing.name ?? '—',
    grams: pos(ing.estimated_grams),
    soluble: pos(ing.soluble_fiber_g),
    insoluble: pos(ing.insoluble_fiber_g),
    resistant: pos(ing.resistant_starch_g),
  }));

  // Trust the model's totals but fall back to summing ingredients if missing.
  const soluble = raw.total_soluble_g != null ? pos(raw.total_soluble_g) : sum(ingredients, 'soluble');
  const insoluble = raw.total_insoluble_g != null ? pos(raw.total_insoluble_g) : sum(ingredients, 'insoluble');
  const resistant = raw.total_resistant_starch_g != null ? pos(raw.total_resistant_starch_g) : sum(ingredients, 'resistant');

  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    createdAt: new Date().toISOString(),
    inputText,
    dishSummary: raw.dish_summary || inputText,
    ingredients,
    soluble: round1(soluble),
    insoluble: round1(insoluble),
    resistant: round1(resistant),
    totalFiber: round1(soluble + insoluble + resistant),
    confidence: raw.confidence || 'medium',
    scienceNote: raw.science_note || '',
  };
}

// --- small numeric helpers ---
const pos = (n) => Math.max(0, Number(n) || 0);
const sum = (arr, key) => arr.reduce((t, x) => t + (x[key] || 0), 0);
const round1 = (n) => Math.round(n * 10) / 10;

// ---------------------------------------------------------------------------
// 5. OFFLINE / NO-KEY FALLBACK
// A tiny heuristic estimator so the app is fully demoable without an API key.
// Keyword -> {soluble, insoluble, resistant} grams per typical portion.
// ---------------------------------------------------------------------------
const FOOD_DB = [
  { k: ['שיבולת שועל', 'קוואקר', 'oat', 'oatmeal'], s: 2.0, i: 2.0, r: 0.6, label: 'שיבולת שועל' },
  { k: ['צ׳יה', "צ'יה", 'chia'], s: 3.4, i: 3.9, r: 0.0, label: "צ'יה" },
  { k: ['פשתן', 'flax'], s: 1.1, i: 1.9, r: 0.0, label: 'פשתן' },
  { k: ['תפוח', 'apple'], s: 1.2, i: 2.8, r: 0.2, label: 'תפוח' },
  { k: ['בננה', 'banana'], s: 0.6, i: 2.0, r: 1.2, label: 'בננה' },
  { k: ['עדשים', 'עדשה', 'lentil'], s: 1.0, i: 6.8, r: 3.4, label: 'עדשים' },
  { k: ['שעועית', 'חומוס', 'bean', 'chickpea'], s: 1.5, i: 6.0, r: 4.5, label: 'קטניות' },
  { k: ['ברוקולי', 'broccoli'], s: 1.5, i: 4.0, r: 0.0, label: 'ברוקולי' },
  { k: ['אורז מלא', 'brown rice'], s: 0.3, i: 3.2, r: 1.2, label: 'אורז מלא' },
  { k: ['לחם מלא', 'whole bread', 'whole wheat'], s: 1.0, i: 4.0, r: 0.5, label: 'לחם מלא' },
  { k: ['תפוח אדמה', 'potato'], s: 0.7, i: 1.5, r: 3.0, label: 'תפוח אדמה' },
  { k: ['אבוקדו', 'avocado'], s: 4.6, i: 6.7, r: 0.0, label: 'אבוקדו' },
  { k: ['שקדים', 'אגוז', 'almond', 'nut'], s: 0.9, i: 2.6, r: 0.0, label: 'אגוזים' },
];

function mockAnalyze(text) {
  const lower = text.toLowerCase();
  const ingredients = [];
  for (const f of FOOD_DB) {
    if (f.k.some((kw) => lower.includes(kw.toLowerCase()))) {
      ingredients.push({
        name: f.label,
        estimated_grams: null,
        soluble_fiber_g: f.s,
        insoluble_fiber_g: f.i,
        resistant_starch_g: f.r,
      });
    }
  }
  if (ingredients.length === 0) {
    ingredients.push({
      name: 'מנה מעורבת',
      estimated_grams: null,
      soluble_fiber_g: 1.0,
      insoluble_fiber_g: 2.0,
      resistant_starch_g: 0.5,
    });
  }
  return {
    dish_summary: text,
    ingredients,
    total_soluble_g: sum(ingredients.map(mapKeys), 'soluble'),
    total_insoluble_g: sum(ingredients.map(mapKeys), 'insoluble'),
    total_resistant_starch_g: sum(ingredients.map(mapKeys), 'resistant'),
    confidence: 'low',
    science_note:
      'הערכה מקומית (ללא חיבור ל‑AI) — חברו מפתח OpenAI לקבלת ניתוח מדעי מדויק ומותאם אישית.',
  };
}
const mapKeys = (ing) => ({
  soluble: ing.soluble_fiber_g,
  insoluble: ing.insoluble_fiber_g,
  resistant: ing.resistant_starch_g,
});
