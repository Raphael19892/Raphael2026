// Weekly menu builder (the user's weekly-menu-builder agent): rules → menu, checks, shopping list.
import { h, fill, icon, fmt, toast, loading, dateLabel } from '../ui.js';
import { t, lang, unitLabel } from '../i18n.js';
import { api, state, loadPlan } from '../api.js';
import { FOOD_MAP } from '/shared/foods.js';
import { sumItems } from '/shared/nutrition.js';
import { buildWeeklyMenu, DEFAULT_MENU_RULES, DAY_NAMES, nextSunday } from '/shared/menuBuilder.js';
import { mealArt, foodName } from './components.js';

let last = null;
const GROUPS = ['fish', 'seafood', 'leafy', 'processedmeat', 'whitebread', 'cereals', 'redmeat', 'poultry', 'eggs', 'dairy'];
const DAILY = ['legume', 'wholegrain', 'vegetable', 'fruit', 'nuts', 'oliveoil'];
const FAVS = ['overnight_oats', 'yogurt_bowl', 'eggs', 'lentils', 'hummus', 'avocado', 'sweet_potato', 'broccoli', 'rye_sourdough', 'oat_pancake'];

export async function render(view) {
  const rules = structuredClone({ ...DEFAULT_MENU_RULES, ...(state.profile?.menuRules || {}) });
  const out = h('div');
  const req = h('textarea', { id: 'menu-req', rows: 2, maxlength: 1000, placeholder: t('menuReqPh'), 'aria-label': t('menuRequests') });
  const start = h('input', { type: 'date', id: 'menu-start', value: nextSunday(), 'aria-label': t('menuStart') });
  const go = h('button', { class: 'btn primary big', type: 'submit' }, icon('sparkle', 18), ' ', t('menuBuild'));

  const chipSet = (key, options, labelPrefix) => {
    const wrap = h('div', { class: 'chips' });
    const draw = () => fill(wrap, options.map((o) => h('button', { type: 'button', class: `chip ${rules[key].includes(o) ? 'on' : ''}`, 'aria-pressed': String(rules[key].includes(o)), onclick: () => {
      rules[key] = rules[key].includes(o) ? rules[key].filter((x) => x !== o) : [...rules[key], o]; draw();
    } }, t(`${labelPrefix}${o}`))));
    draw(); return wrap;
  };
  const saveRules = async () => {
    try { const r = await api('/api/profile', { method: 'PUT', body: { profile: { ...state.profile, menuRules: rules } } }); state.set({ profile: r.profile, targets: r.targets }); toast(t('saved')); } catch (e) { toast(e.message, 'err'); }
  };

  const build = async (e, seed) => {
    e?.preventDefault(); go.disabled = true;
    fill(out, loading(t('menuBuilding')));
    let requests = {};
    try { if (req.value.trim()) requests = await api('/api/menu/requests', { method: 'POST', body: { text: req.value.trim(), lang: lang() } }); } catch { /* build without requests */ }
    last = buildWeeklyMenu({ rules, profile: state.profile || {}, kcalTarget: state.targets?.kcal || 2000, requests, startDate: start.value || nextSunday(), seed: seed ?? Date.now() });
    last.requestMode = requests.mode;
    go.disabled = false;
    fill(out, result(last, () => build(null, Date.now())));
  };

  fill(view,
    h('div', { class: 'section-head' }, h('h1', {}, t('nav_weekmenu'))),
    h('p', { class: 'muted' }, t('menuIntro')),
    h('form', { class: 'card', onsubmit: build },
      h('label', { class: 'field', for: 'menu-req' }, h('span', {}, t('menuRequests')), h('small', { class: 'muted' }, t('menuReqHint'))),
      req,
      h('label', { class: 'field', for: 'menu-start' }, h('span', {}, t('menuStart')), start),
      go),
    h('details', { class: 'card fold' }, h('summary', {}, h('h3', {}, t('menuRules'))),
      h('div', { class: 'field' }, h('span', {}, t('menuExclude')), chipSet('exclude', GROUPS, 'mex_')),
      h('div', { class: 'field' }, h('span', {}, t('menuDaily')), chipSet('daily', DAILY, 'mdaily_')),
      h('div', { class: 'grid3' },
        h('label', { class: 'field' }, h('span', {}, t('fiberMinL')), h('input', { type: 'number', min: 10, max: 80, value: rules.fiberMin, oninput: (ev) => { rules.fiberMin = Number(ev.target.value); } })),
        h('label', { class: 'field' }, h('span', {}, t('fiberMaxL')), h('input', { type: 'number', min: 15, max: 100, value: rules.fiberMax, oninput: (ev) => { rules.fiberMax = Number(ev.target.value); } }))),
      h('div', { class: 'field' }, h('span', {}, t('menuFavorites')), chipSet('favorites', FAVS, 'mfav_')),
      h('label', { class: 'consent' }, h('input', { type: 'checkbox', checked: rules.kosher, onchange: (ev) => { rules.kosher = ev.target.checked; } }), h('span', {}, t('menuKosher'))),
      h('label', { class: 'consent' }, h('input', { type: 'checkbox', checked: rules.simplePrep, onchange: (ev) => { rules.simplePrep = ev.target.checked; } }), h('span', {}, t('menuSimple'))),
      h('button', { class: 'btn', type: 'button', onclick: saveRules }, t('saveRules'))),
    out,
    h('p', { class: 'disclaimer' }, icon('info', 14), ' ', t('menuDisclaimer')));
  if (last) fill(out, result(last, () => build(null, Date.now())));
}

