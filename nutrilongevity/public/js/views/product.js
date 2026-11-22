// Product & Link Intelligence — paste product links (or a label photo / PDF / text) and get identification,
// ingredient analysis, nutrition with provenance, an evidence-based NOVA assessment with confidence,
// a separate nutritional score, pros/cons, alternatives and a goal-aware comparison.
import { h, fill, add, icon, fmt, toast, todayIso, dateLabel, pill, loading, imagePicker } from '../ui.js';
import { t, lang } from '../i18n.js';
import { api, state } from '../api.js';
import { evaluateProduct, compareMany, per100Values } from '/shared/productEval.js';
import { NUTRIENT_META } from '/shared/foods.js';
import { scoreDial, targetBar } from '../charts.js';
import { refChip } from './components.js';

export const pending = { urls: [], autorun: false };
let results = []; // [{ input, resp, eval }]

export function queueUrl(url) { pending.urls = [url]; pending.autorun = true; }

const CLASS_LABEL = (c) => t(`icls_${c}`);
const PROV = { label: 'provLabel', calculated: 'provCalc', estimated: 'provEst' };

export async function render(view) {
  const urls = pending.urls.length ? [...pending.urls] : (results.length ? results.filter((r) => r.input.url).map((r) => r.input.url) : ['']);
  if (!urls.length) urls.push('');
  const list = h('div', { class: 'url-list' });
  const out = h('div', { class: 'product-results' });
  const drawInputs = () => fill(list, urls.map((u, i) => h('div', { class: 'url-row' },
    h('input', { type: 'url', inputmode: 'url', value: u, placeholder: t('urlPh'), 'aria-label': `${t('productLink')} ${i + 1}`, dir: 'ltr', oninput: (e) => { urls[i] = e.target.value; } }),
    urls.length > 1 && h('button', { class: 'icon-btn sm', 'aria-label': t('remove'), onclick: () => { urls.splice(i, 1); drawInputs(); } }, icon('close', 14)))));
  drawInputs();

  const go = h('button', { class: 'btn primary big', onclick: () => run() }, icon('search', 18), ' ', t('analyzeProducts'));
  async function run(extra) {
    const inputs = extra ? [extra] : urls.map((u) => u.trim()).filter(Boolean).map((url) => ({ url }));
    if (!inputs.length) { toast(t('pasteLinkFirst'), 'err'); return; }
    for (const i of inputs) if (i.url && !/^https?:\/\//i.test(i.url)) i.url = `https://${i.url}`;
    go.disabled = true;
    fill(out, loading(inputs.some((i) => i.url) ? t('readingPages') : t('readingLabel')));
    const res = await Promise.all(inputs.map(async (input) => {
      try { const resp = await api('/api/product/analyze', { method: 'POST', body: input }); return { input, resp, eval: resp.ok ? evaluateProduct(resp.record) : null }; } catch (e) { return { input, resp: { ok: false, error: e.message } }; }
    }));
    results = extra ? [...results.filter((r) => r.resp.ok), ...res] : res;
    pending.urls = []; go.disabled = false;
    drawResults();
  }
  const drawResults = () => fill(out, results.map((r, i) => resultCard(r, i, run)), comparison(results.filter((r) => r.resp.ok && r.eval)));

  // Alternatives to a link: label photo, PDF, pasted text
  const photoIn = imagePicker((img) => run({ imageBase64: img.b64, mediaType: img.type }));
  const pdfIn = h('input', { type: 'file', accept: 'application/pdf', hidden: true, onchange: async () => { const f = pdfIn.files[0]; if (!f) return; if (f.size > 7e6) { toast(t('fileTooLarge'), 'err'); return; } run({ pdfBase64: await toB64(f) }); } });
  const pasteTa = h('textarea', { rows: 5, placeholder: t('pasteLabelPh'), 'aria-label': t('pasteLabel') });

  fill(view,
    h('div', { class: 'section-head' }, h('h1', {}, t('nav_product'))),
    h('p', { class: 'muted' }, t('productIntro')),
    h('section', { class: 'card' },
      h('label', { class: 'field' }, h('span', {}, t('productLinks'))),
      list,
      h('div', { class: 'analyze-row' },
        urls.length < 4 && h('button', { class: 'btn ghost small', onclick: () => { urls.push(''); drawInputs(); } }, icon('plus', 14), ' ', t('addAnotherLink')),
        go),
      !state.status.productLinks && h('div', { class: 'flag flag-warn' }, icon('info', 18), h('p', {}, t('linksNotHere'))),
      h('details', { class: 'alt-inputs' }, h('summary', {}, t('noLinkOptions')),
        h('div', { class: 'row-actions' },
          h('button', { class: 'btn small', onclick: () => photoButton(photoIn) }, icon('camera', 15), ' ', t('uploadLabel')),
          state.status.productLinks && state.status.ai && h('button', { class: 'btn small', onclick: () => pdfIn.click() }, icon('upload', 15), ' ', t('uploadPdf'))),
        pasteTa,
        h('button', { class: 'btn small', onclick: () => { if (pasteTa.value.trim()) run({ text: pasteTa.value.trim() }); } }, t('analyzeText')),
        photoIn, pdfIn)),
    out);
  if (results.length) drawResults();
  if (pending.autorun) { pending.autorun = false; run(); }
}

// When a link cannot be read: open the page yourself, then paste its text or upload a screenshot of the label.
function fallbackBox(url, run) {
  const ta = h('textarea', { rows: 5, placeholder: t('pasteLabelPh'), 'aria-label': t('pasteLabel') });
  const shot = imagePicker((img) => run({ imageBase64: img.b64, mediaType: img.type }));
  return h('div', { class: 'fallback-box' },
    h('ol', { class: 'steps' },
      h('li', {}, h('a', { class: 'btn small', href: url, target: '_blank', rel: 'noopener noreferrer' }, icon('link', 14), ' ', t('openPage'))),
      h('li', {}, t('copyStep')),
      h('li', {}, t('pasteStep'))),
    ta,
    h('div', { class: 'row-actions' },
      h('button', { class: 'btn primary small', onclick: () => { if (ta.value.trim()) run({ text: ta.value.trim() }); else toast(t('pasteFirst'), 'err'); } }, icon('sparkle', 14), ' ', t('analyzeText')),
      h('button', { class: 'btn small', onclick: () => photoButton(shot) }, icon('camera', 14), ' ', t('uploadScreenshot'))),
    shot);
}

// Photos need Claude to read them; explain instead of silently hiding the button.
function photoButton(input) {
  if (!(state.status.labelAi || state.status.photoAi)) { toast(t('photoNoAi'), 'err'); return; }
  input.click();
}

function toB64(file) { return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1]); r.onerror = rej; r.readAsDataURL(file); }); }

