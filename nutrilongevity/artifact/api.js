// API layer for the published claude.ai version of NutriLongevity AI.
// It replaces public/js/api.js at build time (scripts/build-artifact.mjs) and answers the same
// /api/* routes inside the page, using the same shared calculation modules as the Node server.
//
// Storage: each signed-in person's data lives in the artifact's database under their private
// subtree data/users/<id>/ (the `db` + `user` capabilities), so it follows them across devices.
// Signed out, or if the database is unavailable, it falls back to this browser's storage.
// AI: the `sample` capability (Claude) answers the assistant and reads label photos; without it the
// rule-based offline assistant answers. Export uses the `downloads` capability.
import { computeTargets } from '../shared/engine.js';
import { generatePlan } from '../shared/planner.js';
import { analyzeWeek, dailySeries } from '../shared/analysis.js';
import { searchFoods, FOOD_MAP } from '../shared/foods.js';
import { analyzeIngredients, nutrientDensity, highIn } from '../shared/nova.js';
import { sumItems } from '../shared/nutrition.js';
import { buildContext, fallbackAnswer, extractRefs, stripUnknownRefs, SYSTEM_PROMPT, mealParsePrompt, normalizeAiMeal } from '../shared/assistant.js';
import { parseMeal } from '../shared/mealParser.js';
import { productPrompt, buildRecord, heuristicExtract } from '../shared/productExtract.js';
import { analyzeMeal } from '../shared/mealScore.js';

// ── Capabilities ───────────────────────────────────────────────────────
const use = (name) => (window.claude?.use ? window.claude.use(name).catch(() => null) : Promise.resolve(null));
let ready = null;
const caps = { db: null, base: null, sample: null, labelAi: false, downloads: null, viewer: null };

function init() {
  if (!ready) {
    ready = (async () => {
      const [db, user, sample, downloads] = await Promise.all([use('db'), use('user'), use('sample'), use('downloads')]);
      const uid = user ? await user.id().catch(() => null) : null;
      if (db && uid) { caps.db = db; caps.base = `data/users/${uid}`; }
      if (user) caps.viewer = await user.me().catch(() => null);
      caps.sample = sample;
      if (sample) caps.labelAi = Boolean((await sample.limits().catch(() => null))?.images);
      caps.downloads = downloads;
    })();
  }
  return ready;
}

// ── Document store (cloud or local), with an in-memory cache and one write at a time per doc ──
const cache = new Map();
const chains = new Map();
const LOCAL = 'nl_app_v1:';

async function load(name, fallback) {
  if (cache.has(name)) return cache.get(name);
  let body = null;
  if (caps.db) {
    try {
      const snap = await caps.db.doc(`${caps.base}/${name}`).get();
      body = snap.exists ? structuredClone(snap.data()) : null;
    } catch (e) { if (e?.code === 'unavailable') body = null; else throw storeError(e); }
  } else {
    try { body = JSON.parse(localStorage.getItem(LOCAL + name)); } catch { body = null; }
  }
  const v = body ?? structuredClone(fallback);
  cache.set(name, v);
  return v;
}

function storeError(e) {
  const err = new Error(e?.code === 'quota_exceeded' ? 'Storage is full. Delete old data in Profile → Delete my data, or export it first.' : 'Your data could not be saved right now. Check your connection and try again.');
  err.status = 503; return err;
}

function save(name, body) {
  cache.set(name, body);
  const prev = chains.get(name) || Promise.resolve();
  const next = prev.catch(() => {}).then(async () => {
    if (caps.db) {
      try { await caps.db.doc(`${caps.base}/${name}`).set(JSON.parse(JSON.stringify(body))); } catch (e) { saveFailed(e); }
    } else {
      try { localStorage.setItem(LOCAL + name, JSON.stringify(body)); } catch { /* storage unavailable: kept for this visit */ }
    }
  });
  chains.set(name, next);
  return next;
}

