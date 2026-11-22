// Product information extraction from retrieved content (HTML pages, pasted text, label photos, PDFs).
// The AI (or the heuristic parser) may only report what the source actually contains; unit conversions
// (kJ→kcal, salt↔sodium, per-serving→per-100 g) are done here in code and labelled "calculated".

const KEYS = ['kcal', 'protein', 'carbs', 'sugars', 'addedSugar', 'fat', 'satFat', 'fiber', 'sodium'];
const num = (v) => { if (v == null || v === '') return null; const n = Number(String(v).replace(',', '.').replace(/[^\d.\-]/g, '')); return Number.isFinite(n) ? n : null; };
const decode = (s) => s.replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d))).replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)));

/** Pull JSON-LD, meta tags and readable text out of an HTML page. */
export function parseHtml(html) {
  const jsonld = [];
  for (const m of html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try { const j = JSON.parse(m[1].trim()); jsonld.push(...(Array.isArray(j) ? j : j['@graph'] ? j['@graph'] : [j])); } catch { /* invalid block */ }
  }
  const meta = {};
  for (const m of html.matchAll(/<meta\s+[^>]*(?:property|name)=["']([^"']+)["'][^>]*content=["']([^"']*)["'][^>]*>/gi)) meta[m[1].toLowerCase()] = decode(m[2]);
  for (const m of html.matchAll(/<meta\s+[^>]*content=["']([^"']*)["'][^>]*(?:property|name)=["']([^"']+)["'][^>]*>/gi)) meta[m[2].toLowerCase()] ??= decode(m[1]);
  const title = decode((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '').trim());
  const lang = html.match(/<html[^>]*\blang=["']([^"']+)/i)?.[1] || null;
  const text = decode(html
    .replace(/<(script|style|noscript|svg|template|iframe)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<(br|\/p|\/div|\/li|\/tr|\/h\d|\/dt|\/dd|\/section)[^>]*>/gi, "\n")
    .replace(/<(td|th)[^>]*>/gi, ' | ')
    .replace(/<[^>]+>/g, ' '))
    .replace(/[ \t ]+/g, ' ').replace(/\n\s*\n+/g, '\n').trim();
  const products = jsonld.filter((o) => /Product|Food|MenuItem/i.test([].concat(o['@type'] || []).join(' ')));
  return { jsonld: products, meta, title, lang, text };
}

const KEYWORDS = /(ingredient|רכיבים|מרכיבים|nutrition|ערכים תזונתיים|סימון תזונתי|energy|אנרגיה|kcal|קלוריות|calories|allergen|אלרגנים|serving|מנה|per 100|ל-?100|100 ?(g|ml|גרם|מ"ל))/i;
/** Keep the parts of the page text that matter (around ingredient/nutrition keywords), capped in size. */
export function focusText(text, max = 24000) {
  if (text.length <= max) return text;
  const lines = text.split('\n');
  const keep = new Set();
  lines.forEach((l, i) => { if (KEYWORDS.test(l)) for (let k = Math.max(0, i - 3); k <= Math.min(lines.length - 1, i + 25); k++) keep.add(k); });
  let out = lines.slice(0, 40).join('\n') + '\n…\n' + [...keep].sort((a, b) => a - b).map((i) => lines[i]).join('\n');
  return out.slice(0, max);
}

// ── Heuristic extraction (no AI) ────────────────────────────────────────
const NUTRI_RE = [
  ['kcal', /(?:energy|energie|calories|אנרגיה|קלוריות)[^\n\d]{0,40}?(?:(\d+(?:[.,]\d+)?)\s*kj[^\n\d]{0,8})?(\d+(?:[.,]\d+)?)\s*(?:kcal|קק"ל|קלוריות)/i],
  ['kcalHe', /(?:אנרגיה|קלוריות)\s*\(?\s*(?:קלוריות|קק"ל|kcal)?\s*\)?[^\n\d]{0,12}(\d+(?:[.,]\d+)?)/i],
  ['satFat', /(?:saturat\w*|of which saturates|שומן רווי|חומצות שומן רוויות|מתוכם שומן רווי|מתוכן שומן רווי)[^\n\d]{0,20}(\d+(?:[.,]\d+)?)/i],
  ['fat', /(?:^|\n|\|)\s*(?:total fat|fat|שומנים|שומן)(?!\s*רווי)[^\n\d]{0,20}(\d+(?:[.,]\d+)?)/i],
  ['sugars', /(?:of which sugars|sugars|סוכרים|מתוכן סוכרים|מתוכם סוכרים)[^\n\d]{0,20}(\d+(?:[.,]\d+)?)/i],
  ['addedSugar', /(?:added sugars?|סוכר מוסף|סוכרים מוספים)[^\n\d]{0,20}(\d+(?:[.,]\d+)?)/i],
  ['carbs', /(?:carbohydrates?|פחמימות)[^\n\d]{0,20}(\d+(?:[.,]\d+)?)/i],
  ['fiber', /(?:fib(?:re|er)|dietary fib(?:re|er)|סיבים תזונתיים|סיבים)[^\n\d]{0,20}(\d+(?:[.,]\d+)?)/i],
  ['protein', /(?:proteins?|חלבונים|חלבון)[^\n\d]{0,20}(\d+(?:[.,]\d+)?)/i],
  ['sodium', /(?:sodium|נתרן)[^\n\d]{0,20}(\d+(?:[.,]\d+)?)\s*(mg|g|מ"ג|מג|גרם)?/i],
  ['salt', /(?:^|\n|\|)\s*(?:salt|מלח)[^\n\d]{0,20}(\d+(?:[.,]\d+)?)/i],
];

function jsonldNutrition(prod) {
  const n = prod?.nutrition;
  if (!n) return null;
  const g = (k) => num(n[k]);
  return {
    basis: /100/.test(String(n.servingSize || '')) ? (/ml/i.test(n.servingSize) ? 'per100ml' : 'per100g') : n.servingSize ? 'perServing' : 'unknown',
    servingSize: n.servingSize || null,
    values: { kcal: g('calories'), protein: g('proteinContent'), carbs: g('carbohydrateContent'), sugars: g('sugarContent'), fat: g('fatContent'), satFat: g('saturatedFatContent'), fiber: g('fiberContent'), sodium: n.sodiumContent ? (/mg/i.test(n.sodiumContent) ? g('sodiumContent') : g('sodiumContent') * 1000) : null, transFat: g('transFatContent') },
  };
}

export function heuristicExtract({ text = '', jsonld = [], meta = {}, title = '' }) {
  const prod = jsonld[0] || null;
  const brand = typeof prod?.brand === 'string' ? prod.brand : prod?.brand?.name || meta['product:brand'] || null;
  const name = prod?.name || meta['og:title'] || title || null;
  const ingM = text.match(/(?:ingredients|רכיבים|מרכיבים)\s*[:：]\s*([\s\S]{2,1500}?)(?=\n\s*(?:nutrition|ערכים תזונתיים|סימון תזונתי|allergen|אלרגנים|may contain|עלול להכיל|storage|אחסון|best before|ingredients|$)|$)/i);
  const ingredientsText = (prod?.ingredients || ingM?.[1] || '').toString().replace(/\s+/g, ' ').trim() || null;
  const jl = jsonldNutrition(prod);
  let values = jl?.values || {};
  let basis = jl?.basis || 'unknown';
  if (!jl) {
    const zone = text.match(/(?:nutrition|ערכים תזונתיים|סימון תזונתי|nutritional)[\s\S]{0,1500}/i)?.[0] || '';
    if (zone) {
      basis = /100\s*(ml|מ"ל|מל)/i.test(zone) ? 'per100ml' : /100\s*(g|גרם|gr)/i.test(zone) ? 'per100g' : 'unknown';
      for (const [k, re] of NUTRI_RE) {
        const m = zone.match(re); if (!m) continue;
        if (k === 'kcal') values.kcal = num(m[2]);
        else if (k === 'kcalHe') values.kcal ??= num(m[1]);
        else if (k === 'sodium') values.sodium = m[2] && /^(g|גרם)$/.test(m[2]) ? num(m[1]) * 1000 : num(m[1]);
        else values[k] ??= num(m[1]);
      }
    }
  }
  return {
    found: Boolean(ingredientsText || Object.values(values).some((v) => v != null)),
    productName: name, brand, manufacturer: prod?.manufacturer?.name || null,
    barcode: prod?.gtin13 || prod?.gtin || prod?.gtin12 || prod?.gtin8 || null, category: prod?.category || null, image: (Array.isArray(prod?.image) ? prod.image[0] : prod?.image?.url || prod?.image) || meta['og:image'] || null,
    ingredientsText, ingredientsComplete: null, processingInfo: null, claims: [], servingSize: jl?.servingSize || null, servingSizeG: null,
    basis, nutrition: values, quotes: { ingredients: ingM?.[0]?.slice(0, 300) || null, nutrition: null }, notes: 'Read automatically without AI — check against the label.',
  };
}

// ── AI extraction ──────────────────────────────────────────────────────
const NUTR_PROPS = Object.fromEntries(['kcal', 'kj', 'protein', 'carbs', 'sugars', 'addedSugar', 'fat', 'satFat', 'transFat', 'fiber', 'sodium', 'salt'].map((k) => [k, { type: ['number', 'null'] }]));
export const PRODUCT_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['found', 'productName', 'brand', 'manufacturer', 'barcode', 'category', 'ingredientsText', 'ingredientsComplete', 'processingInfo', 'claims', 'servingSize', 'servingSizeG', 'basis', 'nutrition', 'quotes', 'notes'],
  properties: {
    found: { type: 'boolean' }, productName: { type: ['string', 'null'] }, brand: { type: ['string', 'null'] }, manufacturer: { type: ['string', 'null'] },
    barcode: { type: ['string', 'null'] }, category: { type: ['string', 'null'] }, ingredientsText: { type: ['string', 'null'] }, ingredientsComplete: { type: ['boolean', 'null'] },
    processingInfo: { type: ['string', 'null'] }, claims: { type: 'array', items: { type: 'string' } }, servingSize: { type: ['string', 'null'] }, servingSizeG: { type: ['number', 'null'] },
    basis: { type: 'string', enum: ['per100g', 'per100ml', 'perServing', 'unknown'] },
    nutrition: { type: 'object', additionalProperties: false, required: Object.keys(NUTR_PROPS), properties: NUTR_PROPS },
    quotes: { type: 'object', additionalProperties: false, required: ['ingredients', 'nutrition'], properties: { ingredients: { type: ['string', 'null'] }, nutrition: { type: ['string', 'null'] } } },
    notes: { type: 'string' },
  },
};

export function productPrompt({ kind, url, retrievedAt, content, jsonld }) {
  return `You extract food-product information for a nutrition app. ${kind === 'url' ? `The content below was retrieved from ${url} on ${retrievedAt}.` : kind === 'image' ? 'The input is a photo of a product label or package.' : kind === 'pdf' ? 'The input is a product specification document.' : 'The input is text pasted by the user.'}

Strict rules:
- Report ONLY what the source states. Never fill gaps from your own knowledge of the brand or product, never guess ingredients or numbers. Use null for anything not present.
- ingredientsText: copy the ingredient list verbatim in its original language (Hebrew stays Hebrew), including percentages and sub-ingredients in brackets. Set ingredientsComplete=false if it looks cut off.
- nutrition: copy the numbers for ONE basis, preferring per 100 g / 100 ml if the source gives it; set basis accordingly ("perServing" only if no per-100 values exist). Give kcal and kJ as printed; give sodium in mg only if sodium is printed, and salt in g only if salt is printed. Do not convert units.
- servingSize as printed; servingSizeG only if a gram/ml amount is printed.
- processingInfo: only explicit statements about how it is made (e.g. "extruded", "fried", "cold-pressed", "pasteurised"); otherwise null.
- claims: marketing or health claims as printed (e.g. "high protein", "no added sugar").
- quotes: short verbatim excerpts of the source showing where you found the ingredients and the nutrition table.
- found=false if the source is not about a specific food product or shows neither ingredients nor nutrition (e.g. a login page, a category listing, a page whose content did not load).
- notes: one sentence on anything unclear (e.g. "nutrition table not in the page text; it may be an image").
${jsonld?.length ? `\nStructured data found in the page (JSON-LD):\n${JSON.stringify(jsonld).slice(0, 6000)}\n` : ''}${content ? `\nSOURCE CONTENT:\n"""\n${content}\n"""` : ''}`;
}

/** Turn an extraction (AI or heuristic) into a product record with provenance on every value. */
export function buildRecord(x, source, extraction) {
  const n = x.nutrition || {};
  const per100 = {};
  const set = (k, value, prov) => { if (value != null && Number.isFinite(value)) per100[k] = { value: Math.round(value * 100) / 100, prov }; };
  const factor = x.basis === 'perServing' ? (x.servingSizeG ? 100 / x.servingSizeG : null) : 1;
  const provBase = x.basis === 'perServing' ? 'calculated' : 'label';
  const notes = [];
  if (factor == null && Object.values(n).some((v) => v != null)) notes.push({ en: 'Only per-serving values with no serving weight — per-100 g values could not be calculated.', he: 'רק ערכים למנה ללא משקל המנה — לא ניתן לחשב ערכים ל-100 ג׳.' });
  if (factor != null) {
    for (const k of ['protein', 'carbs', 'sugars', 'addedSugar', 'fat', 'satFat', 'fiber']) set(k, num(n[k]) == null ? null : num(n[k]) * factor, provBase);
    if (num(n.kcal) != null) set('kcal', num(n.kcal) * factor, provBase);
    else if (num(n.kj) != null) set('kcal', (num(n.kj) / 4.184) * factor, 'calculated');
    if (num(n.sodium) != null) set('sodium', num(n.sodium) * factor, provBase);
    else if (num(n.salt) != null) set('sodium', num(n.salt) * 400 * factor, 'calculated');
    if (num(n.transFat) != null) set('transFat', num(n.transFat) * factor, provBase);
  }
  return {
    identity: { name: x.productName || null, brand: x.brand || null, manufacturer: x.manufacturer || null, barcode: x.barcode ? String(x.barcode).replace(/\D/g, '') || null : null, category: x.category || null, image: x.image || null },
    found: Boolean(x.found),
    ingredientsText: x.ingredientsText || null, ingredientsComplete: x.ingredientsComplete ?? null,
    processingInfo: x.processingInfo || null, claims: x.claims || [],
    nutrition: { basis: x.basis === 'perServing' && factor ? (/ml/i.test(x.servingSize || '') ? 'per100ml' : 'per100g') : x.basis, declaredBasis: x.basis, servingSize: x.servingSize || null, servingSizeG: x.servingSizeG ?? null, per100 },
    quotes: x.quotes || {}, aiNotes: x.notes || '', notes, source, extraction,
  };
}

export const NUTRITION_KEYS = KEYS;
