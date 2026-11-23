// Server implementation of the research agent's three roles.
// Searcher: PubMed E-utilities (real records). Verifier: opens each PubMed record (efetch) and checks the
// claim against the retrieved abstract. Writer: Claude, from approved studies only. Without an API key the
// rule-based roles from shared/researchAgent.js are used. If PubMed cannot be reached, the curated library
// is used and every link is reported as NOT opened.
import { aiAvailable, aiJson } from './ai.js';
import { queryPrompt, searcherPrompt, verifierPrompt, writerPrompt, localCandidates, rulePick, ruleVerify, ruleWrite, exclusionsOf } from '../shared/researchAgent.js';

const EUTILS = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils';
const key = () => (process.env.NCBI_API_KEY ? `&api_key=${encodeURIComponent(process.env.NCBI_API_KEY)}` : '');
async function get(url, type = 'json') {
  const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 12000);
  try {
    const r = await fetch(url, { signal: ctrl.signal, headers: { 'User-Agent': 'NutriLongevityAI/1.3 (research agent)' } });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return type === 'json' ? r.json() : r.text();
  } finally { clearTimeout(t); }
}
const decode = (s) => s.replace(/<[^>]+>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'");

/** Open PubMed records: returns { pmid → abstract text } for records actually retrieved. */
export async function fetchAbstracts(pmids) {
  if (!pmids.length) return {};
  const xml = await get(`${EUTILS}/efetch.fcgi?db=pubmed&retmode=xml&rettype=abstract&id=${pmids.join(',')}${key()}`, 'text');
  const out = {};
  for (const art of xml.split('<PubmedArticle>').slice(1)) {
    const pmid = art.match(/<PMID[^>]*>(\d+)<\/PMID>/)?.[1];
    const abs = [...art.matchAll(/<AbstractText([^>]*)>([\s\S]*?)<\/AbstractText>/g)].map((m) => `${m[1].match(/Label="([^"]+)"/)?.[1] ? `${m[1].match(/Label="([^"]+)"/)[1]}: ` : ''}${decode(m[2])}`).join(' ');
    if (pmid) out[pmid] = abs;
  }
  return out;
}

async function pubmedCandidates(query) {
  const year = new Date().getFullYear();
  const design = '(meta-analysis[pt] OR systematic review[pt] OR randomized controlled trial[pt] OR cohort studies[mh] OR observational study[pt])';
  let ids = [];
  for (const span of [3, 8]) {
    const term = `(${query}) AND ${design} AND ("${year - span}"[dp] : "3000"[dp])`;
    const s = await get(`${EUTILS}/esearch.fcgi?db=pubmed&retmode=json&sort=relevance&retmax=20&term=${encodeURIComponent(term)}${key()}`);
    ids = s.esearchresult?.idlist || [];
    if (ids.length >= 6) break;
  }
  if (!ids.length) return [];
  const sum = await get(`${EUTILS}/esummary.fcgi?db=pubmed&retmode=json&id=${ids.join(',')}${key()}`);
  const abstracts = await fetchAbstracts(ids.slice(0, 15));
  return ids.slice(0, 15).map((id) => sum.result?.[id]).filter(Boolean).map((r) => ({
    id: r.uid, title: r.title, journal: r.fulljournalname || r.source, year: Number(String(r.pubdate).slice(0, 4)) || null,
    types: r.pubtype || [], doi: (r.articleids || []).find((a) => a.idtype === 'doi')?.value || null,
    url: `https://pubmed.ncbi.nlm.nih.gov/${r.uid}/`, abstract: abstracts[r.uid] || '', source: 'pubmed',
  }));
}

export function serverSteps(profile = {}, lang = 'he') {
  const ai = aiAvailable();
  return {
    async search(topic) {
      let query = topic; let note = '';
      if (ai) { try { query = (await aiJson(queryPrompt(topic), { effort: 'low' })).query || topic; } catch { /* keep topic */ } }
      let candidates = []; let mode = 'pubmed';
      try { candidates = await pubmedCandidates(query); } catch { mode = 'library'; note = 'PubMed could not be reached'; }
      if (!candidates.length) { if (mode === 'pubmed') note = 'PubMed returned no matching studies'; mode = 'library'; candidates = localCandidates(topic); }
      let picked;
      if (ai && candidates.length) {
        try { const r = await aiJson(searcherPrompt(topic, candidates, lang)); picked = r.picked; note = [note, r.note].filter(Boolean).join(' · '); } catch { /* fall back */ }
      }
      if (!picked) picked = rulePick(candidates);
      const byId = Object.fromEntries(candidates.map((c) => [String(c.id), c]));
      const studies = picked.filter((p) => byId[String(p.id)]).slice(0, 8).map((p) => ({ ...byId[String(p.id)], ...p, id: String(p.id) }));
      return { studies: studies.map(({ curated, ...s }) => s), mode, query, note, ai };
    },
    async verify(topic, studies) {
      // Open every link: re-fetch PubMed records now (the verifier does not trust the searcher's copy).
      const pm = studies.filter((s) => s.source === 'pubmed').map((s) => s.id);
      let opened = {};
      try { opened = await fetchAbstracts(pm); } catch { opened = {}; }
      const withText = studies.map((s) => {
        if (s.source === 'pubmed') {
          const txt = opened[s.id];
          return { ...s, linkOpened: txt !== undefined, sourceText: txt || '', linkNote: txt === undefined ? 'PubMed record could not be opened' : txt ? '' : 'record has no abstract' };
        }
        return { ...s, linkOpened: false, sourceText: s.findings || '', linkNote: 'curated library record; link not opened live' };
      });
      let v = null;
      if (ai) { try { v = await aiJson(verifierPrompt(topic, withText, lang)); } catch { v = null; } }
      if (!v) v = ruleVerify(withText, lang);
      // Hard rules regardless of who judged: an unopened link is never approved.
      v.rows = v.rows.map((r) => { const s = withText.find((x) => String(x.id) === String(r.id)); return { ...r, linkOpened: Boolean(s?.linkOpened), verdict: s?.linkOpened || s?.source === 'library' ? r.verdict : 'rejected' }; });
      if (withText.some((s) => !s.linkOpened) && v.confidence === 'high') v.confidence = 'medium';
      return { ...v, mode: ai ? 'ai' : 'rules' };
    },
    async write(topic, approved, verifier) {
      if (ai) {
        try { return { ...(await aiJson(writerPrompt(topic, approved, verifier, exclusionsOf(profile, lang), lang))), automatic: false }; } catch { /* fall back */ }
      }
      return ruleWrite(topic, approved, verifier, profile, lang);
    },
  };
}
