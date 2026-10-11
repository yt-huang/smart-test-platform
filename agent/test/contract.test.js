import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { readConfig } from '../src/config.js';
import { resolveAgentKey, uploadEvidence } from '../src/platform.js';
import { AgentClient } from '../src/client.js';
import { validateCase, checkUrlAllowed, executeAssignment } from '../src/executor.js';
import { browserTypes } from '../src/browsers.js';

const approved = { id: 'c1', name: 'case', status: 'APPROVED', platform: 'web', framework: 'playwright', steps: [{ action: 'goto', target: 'https://example.com' }] };
test('configuration rejects malformed identity, browser, URL and timeout', () => {
  assert.equal(readConfig({}).browsers[0], 'chromium');
  for (const env of [{ PLATFORM_URL: 'file:///x' }, { PLATFORM_URL: 'http://admin:secret@x' }, { AGENT_ID: '../../x' }, { AGENT_BROWSERS: 'edge' }, { AGENT_STEP_TIMEOUT_MS: '-1' }]) assert.throws(() => readConfig(env));
  assert.equal(readConfig({ AGENT_WORK_DIR: 'my-work' }).artifactsDir, path.resolve('my-work'));
});
test('only approved structured web Playwright steps can execute', () => {
  validateCase(approved);
  for (const value of [{ ...approved, status: 'DRAFT' }, { ...approved, platform: 'android', framework: 'appium' }, { ...approved, steps: [{ action: 'eval', value: 'process.exit()' }] }, { ...approved, steps: [{ action: 'goto', target: 'file:///etc/passwd' }] }, { ...approved, steps: [{ action: 'fill', target: '#x' }] }]) assert.throws(() => validateCase(value));
});
test('private targets require the trusted agent setting', async () => {
  await assert.rejects(checkUrlAllowed('http://127.0.0.1/', false), /Private network/);
  await checkUrlAllowed('http://127.0.0.1/', true);
  await assert.rejects(checkUrlAllowed('file:///tmp/x', true), /HTTP/);
});

test('executor initialization fixture cannot turn a resource fault into an ordinary assertion failure', async t => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'agent-init-fixture-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  let connected = true;
  t.mock.method(browserTypes.chromium, 'launch', async () => ({
    newContext: async () => { throw new Error('synthetic browser context initialization failure'); },
    close: async () => { connected = false; }, isConnected: () => connected,
  }));
  const result = await executeAssignment({ assignment: { taskId: 'init-fixture', run: { executionTimeoutSeconds: 10 }, cases: [approved] },
    target: { platform: 'web', browser: 'chromium' }, config: readConfig({ AGENT_WORK_DIR: directory }), upload: async () => ({ id: 'log-fixture' }) });
  assert.equal(result.status, 'FAILED'); assert.equal(result.cleanupOk, true);
  assert.deepEqual(result.infrastructureErrors, ['EXECUTOR_FAILED']);
  assert.match(result.results[0].error, /context initialization/);
});

