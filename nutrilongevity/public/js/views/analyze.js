// Analyze Food — describe (or photograph) what you ate; get nutrition, a transparent quality score,
// an evidence-based evaluation and concrete improvements. Every analysis is saved to the diary.
import { h, fill, add, icon, fmt, toast, todayIso, novaBadge, pill, loading, segmented, photoButton, acceptPastedImage } from '../ui.js';
import { t, lang } from '../i18n.js';
import { api, state } from '../api.js';
import { FOOD_MAP, searchFoods, STATUS_LABEL } from '/shared/foods.js';
import { sumItems, provenance } from '/shared/nutrition.js';
import { analyzeMeal } from '/shared/mealScore.js';
import { scoreDial, targetBar } from '../charts.js';
import { nutrientTable, sourceNote, foodName, foodEmoji, refChip } from './components.js';

// The meal being analysed survives navigation (e.g. diary → analyze → back).
export const session = { entry: null, draft: { text: '', slot: null }, autorun: false };
let tab = 'describe';

export function openEntry(entry) { session.entry = structuredClone(entry); tab = 'describe'; }
export function prefill(text, run = true) { session.draft.text = text; session.entry = null; session.autorun = run; tab = 'describe'; }

const slotForNow = () => { const hr = new Date().getHours(); return hr < 11 ? 'breakfast' : hr < 16 ? 'lunch' : hr < 21 ? 'dinner' : 'snack'; };
const EXAMPLES = {
  en: ['Yogurt with oats, chia seeds and a kiwi', 'Two slices of whole wheat bread with avocado and eggs', 'Two slices of pizza and a can of Coca-Cola', 'Lentil soup with a whole-wheat pita and a salad'],
  he: ['יוגורט עם שיבולת שועל, צ׳יה וקיווי', 'שתי פרוסות לחם מלא עם אבוקדו וחביתה משתי ביצים', 'שני משולשי פיצה ופחית קוקה קולה', 'מרק עדשים עם פיתה מלאה וסלט'],
};

export async function render(view, ctx) {
  const body = h('div');
  const draw = async () => {
    fill(view,
      h('div', { class: 'section-head' }, h('h1', {}, t('nav_analyze'))),
      segmented([['describe', t('tabDescribe')], ['products', t('tabProducts')]], tab, (v) => { tab = v; draw(); }),
      body);
    if (tab === 'products') { const sc = await import('./scanner.js'); fill(body); await sc.render(body, { ...ctx, embedded: true }); return; }
    describeTab(body);
  };
  await draw();
}

