// Tiny DOM toolkit: hyperscript, icons, toasts, bottom sheets, formatting.
import { t, lang } from './i18n.js';

export function h(tag, attrs = {}, ...children) {
  const el = tag === 'frag' ? document.createDocumentFragment() : document.createElement(tag);
  if (attrs && tag !== 'frag') {
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
      else if (k === 'html') el.innerHTML = v; // only used with trusted, app-generated markup (icons/charts)
      else if (k in el && typeof v !== 'string') el[k] = v;
      else el.setAttribute(k, v === true ? '' : v);
    }
  }
  for (const c of children.flat(Infinity)) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

const ICONS = {
  home: '<path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z"/>',
  menu: '<path d="M7 3v8a3 3 0 0 0 3 3v7M10 3v8M13 3v8a3 3 0 0 1-3 3M17 3c-1.5 2-2 4-2 7h3v11"/>',
  scan: '<path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3M7 9v6M10 9v6M13 9v6M17 9v6"/>',
  chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  book: '<path d="M4 4h6a3 3 0 0 1 3 3v13a2 2 0 0 0-2-2H4zM20 4h-6a3 3 0 0 0-3 3v13a2 2 0 0 1 2-2h7z"/>',
  chat: '<path d="M4 5h16v11H9l-5 4z"/><circle cx="9" cy="10.5" r=".6"/><circle cx="12" cy="10.5" r=".6"/><circle cx="15" cy="10.5" r=".6"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/>',
  swap: '<path d="M7 4l-3 3 3 3M4 7h13M17 20l3-3-3-3M20 17H7"/>',
  refresh: '<path d="M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7"/>',
  heart: '<path d="M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.5-7 10-7 10z"/>',
  check: '<path d="M5 12l4 4 10-10"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  cart: '<path d="M3 4h2l2 12h11l2-8H6"/><circle cx="9" cy="20" r="1.3"/><circle cx="17" cy="20" r="1.3"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/>',
  warn: '<path d="M12 3l10 18H2z"/><path d="M12 10v5M12 18v.5"/>',
  camera: '<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>',
  upload: '<path d="M12 16V4M7 9l5-5 5 5M4 20h16"/>',
  search: '<circle cx="11" cy="11" r="6"/><path d="M20 20l-4.5-4.5"/>',
  send: '<path d="M4 12l16-8-6 16-2-7z"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5L19 19M5 19l1.5-1.5M17.5 6.5L19 5"/>',
  moon: '<path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z"/>',
  download: '<path d="M12 4v12M7 11l5 5 5-5M4 20h16"/>',
  leaf: '<path d="M5 19c0-9 6-14 15-14 0 9-5 15-14 15M5 19l7-7"/>',
  sparkle: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/>',
  trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>',
  flask: '<path d="M9 3h6M10 3v6l-5 10a1 1 0 0 0 1 2h12a1 1 0 0 0 1-2l-5-10V3"/>',
  logout: '<path d="M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
  grid: '<rect x="4" y="4" width="6" height="6" rx="1.5"/><rect x="14" y="4" width="6" height="6" rx="1.5"/><rect x="4" y="14" width="6" height="6" rx="1.5"/><rect x="14" y="14" width="6" height="6" rx="1.5"/>',
  diary: '<path d="M6 3h11a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H6zM6 3a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2M9 8h6M9 12h6M9 16h4"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16zM14 6l4 4"/>',
};
export function icon(name, size = 22) {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('width', size); s.setAttribute('height', size);
  s.setAttribute('fill', 'none'); s.setAttribute('stroke', 'currentColor'); s.setAttribute('stroke-width', '1.8');
  s.setAttribute('stroke-linecap', 'round'); s.setAttribute('stroke-linejoin', 'round'); s.setAttribute('aria-hidden', 'true');
  s.innerHTML = ICONS[name] || '';
  return s;
}

export function toast(msg, kind = 'ok') {
  const host = document.getElementById('toasts');
  const el = h('div', { class: `toast toast-${kind}`, role: 'status' }, msg);
  host.append(el);
  setTimeout(() => el.classList.add('out'), 2600);
  setTimeout(() => el.remove(), 3100);
}

