import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assertPublicUrl } from '../server/productFetch.js';

test('SSRF protection rejects private and non-http targets', async () => {
  for (const u of ['http://127.0.0.1/x', 'http://localhost/', 'http://10.0.0.5/', 'http://192.168.1.1/', 'http://169.254.169.254/latest/meta-data', 'file:///etc/passwd', 'ftp://example.com', 'http://user:pw@example.com/', 'http://[::1]/', 'http://example.com:8080/']) {
    await assert.rejects(assertPublicUrl(u), (e) => ['blocked', 'invalid_url', 'unreachable'].includes(e.code), u);
  }
});