// ── Describe & analyse ─────────────────────────────────────────────────
function describeTab(body) {
  const d = session.draft;
  d.slot = d.slot || slotForNow();
  let photo = null; // { b64, type, thumb }
  const ta = h('textarea', { id: 'meal-text', rows: 3, maxlength: 2000, placeholder: t('analyzePh'), 'aria-label': t('analyzePh'), oninput: (e) => { d.text = e.target.value; } });
  ta.value = d.text || '';
  const thumb = h('div', { class: 'photo-prev', hidden: true });
  const setPhoto = (img) => {
    photo = img;
    fill(thumb, h('img', { src: photo.thumb, alt: '' }), h('button', { class: 'icon-btn sm', 'aria-label': t('remove'), onclick: () => { photo = null; thumb.hidden = true; } }, icon('close', 14)));
    thumb.hidden = false;
  };
  const slotSel = h('select', { 'aria-label': t('mealSlot'), onchange: (e) => { d.slot = e.target.value; } }, ['breakfast', 'lunch', 'dinner', 'snack'].map((s) => h('option', { value: s, selected: s === d.slot }, t(`slot_${s}`))));
  const go = h('button', { class: 'btn primary big', onclick: () => run() }, icon('sparkle', 18), ' ', t('analyzeBtn'));
  const result = h('div', { class: 'analysis' });

  async function run() {
    const text = ta.value.trim();
    if (!text && !photo) { ta.focus(); toast(t('describeFirst'), 'err'); return; }
    if (photo && !text && !state.status.photoAi) { toast(t('photoNoAi'), 'err'); ta.focus(); return; }
    go.disabled = true; fill(result, loading(t('analyzingMeal')));
    try {
      const parsed = await api('/api/analyze/meal', { method: 'POST', body: { text, lang: lang(), imageBase64: state.status.photoAi ? photo?.b64 : undefined, mediaType: photo?.type } });
      if (!parsed.items.length) {
        fill(result, h('div', { class: 'card' }, h('h3', {}, t('notRecognized')), h('p', {}, t('notRecognizedText')), parsed.unrecognized?.length ? h('p', { class: 'muted' }, `“${parsed.unrecognized.join('”, “')}”`) : null));
        go.disabled = false; return;
      }
      const items = parsed.items.map((x) => ({ ...x }));
      const a = analyzeMeal(items, state.profile);
      const title = parsed.mealName || shortTitle(items, text);
      const saved = await api('/api/logs', { method: 'POST', body: { date: todayIso(), slot: d.slot, title, source: 'analyzer', items: stripItems(items), meta: { text, score: a.score, mode: parsed.mode, photo: photo?.thumb } } });
      session.entry = { ...saved, items, parse: parsed, meta: { ...(saved.meta || {}), text, score: a.score, mode: parsed.mode, photo: photo?.thumb } };
      toast(t('savedToDiary'));
      d.text = ''; ta.value = ''; photo = null; thumb.hidden = true;
      renderResult(result);
    } catch (e) { fill(result, h('p', { class: 'form-error' }, e.message)); }
    go.disabled = false;
  }

  add(body,
    h('div', { class: 'card analyze-card' },
      h('label', { class: 'field', for: 'meal-text' }, h('span', {}, t('whatDidYouEat'))),
      ta,
      h('div', { class: 'chips examples' }, EXAMPLES[lang()].map((ex) => h('button', { class: 'chip', type: 'button', onclick: () => { ta.value = ex; d.text = ex; } }, ex))),
      thumb,
      h('div', { class: 'analyze-row' },
        photoButton(t('addPhoto'), setPhoto, { enabled: Boolean(state.status.photoAi) }),
        slotSel, go),
      h('p', { class: 'hint' }, state.status.ai ? t('analyzeAiNote') : t('analyzeRulesNote')),
      state.status.photoAi && h('p', { class: 'hint' }, t('pasteImageHint'))),
    result);
  if (state.status.photoAi) acceptPastedImage(body, setPhoto);
  if (session.entry) renderResult(result);
  if (session.autorun && d.text) { session.autorun = false; run(); }
}

function shortTitle(items, text) {
  const s = (text || '').trim();
  if (s && s.length <= 60) return s;
  return items.slice(0, 3).map((i) => foodName(i)).join(', ');
}
const stripItems = (items) => items.map((i) => (i.foodId ? { foodId: i.foodId, grams: i.grams } : { grams: i.grams, product: i.product }));

let saveTimer = null;
function persist() {
  const e = session.entry; if (!e?.id) return;
  const a = analyzeMeal(e.items, state.profile);
  e.meta = { ...(e.meta || {}), score: a.score };
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => api(`/api/logs/${e.id}`, { method: 'PUT', body: { items: stripItems(e.items), slot: e.slot, meta: e.meta } }).catch((er) => toast(er.message, 'err')), 500);
}

