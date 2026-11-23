// App shell, routing, theme and language handling.
import { h, fill, icon, loading, toast, sheet } from './ui.js';
import { t, lang, setLang } from './i18n.js';
import { api, state, loadMe, loadPlan } from './api.js';

const VIEWS = {
  home: () => import('./views/home.js'),
  menu: () => import('./views/menu.js'),
  scan: () => import('./views/scanner.js'),
  dashboard: () => import('./views/dashboard.js'),
  research: () => import('./views/research.js'),
  assistant: () => import('./views/assistant.js'),
  profile: () => import('./views/profile.js'),
  analyze: () => import('./views/analyze.js'),
  product: () => import('./views/product.js'),
  agent: () => import('./views/agent.js'),
  diary: () => import('./views/diary.js'),
  onboarding: () => import('./views/onboarding.js'),
  auth: () => import('./views/auth.js'),
};
const NAV = [['home', 'home'], ['menu', 'menu'], ['analyze', 'sparkle'], ['diary', 'diary'], ['dashboard', 'chart']];
const MORE = [['agent', 'flask'], ['product', 'link'], ['assistant', 'chat'], ['research', 'book'], ['scan', 'scan'], ['profile', 'user']];

const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* storage unavailable */ } },
};

export function applyTheme(theme) {
  const tTheme = theme || store.get('nl_theme') || 'auto';
  if (tTheme === 'auto') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.setAttribute('data-theme', tTheme);
  store.set('nl_theme', tTheme);
}

function currentTheme() {
  const a = document.documentElement.getAttribute('data-theme');
  if (a) return a;
  return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function header() {
  return h('header', { class: 'topbar' },
    h('a', { class: 'brand', href: '#home', 'aria-label': 'NutriLongevity AI' },
      h('span', { class: 'brand-mark' }, icon('leaf', 18)), h('span', {}, 'NutriLongevity', h('b', {}, ' AI'))),
    h('div', { class: 'top-actions' },
      h('button', { class: 'chip-btn', 'aria-label': t('language'), onclick: () => { setLang(lang() === 'he' ? 'en' : 'he'); store.set('nl_lang', lang()); render(); } }, lang() === 'he' ? 'EN' : 'עב'),
      h('button', { class: 'icon-btn', 'aria-label': t('theme'), onclick: () => { applyTheme(currentTheme() === 'dark' ? 'light' : 'dark'); render(); } }, icon(currentTheme() === 'dark' ? 'sun' : 'moon'))));
}

function nav(active) {
  const moreActive = MORE.some(([id]) => id === active);
  return h('nav', { class: 'bottom-nav', 'aria-label': t('mainNav') },
    NAV.map(([id, ic]) => h('a', { href: `#${id}`, class: `${active === id ? 'active' : ''} ${id === 'analyze' ? 'nav-cta' : ''}`, 'aria-current': active === id ? 'page' : null }, h('span', { class: 'nav-ic' }, icon(ic, id === 'analyze' ? 24 : 21)), h('span', {}, t(`nav_${id}`)))),
    h('button', { class: moreActive ? 'active' : '', 'aria-label': t('nav_more'), onclick: openMore }, h('span', { class: 'nav-ic' }, icon('grid', 21)), h('span', {}, t('nav_more'))));
}

function openMore() {
  const s = sheet(t('nav_more'), h('div', { class: 'more-grid' }, MORE.map(([id, ic]) => h('a', { href: `#${id}`, class: 'more-item', onclick: () => s.close() },
    h('span', { class: 'quick-ic' }, icon(ic, 22)), h('strong', {}, t(`nav_${id}`)), h('small', { class: 'muted' }, t(`navsub_${id}`))))));
}

let renderToken = 0;
export async function render() {
  const token = ++renderToken;
  let route = (location.hash.replace(/^#\/?/, '').split('?')[0] || 'home');
  if (route === 'optimize') route = 'dashboard';
  if (!VIEWS[route]) route = 'home';
  if (!state.user && route !== 'auth') route = 'auth';
  else if (state.user && !state.profile && route !== 'onboarding' && route !== 'auth') route = 'onboarding';
  document.documentElement.lang = lang();
  document.documentElement.dir = lang() === 'he' ? 'rtl' : 'ltr';
  const app = document.getElementById('app');
  const view = h('main', { id: 'view', class: `view view-${route}`, tabindex: '-1' }, loading());
  const chrome = !['auth', 'onboarding'].includes(route);
  fill(app, ...(chrome ? [header(), view, nav(route)] : [view]));
  try {
    const mod = await VIEWS[route]();
    if (token !== renderToken) return;
    fill(view);
    await mod.render(view, { rerender: render });
    if (token === renderToken) view.focus({ preventScroll: true });
  } catch (e) {
    if (e.status === 401) { state.set({ user: null }); location.hash = '#auth'; return; }
    console.error(e);
    fill(view, h('div', { class: 'card error-card' }, h('h3', {}, t('errorTitle')), h('p', {}, e.message)));
  }
}

export function go(route) {
  if (location.hash === `#${route}`) render(); else location.hash = `#${route}`;
}

async function boot() {
  applyTheme();
  setLang(store.get('nl_lang') || ((navigator.language || '').startsWith('he') ? 'he' : 'en'));
  try { state.set({ status: await api('/api/status') }); } catch { /* offline */ }
  try {
    await loadMe();
    if (state.profile?.lang && !store.get('nl_lang')) setLang(state.profile.lang);
    if (state.profile) await loadPlan();
  } catch (e) { if (e.status !== 401) toast(t('networkError'), 'err'); }
  window.addEventListener('hashchange', render);
  render();
  if ('serviceWorker' in navigator && !state.status.artifact) navigator.serviceWorker.register('/sw.js').catch(() => {});
}

boot();
