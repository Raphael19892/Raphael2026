// Nutrition research agent — the user's three-step pipeline (searcher → verifier → writer) run by a
// coordinator, ported from their nutrition-research-* skills. Shared by the Node server and the claude.ai page.
//
// Rules kept from the skills:
//  * Searcher: 5–8 studies, recent (prefer the last 3 years), professional sources only, both sides when
//    there is controversy; never invent studies, numbers or links; mark "uncertain".
//  * Verifier: open each link; check type, sample, claim-vs-source match, causality; flag contradictions
//    without choosing sides; verdict approved / needs correction / rejected; overall confidence.
//  * Coordinator: stop and report if fewer than 3 studies are approved; say explicitly when links were not opened.
//  * Writer: only approved studies; 6–8 lines; every claim cites its study; "association, not causation"
//    for observational studies; contradictions; confidence; ONE menu suggestion respecting the person's
//    exclusions; sources with links. Reading material only — never changes the menu or recommends supplements.
import { REFERENCES, refLink } from './evidence.js';
import { FOOD_MAP, foodIsAllowed } from './foods.js';

export const MIN_APPROVED = 3;

// ── Prompts (Claude) ────────────────────────────────────────────────────
const L = (lang) => (lang === 'en' ? 'English' : 'Hebrew');

export function queryPrompt(topic) {
  return `Turn this nutrition research topic (possibly in Hebrew) into ONE PubMed search query in English using plain keywords and OR-synonyms in parentheses, no field tags. Reply with only JSON: {"query": string, "topicEn": string}.\n\nTopic: """${String(topic).slice(0, 300)}"""`;
}

export function searcherPrompt(topic, candidates, lang) {
  return `You are the SEARCHER in a nutrition research pipeline. You find studies only; you do not summarise or draw conclusions — a verifier checks your output after you.

Topic: """${topic}"""

Below are candidate records that were actually retrieved (title, journal, year, publication types, abstract). Choose 5 to 8 that best address the topic, preferring the last 3 years, systematic reviews/meta-analyses and RCTs, and professional sources. If the evidence is contested, include studies from both sides.
For each chosen record give: id (exactly as given), studyType ("rct" | "observational" | "review" | "other"), sample (participants and population as stated in the abstract, or "uncertain"), claim (the main finding in ONE sentence, taken from the abstract — no extrapolation), uncertain (true if any detail is unclear).
Never invent studies, numbers or links; use only the records below. If fewer than 5 are relevant, return only the relevant ones and say so in note.
Write claim and sample in ${L(lang)}.
Reply with only JSON: {"picked": [{"id","studyType","sample","claim","uncertain"}], "note": string}

CANDIDATES:
${candidates.map((c) => `[${c.id}] ${c.title} — ${c.journal} ${c.year}. Types: ${(c.types || []).join(', ') || 'n/a'}.\nAbstract: ${(c.abstract || c.findings || '').slice(0, 1800)}`).join('\n\n')}`;
}