// ── One product ────────────────────────────────────────────────────────
function resultCard(r, idx, run) {
  const L = lang();
  if (!r.resp.ok) {
    const a = r.resp.access || {};
    return h('section', { class: 'card warn-card' },
      h('h3', {}, icon('warn', 17), ' ', t('linkNotRead')),
      r.input.url && h('p', { class: 'small', dir: 'ltr' }, r.input.url),
      h('p', {}, h('strong', {}, t('notReadHonest')), ' ', a.message || r.resp.message || r.resp.error || ''),
      h('p', { class: 'muted small' }, t('tryInstead')),
      r.input.url && fallbackBox(r.input.url, run));
  }
  const rec = r.resp.record; const ev = r.eval; const id = rec.identity; const src = rec.source || {};
  const p = rec.nutrition.per100;
  const values = per100Values(rec.nutrition);
  const unit = rec.nutrition.basis === 'per100ml' ? '100 ml' : '100 g';
  const nova = ev.nova;
  return h('article', { class: 'card product-card' },
    // Identification
    h('div', { class: 'prod-id' },
      id.image && /^https:\/\//.test(id.image) ? h('img', { src: id.image, alt: '', class: 'product-img', referrerpolicy: 'no-referrer', loading: 'lazy' }) : h('span', { class: 'product-emoji' }, '🏷️'),
      h('div', {},
        h('small', { class: 'muted' }, t('productN', { n: idx + 1 })),
        h('h2', {}, id.name || t('unnamedProduct')),
        (id.brand || id.manufacturer) && h('p', { class: 'muted' }, [id.brand, id.manufacturer].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).join(' · ')),
        id.barcode && h('p', { class: 'muted small' }, `${t('barcode')}: ${id.barcode}`))),
    h('div', { class: 'source-note' }, icon('flask', 14), h('div', {},
      src.type === 'url' ? h('span', {}, t('readFrom'), ' ', h('a', { href: src.finalUrl, target: '_blank', rel: 'noopener noreferrer', dir: 'ltr' }, src.domain), ` · ${dateLabel(src.retrievedAt.slice(0, 10), { day: 'numeric', month: 'short', year: 'numeric' })} ${src.retrievedAt.slice(11, 16)} UTC`) : h('span', {}, t(`src_${src.type}`), ` · ${src.retrievedAt?.slice(0, 10) || ''}`),
      h('div', {}, rec.extraction === 'ai' ? t('extractAi') : t('extractHeuristic')))),
    !rec.found && h('div', { class: 'flag flag-warn' }, icon('warn', 18), h('p', {}, t('noProductInfo'), rec.aiNotes ? ` ${rec.aiNotes}` : '')),
    rec.notes.map((n) => h('p', { class: 'hint' }, icon('info', 13), ' ', n[L] || n.en)),
    h('div', { class: 'legend prov-legend' }, h('span', {}, pill(t('provLabel'), 'good'), ' ', t('provLabelEx')), h('span', {}, pill(t('provCalc')), ' ', t('provCalcEx')), h('span', {}, pill(t('provEst'), 'warn'), ' ', t('provEstEx')), h('span', {}, pill(t('provInterp'), 'inf-mixed'), ' ', t('provInterpEx'))),

    // Ingredients
    h('section', { class: 'sub' },
      h('h3', {}, t('ingredients')),
      rec.ingredientsText ? h('div', {},
        h('p', { class: 'ing-text' }, pill(t('provLabel'), 'good'), ' ', rec.ingredientsText),
        h('div', { class: 'ing-chips' }, nova.ingredients.map((i) => h('span', { class: `ichip ic-${i.cls}${i.strength ? ` st-${i.strength}` : ''}`, title: (lang() === 'he' ? i.purposeHe : i.purpose) || '' }, i.text, h('small', {}, CLASS_LABEL(i.cls))))),
        rec.ingredientsComplete === false && h('p', { class: 'hint' }, t('listIncomplete')))
        : h('p', { class: 'muted' }, t('noIngredients'))),

    // Nutrition
    h('section', { class: 'sub' },
      h('h3', {}, t('nutritionPer', { unit })),
      Object.keys(p).length ? h('table', { class: 'ntable' }, h('tbody', {},
        ['kcal', 'protein', 'carbs', 'sugars', 'addedSugar', 'fat', 'satFat', 'transFat', 'fiber', 'sodium'].filter((k) => p[k]).map((k) => h('tr', {},
          h('th', {}, k === 'transFat' ? t('transFat') : t(k)), h('td', {}, `${fmt(p[k].value, NUTRIENT_META[k]?.dp ?? 1)} ${NUTRIENT_META[k]?.unit || 'g'}`),
          h('td', {}, pill(t(PROV[p[k].prov]), p[k].prov === 'label' ? 'good' : p[k].prov === 'estimated' ? 'warn' : '')))))) : h('p', { class: 'muted' }, t('noNutrition')),
      rec.nutrition.servingSize && h('p', { class: 'muted small' }, `${t('servingSize')}: ${rec.nutrition.servingSize}`),
      ['fiber', 'addedSugar', 'satFat', 'sodium'].filter((k) => values[k] == null).length ? h('p', { class: 'hint' }, t('notDeclared'), ': ', ['fiber', 'addedSugar', 'satFat', 'sodium'].filter((k) => values[k] == null).map((k) => t(k)).join(', ')) : null,
      rec.claims?.length ? h('p', { class: 'small' }, h('strong', {}, t('claims')), ': ', rec.claims.join(' · ')) : null),

    // NOVA
    h('section', { class: `sub nova-box ${nova.group ? `nova-g${nova.group}` : 'nova-none'}` },
      h('div', { class: 'card-head' }, h('h3', {}, t('novaAssessment'), ' ', refChip('monteiro2019')), pill(t('provInterp'), 'inf-mixed')),
      nova.insufficient
        ? h('div', {}, h('p', { class: 'nova-insufficient' }, nova.message.he), L === 'en' && h('p', { class: 'muted small' }, nova.message.en), h('p', { class: 'small' }, nova.explanation[L] || nova.explanation.en))
        : h('div', {},
          h('div', { class: 'nova-head' }, h('span', { class: `nova nova-${nova.group} big` }, `NOVA ${nova.group}`), h('div', {}, h('strong', {}, t(`novaName${nova.group}`)), h('div', {}, t('confidence'), ': ', h('b', {}, t(`conf_${nova.confidence}`)), nova.borderline ? ` · ${t('borderline')}` : ''))),
          h('p', {}, nova.explanation[L] || nova.explanation.en),
          nova.supporting.length ? h('div', {}, h('small', { class: 'muted' }, t('supportingIngredients')), h('ul', { class: 'marker-list' }, nova.supporting.slice(0, 12).map((i) => h('li', {}, `“${i.text}” — ${(lang() === 'he' ? i.purposeHe : i.purpose) || ''} (${CLASS_LABEL(i.cls)})`)))) : null),
      nova.indicators?.length ? h('p', { class: 'small' }, h('strong', {}, t('procIndicators')), ': ', nova.indicators.map((x) => x.label).join('; ')) : null,
      nova.missing?.length ? h('div', {}, h('small', { class: 'muted' }, t('missingInfo')), h('ul', { class: 'marker-list' }, nova.missing.map((m) => h('li', {}, m[L] || m.en)))) : null,
      rec.verification?.offNova ? h('p', { class: 'hint' }, t('offNovaSays', { n: rec.verification.offNova })) : null,
      h('p', { class: 'hint' }, t('novaNotHealth'))),

    // Score
    h('section', { class: 'sub' },
      h('div', { class: 'card-head' }, h('h3', {}, t('nutritionScore')), pill(t('provInterp'), 'inf-mixed')),
      ev.score.score != null ? h('div', { class: 'score-top' }, scoreDial(ev.score.score), h('div', {},
        h('p', {}, t('reliability'), ': ', h('b', {}, t(`conf_${ev.score.reliability}`))),
        h('p', { class: 'hint' }, t('productScoreNote')))) : h('p', { class: 'muted' }, t('noScore')),
      ev.score.components.map((c) => h('div', { class: 'metric' },
        h('div', { class: 'metric-top' }, h('span', {}, t(`psc_${c.key}`)), h('strong', {}, fmt(c.points, 1), h('small', {}, ` / ${c.max}`))),
        targetBar(c.points, c.max, { kind: 'min', max: c.max }), h('small', { class: 'muted' }, c[L] || c.en))),
      ev.score.limitations?.length ? h('details', {}, h('summary', {}, t('scoreLimits')), h('ul', {}, ev.score.limitations.map((x) => h('li', { class: 'small' }, x[L] || x.en))), h('p', { class: 'hint' }, t('scoreLimitsGeneral'))) : h('p', { class: 'hint' }, t('scoreLimitsGeneral'))),

    // Evaluation
    h('section', { class: 'sub eval' },
      h('div', { class: 'card-head' }, h('h3', {}, t('scientificEval')), pill(t('provInterp'), 'inf-mixed')),
      ev.pros.length ? h('div', { class: 'eval-block good' }, h('h4', {}, '✅ ', t('advantages')), h('ul', {}, ev.pros.map((x) => h('li', {}, x[L] || x.en, ' ', x.refs.map(refChip))))) : null,
      ev.cons.length ? h('div', { class: 'eval-block bad' }, h('h4', {}, '⚠️ ', t('disadvantages')), h('ul', {}, ev.cons.map((x) => h('li', {}, x[L] || x.en, ' ', x.refs.map(refChip))))) : null,
      !ev.pros.length && !ev.cons.length ? h('p', { class: 'muted' }, t('notEnoughForEval')) : null,
      h('div', { class: 'eval-block improve' }, h('h4', {}, '💡 ', t('betterAlternatives')),
        ev.alreadyGood ? h('p', { class: 'small' }, t('alreadyGood')) : h('ul', {}, ev.alternatives.map((a) => h('li', {}, a[L] || a.en))))),

    // Verification
    rec.verification && h('section', { class: 'sub' },
      h('h3', {}, t('verification')),
      rec.verification.unavailable ? h('p', { class: 'muted small' }, t('verifyUnavailable')) : h('div', {},
        h('p', { class: 'small' }, t('comparedWith'), ' ', h('a', { href: rec.verification.url, target: '_blank', rel: 'noopener noreferrer' }, 'Open Food Facts'), ` (${t('supplementary')}) · ${rec.verification.retrievedAt.slice(0, 10)}`),
        rec.verification.checks.length ? h('table', { class: 'ntable' }, h('tbody', {}, rec.verification.checks.map((c) => h('tr', {}, h('th', {}, t(c.key)), h('td', {}, fmt(c.source, 1)), h('td', {}, `OFF ${fmt(c.off, 1)} ${c.ok ? '✓' : '≠'}`))))) : h('p', { class: 'muted small' }, t('nothingToCompare')))),

    rec.quotes?.ingredients || rec.quotes?.nutrition ? h('details', {}, h('summary', {}, t('whereFound')), rec.quotes.ingredients && h('blockquote', {}, rec.quotes.ingredients), rec.quotes.nutrition && h('blockquote', {}, rec.quotes.nutrition)) : null,
    values.kcal != null && logRow(rec, nova));
}

