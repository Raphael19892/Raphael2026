import { h, fill, add, icon, fmt, sheet, toast, todayIso, novaBadge, pill, loading, segmented, photoButton } from '../ui.js';
import { t, lang } from '../i18n.js';
import { api, state } from '../api.js';
import { FOOD_MAP, searchFoods, STATUS_LABEL, NUTRIENT_META } from '/shared/foods.js';
import { analyzeIngredients, nutrientDensity, compareProducts, highIn } from '/shared/nova.js';
import { assessNova } from '/shared/novaAssess.js';
import { conditionFoodRules } from '/shared/engine.js';
import { isFoodOk } from '/shared/planner.js';
import { refChip } from './components.js';

let tab = 'search';
const compare = { a: null, b: null };
let stream = null;

export async function render(view, opts = {}) {
  const embedded = Boolean(opts.embedded);
  const body = h('div');
  const draw = () => {
    stopCamera();
    fill(view,
      !embedded && h('h1', {}, t('nav_scan')),
      segmented([['search', t('tabSearch')], ['barcode', t('tabBarcode')], ['label', t('tabLabel')], ['compare', `${t('tabCompare')}${compare.a || compare.b ? ` (${[compare.a, compare.b].filter(Boolean).length})` : ''}`]], tab, (v) => { tab = v; draw(); }),
      body);
    fill(body);
    ({ search: searchTab, barcode: barcodeTab, label: labelTab, compare: compareTab })[tab](body, draw);
  };
  draw();
  window.addEventListener('hashchange', stopCamera, { once: true });
}

// Convert a local food to the common "product" shape used in detail/compare views.
function fromLocal(f) {
  return { ...f, id: f.id, local: true, density: nutrientDensity(f.per100), highIn: highIn(f.per100) };
}

// ── Search ──────────────────────────────────────────────────────────────
function searchTab(body) {
  const results = h('div', { class: 'results' });
  const ext = h('div', { class: 'results' });
  let timer;
  const input = h('input', { type: 'search', placeholder: t('searchPh'), 'aria-label': t('searchPh'), oninput: () => { clearTimeout(timer); timer = setTimeout(run, 300); } });
  const run = async () => {
    const q = input.value.trim();
    const local = searchFoods(q).slice(0, 25);
    fill(results, h('h4', {}, t('localDb')), ...local.map((f) => resultRow(fromLocal(f))));
    fill(ext);
    if (q.length >= 3) {
      ext.append(loading(t('searchingExternal')));
      try {
        const r = await api(`/api/foods/search?q=${encodeURIComponent(q)}`);
        fill(ext, h('h4', {}, t('externalDb')), ...(r.external.length ? r.external.map(resultRow) : [h('p', { class: 'muted small' }, r.externalError ? t('externalUnavailable') : t('noResults'))]));
      } catch { fill(ext, h('p', { class: 'muted small' }, t('externalUnavailable'))); }
    }
  };
  add(body, h('div', { class: 'search-box' }, icon('search', 18), input), results, ext);
  run();
}

function resultRow(p) {
  const kcal = p.per100?.kcal;
  return h('button', { class: 'result', onclick: () => productSheet(p) },
    p.image ? h('img', { src: p.image, alt: '', loading: 'lazy', class: 'thumb' }) : h('span', { class: 'ing-emoji' }, p.emoji || '📦'),
    h('div', {}, h('strong', {}, p.name?.[lang()] || p.name?.en), h('small', { class: 'muted' }, [p.brand, kcal != null ? `${fmt(kcal)} kcal/100 g` : null, p.fdcId ? 'USDA FDC' : null].filter(Boolean).join(' · '))),
    novaBadge(p.nova, p.local ? 'typical' : p.novaSource === 'openfoodfacts' ? 'openfoodfacts' : 'ingredients'));
}

