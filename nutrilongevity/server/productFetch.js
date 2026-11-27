// Safe retrieval of user-supplied product URLs.
// SSRF protection: http(s) only, no credentials in URLs, every hostname (including each redirect hop)
// must resolve only to public IP addresses, at most 5 redirects, 12 s timeout, 4 MB size limit.
import dns from 'node:dns/promises';
import net from 'node:net';

const MAX_BYTES = 4 * 1024 * 1024;
const UA = 'Mozilla/5.0 (compatible; NutriLongevityAI/1.2; product label reader)';

export class FetchError extends Error { constructor(code, message, extra = {}) { super(message); this.code = code; Object.assign(this, extra); } }

function privateIp(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
  }
  const v = ip.toLowerCase();
  if (v.startsWith('::ffff:')) return privateIp(v.slice(7));
  return v === '::' || v === '::1' || v.startsWith('fc') || v.startsWith('fd') || v.startsWith('fe80') || v.startsWith('ff');
}

export async function assertPublicUrl(raw) {
  let u;
  try { u = new URL(raw); } catch { throw new FetchError('invalid_url', 'This is not a valid web address.'); }
  if (!['http:', 'https:'].includes(u.protocol)) throw new FetchError('invalid_url', 'Only http and https links are supported.');
  if (u.username || u.password) throw new FetchError('invalid_url', 'Links with embedded credentials are not supported.');
  const testBypass = process.env.NODE_ENV === 'test' && process.env.NL_TEST_ALLOW_PRIVATE_URLS === '1';
  if (testBypass) return u; // test-only: lets the suite read a sample page served from localhost
  if (u.port && !['80', '443', ''].includes(u.port)) throw new FetchError('blocked', 'Links to non-standard ports are not supported.');
  const host = u.hostname.replace(/^\[|\]$/g, '');
  if (/^localhost$|\.local$|\.internal$/i.test(host)) throw new FetchError('blocked', 'Local addresses are not allowed.');
  const addrs = net.isIP(host) ? [{ address: host }] : await dns.lookup(host, { all: true }).catch(() => { throw new FetchError('unreachable', 'The website could not be found (DNS lookup failed).'); });
  if (!addrs.length || addrs.some((a) => privateIp(a.address))) throw new FetchError('blocked', 'This address points to a private network and is not allowed.');
  return u;
}

/** Fetch a URL safely. Returns { finalUrl, status, contentType, buffer, retrievedAt }. Never throws without a code. */
export async function safeFetch(raw, { fetchImpl = fetch } = {}) {
  let url = await assertPublicUrl(raw);
  for (let hop = 0; hop <= 5; hop++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 12000);
    let res;
    try {
      res = await fetchImpl(url, { redirect: 'manual', signal: ctrl.signal, headers: { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml,application/pdf,image/*;q=0.8,*/*;q=0.5', 'Accept-Language': 'he,en;q=0.8' } });
    } catch (e) {
      clearTimeout(timer);
      throw new FetchError('unreachable', e.name === 'AbortError' ? 'The website did not respond in time.' : 'The website could not be reached.');
    }
    if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
      clearTimeout(timer);
      url = await assertPublicUrl(new URL(res.headers.get('location'), url).toString());
      continue;
    }
    try {
      if (!res.ok) throw new FetchError('http_error', `The website answered with HTTP ${res.status}${res.status === 403 || res.status === 401 ? ' (access denied — the site may block automated readers)' : ''}.`, { status: res.status });
      const len = Number(res.headers.get('content-length') || 0);
      if (len > MAX_BYTES) throw new FetchError('too_large', 'The page is too large to read.');
      const chunks = []; let size = 0;
      for await (const c of res.body) { size += c.length; if (size > MAX_BYTES) throw new FetchError('too_large', 'The page is too large to read.'); chunks.push(c); }
      return { finalUrl: url.toString(), status: res.status, contentType: (res.headers.get('content-type') || '').split(';')[0].trim().toLowerCase(), buffer: Buffer.concat(chunks), retrievedAt: new Date().toISOString() };
    } finally { clearTimeout(timer); }
  }
  throw new FetchError('unreachable', 'Too many redirects.');
}
