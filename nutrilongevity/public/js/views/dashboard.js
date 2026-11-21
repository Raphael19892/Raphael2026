import { h, fill, add, icon, fmt, todayIso, dateLabel, segmented, loading, toast, emptyState } from '../ui.js';
import { t, lang } from '../i18n.js';
import { api, state, loadPlan } from '../api.js';
import { ring, targetBar, lineChart, barChart, stackBar, donut } from '../charts.js';
import { sumItems, indicators } from '/shared/nutrition.js';
import { GUT_TOPICS } from '/shared/evidence.js';
import { NUTRIENT_META } from '/shared/foods.js';
import { nutrientTable, refChip } from './components.js';
import { foodName, foodEmoji } from './components.js';

let tab = null;

export async function render(view) {
  const qs = new URLSearchParams(location.hash.split('?')[1] || '');
  if (qs.get('tab')) tab = qs.get('tab');
  tab = tab || 'today';
  const body = h('div');
  const draw = async () => {
    fill(view, 
      h('h1', {}, t('nav_dashboard')),
      segmented([['today', t('tabToday')], ['week', t('tabWeek')], ['trends', t('tabTrends')], ['gut', t('tabGut')], ['optimize', t('tabOptimize')]], tab, (v) => { tab = v; draw(); }),
      body);
    fill(body, loading());
    const fn = { today: todayTab, week: weekTab, trends: trendsTab, gut: gutTab, optimize: optimizeTab }[tab];
    await fn(body);
  };
  await draw();
}

// ── Today ──────────────────────────────────────────────────────────────
async function todayTab(body) {
  const tg = state.targets; const today = todayIso();
  const { logs } = await api(`/api/logs?from=${today}&to=${today}`);
  const items = logs.flatMap((l) => l.items);
  const n = sumItems(items); const ind = indicators(items);
  fill(body, 
    h('div', { class: 'card' },
      h('div', { class: 'rings' },
        ring(n.kcal, tg.kcal, { sub: `${fmt(n.kcal)} kcal`, label: t('energy') }),
        ring(n.protein, tg.protein, { sub: `${fmt(n.protein)} g P`, label: t('protein') }),
        ring(n.fiber, tg.fiber, { sub: `${fmt(n.fiber)} g`, label: t('fiber') }),
        ring(ind.fruitVegG, tg.daily.fruitVegG, { sub: `${fmt(ind.fruitVegG)} g`, label: t('fruitVeg') })),
      h('div', { class: 'ring-legend' }, [t('energy'), t('protein'), t('fiber'), t('fruitVeg')].map((l) => h('span', {}, l)))),
    items.length ? h('div', { class: 'card' }, h('h3', {}, t('nutrientsToday')), nutrientTable(n, { targets: tg })) : emptyState('🍽️', t('nothingLoggedTitle'), t('nothingLogged')),
    logs.length ? h('div', { class: 'card' }, h('h3', {}, t('loggedToday')),
      h('ul', { class: 'log-list' }, logs.map((l) => h('li', {},
        h('div', {}, h('strong', {}, l.title || t(`slot_${l.slot}`)), h('small', { class: 'muted' }, `${t(`slot_${l.slot}`)} · ${l.items.map((i) => `${foodEmoji(i)} ${foodName(i)} ${i.grams} g`).join(', ')}`)),
        h('span', {}, `${fmt(sumItems(l.items).kcal)} kcal`),
        h('button', { class: 'icon-btn', 'aria-label': t('delete'), onclick: async () => { await api(`/api/logs/${l.id}`, { method: 'DELETE', body: {} }); toast(t('deleted')); todayTab(body); } }, icon('trash', 16)))))) : null);
}

// ── Week ───────────────────────────────────────────────────────────────
function metricRow(label, m, unit, { dp = 0, note, ref } = {}) {
  return h('div', { class: `metric st-${m.status}` },
    h('div', { class: 'metric-top' }, h('span', {}, label, ref ? [' ', refChip(ref)] : null),
      h('strong', {}, fmt(m.value, dp), h('small', {}, ` ${unit} · ${m.kind === 'max' ? '<' : m.kind === 'min' ? '≥' : '≈'} ${fmt(m.target, dp)}`))),
    targetBar(m.value || 0, m.target, { kind: m.kind === 'max' ? 'max' : 'min' }),
    note && h('small', { class: 'muted' }, note));
}

