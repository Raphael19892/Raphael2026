import { h, fill, add, icon, toast } from '../ui.js';
import { t, lang } from '../i18n.js';
import { api, state, loadPlan } from '../api.js';
import { computeTargets } from '/shared/engine.js';
import { DEFAULT_PROFILE, sectionBody, sectionActivity, sectionFood, sectionHealth } from './profileForm.js';
import { targetsCard, flagsList } from './components.js';

export async function render(view, { rerender }) {
  const p = { ...DEFAULT_PROFILE, ...(state.profile || {}), lang: lang() };
  let step = 0;
  let consent = false;

  const summary = () => {
    const tg = computeTargets(p);
    return h('div', {},
      flagsList(tg.flags),
      targetsCard(tg),
      h('label', { class: 'consent' },
        h('input', { type: 'checkbox', checked: consent, onchange: (e) => { consent = e.target.checked; sync(); } }),
        h('span', {}, t('consentText'))));
  };
  const steps = [['stepBody', sectionBody], ['stepActivity', sectionActivity], ['stepFood', sectionFood], ['stepHealth', sectionHealth], ['stepSummary', summary]];
  const last = steps.length - 1;

  const valid = () => {
    if (step === 0) return p.age >= 18 && p.age <= 110 && p.heightCm >= 120 && p.heightCm <= 230 && p.weightKg >= 30 && p.weightKg <= 300;
    if (step === last) return consent;
    return true;
  };
  const nextBtn = h('button', { class: 'btn primary', type: 'button' });
  const sync = () => {
    nextBtn.disabled = !valid();
    fill(nextBtn, step === last ? t('createPlan') : t('next'), ' ', icon('sparkle', 16));
  };

  const finish = async () => {
    nextBtn.disabled = true;
    try {
      const r = await api('/api/profile', { method: 'PUT', body: { profile: p } });
      state.set({ profile: r.profile, targets: r.targets });
      await api('/api/plan/generate', { method: 'POST', body: {} });
      await loadPlan();
      toast(t('planReady'));
      location.hash = '#home';
      rerender();
    } catch (e) { toast(e.message, 'err'); sync(); }
  };
  nextBtn.addEventListener('click', () => {
    if (!valid()) return;
    if (step < last) { step++; draw(); window.scrollTo(0, 0); } else finish();
  });

  function draw() {
    const [key, body] = steps[step];
    if (step === 0 && p.age < 18) p.age = 18;
    fill(view, h('div', { class: 'onboard' },
      h('div', { class: 'onboard-top' },
        h('div', { class: 'progress', role: 'progressbar', 'aria-valuemin': 1, 'aria-valuemax': steps.length, 'aria-valuenow': step + 1 },
          steps.map((_, i) => h('span', { class: i <= step ? 'on' : '' }))),
        h('p', { class: 'muted small' }, `${t('step')} ${step + 1}/${steps.length}`),
        h('h1', {}, t(key)),
        h('p', { class: 'muted' }, t(`${key}Sub`))),
      h('form', { class: 'card', onsubmit: (e) => e.preventDefault(), oninput: sync, onclick: () => setTimeout(sync) }, body(p)),
      h('div', { class: 'onboard-actions' },
        step > 0 && h('button', { class: 'btn ghost', type: 'button', onclick: () => { step--; draw(); } }, t('back')),
        nextBtn)));
    sync();
  }
  draw();
}