// ── Product / food detail sheet ─────────────────────────────────────────
export function productSheet(p) {
  const profile = state.profile || {};
  const per = p.per100 || {};
  const analysis = p.ingredientsText ? analyzeIngredients(p.ingredientsText) : null; // added-sugar detection
  const assessed = p.ingredientsText ? assessNova(p.ingredientsText) : null;
  const density = p.density || nutrientDensity(per);
  const hi = p.highIn || highIn(per);
  const allergyHits = (p.allergens || []).filter((a) => (profile.allergies || []).some((x) => a.replace('*', '').includes(x.replace('tree_nuts', 'nuts')) || a.replace('*', '') === x));
  const notOk = p.local && !isFoodOk(p.id, profile);
  const caution = p.local ? conditionFoodRules(profile.conditions || []).caution[p.id] : null;
  const gramsIn = h('input', { type: 'number', value: p.unit?.[1] || p.servingG || 100, min: 1, max: 2000 });
  const slotSel = h('select', {}, ['breakfast', 'lunch', 'dinner', 'snack'].map((s) => h('option', { value: s }, t(`slot_${s}`))));
  const row = (k) => per[k] == null ? null : h('tr', {}, h('th', {}, t(k)), h('td', {}, `${fmt(per[k], NUTRIENT_META[k].dp)} ${NUTRIENT_META[k].unit}`));

  const content = h('div', { class: 'product' },
    h('div', { class: 'product-head' },
      p.image ? h('img', { src: p.image, alt: '', class: 'product-img' }) : h('span', { class: 'product-emoji' }, p.emoji || '📦'),
      h('div', {}, h('h4', {}, p.name?.[lang()] || p.name?.en), p.brand && h('p', { class: 'muted' }, p.brand),
        h('div', { class: 'meal-badges' }, novaBadge(p.nova, p.local ? 'typical' : p.novaSource === 'openfoodfacts' ? 'openfoodfacts' : 'ingredients'), ...hi.map((x) => pill(`${t('highIn')} ${t(`hi_${x}`)}`, 'bad'))))),
    (allergyHits.length || notOk) && h('div', { class: 'flag flag-stop' }, icon('warn', 18), h('p', {}, t('allergyWarning'), allergyHits.length ? `: ${allergyHits.join(', ')}` : '')),
    caution && h('div', { class: 'flag flag-warn' }, icon('warn', 18), h('p', {}, `${t('cautionFor')}: ${caution}`)),
    h('p', { class: 'hint' }, p.local ? t('novaTypicalTip') : p.novaSource === 'openfoodfacts' ? t('novaOffTip') : t(`nova${p.nova || 'x'}`)),
    h('h5', {}, t('per100g')),
    h('table', { class: 'ntable' }, h('tbody', {}, ['kcal', 'protein', 'carbs', 'sugars', 'addedSugar', 'fat', 'satFat', 'fiber', 'sodium', 'potassium', 'calcium', 'iron', 'magnesium', 'vitC', 'folate', 'vitB12', 'vitD'].map(row),
      p.poly != null && h('tr', {}, h('th', {}, t('polyphenols'), ' ≈'), h('td', {}, `${fmt(p.poly)} mg `, refChip('perezjimenez2010'))))),
    p.unit && h('p', { class: 'muted small' }, `1 ${p.unit[0]} ≈ ${p.unit[1]} g → ${fmt(per.kcal * p.unit[1] / 100)} kcal, ${fmt(per.fiber * p.unit[1] / 100, 1)} g ${t('fiberShort')}`),
    density && h('div', { class: 'density' }, h('strong', {}, t('nutrientDensity'), `: ${density.score}`),
      h('small', { class: 'muted' }, ` (+${density.positive} / −${density.negative}) `), refChip('fulgoni2009'), h('p', { class: 'hint' }, t('densityNote'))),
    assessed ? ingredientPanel(assessed, analysis) : null,
    p.note && h('p', { class: 'hint' }, icon('info', 13), ' ', p.note),
    h('div', { class: 'source-note' }, icon('flask', 14), h('div', {}, (STATUS_LABEL[p.status] || STATUS_LABEL['user-entered'])[lang()], p.usda ? h('div', { class: 'muted small' }, `USDA: “${p.usda}”`) : null,
      p.link ? h('a', { href: p.link, target: '_blank', rel: 'noopener noreferrer' }, t('viewSource'), ' ↗') : null)),
    h('div', { class: 'log-row' }, h('label', {}, t('amount'), gramsIn, ' g'), slotSel,
      h('button', { class: 'btn primary small', onclick: async () => {
        const g = Number(gramsIn.value);
        const item = p.local ? { foodId: p.id, grams: g } : { grams: g, product: { id: p.id, name: p.name, brand: p.brand, per100: per, nova: p.nova, status: p.status, emoji: p.emoji } };
        await api('/api/logs', { method: 'POST', body: { date: todayIso(), slot: slotSel.value, title: p.name?.en, source: p.local ? 'manual' : 'scan', items: [item] } });
        toast(t('logged'));
      } }, icon('plus', 15), ' ', t('logIt'))),
    h('div', { class: 'row-actions' },
      h('button', { class: 'btn small', onclick: () => { if (!compare.a) compare.a = p; else compare.b = p; toast(t('addedCompare')); } }, icon('swap', 15), ' ', t('addCompare')),
      !p.local && h('button', { class: 'btn small', onclick: async () => { await api('/api/saved-products', { method: 'POST', body: { product: { ...p, per100: per } } }); toast(t('saved')); } }, icon('heart', 15), ' ', t('saveProduct'))));
  sheet(p.name?.[lang()] || p.name?.en || t('product'), content);
}

