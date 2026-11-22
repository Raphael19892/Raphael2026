// Food Diary — every analysed or eaten meal by day and meal slot, with daily totals and editing.
import { h, fill, add, icon, fmt, toast, todayIso, dateLabel, emptyState } from '../ui.js';
import { t, lang } from '../i18n.js';
import { api, state } from '../api.js';
import { sumItems, indicators } from '/shared/nutrition.js';
import { scoreMeal, band } from '/shared/mealScore.js';
import { targetBar } from '../charts.js';
import { foodName, foodEmoji, mealArt } from './components.js';
import { openEntry, prefill, session } from './analyze.js';

let day = null;
const SLOTS = ['breakfast', 'lunch', 'dinner', 'snack'];
const shift = (d, n) => new Date(new Date(`${d}T00:00:00Z`).getTime() + n * 86400000).toISOString().slice(0, 10);

export async function render(view) {
  day = day || todayIso();
  const { logs } = await api(`/api/logs?from=${day}&to=${day}`);
  draw(view, logs);
}

function draw(view, logs) {
  const tg = state.targets;
  const items = logs.flatMap((l) => l.items);
  const n = sumItems(items); const ind = indicators(items);
  const isToday = day === todayIso();
  const reload = async () => { const { logs: l } = await api(`/api/logs?from=${day}&to=${day}`); draw(view, l); };
  const row = (label, v, target, unit, kind = 'min', dp = 0) => h('div', { class: 'mrow' }, h('span', {}), h('span', {}, label),
    h('strong', {}, fmt(v, dp), h('small', {}, ` / ${kind === 'max' ? '<' : ''}${fmt(target)} ${unit}`)), targetBar(v, target, { kind }));

  fill(view,
    h('div', { class: 'section-head' }, h('h1', {}, t('nav_diary'))),
    h('div', { class: 'date-nav' },
      h('button', { class: 'icon-btn', 'aria-label': t('prevDay'), onclick: () => { day = shift(day, -1); render(view); } }, h('span', { class: 'flip' }, '‹')),
      h('div', { class: 'date-label' }, h('strong', {}, isToday ? t('today') : dateLabel(day, { weekday: 'long' })), h('small', { class: 'muted' }, dateLabel(day, { day: 'numeric', month: 'long', year: 'numeric' }))),
      h('button', { class: 'icon-btn', 'aria-label': t('nextDay'), disabled: isToday, onclick: () => { day = shift(day, 1); render(view); } }, h('span', { class: 'flip' }, '›'))),
    h('section', { class: 'card day-sum' },
      h('h3', {}, t('dayTotals')),
      h('div', { class: 'macro-list' },
        row(t('energy'), n.kcal, tg.kcal, 'kcal', 'range'), row(t('protein'), n.protein, tg.protein, 'g'), row(t('fiber'), n.fiber, tg.fiber, 'g'),
        row(t('addedSugar'), n.addedSugar, tg.addedSugarMax, 'g', 'max'), row(t('sodium'), n.sodium, tg.sodiumMax, 'mg', 'max')),
      h('div', { class: 'limits' },
        h('div', { class: 'limit' }, h('small', {}, t('polyphenols')), h('strong', {}, n.polyCoverageG > 0 ? `≈${fmt(n.polyphenols)}` : '—', h('small', {}, ' mg'))),
        h('div', { class: 'limit' }, h('small', {}, t('plantsToday')), h('strong', {}, String(ind.plantCount), h('small', {}, ' 🌱'))),
        h('div', { class: 'limit' }, h('small', {}, t('fruitVeg')), h('strong', {}, fmt(ind.fruitVegG), h('small', {}, ' g'))))),
    SLOTS.map((slot) => {
      const entries = logs.filter((l) => (SLOTS.includes(l.slot) ? l.slot : 'snack') === slot);
      const st = sumItems(entries.flatMap((l) => l.items));
      return h('section', { class: 'diary-slot' },
        h('div', { class: 'card-head' }, h('h3', {}, t(`slot_${slot}`), entries.length ? h('small', { class: 'muted' }, ` · ${fmt(st.kcal)} kcal`) : null),
          h('button', { class: 'btn small ghost', onclick: () => { session.draft.slot = slot; session.entry = null; location.hash = '#analyze'; } }, icon('plus', 14), ' ', t('addMeal'))),
        entries.length ? entries.map((l) => entryCard(l, view, reload)) : h('p', { class: 'muted small empty-slot' }, t('nothingHere')));
    }),
    !logs.length && emptyState('📔', t('diaryEmpty'), t('diaryEmptySub'), h('a', { class: 'btn primary', href: '#analyze' }, icon('sparkle', 16), ' ', t('analyzeBtn'))));
}

function entryCard(l, view, reload) {
  const n = sumItems(l.items);
  const sc = l.meta?.score ?? scoreMeal(l.items).score;
  const b = band(sc);
  return h('article', { class: 'diary-entry' },
    l.meta?.photo ? h('img', { class: 'entry-photo', src: l.meta.photo, alt: '' }) : mealArt({ items: l.items, hue: 140 }, 'xs'),
    h('button', { class: 'entry-main', onclick: () => { openEntry({ ...l }); location.hash = '#analyze'; } },
      h('strong', {}, l.title || l.items.map(foodName).join(', ')),
      h('small', { class: 'muted' }, l.items.slice(0, 5).map((i) => `${foodEmoji(i)} ${foodName(i)} ${i.grams} g`).join(' · ')),
      h('small', {}, `${fmt(n.kcal)} kcal · P ${fmt(n.protein)} g · ${t('fiberShort')} ${fmt(n.fiber, 1)} g · Na ${fmt(n.sodium)} mg`)),
    sc != null ? h('span', { class: `score-pill band-${b}`, title: t('mealScore') }, String(sc)) : h('span'),
    h('div', { class: 'entry-actions' },
      h('select', { 'aria-label': t('mealSlot'), onchange: async (e) => { await api(`/api/logs/${l.id}`, { method: 'PUT', body: { slot: e.target.value } }); toast(t('saved')); reload(); } },
        SLOTS.map((s) => h('option', { value: s, selected: s === l.slot }, t(`slot_${s}`)))),
      h('button', { class: 'icon-btn sm', 'aria-label': t('delete'), onclick: async () => { await api(`/api/logs/${l.id}`, { method: 'DELETE', body: {} }); toast(t('deleted')); reload(); } }, icon('trash', 15))));
}

export { prefill };
