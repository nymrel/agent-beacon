/** Validate outbound HTTP targets without adding a runtime dependency. */

import { URL } from 'node:url';

export function requireHttpUrl(value: string, label = 'URL'): URL {
  const candidate = value.trim();
  if (!/^https?:\/\/[^/]/i.test(candidate)) {
    throw new TypeError(`${label} must be an absolute HTTP(S) URL`);
  }

  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch (error) {
    throw new TypeError(`${label} must be an absolute HTTP(S) URL`, { cause: error });
  }

  if ((parsed.protocol !== 'http:' && parsed.protocol !== 'https:') || !parsed.hostname) {
    throw new TypeError(`${label} must be an absolute HTTP(S) URL`);
  }
  if (parsed.username || parsed.password) {
    throw new TypeError(`${label} must not contain embedded credentials`);
  }

  return parsed;
}

export function normalizeHttpBaseUrl(value: string, label = 'Base URL'): string {
  const parsed = requireHttpUrl(value, label);
  if (parsed.search || parsed.hash) {
    throw new TypeError(`${label} must not contain a query string or fragment`);
  }
  return parsed.toString().replace(/\/+$/, '');
}
