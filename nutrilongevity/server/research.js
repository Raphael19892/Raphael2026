// Live literature search via NCBI PubMed E-utilities (esearch + esummary). Results are shown as
// "not yet appraised": they come straight from PubMed and have not been graded for evidence quality.
const EUTILS = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils';
const HIGH = '(meta-analysis[pt] OR systematic review[pt] OR randomized controlled trial[pt] OR practice guideline[pt])';

async function getJson(url) {
  const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 9000);
  try {
    const r = await fetch(url, { headers: { 'User-Agent': 'NutriLongevityAI/1.1 (research search)' }, signal: ctrl.signal });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.json();
  } finally { clearTimeout(t); }
}

export async function searchPubMed(q) {
  const term = `(${q}) AND (diet OR nutrition OR food) AND ${HIGH}`;
  const key = process.env.NCBI_API_KEY ? `&api_key=${encodeURIComponent(process.env.NCBI_API_KEY)}` : '';
  const s = await getJson(`${EUTILS}/esearch.fcgi?db=pubmed&retmode=json&sort=pub_date&retmax=12&term=${encodeURIComponent(term)}${key}`);
  const ids = s.esearchresult?.idlist || [];
  if (!ids.length) return [];
  const sum = await getJson(`${EUTILS}/esummary.fcgi?db=pubmed&retmode=json&id=${ids.join(',')}${key}`);
  return ids.map((id) => sum.result?.[id]).filter(Boolean).map((r) => ({
    pmid: r.uid, title: r.title, journal: r.fulljournalname || r.source, year: Number(String(r.pubdate || '').slice(0, 4)) || null,
    pubdate: r.pubdate, authors: (r.authors || []).slice(0, 3).map((a) => a.name).join(', ') + ((r.authors || []).length > 3 ? ', et al.' : ''),
    types: (r.pubtype || []).filter((p) => /Meta-Analysis|Systematic Review|Randomized Controlled Trial|Guideline/i.test(p)),
    doi: (r.articleids || []).find((a) => a.idtype === 'doi')?.value || null,
    url: `https://pubmed.ncbi.nlm.nih.gov/${r.uid}/`,
  }));
}
