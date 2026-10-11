import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, mkdtemp, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { validateCase, checkUrlAllowed } from './executor.js';

const exec = promisify(execFile);
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const errorMessage = error => error?.message || String(error);
const elementKey = 'element-6066-11e4-a52e-4f735466cecf';

export class WebDriverError extends Error {
  constructor(error, message) { super(message); this.error = error; }
}

export class AndroidSession {
  constructor(config, target, { fetchImpl = fetch, adb = async args => (await exec('adb', args, { timeout: 20000 })).stdout.trim() } = {}) {
    Object.assign(this, { config, target, fetchImpl, adb });
    this.id = null; this.closePromise = null; this.creationUncertain = false;
  }

  async request(route, { method = 'GET', body, signal, timeoutMs = 30000 } = {}) {
    const response = await this.fetchImpl(`${this.config.appiumUrl}${route}`, {
      method, headers: { 'Content-Type': 'application/json', ...(this.config.appiumToken ? { Authorization: `Bearer ${this.config.appiumToken}` } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body), signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)]) : AbortSignal.timeout(timeoutMs)
    });
    let payload;
    try { payload = await response.json(); } catch { throw new WebDriverError('invalid response', 'Appium returned a non-JSON response'); }
    if (!response.ok || payload.value?.error) throw new WebDriverError(payload.value?.error || 'unknown error', payload.value?.message || `Appium HTTP ${response.status}`);
    return payload.value;
  }

  async ensureFree() {
    const status = await this.request('/status');
    if (status?.ready === false) throw new Error('Appium server is not ready');
    const sessions = await this.request('/sessions');
    if (!Array.isArray(sessions)) throw new Error('Appium must support active session enumeration for safe device probing');
    for (const session of sessions) {
      const serial = session.capabilities?.['appium:udid'] || session.capabilities?.udid;
      if (!serial || serial === this.target.serial) throw new Error('An active or unidentified Appium session prevents a safe clean-device probe');
    }
  }

  async create(signal) {
    if (!this.config.appiumUrl || !this.target.serial) throw new Error('An Appium endpoint and a real ADB device serial are required');
    if (!this.config.androidBrowser && (!this.config.androidPackage || !this.config.androidActivity)) throw new Error('Configure an Android package/activity or AGENT_ANDROID_BROWSER=Chrome');
    // A changed/unhealthy server or a foreign session means the resource is no longer known clean.
    this.creationUncertain = true;
    await this.ensureFree();
    if (signal?.aborted) throw signal.reason;
    const capabilities = { platformName: 'Android', 'appium:automationName': 'UiAutomator2', 'appium:udid': this.target.serial,
      'appium:deviceName': this.target.name, 'appium:noReset': false, 'appium:newCommandTimeout': 60,
      ...(this.config.androidBrowser ? { browserName: 'Chrome' } : { 'appium:appPackage': this.config.androidPackage, 'appium:appActivity': this.config.androidActivity }) };
    // Do not abort the create request halfway through: retain its session ID so cancellation can clean it.
    // A lost creation response is an uncertain lease and must remain quarantined.
    const created = await this.request('/session', { method: 'POST', body: { capabilities: { alwaysMatch: capabilities, firstMatch: [{}] } }, timeoutMs: 90000 });
    if (!created?.sessionId) throw new Error('Appium did not return a W3C session ID');
    this.id = created.sessionId; this.creationUncertain = false;
    if (signal?.aborted) throw signal.reason;
  }

  command(route, options) {
    if (!this.id) throw new Error('No Appium session is active');
    return this.request(`/session/${encodeURIComponent(this.id)}${route}`, options);
  }

  async close() {
    return this.closePromise ||= this.closeVerified();
  }

  async closeVerified() {
    if (this.creationUncertain) throw new Error('Appium session creation was uncertain; device must remain quarantined');
    if (!this.id) return;
    const id = this.id;
    await this.request(`/session/${encodeURIComponent(id)}`, { method: 'DELETE' });
    let gone = false;
    try { await this.request(`/session/${encodeURIComponent(id)}/timeouts`); }
    catch (error) { if (error.error === 'invalid session id') gone = true; else throw error; }
    if (!gone) throw new Error('Appium session remains active after DELETE');
    const packageName = this.config.androidBrowser ? 'com.android.chrome' : this.config.androidPackage;
    const state = await this.adb(['-s', this.target.serial, 'get-state']);
    if (state !== 'device') throw new Error('ADB device is not connected after Appium cleanup');
    await this.adb(['-s', this.target.serial, 'shell', 'am', 'force-stop', packageName]);
    const cleared = await this.adb(['-s', this.target.serial, 'shell', 'pm', 'clear', packageName]);
    if (cleared !== 'Success') throw new Error('Android test application data did not reset successfully');
    // get-state and successful force-stop/reset provide hardware confirmation beyond deleting a remote lease.
    this.id = null;
  }

  async find(target, signal) {
    const selector = selectorFor(target, !!this.config.androidBrowser);
    const deadline = Date.now() + this.config.stepTimeoutMs;
    do {
      if (signal?.aborted) throw signal.reason;
      try {
        const found = await this.command('/element', { method: 'POST', body: selector, signal });
        const id = found?.[elementKey];
        if (!id) throw new Error('Appium did not return a W3C element reference');
        const displayed = await this.command(`/element/${encodeURIComponent(id)}/displayed`, { signal });
        if (displayed) return id;
      } catch (error) { if (!['no such element', 'stale element reference'].includes(error.error)) throw error; }
      await sleep(100);
    } while (Date.now() < deadline);
    throw new Error(`Element not visible: ${target}`);
  }
}

