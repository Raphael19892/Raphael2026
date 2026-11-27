// Reusable profile form sections (used by onboarding and Profile & Settings).
import { h, fill } from '../ui.js';
import { t, lang } from '../i18n.js';
import { ALLERGENS, FOODS } from '/shared/foods.js';
import { CONDITIONS } from '/shared/engine.js';

export const DEFAULT_PROFILE = {
  age: 40, sex: 'female', heightCm: 168, weightKg: 68, activity: 'light', goal: 'longevity', diet: 'omnivore',
  allergies: [], conditions: [], dislikes: [], medications: '', healthGoals: ['longevity', 'heart', 'gut'],
  strengthTraining: 1, exerciseMinutes: 150, schedule: 'standard', cookingTime: 30, budget: 'medium', mealsPerDay: 4,
  frameworks: ['med', 'greenmed'],
};

const HEALTH_GOALS = ['longevity', 'heart', 'metabolic', 'gut', 'digestion', 'bodycomp', 'chronic'];
const FRAMEWORKS = ['med', 'greenmed', 'dash', 'plantforward', 'polyphenols', 'fermented'];

function numField(p, key, label, { min, max, step = 1, unit } = {}) {
  return h('label', { class: 'field' }, h('span', {}, label),
    h('div', { class: 'input-unit' },
      h('input', { type: 'number', inputmode: 'decimal', min, max, step, value: p[key], required: true, oninput: (e) => { p[key] = e.target.value === '' ? '' : Number(e.target.value); } }),
      unit && h('em', {}, unit)));
}

function select(p, key, label, options) {
  return h('label', { class: 'field' }, h('span', {}, label),
    h('select', { onchange: (e) => { p[key] = /^\d+$/.test(e.target.value) ? Number(e.target.value) : e.target.value; } },
      options.map(([v, l]) => h('option', { value: v, selected: String(p[key]) === String(v) }, l))));
}

function chips(p, key, label, options, { single = false, onChange } = {}) {
  const wrap = h('div', { class: 'chips', role: 'group', 'aria-label': label });
  const draw = () => {
    fill(wrap, ...options.map(([v, l]) => {
      const on = single ? p[key] === v : (p[key] || []).includes(v);
      return h('button', { type: 'button', class: `chip ${on ? 'on' : ''}`, 'aria-pressed': String(on), onclick: () => {
        if (single) p[key] = v;
        else { const s = new Set(p[key] || []); s.has(v) ? s.delete(v) : s.add(v); p[key] = [...s]; }
        draw(); onChange?.();
      } }, l);
    }));
  };
  draw();
  return h('div', { class: 'field' }, h('span', {}, label), wrap);
}

export function sectionBody(p) {
  return h('div', { class: 'form-grid' },
    numField(p, 'age', t('age'), { min: 18, max: 110, unit: t('years') }),
    chips(p, 'sex', t('sex'), [['female', t('female')], ['male', t('male')], ['other', t('otherSex')]], { single: true }),
    numField(p, 'heightCm', t('height'), { min: 120, max: 230, unit: 'cm' }),
    numField(p, 'weightKg', t('weight'), { min: 30, max: 300, step: 0.1, unit: 'kg' }),
    p.sex === 'other' && h('p', { class: 'hint' }, t('sexOtherHint')));
}

export function sectionActivity(p) {
  return h('div', { class: 'form-grid' },
    select(p, 'activity', t('activityLevel'), ['sedentary', 'light', 'moderate', 'active', 'very_active'].map((a) => [a, t(`act_${a}`)])),
    numField(p, 'strengthTraining', t('strengthSessions'), { min: 0, max: 14, unit: t('perWeek') }),
    numField(p, 'exerciseMinutes', t('exerciseMinutes'), { min: 0, max: 3000, step: 10, unit: t('minPerWeek') }),
    select(p, 'schedule', t('dailySchedule'), ['standard', 'early', 'late', 'shift'].map((s) => [s, t(`sched_${s}`)])),
    select(p, 'mealsPerDay', t('mealsPerDay'), [3, 4, 5, 6].map((n) => [n, `${n} ${t('mealsWord')}`])));
}

export function sectionFood(p) {
  const dislikeOptions = FOODS.map((f) => [f.id, `${f.emoji} ${f.name[lang()]}`]);
  return h('div', { class: 'form-grid' },
    chips(p, 'diet', t('dietPref'), ['omnivore', 'pescatarian', 'vegetarian', 'vegan'].map((d) => [d, t(`diet_${d}`)]), { single: true }),
    chips(p, 'allergies', t('allergies'), ALLERGENS.map((a) => [a, t(`al_${a}`)])),
    select(p, 'budget', t('budget'), ['low', 'medium', 'high'].map((b) => [b, t(`budget_${b}`)])),
    select(p, 'cookingTime', t('cookingTime'), [15, 30, 45, 60].map((m) => [m, `≤ ${m} ${t('min')}`])),
    chips(p, 'frameworks', t('frameworksPref'), FRAMEWORKS.map((f) => [f, t(`fw_${f}`)])),
    h('details', { class: 'field' }, h('summary', {}, `${t('dislikes')} (${(p.dislikes || []).length})`),
      chips(p, 'dislikes', '', dislikeOptions)));
}

export function sectionHealth(p) {
  return h('div', { class: 'form-grid' },
    chips(p, 'healthGoals', t('healthGoals'), HEALTH_GOALS.map((g) => [g, t(`hg_${g}`)])),
    chips(p, 'goal', t('weightGoal'), ['longevity', 'maintain', 'lose', 'gain'].map((g) => [g, t(`goal_${g}`)]), { single: true }),
    chips(p, 'conditions', t('conditions'), CONDITIONS.map((c) => [c, t(`cond_${c}`)])),
    h('label', { class: 'field' }, h('span', {}, t('medications')),
      h('input', { type: 'text', value: p.medications || '', maxlength: 300, placeholder: t('medicationsPh'), oninput: (e) => { p.medications = e.target.value; } })),
    h('p', { class: 'hint' }, t('conditionsHint')));
}