async function remove(name) {
  cache.delete(name);
  if (caps.db) { try { await caps.db.doc(`${caps.base}/${name}`).delete(); } catch { /* ignore */ } } else { try { localStorage.removeItem(LOCAL + name); } catch { /* ignore */ } }
}

function saveFailed(e) {
  const msg = storeError(e).message;
  document.dispatchEvent(new CustomEvent('nl-store-error', { detail: msg }));
}

// ── Helpers ────────────────────────────────────────────────────────────
const today = () => { const x = new Date(); x.setMinutes(x.getMinutes() - x.getTimezoneOffset()); return x.toISOString().slice(0, 10); };
const shift = (date, n) => new Date(new Date(`${date}T00:00:00Z`).getTime() + n * 86400000).toISOString().slice(0, 10);
const isDate = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
const fail = (status, message) => { const e = new Error(message); e.status = status; throw e; };
const monthsBetween = (from, to) => { const out = []; let d = new Date(`${from.slice(0, 7)}-01T00:00:00Z`); const end = to.slice(0, 7); while (d.toISOString().slice(0, 7) <= end && out.length < 36) { out.push(d.toISOString().slice(0, 7)); d = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1)); } return out; };

async function meta() { return load('meta', { seq: 1, months: [] }); }
async function nextId() { const m = await meta(); const id = m.seq++; save('meta', m); return id; }
async function logsBetween(from, to) {
  const m = await meta();
  const months = monthsBetween(from, to).filter((x) => m.months.includes(x));
  const docs = await Promise.all(months.map((x) => load(`logs-${x}`, { entries: [] })));
  return docs.flatMap((d) => d.entries).filter((l) => l.date >= from && l.date <= to).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.id - b.id));
}
async function addLog(entry) {
  const m = await meta(); const month = entry.date.slice(0, 7);
  const doc = await load(`logs-${month}`, { entries: [] });
  doc.entries.push(entry);
  if (!m.months.includes(month)) { m.months.push(month); m.months.sort(); save('meta', m); }
  await save(`logs-${month}`, doc);
}
async function profileOrFail() { const p = (await load('profile', { profile: null })).profile; if (!p) fail(409, 'Complete your profile first'); return p; }
async function currentPlan() { return (await load('plan', { plan: null })).plan; }
async function setPlan(plan) { await save('plan', { plan }); }
async function favTemplates() { return (await load('favorites', { items: [] })).items.map((f) => f.templateId).filter(Boolean); }

function sanitizeItems(items) {
  if (!Array.isArray(items) || !items.length || items.length > 60) fail(400, 'items must be a non-empty array');
  return items.map((it) => {
    const grams = Number(it.grams);
    if (!Number.isFinite(grams) || grams < 0 || grams > 5000) fail(400, 'invalid grams');
    if (it.foodId) { if (!FOOD_MAP[it.foodId]) fail(400, `unknown food ${it.foodId}`); return { foodId: it.foodId, grams }; }
    if (it.product?.per100) return { grams, product: { id: String(it.product.id || 'custom'), name: it.product.name, brand: it.product.brand || '', per100: it.product.per100, nova: it.product.nova ?? null, status: it.product.status || 'user-entered', tags: it.product.tags || [], plant: it.product.plant || null, emoji: it.product.emoji || '📦' } };
    return fail(400, 'item needs foodId or product');
  });
}

// ── AI (Claude via `sample`) ───────────────────────────────────────────
async function askClaude(history, message, contextText) {
  const turns = [{ role: 'user', content: `${SYSTEM_PROMPT}\n\nFollow the instructions above for every answer in this conversation. Use [ref:ID] tags exactly as described.` }];
  for (const h of history.slice(-12)) turns.push({ role: h.role, content: h.content });
  turns.push({ role: 'user', content: `<user_context>\n${contextText}\n</user_context>\n\n${message}` });
  const r = await caps.sample(turns, { cache: false });
  const text = stripUnknownRefs(r.text.trim());
  return { text, refs: extractRefs(text), mode: 'ai', model: r.modelApplied };
}

