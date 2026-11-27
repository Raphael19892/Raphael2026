import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createApp } from '../server/index.js';
import { buildWeeklyMenu, DEFAULT_MENU_RULES, EXCLUDE_GROUPS, excludedIds, parseRequestsRules, normalizeRequests, MENU_MEALS } from '../shared/menuBuilder.js';
import { FOOD_MAP } from '../shared/foods.js';

const forbidden = new Set(DEFAULT_MENU_RULES.exclude.flatMap((g) => EXCLUDE_GROUPS[g] || []));
const MEAT = (id) => FOOD_MAP[id]?.group === 'protein' && /chicken|beef|turkey|lamb|meat|hot_dog/.test(id);

test('weekly menu: 7 days × 4 meals, never an excluded food, alternative for every meal', () => {
  for (let seed = 1; seed <= 15; seed++) {
    const r = buildWeeklyMenu({ kcalTarget: 2100, seed, startDate: '2026-11-29' });
    assert.equal(r.days.length, 7);
    for (const d of r.days) {
      assert.equal(d.meals.length, 4);
      for (const m of d.meals) {
        for (const i of [...m.items, ...(m.alternative?.items || [])]) assert.ok(!forbidden.has(i.foodId), `seed ${seed}: ${i.foodId} is excluded`);
        assert.ok(m.alternative, 'every meal has an alternative');
      }
    }
    assert.ok(r.qa.find((q) => q.key === 'noForbidden').ok);
    assert.ok(r.qa.find((q) => q.key === 'shoppingUsed').ok);
    assert.ok(r.plants > 10);
  }
});

test('weekly menu: fibre in range and daily groups present in nearly all builds at a typical energy target', () => {
  let ok = 0;
  for (let seed = 1; seed <= 20; seed++) {
    const r = buildWeeklyMenu({ kcalTarget: 2100, seed });
    if (r.qa.find((q) => q.key === 'fiberRange').ok && r.qa.find((q) => q.key === 'dailyFoods').ok) ok++;
    // When a check fails, the build must say so (no silent pass).
    for (const d of r.days) assert.equal(d.fiberOk, d.fiber >= r.rules.fiberMin && d.fiber <= r.rules.fiberMax);
  }
  assert.ok(ok >= 17, `only ${ok}/20 builds passed`);
});

test('kosher: no meal combines meat and dairy; excluded meals list is honoured', () => {
  const r = buildWeeklyMenu({ kcalTarget: 2100, seed: 7 });
  for (const d of r.days) for (const m of d.meals) {
    const meat = m.items.some((i) => MEAT(i.foodId));
    const dairy = m.items.some((i) => FOOD_MAP[i.foodId]?.group === 'dairy');
    assert.ok(!(meat && dairy), `${m.name.en} mixes meat and dairy`);
  }
  assert.ok(r.qa.find((q) => q.key === 'kosher').ok);
  assert.ok(MENU_MEALS.length >= 20);
});

test('extra exclusions from rules (e.g. eggs) are applied', () => {
  const rules = { ...DEFAULT_MENU_RULES, exclude: [...DEFAULT_MENU_RULES.exclude, 'eggs'] };
  const ex = excludedIds(rules);
  const r = buildWeeklyMenu({ rules, kcalTarget: 2100, seed: 3 });
  for (const d of r.days) for (const m of d.meals) for (const i of m.items) assert.ok(!ex.has(i.foodId), i.foodId);
});

test('special requests: Shabbat, an event day and "without broccoli" (Hebrew, rule-based)', () => {
  const q = parseRequestsRules('שבת, אירוע ביום שלישי בערב, בלי ברוקולי');
  assert.equal(q.shabbat, true);
  assert.deepEqual(q.skip.map((s) => [s.day, s.slot]), [[2, 'dinner']]);
  assert.ok(q.remove.includes('broccoli'));
  const r = buildWeeklyMenu({ kcalTarget: 2100, seed: 5, requests: q, startDate: '2026-11-29' });
  const tue = r.days.find((d) => d.dow === 2);
  assert.ok(tue.meals.find((m) => m.slot === 'dinner').skipped);
  for (const d of r.days) for (const m of d.meals) for (const i of m.items || []) assert.notEqual(i.foodId, 'broccoli');
  // English works too, and unknown ids from an AI answer are dropped.
  assert.equal(parseRequestsRules('event on friday lunch').skip[0].day, 5);
  assert.deepEqual(normalizeRequests({ add: ['not_a_food'], skip: [{ day: 9, slot: 'lunch' }] }), { shabbat: false, notes: '', skip: [], add: [], remove: [] });
});

let server, base, cookie = '';
async function req(method, path, body) {
  const res = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) }, body: body !== undefined ? JSON.stringify(body) : undefined });
  const sc = res.headers.get('set-cookie'); if (sc) cookie = sc.split(';')[0];
  return { status: res.status, data: await res.json().catch(() => null) };
}
before(async () => {
  const { handler } = createApp({ dbFile: ':memory:' });
  server = http.createServer(handler); await new Promise((r) => server.listen(0, r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());

test('API: requests parsing, import as weekly plan, menu rules saved on the profile', async () => {
  assert.equal((await req('POST', '/api/auth/register', { email: 'm@example.com', password: 'longpassword', name: 'M' })).status, 200);
  const p = await req('PUT', '/api/profile', { profile: { age: 40, sex: 'male', heightCm: 175, weightKg: 75, activity: 'light', diet: 'omnivore', allergies: [], conditions: [], mealsPerDay: 4, menuRules: { ...DEFAULT_MENU_RULES, fiberMin: 32, exclude: ['fish', 'bogus'] } } });
  assert.equal(p.status, 200);
  assert.equal(p.data.profile.menuRules.fiberMin, 32);
  assert.deepEqual(p.data.profile.menuRules.exclude, ['fish']);
  const rq = await req('POST', '/api/menu/requests', { text: 'שבת, בלי ברוקולי' });
  assert.equal(rq.status, 200); assert.equal(rq.data.shabbat, true); assert.ok(['rules', 'ai'].includes(rq.data.mode));
  const r = buildWeeklyMenu({ kcalTarget: 2100, seed: 2, requests: rq.data });
  const imp = await req('POST', '/api/plan/import', { plan: r.plan });
  assert.equal(imp.status, 200);
  assert.equal(imp.data.plan.kind, 'weekly-menu');
  assert.equal(imp.data.plan.days.length, 7);
  const cur = await req('GET', '/api/plan/current');
  assert.equal(cur.data.plan.id, imp.data.plan.id);
});
