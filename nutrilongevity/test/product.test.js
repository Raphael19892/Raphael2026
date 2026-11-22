import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { assessNova, INSUFFICIENT } from '../shared/novaAssess.js';
import { evaluateProduct, compareMany } from '../shared/productEval.js';
import { parseHtml, heuristicExtract, buildRecord } from '../shared/productExtract.js';
import { assertPublicUrl } from '../server/productFetch.js';

test('NOVA is never assigned without an ingredient list', () => {
  const r = assessNova('');
  assert.equal(r.group, null);
  assert.equal(r.message.he, 'לא ניתן לקבוע סיווג NOVA באופן אמין על סמך המידע הזמין.');
  assert.equal(assessNova('zorblax, qwertium, flimflam').group, null);
});

test('NOVA judges ingredient purpose, not mere presence of additives', () => {
  assert.equal(assessNova('Whole grain rolled oats').group, 1);
  assert.equal(assessNova('חלב, תרבית חיידקי יוגורט').group, 1);
  assert.equal(assessNova('Extra virgin olive oil').group, 2);
  const bread = assessNova('Wheat flour, water, salt, yeast');
  assert.deepEqual([bread.group, bread.confidence], [3, 'high']);
  // preservatives and acidity regulators alone do NOT make a product ultra-processed
  const hummus = assessNova('Chickpeas, tahini (sesame), water, lemon juice, garlic, salt, citric acid, potassium sorbate');
  assert.deepEqual([hummus.group, hummus.confidence], [3, 'high']);
  // one moderate cosmetic additive → borderline, low confidence
  const soy = assessNova('Water, hulled soybeans (8%), calcium carbonate, sea salt, stabiliser (gellan gum), vitamins (B12, D2)');
  assert.equal(soy.borderline, true); assert.equal(soy.confidence, 'low');
  // clear markers → NOVA 4, high confidence
  const cola = assessNova('Carbonated water, sugar, colour (caramel E150d), phosphoric acid, natural flavourings, caffeine');
  assert.deepEqual([cola.group, cola.confidence], [4, 'high']);
  const snack = assessNova('קמח תירס, שמן צמחי, אבקת בוטנים (25%), מלח, חומרי טעם וריח, משפר טעם (מונוסודיום גלוטמט)');
  assert.equal(snack.group, 4);
  assert.ok(snack.supporting.some((i) => i.cls === 'cosmetic'));
});

test('extraction keeps provenance and converts units explicitly', () => {
  const page = parseHtml('<p>Ingredients: Whole grain oats (100%).</p><h2>Nutrition information</h2><table><tr><th>Per 100g</th></tr><tr><td>Energy</td><td>1580 kJ / 375 kcal</td></tr><tr><td>Fat</td><td>7 g</td></tr><tr><td>of which saturates</td><td>1.3 g</td></tr><tr><td>Carbohydrate</td><td>60 g</td></tr><tr><td>of which sugars</td><td>1 g</td></tr><tr><td>Fibre</td><td>10 g</td></tr><tr><td>Protein</td><td>13 g</td></tr><tr><td>Salt</td><td>0.01 g</td></tr></table>');
  const rec = buildRecord(heuristicExtract(page), { type: 'url' }, 'heuristic');
  assert.equal(rec.nutrition.per100.kcal.prov, 'label');
  assert.equal(rec.nutrition.per100.sodium.prov, 'calculated');
  assert.equal(rec.nutrition.per100.sodium.value, 4);
  const serving = buildRecord({ found: true, basis: 'perServing', servingSize: '40 g', servingSizeG: 40, nutrition: { kcal: 160, protein: 4, salt: 0.2 } }, {}, 'ai');
  assert.equal(serving.nutrition.per100.kcal.value, 400);
  assert.equal(serving.nutrition.per100.kcal.prov, 'calculated');
  const noWeight = buildRecord({ found: true, basis: 'perServing', nutrition: { kcal: 160 } }, {}, 'ai');
  assert.equal(noWeight.nutrition.per100.kcal, undefined, 'no invented per-100 values');
});

test('a one-word ingredient list is read on its own', () => {
  const x = heuristicExtract(parseHtml('<div>רכיבים: בוטנים</div><h3>ערכים תזונתיים ל-100 גרם</h3><table><tr><td>אנרגיה (קלוריות)</td><td>585</td></tr></table>'));
  assert.equal(x.ingredientsText, 'בוטנים');
  assert.equal(assessNova(x.ingredientsText).group, 1);
});