export function verifierPrompt(topic, studies, lang) {
  return `You are the VERIFIER in a nutrition research pipeline. You do not search for new studies and do not write the final summary. For each study below you receive the searcher's claim and the SOURCE TEXT that was actually retrieved from its link (or a note that the link could not be opened).

For each study decide:
1. linkOpened: use the given value. If the link was not opened and there is no source text, the verdict cannot be "approved". If the study is marked CURATED LIBRARY RECORD, the source text is a stored, previously checked summary of that publication: judge the claim against it, and say in the note that the link was not opened live.
2. studyType: "rct" | "observational" | "review" | "other" — from the source text.
3. sample: size and population from the source text, or "uncertain".
4. claimMatches: is the claim stated in the source itself (true), or an extension by whoever reported it (false)?
5. causalityNote: for observational studies write that it shows association, not causation.
6. contradicts: ids of other studies in this list that contradict it (do not pick a side).
verdict: "approved" (link opened, claim matches the source) | "needs_correction" (relevant but the claim overstates or misstates the source) | "rejected" (not opened, off-topic, or not supported).
note: one line. Then overall confidence "high" | "medium" | "low" with a one-line reason.
Never invent studies, numbers or links. If unsure, write "uncertain". No medical advice. Write notes in ${L(lang)}.
Reply with only JSON: {"rows": [{"id","studyType","sample","linkOpened","claimMatches","causalityNote","contradicts","verdict","note"}], "confidence": "high"|"medium"|"low", "confidenceReason": string}

Topic: """${topic}"""
STUDIES:
${studies.map((s) => `[${s.id}] ${s.title} (${s.journal}, ${s.year})\nSearcher claim: ${s.claim}\nLink opened: ${s.linkOpened ? 'yes' : 'no'}${s.linkNote ? ` (${s.linkNote})` : ''}${s.source === 'library' ? ' — CURATED LIBRARY RECORD' : ''}\nSOURCE TEXT: ${(s.sourceText || '').slice(0, 2500) || '(none)'}`).join('\n\n')}`;
}

export function writerPrompt(topic, approved, verifier, exclusions, lang) {
  return `You are the WRITER in a nutrition research pipeline. You receive ONLY studies the verifier approved. Do not look for more studies and do not add claims from general knowledge.

Write in ${L(lang)}, plain language:
1. summary: 6 to 8 short lines. Every claim ends with the citation number(s) of the study it comes from, like [1] or [2,3]. For observational studies say it is an association, not causation.
2. controversies: contradictions the verifier noted between studies (empty array if none).
3. menuSuggestion: ONE practical change to a weekly menu based on these findings. It must NOT include any of these excluded foods/groups: ${exclusions.length ? exclusions.join(', ') : 'none'}.
4. Do not give medical advice; this is reading material and the decision is the person's.
If the approved studies are not enough to say something, say so instead of filling in.
Reply with only JSON: {"summary": [string], "controversies": [string], "menuSuggestion": string}

Topic: """${topic}"""
Overall confidence (from the verifier): ${verifier.confidence} — ${verifier.confidenceReason}
APPROVED STUDIES:
${approved.map((s, i) => `[${i + 1}] ${s.title} — ${s.journal} ${s.year}. Type: ${s.studyType}. Sample: ${s.sample}. Claim: ${s.claim}${s.causalityNote ? `. Note: ${s.causalityNote}` : ''}`).join('\n')}`;
}

// ── Local corpus (curated library) — used where the web cannot be reached ──
const TOPIC_WORDS = {
  fiber: /fib(er|re)|סיב|prebiotic|פרה-?ביוט|constipation|עצירות|bowel|יציאות/i, microbiome: /microbio|מיקרוביו|gut|מעי|ferment|מותסס|probiotic|פרוביוט/i,
  upf: /ultra|processed|nova|מעובד/i, polyphenols: /polyphenol|פוליפנול|olive|זית|cocoa|קקאו|tea|תה|berr|פירות יער/i, cardiovascular: /heart|cardio|לב|cholesterol|כולסטרול|blood pressure|לחץ דם/i,
  sodium: /salt|sodium|מלח|נתרן|blood pressure|לחץ דם/i, blood_pressure: /blood pressure|hypertens|לחץ דם|יתר לחץ/i, protein: /protein|חלבון|muscle|שריר|exercise|אימון/i, longevity: /longevity|aging|ageing|אריכות|הזדקנות|mortality|תמותה/i,
  metabolic: /diabet|סוכרת|glucose|סוכר|insulin|אינסולין|metabolic|מטבולי|weight|משקל/i, glucose: /glucose|סוכר בדם|glyc|גליקמ/i, wholegrain: /whole ?grain|דגנים מלאים|דגן מלא/i,
  nuts: /nut|אגוז|almond|שקד/i, legumes: /legum|קטני|lentil|עדש|bean|שעועית|chickpea|חומוס/i, olive_oil: /olive|זית/i, red_meat: /meat|בשר/i, sugar: /sugar|סוכר/i,
};
export function localCandidates(topic) {
  const hits = Object.entries(TOPIC_WORDS).filter(([, re]) => re.test(topic)).map(([k]) => k);
  const words = String(topic).toLowerCase().split(/[^a-z֐-׿]+/).filter((w) => w.length > 3);
  return REFERENCES.map((r) => {
    let s = r.topics.filter((tp) => hits.includes(tp)).length * 3;
    for (const w of words) { if (r.title.toLowerCase().includes(w)) s += 2; else if (r.findings.toLowerCase().includes(w)) s += 1; }
    return { r, s };
  }).filter((x) => x.s > 0).sort((a, b) => b.s - a.s || b.r.year - a.r.year).slice(0, 14).map(({ r }) => ({
    id: r.id, title: r.title, journal: r.journal, year: r.year, doi: r.doi, url: refLink(r), types: [r.design], findings: r.findings, n: r.n,
    curatedType: r.inference === 'causal' ? 'rct' : r.inference === 'association' ? 'observational' : /review|meta/i.test(r.design) ? 'review' : 'other',
    curated: r, source: 'library',
  }));
}

