import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const terminal = new Set(['PASSED', 'FAILED', 'TIMED_OUT', 'CANCELLED']);
export class ConfigurationError extends Error {}

export function parseArgs(argv) {
  if (argv.includes('--help') || argv.length === 0) return { help: true };
  if (argv[0] !== 'run') throw new ConfigurationError('Expected command: platform run');
  const options = {};
  const names = { '--suite': 'suite', '--plan': 'plan', '--junit': 'junit', '--timeout': 'timeout', '--poll-interval': 'pollInterval', '--name': 'name', '--commit': 'commit', '--browser': 'browser', '--platform': 'platform' };
  for (let i = 1; i < argv.length; i++) {
    const key = names[argv[i]];
    if (!key || !argv[i + 1] || argv[i + 1].startsWith('--') || options[key] !== undefined) throw new ConfigurationError(`Invalid or duplicate option: ${argv[i]}`);
    options[key] = argv[++i];
  }
  if (!!options.suite === !!options.plan) throw new ConfigurationError('Choose exactly one of --suite or --plan');
  if (options.suite && !['smoke', 'regression'].includes(options.suite)) throw new ConfigurationError('--suite supports smoke or regression');
  if (options.browser && !['chromium', 'firefox', 'webkit'].includes(options.browser)) throw new ConfigurationError('--browser supports chromium, firefox, webkit');
  if (options.platform && !['web', 'android', 'ios'].includes(options.platform)) throw new ConfigurationError('--platform supports web, android, ios');
  if (options.plan && (options.platform || options.browser)) throw new ConfigurationError('Plan capability requirements are configured on the platform');
  for (const [name, fallback, min, max] of [['timeout', 900, 1, 86400], ['pollInterval', 1000, 100, 30000]]) {
    const value = options[name] === undefined ? fallback : Number(options[name]);
    if (!Number.isInteger(value) || value < min || value > max) throw new ConfigurationError(`Invalid --${name === 'pollInterval' ? 'poll-interval' : name}`);
    options[name] = value;
  }
  return options;
}

export async function runCommand(argv, env = process.env, { out = console.log, err = console.error, fetchImpl = fetch, sleep = ms => new Promise(resolve => setTimeout(resolve, ms)), now = Date.now } = {}) {
  try {
    const options = parseArgs(argv);
    if (options.help) { out('platform run (--suite smoke|regression [--platform web|android|ios] [--browser chromium|firefox|webkit] | --plan ID) [--junit FILE] [--timeout SECONDS] [--poll-interval MS] [--name TEXT] [--commit SHA]\nEnvironment: PLATFORM_URL, PLATFORM_TOKEN. Exit: 0 passed, 1 failed/timed out/cancelled, 2 configuration or API error.'); return 0; }
    if (!env.PLATFORM_TOKEN?.trim()) throw new ConfigurationError('PLATFORM_TOKEN is required; obtain a bearer token through /api/auth/login');
    let parsed;
    try { parsed = new URL(env.PLATFORM_URL || 'http://localhost:8080'); } catch { throw new ConfigurationError('Invalid PLATFORM_URL'); }
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password || parsed.search || parsed.hash) throw new ConfigurationError('PLATFORM_URL must be an HTTP(S) URL without credentials, query, or fragment');
    const base = parsed.toString().replace(/\/$/, '');
    async function request(route, { method = 'GET', body, xml = false } = {}) {
      const response = await fetchImpl(`${base}/api${route}`, { method, headers: { Authorization: `Bearer ${env.PLATFORM_TOKEN}`, ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(30000) });
      const text = await response.text();
      if (!response.ok) {
        let detail = 'request failed'; try { detail = JSON.parse(text).message || detail; } catch {}
        throw new ConfigurationError(`Platform HTTP ${response.status}: ${detail}`);
      }
      if (xml) return text;
      try { return JSON.parse(text); } catch { throw new ConfigurationError('Platform returned invalid JSON'); }
    }
    let body = { name: options.name, commitSha: options.commit || env.GITHUB_SHA || '' };
    if (options.plan) body.planId = options.plan;
    else {
      const cases = await request('/cases');
      const approved = cases.filter(testCase => testCase.suite === options.suite && testCase.status === 'APPROVED' && (!options.platform || testCase.platform === options.platform));
      if (!approved.length) throw new ConfigurationError(`No approved cases in suite ${options.suite}`);
      const platforms = [...new Set(approved.map(testCase => testCase.platform))];
      if (platforms.length !== 1) throw new ConfigurationError('Suite contains multiple platforms; select --platform or create a capability-specific plan');
      if (options.browser && platforms[0] !== 'web') throw new ConfigurationError('--browser requires web cases');
      body.caseIds = approved.map(testCase => testCase.id);
      body.capabilities = { platform: platforms[0], browser: platforms[0] === 'web' ? options.browser || 'chromium' : '', provider: 'local', tags: [] };
      body.name ||= `${options.suite} (${platforms[0]})`;
    }
    let run = await request('/runs', { method: 'POST', body });
    if (!run.id || !run.status) throw new ConfigurationError('Platform did not return a run ID/status');
    // Keep the human report URL visible even if polling or export subsequently fails.
    out(`Run ${run.id}: ${run.status}`);
    out(`Report: ${base}/#/runs/${encodeURIComponent(run.id)}`);
    const deadline = now() + options.timeout * 1000;
    let lastStatus = run.status;
    while (!terminal.has(run.status)) {
      if (now() >= deadline) { err(`Timed out waiting for run ${run.id}; the platform run remains active. Use the portal to cancel it.`); return 1; }
      await sleep(options.pollInterval);
      run = await request(`/runs/${encodeURIComponent(run.id)}`);
      if (run.status !== lastStatus) { out(`Run ${run.id}: ${run.status}`); lastStatus = run.status; }
    }
    if (options.junit) {
      const xml = await request(`/runs/${encodeURIComponent(run.id)}/junit`, { xml: true });
      const target = path.resolve(options.junit);
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, xml, 'utf8');
      out(`JUnit: ${target}`);
    }
    out(`${run.status}: ${run.summary?.passed ?? 0} passed, ${run.summary?.failed ?? 0} failed, ${run.summary?.total ?? run.results?.length ?? 0} total`);
    return run.status === 'PASSED' ? 0 : 1;
  } catch (error) { err(error.message); return 2; }
}
