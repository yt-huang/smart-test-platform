import { ConfigurationError } from './errors.js';

export function safeErrorMessage(error, env) {
  let message = error instanceof Error ? error.message : 'Unexpected CLI error';
  const token = env.PLATFORM_TOKEN;
  for (const secret of new Set([token, token?.trim()].filter(Boolean))) message = message.split(secret).join('[REDACTED]');
  return message
    .replace(/Bearer\s+[^\s"',;]+/gi, 'Bearer [REDACTED]')
    .replace(/(https?:\/\/)[^\s/]+@/gi, '$1[REDACTED]@')
    .replace(/(["']?(?:password|passwd|(?:access[_-]?|refresh[_-]?)?token|secret|api[_-]?key)["']?\s*[=:]\s*)(?:"[^"]*"|'[^']*'|[^\s,;&}]+)/gi, '$1[REDACTED]')
    .replace(/[\r\n\x00-\x1f\x7f]/g, ' ')
    .slice(0, 500);
}

export function createApi(env, fetchImpl) {
  if (!env.PLATFORM_TOKEN?.trim()) throw new ConfigurationError('PLATFORM_TOKEN is required; obtain a bearer token through /api/auth/login');
  const token = env.PLATFORM_TOKEN.trim();
  if (/[\x00-\x1f\x7f]/.test(token)) throw new ConfigurationError('Invalid PLATFORM_TOKEN');
  let parsed;
  try { parsed = new URL(env.PLATFORM_URL || 'http://localhost:8080'); } catch { throw new ConfigurationError('Invalid PLATFORM_URL'); }
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new ConfigurationError('PLATFORM_URL must be an HTTP(S) URL without credentials, query, or fragment');
  }
  const base = parsed.toString().replace(/\/+$/, '');
  async function request(route, { method = 'GET', body, xml = false } = {}) {
    let response;
    try {
      response = await fetchImpl(`${base}/api${route}`, {
        method,
        headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
        body: body ? JSON.stringify(body) : undefined,
        // Never forward a bearer token through a redirect, including cross-origin redirects.
        redirect: 'error',
        signal: AbortSignal.timeout(30000)
      });
    } catch {
      throw new ConfigurationError('Platform request failed; check PLATFORM_URL, connectivity, and redirects');
    }
    if (response.redirected || (response.status >= 300 && response.status < 400)) {
      throw new ConfigurationError('Platform redirects are not allowed; configure PLATFORM_URL to the final platform root');
    }
    const text = await response.text();
    if (!response.ok) {
      let detail = 'request failed';
      try { const message = JSON.parse(text).message; if (typeof message === 'string' && message.trim()) detail = message; } catch {}
      throw new ConfigurationError(`Platform HTTP ${response.status}: ${detail}`);
    }
    if (xml) return text;
    try { return JSON.parse(text); } catch { throw new ConfigurationError('Platform returned invalid JSON'); }
  }
  return { base, request };
}
