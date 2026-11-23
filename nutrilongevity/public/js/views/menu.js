import { h, fill, add, icon, fmt, sheet, toast, todayIso, dateLabel, novaBadge, loading, emptyState } from '../ui.js';
import { t, lang, unitLabel } from '../i18n.js';
import { api, state, loadPlan, savePlanDebounced } from '../api.js';
import { FOOD_MAP } from '/shared/foods.js';
import { sumItems, dayTotals, provenance } from '/shared/nutrition.js';
import { swapOptions, swapIngredient, setItemGrams, alternativeMeal, scaleMealBy, shoppingList } from '/shared/planner.js';
import { conditionFoodRules } from '/shared/engine.js';
import { targetBar, donut } from '../charts.js';
import { nutrientTable, sourceNote, foodName, foodEmoji, mealArt } from './components.js';

let dayIdx = null;

export async function logMeal(meal, date) {
  return api('/api/logs', { method: 'POST', body: { date, slot: meal.slot, title: meal.name.en, source: 'plan', items: meal.items } });
}

export async function render(view) {
  const plan = state.plan;
  if (!plan) {
    add(view, emptyState('🥗', t('noPlan'), t('noPlanSub'), h('button', { class: 'btn primary', onclick: () => newPlan(view) }, icon('sparkle', 16), ' ', t('createPlan'))));
    return;
  }
  const today = todayIso();
  if (dayIdx === null || dayIdx >= plan.days.length) {
    const i = plan.days.findIndex((d) => d.date === today);
    dayIdx = i >= 0 ? i : 0;
  }
  const { logs } = await api(`/api/logs?from=${plan.days[0].date}&to=${plan.days[plan.days.length - 1].date}`);
  draw(view, logs);
}

function draw(view, logs) {
  const plan = state.plan; const tg = state.targets;
  const day = plan.days[dayIdx];
  const totals = dayTotals(day);
  const logged = new Set(logs.filter((l) => l.date === day.date).map((l) => `${l.slot}|${l.title}`));
  const caution = conditionFoodRules(state.profile.conditions || []).caution;
  const redraw = () => { fill(view); draw(view, logs); };
  const persist = () => { savePlanDebounced(); redraw(); };

  fill(view, 
    h('div', { class: 'section-head' },
      h('h1', {}, t('nav_menu')),
      plan.kind === 'optimized' && h('span', { class: 'pill good' }, icon('sparkle', 13), ' ', t('optimizedPlan'))),
    h('div', { class: 'day-tabs', role: 'tablist' }, plan.days.map((d, i) => h('button', { role: 'tab', class: i === dayIdx ? 'on' : '', 'aria-selected': String(i === dayIdx), onclick: () => { dayIdx = i; redraw(); } },
      h('small', {}, dateLabel(d.date, { weekday: 'short' })), h('strong', {}, dateLabel(d.date, { day: 'numeric' }))))),
    // Day totals
    h('section', { class: 'card day-sum' },
      h('div', { class: 'day-sum-top' },
        donut([{ value: totals.protein * 4, cls: 'd-p' }, { value: totals.carbs * 4, cls: 'd-c' }, { value: totals.fat * 9, cls: 'd-f' }], { center: fmt(totals.kcal) }),
        h('div', { class: 'macro-list' },
          macroRow(t('energy'), totals.kcal, tg.kcal, 'kcal', 'range'),
          macroRow(t('protein'), totals.protein, tg.protein, 'g', 'min', 'd-p'),
          macroRow(t('carbs'), totals.carbs, tg.carbs, 'g', 'range', 'd-c'),
          macroRow(t('fat'), totals.fat, tg.fat, 'g', 'range', 'd-f'),
          macroRow(t('fiber'), totals.fiber, tg.fiber, 'g', 'min'))),
      h('div', { class: 'limits' },
        limit(t('satFat'), totals.satFat, tg.satFatMax, 'g'), limit(t('sodium'), totals.sodium, tg.sodiumMax, 'mg'), limit(t('addedSugar'), totals.addedSugar, tg.addedSugarMax, 'g')),
      totals.fiber > tg.fiber * 1.6 && h('p', { class: 'hint' }, icon('info', 14), ' ', t('highFiberNote')),
      h('button', { class: 'btn ghost small', onclick: () => sheet(t('dayNutrients'), h('div', {}, nutrientTable(totals, { targets: tg }), sourceNote(provenance(day.meals.flatMap((m) => m.items))), h('p', { class: 'hint' }, t('calcNote')))) }, t('fullNutrients'))),
    // Meals
    day.meals.map((m, mi) => mealCard(m, mi, day, logged, caution, persist, logs, redraw)),
    // Plan actions
    h('section', { class: 'plan-actions' },
      h('button', { class: 'btn', onclick: () => shopSheet() }, icon('cart', 17), ' ', t('shoppingList')),
      h('button', { class: 'btn', onclick: () => favoritesSheet(day, persist) }, icon('heart', 17), ' ', t('favorites')),
      h('button', { class: 'btn', onclick: () => newPlan(view) }, icon('refresh', 17), ' ', t('newWeek')),
      h('a', { class: 'btn', href: '#weekmenu' }, icon('cart', 17), ' ', t('nav_weekmenu'))),
    h('p', { class: 'hint center' }, t('planBasis')));
}