test('nutrition score is separate from NOVA and comparisons follow goals', () => {
  const A = { identity: { name: 'Choco cereal' }, ingredientsText: 'Wheat flour, sugar, glucose syrup, cocoa powder, palm oil, salt, flavouring, emulsifier (soy lecithin)', nutrition: { basis: 'per100g', per100: { kcal: { value: 390 }, protein: { value: 7 }, sugars: { value: 30 }, fat: { value: 4 }, satFat: { value: 2 }, fiber: { value: 4 }, sodium: { value: 280 } } } };
  const B = { identity: { name: 'Oats' }, ingredientsText: 'Whole grain oat flakes', nutrition: { basis: 'per100g', per100: { kcal: { value: 375 }, protein: { value: 13 }, sugars: { value: 1 }, fat: { value: 7 }, satFat: { value: 1.3 }, fiber: { value: 10 }, sodium: { value: 5 } } } };
  const ea = evaluateProduct(A); const eb = evaluateProduct(B);
  assert.ok(eb.score.score > ea.score.score);
  assert.ok(!ea.score.components.some((c) => /nova|processing/i.test(c.key)), 'NOVA not inside the score');
  assert.ok(ea.cons.length && eb.pros.length && ea.alternatives.length);
  assert.equal(compareMany([{ rec: A, eval: ea }, { rec: B, eval: eb }], ['metabolic']).best.name, 'Oats');
  const sparse = evaluateProduct({ ingredientsText: '', nutrition: { per100: { kcal: { value: 300 } } } });
  assert.equal(sparse.score.score, null);
});

// End-to-end: serve a Hebrew product page locally and read it through the API (test-only private-URL switch).
let site; let api; let base; let cookie = '';
before(async () => {
  process.env.NODE_ENV = 'test'; process.env.NL_TEST_ALLOW_PRIVATE_URLS = '1'; delete process.env.ANTHROPIC_API_KEY;
  site = http.createServer((req, res) => {
    if (req.url === '/redirect') { res.writeHead(302, { Location: '/product' }); res.end(); return; }
    if (req.url === '/product') { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end('<html lang="he"><head><title>חטיף בוטנים</title><script type="application/ld+json">{"@type":"Product","name":"חטיף בוטנים 80 גרם","brand":{"name":"מותג"},"gtin13":"7290000000001"}</script></head><body><div>רכיבים: קמח תירס, שמן צמחי, אבקת בוטנים (25%), מלח, חומרי טעם וריח</div><h3>ערכים תזונתיים ל-100 גרם</h3><table><tr><td>אנרגיה (קלוריות)</td><td>536</td></tr><tr><td>חלבונים (גרם)</td><td>16</td></tr><tr><td>פחמימות (גרם)</td><td>48</td></tr><tr><td>מתוכן סוכרים (גרם)</td><td>2</td></tr><tr><td>שומנים (גרם)</td><td>31</td></tr><tr><td>מתוכם שומן רווי (גרם)</td><td>4.5</td></tr><tr><td>נתרן (מ"ג)</td><td>440</td></tr></table></body></html>'); return; }
    res.writeHead(404); res.end('nope');
  });
  await new Promise((r) => site.listen(0, r));
  const { createApp } = await import('../server/index.js');
  api = http.createServer(createApp({ dbFile: ':memory:' }).handler);
  await new Promise((r) => api.listen(0, r));
  base = `http://127.0.0.1:${api.address().port}`;
  const r = await fetch(`${base}/api/auth/register`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'p@example.com', password: 'longpassword' }) });
  cookie = r.headers.get('set-cookie').split(';')[0];
});
after(() => { site.close(); api.close(); delete process.env.NL_TEST_ALLOW_PRIVATE_URLS; });
const post = (body) => fetch(`${base}/api/product/analyze`, { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie }, body: JSON.stringify(body) }).then((r) => r.json());

test('reads a Hebrew product page (via redirect) with retrieval metadata', async () => {
  const r = await post({ url: `http://127.0.0.1:${site.address().port}/redirect` });
  assert.equal(r.ok, true);
  assert.equal(r.record.identity.name, 'חטיף בוטנים 80 גרם');
  assert.match(r.record.ingredientsText, /חומרי טעם וריח/);
  assert.equal(r.record.nutrition.per100.sodium.value, 440);
  assert.ok(r.record.source.retrievedAt && r.record.source.finalUrl.endsWith('/product'));
  assert.equal(r.record.extraction, 'heuristic');
  assert.equal(evaluateProduct(r.record).nova.group, 4);
});

test('an unreadable link is reported as not read', async () => {
  const r = await post({ url: `http://127.0.0.1:${site.address().port}/missing` });
  assert.equal(r.ok, false);
  assert.equal(r.access.ok, false);
  assert.match(r.access.message, /404/);
  const t = await post({ text: 'Ingredients: tomatoes, salt' });
  assert.equal(t.ok, true);
  assert.equal(assessNova(t.record.ingredientsText).group, 3);
});