const LABEL_PROMPT = `Transcribe the food label in the image. Copy the ingredient list verbatim (keep Hebrew as Hebrew; translate other languages to English). Give nutrition values per 100 g (or per 100 ml). If only per-serving values are printed and the serving weight is printed, convert to per 100 g and set "basis" to "perServingConverted". Sodium in mg (if only salt is printed, sodium = salt in g × 400). Use null for anything not printed — never guess. Reply with only this JSON shape:
{"productName": string, "ingredientsText": string, "basis": "per100g"|"per100ml"|"perServingConverted"|"unknown", "servingSizeG": number|null, "per100": {"kcal": number|null, "protein": number|null, "carbs": number|null, "sugars": number|null, "addedSugar": number|null, "fat": number|null, "satFat": number|null, "fiber": number|null, "sodium": number|null}, "confidenceNotes": string}`;

function b64ToBlob(b64, type) {
  const bin = atob(b64); const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type });
}

function aiError(e) {
  const code = e?.code;
  if (code === 'rate_limited') return fail(429, 'Claude is busy or your usage limit was reached. Try again in a little while.');
  if (['not_granted', 'sampling_disabled', 'not_declared', 'capability_disabled', 'capability_removed', 'images_unavailable'].includes(code)) { caps.sample = code === 'images_unavailable' ? caps.sample : null; return null; }
  return fail(502, 'Claude could not answer right now. Please try again.');
}

