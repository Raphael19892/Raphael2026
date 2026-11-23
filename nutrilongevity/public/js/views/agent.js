// Nutrition research agent: coordinator → searcher → verifier → writer (the user's own pipeline).
import { h, fill, add, icon, toast, pill, dateLabel } from '../ui.js';
import { t, lang } from '../i18n.js';
import { api, state } from '../api.js';
import { runAgent, MIN_APPROVED } from '/shared/researchAgent.js';

let current = null; // last report shown
const EXAMPLES = {
  he: ['סיבים תזונתיים ובריאות המעי', 'שמן זית ותמותה', 'מזון מותסס ומיקרוביום', 'נתרן ולחץ דם', 'אגוזים ובריאות הלב', 'מזון אולטרה-מעובד'],
  en: ['Dietary fibre and gut health', 'Olive oil and mortality', 'Fermented foods and the microbiome', 'Sodium and blood pressure', 'Nuts and heart health', 'Ultra-processed food'],
};
const STEPS = ['search', 'verify', 'write'];

export async function render(view) {
  const L = lang();
  const tracker = h('ol', { class: 'agent-steps' });
  const out = h('div');
  const input = h('input', { type: 'text', id: 'agent-topic', maxlength: 300, placeholder: t('agentTopicPh'), 'aria-label': t('agentTopic') });
  const go = h('button', { class: 'btn primary big', type: 'submit' }, icon('sparkle', 18), ' ', t('agentRun'));
  const status = Object.fromEntries(STEPS.map((s) => [s, 'waiting']));
  const drawTracker = () => fill(tracker, STEPS.map((s) => h('li', { class: `st-${status[s]}` },
    h('span', { class: 'step-dot' }, status[s] === 'done' ? '✓' : status[s] === 'failed' || status[s] === 'stopped' ? '!' : status[s] === 'running' ? '…' : ''),
    h('div', {}, h('strong', {}, t(`agent_${s}`)), h('small', { class: 'muted' }, t(`agentSub_${s}`)), h('small', { class: 'step-state' }, t(`agentState_${status[s]}`))))));
  drawTracker();

  const run = async (e) => {
    e?.preventDefault();
    const topic = input.value.trim();
    if (topic.length < 2) { toast(t('agentTopicFirst'), 'err'); input.focus(); return; }
    go.disabled = true; STEPS.forEach((s) => { status[s] = 'waiting'; }); drawTracker(); fill(out);
    const steps = {
      search: (tp) => api('/api/agent/search', { method: 'POST', body: { topic: tp, lang: L } }),
      verify: (tp, studies) => api('/api/agent/verify', { method: 'POST', body: { topic: tp, studies, lang: L } }),
      write: (tp, approved, verifier) => api('/api/agent/write', { method: 'POST', body: { topic: tp, approved, verifier: { confidence: verifier.confidence, confidenceReason: verifier.confidenceReason }, lang: L } }),
    };
    const report = await runAgent(topic, steps, (step, st) => { status[step] = st; drawTracker(); });
    if (report.stopped && report.stopped.reason !== 'error') { status[report.stopped.stage === 'search' ? 'verify' : 'write'] = 'stopped'; drawTracker(); }
    report.lang = L;
    current = report;
    try { await api('/api/agent/reports', { method: 'POST', body: { report } }); } catch { /* saving is optional */ }
    go.disabled = false;
    fill(out, reportView(report));
    drawHistory();
  };

  const history = h('div');
  const drawHistory = async () => {
    try {
      const { reports } = await api('/api/agent/reports');
      fill(history, reports.length ? h('details', { class: 'card' }, h('summary', {}, `${t('agentHistory')} (${reports.length})`),
        h('ul', { class: 'report-list' }, reports.map((r) => h('li', {},
          h('button', { class: 'linklike', onclick: () => { current = r; fill(out, reportView(r)); out.scrollIntoView({ behavior: 'smooth' }); } }, h('strong', {}, r.topic)),
          h('small', { class: 'muted' }, `${dateLabel((r.finishedAt || r.startedAt).slice(0, 10), { day: 'numeric', month: 'short' })} · ${r.stopped ? t('agentStoppedShort') : countLine(r)}`))))) : null);
    } catch { /* history optional */ }
  };

  fill(view,
    h('div', { class: 'section-head' }, h('h1', {}, t('nav_agent'))),
    h('p', { class: 'muted' }, t('agentIntro')),
    h('form', { class: 'card', onsubmit: run },
      h('label', { class: 'field', for: 'agent-topic' }, h('span', {}, t('agentTopic'))),
      input,
      h('div', { class: 'chips examples' }, EXAMPLES[L].map((ex) => h('button', { class: 'chip', type: 'button', onclick: () => { input.value = ex; } }, ex))),
      go,
      h('p', { class: 'hint' }, state.status.artifact ? t('agentLibraryNote') : t('agentPubmedNote'))),
    tracker,
    out,
    history,
    h('p', { class: 'disclaimer' }, icon('info', 14), ' ', t('agentHumanControl')));
  if (current) fill(out, reportView(current));
  drawHistory();
}

const countLine = (r) => (r.counts ? t('agentCounts', { found: r.counts.found, approved: r.counts.approved, rejected: r.counts.rejected, fix: r.counts.needsCorrection }) : '');

