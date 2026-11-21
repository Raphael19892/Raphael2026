// NutriLongevity AI — HTTP server: JSON API + static PWA. No framework; Node ≥ 22.5.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb, j } from './db.js';
import * as auth from './auth.js';
import { lookupBarcode, searchOff, searchFdc } from './products.js';
import { chat, readLabel, aiAvailable, buildContext } from './ai.js';
import { computeTargets, CONDITIONS } from '../shared/engine.js';
import { generatePlan } from '../shared/planner.js';
import { analyzeWeek, dailySeries } from '../shared/analysis.js';
import { searchFoods, ALLERGENS, FOOD_MAP } from '../shared/foods.js';
import { analyzeIngredients, nutrientDensity, highIn } from '../shared/nova.js';
import { sumItems } from '../shared/nutrition.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(here, '..');
const STATIC = { '/shared/': path.join(ROOT, 'shared'), '/': path.join(ROOT, 'public') };
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' };

const today = () => new Date().toISOString().slice(0, 10);
const isDate = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);

class HttpError extends Error { constructor(status, message) { super(message); this.status = status; } }

// ── Validation ────────────────────────────────────────────────────────────
export function validateProfile(p) {
  const e = [];
  const num = (k, lo, hi) => { const v = Number(p[k]); if (!Number.isFinite(v) || v < lo || v > hi) e.push(k); return v; };
  const out = {
    age: num('age', 18, 110), sex: ['male', 'female', 'other'].includes(p.sex) ? p.sex : (e.push('sex'), 'other'),
    heightCm: num('heightCm', 120, 230), weightKg: num('weightKg', 30, 300),
    activity: ['sedentary', 'light', 'moderate', 'active', 'very_active'].includes(p.activity) ? p.activity : 'light',
    goal: ['longevity', 'maintain', 'lose', 'gain'].includes(p.goal) ? p.goal : 'longevity',
    diet: ['omnivore', 'pescatarian', 'vegetarian', 'vegan'].includes(p.diet) ? p.diet : 'omnivore',
    allergies: (Array.isArray(p.allergies) ? p.allergies : []).filter((a) => ALLERGENS.includes(a)),
    conditions: (Array.isArray(p.conditions) ? p.conditions : []).filter((c) => CONDITIONS.includes(c)),
    dislikes: (Array.isArray(p.dislikes) ? p.dislikes : []).filter((d) => FOOD_MAP[d]),
    medications: String(p.medications || '').slice(0, 300),
    healthGoals: (Array.isArray(p.healthGoals) ? p.healthGoals : []).map(String).slice(0, 10),
    strengthTraining: Math.max(0, Math.min(14, Number(p.strengthTraining) || 0)),
    exerciseMinutes: Math.max(0, Math.min(3000, Number(p.exerciseMinutes) || 0)),
    schedule: ['standard', 'early', 'late', 'shift'].includes(p.schedule) ? p.schedule : 'standard',
    cookingTime: [15, 30, 45, 60].includes(Number(p.cookingTime)) ? Number(p.cookingTime) : 30,
    budget: ['low', 'medium', 'high'].includes(p.budget) ? p.budget : 'medium',
    mealsPerDay: [3, 4, 5, 6].includes(Number(p.mealsPerDay)) ? Number(p.mealsPerDay) : 4,
    frameworks: (Array.isArray(p.frameworks) ? p.frameworks : ['med', 'greenmed']).filter((f) => ['med', 'greenmed', 'dash', 'plantforward', 'polyphenols', 'fermented'].includes(f)),
    lang: p.lang === 'he' ? 'he' : 'en',
  };
  // Age < 18 is rejected by num(); the safety screen also covers it for direct engine use.
  if (e.length) throw new HttpError(400, `Invalid profile fields: ${e.join(', ')}`);
  return out;
}