// ── Router ─────────────────────────────────────────────────────────────
async function handle(method, url, body = {}) {
  await init();
  const u = new URL(url, 'http://app');
  const p = u.pathname; const q = Object.fromEntries(u.searchParams);
  let m;

  if (p === '/api/status') return { ai: Boolean(caps.sample), labelAi: caps.labelAi, photoAi: caps.labelAi, pubmed: false, productLinks: false, artifact: true, barcode: false, cloud: Boolean(caps.db), downloads: Boolean(caps.downloads) };
  if (p.startsWith('/api/auth/')) return { user: viewerUser() };
  if (p === '/api/me') { const prof = (await load('profile', { profile: null })).profile; return { user: viewerUser(), profile: prof, targets: prof ? computeTargets(prof) : null }; }
  if (p === '/api/profile' && method === 'PUT') { const profile = body.profile || body; const targets = computeTargets(profile); await save('profile', { profile }); return { profile, targets }; }

  if (p === '/api/plan/current') return { plan: await currentPlan() };
  if (p === '/api/plan/generate') {
    const prof = await profileOrFail();
    const plan = generatePlan(prof, computeTargets(prof), { startDate: isDate(body.startDate) ? body.startDate : today(), boostTags: body.boostTags || {}, favorites: await favTemplates() });
    plan.id = await nextId(); plan.kind = 'standard';
    await setPlan(plan); return { plan };
  }
  if ((m = p.match(/^\/api\/plan\/(\d+)$/)) && method === 'PUT') {
    const cur = await currentPlan(); if (!cur || cur.id !== Number(m[1])) fail(404, 'Plan not found');
    for (const d of body.plan.days) for (const meal of d.meals) meal.items = sanitizeItems(meal.items);
    const plan = { ...body.plan, id: cur.id }; await setPlan(plan); return { plan };
  }

  if (p === '/api/logs' && method === 'GET') return { logs: await logsBetween(isDate(q.from) ? q.from : shift(today(), -30), isDate(q.to) ? q.to : today()) };
  if (p === '/api/logs' && method === 'POST') {
    const entry = { id: await nextId(), date: isDate(body.date) ? body.date : today(), slot: String(body.slot || 'snack'), title: String(body.title || ''), source: String(body.source || 'manual'), items: sanitizeItems(body.items), meta: cleanMeta(body.meta) };
    await addLog(entry); return entry;
  }
  if ((m = p.match(/^\/api\/logs\/(\d+)$/)) && method === 'PUT') {
    const id = Number(m[1]);
    for (const month of (await meta()).months) {
      const doc = await load(`logs-${month}`, { entries: [] });
      const i = doc.entries.findIndex((l) => l.id === id);
      if (i < 0) continue;
      const cur = doc.entries[i];
      const next = { ...cur, items: body.items ? sanitizeItems(body.items) : cur.items, slot: body.slot || cur.slot, title: body.title ?? cur.title, meta: body.meta !== undefined ? cleanMeta(body.meta) : cur.meta };
      if (isDate(body.date) && body.date !== cur.date) {
        doc.entries.splice(i, 1); await save(`logs-${month}`, doc);
        next.date = body.date; await addLog(next);
      } else { doc.entries[i] = next; await save(`logs-${month}`, doc); }
      return next;
    }
    return fail(404, 'Entry not found');
  }
  if (p === '/api/analyze/meal') {
    const text = String(body.text || '').trim().slice(0, 2000);
    if (!text && !body.imageBase64) fail(400, 'Describe what you ate');
    if (body.imageBase64 && !(caps.sample && caps.labelAi)) fail(503, 'Photo analysis is not available here. Describe the meal in words instead.');
    if (!caps.sample) return parseMeal(text);
    try {
      const opts = { cache: false, modelTier: 'default' };
      if (body.imageBase64) opts.images = [b64ToBlob(body.imageBase64, body.mediaType)];
      const json = await caps.sample.json(`${mealParsePrompt(text, body.lang, Boolean(body.imageBase64))}\n\nReply with only a JSON object: {"mealName": string, "items": [{"name": string, "foodId": string|null, "grams": number, "quantity": "stated"|"estimated", "cooking": string|null, "nova": 1|2|3|4|null, "per100": null | {"kcal","protein","carbs","fat","satFat","fiber","sugars","addedSugar","sodium"} as numbers}], "questions": [string]}`, opts);
      return normalizeAiMeal(json, text);
    } catch (e) {
      if (body.imageBase64 && !text) fail(503, 'The photo could not be analysed. Describe the meal in words instead.');
      try { aiError(e); } catch { /* fall back below */ }
      return { ...parseMeal(text), aiError: true };
    }
  }
  if (p === '/api/product/analyze') {
    const now = new Date().toISOString();
    if (body.url) return { ok: false, access: { ok: false, code: 'not_supported', url: String(body.url), checkedAt: now, message: 'This page cannot open other websites (its security sandbox blocks them), so the link was NOT read. Upload a photo of the label or paste the ingredient list and nutrition table instead — or use the self-hosted version, which reads links.' } };
    if (body.pdfBase64) fail(503, 'PDFs cannot be read on this page. Upload a photo of the label or paste its text.');
    const shape = '\n\nReply with only a JSON object with exactly these keys: found, productName, brand, manufacturer, barcode, category, ingredientsText, ingredientsComplete, processingInfo, claims (array), servingSize, servingSizeG, basis ("per100g"|"per100ml"|"perServing"|"unknown"), nutrition {kcal, kj, protein, carbs, sugars, addedSugar, fat, satFat, transFat, fiber, sodium, salt}, quotes {ingredients, nutrition}, notes. Use null where absent.';
    if (body.imageBase64) {
      if (!(caps.sample && caps.labelAi)) fail(503, 'Reading label photos is not available here. Paste the ingredient list instead.');
      try { const x = await caps.sample.json(productPrompt({ kind: 'image' }) + shape, { images: [b64ToBlob(body.imageBase64, body.mediaType || 'image/jpeg')], cache: false }); return { ok: true, record: buildRecord(x, { type: 'photo', retrievedAt: now }, 'ai'), access: { ok: true, type: 'photo', retrievedAt: now } }; } catch (e) { aiError(e); fail(503, 'The photo could not be read. Paste the ingredient list instead.'); }
    }
    const text = String(body.text || '').slice(0, 20000);
    if (!text.trim()) fail(400, 'Provide a photo or text');
    const source = { type: 'text', retrievedAt: now };
    if (caps.sample) {
      try { const x = await caps.sample.json(productPrompt({ kind: 'text', content: text }) + shape, { cache: false }); return { ok: true, record: buildRecord(x, source, 'ai'), access: { ok: true, ...source } }; } catch (e) { try { aiError(e); } catch { /* fall back */ } }
    }
    return { ok: true, record: buildRecord(heuristicExtract({ text: /רכיבים|ingredients/i.test(text) ? text : `Ingredients: ${text}` }), source, 'heuristic'), access: { ok: true, ...source } };
  }
  if (p.startsWith('/api/research/search')) fail(503, 'Live PubMed search is available in the self-hosted version.');
  if ((m = p.match(/^\/api\/logs\/(\d+)$/)) && method === 'DELETE') {
    const id = Number(m[1]);
    for (const month of (await meta()).months) {
      const doc = await load(`logs-${month}`, { entries: [] });
      const n = doc.entries.length; doc.entries = doc.entries.filter((l) => l.id !== id);
      if (doc.entries.length !== n) { await save(`logs-${month}`, doc); break; }
    }
    return { ok: true };
  }

  if (p === '/api/favorites' && method === 'GET') return { favorites: [...(await load('favorites', { items: [] })).items].reverse() };
  if (p === '/api/favorites' && method === 'POST') { const f = await load('favorites', { items: [] }); const item = { id: await nextId(), ...body.meal, items: sanitizeItems(body.meal.items) }; f.items.push(item); f.items = f.items.slice(-60); await save('favorites', f); return item; }
  if ((m = p.match(/^\/api\/favorites\/(\d+)$/))) { const f = await load('favorites', { items: [] }); f.items = f.items.filter((x) => x.id !== Number(m[1])); await save('favorites', f); return { ok: true }; }

  if (p === '/api/analysis/week') { const end = isDate(q.end) ? q.end : today(); return { analysis: analyzeWeek(await logsBetween(shift(end, -6), end), computeTargets(await profileOrFail()), end) }; }
  if (p === '/api/analysis/trends') {
    const t = computeTargets(await profileOrFail()); const days = Math.min(90, Math.max(7, Number(q.days) || 28)); const end = isDate(q.end) ? q.end : today();
    const logs = await logsBetween(shift(end, -(days - 1)), end);
    const series = dailySeries(logs, end, days).map((x) => ({ date: x.date, logged: x.logged, kcal: x.totals.kcal, protein: x.totals.protein, fiber: x.totals.fiber, sodium: x.totals.sodium, upfPct: x.ind.upfPct, plants: x.ind.plantCount }));
    const weeks = [];
    for (let w = Math.floor(days / 7) - 1; w >= 0; w--) { const e = shift(end, -7 * w); const a = analyzeWeek(logs.filter((l) => l.date >= shift(e, -6) && l.date <= e), t, e); weeks.push({ end: e, plants: a.ind.plantCount, nDays: a.nDays }); }
    return { series, weeks };
  }
  if (p === '/api/analysis/optimize') {
    const prof = await profileOrFail(); const t = computeTargets(prof); const end = isDate(body.end) ? body.end : today();
    const analysis = analyzeWeek(await logsBetween(shift(end, -6), end), t, end);
    const plan = generatePlan(prof, t, { startDate: shift(end, 1), boostTags: analysis.boostTags, favorites: await favTemplates() });
    plan.id = await nextId(); plan.kind = 'optimized'; plan.basedOn = { weekEnd: end, boostTags: analysis.boostTags };
    await setPlan(plan);
    const reports = await load('reports', { items: [] });
    const report = { id: await nextId(), weekEnd: end, nDays: analysis.nDays, suggestions: analysis.suggestions, avg: analysis.avg, plantCount: analysis.ind.plantCount };
    reports.items.push(report); reports.items = reports.items.slice(-20); await save('reports', reports);
    return { analysis, plan, report };
  }
  if (p === '/api/reports') return { reports: [...(await load('reports', { items: [] })).items].reverse() };

  if (p === '/api/foods/search') return { local: searchFoods(q.q || '').map((f) => f.id), external: [], externalError: null };
  if (p.startsWith('/api/products/')) fail(503, 'Barcode lookup is not available on this page.');
  if (p === '/api/analyze/ingredients') return { analysis: analyzeIngredients(body.text || ''), density: body.per100 ? nutrientDensity(body.per100) : null, highIn: body.per100 ? highIn(body.per100) : [] };
  if (p === '/api/scan/label') {
    if (!caps.sample || !caps.labelAi) fail(503, 'Reading label photos is not available here. Enter the label manually below.');
    let label;
    try { label = await caps.sample.json(LABEL_PROMPT, { images: [b64ToBlob(body.imageBase64, body.mediaType)], cache: false }); } catch (e) { aiError(e); fail(503, 'Reading label photos is not available here. Enter the label manually below.'); }
    const per100 = label?.per100 || {};
    const analysis = analyzeIngredients(label?.ingredientsText || '');
    if (per100.addedSugar == null && label?.ingredientsText && !analysis.addedSugars.length) per100.addedSugar = 0;
    return { product: { id: `label:${Date.now()}`, name: { en: label?.productName || 'Scanned label', he: label?.productName || 'תווית סרוקה' }, per100, ingredientsText: label?.ingredientsText || '', analysis, nova: analysis.nova, novaSource: 'estimated', status: 'ai-extracted', emoji: '🏷️', basis: label?.basis, notes: label?.confidenceNotes || '', density: nutrientDensity(per100), highIn: highIn(per100) } };
  }
  if (p === '/api/saved-products' && method === 'GET') return { products: (await load('saved', { items: [] })).items };
  if (p === '/api/saved-products' && method === 'POST') { const s = await load('saved', { items: [] }); const item = { savedId: await nextId(), ...body.product }; delete item.analysis; s.items.push(item); s.items = s.items.slice(-50); await save('saved', s); return item; }
  if ((m = p.match(/^\/api\/saved-products\/(\d+)$/))) { const s = await load('saved', { items: [] }); s.items = s.items.filter((x) => x.savedId !== Number(m[1])); await save('saved', s); return { ok: true }; }

  if (p === '/api/ai/history' && method === 'GET') return { messages: (await load('chats', { messages: [] })).messages.slice(-40), ai: Boolean(caps.sample) };
  if (p === '/api/ai/history' && method === 'DELETE') { await save('chats', { messages: [] }); return { ok: true }; }
  if (p === '/api/ai/chat') {
    const message = String(body.message || '').trim().slice(0, 4000);
    if (!message) fail(400, 'message required');
    const prof = (await load('profile', { profile: null })).profile; const t = prof ? computeTargets(prof) : null;
    const plan = await currentPlan(); const d = isDate(body.date) ? body.date : today();
    const todayMeals = plan?.days.find((x) => x.date === d)?.meals || plan?.days[0]?.meals || [];
    const week = prof ? analyzeWeek(await logsBetween(shift(d, -6), d), t, d) : null;
    const todayLogs = await logsBetween(d, d);
    const contextText = buildContext({ profile: prof, targets: t, todayMeals, week, todayLogs, lang: body.lang || prof?.lang });
    const extra = { lastMeal: todayLogs[todayLogs.length - 1], analyze: (items) => analyzeMeal(items, prof || {}), targets: t };
    const chats = await load('chats', { messages: [] });
    let result = null;
    if (caps.sample) { try { result = await askClaude(chats.messages, message, contextText); } catch (e) { aiError(e); } }
    if (!result) result = { ...fallbackAnswer(message, contextText, extra), mode: 'offline' };
    chats.messages.push({ role: 'user', content: message }, { role: 'assistant', content: result.text, meta: { refs: result.refs, mode: result.mode } });
    chats.messages = chats.messages.slice(-60);
    await save('chats', chats);
    return result;
  }

  if (p === '/api/account' && method === 'DELETE') {
    const months = (await meta()).months;
    await Promise.all([...['profile', 'plan', 'favorites', 'reports', 'chats', 'saved', 'meta'], ...months.map((x) => `logs-${x}`)].map(remove));
    return { ok: true };
  }
  return fail(404, 'Not found');
}

