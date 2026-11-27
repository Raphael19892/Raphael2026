import { h, fill, add, icon, toast, sheet, segmented } from '../ui.js';
import { t, lang, setLang } from '../i18n.js';
import { api, state, loadPlan, exportData } from '../api.js';
import { computeTargets } from '/shared/engine.js';
import { sectionBody, sectionActivity, sectionFood, sectionHealth } from './profileForm.js';
import { targetsCard, flagsList } from './components.js';
import { applyTheme } from '../app.js';

export async function render(view, { rerender }) {
  const p = JSON.parse(JSON.stringify(state.profile));
  const preview = h('div');
  const refresh = () => { const tg = computeTargets(p); fill(preview, flagsList(tg.flags), targetsCard(tg)); };
  const section = (title, el) => h('details', { class: 'card fold' }, h('summary', {}, h('h3', {}, title)), el);
  const form = h('form', { onsubmit: (e) => e.preventDefault(), oninput: refresh, onclick: () => setTimeout(refresh) },
    section(t('stepBody'), sectionBody(p)), section(t('stepActivity'), sectionActivity(p)),
    section(t('stepFood'), sectionFood(p)), section(t('stepHealth'), sectionHealth(p)));
  const save = async (regen) => {
    try {
      const r = await api('/api/profile', { method: 'PUT', body: { profile: { ...p, lang: lang() } } });
      state.set({ profile: r.profile, targets: r.targets });
      if (regen) { await api('/api/plan/generate', { method: 'POST', body: {} }); await loadPlan(); }
      toast(regen ? t('planReady') : t('saved'));
    } catch (e) { toast(e.message, 'err'); }
  };
  const theme = document.documentElement.getAttribute('data-theme') || 'auto';
  add(view, 
    h('div', { class: 'profile-head' }, h('div', { class: 'avatar' }, (state.user.name || state.user.email || 'N')[0].toUpperCase()),
      h('div', {}, h('h1', {}, state.user.name || t('nav_profile')), state.user.email && h('p', { class: 'muted' }, state.user.email))),
    h('h2', {}, t('yourProfile')), form,
    h('div', { class: 'row-actions sticky-save' },
      h('button', { class: 'btn primary', onclick: () => save(false) }, t('saveProfile')),
      h('button', { class: 'btn', onclick: () => save(true) }, icon('refresh', 16), ' ', t('saveRegenerate'))),
    preview,
    h('h2', {}, t('settings')),
    h('div', { class: 'card settings' },
      h('div', { class: 'set-row' }, h('span', {}, t('language')), segmented([['en', 'English'], ['he', 'עברית']], lang(), (v) => { setLang(v); try { localStorage.setItem('nl_lang', v); } catch { /* ignore */ } rerender(); })),
      h('div', { class: 'set-row' }, h('span', {}, t('theme')), segmented([['auto', t('themeAuto')], ['light', t('themeLight')], ['dark', t('themeDark')]], theme, (v) => { applyTheme(v); rerender(); })),
      h('div', { class: 'set-row' }, h('span', {}, t('exportData')),
        h('div', { class: 'row-actions' }, h('button', { class: 'btn small', onclick: () => exportData('json').catch((e) => toast(e.message, 'err')) }, icon('download', 15), ' JSON'), h('button', { class: 'btn small', onclick: () => exportData('csv').catch((e) => toast(e.message, 'err')) }, icon('download', 15), ' CSV'))),
      h('div', { class: 'set-row' }, h('span', {}, t('aiStatus')), h('span', { class: `pill ${state.status.ai ? 'good' : ''}` }, state.status.ai ? t('aiOnline') : t('aiOffline')))),
    h('div', { class: 'card about' }, h('h3', {}, t('aboutTitle')), h('p', {}, t('aboutText')), h('p', { class: 'muted small' }, t('medicalDisclaimer'))),
    h('div', { class: 'row-actions' },
      !state.status.artifact && h('button', { class: 'btn', onclick: async () => { await api('/api/auth/logout', { method: 'POST', body: {} }); state.set({ user: null, profile: null, plan: null }); location.hash = '#auth'; rerender(); } }, icon('logout', 16), ' ', t('signOut')),
      h('button', { class: 'btn danger', onclick: () => deleteAccount(rerender) }, icon('trash', 16), ' ', state.status.artifact ? t('deleteMyData') : t('deleteAccount'))));
  refresh();
}

function deleteAccount(rerender) {
  const pw = h('input', { type: 'password', autocomplete: 'current-password' });
  const err = h('p', { class: 'form-error' });
  const s = sheet(t('deleteAccount'), h('form', { onsubmit: async (e) => {
    e.preventDefault();
    try { await api('/api/account', { method: 'DELETE', body: { password: pw.value } }); s.close(); state.set(state.status.artifact ? { profile: null, plan: null } : { user: null, profile: null, plan: null }); location.hash = state.status.artifact ? '#onboarding' : '#auth'; rerender(); } catch (ex) { err.textContent = ex.message; }
  } }, h('p', {}, t('deleteWarn')), h('label', { class: 'field' }, h('span', {}, t('password')), pw), err, h('button', { class: 'btn danger block', type: 'submit' }, t('deleteForever'))));
}
