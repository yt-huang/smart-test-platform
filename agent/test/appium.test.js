import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { readConfig } from '../src/config.js';
import { AndroidSession, probeAndroidTarget, executeAndroidAssignment, selectorFor } from '../src/appium.js';

// This is a software-only W3C protocol fixture. It is never registered with a real platform,
// and its results are not evidence of a connected or successfully tested physical device.
async function protocolFixture(t, options = {}) {
  const calls = [], sessions = new Set(); let counter = 0, text = 'Guest session';
  const server = http.createServer(async (req, res) => {
    let body = ''; for await (const chunk of req) body += chunk;
    const value = body ? JSON.parse(body) : undefined;
    calls.push({ method: req.method, path: req.url, body: value });
    let result = null, status = 200;
    if (req.url === '/status') result = { ready: options.ready !== false };
    else if (req.url === '/sessions') result = [...sessions].map(id => ({ id, capabilities: { 'appium:udid': 'physical-serial' } })).concat(options.externalSessions || []);
    else if (req.url === '/session' && req.method === 'POST') {
      const sessionId = `fixture-session-${++counter}`; sessions.add(sessionId); text = 'Guest session'; result = { sessionId, capabilities: value.capabilities.alwaysMatch };
    } else {
      const [, , id, ...parts] = req.url.split('/'); const command = parts.join('/');
      if (!sessions.has(id)) { status = 404; result = { error: 'invalid session id', message: 'session no longer exists' }; }
      else if (req.method === 'DELETE') { if (!options.failDelete) sessions.delete(id); }
      else if (command === 'timeouts') result = { implicit: 0, script: 30000, pageLoad: 300000 };
      else if (command === 'element') { if (options.delayElement) await new Promise(resolve => setTimeout(resolve, options.delayElement)); result = { 'element-6066-11e4-a52e-4f735466cecf': 'element-1' }; }
      else if (command.endsWith('/displayed')) result = true;
      else if (command.endsWith('/value')) text = `Welcome ${value.text}`;
      else if (command.endsWith('/text')) result = text;
      else if (command === 'screenshot') result = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6sqcAAAAASUVORK5CYII=';
    }
    res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ value: result }));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const config = readConfig({ APPIUM_URL: `http://127.0.0.1:${server.address().port}`, AGENT_ANDROID_APP_PACKAGE: 'com.example.test', AGENT_ANDROID_APP_ACTIVITY: '.MainActivity', AGENT_STEP_TIMEOUT_MS: '1000' });
  const adbCalls = [];
  const dependencies = { adb: async args => { adbCalls.push(args); return args.includes('get-state') ? options.offline ? 'offline' : 'device' : args.includes('clear') ? 'Success' : ''; } };
  const target = { serial: 'physical-serial', id: 'android-target', name: 'software fixture', platform: 'android' };
  return { config, target, dependencies, calls, adbCalls, sessions };
}