async function weekTab(body) {
  const { analysis: a } = await api(`/api/analysis/week?end=${todayIso()}`);
  if (!a.nDays) { fill(body, emptyState('📊', t('noWeekData'), t('noWeekDataSub'))); return; }
  const m = a.metrics;
  const nova = a.ind.novaKcal;
  fill(body, 
    h('p', { class: 'hint' }, icon('info', 14), ' ', t('weekBasis', { n: a.nDays })),
    h('div', { class: 'card' }, h('h3', {}, t('energyMacros')),
      metricRow(t('energy'), m.kcal, 'kcal'), metricRow(t('protein'), m.protein, 'g', { ref: 'bauer2013' }), metricRow(t('fiber'), m.fiber, 'g', { ref: 'reynolds2019' })),
    h('div', { class: 'card' }, h('h3', {}, t('foodQuality')),
      metricRow(t('plantDiversity'), m.plantCount, t('plantsUnit'), { ref: 'mcdonald2018', note: t('plantNote') }),
      metricRow(t('fruitVeg'), m.fruitVegG, 'g/d', { ref: 'aune2017fv' }),
      metricRow(t('legumes'), m.legumeServings, t('servingsWeek'), { dp: 1, ref: 'fadnes2022' }),
      metricRow(t('wholeGrains'), m.wholeGrainServings, t('servingsDay'), { dp: 1, ref: 'aune2016wg' }),
      metricRow(t('nutsSeeds'), m.nutsSeedsG, 'g/d', { ref: 'aune2016nuts' }),
      metricRow(t('oliveOil'), m.oliveOilG, 'g/d', { ref: 'guaschferre2022' }),
      h('div', { class: 'metric' }, h('div', { class: 'metric-top' }, h('span', {}, t('polyphenolFoods')), h('strong', {}, fmt(a.ind.polyphenolServings), h('small', {}, ` ${t('servingsWeek')}`))))),
    h('div', { class: 'card' }, h('h3', {}, t('processing'), ' ', refChip('monteiro2019')),
      stackBar([1, 2, 3, 4].map((k) => ({ value: nova[k], cls: `nova-bg-${k}`, label: `NOVA ${k}` }))),
      h('div', { class: 'legend' }, [1, 2, 3, 4].map((k) => h('span', {}, h('i', { class: `nova-bg-${k}` }), `NOVA ${k}: ${fmt(a.ind.kcal ? (nova[k] / a.ind.kcal) * 100 : 0)}%`))),
      metricRow(t('upfEnergy'), m.upfPct, '%', { ref: 'lane2024' })),
    h('div', { class: 'card' }, h('h3', {}, t('limitsTitle')),
      metricRow(t('satFat'), m.satFat, 'g/d', { ref: 'dga2020' }), metricRow(t('sodium'), m.sodium, 'mg/d', { ref: 'he2013' }), metricRow(t('addedSugar'), m.addedSugar, 'g/d', { ref: 'who2015sugars' })),
    h('div', { class: 'card' }, h('h3', {}, t('micronutrients')),
      Object.keys(state.targets.micros).map((k) => metricRow(t(k), m[k], NUTRIENT_META[k].unit, { dp: NUTRIENT_META[k].dp }))),
    h('p', { class: 'disclaimer' }, icon('info', 14), ' ', t('noCompositeScore')));
}

// ── Trends ─────────────────────────────────────────────────────────────
async function trendsTab(body) {
  const tg = state.targets;
  const { series, weeks } = await api(`/api/analysis/trends?days=28&end=${todayIso()}`);
  const pts = (k) => series.map((d) => ({ x: dateLabel(d.date, { day: 'numeric', month: 'numeric' }), y: d.logged ? d[k] : null }));
  if (!series.some((d) => d.logged)) { fill(body, emptyState('📈', t('noTrendData'), t('noWeekDataSub'))); return; }
  const card = (title, chart, legend) => h('div', { class: 'card' }, h('h3', {}, title), chart, legend && h('p', { class: 'muted small' }, legend));
  fill(body, 
    card(t('energy'), lineChart(pts('kcal'), { target: tg.kcal, color: 'var(--c1)' }), t('targetLine', { v: fmt(tg.kcal), u: 'kcal' })),
    card(t('fiber'), lineChart(pts('fiber'), { target: tg.fiber, color: 'var(--c2)' }), t('targetLine', { v: fmt(tg.fiber), u: 'g' })),
    card(t('protein'), lineChart(pts('protein'), { target: tg.protein, color: 'var(--c3)' }), t('targetLine', { v: fmt(tg.protein), u: 'g' })),
    card(t('sodium'), lineChart(pts('sodium'), { target: tg.sodiumMax, color: 'var(--c4)' }), t('limitLine', { v: fmt(tg.sodiumMax), u: 'mg' })),
    card(t('plantsPerWeek'), barChart(weeks.map((w) => ({ label: dateLabel(w.end, { day: 'numeric', month: 'numeric' }), value: w.plants, cls: w.plants >= 30 ? 'good' : '' })), { target: 30 })),
    card(t('upfEnergy'), lineChart(pts('upfPct'), { target: 15, color: 'var(--c5)', yMax: 100 })));
}

