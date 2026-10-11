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
function validInterval(interval) {
  for (const key of ['startedAt', 'finishedAt']) {
    assert.match(interval[key], /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    assert.ok(Number.isFinite(Date.parse(interval[key])));
  }
  assert.ok(interval.startedAt <= interval.finishedAt);
}
function contained(inner, outer) {
  validInterval(inner); validInterval(outer);
  assert.ok(inner.startedAt >= outer.startedAt && inner.finishedAt <= outer.finishedAt);
}

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
      const capture = JSON.parse(form.get('capture')); validInterval(capture);
      const expectedKind = { 'image/png': 'screenshot', 'video/webm': 'video', 'application/zip': 'trace', 'text/plain': 'log' }[file.type];
      assert.equal(capture.kind, expectedKind);
      if (expectedKind === 'log') assert.equal('caseId' in capture, false);
      else assert.ok(['sign-in', 'context-isolation', 'deliberate-failure'].includes(capture.caseId));
      const receivedAt = new Date().toISOString(); assert.ok(capture.finishedAt <= receivedAt);
      assert.ok(bytes.length > 0); uploads.push({ name: file.name, bytes, contentType: file.type, capture, receivedAt });
      res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ id: `e${uploads.length}`, url: `/api/evidence/e${uploads.length}`, name: file.name, contentType: file.type, size: bytes.length, capture }));
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
  assert.deepEqual(result.infrastructureErrors, [], 'An actual assertion failure is not an executor fault');
  assert.deepEqual(result.results.map(item => item.status), ['PASSED', 'PASSED', 'FAILED']);
  assert.match(result.results[2].error, /Wrong text/);
  assert.equal(messages.filter(item => item.type === 'ack').length, 2);
  assert.equal(messages.filter(item => item.type === 'done').length, 1);
  for (const item of result.results) {
    validInterval(item.timing);
    let previousFinishedAt = item.timing.startedAt;
    for (const step of item.steps) { contained(step.timing, item.timing); assert.ok(step.timing.startedAt >= previousFinishedAt); previousFinishedAt = step.timing.finishedAt; }
    assert.ok(item.evidence.some(evidence => evidence.name.endsWith('-trace.zip')));
    assert.ok(item.evidence.some(evidence => evidence.name.endsWith('.webm')));
    assert.ok(item.evidence.some(evidence => evidence.name.endsWith('.png')));
    for (const evidence of item.evidence) {
      const uploaded = uploads.find(upload => upload.name === evidence.name);
      assert.deepEqual(evidence.capture, uploaded.capture, 'live executor callback and multipart preserve source capture');
      if (evidence.capture.kind !== 'log') { assert.equal(evidence.capture.caseId, item.caseId); contained(evidence.capture, item.timing); }
    }
    const trace = item.evidence.find(evidence => evidence.capture.kind === 'trace').capture;
    const video = item.evidence.find(evidence => evidence.capture.kind === 'video').capture;
    assert.ok(trace.startedAt <= video.startedAt);
    assert.ok(video.finishedAt >= previousFinishedAt);
  }
  assert.ok(result.results[0].timing.finishedAt <= result.results[1].timing.startedAt);
  assert.ok(result.results[1].timing.finishedAt <= result.results[2].timing.startedAt);
  const failed = result.results[2], failedStep = failed.steps.find(step => step.status === 'FAILED');
  const failureScreenshot = failed.evidence.find(evidence => evidence.name.endsWith('-failure.png'));
  assert.ok(failureScreenshot.capture.startedAt >= failedStep.timing.finishedAt, 'failure screenshot follows the actual failed assertion');
  const explicitScreenshot = result.results[0].evidence.find(evidence => evidence.name.endsWith('-step-5.png'));
  contained(explicitScreenshot.capture, result.results[0].steps[4].timing);
  const sharedLog = uploads.find(item => item.capture.kind === 'log');
  assert.equal(result.results[0].evidence.filter(evidence => evidence.capture.kind === 'log').length, 1);
  assert.ok(sharedLog.capture.startedAt <= result.results[0].timing.startedAt);
  assert.ok(sharedLog.capture.finishedAt >= result.results.at(-1).timing.finishedAt);
  for (const line of sharedLog.bytes.toString().split('\n')) {
    const time = line.slice(0, 24); assert.ok(time >= sharedLog.capture.startedAt && time <= sharedLog.capture.finishedAt);
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
      upload: async (file, capture) => ({ id: path.basename(file), url: '/evidence', name: path.basename(file), size: (await readFile(file)).length, capture }), progress: () => {} });
    clearTimeout(timer);
    assert.equal(result.status, 'FAILED'); assert.equal(result.cleanupOk, true);
    assert.ok(result.infrastructureErrors.includes('EXECUTION_ABORTED'));
    assert.match(result.results[0].error, mode === 'timeout' ? /timeout/i : /cancelled/i);
    const testcase = result.results[0]; validInterval(testcase.timing);
    for (const step of testcase.steps) contained(step.timing, testcase.timing);
    for (const evidence of testcase.evidence) if (evidence.capture.kind !== 'log') contained(evidence.capture, testcase.timing);
    assert.ok(Date.now() - started < 8000);
  }
});

test('real browser upload failures are explicit infrastructure faults; validation and unavailable executor also fail closed', { timeout: 30000 }, async t => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'agent-gate-infra-'));
  const server = createTargetServer(); const targetUrl = await listen(server);
  t.after(async () => { await close(server); await rm(directory, { recursive: true, force: true }); });
  const config = readConfig({ AGENT_ID: 'gate-infra', AGENT_WORK_DIR: directory, AGENT_ALLOW_PRIVATE_NETWORK: 'true', AGENT_STEP_TIMEOUT_MS: '1000' });
  const [target] = await discoverTargets(config, () => {});
  const assignment = { taskId: 'upload-failed', run: { executionTimeoutSeconds: 10 }, cases: [fixture('upload-failed', targetUrl, [{ action: 'expectVisible', target: '#login-form' }])] };
  const failedUploads = [];
  const result = await executeAssignment({ assignment, target, config, upload: async (file, capture) => { assert.ok((await readFile(file)).length > 0); validInterval(capture); failedUploads.push(capture); throw new Error('acceptance upload endpoint unavailable'); } });
  assert.equal(result.status, 'FAILED'); assert.equal(result.cleanupOk, true);
  assert.deepEqual(result.infrastructureErrors, ['EVIDENCE_UPLOAD_FAILED']);
  assert.ok(result.results[0].steps.every(step => step.status === 'PASSED'));
  assert.match(result.results[0].error, /Evidence upload failed/);
  assert.equal(result.results[0].evidence.length, 0, 'failed uploads never become public result evidence');
  assert.deepEqual(failedUploads.map(capture => capture.kind).sort(), ['log', 'screenshot', 'trace', 'video']);
  const invalid = await executeAssignment({ assignment: { ...assignment, taskId: 'invalid-case', cases: [{ ...assignment.cases[0], status: 'DRAFT' }] }, target, config, upload: async () => ({ id: 'fixture' }) });
  assert.ok(invalid.infrastructureErrors.includes('CASE_VALIDATION_FAILED'));
  const unavailable = await executeAssignment({ assignment: { ...assignment, taskId: 'unavailable' }, target: null, config, upload: async () => ({ id: 'fixture' }) });
  assert.ok(unavailable.infrastructureErrors.includes('EXECUTOR_FAILED'));
  assert.equal('timing' in unavailable.results[0], false, 'an unexecuted case has no invented execution interval');
});