function macroRow(label, v, target, unit, kind, cls = '') {
  return h('div', { class: 'mrow' }, h('span', { class: `dot ${cls}` }), h('span', {}, label),
    h('strong', {}, `${fmt(v)}`, h('small', {}, ` / ${fmt(target)} ${unit}`)), targetBar(v, target, { kind }));
}
function limit(label, v, max, unit) {
  const over = v > max;
  return h('div', { class: `limit ${over ? 'over' : ''}` }, h('small', {}, label), h('strong', {}, fmt(v), h('small', {}, ` / <${fmt(max)} ${unit}`)));
}

function mealCard(m, mi, day, logged, caution, persist, logs, redraw) {
  const n = sumItems(m.items);
  const isLogged = logged.has(`${m.slot}|${m.name.en}`);
  const novas = [...new Set(m.items.map((i) => FOOD_MAP[i.foodId]?.nova).filter(Boolean))].sort();
  const open = h('div', { class: 'meal-detail', hidden: true });
  const fillDetail = () => {
    fill(open, 
      h('ul', { class: 'ingredients' }, m.items.map((it, ii) => {
        const f = FOOD_MAP[it.foodId];
        const ni = sumItems([it]);
        return h('li', {},
          h('span', { class: 'ing-emoji' }, foodEmoji(it)),
          h('div', { class: 'ing-main' },
            h('strong', {}, foodName(it)),
            h('small', { class: 'muted' }, `${fmt(ni.kcal)} kcal · P ${fmt(ni.protein, 1)} · C ${fmt(ni.carbs, 1)} · F ${fmt(ni.fat, 1)} · ${t('fiberShort')} ${fmt(ni.fiber, 1)}${f?.poly ? ` · ≈${fmt(ni.polyphenols)} mg ${t('polyShort')}` : ''}`),
            caution[it.foodId] && h('small', { class: 'caution' }, icon('warn', 12), ' ', t('cautionFor'), ': ', caution[it.foodId])),
          h('div', { class: 'grams' },
            h('button', { class: 'icon-btn sm', 'aria-label': t('less'), onclick: () => { day.meals[mi] = setItemGrams(m, ii, Math.max(0, it.grams - step(it.grams))); persist(); } }, icon('minus', 14)),
            h('input', { type: 'number', value: it.grams, min: 0, max: 2000, 'aria-label': `${foodName(it)} g`, onchange: (e) => { day.meals[mi] = setItemGrams(m, ii, e.target.value); persist(); } }),
            h('span', { class: 'g' }, 'g'),
            h('button', { class: 'icon-btn sm', 'aria-label': t('more'), onclick: () => { day.meals[mi] = setItemGrams(m, ii, it.grams + step(it.grams)); persist(); } }, icon('plus', 14))),
          it.foodId && h('button', { class: 'icon-btn sm', 'aria-label': t('swapIngredient'), title: t('swapIngredient'), onclick: () => swapSheet(m, ii, (nm) => { day.meals[mi] = nm; persist(); }) }, icon('swap', 16)));
      })),
      m.adaptations?.length ? h('p', { class: 'hint' }, icon('info', 13), ' ', t('adaptedNote'), ' ', m.adaptations.map((a) => `${FOOD_MAP[a.from]?.name[lang()]} → ${a.to ? FOOD_MAP[a.to]?.name[lang()] : t('removed')}`).join('; ')) : null,
      h('div', { class: 'prep' }, h('strong', {}, t('preparation'), ` · ${m.minutes} ${t('min')}`), h('p', {}, m.prep?.[lang()] || '')),
      h('div', {}, nutrientTable(n, { targets: state.targets }), sourceNote(provenance(m.items))));
  };
  return h('article', { class: `meal-card ${isLogged ? 'is-logged' : ''}` },
    h('div', { class: 'meal-top', onclick: () => { open.hidden = !open.hidden; if (!open.hidden) fillDetail(); } },
      mealArt(m, 'md'),
      h('div', { class: 'meal-info' },
        h('small', { class: 'slot' }, t(`slot_${m.slot}`), isLogged ? h('span', { class: 'pill good' }, icon('check', 12), ' ', t('eaten')) : null),
        h('h3', {}, m.name[lang()]),
        h('div', { class: 'meal-macros' },
          h('span', {}, h('b', {}, fmt(n.kcal)), ' kcal'), h('span', {}, h('b', {}, fmt(n.protein)), ' g P'),
          h('span', {}, h('b', {}, fmt(n.carbs)), ' g C'), h('span', {}, h('b', {}, fmt(n.fat)), ' g F'),
          h('span', {}, h('b', {}, fmt(n.fiber, 1)), ` g ${t('fiberShort')}`)),
        h('div', { class: 'meal-badges' }, novas.map((x) => novaBadge(x, 'typical')), n.polyCoverageG > 0 && h('span', { class: 'pill' }, `≈${fmt(n.polyphenols)} mg ${t('polyShort')}`)))),
    open,
    h('div', { class: 'meal-actions' },
      h('button', { class: `btn small ${isLogged ? 'done' : 'primary'}`, disabled: isLogged, onclick: async () => { await logMeal(m, day.date); toast(t('logged')); logs.push({ date: day.date, slot: m.slot, title: m.name.en }); redraw(); } }, icon('check', 15), ' ', isLogged ? t('eaten') : t('markEaten')),
      h('button', { class: 'btn small', onclick: () => { day.meals[mi] = alternativeMeal(m, state.profile, Date.now(), day.meals.map((x) => x.templateId)); persist(); toast(t('mealReplaced')); } }, icon('refresh', 15), ' ', t('replaceMeal')),
      h('button', { class: 'icon-btn', 'aria-label': t('smallerPortion'), title: t('smallerPortion'), onclick: () => { day.meals[mi] = scaleMealBy(m, 0.9); persist(); } }, icon('minus', 16)),
      h('button', { class: 'icon-btn', 'aria-label': t('largerPortion'), title: t('largerPortion'), onclick: () => { day.meals[mi] = scaleMealBy(m, 1.1); persist(); } }, icon('plus', 16)),
      h('button', { class: 'icon-btn', 'aria-label': t('saveFavorite'), title: t('saveFavorite'), onclick: async () => { await api('/api/favorites', { method: 'POST', body: { meal: m } }); toast(t('savedFavorite')); } }, icon('heart', 16))));
}