function ingredientPanel(a, sugars) {
  const L = lang();
  return h('div', { class: 'ing-analysis' },
    h('h5', {}, t('novaAssessment'), ' ', refChip('monteiro2019')),
    a.insufficient ? h('p', { class: 'nova-insufficient' }, a.message.he) : h('p', {},
      novaBadge(a.group), ' ', h('strong', {}, t(`novaName${a.group}`)), ` · ${t('confidence')}: ${t(`conf_${a.confidence}`)}${a.borderline ? ` · ${t('borderline')}` : ''}`),
    h('p', { class: 'small' }, a.explanation[L] || a.explanation.en),
    a.supporting?.length ? h('ul', { class: 'marker-list' }, a.supporting.slice(0, 10).map((i) => h('li', {}, `“${i.text}” — ${(L === 'he' ? i.purposeHe : i.purpose) || ''}`))) : null,
    a.missing?.length ? h('details', {}, h('summary', {}, t('missingInfo')), h('ul', {}, a.missing.map((m) => h('li', { class: 'small' }, m[L] || m.en)))) : null,
    sugars && h('p', {}, h('strong', {}, t('addedSugars')), ': ', sugars.addedSugars.length ? sugars.addedSugars.join(', ') : t('noneDetected')),
    h('details', {}, h('summary', {}, `${t('ingredients')} (${a.ingredients.length})`), h('p', { class: 'small' }, a.ingredients.map((i) => i.text).join(' · '))),
    h('p', { class: 'hint' }, t('novaNotHealth')));
}

// ── Barcode ─────────────────────────────────────────────────────────────
function stopCamera() {
  if (stream) { stream.getTracks().forEach((tr) => tr.stop()); stream = null; }
}

