import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeHttpBaseUrl, requireHttpUrl } from '../dist/utils/http-url.js';

test('HTTP target validation accepts only credential-free HTTP(S) URLs', () => {
  assert.equal(requireHttpUrl('https://example.com/hooks/abc').protocol, 'https:');
  assert.equal(normalizeHttpBaseUrl('http://127.0.0.1:8765/'), 'http://127.0.0.1:8765');

  for (const candidate of [
    'file:///tmp/beacon',
    'ftp://example.com/beacon',
    'http:///missing-host',
    'http://user:secret@example.com',
  ]) {
    assert.throws(() => requireHttpUrl(candidate), /HTTP\(S\)|credentials/);
  }

  assert.throws(
    () => normalizeHttpBaseUrl('https://example.com/base?token=secret'),
    /query string or fragment/,
  );
});