const step = (g) => (g >= 100 ? 10 : g >= 30 ? 5 : 1);

function swapSheet(meal, idx, apply) {
  const it = meal.items[idx];
  const cur = FOOD_MAP[it.foodId];
  const opts = swapOptions(it.foodId, state.profile);
  const before = sumItems([it]);
  const list = h('ul', { class: 'swap-list' }, opts.length ? opts.map((id) => {
    const nm = swapIngredient(meal, idx, id, 'kcal');
    const ni = sumItems([nm.items[idx]]);
    const d = (k, dp = 1) => { const v = ni[k] - before[k]; return `${v >= 0 ? '+' : ''}${fmt(v, dp)}`; };
    const f = FOOD_MAP[id];
    return h('li', {}, h('button', { onclick: () => { apply(nm); s.close(); toast(t('swapped')); } },
      h('span', { class: 'ing-emoji' }, f.emoji),
      h('div', {}, h('strong', {}, f.name[lang()]), h('small', { class: 'muted' }, `${nm.items[idx].grams} g · ${t('fiberShort')} ${d('fiber')} g · P ${d('protein')} g · Na ${d('sodium', 0)} mg`)),
      novaBadge(f.nova, 'typical')));
  }) : h('li', { class: 'muted' }, t('noSwaps')));
  const s = sheet(`${t('swapIngredient')}: ${cur.name[lang()]}`, h('div', {}, h('p', { class: 'hint' }, t('swapHint')), list));
}