function barcodeTab(body) {
  if (state.status.barcode === false) {
    add(body, h('div', { class: 'card scan-card' }, h('div', { class: 'scan-illu' }, icon('scan', 46)), h('p', {}, t('barcodeUnavailable'))));
    return;
  }
  const status = h('p', { class: 'muted small' });
  const video = h('video', { playsinline: true, muted: true, class: 'cam', hidden: true });
  const code = h('input', { type: 'text', inputmode: 'numeric', pattern: '[0-9]*', placeholder: t('barcodePh'), 'aria-label': t('barcodePh') });
  const lookup = async (c) => {
    fill(status, loading(t('lookingUp')));
    try {
      const { product } = await api(`/api/products/${encodeURIComponent(c)}`);
      status.textContent = '';
      productSheet(product);
    } catch (e) { status.textContent = e.message; }
  };
  const hasDetector = 'BarcodeDetector' in window;
  const startCam = async () => {
    if (!hasDetector) { status.textContent = t('noBarcodeDetector'); return; }
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      video.srcObject = stream; video.hidden = false; await video.play();
      const det = new window.BarcodeDetector({ formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e'] });
      status.textContent = t('pointCamera');
      const tick = async () => {
        if (!stream) return;
        try {
          const codes = await det.detect(video);
          if (codes.length) { const c = codes[0].rawValue; stopCamera(); video.hidden = true; code.value = c; lookup(c); return; }
        } catch { /* frame not ready */ }
        requestAnimationFrame(tick);
      };
      tick();
    } catch { status.textContent = t('cameraDenied'); }
  };
  add(body, 
    h('div', { class: 'card scan-card' },
      h('div', { class: 'scan-illu' }, icon('scan', 46)),
      h('p', {}, t('barcodeIntro')),
      h('button', { class: 'btn primary block', onclick: startCam }, icon('camera', 17), ' ', t('startCamera')),
      video,
      h('form', { class: 'inline-form', onsubmit: (e) => { e.preventDefault(); if (/^\d{6,14}$/.test(code.value.trim())) lookup(code.value.trim()); else status.textContent = t('invalidBarcode'); } },
        code, h('button', { class: 'btn', type: 'submit' }, t('lookup'))),
      status,
      h('p', { class: 'hint' }, t('offNote'))));
}

// ── Label upload / manual entry ─────────────────────────────────────────
function labelTab(body) {
  const status = h('div');
  const readPhoto = async (img) => {
    fill(status, loading(t('readingLabel')));
    try {
      const { product } = await api('/api/scan/label', { method: 'POST', body: { imageBase64: img.b64, mediaType: img.type } });
      fill(status, h('p', { class: 'hint' }, product.notes || ''));
      productSheet(product);
    } catch (e) { fill(status, h('p', { class: 'form-error' }, e.message)); }
  };

  // Manual entry
  const m = { name: '', ingredients: '', per100: {} };
  const fields = ['kcal', 'protein', 'carbs', 'sugars', 'addedSugar', 'fat', 'satFat', 'fiber', 'sodium'];
  const manual = h('form', { class: 'card', onsubmit: (e) => {
    e.preventDefault();
    const per100 = {};
    for (const k of fields) per100[k] = m.per100[k] === '' || m.per100[k] == null ? null : Number(m.per100[k]);
    const analysis = analyzeIngredients(m.ingredients);
    if (per100.addedSugar == null && m.ingredients && !analysis.addedSugars.length) per100.addedSugar = 0;
    productSheet({ id: `manual:${Date.now()}`, name: { en: m.name || t('myProduct'), he: m.name || t('myProduct') }, per100, ingredientsText: m.ingredients, nova: assessNova(m.ingredients).group, novaSource: 'ingredients', status: 'user-entered', emoji: '🏷️' });
  } },
  h('h3', {}, t('manualEntry')),
  h('label', { class: 'field' }, h('span', {}, t('productName')), h('input', { type: 'text', oninput: (e) => { m.name = e.target.value; } })),
  h('label', { class: 'field' }, h('span', {}, t('ingredientsList')), h('textarea', { rows: 4, placeholder: t('ingredientsPh'), oninput: (e) => { m.ingredients = e.target.value; } })),
  h('p', { class: 'muted small' }, t('per100g')),
  h('div', { class: 'grid3' }, fields.map((k) => h('label', { class: 'field' }, h('span', {}, `${t(k)} (${NUTRIENT_META[k].unit})`), h('input', { type: 'number', step: 'any', min: 0, oninput: (e) => { m.per100[k] = e.target.value; } })))),
  h('button', { class: 'btn primary block', type: 'submit' }, t('analyze')));

  add(body, 
    h('div', { class: 'card scan-card' },
      h('div', { class: 'scan-illu' }, icon('upload', 42)),
      h('p', {}, t('labelIntro')),
      photoButton(t('uploadLabel'), readPhoto, { enabled: Boolean(state.status.labelAi ?? state.status.ai), cls: 'btn primary block' }),
      !(state.status.labelAi ?? state.status.ai) && h('p', { class: 'hint' }, t('labelNeedsAi')),
      status),
    manual);
}

// ── Compare ─────────────────────────────────────────────────────────────
function compareTab(body, redraw) {
  const slot = (key) => {
    const p = compare[key];
    return h('div', { class: `cmp-slot ${p ? 'filled' : ''}` },
      h('small', { class: 'muted' }, key === 'a' ? 'A' : 'B'),
      p ? h('frag', {}, h('strong', {}, p.name?.[lang()] || p.name?.en), novaBadge(p.nova, p.local ? 'typical' : p.novaSource === 'openfoodfacts' ? 'openfoodfacts' : 'ingredients'), h('button', { class: 'icon-btn sm', 'aria-label': t('remove'), onclick: () => { compare[key] = null; redraw(); } }, icon('close', 14)))
        : h('p', { class: 'muted small' }, t('compareEmpty')));
  };
  add(body, h('div', { class: 'cmp-slots' }, slot('a'), slot('b')));
  if (!compare.a || !compare.b) {
    add(body, h('p', { class: 'hint' }, t('compareHint')));
    const quick = ['white_rice', 'brown_rice', 'ww_bread', 'oats', 'greek_yogurt', 'soy_yogurt', 'almonds', 'dark_chocolate', 'hummus', 'lentils'];
    add(body, h('div', { class: 'chips' }, quick.map((id) => h('button', { class: 'chip', onclick: () => { const p = fromLocal(FOOD_MAP[id]); if (!compare.a) compare.a = p; else compare.b = p; redraw(); } }, `${FOOD_MAP[id].emoji} ${FOOD_MAP[id].name[lang()]}`))));
    return;
  }
  const a = compare.a; const b = compare.b;
  const res = compareProducts(a, b);
  const keys = ['kcal', 'protein', 'fiber', 'sugars', 'addedSugar', 'satFat', 'sodium', 'potassium'];
  const per100kcal = (p, k) => (p.per100?.kcal ? (p.per100[k] ?? null) * 100 / p.per100.kcal : null);
  const nameA = a.name?.[lang()] || a.name?.en; const nameB = b.name?.[lang()] || b.name?.en;
  add(body, 
    h('div', { class: `card verdict v-${res.verdict}` },
      h('h3', {}, res.verdict === 'tie' ? t('verdictTie') : t('verdictWinner', { name: res.verdict === 'a' ? nameA : nameB })),
      h('ul', { class: 'reasons' }, res.reasons.map((r) => h('li', { class: r.winner }, h('strong', {}, r.winner === 'a' ? 'A ✓ ' : 'B ✓ '), r.text))),
      h('p', { class: 'hint' }, t('compareMethod'), ' ', refChip('fulgoni2009'), ' ', refChip('monteiro2019'))),
    h('div', { class: 'card' },
      h('table', { class: 'ntable cmp' },
        h('thead', {}, h('tr', {}, h('th', {}, t('per100g')), h('th', {}, 'A'), h('th', {}, 'B'))),
        h('tbody', {}, keys.map((k) => h('tr', {}, h('th', {}, t(k)), h('td', {}, fmt(a.per100?.[k], 1)), h('td', {}, fmt(b.per100?.[k], 1)))),
          h('tr', {}, h('th', {}, 'NOVA'), h('td', {}, a.nova ? `${a.nova}${a.local ? '*' : ''}` : '?'), h('td', {}, b.nova ? `${b.nova}${b.local ? '*' : ''}` : '?')),
          h('tr', {}, h('th', {}, t('nutrientDensity')), h('td', {}, res.densityA?.score ?? '—'), h('td', {}, res.densityB?.score ?? '—')))),
      h('table', { class: 'ntable cmp' },
        h('thead', {}, h('tr', {}, h('th', {}, t('per100kcal')), h('th', {}, 'A'), h('th', {}, 'B'))),
        h('tbody', {}, ['protein', 'fiber', 'sodium', 'satFat'].map((k) => h('tr', {}, h('th', {}, t(k)), h('td', {}, fmt(per100kcal(a, k), 1)), h('td', {}, fmt(per100kcal(b, k), 1))))))),
    h('button', { class: 'btn ghost block', onclick: () => { compare.a = null; compare.b = null; redraw(); } }, t('clearCompare')));
}