// ── Result rendering ───────────────────────────────────────────────────
function renderResult(host) {
  const e = session.entry;
  const items = e.items;
  const tg = state.targets;
  const a = analyzeMeal(items, state.profile);
  const n = a.totals;
  const rerender = () => { persist(); renderResult(host); };
  const L = lang();
  const parse = e.parse || {};

  const verdict = a.score == null ? t('verdict_na') : t(`verdict_${a.band}`);
  const qs = [
    ...(parse.questions || []).filter((q) => q.text).map((q) => h('li', {}, q.text)),
    ...items.filter((it) => it.quantity === 'assumed' && sumItems([it]).kcal >= 90).map((it) => {
      const i = items.indexOf(it); const f = it.foodId ? FOOD_MAP[it.foodId] : null; const u = f?.unit;
      const opts = (u && u[1] < 400 ? [1, 2, 3].map((k) => k * u[1]) : [0.5, 1, 1.5, 2].map((k) => it.grams * k)).map((g) => [Math.round(g), `${Math.round(g)} g`]);
      return h('li', {}, t('howMuch', { food: foodName(it), g: it.grams }), ' ',
        h('span', { class: 'qopts' }, opts.map(([g, lbl]) => h('button', { class: `chip sm ${Math.round(g) === it.grams ? 'on' : ''}`, onclick: () => { items[i] = { ...it, grams: Math.round(g), quantity: 'stated' }; rerender(); } }, lbl))));
    }),
  ];

  fill(host,
    // 1. Score & verdict
    h('section', { class: `card score-card band-${a.band}` },
      h('div', { class: 'score-top' },
        scoreDial(a.score),
        h('div', { class: 'score-info' },
          h('small', { class: 'slot' }, t(`slot_${e.slot}`), ' · ', t('savedInDiary'), ' ', h('a', { href: '#diary', class: 'link' }, t('openDiary'))),
          h('h2', {}, e.title),
          h('p', { class: 'verdict' }, h('strong', {}, t('isItHealthy')), ' ', verdict),
          h('div', { class: 'meal-badges' }, pill(parse.mode === 'ai' || e.meta?.mode === 'ai' ? t('parsedAi') : t('parsedRules'), parse.mode === 'ai' || e.meta?.mode === 'ai' ? 'good' : ''), e.meta?.photo ? h('img', { class: 'mini-photo', src: e.meta.photo, alt: '' }) : null))),
      h('p', { class: 'hint' }, t('scoreDisclaimer'))),
    // 2. Questions about amounts
    qs.length ? h('section', { class: 'card q-card' }, h('h3', {}, icon('info', 16), ' ', t('checkAmounts')), h('ul', { class: 'qlist' }, qs)) : null,
    parse.unrecognized?.length ? h('div', { class: 'flag flag-warn' }, icon('warn', 18), h('p', {}, t('partlyRecognized'), ` “${parse.unrecognized.join('”, “')}”. `, t('addManually'))) : null,
    // 3. Ingredients
    h('section', { class: 'card' },
      h('div', { class: 'card-head' }, h('h3', {}, t('ingredients')), h('small', { class: 'muted' }, `${fmt(n.grams)} g`)),
      h('ul', { class: 'ingredients' }, items.map((it, i) => {
        const ni = sumItems([it]); const f = it.foodId ? FOOD_MAP[it.foodId] : it.product;
        const est = !it.foodId || f?.status === 'label-estimate';
        return h('li', {},
          h('span', { class: 'ing-emoji' }, foodEmoji(it)),
          h('div', { class: 'ing-main' },
            h('strong', {}, foodName(it)),
            h('small', { class: 'muted' }, `${fmt(ni.kcal)} kcal · P ${fmt(ni.protein, 1)} · ${t('fiberShort')} ${fmt(ni.fiber, 1)} · Na ${fmt(ni.sodium)}`),
            h('span', { class: 'ing-tags' },
              novaBadge(f?.nova, it.foodId ? 'typical' : (f?.novaBasis || 'ingredients')),
              est ? pill(t('estimated'), 'warn') : pill(t('refData'), 'good'),
              it.quantity === 'assumed' ? pill(t('amountAssumed')) : null,
              it.cooking ? pill(t(`cook_${it.cooking}`)) : null,
              it.note ? h('small', { class: 'muted' }, t(`note_${it.note}`)) : null)),
          h('div', { class: 'grams' },
            h('button', { class: 'icon-btn sm', 'aria-label': t('less'), onclick: () => { items[i] = { ...it, grams: Math.max(1, it.grams - stepG(it.grams)), quantity: 'stated' }; rerender(); } }, icon('minus', 14)),
            h('input', { type: 'number', value: it.grams, min: 1, max: 3000, 'aria-label': `${foodName(it)} g`, onchange: (ev) => { items[i] = { ...it, grams: Math.max(1, Number(ev.target.value) || 1), quantity: 'stated' }; rerender(); } }),
            h('span', { class: 'g' }, 'g'),
            h('button', { class: 'icon-btn sm', 'aria-label': t('more'), onclick: () => { items[i] = { ...it, grams: it.grams + stepG(it.grams), quantity: 'stated' }; rerender(); } }, icon('plus', 14))),
          h('button', { class: 'icon-btn sm', 'aria-label': t('remove'), onclick: () => { items.splice(i, 1); if (!items.length) { toast(t('mealEmpty'), 'err'); items.push(it); return; } rerender(); } }, icon('trash', 15)));
      })),
      h('p', { class: 'hint' }, t('novaTypicalLegend')),
      addIngredient(items, rerender)),
    // 4. Nutrition
    h('section', { class: 'card' },
      h('h3', {}, t('nutrition')),
      h('div', { class: 'nutri-grid' },
        stat(t('energy'), `${fmt(n.kcal)}`, 'kcal'), stat(t('protein'), fmt(n.protein, 1), 'g'), stat(t('carbs'), fmt(n.carbs, 1), 'g'),
        stat(t('fat'), fmt(n.fat, 1), 'g'), stat(t('satFat'), fmt(n.satFat, 1), 'g'), stat(t('fiber'), fmt(n.fiber, 1), 'g'),
        stat(t('addedSugar'), fmt(n.addedSugar, 1), 'g'), stat(t('sodium'), fmt(n.sodium), 'mg'),
        stat(t('polyphenols'), n.polyCoverageG > 0 ? `≈${fmt(n.polyphenols)}` : '—', 'mg'), stat(t('plantsShort'), String(a.ind.plantCount), '🌱')),
      tg && h('div', { class: 'contrib' }, h('small', { class: 'muted' }, t('ofDailyTarget')),
        contrib(t('energy'), n.kcal, tg.kcal), contrib(t('protein'), n.protein, tg.protein), contrib(t('fiber'), n.fiber, tg.fiber), contrib(t('sodium'), n.sodium, tg.sodiumMax, 'max'), contrib(t('addedSugar'), n.addedSugar, tg.addedSugarMax, 'max')),
      h('details', {}, h('summary', {}, t('fullNutrients')), nutrientTable(n, { targets: tg })),
      sourceNote(provenance(items))),
    // 5. Evaluation
    a.score != null ? h('section', { class: 'card eval' },
      h('h3', {}, t('evaluation')),
      evalBlock('good', t('evalGood'), a.evaluation.good, L),
      evalBlock('bad', t('evalBad'), a.evaluation.bad, L),
      evalBlock('missing', t('evalMissing'), a.evaluation.missing, L),
      h('div', { class: 'eval-block improve' }, h('h4', {}, '💡 ', t('evalImprove')),
        a.suggestions.length ? a.suggestions.map((s) => suggestionCard(s, items, rerender, L)) : h('p', { class: 'muted small' }, t('noSuggestions')))) : null,
    // 6. Frameworks
    a.score != null ? h('section', { class: 'card' },
      h('h3', {}, t('frameworkFit')),
      h('div', { class: 'fw-grid' }, Object.entries(a.evaluation.frameworks).map(([k, v]) => h('div', { class: `fw-fit fit-${v.fit}` },
        h('strong', {}, t(`fwfit_${k}`)), h('span', {}, t(`fit_${v.fit}`)), k === 'nova' ? h('small', {}, v.share4 == null ? t('novaUnknownShort') : `${t('typicalNova4')}: ${v.share4}%`) : null, h('div', { class: 'ref-row' }, v.refs.map(refChip)))))) : null,
    // 7. Score breakdown
    a.score != null ? h('section', { class: 'card' },
      h('h3', {}, t('scoreBreakdown'), ` · ${a.score}/100`),
      a.components.map((c) => h('div', { class: 'metric' },
        h('div', { class: 'metric-top' }, h('span', {}, t(`sc_${c.key}`)), h('strong', {}, fmt(c.points, 1), h('small', {}, ` / ${c.max}`))),
        targetBar(c.points, c.max, { kind: 'min', max: c.max }),
        h('small', { class: 'muted' }, c[L] || c.en))),
      h('p', { class: 'hint' }, t('scoreMethod'))) : null);
}