/** Bottom sheet modal. Returns { close, body }. */
export function sheet(title, content, { onClose } = {}) {
  const prev = document.activeElement;
  const close = () => { wrap.classList.add('out'); setTimeout(() => wrap.remove(), 200); document.removeEventListener('keydown', esc); prev?.focus?.(); onClose?.(); };
  const esc = (e) => { if (e.key === 'Escape') close(); };
  const body = h('div', { class: 'sheet-body' }, content);
  const wrap = h('div', { class: 'sheet-wrap', onclick: (e) => { if (e.target === wrap) close(); } },
    h('div', { class: 'sheet', role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
      h('div', { class: 'sheet-head' }, h('h3', {}, title), h('button', { class: 'icon-btn', 'aria-label': t('close'), onclick: close }, icon('close'))),
      body));
  document.body.append(wrap);
  document.addEventListener('keydown', esc);
  setTimeout(() => wrap.querySelector('button, input, select, textarea')?.focus(), 50);
  return { close, body };
}

export function fmt(v, dp = 0) {
  if (v == null || Number.isNaN(v)) return '—';
  return Number(v).toLocaleString(lang() === 'he' ? 'he-IL' : 'en-US', { maximumFractionDigits: dp, minimumFractionDigits: 0 });
}

export function dateLabel(iso, opts = { weekday: 'short', day: 'numeric', month: 'short' }) {
  return new Date(`${iso}T12:00:00`).toLocaleDateString(lang() === 'he' ? 'he-IL' : 'en-GB', opts);
}

export const todayIso = () => {
  const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
};

export function loading(text) { return h('div', { class: 'loading' }, h('div', { class: 'spinner' }), text || t('loading')); }

export function pill(text, kind = '') { return h('span', { class: `pill ${kind}` }, text); }

export function novaBadge(n) {
  if (!n) return pill('NOVA ?', 'nova-x');
  return h('span', { class: `nova nova-${n}`, title: t(`nova${n}`) }, `NOVA ${n}`);
}

/** Simple segmented control. */
export function segmented(options, value, onChange) {
  const el = h('div', { class: 'seg', role: 'tablist' });
  for (const [v, label] of options) {
    el.append(h('button', { class: v === value ? 'on' : '', role: 'tab', 'aria-selected': String(v === value), onclick: () => onChange(v) }, label));
  }
  return el;
}

export function emptyState(emoji, title, text, action) {
  return h('div', { class: 'empty' }, h('div', { class: 'empty-emoji' }, emoji), h('h3', {}, title), text && h('p', { class: 'muted' }, text), action);
}

export function linkify(text) {
  // Escape-safe rendering of assistant text with **bold** and line breaks.
  const frag = document.createDocumentFragment();
  for (const [i, line] of String(text).split('\n').entries()) {
    if (i) frag.append(h('br'));
    const parts = line.split(/(\*\*[^*]+\*\*)/g);
    for (const p of parts) frag.append(p.startsWith('**') && p.endsWith('**') ? h('strong', {}, p.slice(2, -2)) : document.createTextNode(p));
  }
  return frag;
}

/** replaceChildren / append that flatten arrays and skip null/false (like h()). */
export function fill(el, ...kids) { el.replaceChildren(h('frag', {}, ...kids)); return el; }
export function add(el, ...kids) { el.append(h('frag', {}, ...kids)); return el; }

/**
 * Prepare a photo for upload: decode (JPEG/PNG/WebP/HEIC where the browser can), downscale and
 * re-encode as JPEG so phone photos (often 5–10 MB) stay well under upload limits.
 * Returns { b64, type, thumb, dataUrl } or throws Error('decode').
 */
export async function compressImage(file, max = 1600, quality = 0.85) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('decode')); i.src = url; });
    const draw = (m, q) => {
      const s = Math.min(1, m / Math.max(img.naturalWidth, img.naturalHeight));
      const c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(img.naturalWidth * s)); c.height = Math.max(1, Math.round(img.naturalHeight * s));
      const ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height); ctx.drawImage(img, 0, 0, c.width, c.height);
      return c.toDataURL('image/jpeg', q);
    };
    const dataUrl = draw(max, quality);
    return { b64: dataUrl.split(',')[1], type: 'image/jpeg', dataUrl, thumb: draw(200, 0.7) };
  } finally { URL.revokeObjectURL(url); }
}

/** A hidden file input for images WITHOUT `capture`, so phones offer both the camera and the gallery. */
export function imagePicker(onPick) {
  const input = h('input', { type: 'file', accept: 'image/*', hidden: true });
  input.addEventListener('change', async () => {
    const f = input.files[0]; input.value = '';
    if (!f) return;
    try { await onPick(await compressImage(f), f); } catch { toast(t('photoFailed'), 'err'); }
  });
  return input;
}