function shopSheet() {
  const groups = shoppingList(state.plan);
  const checked = new Set();
  const lines = [];
  const content = h('div', { class: 'shop' }, Object.entries(groups).map(([g, items]) => h('section', {},
    h('h4', {}, t(`group_${g}`)),
    h('ul', {}, items.sort((a, b) => b.grams - a.grams).map((e) => {
      const f = FOOD_MAP[e.foodId];
      const label = `${f.name[lang()]} — ${e.dry ? `${fmt(e.purchaseGrams)} g ${t('dryWeight')}` : `${fmt(e.grams)} g`}${e.units && !e.dry ? ` (~${e.units} ${unitLabel(e.unitName)})` : ''}`;
      lines.push(`☐ ${label}`);
      return h('li', {}, h('label', {}, h('input', { type: 'checkbox', onchange: (ev) => (ev.target.checked ? checked.add(e.foodId) : checked.delete(e.foodId)) }), ` ${f.emoji} ${label}`));
    })))),
  h('button', { class: 'btn primary block', onclick: async () => { try { await navigator.clipboard.writeText(`${t('shoppingList')}\n${lines.join('\n')}`); toast(t('copied')); } catch { toast(t('copyFailed'), 'err'); } } }, t('copyList')));
  sheet(t('shoppingList'), content);
}

async function favoritesSheet(day, persist) {
  const s = sheet(t('favorites'), loading());
  const { favorites } = await api('/api/favorites');
  fill(s.body, favorites.length ? h('ul', { class: 'fav-list' }, favorites.map((f) => {
    const n = sumItems(f.items);
    return h('li', {}, mealArt(f, 'xs'), h('div', {}, h('strong', {}, f.name[lang()]), h('small', { class: 'muted' }, `${fmt(n.kcal)} kcal · ${t(`slot_${f.slot}`)}`)),
      h('button', { class: 'btn small', onclick: () => {
        const i = day.meals.findIndex((m) => m.slot === f.slot);
        if (i < 0) { toast(t('noSlot'), 'err'); return; }
        const target = day.meals[i].targetKcal || sumItems(day.meals[i].items).kcal;
        const meal = { ...f, id: `fav-${f.id}-${Date.now()}`, minutes: f.minutes || 10, adaptations: [] };
        day.meals[i] = scaleMealBy(meal, target / (n.kcal || target), target);
        persist(); s.close(); toast(t('mealReplaced'));
      } }, t('useToday')),
      h('button', { class: 'icon-btn', 'aria-label': t('delete'), onclick: async (e) => { await api(`/api/favorites/${f.id}`, { method: 'DELETE', body: {} }); e.currentTarget.closest('li').remove(); } }, icon('trash', 16)));
  })) : h('p', { class: 'muted' }, t('noFavorites')));
}

async function newPlan(view) {
  const s = sheet(t('newWeek'), h('div', {},
    h('p', {}, t('newWeekText')),
    h('button', { class: 'btn primary block', onclick: async (e) => {
      e.currentTarget.disabled = true;
      await api('/api/plan/generate', { method: 'POST', body: { startDate: todayIso() } });
      await loadPlan(); dayIdx = 0; s.close(); toast(t('planReady'));
      fill(view); render(view);
    } }, icon('sparkle', 16), ' ', t('generate'))));
}