const stepG = (g) => (g >= 100 ? 10 : g >= 30 ? 5 : 1);
const stat = (label, v, unit) => h('div', { class: 'nstat' }, h('strong', {}, v, h('small', {}, ` ${unit}`)), h('span', {}, label));
function contrib(label, v, target, kind = 'min') {
  return h('div', { class: 'mrow' }, h('span', {}), h('span', {}, label), h('strong', {}, `${Math.round((v / target) * 100)}%`), targetBar(v, target, { kind, max: target }));
}
function evalBlock(kind, title, arr, L) {
  if (!arr.length) return null;
  const ic = { good: '✅', bad: '⚠️', missing: '➕' }[kind];
  return h('div', { class: `eval-block ${kind}` }, h('h4', {}, ic, ' ', title),
    h('ul', {}, arr.map((x) => h('li', {}, x[L] || x.en, ' ', x.refs.map(refChip)))));
}

function suggestionCard(s, items, rerender, L) {
  const d = s.delta;
  const cell = (label, v, unit, good) => {
    if (Math.abs(v) < (unit === 'mg' ? 5 : 0.3)) return null;
    const better = good === 'up' ? v > 0 : v < 0;
    return h('span', { class: `delta ${better ? 'up' : 'down'}` }, `${label} ${v > 0 ? '+' : ''}${fmt(v, unit === 'mg' || unit === 'kcal' ? 0 : 1)}${unit === 'kcal' ? '' : ' ' + unit}`);
  };
  return h('div', { class: 'sugg-card' },
    h('div', { class: 'sugg-head' }, h('strong', {}, s[L] || s.en), h('span', { class: 'score-change' }, `${s.before} → `, h('b', {}, s.after))),
    h('div', { class: 'deltas' },
      cell(t('fiberShort'), d.fiber, 'g', 'up'), cell('P', d.protein, 'g', 'up'), cell(t('satShort'), d.satFat, 'g', 'down'),
      cell(t('sugarShort'), d.addedSugar, 'g', 'down'), cell('Na', d.sodium, 'mg', 'down'), d.plants ? h('span', { class: 'delta up' }, `🌱 +${d.plants}`) : null,
      d.polyphenols > 5 ? h('span', { class: 'delta up' }, `≈+${fmt(d.polyphenols)} mg ${t('polyShort')}`) : null,
      h('span', { class: 'delta neutral' }, `${d.kcal > 0 ? '+' : ''}${fmt(d.kcal)} kcal`)),
    h('button', { class: 'btn small', onclick: () => { items.splice(0, items.length, ...s.items.map((x) => ({ ...x, quantity: x.quantity || 'stated' }))); toast(t('applied')); rerender(); } }, icon('check', 14), ' ', t('applyToMeal')));
}

function addIngredient(items, rerender) {
  const list = h('div', { class: 'add-ing-results' });
  const input = h('input', { type: 'search', placeholder: t('addIngredientPh'), 'aria-label': t('addIngredientPh'), oninput: () => {
    const q = input.value.trim();
    fill(list, q.length < 2 ? null : searchFoods(q).slice(0, 6).map((f) => h('button', { class: 'chip', onclick: () => {
      items.push({ foodId: f.id, grams: f.unit && f.unit[1] < 300 ? f.unit[1] : 100, quantity: 'stated' }); input.value = ''; fill(list); rerender();
    } }, `${f.emoji} ${f.name[lang()]}`)));
  } });
  return h('div', { class: 'add-ing' }, h('div', { class: 'search-box' }, icon('plus', 16), input), list);
}


export { STATUS_LABEL };