// These lifecycle fixtures check the protocol's timestamp source around operations.
// Their bytes are software fixtures, not evidence of a real browser or recorded media.
function lifecycleFixture(t, { screenshotFails = false, traceFails = false } = {}) {
  const operations = [];
  let connected = true, closed = false, videoFile;
  const operation = async (name, action) => {
    const interval = { name, startedAt: new Date().toISOString() }; operations.push(interval);
    await new Promise(resolve => setTimeout(resolve, 10));
    try { return await action?.(); }
    finally { interval.finishedAt = new Date().toISOString(); }
  };
  const screenshot = options => operation(path.basename(options.path), async () => {
    if (screenshotFails) throw new Error('fixture screenshot unavailable');
    await writeFile(options.path, 'software screenshot fixture');
  });
  const page = Object.assign(new EventEmitter(), {
    isClosed: () => closed, screenshot, locator: () => ({ screenshot }),
    video: () => ({ path: async () => videoFile }),
  });
  t.mock.method(browserTypes.chromium, 'launch', async () => ({
    newContext: async ({ recordVideo }) => {
      videoFile = path.join(recordVideo.dir, 'fixture-video.webm');
      return {
        setDefaultTimeout() {}, setDefaultNavigationTimeout() {}, route: async () => {},
        tracing: {
          start: () => operation('trace-start'),
          stop: ({ path: file }) => operation('trace-stop', async () => {
            if (traceFails) throw new Error('fixture trace finalization unavailable');
            await writeFile(file, 'software trace fixture');
          }),
        },
        newPage: () => operation('new-page', () => page),
        close: () => operation('context-close', async () => { closed = true; await writeFile(videoFile, 'software video fixture'); }),
        pages: () => closed ? [] : [page],
      };
    },
    close: async () => { connected = false; }, isConnected: () => connected,
  }));
  return { operations, isClosed: () => closed && !connected };
}

test('source timestamps bracket actual lifecycle operations even when durations are zero', async t => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'agent-timing-fixture-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const lifecycle = lifecycleFixture(t), uploads = [];
  t.mock.method(Date, 'now', () => 123456789);
  const before = new Date().toISOString();
  const result = await executeAssignment({ assignment: { taskId: 'timing-fixture', run: { executionTimeoutSeconds: 10 }, cases: [{ ...approved, steps: [{ action: 'screenshot', target: '#fixture' }] }] },
    target: { platform: 'web', browser: 'chromium' }, config: readConfig({ AGENT_WORK_DIR: directory }),
    upload: async (file, capture) => {
      assert.equal(lifecycle.isClosed(), true, 'uploads happen after browser cleanup');
      const bytes = await readFile(file); assert.ok(bytes.length > 0);
      uploads.push({ name: path.basename(file), capture, bytes });
      return { id: path.basename(file), capture };
    } });
  const after = new Date().toISOString(), testcase = result.results[0];
  assert.equal(result.status, 'PASSED'); assert.equal(result.durationMs, 0); assert.equal(testcase.durationMs, 0);
  assert.ok(testcase.timing.startedAt >= before && testcase.timing.finishedAt <= after);
  const step = testcase.steps[0]; assert.equal(step.durationMs, 0);
  assert.ok(step.timing.startedAt < step.timing.finishedAt, 'wall-clock operation interval is independent of durationMs');
  assert.ok(step.timing.startedAt >= testcase.timing.startedAt && step.timing.finishedAt <= testcase.timing.finishedAt);
  const observed = name => lifecycle.operations.find(item => item.name === name);
  const brackets = (capture, interval) => { assert.ok(capture.startedAt <= interval.startedAt); assert.ok(capture.finishedAt >= interval.finishedAt); };
  for (const item of uploads.filter(item => item.capture.kind === 'screenshot')) {
    brackets(item.capture, observed(item.name)); assert.equal(item.capture.caseId, testcase.caseId);
    assert.ok(item.capture.startedAt >= testcase.timing.startedAt && item.capture.finishedAt <= testcase.timing.finishedAt);
  }
  const trace = uploads.find(item => item.capture.kind === 'trace').capture;
  assert.ok(trace.startedAt <= observed('trace-start').startedAt); assert.ok(trace.finishedAt >= observed('trace-stop').finishedAt);
  const video = uploads.find(item => item.capture.kind === 'video').capture;
  assert.ok(video.startedAt <= observed('new-page').startedAt); assert.ok(video.finishedAt >= observed('context-close').finishedAt);
  assert.equal(trace.caseId, testcase.caseId); assert.equal(video.caseId, testcase.caseId);
  const log = uploads.find(item => item.capture.kind === 'log'); assert.equal('caseId' in log.capture, false);
  assert.ok(log.capture.startedAt <= testcase.timing.startedAt && log.capture.finishedAt >= testcase.timing.finishedAt);
  for (const line of log.bytes.toString().split('\n')) {
    const time = line.slice(0, 24); assert.ok(time >= log.capture.startedAt && time <= log.capture.finishedAt);
  }
});