const DEPT_ORDER = ['produce', 'legumes', 'grains', 'dairy', 'protein', 'nuts', 'pantry'];

function result(r, rebuild) {
  const L = lang();
  const lines = [];
  const qaAllOk = r.qa.every((q) => q.ok);
  return h('div', {},
    // Quality checks
    h('section', { class: `card ${qaAllOk ? 'good-card' : 'warn-card'}` },
      h('h3', {}, qaAllOk ? '✅ ' : '⚠️ ', t('menuQa')),
      h('ul', { class: 'qa-list' }, r.qa.map((q) => h('li', { class: q.ok ? 'ok' : 'bad' }, q.ok ? '✓ ' : '✗ ', t(`qa_${q.key}`), q.detail.length ? h('small', { class: 'muted' }, ` — ${q.detail.join('; ')}`) : null))),
      r.requests && (r.requests.shabbat || r.requests.skip.length || r.requests.add.length || r.requests.remove.length) ? h('p', { class: 'hint' }, t('menuRequestsApplied'), ': ',
        [r.requests.shabbat && t('reqShabbat'), ...r.requests.skip.map((s) => `${t('reqSkip')} ${DAY_NAMES[L === 'en' ? 'en' : 'he'][s.day]} (${t(`slot_${s.slot}`)})`),
          r.requests.add.length && `${t('reqAdd')}: ${r.requests.add.map((id) => FOOD_MAP[id].name[L]).join(', ')}`, r.requests.remove.length && `${t('reqRemove')}: ${r.requests.remove.map((id) => FOOD_MAP[id].name[L]).join(', ')}`].filter(Boolean).join(' · '),
        r.requests.notes ? ` · ${r.requests.notes}` : '') : null,
      r.notes.map((n) => h('p', { class: 'hint' }, n[L] || n.en))),
    // Summary
    h('div', { class: 'menu-stats' },
      h('div', { class: 'nstat' }, h('strong', {}, `${Math.round(r.days.reduce((a, d) => a + d.fiber, 0) / 7)} g`), h('span', {}, t('avgFiber'))),
      h('div', { class: 'nstat' }, h('strong', {}, String(r.plants)), h('span', {}, t('plantsWeekly'))),
      h('div', { class: 'nstat' }, h('strong', {}, `${r.rules.fiberMin}–${r.rules.fiberMax}`), h('span', {}, t('fiberTarget')))),
    h('p', { class: 'hint' }, t('menuEstimateNote')),
    // 7 days × 4 meals
    r.days.map((d) => h('section', { class: 'card day-menu' },
      h('div', { class: 'card-head' }, h('h3', {}, `${t('dayWord')} ${DAY_NAMES[L === 'en' ? 'en' : 'he'][d.dow]}`, h('small', { class: 'muted' }, ` · ${dateLabel(d.date, { day: 'numeric', month: 'numeric' })}`)),
        h('span', { class: `pill ${d.fiberOk ? 'good' : 'bad'}` }, `≈${d.fiber} g ${t('fiberShort')}`)),
      h('ul', { class: 'menu-meals' }, d.meals.map((m) => {
        if (m.skipped) return h('li', { class: 'skipped' }, h('small', { class: 'slot' }, t(`slot_${m.slot}`)), h('strong', {}, m.name[L] || m.name.en), h('small', { class: 'muted' }, m.reason));
        const n = sumItems(m.items);
        return h('li', {}, mealArt(m, 'xs'),
          h('div', {},
            h('small', { class: 'slot' }, t(`slot_${m.slot}`)), h('strong', {}, m.name[L] || m.name.en),
            h('small', { class: 'muted ing-line' }, m.items.map((i) => `${foodName(i)} ${i.grams} g`).join(' · ')),
            h('small', {}, `${fmt(n.kcal)} kcal · ${fmt(n.fiber, 1)} g ${t('fiberShort')} · ${m.minutes} ${t('min')}`),
            m.alternative ? h('small', { class: 'alt-line' }, '↔ ', t('alternative'), ': ', m.alternative.name[L] || m.alternative.name.en, ` (${fmt(sumItems(m.alternative.items).fiber, 1)} g ${t('fiberShort')})`) : null));
      })),
      d.missing.length ? h('p', { class: 'hint' }, t('dayMissing'), ': ', d.missing.map((k) => t(`mdaily_${k}`)).join(', ')) : null)),
    // Shopping list
    h('section', { class: 'card shop' },
      h('h3', {}, '🛒 ', t('shoppingList')),
      DEPT_ORDER.filter((dp) => r.shopping[dp]?.length).map((dp) => h('section', {},
        h('h4', {}, t(`dept_${dp}`)),
        h('ul', {}, r.shopping[dp].sort((a, b) => b.grams - a.grams).map((e) => {
          const f = FOOD_MAP[e.foodId];
          const label = `${f.name[L]} — ${e.dry ? `${fmt(e.purchaseGrams)} g ${t('dryWeight')}` : `${fmt(e.grams)} g`}${e.units && !e.dry ? ` (~${e.units} ${unitLabel(e.unitName)})` : ''}`;
          lines.push(`${t(`dept_${dp}`)}: ${label}`);
          return h('li', {}, h('label', {}, h('input', { type: 'checkbox' }), ` ${f.emoji} ${label}`));
        })))),
      h('button', { class: 'btn small', onclick: async () => { try { await navigator.clipboard.writeText(`${t('shoppingList')}\n${lines.join('\n')}`); toast(t('copied')); } catch { toast(t('copyFailed'), 'err'); } } }, t('copyList'))),
    h('div', { class: 'row-actions' },
      h('button', { class: 'btn primary', onclick: async () => { try { await api('/api/plan/import', { method: 'POST', body: { plan: r.plan } }); await loadPlan(); toast(t('menuImported')); location.hash = '#menu'; } catch (e) { toast(e.message, 'err'); } } }, icon('check', 16), ' ', t('menuUseAsPlan')),
      h('button', { class: 'btn', onclick: rebuild }, icon('refresh', 16), ' ', t('menuAnother'))));
}
