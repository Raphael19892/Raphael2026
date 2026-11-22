import { h, fill, add, icon, pill, segmented, loading } from '../ui.js';
import { api, state } from '../api.js';
import { t, lang } from '../i18n.js';
import { REFERENCES, FRAMEWORKS } from '/shared/evidence.js';
import { refDetail, refChip } from './components.js';

let tab = 'frameworks';
let topic = 'all';
let q = '';

const TOPICS = ['all', 'longevity', 'cardiovascular', 'metabolic', 'microbiome', 'fiber', 'upf', 'polyphenols', 'protein', 'sodium', 'bowel', 'glucose'];

export async function render(view) {
  const body = h('div');
  const draw = () => {
    fill(view, h('h1', {}, t('nav_research')), h('p', { class: 'muted' }, t('researchIntro')),
      segmented([['frameworks', t('frameworks')], ['library', t('library')], ...(state.status.pubmed ? [['latest', t('latestResearch')]] : []), ['method', t('howToRead')]], tab, (v) => { tab = v; draw(); }), body);
    fill(body, ...({ frameworks, library, method, latest }[tab] || frameworks)(draw));
  };
  draw();
}

function strengthDots(n) {
  return h('span', { class: 'dots', 'aria-label': `${n}/3` }, [1, 2, 3].map((i) => h('i', { class: i <= n ? 'on' : '' })));
}

function frameworks() {
  return [
    h('div', { class: 'card' },
      h('table', { class: 'fw-table' },
        h('thead', {}, h('tr', {}, h('th', {}, t('framework')), h('th', {}, t('evidenceStrength')))),
        h('tbody', {}, FRAMEWORKS.map((f) => h('tr', {}, h('td', {}, f.name[lang()]), h('td', {}, strengthDots(f.strength)))))),
      h('p', { class: 'hint' }, t('strengthLegend'))),
    ...FRAMEWORKS.map((f) => h('article', { class: 'card fw' },
      h('div', { class: 'card-head' }, h('h3', {}, f.name[lang()]), strengthDots(f.strength)),
      h('p', {}, f.summary[lang()]),
      h('p', { class: 'evidence-line' }, icon('flask', 14), ' ', f.evidence[lang()]),
      h('div', { class: 'ref-row' }, f.refs.map(refChip)))),
  ];
}

function library(draw) {
  const list = REFERENCES.filter((r) => (topic === 'all' || r.topics.includes(topic)) && (!q || `${r.title} ${r.journal} ${r.authors}`.toLowerCase().includes(q.toLowerCase())))
    .sort((a, b) => b.year - a.year);
  return [
    h('div', { class: 'search-box' }, icon('search', 18), h('input', { type: 'search', value: q, placeholder: t('searchRefs'), 'aria-label': t('searchRefs'), oninput: (e) => { q = e.target.value; clearTimeout(window.__rq); window.__rq = setTimeout(() => { draw(); document.querySelector('.view input[type=search]')?.focus(); }, 250); } })),
    h('div', { class: 'chips' }, TOPICS.map((tp) => h('button', { class: `chip ${tp === topic ? 'on' : ''}`, onclick: () => { topic = tp; draw(); } }, t(`topic_${tp}`)))),
    h('p', { class: 'muted small' }, t('refCount', { n: list.length })),
    ...list.map((r) => h('details', { class: 'card ref-card' },
      h('summary', {}, h('div', {}, h('strong', {}, r.title), h('small', { class: 'muted' }, `${r.journal} · ${r.year}`),
        h('div', { class: 'ref-tags' }, pill(t(`inf_${r.inference}`), `inf-${r.inference}`), pill(t(`lvl_${r.level}`), `lvl-${r.level}`)))),
      refDetail(r))),
  ];
}

function method() {
  const rows = ['causal', 'mixed', 'association', 'modelling', 'consensus', 'mechanistic'];
  return [
    h('div', { class: 'card' }, h('h3', {}, t('hierarchyTitle')), h('ol', { class: 'hierarchy' }, ['h1', 'h2', 'h3', 'h4', 'h5'].map((k) => h('li', {}, t(`hier_${k}`))))),
    h('div', { class: 'card' }, h('h3', {}, t('inferenceTitle')),
      h('dl', { class: 'ref-dl' }, rows.flatMap((r) => [h('dt', {}, pill(t(`inf_${r}`), `inf-${r}`)), h('dd', {}, t(`infExplain_${r}`))]))),
    h('div', { class: 'card' }, h('h3', {}, t('dataSourcesTitle')), h('p', {}, t('dataSourcesText')), h('div', { class: 'ref-row' }, refChip('perezjimenez2010'), refChip('fulgoni2009'), refChip('mifflin1990'))),
    h('div', { class: 'card' }, h('h3', {}, t('scoresTitle')), h('p', {}, t('scoresText'))),
  ];
}

let lastQ = ''; let lastResults = null;
function latest() {
  const out = h('div');
  const show = (res) => fill(out, res.length ? res.map((r) => h('article', { class: 'card ref-card' },
    h('strong', {}, r.title),
    h('small', { class: 'muted' }, `${r.authors} · ${r.journal} · ${r.pubdate || r.year || ''}`),
    h('div', { class: 'ref-tags' }, pill(t('notAppraised'), 'inf-association'), r.types.map((x) => pill(x))),
    h('div', { class: 'row-actions' },
      h('a', { class: 'btn ghost small', href: r.url, target: '_blank', rel: 'noopener noreferrer' }, 'PubMed ↗'),
      r.doi ? h('a', { class: 'btn ghost small', href: `https://doi.org/${r.doi}`, target: '_blank', rel: 'noopener noreferrer' }, `DOI ↗`) : null))) : h('p', { class: 'muted' }, t('noResults')));
  const input = h('input', { type: 'search', value: lastQ, placeholder: t('pubmedPh'), 'aria-label': t('pubmedPh') });
  const run = async (e) => {
    e?.preventDefault();
    const q = input.value.trim(); if (q.length < 3) return;
    lastQ = q; fill(out, loading(t('searchingPubmed')));
    try { const r = await api(`/api/research/search?q=${encodeURIComponent(q)}`); lastResults = r.results; show(r.results); } catch (ex) { fill(out, h('p', { class: 'form-error' }, ex.message)); }
  };
  if (lastResults) show(lastResults);
  return [
    h('p', { class: 'hint' }, t('latestIntro')),
    h('form', { class: 'search-box', onsubmit: run }, icon('search', 18), input, h('button', { class: 'btn small primary', type: 'submit' }, t('lookup'))),
    out,
  ];
}