test('failed capture operations never publish their absent files or replace the original failure', async t => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'agent-missing-capture-fixture-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  lifecycleFixture(t, { screenshotFails: true, traceFails: true });
  const uploads = [];
  const result = await executeAssignment({ assignment: { taskId: 'missing-capture', run: { executionTimeoutSeconds: 10 }, cases: [{ ...approved, steps: [{ action: 'screenshot', target: '' }] }] },
    target: { platform: 'web', browser: 'chromium' }, config: readConfig({ AGENT_WORK_DIR: directory }),
    upload: async (file, capture) => { await readFile(file); uploads.push(capture); return { id: path.basename(file), capture }; } });
  assert.equal(result.status, 'FAILED'); assert.equal(result.cleanupOk, true);
  assert.match(result.results[0].error, /^fixture screenshot unavailable$/);
  assert.equal(result.results[0].steps[0].status, 'FAILED');
  assert.deepEqual(result.infrastructureErrors, ['EXECUTOR_FAILED']);
  assert.deepEqual(uploads.map(item => item.kind), ['video', 'log']);
  assert.ok(result.results[0].timing.finishedAt >= result.results[0].steps[0].timing.finishedAt);
});

test('evidence multipart sends optional capture JSON and preserves legacy uploads', async t => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'agent-upload-timing-'));
  const file = path.join(directory, 'execution.log'); await writeFile(file, 'upload protocol fixture');
  const captures = [];
  const server = http.createServer(async (req, res) => {
    const request = new Request('http://localhost/api/agent/evidence', { method: 'POST', headers: req.headers, body: req, duplex: 'half' });
    const form = await request.formData(); captures.push(form.get('capture'));
    assert.equal(form.get('taskId'), 'multipart-task'); assert.equal(req.headers['x-agent-key'], 'protocol-key');
    assert.equal(await form.get('file').text(), 'upload protocol fixture');
    res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ id: 'e1', url: '/api/evidence/e1' }));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { await new Promise(resolve => server.close(resolve)); await rm(directory, { recursive: true, force: true }); });
  const config = readConfig({ PLATFORM_URL: `http://127.0.0.1:${server.address().port}` });
  const capture = { kind: 'log', startedAt: new Date().toISOString(), finishedAt: new Date().toISOString() };
  await uploadEvidence(config, 'protocol-key', 'multipart-task', file, capture);
  await uploadEvidence(config, 'protocol-key', 'multipart-task', file);
  assert.deepEqual(JSON.parse(captures[0]), capture); assert.equal(captures[1], null);
});
test('bootstrap persists the once-only secret and reuses it instead of creating duplicate keys', async t => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'agent-contract-'));
  let loginCount = 0, createCount = 0;
  const server = http.createServer(async (req, res) => {
    let text = ''; for await (const chunk of req) text += chunk;
    res.setHeader('Content-Type', 'application/json');
    if (req.url === '/api/auth/login') { loginCount++; assert.deepEqual(JSON.parse(text), { username: 'admin', password: 'test-password' }); res.end(JSON.stringify({ token: 'test-token' })); }
    else if (req.url === '/api/agent-keys') { createCount++; assert.equal(req.headers.authorization, 'Bearer test-token'); res.end(JSON.stringify({ id: 'key-1', key: 'provisioned-secret' })); }
    else { res.writeHead(404); res.end('{}'); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { await new Promise(resolve => server.close(resolve)); await rm(directory, { recursive: true, force: true }); });
  const config = readConfig({ PLATFORM_URL: `http://127.0.0.1:${server.address().port}`, AGENT_ID: 'test-agent', AGENT_KEY_FILE: path.join(directory, 'key.json'), PLATFORM_ADMIN_PASSWORD: 'test-password' });
  assert.equal(await resolveAgentKey(config), 'provisioned-secret');
  assert.equal(await resolveAgentKey(config), 'provisioned-secret');
  assert.equal(loginCount, 1); assert.equal(createCount, 1);
  const persisted = JSON.parse(await readFile(config.keyFile)); assert.equal(persisted.agentId, config.agentId);
  await assert.rejects(resolveAgentKey({ ...config, agentId: 'different-agent' }), /another agent/);
  assert.equal(await resolveAgentKey({ ...config, key: 'explicit-secret' }), 'explicit-secret');
});