function logRow(rec, nova) {
  const g = h('input', { type: 'number', value: rec.nutrition.servingSizeG || 100, min: 1, max: 2000 });
  return h('div', { class: 'log-row' }, h('label', {}, t('amount'), g, ' g'),
    h('button', { class: 'btn small primary', onclick: async () => {
      const per100 = per100Values(rec.nutrition);
      await api('/api/logs', { method: 'POST', body: { date: todayIso(), slot: 'snack', title: rec.identity.name || 'Product', source: 'product', items: [{ grams: Number(g.value), product: { id: `prod:${rec.identity.barcode || rec.identity.name || Date.now()}`, name: { en: rec.identity.name || 'Product', he: rec.identity.name || 'מוצר' }, brand: rec.identity.brand || '', per100, nova: nova.group, status: rec.extraction === 'ai' && rec.source.type !== 'url' ? 'ai-extracted' : 'label-declared', emoji: '🏷️' } }] } });
      toast(t('logged'));
    } }, icon('plus', 15), ' ', t('addToDiary')));
}

// ── Comparison ─────────────────────────────────────────────────────────
function comparison(ok) {
  if (ok.length < 2) return null;
  const goals = state.profile?.healthGoals || [];
  const c = compareMany(ok.map((r) => ({ rec: r.resp.record, eval: r.eval })), goals);
  const L = lang();
  const keys = [['kcal', 'kcal'], ['protein', 'g'], ['fiber', 'g'], ['sugars', 'g'], ['addedSugar', 'g'], ['satFat', 'g'], ['sodium', 'mg']];
  return h('section', { class: 'card compare-card' },
    h('h2', {}, t('productComparison')),
    h('div', { class: 'table-scroll' }, h('table', { class: 'ntable cmp' },
      h('thead', {}, h('tr', {}, h('th', {}, ''), c.rows.map((r) => h('th', {}, r.name)))),
      h('tbody', {},
        h('tr', {}, h('th', {}, t('nutritionScore')), c.rows.map((r) => h('td', {}, r.score ?? '—'))),
        h('tr', {}, h('th', {}, t('forYourGoals')), c.rows.map((r) => h('td', {}, r.goal ?? '—'))),
        h('tr', {}, h('th', {}, 'NOVA'), c.rows.map((r) => h('td', {}, r.nova ? `${r.nova} (${t(`conf_${r.conf}`)})` : '?'))),
        keys.map(([k, u]) => h('tr', {}, h('th', {}, `${t(k)} (${u}/100)`), c.rows.map((r) => h('td', {}, fmt(r.v[k], 1)))))))),
    c.best ? h('div', { class: `verdict ${c.close ? '' : 'v-a'}` },
      h('h3', {}, c.close ? t('similarProducts') : t('recommended', { name: c.best.name })),
      goals.length ? h('p', { class: 'hint' }, t('basedOnGoals'), ': ', goals.map((g) => t(`hg_${g}`)).join(', ')) : null,
      h('ul', { class: 'reasons' }, c.reasons.map((x) => h('li', { class: x.good ? 'a' : 'b' }, x.good ? '✓ ' : '✗ ', x[L] || x.en))),
      h('p', { class: 'hint' }, t('compareScience'), ' ', refChip('reynolds2019'), ' ', refChip('he2013'), ' ', refChip('who2015sugars'), ' ', refChip('monteiro2019'))) : h('p', { class: 'muted' }, t('cannotCompare')));
}