function cleanMeta(meta) {
  if (!meta || typeof meta !== 'object') return null;
  const out = {};
  if (meta.text) out.text = String(meta.text).slice(0, 1000);
  if (Number.isFinite(meta.score)) out.score = Math.round(meta.score);
  if (meta.mode) out.mode = String(meta.mode).slice(0, 10);
  return Object.keys(out).length ? out : null; // photos are not stored here, to keep each month's diary small
}

function viewerUser() {
  return { id: 1, email: caps.viewer?.email || '', name: caps.viewer?.name || '' };
}

export async function api(path, { method = 'GET', body } = {}) {
  const out = await handle(method, path, body === undefined ? {} : JSON.parse(JSON.stringify(body)));
  return JSON.parse(JSON.stringify(out));
}

// Same state/helpers interface as public/js/api.js.
export const state = {
  user: null, profile: null, targets: null, plan: null, status: { ai: false, artifact: true },
  listeners: new Set(),
  set(patch) { Object.assign(this, patch); this.listeners.forEach((fn) => fn()); },
};
export async function loadMe() { const me = await api('/api/me'); state.set({ user: me.user, profile: me.profile, targets: me.targets }); return me; }
export async function loadPlan() { const { plan } = await api('/api/plan/current'); state.set({ plan }); return plan; }
let timer = null;
export function savePlanDebounced() {
  clearTimeout(timer);
  timer = setTimeout(() => { if (state.plan?.id) api(`/api/plan/${state.plan.id}`, { method: 'PUT', body: { plan: state.plan } }).catch(() => {}); }, 600);
}