function validateItems(items) {
  if (!Array.isArray(items) || !items.length || items.length > 60) throw new HttpError(400, 'items must be a non-empty array');
  return items.map((it) => {
    const grams = Number(it.grams);
    if (!Number.isFinite(grams) || grams < 0 || grams > 5000) throw new HttpError(400, 'invalid grams');
    if (it.foodId) { if (!FOOD_MAP[it.foodId]) throw new HttpError(400, `unknown food ${it.foodId}`); return { foodId: it.foodId, grams }; }
    if (it.product && it.product.per100) {
      const p = it.product;
      const per100 = {};
      for (const [k, v] of Object.entries(p.per100)) per100[k] = v == null ? null : Number(v);
      return { grams, product: { id: String(p.id || 'custom').slice(0, 80), name: { en: String(p.name?.en || 'Product').slice(0, 160), he: String(p.name?.he || p.name?.en || 'מוצר').slice(0, 160) }, brand: String(p.brand || '').slice(0, 120), per100, nova: Number(p.nova) || null, status: String(p.status || 'user-entered'), tags: Array.isArray(p.tags) ? p.tags.slice(0, 10) : [], plant: p.plant || null, emoji: p.emoji || '📦' } };
    }
    throw new HttpError(400, 'item needs foodId or product');
  });
}

function validatePlan(plan) {
  if (!plan || !Array.isArray(plan.days) || plan.days.length > 14) throw new HttpError(400, 'invalid plan');
  for (const d of plan.days) {
    if (!isDate(d.date) || !Array.isArray(d.meals) || d.meals.length > 8) throw new HttpError(400, 'invalid plan day');
    for (const m of d.meals) m.items = validateItems(m.items);
  }
  return plan;
}