function reportView(r) {
  const studies = r.search?.studies || [];
  const rows = r.verify?.rows || [];
  const sourceTag = r.search?.mode === 'pubmed' ? 'PubMed' : t('agentLibrary');
  const blocks = [];

  // Stopped by the coordinator
  if (r.stopped) {
    const reason = r.stopped.reason === 'fewer_than_3_approved' ? t('agentStopFew', { n: r.counts?.approved ?? 0, min: MIN_APPROVED, found: r.counts?.found ?? studies.length })
      : r.stopped.reason === 'error' ? t('agentStopError', { stage: t(`agent_${r.stopped.stage}`), msg: r.stopped.message || '' })
        : t('agentStopNone', { note: r.stopped.reason });
    blocks.push(h('section', { class: 'card warn-card' }, h('h3', {}, icon('warn', 17), ' ', t('agentStopped')), h('p', {}, reason), r.search?.note ? h('p', { class: 'hint' }, r.search.note) : null));
  }

  // Writer output
  if (r.write) {
    const approved = r.approved || [];
    blocks.push(h('section', { class: 'card agent-summary' },
      h('div', { class: 'card-head' }, h('h2', {}, r.topic), h('span', { class: `pill conf-${r.verify.confidence}` }, `${t('confidence')}: ${t(`conf_${r.verify.confidence}`)}`)),
      r.write.automatic ? h('p', { class: 'hint' }, t('agentAutoSummary')) : null,
      h('ol', { class: 'summary-lines' }, (r.write.summary || []).map((line) => h('li', {}, line))),
      r.write.controversies?.length ? h('div', { class: 'flag flag-warn' }, icon('info', 16), h('div', {}, h('strong', {}, t('agentControversies')), h('ul', {}, r.write.controversies.map((c) => h('li', {}, c))))) : null,
      h('p', { class: 'small' }, h('strong', {}, t('confidence')), ': ', t(`conf_${r.verify.confidence}`), r.verify.confidenceReason ? ` — ${r.verify.confidenceReason}` : ''),
      h('div', { class: 'menu-suggestion' }, h('strong', {}, '🍽️ ', t('agentMenuSuggestion')), h('p', {}, r.write.menuSuggestion), h('small', { class: 'muted' }, t('agentMenuNote'))),
      h('h4', {}, t('sources')),
      h('ol', { class: 'sources' }, approved.map((s) => h('li', {}, `${s.title} — ${s.journal}, ${s.year}. `, h('a', { href: s.url, target: '_blank', rel: 'noopener noreferrer' }, s.doi ? `DOI ${s.doi}` : t('openSource'), ' ↗'))))));
  }

  if (r.counts) blocks.push(h('p', { class: 'count-line' }, countLine(r), r.unopened ? ` · ${t('agentUnopened', { n: r.unopened })}` : ''));

  // Verifier table
  if (rows.length) {
    const byId = Object.fromEntries(studies.map((s) => [String(s.id), s]));
    blocks.push(h('section', { class: 'card' },
      h('h3', {}, t('agent_verify'), ' ', pill(r.verify.mode === 'ai' ? 'Claude' : t('agentRules'))),
      h('div', { class: 'table-scroll' }, h('table', { class: 'ntable agent-table' },
        h('thead', {}, h('tr', {}, [t('agentColStudy'), t('agentColType'), t('agentColSample'), t('agentColLink'), t('agentColVerdict'), t('agentColNote')].map((c) => h('th', {}, c)))),
        h('tbody', {}, rows.map((row) => {
          const s = byId[String(row.id)] || {};
          return h('tr', {},
            h('td', {}, h('a', { href: s.url, target: '_blank', rel: 'noopener noreferrer' }, (s.title || row.id).slice(0, 90)), h('small', { class: 'muted' }, ` ${s.journal || ''} ${s.year || ''}`)),
            h('td', {}, t(`stype_${row.studyType || 'other'}`)),
            h('td', {}, row.sample || t('uncertain')),
            h('td', {}, row.linkOpened ? t('yes') : t('no')),
            h('td', {}, h('span', { class: `pill verdict-${row.verdict}` }, t(`verdict_${row.verdict}`))),
            h('td', { class: 'small' }, [row.note, row.causalityNote ? (row.studyType === 'observational' ? t('assocNotCause') : row.causalityNote) : null, row.contradicts?.length ? `${t('agentContradicts')}: ${row.contradicts.join(', ')}` : null].filter(Boolean).join(' · ')));
        })))),
      h('p', { class: 'hint' }, t('agentSearchedIn', { src: sourceTag }), r.search?.query && r.search.query !== r.topic ? ` · ${t('agentQuery')}: “${r.search.query}”` : '')));
  }

  // Searcher list
  if (studies.length) {
    blocks.push(h('details', { class: 'card' }, h('summary', {}, `${t('agent_search')}: ${studies.length} ${t('agentStudies')}`),
      h('ul', { class: 'searcher-list' }, studies.map((s) => h('li', {},
        h('strong', {}, s.title), h('div', { class: 'small muted' }, `${s.journal} · ${s.year} · ${t(`stype_${s.studyType || 'other'}`)} · ${s.sample || t('uncertain')}`),
        h('div', { class: 'small' }, s.claim, s.uncertain ? ` (${t('uncertain')})` : ''),
        h('a', { class: 'small', href: s.url, target: '_blank', rel: 'noopener noreferrer' }, s.url)))),
      h('p', { class: 'hint' }, t('agentReadyForVerifier'))));
  }
  return h('div', { class: 'agent-report' }, blocks);
}