export async function exportData(format) {
  await init();
  if (!caps.downloads) fail(503, 'Downloads are not available in this view.');
  const logs = await logsBetween('2000-01-01', '2999-12-31');
  let data; let filename;
  if (format === 'csv') {
    const rows = [['date', 'slot', 'title', 'source', 'food', 'grams', 'kcal', 'protein_g', 'carbs_g', 'fat_g', 'satfat_g', 'fiber_g', 'sugars_g', 'added_sugar_g', 'sodium_mg', 'data_source']];
    for (const l of logs) for (const it of l.items) {
      const n = sumItems([it]); const f = it.foodId ? FOOD_MAP[it.foodId] : it.product;
      rows.push([l.date, l.slot, l.title, l.source, f?.name?.en || '', it.grams, ...['kcal', 'protein', 'carbs', 'fat', 'satFat', 'fiber', 'sugars', 'addedSugar', 'sodium'].map((k) => n[k].toFixed(1)), f?.status || '']);
    }
    data = rows.map((r) => r.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
    filename = 'nutrilongevity-food-log.csv';
  } else {
    data = JSON.stringify({
      exportedAt: new Date().toISOString(), profile: (await load('profile', { profile: null })).profile, plan: await currentPlan(), logs,
      favorites: (await load('favorites', { items: [] })).items, reports: (await load('reports', { items: [] })).items, chats: (await load('chats', { messages: [] })).messages,
    }, null, 1);
    filename = 'nutrilongevity-export.json';
  }
  try { await caps.downloads.save({ filename, data }); } catch (e) { if (e?.code !== 'cancelled' && e?.code !== 'declined') fail(503, 'The download could not be started.'); }
}