// ── App ───────────────────────────────────────────────────────────────────
export function createApp({ dbFile = process.env.NL_DB || path.join(ROOT, 'data', 'nutrilongevity.db'), secureCookies = process.env.NODE_ENV === 'production' } = {}) {
  const db = openDb(dbFile);

  const getProfile = (uid) => j(db.prepare('SELECT data FROM profiles WHERE user_id = ?').get(uid)?.data);
  const getLogs = (uid, from, to) => db.prepare('SELECT id, date, slot, title, source, items FROM logs WHERE user_id = ? AND date BETWEEN ? AND ? ORDER BY date, id').all(uid, from, to).map((r) => ({ ...r, items: j(r.items) }));
  const latestPlan = (uid) => { const r = db.prepare('SELECT id, start_date, data FROM plans WHERE user_id = ? ORDER BY id DESC LIMIT 1').get(uid); return r ? { id: r.id, ...j(r.data) } : null; };
  const savePlan = (uid, plan) => { const r = db.prepare('INSERT INTO plans (user_id, start_date, data) VALUES (?, ?, ?)').run(uid, plan.startDate, JSON.stringify(plan)); return Number(r.lastInsertRowid); };
  const shift = (date, days) => new Date(new Date(`${date}T00:00:00Z`).getTime() + days * 86400000).toISOString().slice(0, 10);
  const favoriteTemplates = (uid) => db.prepare('SELECT data FROM favorites WHERE user_id = ?').all(uid).map((r) => j(r.data).templateId).filter(Boolean);

  const routes = [];
  const route = (method, pattern, handler, opts = {}) => {
    const keys = [];
    const re = new RegExp(`^${pattern.replace(/:(\w+)/g, (_, k) => { keys.push(k); return '([^/]+)'; })}$`);
    routes.push({ method, re, keys, handler, auth: opts.auth !== false });
  };

  // Auth
  route('POST', '/api/auth/register', ({ body, res, ip }) => {
    const { email, password, name } = body;
    if (!auth.validEmail(email)) throw new HttpError(400, 'Invalid email');
    if (!auth.validPassword(password)) throw new HttpError(400, 'Password must be at least 8 characters');
    if (auth.rateLimited(`reg:${ip}`)) throw new HttpError(429, 'Too many attempts, try later');
    const exists = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
    if (exists) { auth.recordFailure(`reg:${ip}`); throw new HttpError(409, 'An account with this email already exists'); }
    const r = db.prepare('INSERT INTO users (email, name, pw_hash) VALUES (?, ?, ?)').run(email.trim(), String(name || '').slice(0, 80), auth.hashPassword(password));
    const s = auth.createSession(db, Number(r.lastInsertRowid));
    res.setHeader('Set-Cookie', auth.sessionCookie(s.token, s.expires, secureCookies));
    return { user: { id: Number(r.lastInsertRowid), email, name } };
  }, { auth: false });

  route('POST', '/api/auth/login', ({ body, res, ip }) => {
    const key = `login:${ip}:${String(body.email).toLowerCase()}`;
    if (auth.rateLimited(key)) throw new HttpError(429, 'Too many attempts, try again in 15 minutes');
    const u = db.prepare('SELECT id, email, name, pw_hash FROM users WHERE email = ?').get(String(body.email || ''));
    if (!u || !auth.verifyPassword(String(body.password || ''), u.pw_hash)) { auth.recordFailure(key); throw new HttpError(401, 'Incorrect email or password'); }
    const s = auth.createSession(db, u.id);
    res.setHeader('Set-Cookie', auth.sessionCookie(s.token, s.expires, secureCookies));
    return { user: { id: u.id, email: u.email, name: u.name } };
  }, { auth: false });

  route('POST', '/api/auth/logout', ({ token, res }) => {
    auth.destroySession(db, token);
    res.setHeader('Set-Cookie', auth.clearCookie(secureCookies));
    return { ok: true };
  }, { auth: false });

  route('GET', '/api/status', () => ({ ai: aiAvailable(), fdc: Boolean(process.env.FDC_API_KEY), version: '1.0.0' }), { auth: false });

  // Profile
  route('GET', '/api/me', ({ user }) => {
    const profile = getProfile(user.id);
    return { user, profile, targets: profile ? computeTargets(profile) : null };
  });
  route('PUT', '/api/profile', ({ user, body }) => {
    const profile = validateProfile(body.profile || body);
    db.prepare("INSERT INTO profiles (user_id, data, updated_at) VALUES (?, ?, datetime('now')) ON CONFLICT(user_id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at").run(user.id, JSON.stringify(profile));
    return { profile, targets: computeTargets(profile) };
  });

  const requireProfile = (uid) => { const p = getProfile(uid); if (!p) throw new HttpError(409, 'Complete your profile first'); return p; };

  // Plans
  route('GET', '/api/plan/current', ({ user }) => ({ plan: latestPlan(user.id) }));
  route('GET', '/api/plans', ({ user }) => ({ plans: db.prepare('SELECT id, start_date, created_at FROM plans WHERE user_id = ? ORDER BY id DESC LIMIT 30').all(user.id) }));
  route('POST', '/api/plan/generate', ({ user, body }) => {
    const profile = requireProfile(user.id);
    const targets = computeTargets(profile);
    const startDate = isDate(body.startDate) ? body.startDate : today();
    const plan = generatePlan(profile, targets, { seed: Number.isFinite(body.seed) ? body.seed : undefined, startDate, days: Math.min(7, Math.max(1, Number(body.days) || 7)), boostTags: body.boostTags || {}, favorites: favoriteTemplates(user.id) });
    plan.kind = body.kind || 'standard';
    const id = savePlan(user.id, plan);
    return { plan: { id, ...plan } };
  });
  route('PUT', '/api/plan/:id', ({ user, params, body }) => {
    const row = db.prepare('SELECT id FROM plans WHERE id = ? AND user_id = ?').get(Number(params.id), user.id);
    if (!row) throw new HttpError(404, 'Plan not found');
    const plan = validatePlan(body.plan);
    delete plan.id;
    db.prepare('UPDATE plans SET data = ?, start_date = ? WHERE id = ?').run(JSON.stringify(plan), plan.startDate, row.id);
    return { plan: { id: row.id, ...plan } };
  });

  // Logs
  route('GET', '/api/logs', ({ user, query }) => {
    const from = isDate(query.from) ? query.from : shift(today(), -30);
    const to = isDate(query.to) ? query.to : today();
    return { logs: getLogs(user.id, from, to) };
  });
  route('POST', '/api/logs', ({ user, body }) => {
    const date = isDate(body.date) ? body.date : today();
    const items = validateItems(body.items);
    const r = db.prepare('INSERT INTO logs (user_id, date, slot, title, source, items) VALUES (?, ?, ?, ?, ?, ?)').run(user.id, date, String(body.slot || 'snack').slice(0, 20), String(body.title || '').slice(0, 160), String(body.source || 'manual').slice(0, 20), JSON.stringify(items));
    return { id: Number(r.lastInsertRowid), date, items };
  });
  route('DELETE', '/api/logs/:id', ({ user, params }) => {
    db.prepare('DELETE FROM logs WHERE id = ? AND user_id = ?').run(Number(params.id), user.id);
    return { ok: true };
  });

  // Favorites
  route('GET', '/api/favorites', ({ user }) => ({ favorites: db.prepare('SELECT id, data FROM favorites WHERE user_id = ? ORDER BY id DESC').all(user.id).map((r) => ({ id: r.id, ...j(r.data) })) }));
  route('POST', '/api/favorites', ({ user, body }) => {
    const m = body.meal;
    if (!m || !m.name) throw new HttpError(400, 'meal required');
    const meal = { templateId: m.templateId || null, slot: m.slot, name: m.name, emoji: m.emoji, hue: m.hue, prep: m.prep, items: validateItems(m.items) };
    const r = db.prepare('INSERT INTO favorites (user_id, data) VALUES (?, ?)').run(user.id, JSON.stringify(meal));
    return { id: Number(r.lastInsertRowid), ...meal };
  });
  route('DELETE', '/api/favorites/:id', ({ user, params }) => { db.prepare('DELETE FROM favorites WHERE id = ? AND user_id = ?').run(Number(params.id), user.id); return { ok: true }; });

  // Analysis & weekly optimisation
  route('GET', '/api/analysis/week', ({ user, query }) => {
    const profile = requireProfile(user.id);
    const end = isDate(query.end) ? query.end : today();
    const logs = getLogs(user.id, shift(end, -6), end);
    return { analysis: analyzeWeek(logs, computeTargets(profile), end) };
  });
  route('GET', '/api/analysis/trends', ({ user, query }) => {
    requireProfile(user.id);
    const days = Math.min(90, Math.max(7, Number(query.days) || 28));
    const end = isDate(query.end) ? query.end : today();
    const logs = getLogs(user.id, shift(end, -(days - 1)), end);
    const series = dailySeries(logs, end, days).map((d) => ({ date: d.date, logged: d.logged, kcal: d.totals.kcal, protein: d.totals.protein, fiber: d.totals.fiber, sodium: d.totals.sodium, satFat: d.totals.satFat, addedSugar: d.totals.addedSugar, fruitVegG: d.ind.fruitVegG, plants: d.ind.plantCount, upfPct: d.ind.upfPct }));
    // Weekly plant diversity (rolling 7-day windows ending each Sunday-aligned block)
    const weeks = [];
    for (let w = Math.floor(days / 7) - 1; w >= 0; w--) {
      const wEnd = shift(end, -7 * w);
      const a = analyzeWeek(getLogs(user.id, shift(wEnd, -6), wEnd), computeTargets(requireProfile(user.id)), wEnd);
      weeks.push({ end: wEnd, plants: a.ind.plantCount, legumeServings: a.ind.legumeServings, fiber: a.avg.fiber, nDays: a.nDays });
    }
    return { series, weeks };
  });
  route('POST', '/api/analysis/optimize', ({ user, body }) => {
    const profile = requireProfile(user.id);
    const targets = computeTargets(profile);
    const end = isDate(body.end) ? body.end : today();
    const analysis = analyzeWeek(getLogs(user.id, shift(end, -6), end), targets, end);
    const plan = generatePlan(profile, targets, { startDate: shift(end, 1), boostTags: analysis.boostTags, favorites: favoriteTemplates(user.id) });
    plan.kind = 'optimized';
    plan.basedOn = { weekEnd: end, boostTags: analysis.boostTags };
    const planId = savePlan(user.id, plan);
    const report = { weekEnd: end, nDays: analysis.nDays, suggestions: analysis.suggestions, gaps: analysis.gaps.map((g) => g.key), excesses: analysis.excesses.map((g) => g.key), avg: analysis.avg, plantCount: analysis.ind.plantCount, planId };
    db.prepare('INSERT INTO reports (user_id, week_end, data) VALUES (?, ?, ?)').run(user.id, end, JSON.stringify(report));
    return { analysis, plan: { id: planId, ...plan }, report };
  });
  route('GET', '/api/reports', ({ user }) => ({ reports: db.prepare('SELECT id, week_end, data, created_at FROM reports WHERE user_id = ? ORDER BY id DESC LIMIT 20').all(user.id).map((r) => ({ id: r.id, created_at: r.created_at, ...j(r.data) })) }));

  // Foods & products
  route('GET', '/api/foods/search', async ({ query }) => {
    const q = String(query.q || '').slice(0, 80);
    const local = searchFoods(q).map((f) => f.id);
    let external = []; let externalError = null;
    if (q.length >= 3 && query.external !== '0') {
      const results = await Promise.allSettled([searchOff(q), searchFdc(q, process.env.FDC_API_KEY)]);
      for (const r of results) if (r.status === 'fulfilled') external.push(...r.value); else externalError = 'External databases unreachable';
    }
    return { local, external, externalError };
  });
  route('GET', '/api/products/:barcode', async ({ params }) => {
    const code = String(params.barcode);
    if (!/^\d{6,14}$/.test(code)) throw new HttpError(400, 'Invalid barcode');
    try {
      const r = await lookupBarcode(db, code);
      if (!r.product) throw new HttpError(404, 'Product not found in Open Food Facts');
      return r;
    } catch (e) {
      if (e instanceof HttpError) throw e;
      throw new HttpError(502, 'Open Food Facts is unreachable right now. You can enter the label manually.');
    }
  });
  route('POST', '/api/analyze/ingredients', ({ body }) => {
    const analysis = analyzeIngredients(String(body.text || '').slice(0, 5000));
    const per100 = body.per100 || null;
    return { analysis, density: per100 ? nutrientDensity(per100) : null, highIn: per100 ? highIn(per100) : [] };
  });
  route('POST', '/api/scan/label', async ({ body }) => {
    const img = String(body.imageBase64 || '');
    const mediaType = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(body.mediaType) ? body.mediaType : null;
    if (!img || !mediaType) throw new HttpError(400, 'imageBase64 and a supported mediaType are required');
    if (img.length > 7_000_000) throw new HttpError(413, 'Image too large (max ~5 MB)');
    if (!aiAvailable()) throw new HttpError(503, 'Label reading needs the AI service (ANTHROPIC_API_KEY). Enter the label manually instead.');
    const label = await readLabel(img, mediaType);
    const analysis = analyzeIngredients(label.ingredientsText || '');
    const per100 = label.per100 || {};
    if (per100.addedSugar == null && label.ingredientsText && !analysis.addedSugars.length) per100.addedSugar = 0;
    return { product: { id: `label:${Date.now()}`, name: { en: label.productName || 'Scanned label', he: label.productName || 'תווית סרוקה' }, per100, ingredientsText: label.ingredientsText, analysis, nova: analysis.nova, novaSource: 'estimated', status: 'ai-extracted', emoji: '🏷️', basis: label.basis, notes: label.confidenceNotes, density: nutrientDensity(per100), highIn: highIn(per100) } };
  });
  route('GET', '/api/saved-products', ({ user }) => ({ products: db.prepare('SELECT id, data FROM saved_products WHERE user_id = ? ORDER BY id DESC LIMIT 50').all(user.id).map((r) => ({ savedId: r.id, ...j(r.data) })) }));
  route('POST', '/api/saved-products', ({ user, body }) => {
    const [item] = validateItems([{ grams: 100, product: body.product }]);
    const data = { ...item.product, ingredientsText: String(body.product.ingredientsText || '').slice(0, 5000), analysis: body.product.analysis || null, image: body.product.image || null, link: body.product.link || null };
    const r = db.prepare('INSERT INTO saved_products (user_id, data) VALUES (?, ?)').run(user.id, JSON.stringify(data));
    return { savedId: Number(r.lastInsertRowid), ...data };
  });
  route('DELETE', '/api/saved-products/:id', ({ user, params }) => { db.prepare('DELETE FROM saved_products WHERE id = ? AND user_id = ?').run(Number(params.id), user.id); return { ok: true }; });

  // AI assistant
  route('GET', '/api/ai/history', ({ user }) => ({ messages: db.prepare('SELECT role, content, meta, created_at FROM chats WHERE user_id = ? ORDER BY id DESC LIMIT 40').all(user.id).reverse().map((m) => ({ ...m, meta: j(m.meta) })), ai: aiAvailable() }));
  route('DELETE', '/api/ai/history', ({ user }) => { db.prepare('DELETE FROM chats WHERE user_id = ?').run(user.id); return { ok: true }; });
  route('POST', '/api/ai/chat', async ({ user, body }) => {
    const message = String(body.message || '').trim().slice(0, 4000);
    if (!message) throw new HttpError(400, 'message required');
    const profile = getProfile(user.id);
    const targets = profile ? computeTargets(profile) : null;
    const plan = latestPlan(user.id);
    const d = isDate(body.date) ? body.date : today();
    const todayMeals = plan?.days.find((x) => x.date === d)?.meals || plan?.days[0]?.meals || [];
    const week = profile ? analyzeWeek(getLogs(user.id, shift(d, -6), d), targets, d) : null;
    const contextText = buildContext({ profile, targets, todayMeals, week, lang: body.lang || profile?.lang });
    const history = db.prepare('SELECT role, content FROM chats WHERE user_id = ? ORDER BY id DESC LIMIT 12').all(user.id).reverse();
    let result;
    try { result = await chat({ history, message, contextText }); } catch (e) {
      console.error('AI error:', e.status || '', e.message);
      throw new HttpError(502, 'The AI service is temporarily unavailable. Please try again.');
    }
    db.prepare('INSERT INTO chats (user_id, role, content) VALUES (?, ?, ?)').run(user.id, 'user', message);
    db.prepare('INSERT INTO chats (user_id, role, content, meta) VALUES (?, ?, ?, ?)').run(user.id, 'assistant', result.text, JSON.stringify({ refs: result.refs, mode: result.mode }));
    return result;
  });

  // Export & account
  route('GET', '/api/export', ({ user, query, res }) => {
    const data = {
      exportedAt: new Date().toISOString(), user: { email: user.email, name: user.name }, profile: getProfile(user.id),
      plans: db.prepare('SELECT id, start_date, created_at, data FROM plans WHERE user_id = ? ORDER BY id').all(user.id).map((r) => ({ ...r, data: j(r.data) })),
      logs: getLogs(user.id, '0000-01-01', '9999-12-31'),
      favorites: db.prepare('SELECT data FROM favorites WHERE user_id = ?').all(user.id).map((r) => j(r.data)),
      reports: db.prepare('SELECT week_end, data FROM reports WHERE user_id = ?').all(user.id).map((r) => j(r.data)),
      chats: db.prepare('SELECT role, content, created_at FROM chats WHERE user_id = ?').all(user.id),
    };
    if (query.format === 'csv') {
      const rows = [['date', 'slot', 'title', 'source', 'food', 'grams', 'kcal', 'protein_g', 'carbs_g', 'fat_g', 'satfat_g', 'fiber_g', 'sugars_g', 'added_sugar_g', 'sodium_mg', 'data_source']];
      for (const l of data.logs) for (const it of l.items) {
        const n = sumItems([it]);
        const f = it.foodId ? FOOD_MAP[it.foodId] : it.product;
        rows.push([l.date, l.slot, l.title, l.source, f?.name?.en || '', it.grams, ...['kcal', 'protein', 'carbs', 'fat', 'satFat', 'fiber', 'sugars', 'addedSugar', 'sodium'].map((k) => n[k].toFixed(1)), f?.status || '']);
      }
      const csv = rows.map((r) => r.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
      res.setHeader('Content-Disposition', 'attachment; filename="nutrilongevity-food-log.csv"');
      return { __raw: csv, type: 'text/csv; charset=utf-8' };
    }
    res.setHeader('Content-Disposition', 'attachment; filename="nutrilongevity-export.json"');
    return data;
  });
  route('DELETE', '/api/account', ({ user, body, res }) => {
    const u = db.prepare('SELECT pw_hash FROM users WHERE id = ?').get(user.id);
    if (!auth.verifyPassword(String(body.password || ''), u.pw_hash)) throw new HttpError(401, 'Password incorrect');
    db.prepare('DELETE FROM users WHERE id = ?').run(user.id);
    res.setHeader('Set-Cookie', auth.clearCookie(secureCookies));
    return { ok: true };
  });

  // ── Request handling ─────────────────────────────────────────────────────
  async function readBody(req) {
    const chunks = []; let size = 0;
    for await (const c of req) { size += c.length; if (size > 8 * 1024 * 1024) throw new HttpError(413, 'Body too large'); chunks.push(c); }
    if (!size) return {};
    try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw new HttpError(400, 'Invalid JSON'); }
  }

  function serveStatic(req, res, pathname) {
    let base = STATIC['/']; let rel = pathname;
    if (pathname.startsWith('/shared/')) { base = STATIC['/shared/']; rel = pathname.slice('/shared'.length); }
    const file = path.normalize(path.join(base, decodeURIComponent(rel)));
    if (!file.startsWith(base)) { res.writeHead(403).end(); return; }
    let target = file;
    if (!fs.existsSync(target) || fs.statSync(target).isDirectory()) {
      if (path.extname(pathname)) { res.writeHead(404).end('Not found'); return; }
      target = path.join(STATIC['/'], 'index.html'); // SPA fallback
    }
    const ext = path.extname(target);
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Cache-Control': ext === '.html' || target.endsWith('sw.js') ? 'no-cache' : 'public, max-age=300' });
    fs.createReadStream(target).pipe(res);
  }

  const handler = async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'same-origin');
    res.setHeader('Permissions-Policy', 'camera=(self)');
    if (!url.pathname.startsWith('/api/')) { serveStatic(req, res, url.pathname); return; }
    res.setHeader('Content-Security-Policy', "default-src 'none'");
    try {
      // CSRF defence: state-changing requests must be JSON (cannot be sent cross-site by a plain form).
      if (req.method !== 'GET' && !(req.headers['content-type'] || '').includes('application/json')) throw new HttpError(415, 'Content-Type must be application/json');
      const r = routes.find((x) => x.method === req.method && x.re.test(url.pathname));
      if (!r) throw new HttpError(404, 'Not found');
      const m = url.pathname.match(r.re);
      const params = Object.fromEntries(r.keys.map((k, i) => [k, decodeURIComponent(m[i + 1])]));
      const token = auth.parseCookies(req.headers.cookie).nl_session;
      const user = auth.userFromToken(db, token);
      if (r.auth && !user) throw new HttpError(401, 'Not signed in');
      const body = req.method === 'GET' ? {} : await readBody(req);
      const out = await r.handler({ req, res, params, query: Object.fromEntries(url.searchParams), body, user, token, ip: req.socket.remoteAddress });
      if (out && out.__raw !== undefined) { res.writeHead(200, { 'Content-Type': out.type }); res.end(out.__raw); return; }
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify(out));
    } catch (e) {
      const status = e.status && e.status >= 400 && e.status < 600 ? e.status : 500;
      if (status === 500) console.error(e);
      res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: status === 500 ? 'Internal error' : e.message }));
    }
  };

  return { handler, db };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT) || 3000;
  const { handler } = createApp();
  http.createServer(handler).listen(port, () => {
    console.log(`NutriLongevity AI running on http://localhost:${port}`);
    console.log(`AI assistant: ${aiAvailable() ? 'enabled (Claude)' : 'offline mode — set ANTHROPIC_API_KEY to enable'}`);
  });
}
