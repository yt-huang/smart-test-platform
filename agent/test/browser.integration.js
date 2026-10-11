import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp, rm, readFile, readdir } from 'node:fs/promises';
import { WebSocketServer } from 'ws';
import { createTargetServer } from '../../examples/target-server.mjs';
import { readConfig } from '../src/config.js';
import { AgentClient } from '../src/client.js';
import { executeAssignment } from '../src/executor.js';
import { discoverTargets } from '../src/targets.js';

async function listen(server) { await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); return `http://127.0.0.1:${server.address().port}`; }
async function close(server) { await new Promise(resolve => server.close(resolve)); }
const fixture = (id, targetUrl, steps) => ({ id, name: id, platform: 'web', framework: 'playwright', status: 'APPROVED', steps: [{ action: 'goto', target: `${targetUrl}/` }, ...steps] });

test('real Chromium: outbound WS contract, DOM actions, fresh contexts, failure evidence and owned multipart uploads', { timeout: 60000 }, async t => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'agent-browser-'));
  const target = createTargetServer(); const targetUrl = await listen(target);
  const uploads = []; const messages = []; let currentTask;
  const server = http.createServer(async (req, res) => {
    if (req.url !== '/api/agent/evidence' || req.method !== 'POST') { res.writeHead(404); res.end(); return; }
    try {
      assert.equal(req.headers['x-agent-key'], 'integration-key');
      const request = new Request('http://localhost/api/agent/evidence', { method: 'POST', headers: req.headers, body: req, duplex: 'half' });
      const form = await request.formData(); assert.equal(form.get('taskId'), currentTask);
      const file = form.get('file'); const bytes = Buffer.from(await file.arrayBuffer());
      assert.ok(bytes.length > 0); uploads.push({ name: file.name, bytes, contentType: file.type });
      res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ id: `e${uploads.length}`, url: `/api/evidence/e${uploads.length}`, name: file.name, contentType: file.type, size: bytes.length }));
    } catch (error) { res.writeHead(403); res.end(JSON.stringify({ message: error.message })); }
  });
  const platformUrl = await listen(server);
  const ws = new WebSocketServer({ server, path: '/ws/agent' });
  let resolveDone, rejectDone;
  const done = new Promise((resolve, reject) => { resolveDone = resolve; rejectDone = reject; });
  ws.on('connection', socket => socket.on('message', raw => {
    try {
      const payload = JSON.parse(raw.toString()); messages.push(payload);
      if (payload.type === 'register') {
        assert.equal(payload.agentKey, 'integration-key'); assert.equal(payload.targets[0].cleanupOk, true); assert.match(payload.targets[0].version, /\d+\./);
        socket.send(JSON.stringify({ type: 'registered', agentId: payload.agentId, heartbeatIntervalMs: 1000 }));
        currentTask = 'task-real-browser';
        const cases = [fixture('sign-in', targetUrl, [{ action: 'fill', target: '#username', value: 'qa' }, { action: 'click', target: '#login' }, { action: 'expectText', target: '#welcome', value: 'Welcome qa' }, { action: 'screenshot', target: '' }]),
          fixture('context-isolation', targetUrl, [{ action: 'expectVisible', target: '#login-form' }, { action: 'expectText', target: '#welcome', value: 'Guest session' }]),
          fixture('deliberate-failure', targetUrl, [{ action: 'expectText', target: '#welcome', value: 'Wrong text' }])];
        const assignment = { type: 'assign', taskId: currentTask, run: { id: 'real-run', deviceId: payload.targets[0].id, executionTimeoutSeconds: 20 }, cases };
        socket.send(JSON.stringify(assignment)); socket.send(JSON.stringify(assignment));
      } else if (payload.type === 'done') resolveDone(payload);
    } catch (error) { rejectDone(error); }
  }));
  const config = readConfig({ PLATFORM_URL: platformUrl, AGENT_ID: 'browser-integration', AGENT_WORK_DIR: directory, AGENT_ALLOW_PRIVATE_NETWORK: 'true', AGENT_STEP_TIMEOUT_MS: '1000' });
  const client = new AgentClient(config, 'integration-key', { log: () => {} });
  t.after(async () => { await client.stop(); await new Promise(resolve => ws.close(resolve)); await close(server); await close(target); await rm(directory, { recursive: true, force: true }); });
  await client.start();
  const timeout = setTimeout(() => rejectDone(new Error('Timed out waiting for real browser execution')), 45000);
  const result = await done.finally(() => clearTimeout(timeout));
  assert.equal(result.status, 'FAILED'); assert.equal(result.cleanupOk, true);
  assert.deepEqual(result.results.map(item => item.status), ['PASSED', 'PASSED', 'FAILED']);
  assert.match(result.results[2].error, /Wrong text/);
  assert.equal(messages.filter(item => item.type === 'ack').length, 2);
  assert.equal(messages.filter(item => item.type === 'done').length, 1);
  for (const item of result.results) {
    assert.ok(item.evidence.some(evidence => evidence.name.endsWith('-trace.zip')));
    assert.ok(item.evidence.some(evidence => evidence.name.endsWith('.webm')));
    assert.ok(item.evidence.some(evidence => evidence.name.endsWith('.png')));
  }
  assert.ok(uploads.some(item => item.name === 'execution.log' && item.bytes.toString().includes('Demo sign-in completed')));
  assert.ok(uploads.some(item => item.name.endsWith('-failure.png')));
  assert.deepEqual(await readdir(directory), []);
});

test('real execution timeout and platform cancellation close browser resources', { timeout: 30000 }, async t => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'agent-cancel-'));
  const server = createTargetServer(); const targetUrl = await listen(server);
  t.after(async () => { await close(server); await rm(directory, { recursive: true, force: true }); });
  const config = readConfig({ AGENT_ID: 'cancel-test', AGENT_WORK_DIR: directory, AGENT_ALLOW_PRIVATE_NETWORK: 'true', AGENT_STEP_TIMEOUT_MS: '10000' });
  const [target] = await discoverTargets(config, () => {});
  for (const mode of ['timeout', 'cancel']) {
    const controller = new AbortController(); const started = Date.now();
    const timer = mode === 'cancel' ? setTimeout(() => controller.abort(new Error('Platform cancelled execution')), 1000) : null;
    const result = await executeAssignment({ assignment: { taskId: mode, run: { id: mode, executionTimeoutSeconds: mode === 'timeout' ? 1 : 20 }, cases: [fixture(mode, targetUrl, [{ action: 'expectVisible', target: '#never-exists' }])] }, target, config, signal: controller.signal,
      upload: async file => ({ id: path.basename(file), url: '/evidence', name: path.basename(file), size: (await readFile(file)).length }), progress: () => {} });
    clearTimeout(timer);
    assert.equal(result.status, 'FAILED'); assert.equal(result.cleanupOk, true);
    assert.match(result.results[0].error, mode === 'timeout' ? /timeout/i : /cancelled/i);
    assert.ok(Date.now() - started < 8000);
  }
});