export function selectorFor(target, browser) {
  const prefixes = [['accessibility:', 'accessibility id'], ['id:', 'id'], ['xpath:', 'xpath'], ['css:', 'css selector']];
  for (const [prefix, using] of prefixes) if (target.startsWith(prefix)) return { using, value: target.slice(prefix.length) };
  return { using: browser ? 'css selector' : 'id', value: target };
}

export async function probeAndroidTarget(config, target, dependencies) {
  const session = new AndroidSession(config, target, dependencies);
  try { await session.create(); await session.close(); return true; }
  catch { await session.close().catch(() => {}); return false; }
}

export async function executeAndroidAssignment({ assignment, target, config, signal, upload, progress = () => {}, dependencies }) {
  await mkdir(config.artifactsDir, { recursive: true });
  const directory = await mkdtemp(path.join(config.artifactsDir, 'android-'));
  const controller = new AbortController();
  const cancelled = () => controller.abort(signal?.reason || new Error('Execution cancelled'));
  signal?.addEventListener('abort', cancelled, { once: true }); if (signal?.aborted) cancelled();
  const timer = setTimeout(() => controller.abort(new Error('Execution timeout exceeded')), (assignment.run.executionTimeoutSeconds || config.executionTimeoutSeconds) * 1000);
  const results = [], logs = [], files = [];
  let cleanupOk = true;
  const log = line => { if (logs.length < 2000) logs.push(`${new Date().toISOString()} ${String(line).slice(0, 4000)}`); };
  try {
    for (const [index, testCase] of assignment.cases.entries()) {
      const started = Date.now();
      const result = { caseId: testCase.id, name: testCase.name, status: 'PASSED', durationMs: 0, error: null, steps: [], evidence: [] }; results.push(result);
      const session = new AndroidSession(config, target, dependencies);
      const screenshot = async name => {
        const encoded = await session.command('/screenshot', { signal: controller.signal });
        if (typeof encoded !== 'string' || !encoded.length) throw new Error('Appium screenshot response is empty');
        const file = path.join(directory, name); await writeFile(file, Buffer.from(encoded, 'base64')); files.push({ file, result });
      };
      try {
        if (controller.signal.aborted) throw controller.signal.reason;
        validateCase(testCase, { platform: 'android', framework: 'appium' });
        progress(`Running Android ${testCase.name}`); log(`Case started: ${testCase.name}`);
        await session.create(controller.signal);
        for (const [stepIndex, step] of testCase.steps.entries()) {
          if (controller.signal.aborted) throw controller.signal.reason;
          const outcome = { index: stepIndex, action: step.action, target: step.target || '', status: 'PASSED', durationMs: 0 }; result.steps.push(outcome);
          const stepStarted = Date.now();
          try {
            if (step.action === 'screenshot') await screenshot(`case-${index + 1}-step-${stepIndex + 1}.png`);
            else if (step.action === 'goto') {
              if (!config.androidBrowser) throw new Error('goto requires AGENT_ANDROID_BROWSER=Chrome; native Appium cases start in the configured app');
              await checkUrlAllowed(step.target, config.allowPrivateNetwork);
              await session.command('/url', { method: 'POST', body: { url: step.target }, signal: controller.signal });
            } else {
              const id = encodeURIComponent(await session.find(step.target, controller.signal));
              if (step.action === 'click') await session.command(`/element/${id}/click`, { method: 'POST', body: {}, signal: controller.signal });
              else if (step.action === 'fill') {
                await session.command(`/element/${id}/clear`, { method: 'POST', body: {}, signal: controller.signal });
                await session.command(`/element/${id}/value`, { method: 'POST', body: { text: step.value, value: [...step.value] }, signal: controller.signal });
              } else if (step.action === 'expectText') {
                const deadline = Date.now() + config.stepTimeoutMs; let actual = '';
                do {
                  actual = await session.command(`/element/${id}/text`, { signal: controller.signal });
                  if ((actual || '').includes(step.value)) break;
                  await sleep(100);
                } while (Date.now() < deadline);
                if (!(actual || '').includes(step.value)) throw new Error(`Expected ${step.target} to contain ${JSON.stringify(step.value)}, received ${JSON.stringify(actual)}`);
              }
            }
            log(`${testCase.name} step ${stepIndex + 1} ${step.action}: passed`);
          } catch (error) { outcome.status = 'FAILED'; outcome.error = errorMessage(error); throw error; }
          finally { outcome.durationMs = Date.now() - stepStarted; }
        }
        await screenshot(`case-${index + 1}-complete.png`);
      } catch (error) {
        result.status = 'FAILED'; result.error = errorMessage(controller.signal.aborted ? controller.signal.reason : error); log(result.error);
        if (session.id && !controller.signal.aborted) await screenshot(`case-${index + 1}-failure.png`).catch(() => {});
      } finally {
        progress('Cleaning Android session and test application');
        await session.close().catch(error => { cleanupOk = false; log(`Android cleanup failed: ${errorMessage(error)}`); });
        result.durationMs = Date.now() - started;
      }
      if (!cleanupOk) break;
    }
    for (const testCase of assignment.cases) if (!results.some(item => item.caseId === testCase.id)) results.push({ caseId: testCase.id, name: testCase.name, status: 'FAILED', error: 'Earlier Android cleanup failed; resource is quarantined', durationMs: 0, steps: [], evidence: [] });
  } finally { clearTimeout(timer); signal?.removeEventListener('abort', cancelled); }
  const logFile = path.join(directory, 'execution.log'); await writeFile(logFile, logs.join('\n'));
  if (!cleanupOk && results.length) {
    const last = results.at(-1); last.status = 'FAILED'; last.error = `${last.error ? `${last.error}; ` : ''}Android resource cleanup failed; target quarantined`;
  }
  if (results.length) files.push({ file: logFile, result: results[0] });
  let uploadsOk = true;
  for (const item of files) {
    try { item.result.evidence.push(await upload(item.file)); }
    catch (error) { uploadsOk = false; item.result.status = 'FAILED'; item.result.error = `${item.result.error || ''} Evidence upload failed: ${errorMessage(error)}`.trim(); }
  }
  if (cleanupOk && uploadsOk && path.dirname(directory) === path.resolve(config.artifactsDir)) await rm(directory, { recursive: true, force: true }).catch(() => {});
  return { type: 'done', taskId: assignment.taskId, status: results.length && results.every(item => item.status === 'PASSED') ? 'PASSED' : 'FAILED', results, logs, cleanupOk };
}
