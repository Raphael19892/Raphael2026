import { h, fill, add, icon, fmt, todayIso, dateLabel, toast } from '../ui.js';
import { t, lang } from '../i18n.js';
import { api, state } from '../api.js';
import { ring } from '../charts.js';
import { sumItems, indicators, dayTotals } from '/shared/nutrition.js';
import { flagsList, mealArt } from './components.js';
import { logMeal } from './menu.js';

export async function render(view) {
  const tg = state.targets;
  const today = todayIso();
  const from = new Date(Date.now() - 6 * 86400000).toISOString().slice(0, 10);
  const { logs } = await api(`/api/logs?from=${from}&to=${today}`);
  const todayItems = logs.filter((l) => l.date === today).flatMap((l) => l.items);
  const eaten = sumItems(todayItems);
  const weekInd = indicators(logs.flatMap((l) => l.items));
  const planDay = state.plan?.days.find((d) => d.date === today);
  const planned = planDay ? dayTotals(planDay) : null;
  const hour = new Date().getHours();
  const greet = hour < 12 ? t('goodMorning') : hour < 18 ? t('goodAfternoon') : t('goodEvening');
  const name = state.user?.name ? `, ${state.user.name}` : '';
  const loggedTitles = new Set(logs.filter((l) => l.date === today).map((l) => l.title));

  add(view, 
    h('section', { class: 'hero' },
      h('p', { class: 'muted' }, dateLabel(today, { weekday: 'long', day: 'numeric', month: 'long' })),
      h('h1', {}, greet, name),
      h('p', { class: 'muted' }, t('homeSub'))),
    flagsList((tg?.flags || []).filter((f) => f.level !== 'info')),
    h('section', { class: 'card' },
      h('div', { class: 'card-head' }, h('h2', {}, t('todayProgress')), h('a', { href: '#dashboard', class: 'link' }, t('details'))),
      h('div', { class: 'rings' },
        ring(eaten.kcal, tg.kcal, { label: t('energy'), sub: `${fmt(eaten.kcal)} kcal`, kind: 'range' }),
        ring(eaten.protein, tg.protein, { label: t('protein'), sub: `${fmt(eaten.protein)} g P` }),
        ring(eaten.fiber, tg.fiber, { label: t('fiber'), sub: `${fmt(eaten.fiber)} g ${t('fiberShort')}` }),
        ring(weekInd.plantCount, tg.weekly.plants, { label: t('plantsWeek'), sub: `${weekInd.plantCount} 🌱` })),
      h('div', { class: 'ring-legend' }, [t('energy'), t('protein'), t('fiber'), t('plantsWeek')].map((l) => h('span', {}, l))),
      !todayItems.length && h('p', { class: 'hint' }, t('nothingLogged'))),
    planDay ? h('section', {},
      h('div', { class: 'section-head' }, h('h2', {}, t('todaysMenu')), h('a', { href: '#menu', class: 'link' }, t('openMenu'))),
      planned && h('p', { class: 'muted small' }, t('plannedTotals', { kcal: fmt(planned.kcal), p: fmt(planned.protein), f: fmt(planned.fiber) })),
      h('div', { class: 'hscroll' }, planDay.meals.map((m) => {
        const n = sumItems(m.items);
        const done = loggedTitles.has(m.name.en);
        return h('article', { class: 'mini-meal' },
          mealArt(m, 'sm'),
          h('div', { class: 'mini-body' },
            h('small', { class: 'slot' }, t(`slot_${m.slot}`)),
            h('h3', {}, m.name[lang()]),
            h('p', { class: 'muted small' }, `${fmt(n.kcal)} kcal · ${fmt(n.protein)} g P · ${fmt(n.fiber, 1)} g ${t('fiberShort')}`),
            h('button', { class: `btn small ${done ? 'done' : 'primary'}`, disabled: done, onclick: async (e) => { e.currentTarget.disabled = true; await logMeal(m, today); toast(t('logged')); render(fill(view) || view); } },
              icon(done ? 'check' : 'plus', 15), ' ', done ? t('eaten') : t('markEaten'))));
      }))) : h('section', { class: 'card' }, h('p', {}, t('noPlanToday')), h('a', { class: 'btn primary', href: '#menu' }, t('createPlan'))),
    h('section', { class: 'quick' },
      quick('#scan', 'scan', t('quickScan'), t('quickScanSub')),
      quick('#assistant', 'chat', t('quickAsk'), state.status.ai ? t('quickAskSub') : t('offlineAssistant')),
      quick('#optimize', 'sparkle', t('quickWeekly'), t('quickWeeklySub')),
      quick('#research', 'book', t('quickResearch'), t('quickResearchSub'))),
    h('p', { class: 'disclaimer' }, icon('info', 16), ' ', t('medicalDisclaimer')));
}

function quick(href, ic, title, sub) {
  return h('a', { class: 'quick-card', href }, h('span', { class: 'quick-ic' }, icon(ic, 20)), h('strong', {}, title), h('small', { class: 'muted' }, sub));
}