// ── Gut microbiome module ──────────────────────────────────────────────
async function gutTab(body) {
  const { analysis: a } = await api(`/api/analysis/week?end=${todayIso()}`);
  const ind = a.ind; const n = Math.max(a.nDays, 1);
  const stat = (label, value, sub) => h('div', { class: 'gstat' }, h('strong', {}, value), h('span', {}, label), sub && h('small', { class: 'muted' }, sub));
  fill(body, 
    h('div', { class: 'card gut-hero' },
      h('h3', {}, '🦠 ', t('gutTitle')),
      h('p', { class: 'muted' }, t('gutIntro')),
      a.nDays ? h('div', { class: 'gstats' },
        stat(t('fiberPerDay'), `${fmt(a.avg.fiber)} g`, `${t('target')} ≥ ${state.targets.fiber} g`),
        stat(t('fiberSources'), ind.fiberSources.length, t('differentPlants')),
        stat(t('plantDiversity'), ind.plantCount, '/ 30'),
        stat(t('prebioticFoods'), ind.prebioticServings, t('servingsWeek')),
        stat(t('resistantStarch'), ind.rsServings, t('servingsWeek')),
        stat(t('fermentedFoods'), ind.fermentedServings, t('servingsWeek')),
        stat(t('legumes'), fmt(ind.legumeServings, 1), t('servingsWeek')),
        stat(t('wholeGrains'), fmt(ind.wholeGrainServings / n, 1), t('servingsDay')),
        stat(t('fruitVeg'), `${fmt(ind.fruitVegG / n)} g`, t('perDay'))) : h('p', { class: 'hint' }, t('noWeekDataSub')),
      a.nDays ? h('details', {}, h('summary', {}, t('plantsEaten', { n: ind.plantCount })), h('p', { class: 'small' }, ind.plants.join(' · '))) : null),
    h('div', { class: 'legend-levels' }, h('span', { class: 'pill lvl-established' }, t('lvl_established')), ' ', t('lvlEstablishedExplain'), h('br'), h('span', { class: 'pill lvl-emerging' }, t('lvl_emerging')), ' ', t('lvlEmergingExplain')),
    GUT_TOPICS.map((g) => h('article', { class: 'card topic' },
      h('div', { class: 'card-head' }, h('h3', {}, g.title[lang()]), h('span', { class: `pill lvl-${g.level}` }, t(`lvl_${g.level}`))),
      h('p', {}, g.mechanism[lang()]),
      h('div', { class: 'ref-row' }, g.refs.map(refChip)))),
    (state.profile.conditions || []).includes('ibs') && h('div', { class: 'flag flag-info' }, icon('info', 18), h('p', {}, t('ibsGutNote'))));
}

// ── Weekly optimisation ────────────────────────────────────────────────
async function optimizeTab(body) {
  const { reports } = await api('/api/reports');
  const out = h('div');
  const run = async (btn) => {
    btn.disabled = true; fill(out, loading(t('analyzing')));
    try {
      const r = await api('/api/analysis/optimize', { method: 'POST', body: { end: todayIso() } });
      await loadPlan();
      fill(out, reportView(r.analysis, true));
      toast(t('optimizedReady'));
    } catch (e) { fill(out, h('p', { class: 'form-error' }, e.message)); }
    btn.disabled = false;
  };
  fill(body, 
    h('div', { class: 'card opt-hero' },
      h('h3', {}, icon('sparkle', 18), ' ', t('weeklyOptimization')),
      h('p', { class: 'muted' }, t('optIntro')),
      h('button', { class: 'btn primary block', onclick: (e) => run(e.currentTarget) }, t('runOptimization'))),
    out,
    reports.length ? h('div', { class: 'card' }, h('h3', {}, t('pastReports')),
      h('ul', { class: 'report-list' }, reports.map((r) => h('li', {},
        h('strong', {}, dateLabel(r.weekEnd, { day: 'numeric', month: 'short', year: 'numeric' })),
        h('small', { class: 'muted' }, `${r.nDays} ${t('daysLogged')} · ${fmt(r.avg?.fiber)} g ${t('fiberShort')} · ${r.plantCount} 🌱`),
        h('small', {}, r.suggestions.slice(0, 2).map((s) => s[lang()] || s.en).join(' • ')))))) : null);
}

function reportView(a, fresh) {
  if (!a.nDays) return h('div', { class: 'card' }, h('p', {}, t('optNoData')), fresh && h('a', { class: 'btn', href: '#/menu' }, t('viewNewPlan')));
  const block = (title, arr, cls) => arr.length ? h('div', { class: `card ${cls}` }, h('h3', {}, title),
    h('ul', { class: 'sugg' }, arr.map((g) => h('li', {}, h('p', {}, g[lang()] || g.en), h('div', { class: 'ref-row' }, g.refs.map(refChip)))))) : null;
  return h('div', {},
    h('p', { class: 'hint' }, t('weekBasis', { n: a.nDays })),
    block(t('excesses'), a.excesses, 'warn-card'),
    block(t('gaps'), a.gaps, ''),
    !a.gaps.length && !a.excesses.length && h('div', { class: 'card' }, h('p', {}, t('allOnTrack'))),
    h('div', { class: 'card good-card' }, h('h3', {}, t('newPlanGenerated')), h('p', { class: 'muted' }, t('newPlanExplain')), h('a', { class: 'btn primary', href: '#/menu' }, t('viewNewPlan'))));
}