test('Appium selectors use explicit W3C strategies without case-supplied script', () => {
  assert.deepEqual(selectorFor('accessibility:Sign in', false), { using: 'accessibility id', value: 'Sign in' });
  assert.deepEqual(selectorFor('id:com.example:id/name', false), { using: 'id', value: 'com.example:id/name' });
  assert.deepEqual(selectorFor('#username', true), { using: 'css selector', value: '#username' });
});
test('only healthy Appium plus session-delete verification and real ADB reset permits a clean probe', async t => {
  const fixture = await protocolFixture(t);
  assert.equal(await probeAndroidTarget(fixture.config, fixture.target, fixture.dependencies), true);
  assert.equal(fixture.sessions.size, 0);
  const created = fixture.calls.find(call => call.path === '/session').body.capabilities.alwaysMatch;
  assert.equal(created['appium:udid'], 'physical-serial'); assert.equal(created['appium:noReset'], false);
  assert.equal(created['appium:automationName'], 'UiAutomator2');
  assert.ok(fixture.adbCalls.some(args => args.join(' ') === '-s physical-serial shell am force-stop com.example.test'));
  assert.ok(fixture.adbCalls.some(args => args.join(' ') === '-s physical-serial shell pm clear com.example.test'));
});
test('unhealthy services, unknown active sessions, failed deletion and offline ADB remain unavailable', async t => {
  for (const options of [{ ready: false }, { externalSessions: [{ id: 'unknown', capabilities: {} }] }, { failDelete: true }, { offline: true }]) {
    const fixture = await protocolFixture(t, options);
    assert.equal(await probeAndroidTarget(fixture.config, fixture.target, fixture.dependencies), false);
  }
});
test('Android adapter executes structured W3C actions and uploads screenshots/logs only after verified cleanup', async t => {
  const fixture = await protocolFixture(t);
  const directory = await mkdtemp(path.join(os.tmpdir(), 'appium-fixture-')); t.after(() => rm(directory, { recursive: true, force: true }));
  const uploads = [];
  const result = await executeAndroidAssignment({ config: { ...fixture.config, artifactsDir: directory }, target: fixture.target, dependencies: fixture.dependencies,
    assignment: { taskId: 'protocol-only', run: { id: 'protocol-only', executionTimeoutSeconds: 10 }, cases: [{ id: 'android-case', name: 'software protocol verification', platform: 'android', framework: 'appium', status: 'APPROVED', steps: [{ action: 'fill', target: 'id:name', value: 'qa' }, { action: 'click', target: 'accessibility:Sign in' }, { action: 'expectText', target: 'id:welcome', value: 'Welcome qa' }, { action: 'screenshot', target: '' }] }] },
    upload: async file => { assert.equal(fixture.sessions.size, 0); const bytes = await readFile(file); uploads.push({ name: path.basename(file), size: bytes.length }); return { id: path.basename(file), url: '/protocol-only-evidence', name: path.basename(file), size: bytes.length }; }
  });
  assert.equal(result.status, 'PASSED'); assert.equal(result.cleanupOk, true); assert.equal(result.results[0].steps.length, 4);
  assert.ok(uploads.some(item => item.name.endsWith('.png') && item.size > 0)); assert.ok(uploads.some(item => item.name === 'execution.log'));
  assert.equal(fixture.sessions.size, 0);
});
test('Android cleanup failure quarantines the device and prevents a second case', async t => {
  const fixture = await protocolFixture(t, { failDelete: true });
  const directory = await mkdtemp(path.join(os.tmpdir(), 'appium-quarantine-')); t.after(() => rm(directory, { recursive: true, force: true }));
  const testcase = { id: 'case1', name: 'fixture', platform: 'android', framework: 'appium', status: 'APPROVED', steps: [{ action: 'expectVisible', target: 'id:welcome' }] };
  const result = await executeAndroidAssignment({ config: { ...fixture.config, artifactsDir: directory }, target: fixture.target, dependencies: fixture.dependencies, assignment: { taskId: 'quarantine', run: { id: 'quarantine', executionTimeoutSeconds: 10 }, cases: [testcase, { ...testcase, id: 'case2' }] }, upload: async file => ({ id: 'fixture', url: '/fixture', name: path.basename(file) }) });
  assert.equal(result.cleanupOk, false); assert.equal(result.status, 'FAILED'); assert.match(result.results[1].error, /quarantined/);
  assert.equal(fixture.calls.filter(call => call.path === '/session').length, 1);
});
test('uncertain W3C session creation cannot claim cleanup success', async () => {
  const config = readConfig({ APPIUM_URL: 'http://appium.example', AGENT_ANDROID_BROWSER: 'Chrome' });
  const session = new AndroidSession(config, { serial: 'serial', name: 'phone' }, { fetchImpl: async url => { if (url.endsWith('/status')) return Response.json({ value: { ready: true } }); if (url.endsWith('/sessions')) return Response.json({ value: [] }); throw new Error('Network lost after POST'); } });
  await assert.rejects(session.create(), /Network lost/); await assert.rejects(session.close(), /uncertain/);
});
test('Android cancellation aborts an in-flight command but verifies remote session and ADB cleanup', async t => {
  const fixture = await protocolFixture(t, { delayElement: 1500 });
  const directory = await mkdtemp(path.join(os.tmpdir(), 'appium-cancel-')); t.after(() => rm(directory, { recursive: true, force: true }));
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error('Platform cancelled execution')), 100);
  const result = await executeAndroidAssignment({ config: { ...fixture.config, artifactsDir: directory }, target: fixture.target, dependencies: fixture.dependencies, signal: controller.signal,
    assignment: { taskId: 'cancel', run: { id: 'cancel', executionTimeoutSeconds: 10 }, cases: [{ id: 'android-case', name: 'protocol cancellation', platform: 'android', framework: 'appium', status: 'APPROVED', steps: [{ action: 'expectVisible', target: 'id:welcome' }] }] },
    upload: async file => ({ id: 'fixture', url: '/fixture', name: path.basename(file) }) });
  clearTimeout(timer); assert.equal(result.status, 'FAILED'); assert.equal(result.cleanupOk, true); assert.match(result.results[0].error, /cancelled/); assert.equal(fixture.sessions.size, 0);
});
