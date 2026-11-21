// Shared view components: reference chips, targets summary, safety flags, nutrient tables.
import { h, icon, sheet, fmt, pill } from '../ui.js';
import { t, lang } from '../i18n.js';
import { REF_MAP, refLink } from '/shared/evidence.js';
import { STATUS_LABEL, NUTRIENT_META, FOOD_MAP } from '/shared/foods.js';

export function refSheet(id) {
  const r = REF_MAP[id];
  if (!r) return;
  sheet(t('evidence'), refDetail(r));
}

export function refDetail(r) {
  return h('article', { class: 'ref' },
    h('h4', {}, r.title),
    h('p', { class: 'muted' }, `${r.authors} · `, h('em', {}, r.journal), ` · ${r.year}`),
    h('div', { class: 'ref-tags' },
      pill(t(`inf_${r.inference}`), `inf-${r.inference}`),
      pill(t(`lvl_${r.level}`), `lvl-${r.level}`),
      r.n ? pill(`n = ${fmt(r.n)}`) : null),
    h('dl', { class: 'ref-dl' },
      h('dt', {}, t('studyDesign')), h('dd', {}, r.design),
      h('dt', {}, t('mainFindings')), h('dd', {}, r.findings),
      h('dt', {}, t('strengths')), h('dd', {}, r.strengths),
      h('dt', {}, t('limitations')), h('dd', {}, r.limitations),
      h('dt', {}, t('causalNote')), h('dd', {}, t(`infExplain_${r.inference}`))),
    h('a', { class: 'btn ghost small', href: refLink(r), target: '_blank', rel: 'noopener noreferrer' }, r.doi ? `DOI: ${r.doi}` : t('openSource'), ' ↗'));
}

export function refChip(id) {
  const r = REF_MAP[id];
  if (!r) return null;
  const org = { 'U.S.': 'DGA', World: 'WHO', Institute: 'IOM', GBD: 'GBD', 'Bouvard': 'IARC' };
  const first = r.authors.split(/[ ,]/)[0];
  const short = `${org[first] || first} ${r.year}`;
  return h('button', { class: 'ref-chip', type: 'button', onclick: () => refSheet(id), title: r.title }, icon('book', 13), ' ', short);
}

export function flagsList(flags = []) {
  if (!flags.length) return null;
  return h('div', { class: 'flags' }, flags.map((f) => h('div', { class: `flag flag-${f.level}`, role: f.level === 'stop' ? 'alert' : null },
    icon(f.level === 'info' ? 'info' : 'warn', 18), h('p', {}, f[lang()] || f.en))));
}

export function targetsCard(tg) {
  const row = (label, value, unit, basis) => h('div', { class: 'trow' },
    h('span', {}, label), h('strong', {}, value, h('small', {}, ` ${unit}`)), basis ? refChip(basis.ref) : h('span'));
  return h('div', { class: 'card targets' },
    h('h3', {}, t('yourTargets')),
    row(t('bmr'), fmt(tg.bmr), 'kcal', tg.basis.bmr),
    row(t('tdee'), fmt(tg.tdee), 'kcal', tg.basis.tdee),
    row(t('calorieTarget'), fmt(tg.kcal), 'kcal', null),
    row(t('protein'), `≥ ${fmt(tg.protein)}`, `g (${tg.proteinPerKg} g/kg)`, tg.basis.protein),
    row(t('carbs'), `~${fmt(tg.carbs)}`, 'g', null),
    row(t('fat'), `~${fmt(tg.fat)}`, 'g', tg.basis.fat),
    row(t('fiber'), `≥ ${fmt(tg.fiber)}`, 'g', tg.basis.fiber),
    row(t('satFat'), `< ${fmt(tg.satFatMax)}`, 'g', tg.basis.satFat),
    row(t('sodium'), `< ${fmt(tg.sodiumMax)}`, 'mg', tg.basis.sodium),
    row(t('addedSugar'), `< ${fmt(tg.addedSugarMax)}`, 'g', tg.basis.sugar),
    h('details', {}, h('summary', {}, t('micronutrientTargets')),
      h('div', { class: 'micro-grid' }, Object.entries(tg.micros).map(([k, v]) => h('div', {}, h('span', {}, t(k)), h('strong', {}, `${fmt(v, 1)} ${NUTRIENT_META[k].unit}`)))),
      h('p', { class: 'hint' }, t('microBasis'), ' ', refChip('iom2005'))),
    tg.bmi && h('p', { class: 'hint' }, `BMI ${tg.bmi}. `, t('estimateNote')));
}

/** Nutrient table for a set of totals; `micros` adds vitamins/minerals. */
export function nutrientTable(n, { micros = true, targets } = {}) {
  const keys = ['kcal', 'protein', 'carbs', 'fat', 'satFat', 'fiber', 'sugars', 'addedSugar', 'sodium'];
  const mk = ['potassium', 'calcium', 'iron', 'magnesium', 'vitC', 'folate', 'vitB12', 'vitD'];
  const row = (k) => h('tr', {}, h('th', {}, t(k)), h('td', {}, `${fmt(n[k], NUTRIENT_META[k].dp)} ${NUTRIENT_META[k].unit}`),
    targets?.micros?.[k] ? h('td', { class: 'muted' }, `${Math.round((n[k] / targets.micros[k]) * 100)}% ${t('ofRef')}`) : h('td'));
  return h('table', { class: 'ntable' }, h('tbody', {}, keys.map(row), micros && mk.map(row),
    n.polyCoverageG > 0 && h('tr', {}, h('th', {}, t('polyphenols'), ' ', h('sup', {}, '≈')), h('td', {}, `${fmt(n.polyphenols)} mg`), h('td', { class: 'muted' }, t('polyCoverage', { pct: Math.round((n.polyCoverageG / Math.max(n.grams, 1)) * 100) })))));
}

export function sourceNote(prov) {
  const entries = Object.entries(prov || {});
  if (!entries.length) return null;
  return h('div', { class: 'source-note' }, icon('flask', 14), h('div', {},
    entries.map(([k]) => h('div', {}, (STATUS_LABEL[k] || STATUS_LABEL['user-entered'])[lang()]))));
}

export function foodName(item) {
  if (item.product) return item.product.name?.[lang()] || item.product.name?.en;
  return FOOD_MAP[item.foodId]?.name[lang()] || item.foodId;
}
export function foodEmoji(item) { return item.product ? (item.product.emoji || '📦') : FOOD_MAP[item.foodId]?.emoji || '🍽️'; }

/** Meal "photo": a gradient plate composed from the ingredients' emoji (no stock photography bundled). */
export function mealArt(meal, size = 'md') {
  const emojis = [...new Set(meal.items.map(foodEmoji))].slice(0, 5);
  return h('div', { class: `meal-art art-${size}`, style: { '--hue': meal.hue ?? 140 }, 'aria-hidden': 'true' },
    h('span', { class: 'art-main' }, meal.emoji || emojis[0]),
    h('div', { class: 'art-ring' }, emojis.map((e, i) => h('span', { style: { '--i': i } }, e))));
}