// ── Rule-based fallbacks (no AI) ─────────────────────────────────────────
const TYPE_OF = (types = [], text = '') => {
  const t = `${types.join(' ')} ${text}`.toLowerCase();
  if (/meta-analys|systematic review|umbrella/.test(t)) return 'review';
  if (/randomi[sz]ed|controlled trial|\brct\b/.test(t)) return 'rct';
  if (/cohort|cross-sectional|case-control|observational|prospective/.test(t)) return 'observational';
  return 'other';
};
const SAMPLE_RE = /(\d{1,3}(?:[,\s]\d{3})+|\d{2,7})\s*(participants|patients|adults|subjects|individuals|people|women|men|children|studies|trials|RCTs)/i;
function conclusionOf(abstract = '') {
  const m = abstract.match(/(?:CONCLUSIONS?|INTERPRETATION|Conclusion)s?\s*[:.]?\s*([^]*?)(?:\s[A-Z]{4,}[^a-z]*:|$)/);
  const txt = (m ? m[1] : abstract).trim();
  return (txt.match(/[^.]+\./) || [txt.slice(0, 220)])[0].trim();
}
export function rulePick(candidates) {
  // Candidates arrive in relevance order; design and recency only break near-ties.
  const scored = candidates.map((c, i) => ({ c, s: -i + 0.15 * (TYPE_OF(c.types, c.abstract) === 'review' ? 2 : TYPE_OF(c.types, c.abstract) === 'rct' ? 1 : 0) + (c.year >= new Date().getFullYear() - 3 ? 0.1 : 0) + (c.abstract || c.findings ? 0.05 : 0) }));
  return scored.sort((a, b) => b.s - a.s).slice(0, 8).map(({ c }) => ({
    id: c.id, studyType: c.curatedType || TYPE_OF(c.types, c.abstract), sample: c.n ? `n = ${c.n}` : (c.abstract?.match(SAMPLE_RE)?.[0] || 'uncertain'),
    claim: c.findings || conclusionOf(c.abstract), uncertain: !(c.findings || c.abstract),
  }));
}
export function ruleVerify(studies, lang = 'he') {
  const he = lang !== 'en';
  const rows = studies.map((s) => {
    const text = (s.sourceText || '').toLowerCase();
    const claimWords = (s.claim || '').toLowerCase().split(/\W+/).filter((w) => w.length > 5);
    const overlap = claimWords.length ? claimWords.filter((w) => text.includes(w)).length / claimWords.length : 0;
    const claimMatches = Boolean(s.linkOpened || s.source === 'library') && overlap >= 0.6;
    const verdict = !s.sourceText ? 'rejected' : claimMatches ? 'approved' : 'needs_correction';
    return { id: s.id, studyType: s.studyType, sample: s.sample, linkOpened: Boolean(s.linkOpened), claimMatches, causalityNote: s.studyType === 'observational' ? 'association' : '', contradicts: [], verdict, note: verdict === 'approved' ? (he ? 'הטענה מופיעה בטקסט המקור' : 'claim found in the source text') : verdict === 'rejected' ? (he ? 'אין טקסט מקור' : 'no source text') : (he ? 'הטענה לא נאמרת במפורש במקור' : 'claim not clearly stated in the source') };
  });
  const ok = rows.filter((r) => r.verdict === 'approved');
  const strong = ok.filter((r) => ['review', 'rct'].includes(r.studyType)).length;
  const opened = rows.every((r) => r.linkOpened);
  const confidence = !opened || ok.length < 3 ? 'low' : strong >= 2 ? 'high' : 'medium';
  return { rows, confidence, confidenceReason: !opened ? (he ? 'חלק מהקישורים או כולם לא נפתחו בזמן אמת' : 'some or all links were not opened live') : he ? `${strong} מתוך ${ok.length} המחקרים שאושרו הם סקירות או ניסויים מבוקרים` : `${strong} of ${ok.length} approved studies are reviews or RCTs` };
}

