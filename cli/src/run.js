import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createApi, safeErrorMessage } from './api.js';
import { ConfigurationError } from './errors.js';

export { ConfigurationError } from './errors.js';

const terminal = new Set(['PASSED', 'FAILED', 'TIMED_OUT', 'CANCELLED']);
const runStatuses = new Set(['QUEUED', 'ASSIGNED', 'RUNNING', 'CLEANING', ...terminal]);
const matrixStatuses = new Set(['QUEUED', 'RUNNING', 'PASSED', 'FAILED', 'CANCELLED']);
const browsers = new Set(['chromium', 'firefox', 'webkit']);
const sharedOptions = { '--plan': 'plan', '--junit': 'junit', '--timeout': 'timeout', '--poll-interval': 'pollInterval', '--name': 'name', '--commit': 'commit' };
const help = 'platform run (--suite smoke|regression [--platform web|android|ios] [--browser chromium|firefox|webkit] | --plan ID) [--junit FILE] [--timeout SECONDS] [--poll-interval MS] [--name TEXT] [--commit SHA]\nplatform matrix --plan ID --browsers chromium,firefox[,webkit] [--junit FILE] [--timeout SECONDS] [--poll-interval MS] [--name TEXT] [--commit SHA]\nEnvironment: PLATFORM_URL, PLATFORM_TOKEN. Exit: 0 passed, 1 failed/timed out/cancelled, 2 configuration or API error.';

export function parseArgs(argv) {
  if (argv.includes('--help') || argv.length === 0) return { help: true };
  const command = argv[0];
  if (!['run', 'matrix'].includes(command)) throw new ConfigurationError('Expected command: platform run or platform matrix');
  const options = { command };
  const names = command === 'matrix' ? { ...sharedOptions, '--browsers': 'browsers' } : { ...sharedOptions, '--suite': 'suite', '--browser': 'browser', '--platform': 'platform' };
  for (let i = 1; i < argv.length; i++) {
    const key = Object.hasOwn(names, argv[i]) ? names[argv[i]] : undefined;
    if (!key) throw new ConfigurationError(`Unsupported option for ${command}`);
    if (!argv[i + 1]?.trim() || argv[i + 1].startsWith('--') || options[key] !== undefined) throw new ConfigurationError(`Invalid or duplicate option: ${argv[i]}`);
    options[key] = argv[++i];
  }
  if (command === 'matrix') {
    if (!options.plan || !options.browsers) throw new ConfigurationError('matrix requires --plan and --browsers');
    const selected = options.browsers.split(',').map(value => value.trim());
    if (selected.some(value => !browsers.has(value))) throw new ConfigurationError('--browsers supports chromium, firefox, webkit');
    options.browsers = [...new Set(selected)];
    if (options.browsers.length < 2) throw new ConfigurationError('--browsers requires at least two distinct browsers');
  } else {
    if (!!options.suite === !!options.plan) throw new ConfigurationError('Choose exactly one of --suite or --plan');
    if (options.suite && !['smoke', 'regression'].includes(options.suite)) throw new ConfigurationError('--suite supports smoke or regression');
    if (options.browser && !browsers.has(options.browser)) throw new ConfigurationError('--browser supports chromium, firefox, webkit');
    if (options.platform && !['web', 'android', 'ios'].includes(options.platform)) throw new ConfigurationError('--platform supports web, android, ios');
    if (options.plan && (options.platform || options.browser)) throw new ConfigurationError('Plan capability requirements are configured on the platform');
  }
  for (const [name, fallback, min, max] of [['timeout', 900, 1, 86400], ['pollInterval', 1000, 100, 30000]]) {
    const value = options[name] === undefined ? fallback : Number(options[name]);
    if (!Number.isInteger(value) || value < min || value > max) throw new ConfigurationError(`Invalid --${name === 'pollInterval' ? 'poll-interval' : name}`);
    options[name] = value;
  }
  return options;
}

