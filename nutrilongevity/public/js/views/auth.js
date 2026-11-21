import { h, fill, add, icon, toast } from '../ui.js';
import { t } from '../i18n.js';
import { api, state, loadMe, loadPlan } from '../api.js';

export async function render(view, { rerender }) {
  let mode = 'login';
  const draw = () => {
    const err = h('p', { class: 'form-error', role: 'alert' });
    const email = h('input', { type: 'email', required: true, autocomplete: 'email', id: 'au-email' });
    const pw = h('input', { type: 'password', required: true, minlength: 8, autocomplete: mode === 'login' ? 'current-password' : 'new-password', id: 'au-pw' });
    const name = h('input', { type: 'text', autocomplete: 'given-name', id: 'au-name' });
    const submit = async (e) => {
      e.preventDefault(); err.textContent = '';
      const btn = e.target.querySelector('button[type=submit]'); btn.disabled = true;
      try {
        await api(`/api/auth/${mode === 'login' ? 'login' : 'register'}`, { method: 'POST', body: { email: email.value.trim(), password: pw.value, name: name.value.trim() } });
        await loadMe();
        if (state.profile) await loadPlan();
        location.hash = state.profile ? '#/home' : '#/onboarding';
        rerender();
      } catch (ex) { err.textContent = ex.message; btn.disabled = false; }
    };
    fill(view, 
      h('div', { class: 'auth' },
        h('div', { class: 'auth-hero' },
          h('div', { class: 'auth-logo' }, icon('leaf', 34)),
          h('h1', {}, 'NutriLongevity ', h('span', { class: 'accent' }, 'AI')),
          h('p', { class: 'muted' }, t('tagline'))),
        h('form', { class: 'card auth-card', onsubmit: submit },
          h('div', { class: 'seg' },
            h('button', { type: 'button', class: mode === 'login' ? 'on' : '', onclick: () => { mode = 'login'; draw(); } }, t('signIn')),
            h('button', { type: 'button', class: mode === 'register' ? 'on' : '', onclick: () => { mode = 'register'; draw(); } }, t('createAccount'))),
          mode === 'register' && h('label', { class: 'field' }, h('span', {}, t('name')), name),
          h('label', { class: 'field' }, h('span', {}, t('email')), email),
          h('label', { class: 'field' }, h('span', {}, t('password')), pw, mode === 'register' && h('small', { class: 'muted' }, t('passwordHint'))),
          err,
          h('button', { type: 'submit', class: 'btn primary block' }, mode === 'login' ? t('signIn') : t('createAccount'))),
        h('p', { class: 'disclaimer' }, icon('info', 16), ' ', t('medicalDisclaimer'))));
  };
  draw();
}