// ── Menu suggestion helpers ──────────────────────────────────────────────
/** Human-readable exclusions from the profile (diet + disliked foods + allergies). */
export function exclusionsOf(profile = {}, lang = 'he') {
  const out = new Set();
  const he = lang !== 'en';
  if (['vegan', 'vegetarian', 'pescatarian'].includes(profile.diet)) out.add(he ? 'בשר ועוף' : 'meat and poultry');
  if (['vegan', 'vegetarian'].includes(profile.diet)) out.add(he ? 'דגים' : 'fish');
  if (profile.diet === 'vegan') out.add(he ? 'מוצרי חלב וביצים' : 'dairy and eggs');
  for (const id of profile.dislikes || []) if (FOOD_MAP[id]) out.add(FOOD_MAP[id].name[he ? 'he' : 'en']);
  const fishAll = ['salmon', 'sardines', 'tuna', 'cod'].every((id) => (profile.dislikes || []).includes(id));
  const leafyAll = ['spinach', 'kale', 'arugula', 'romaine'].every((id) => (profile.dislikes || []).includes(id));
  if (fishAll) { ['salmon', 'sardines', 'tuna', 'cod'].forEach((id) => out.delete(FOOD_MAP[id].name[he ? 'he' : 'en'])); out.add(he ? 'דגים' : 'fish'); }
  if (leafyAll) { ['spinach', 'kale', 'arugula', 'romaine'].forEach((id) => out.delete(FOOD_MAP[id].name[he ? 'he' : 'en'])); out.add(he ? 'עלים ירוקים' : 'leafy greens'); }
  for (const a of profile.allergies || []) out.add(a);
  return [...out];
}
export const allowedFood = (id, profile) => Boolean(FOOD_MAP[id]) && foodIsAllowed(FOOD_MAP[id], profile);

