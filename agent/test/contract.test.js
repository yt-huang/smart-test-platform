import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { readConfig } from '../src/config.js';
import { resolveAgentKey, uploadEvidence } from '../src/platform.js';
import { AgentClient } from '../src/client.js';
import { validateCase, checkUrlAllowed } from '../src/executor.js';

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
