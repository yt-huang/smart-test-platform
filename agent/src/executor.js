import { mkdir, mkdtemp, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { lookup } from 'node:dns/promises';
import { browserTypes } from './browsers.js';

const actions = new Set(['goto', 'click', 'fill', 'expectText', 'expectVisible', 'screenshot']);
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const message = error => error?.message || String(error);

export function validateCase(testCase, expected = { platform: 'web', framework: 'playwright' }) {
  if (!testCase || typeof testCase.id !== 'string' || typeof testCase.name !== 'string') throw new Error('Case requires id and name');
  if (testCase.platform !== expected.platform || testCase.framework !== expected.framework) throw new Error(`Unsupported execution: ${testCase.platform}/${testCase.framework}; target requires ${expected.platform}/${expected.framework}`);
  if (testCase.status !== 'APPROVED') throw new Error('Only human-approved cases may execute');
  if (!Array.isArray(testCase.steps) || !testCase.steps.length || testCase.steps.length > 500) throw new Error('Case requires 1-500 structured steps');
  for (const step of testCase.steps) {
    if (!step || !actions.has(step.action)) throw new Error(`Unsupported step action: ${step?.action}`);
    if (step.action !== 'screenshot' && (typeof step.target !== 'string' || !step.target.trim() || step.target.length > 4096)) throw new Error(`${step.action} requires a target of at most 4096 characters`);
    if (['fill', 'expectText'].includes(step.action) && (typeof step.value !== 'string' || step.value.length > 10000)) throw new Error(`${step.action} requires a text value of at most 10000 characters`);
    if (step.action === 'goto') {
      const url = new URL(step.target);
      if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('goto only supports HTTP(S) URLs without embedded credentials');
    }
  }
}

function privateAddress(address) {
  const ip = address.toLowerCase().replace(/^\[|\]$/g, '');
  if (ip.includes(':')) {
    if (ip.startsWith('::ffff:')) return privateAddress(ip.slice(7));
    return ip === '::' || ip === '::1' || /^f[cd]/.test(ip) || /^fe[89ab]/.test(ip);
  }
  const [a, b] = ip.split('.').map(Number);
  return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
}

export async function checkUrlAllowed(url, allowPrivateNetwork) {
  const parsed = new URL(url);
  if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('Only HTTP(S) network requests are allowed');
  if (allowPrivateNetwork) return;
  const host = parsed.hostname.replace(/^\[|\]$/g, '');
  const addresses = await lookup(host, { all: true });
  if (!addresses.length || addresses.some(item => privateAddress(item.address))) throw new Error('Private network access requires AGENT_ALLOW_PRIVATE_NETWORK=true on this trusted agent');
}

export async function executeAssignment({ assignment, target, config, signal, upload, progress = () => {} }) {
  const started = Date.now();
  const timeoutSeconds = assignment.run.executionTimeoutSeconds ?? config.executionTimeoutSeconds;
  const controller = new AbortController();
  const forwardAbort = () => controller.abort(signal?.reason || new Error('Execution cancelled'));
  signal?.addEventListener('abort', forwardAbort, { once: true });
  if (signal?.aborted) forwardAbort();
  const timer = setTimeout(() => controller.abort(new Error('Execution timeout exceeded')), Math.min(86400, Math.max(1, timeoutSeconds)) * 1000);
  const logs = [], results = [], evidenceFiles = [], infrastructureErrors = new Set();
  let browser, context, contextClose, browserClose, cleanupOk = true, directory;
  const log = line => { if (logs.length < 2000) logs.push(`${new Date().toISOString()} ${String(line).slice(0, 4000)}`); };
  const abortError = () => controller.signal.reason instanceof Error ? controller.signal.reason : new Error(String(controller.signal.reason || 'Execution cancelled'));
  const assertActive = () => { if (controller.signal.aborted) throw abortError(); };
  const closeContext = () => {
    if (!context) return Promise.resolve();
    return contextClose ||= context.close({ reason: controller.signal.aborted ? message(abortError()) : 'Case completed' });
  };
  const closeBrowser = () => {
    if (!browser) return Promise.resolve();
    return browserClose ||= browser.close();
  };
  // Close the current context first; concurrently killing its browser makes context.close()
  // reject before we can verify cleanup. The finally block closes the browser after context shutdown.
  const interrupt = () => { if (context) closeContext().catch(() => {}); else closeBrowser().catch(() => {}); };
  controller.signal.addEventListener('abort', interrupt, { once: true });
  try {
    await mkdir(config.artifactsDir, { recursive: true });
    directory = await mkdtemp(path.join(config.artifactsDir, 'task-'));
    if (!target || target.platform !== 'web' || !browserTypes[target.browser]) throw new Error('Assigned target is unavailable or has no supported browser executor');
    assertActive();
    browser = await browserTypes[target.browser].launch({ headless: config.headless, timeout: config.stepTimeoutMs });
    assertActive();
    for (const [caseIndex, testCase] of assignment.cases.entries()) {
      const caseStarted = Date.now();
      const result = { caseId: testCase.id, name: testCase.name, status: 'PASSED', durationMs: 0, error: null, steps: [], evidence: [] };
      results.push(result);
      context = undefined; contextClose = undefined;
      const prefix = `case-${caseIndex + 1}`;
      let page, video, traceStarted = false;
      try {
        assertActive();
        try { validateCase(testCase); }
        catch (error) { infrastructureErrors.add('CASE_VALIDATION_FAILED'); throw error; }
        progress(`Running ${testCase.name}`); log(`Case started: ${testCase.name}`);
        try {
          context = await browser.newContext({ recordVideo: { dir: directory }, viewport: { width: 1280, height: 720 }, acceptDownloads: false });
          assertActive();
          context.setDefaultTimeout(config.stepTimeoutMs);
          context.setDefaultNavigationTimeout(config.stepTimeoutMs);
          await context.route('**/*', async route => {
            try { await checkUrlAllowed(route.request().url(), config.allowPrivateNetwork); await route.continue(); }
            catch (error) { log(`Request blocked: ${message(error)}`); await route.abort('blockedbyclient').catch(() => {}); }
          });
          await context.tracing.start({ screenshots: true, snapshots: true, sources: true }); traceStarted = true;
          page = await context.newPage(); video = page.video();
        } catch (error) { infrastructureErrors.add('EXECUTOR_FAILED'); throw error; }
        page.on('crash', () => infrastructureErrors.add('EXECUTOR_FAILED'));
        page.on('console', item => log(`console.${item.type()}: ${item.text()}`));
        page.on('pageerror', error => log(`pageerror: ${message(error)}`));
        page.on('requestfailed', request => log(`requestfailed: ${request.url()} ${request.failure()?.errorText}`));
        for (const [index, step] of testCase.steps.entries()) {
          assertActive();
          const stepStarted = Date.now();
          const outcome = { index, action: step.action, target: step.target || '', status: 'PASSED', durationMs: 0 };
          result.steps.push(outcome);
          try {
            await performStep(page, step, config, controller.signal, async () => {
              const file = path.join(directory, `${prefix}-step-${index + 1}.png`);
              if (step.target) await page.locator(step.target).screenshot({ path: file });
              else await page.screenshot({ path: file, fullPage: true });
              evidenceFiles.push({ file, result });
            });
            log(`${testCase.name} step ${index + 1} ${step.action}: passed`);
          } catch (error) { outcome.status = 'FAILED'; outcome.error = message(error); throw error; }
          finally { outcome.durationMs = Date.now() - stepStarted; }
        }
        const file = path.join(directory, `${prefix}-complete.png`);
        await page.screenshot({ path: file, fullPage: true }); evidenceFiles.push({ file, result });
      } catch (error) {
        if (browser && !browser.isConnected()) infrastructureErrors.add('EXECUTOR_FAILED');
        result.status = 'FAILED'; result.error = controller.signal.aborted ? message(abortError()) : message(error);
        log(`${testCase.name}: ${result.error}`);
        if (page && !page.isClosed()) {
          const file = path.join(directory, `${prefix}-failure.png`);
          await page.screenshot({ path: file, fullPage: true, timeout: 3000 }).then(() => evidenceFiles.push({ file, result })).catch(() => {});
        }
      } finally {
        if (traceStarted) {
          const file = path.join(directory, `${prefix}-trace.zip`);
          await context.tracing.stop({ path: file }).then(() => evidenceFiles.push({ file, result })).catch(error => { infrastructureErrors.add('EXECUTOR_FAILED'); log(`Trace could not finalize: ${message(error)}`); });
        }
        await closeContext().catch(error => { cleanupOk = false; log(`Context cleanup failed: ${message(error)}`); });
        if (context?.pages().length) { cleanupOk = false; log('Context still has open pages after close'); }
        if (video) await video.path().then(file => evidenceFiles.push({ file, result })).catch(error => { infrastructureErrors.add('EXECUTOR_FAILED'); log(`Video could not finalize: ${message(error)}`); });
        result.durationMs = Date.now() - caseStarted;
      }
    }
  } catch (error) {
    infrastructureErrors.add('EXECUTOR_FAILED');
    for (const testCase of assignment.cases || []) {
      if (!results.some(result => result.caseId === testCase.id)) results.push({ caseId: testCase.id, name: testCase.name, status: 'FAILED', durationMs: 0, error: controller.signal.aborted ? message(abortError()) : message(error), steps: [], evidence: [] });
    }
    log(`Execution failed: ${message(error)}`);
  } finally {
    progress('Cleaning browser resources');
    await closeContext().catch(error => { cleanupOk = false; log(`Context cleanup failed: ${message(error)}`); });
    await closeBrowser().catch(error => { cleanupOk = false; log(`Browser cleanup failed: ${message(error)}`); });
    if (browser?.isConnected()) { cleanupOk = false; log('Browser still connected after close'); }
    clearTimeout(timer);
    signal?.removeEventListener('abort', forwardAbort);
    controller.signal.removeEventListener('abort', interrupt);
  }
  let uploadsOk = true;
  if (controller.signal.aborted) infrastructureErrors.add('EXECUTION_ABORTED');
  if (!cleanupOk && results.length) {
    const last = results.at(-1); last.status = 'FAILED'; last.error = `${last.error ? `${last.error}; ` : ''}Browser resource cleanup failed; target quarantined`;
  }
  if (directory) {
    const logFile = path.join(directory, 'execution.log');
    await writeFile(logFile, logs.join('\n'), 'utf8');
    if (results.length) evidenceFiles.push({ file: logFile, result: results[0] });
    for (const item of evidenceFiles) {
      try { item.result.evidence.push(await upload(item.file)); }
      catch (error) { infrastructureErrors.add('EVIDENCE_UPLOAD_FAILED'); uploadsOk = false; item.result.status = 'FAILED'; item.result.error = `${item.result.error ? `${item.result.error}; ` : ''}Evidence upload failed: ${message(error)}`; log(`Evidence upload failed: ${path.basename(item.file)} ${message(error)}`); }
    }
    // Only remove the generated child directory after all evidence is safely stored and browser closure is verified.
    if (cleanupOk && uploadsOk && path.dirname(directory) === path.resolve(config.artifactsDir)) await rm(directory, { recursive: true, force: true }).catch(error => log(`Artifact cleanup failed: ${message(error)}`));
  }
  return { type: 'done', taskId: assignment.taskId, status: results.length && infrastructureErrors.size === 0 && results.every(result => result.status === 'PASSED') ? 'PASSED' : 'FAILED', results, logs, cleanupOk, infrastructureErrors: [...infrastructureErrors], durationMs: Date.now() - started };
}

async function performStep(page, step, config, signal, screenshot) {
  switch (step.action) {
    case 'goto': await checkUrlAllowed(step.target, config.allowPrivateNetwork); await page.goto(step.target, { waitUntil: 'domcontentloaded' }); break;
    case 'click': await page.locator(step.target).click(); break;
    case 'fill': await page.locator(step.target).fill(step.value); break;
    case 'expectVisible': await page.locator(step.target).waitFor({ state: 'visible' }); break;
    case 'expectText': {
      const locator = page.locator(step.target);
      await locator.waitFor({ state: 'visible' });
      const deadline = Date.now() + config.stepTimeoutMs;
      let actual = '';
      do {
        if (signal.aborted) throw signal.reason;
        actual = await locator.textContent();
        if ((actual || '').includes(step.value)) return;
        await delay(100);
      } while (Date.now() < deadline);
      throw new Error(`Expected ${step.target} to contain ${JSON.stringify(step.value)}, received ${JSON.stringify(actual)}`);
    }
    case 'screenshot': await screenshot(); break;
    default: throw new Error(`Unsupported action ${step.action}`);
  }
}
