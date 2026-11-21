// Verifies every DOI in the evidence library against Crossref: the DOI must resolve and the
// registered title must closely match ours. Needs network access to api.crossref.org.
import { REFERENCES } from '../shared/evidence.js';

const norm = (s) => String(s).toLowerCase().replace(/<[^>]+>/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
function similarity(a, b) {
  const A = new Set(norm(a).split(' ')); const B = new Set(norm(b).split(' '));
  const inter = [...A].filter((w) => B.has(w)).length;
  return inter / Math.max(A.size, B.size);
}

let failures = 0;
for (const r of REFERENCES) {
  if (!r.doi) { console.log(`SKIP  ${r.id} (no DOI; url ${r.url})`); continue; }
  try {
    const res = await fetch(`https://api.crossref.org/works/${encodeURIComponent(r.doi)}`, { headers: { 'User-Agent': 'NutriLongevityAI-refcheck/1.0' } });
    if (!res.ok) { failures++; console.log(`FAIL  ${r.id} ${r.doi} → HTTP ${res.status}`); continue; }
    const m = (await res.json()).message;
    const title = (m.title || [''])[0];
    const year = m.issued?.['date-parts']?.[0]?.[0];
    const sim = similarity(title, r.title);
    const ok = sim >= 0.6;
    if (!ok) failures++;
    console.log(`${ok ? 'OK   ' : 'FAIL '} ${r.id} sim=${sim.toFixed(2)} year=${year}${year && Math.abs(year - r.year) > 1 ? ' (YEAR MISMATCH)' : ''}${ok ? '' : `\n      ours:     ${r.title}\n      crossref: ${title}`}`);
  } catch (e) { failures++; console.log(`ERROR ${r.id}: ${e.message}`); }
  await new Promise((s) => setTimeout(s, 150));
}
console.log(failures ? `\n${failures} reference(s) need attention.` : '\nAll DOIs verified.');
process.exit(failures ? 1 : 0);
