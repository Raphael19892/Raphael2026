import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createApp } from '../server/index.js';

delete process.env.ANTHROPIC_API_KEY;
let server; let base; let cookie = '';

async function req(method, path, body, { raw = false, headers = {} } = {}) {
  const res = await fetch(base + path, {
    method,
    headers: { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}), ...headers },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const sc = res.headers.get('set-cookie');
  if (sc) cookie = sc.split(';')[0];
  return { status: res.status, data: raw ? await res.text() : await res.json().catch(() => null), headers: res.headers };
}

before(async () => {
  const { handler } = createApp({ dbFile: ':memory:' });
  server = http.createServer(handler);
  await new Promise((r) => server.listen(0, r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());

const profile = { age: 52, sex: 'male', heightCm: 178, weightKg: 82, activity: 'light', diet: 'pescatarian', allergies: ['peanut'], conditions: [], mealsPerDay: 4 };

test('auth: protected routes need a session; register, login, wrong password', async () => {
  assert.equal((await req('GET', '/api/me')).status, 401);
  assert.equal((await req('POST', '/api/auth/register', { email: 'bad', password: 'x' })).status, 400);
  const r = await req('POST', '/api/auth/register', { email: 'a@example.com', password: 'longpassword', name: 'A' });
  assert.equal(r.status, 200);
  assert.match(r.headers.get('set-cookie'), /HttpOnly; SameSite=Lax/);
  assert.equal((await req('POST', '/api/auth/register', { email: 'a@example.com', password: 'longpassword' })).status, 409);
  cookie = '';
  assert.equal((await req('POST', '/api/auth/login', { email: 'a@example.com', password: 'wrongpassword' })).status, 401);
  assert.equal((await req('POST', '/api/auth/login', { email: 'a@example.com', password: 'longpassword' })).status, 200);
  assert.equal((await req('GET', '/api/me')).data.user.email, 'a@example.com');
});

test('CSRF guard: non-JSON state changes are rejected', async () => {
  const r = await req('POST', '/api/logs', undefined, { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
  assert.equal(r.status, 415);
});

test('profile validation and targets', async () => {
  assert.equal((await req('PUT', '/api/profile', { profile: { ...profile, age: 12 } })).status, 400);
  const r = await req('PUT', '/api/profile', { profile });
  assert.equal(r.status, 200);
  assert.ok(r.data.targets.kcal > 1500);
});

test('plan → log → analysis → optimise → export', async () => {
  const g = await req('POST', '/api/plan/generate', { startDate: '2026-03-02', seed: 5 });
  assert.equal(g.status, 200);
  const plan = g.data.plan;
  for (const d of plan.days) for (const m of d.meals) for (const it of m.items) assert.notEqual(it.foodId, 'chicken'); // pescatarian
  plan.days[0].meals[0].items[0].grams += 10;
  assert.equal((await req('PUT', `/api/plan/${plan.id}`, { plan })).status, 200);
  const meal = plan.days[0].meals[1];
  assert.equal((await req('POST', '/api/logs', { date: '2026-03-02', slot: meal.slot, title: meal.name.en, items: meal.items })).status, 200);
  assert.equal((await req('POST', '/api/logs', { date: '2026-03-02', items: [{ foodId: 'nope', grams: 10 }] })).status, 400);
  const w = await req('GET', '/api/analysis/week?end=2026-03-03');
  assert.equal(w.data.analysis.nDays, 1);
  const o = await req('POST', '/api/analysis/optimize', { end: '2026-03-03' });
  assert.equal(o.data.plan.kind, 'optimized');
  assert.equal(o.data.plan.startDate, '2026-03-04');
  const tr = await req('GET', '/api/analysis/trends?days=14&end=2026-03-03');
  assert.equal(tr.data.series.length, 14);
  const csv = await req('GET', '/api/export?format=csv', undefined, { raw: true });
  assert.match(csv.data, /^"date","slot"/);
  const json = await req('GET', '/api/export');
  assert.equal(json.data.logs.length, 1);
});

test('favourites, ingredient analysis and offline assistant with real citations', async () => {
  const p = (await req('GET', '/api/plan/current')).data.plan;
  const f = await req('POST', '/api/favorites', { meal: p.days[0].meals[0] });
  assert.equal(f.status, 200);
  assert.equal((await req('GET', '/api/favorites')).data.favorites.length, 1);
  const a = await req('POST', '/api/analyze/ingredients', { text: 'sugar, maltodextrin, flavouring', per100: { kcal: 400, sugars: 50 } });
  assert.equal(a.data.analysis.nova, 4);
  const c = await req('POST', '/api/ai/chat', { message: 'How does this meal affect blood glucose?' });
  assert.equal(c.data.mode, 'offline');
  assert.ok(c.data.refs.includes('zeevi2015'));
  assert.equal((await req('GET', '/api/ai/history')).data.messages.length, 2);
  assert.equal((await req('POST', '/api/scan/label', { imageBase64: 'abc', mediaType: 'image/png' })).status, 503);
});

test('analyzer endpoint, diary edits and meta', async () => {
  const a = await req('POST', '/api/analyze/meal', { text: 'two slices of whole wheat bread with avocado and eggs', lang: 'en' });
  assert.equal(a.status, 200);
  assert.equal(a.data.mode, 'rules');
  assert.ok(a.data.items.some((i) => i.foodId === 'ww_bread'));
  const log = await req('POST', '/api/logs', { date: '2026-03-05', slot: 'breakfast', title: 'Toast', source: 'analyzer', items: a.data.items, meta: { text: 'toast', score: 78, mode: 'rules', photo: 'javascript:alert(1)' } });
  assert.equal(log.data.meta.score, 78);
  assert.equal(log.data.meta.photo, undefined, 'unsafe photo data rejected');
  const upd = await req('PUT', `/api/logs/${log.data.id}`, { items: [{ foodId: 'ww_bread', grams: 32 }], slot: 'snack', meta: { score: 70 } });
  assert.equal(upd.data.slot, 'snack');
  assert.equal(upd.data.items[0].grams, 32);
  const day = await req('GET', '/api/logs?from=2026-03-05&to=2026-03-05');
  assert.equal(day.data.logs[0].meta.score, 70);
  assert.equal((await req('PUT', '/api/logs/99999', { slot: 'lunch' })).status, 404);
  assert.equal((await req('POST', '/api/analyze/meal', { text: '' })).status, 400);
  assert.equal((await req('GET', '/api/research/search?q=ab')).status, 400);
});

test('static serving blocks traversal and serves shared modules', async () => {
  assert.equal((await fetch(`${base}/shared/engine.js`)).status, 200);
  const r = await new Promise((resolve) => http.get({ host: '127.0.0.1', port: server.address().port, path: '/shared/../server/auth.js' }, resolve));
  assert.notEqual(r.statusCode, 200);
});

test('account deletion requires password and removes data', async () => {
  assert.equal((await req('DELETE', '/api/account', { password: 'nope' })).status, 401);
  assert.equal((await req('DELETE', '/api/account', { password: 'longpassword' })).status, 200);
  cookie = '';
  assert.equal((await req('POST', '/api/auth/login', { email: 'a@example.com', password: 'longpassword' })).status, 401);
});
