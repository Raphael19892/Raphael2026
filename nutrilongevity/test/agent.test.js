import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { runAgent, localCandidates, rulePick, ruleVerify, ruleWrite, exclusionsOf, MIN_APPROVED } from '../shared/researchAgent.js';

const fakeStudies = (n) => Array.from({ length: n }, (_, i) => ({ id: `s${i}`, title: `Study ${i}`, journal: 'J', year: 2024, studyType: 'review', sample: 'n=100', claim: `claim ${i}`, url: `https://example.org/${i}` }));

test('coordinator stops when fewer than 3 studies are approved and never runs the writer', async () => {
  let wrote = false;
  const r = await runAgent('fiber', {
    search: async () => ({ studies: fakeStudies(5) }),
    verify: async (_, s) => ({ rows: s.map((x, i) => ({ id: x.id, verdict: i < 2 ? 'approved' : 'rejected', linkOpened: true })), confidence: 'low', confidenceReason: '' }),
    write: async () => { wrote = true; return {}; },
  });
  assert.equal(MIN_APPROVED, 3);
  assert.equal(r.stopped.reason, 'fewer_than_3_approved');
  assert.deepEqual(r.counts, { found: 5, approved: 2, rejected: 3, needsCorrection: 0 });
  assert.equal(wrote, false);
});

test('writer receives only approved studies; failures are reported with the stage', async () => {
  let got;
  const r = await runAgent('fiber', {
    search: async () => ({ studies: fakeStudies(6) }),
    verify: async (_, s) => ({ rows: s.map((x, i) => ({ id: x.id, verdict: i % 2 ? 'needs_correction' : 'approved', linkOpened: true })), confidence: 'medium', confidenceReason: '' }),
    write: async (_, approved) => { got = approved.map((a) => a.id); return { summary: ['x'] }; },
  });
  assert.deepEqual(got, ['s0', 's2', 's4']);
  assert.equal(r.counts.needsCorrection, 3);
  const f = await runAgent('fiber', { search: async () => { throw new Error('boom'); } });
  assert.equal(f.stopped.stage, 'search'); assert.match(f.stopped.message, /boom/);
});

test('library pipeline (no AI): real curated studies, honest about unopened links', () => {
  const cands = localCandidates('סיבים תזונתיים ובריאות המעי');
  assert.ok(cands.length >= 3);
  const picked = rulePick(cands);
  assert.ok(picked.length >= 3 && picked.length <= 8);
  const studies = picked.map((p) => ({ ...cands.find((c) => c.id === p.id), ...p, linkOpened: false, sourceText: cands.find((c) => c.id === p.id).findings }));
  const v = ruleVerify(studies);
  assert.ok(v.rows.every((r) => r.linkOpened === false));
  assert.equal(v.confidence, 'low', 'unopened links lower confidence');
  // a study without any source text is never approved
  const v2 = ruleVerify([{ id: 'x', claim: 'something important here', linkOpened: false, sourceText: '' }]);
  assert.equal(v2.rows[0].verdict, 'rejected');
});

test('menu suggestion respects the person\'s exclusions', () => {
  const profile = { diet: 'omnivore', dislikes: ['salmon', 'sardines', 'tuna', 'cod', 'spinach', 'kale', 'arugula', 'romaine'], allergies: [] };
  const ex = exclusionsOf(profile, 'he');
  assert.ok(ex.includes('דגים') && ex.includes('עלים ירוקים'));
  const w = ruleWrite('שמן זית ותמותה', fakeStudies(3), { confidence: 'medium' }, profile, 'he');
  assert.match(w.menuSuggestion, /שמן זית/);
  assert.equal(w.summary.length, 3);
  assert.match(w.summary[0], /\[1\]$/);
});

test('API: agent endpoints run end to end (library fallback when PubMed is unreachable)', async () => {
  delete process.env.ANTHROPIC_API_KEY;
  const { createApp } = await import('../server/index.js');
  const srv = http.createServer(createApp({ dbFile: ':memory:' }).handler);
  await new Promise((r) => srv.listen(0, r));
  const base = `http://127.0.0.1:${srv.address().port}`;
  const reg = await fetch(`${base}/api/auth/register`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'a@example.com', password: 'longpassword' }) });
  const cookie = reg.headers.get('set-cookie').split(';')[0];
  const post = (p, b) => fetch(base + p, { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie }, body: JSON.stringify(b) }).then((r) => r.json());
  const s = await post('/api/agent/search', { topic: 'dietary fibre and mortality', lang: 'en' });
  assert.ok(s.studies.length >= 3, 'studies found');
  assert.ok(['pubmed', 'library'].includes(s.mode));
  const v = await post('/api/agent/verify', { topic: 'fibre', studies: s.studies, lang: 'en' });
  assert.equal(v.rows.length, s.studies.length);
  if (s.mode === 'library') assert.ok(v.rows.every((r) => r.linkOpened === false));
  await post('/api/agent/reports', { report: { topic: 'fibre', counts: { found: 1 } } });
  const list = await fetch(`${base}/api/agent/reports`, { headers: { Cookie: cookie } }).then((r) => r.json());
  assert.equal(list.reports[0].topic, 'fibre');
  srv.close();
});
