// Service worker: cache the app shell for fast loads and offline start. API calls always go to the network.
const CACHE = 'nl-shell-v1';
const SHELL = ['/', '/index.html', '/styles.css', '/manifest.webmanifest', '/icons/icon.svg',
  '/js/app.js', '/js/ui.js', '/js/i18n.js', '/js/api.js', '/js/charts.js',
  '/js/views/home.js', '/js/views/menu.js', '/js/views/scanner.js', '/js/views/dashboard.js', '/js/views/research.js',
  '/js/views/assistant.js', '/js/views/profile.js', '/js/views/onboarding.js', '/js/views/auth.js', '/js/views/components.js', '/js/views/profileForm.js',
  '/shared/foods.js', '/shared/engine.js', '/shared/nutrition.js', '/shared/planner.js', '/shared/templates.js', '/shared/nova.js', '/shared/evidence.js', '/shared/analysis.js'];

self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin || url.pathname.startsWith('/api/')) return;
  // Network-first so updates arrive immediately; fall back to cache offline.
  e.respondWith(fetch(e.request).then((res) => {
    if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); }
    return res;
  }).catch(() => caches.match(e.request).then((r) => r || caches.match('/index.html'))));
});