function validateExecution(execution, command, options, expectedId) {
  const statuses = command === 'matrix' ? matrixStatuses : runStatuses;
  if (!execution || typeof execution.id !== 'string' || !execution.id.trim() || !statuses.has(execution.status) || (expectedId && execution.id !== expectedId)) {
    throw new ConfigurationError(`Platform did not return a valid ${command} ID/status`);
  }
  if (command !== 'matrix') return;
  const validSummary = summary => summary && ['total', 'passed', 'failed'].every(key => Number.isInteger(summary[key]) && summary[key] >= 0)
    && summary.passed + summary.failed <= summary.total;
  if (!validSummary(execution.summary)) throw new ConfigurationError('Platform returned invalid matrix summary');
  if (!Array.isArray(execution.variants) || execution.variants.length !== options.browsers.length) throw new ConfigurationError('Platform returned invalid matrix targets');
  const labels = new Set(), runIds = new Set();
  for (const variant of execution.variants) {
    if (!variant || !options.browsers.includes(variant.label) || labels.has(variant.label) || typeof variant.runId !== 'string' || !variant.runId.trim() || runIds.has(variant.runId) || !runStatuses.has(variant.status) || !validSummary(variant.summary)) {
      throw new ConfigurationError('Platform returned invalid matrix targets');
    }
    labels.add(variant.label);
    runIds.add(variant.runId);
  }
  const allTerminal = execution.variants.every(variant => terminal.has(variant.status));
  if (terminal.has(execution.status) !== allTerminal) throw new ConfigurationError('Platform returned inconsistent matrix completion status');
  if (allTerminal) {
    const derivedStatus = execution.variants.some(variant => ['FAILED', 'TIMED_OUT'].includes(variant.status)) ? 'FAILED'
      : execution.variants.some(variant => variant.status === 'CANCELLED') ? 'CANCELLED' : 'PASSED';
    if (execution.status !== derivedStatus) throw new ConfigurationError('Platform returned inconsistent matrix result status');
  }
}

function resultCounts(execution) {
  return `${execution.summary?.passed ?? 0} passed, ${execution.summary?.failed ?? 0} failed, ${execution.summary?.total ?? execution.results?.length ?? 0} total`;
}

export async function runCommand(argv, env = process.env, { out = console.log, err = console.error, fetchImpl = fetch, sleep = ms => new Promise(resolve => setTimeout(resolve, ms)), now = Date.now } = {}) {
  try {
    const options = parseArgs(argv);
    if (options.help) { out(help); return 0; }
    const { base, request } = createApi(env, fetchImpl);
    const command = options.command;
    const resource = command === 'matrix' ? 'matrices' : 'runs';
    const title = command === 'matrix' ? 'Matrix' : 'Run';
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
    if (command === 'matrix') body.variants = options.browsers.map(browser => ({ label: browser, capabilities: { browser } }));
    let execution = await request(`/${resource}`, { method: 'POST', body });
    validateExecution(execution, command, options);
    const id = execution.id;
    const route = `/${resource}/${encodeURIComponent(id)}`;
    // Keep the human report URL visible even if polling or export subsequently fails.
    out(`${title} ${id}: ${execution.status}`);
    out(`Report: ${base}/#${route}`);
    const deadline = now() + options.timeout * 1000;
    let lastStatus = execution.status;
    const printTargets = () => {
      if (command !== 'matrix') return;
      for (const variant of execution.variants) {
        out(`${variant.label}: ${variant.status} (${resultCounts(variant)})`);
        out(`  Report: ${base}/#/runs/${encodeURIComponent(variant.runId)}`);
        if (variant.message) out(`  Message: ${safeErrorMessage(new Error(String(variant.message)), env)}`);
      }
    };
    printTargets();
    while (!terminal.has(execution.status)) {
      if (now() >= deadline) { err(`Timed out waiting for ${command} ${id}; the platform ${command} remains active. Use the portal to cancel it.`); return 1; }
      await sleep(Math.min(options.pollInterval, Math.max(0, deadline - now())));
      if (now() >= deadline) { err(`Timed out waiting for ${command} ${id}; the platform ${command} remains active. Use the portal to cancel it.`); return 1; }
      const previousTargets = command === 'matrix' ? JSON.stringify(execution.variants) : '';
      execution = await request(route);
      validateExecution(execution, command, options, id);
      if (execution.status !== lastStatus) { out(`${title} ${id}: ${execution.status}`); lastStatus = execution.status; }
      if (command === 'matrix' && JSON.stringify(execution.variants) !== previousTargets) printTargets();
    }
    if (options.junit) {
      const xml = await request(`${route}/junit`, { xml: true });
      const target = path.resolve(options.junit);
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, xml, 'utf8');
      out(`JUnit: ${target}`);
    }
    out(`${execution.status}: ${resultCounts(execution)}`);
    return execution.status === 'PASSED' ? 0 : 1;
  } catch (error) { err(safeErrorMessage(error, env)); return 2; }
}