class Socket extends EventEmitter { readyState = 1; messages = []; send(value) { this.messages.push(JSON.parse(value)); } close() { this.readyState = 3; } }
const tick = () => new Promise(resolve => setImmediate(resolve));
function clientWith(execute) {
  const client = new AgentClient(readConfig({ AGENT_ID: 'test' }), 'secret', { execute, log: () => {} });
  client.socket = new Socket(); client.registered = true;
  client.targets = [{ id: 'target', platform: 'web', browser: 'chromium', cleanupOk: true, status: 'IDLE' }];
  return client;
}
const assignment = { type: 'assign', taskId: 't1', run: { id: 'r1', deviceId: 'target' }, cases: [approved] };
test('duplicate assignment messages execute once and replay the terminal result', async () => {
  let executions = 0, finish;
  const client = clientWith(async () => { executions++; await new Promise(resolve => finish = resolve); return { type: 'done', taskId: 't1', status: 'PASSED', cleanupOk: true, results: [], logs: [] }; });
  client.handle(assignment); client.handle(assignment);
  await tick(); assert.equal(executions, 1); finish(); await tick();
  assert.equal(client.socket.messages.filter(item => item.type === 'done').length, 1);
  client.handle(assignment);
  assert.equal(client.socket.messages.filter(item => item.type === 'done').length, 2);
  assert.equal(client.targets[0].status, 'IDLE'); assert.equal(client.targets[0].cleanupOk, true);
  await client.stop();
});
test('platform cancellation interrupts the task, failed cleanup quarantines the target', async () => {
  const client = clientWith(async ({ signal }) => { await new Promise(resolve => signal.addEventListener('abort', resolve, { once: true })); return { type: 'done', taskId: 't1', status: 'FAILED', cleanupOk: false, results: [], logs: [] }; });
  client.handle(assignment); await tick(); client.handle({ type: 'cancel', taskId: 't1', reason: 'run cancelled' }); await tick();
  assert.equal(client.targets[0].status, 'MAINTENANCE'); assert.equal(client.targets[0].cleanupOk, false);
  assert.equal(client.socket.messages.at(-1).cleanupOk, false);
  client.discover = async () => [{ id: 'target', platform: 'web', browser: 'chromium', status: 'IDLE', cleanupOk: true }];
  client.scheduleReconnect = () => {};
  await client.reconnectAfterCleanup();
  assert.equal(client.targets[0].status, 'MAINTENANCE'); assert.equal(client.targets[0].cleanupOk, false);
  await client.stop();
});
test('concurrent assignments cannot share a leased browser', async () => {
  let finish;
  const client = clientWith(async () => { await new Promise(resolve => finish = resolve); return { type: 'done', taskId: 't1', status: 'PASSED', cleanupOk: true, results: [], logs: [] }; });
  client.handle(assignment); await tick(); client.handle({ ...assignment, taskId: 't2', run: { ...assignment.run, id: 'r2' } });
  assert.equal(client.socket.messages.at(-1).status, 'FAILED'); assert.equal(client.socket.messages.at(-1).cleanupOk, false);
  assert.deepEqual(client.socket.messages.at(-1).infrastructureErrors, ['EXECUTOR_FAILED']);
  finish(); await tick(); await client.stop();
});
