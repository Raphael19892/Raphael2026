import { h, fill, add, icon, linkify, toast } from '../ui.js';
import { t, lang } from '../i18n.js';
import { api, state } from '../api.js';
import { refChip } from './components.js';
import { REF_MAP } from '/shared/evidence.js';

const SUGGESTIONS = ['q_ate_healthy', 'q_improve_meal', 'q_fiber_target', 'q_breakfast', 'q_fiber', 'q_glucose', 'q_upf', 'q_exercise', 'q_plants', 'q_metaanalyses'];

export async function render(view) {
  const { messages, ai } = await api('/api/ai/history');
  const list = h('div', { class: 'chat-list', 'aria-live': 'polite' });
  const input = h('textarea', { rows: 1, placeholder: t('askPh'), 'aria-label': t('askPh'), maxlength: 4000,
    onkeydown: (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } },
    oninput: () => { input.style.height = 'auto'; input.style.height = `${Math.min(input.scrollHeight, 140)}px`; } });
  const sendBtn = h('button', { class: 'btn primary send', 'aria-label': t('send'), onclick: () => send() }, icon('send', 18));

  const bubble = (role, content, meta = {}) => h('div', { class: `msg ${role}` },
    h('div', { class: 'bubble' },
      role === 'assistant' ? linkify(content.replace(/\[ref:([a-z0-9_]+)\]/gi, (m, id) => (REF_MAP[id] ? `[${REF_MAP[id].authors.split(/[ ,]/)[0]} ${REF_MAP[id].year}]` : ''))) : content,
      meta.refs?.length ? h('div', { class: 'ref-row' }, h('small', { class: 'muted' }, t('sources'), ': '), meta.refs.map(refChip)) : null,
      role === 'assistant' && meta.mode === 'offline' && h('small', { class: 'mode-note' }, t('offlineAnswer'))));

  const scrollEnd = () => requestAnimationFrame(() => { list.lastElementChild?.scrollIntoView({ block: 'end', behavior: 'smooth' }); });

  async function send(text) {
    const msg = (text ?? input.value).trim();
    if (!msg) return;
    input.value = ''; input.style.height = 'auto';
    list.querySelector('.suggest')?.remove();
    list.append(bubble('user', msg));
    const typing = h('div', { class: 'msg assistant' }, h('div', { class: 'bubble typing' }, h('span'), h('span'), h('span')));
    list.append(typing); scrollEnd();
    sendBtn.disabled = true;
    try {
      const r = await api('/api/ai/chat', { method: 'POST', body: { message: msg, lang: lang(), date: new Date().toISOString().slice(0, 10) } });
      typing.replaceWith(bubble('assistant', r.text, r));
    } catch (e) { typing.replaceWith(h('div', { class: 'msg assistant' }, h('div', { class: 'bubble error' }, e.message))); }
    sendBtn.disabled = false; scrollEnd();
  }

  const suggest = h('div', { class: 'suggest' }, h('p', { class: 'muted small' }, t('tryAsking')),
    h('div', { class: 'chips' }, SUGGESTIONS.map((k) => h('button', { class: 'chip', onclick: () => send(t(k)) }, t(k)))));
  if (!messages.length) list.append(h('div', { class: 'msg assistant' }, h('div', { class: 'bubble' }, t('assistantHello'))), suggest);
  else { messages.forEach((m) => list.append(bubble(m.role, m.content, m.meta || {}))); list.append(suggest); }

  add(view, 
    h('div', { class: 'chat-head' },
      h('div', {}, h('h1', {}, t('nav_assistant')), h('span', { class: `pill ${ai ? 'good' : ''}` }, ai ? t('aiOnline') : t('aiOffline'))),
      messages.length > 0 && h('button', { class: 'icon-btn', 'aria-label': t('clearChat'), title: t('clearChat'), onclick: async () => { await api('/api/ai/history', { method: 'DELETE', body: {} }); toast(t('deleted')); fill(view); render(view); } }, icon('trash', 18))),
    h('p', { class: 'disclaimer compact' }, icon('info', 14), ' ', t('assistantDisclaimer')),
    list,
    h('div', { class: 'composer' }, input, sendBtn));
  scrollEnd();
}