/** Writer fallback without AI: one line per approved study, causality labels, a profile-safe suggestion. */
export function ruleWrite(topic, approved, verifier, profile, lang = 'he') {
  const he = lang !== 'en';
  const summary = approved.slice(0, 8).map((s, i) => `${s.claim}${s.studyType === 'observational' ? (he ? ' (קשר ולא סיבתיות)' : ' (association, not causation)') : ''} [${i + 1}]`);
  const tips = [
    [/fib(er|re)|סיב/i, ['lentils', 'chickpeas', 'oats', 'chia'], he ? 'להוסיף מנת קטניות (עדשים או חומוס) לארוחת הצהריים בשלושה ימים בשבוע.' : 'Add a legume portion (lentils or chickpeas) to lunch three days a week.'],
    [/olive|זית|polyphenol|פוליפנול/i, ['evoo'], he ? 'להשתמש בשמן זית כתית כשומן העיקרי בסלטים ובבישול.' : 'Use extra-virgin olive oil as the main fat for salads and cooking.'],
    [/nut|אגוז/i, ['walnuts', 'almonds'], he ? 'להוסיף חופן אגוזים (כ-28 ג׳) כחטיף יומי.' : 'Add a handful of nuts (~28 g) as a daily snack.'],
    [/ferment|מותסס|microbio|מיקרוביו/i, ['kefir', 'yogurt_plain', 'sauerkraut'], he ? 'להוסיף מנה של יוגורט טבעי או קפיר לארוחת הבוקר.' : 'Add a serving of plain yogurt or kefir to breakfast.'],
    [/salt|sodium|מלח|נתרן|blood pressure|לחץ דם/i, ['lemon_juice'], he ? 'להחליף חלק מהמלח בלימון ועשבי תיבול, ולבחור לחם ומוצרים מופחתי נתרן.' : 'Replace some salt with lemon and herbs, and choose lower-sodium bread and products.'],
  ];
  const tip = tips.find(([re, ids]) => re.test(topic) && ids.some((id) => allowedFood(id, profile)));
  return {
    summary: summary.length ? summary : [he ? 'אין מספיק מחקרים מאושרים כדי לסכם.' : 'Not enough approved studies to summarise.'],
    controversies: [],
    menuSuggestion: tip ? tip[2] : (he ? 'אין הצעה לשינוי בתפריט על סמך המחקרים שאושרו.' : 'No menu change can be suggested from the approved studies.'),
    automatic: true,
  };
}

/**
 * Coordinator. Runs searcher → verifier → writer through `steps` (server or page implementation)
 * and reports progress. Stops if fewer than MIN_APPROVED studies are approved.
 * steps: { search(topic) → {studies, mode, note}, verify(topic, studies) → {rows, confidence, confidenceReason, mode}, write(topic, approved, verifier) → {...} }
 */
export async function runAgent(topic, steps, onStep = () => {}) {
  const report = { topic, startedAt: new Date().toISOString(), stage: 'search' };
  try {
    onStep('search', 'running');
    const s = await steps.search(topic);
    report.search = s;
    onStep('search', 'done', s);
    if (!s.studies.length) { report.stopped = { stage: 'search', reason: s.note || 'no studies found' }; return finish(report); }

    report.stage = 'verify'; onStep('verify', 'running');
    const v = await steps.verify(topic, s.studies);
    report.verify = v;
    onStep('verify', 'done', v);
    const approvedIds = new Set(v.rows.filter((r) => r.verdict === 'approved').map((r) => r.id));
    const approved = s.studies.filter((st) => approvedIds.has(st.id)).map((st) => ({ ...st, ...v.rows.find((r) => r.id === st.id) }));
    report.counts = { found: s.studies.length, approved: approved.length, rejected: v.rows.filter((r) => r.verdict === 'rejected').length, needsCorrection: v.rows.filter((r) => r.verdict === 'needs_correction').length };
    report.unopened = v.rows.filter((r) => !r.linkOpened).length;
    if (approved.length < MIN_APPROVED) { report.stopped = { stage: 'verify', reason: 'fewer_than_3_approved' }; return finish(report); }

    report.stage = 'write'; onStep('write', 'running');
    const w = await steps.write(topic, approved, v);
    report.write = w; report.approved = approved;
    onStep('write', 'done', w);
    return finish(report);
  } catch (e) {
    report.stopped = { stage: report.stage, reason: 'error', message: String(e.message || e) };
    onStep(report.stage, 'failed', report.stopped);
    return finish(report);
  }
}
function finish(r) { r.finishedAt = new Date().toISOString(); return r; }
