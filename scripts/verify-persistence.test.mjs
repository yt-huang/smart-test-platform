// Behavior tests for scripts/verify-persistence.mjs against a local HTTP
// fixture. These prove the CLI's persistence/integrity/recovery logic; they do
// NOT replace the coordinator's real PostgreSQL/Codespaces acceptance run.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, readFileSync, existsSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const script = path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'verify-persistence.mjs');

// --- fixture platform ------------------------------------------------------
function makeFixture() {
  const state = {
    password: 'fixture-admin-password',
    token: 'fixture-bearer-token-abc123',
    runs: [], cases: [], plans: [], devices: [], agents: [],
    evidence: new Map(),          // id -> Buffer
    evidenceRedirect: new Map(),  // id -> absolute URL the fixture 302s to
    loginAttempts: 0,
  };
  const server = createServer((req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');
    const json = (status, body) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body)); };
    if (url.pathname === '/api/auth/login' && req.method === 'POST') {
      let raw = '';
      req.on('data', c => { raw += c; });
      req.on('end', () => {
        let body = null;
        try { body = JSON.parse(raw); } catch { return json(400, { message: 'bad json' }); }
        state.loginAttempts += 1;
        if (body?.username === 'admin' && body?.password === state.password) return json(200, { token: state.token, user: { id: 'u1', username: 'admin', role: 'ADMIN' } });
        return json(401, { message: 'Invalid username or password' });
      });
      return;
    }
    if (url.pathname === '/api/runs') return json(200, state.runs);
    if (url.pathname === '/api/cases') return json(200, state.cases);
    if (url.pathname === '/api/plans') return json(200, state.plans);
    if (url.pathname === '/api/devices') return json(200, state.devices);
    if (url.pathname === '/api/agents') return json(200, state.agents);
    const ev = url.pathname.match(/^\/api\/evidence\/(.+)$/);
    if (ev) {
      if (!req.headers.authorization?.startsWith('Bearer ')) return json(401, { message: 'Authentication required' });
      const target = state.evidenceRedirect.get(ev[1]);
      if (target) { res.writeHead(302, { Location: target }); return res.end(); }
      const bytes = state.evidence.get(ev[1]);
      if (!bytes) return json(404, { message: 'not found' });
      res.writeHead(200, { 'Content-Type': 'image/png' });
      return res.end(bytes);
    }
    return json(404, { message: 'not found' });
  });
  return { state, server };
}

// Trap server that records whether any request carried an Authorization
// header. It stands in for a third party that must never see the Bearer token.
function makeTrap() {
  const seen = [];
  const server = createServer((req, res) => {
    seen.push({ path: req.url, authorization: req.headers.authorization ?? null });
    res.writeHead(200, { 'Content-Type': 'image/png' });
    res.end(Buffer.from('trap-bytes'));
  });
  return { seen, server };
}

const listen = server => new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve(server.address().port)));
const close = server => new Promise(resolve => server.close(resolve));

function resetState(state) {
  state.runs = []; state.cases = []; state.plans = []; state.devices = []; state.agents = [];
  state.evidence = new Map(); state.evidenceRedirect = new Map();
}

// A realistic deployment: one PASSED run with evidence, a failing and a
// cancelled run, plus cases/plans that no passing report references.
function seedDeployment(state, { evidenceBytes = Buffer.from('real-evidence-png-bytes') } = {}) {
  state.evidence.set('ev-1', evidenceBytes);
  state.cases.push({ id: 'case-1', name: 'Smoke login', status: 'APPROVED', revision: 2 });
  state.cases.push({ id: 'case-2', name: 'Unreferenced case', status: 'DRAFT', revision: 1 });
  state.plans.push({ id: 'plan-1', name: 'Smoke plan', caseIds: ['case-1'] });
  state.plans.push({ id: 'plan-2', name: 'Orphan plan', caseIds: [] });
  state.devices.push({ id: 'dev-1', name: 'chromium-node', platform: 'web', status: 'IDLE', agentId: 'agent-1' });
  state.agents.push({ id: 'agent-1', name: 'agent-one', status: 'ONLINE', targetIds: ['dev-1'] });
  state.runs.push({
    id: 'run-1', name: 'Smoke run', status: 'PASSED', planId: 'plan-1', caseIds: ['case-1'],
    commitSha: 'abc123', createdAt: '2026-10-10T00:00:00Z', finishedAt: '2026-10-10T00:01:00Z',
    summary: { passed: 1, failed: 0, total: 1 },
    results: [{ caseId: 'case-1', status: 'PASSED', evidence: [{ id: 'ev-1', name: 'shot.png', url: '/api/evidence/ev-1' }] }],
    deviceId: 'dev-1', agentId: 'agent-1',
  });
  state.runs.push({
    id: 'run-fail', name: 'Failing run', status: 'FAILED', planId: 'plan-1', caseIds: ['case-1'],
    commitSha: 'abc123', createdAt: '2026-10-10T01:00:00Z', finishedAt: '2026-10-10T01:00:30Z',
    summary: { passed: 0, failed: 1, total: 1 }, results: [], deviceId: 'dev-1', agentId: 'agent-1',
  });
  state.runs.push({
    id: 'run-cancel', name: 'Cancelled run', status: 'CANCELLED', planId: '', caseIds: [],
    createdAt: '2026-10-10T02:00:00Z', finishedAt: '2026-10-10T02:00:05Z',
    summary: { passed: 0, failed: 0, total: 0 }, results: [],
  });
}

// --- CLI runner ------------------------------------------------------------
function runCli(args, { platformUrl, password, cwd }) {
  const env = { ...process.env, PLATFORM_URL: platformUrl, PLATFORM_ADMIN_PASSWORD: password };
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [script, ...args], { env, cwd });
    let stdout = ''; let stderr = '';
    child.stdout.on('data', d => { stdout += d; });
    child.stderr.on('data', d => { stderr += d; });
    child.on('close', code => resolve({ code, stdout, stderr }));
  });
}

function tempWorkdir() {
  const dir = mkdtempSync(path.join(tmpdir(), 'verify-persistence-'));
  return { dir, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

async function withFixture(t, fn) {
  const fx = makeFixture();
  const port = await listen(fx.server);
  const { dir, cleanup } = tempWorkdir();
  const platformUrl = `http://127.0.0.1:${port}`;
  t.after(async () => { await close(fx.server); cleanup(); });
  return fn({ state: fx.state, platformUrl, dir });
}

async function baselineOk(state, platformUrl, dir) {
  const snapshot = path.join(dir, 'persistence.json');
  const result = await runCli(['baseline', '--snapshot', snapshot], { platformUrl, password: state.password, cwd: dir });
  assert.equal(result.code, 0, result.stderr);
  return snapshot;
}

// --- tests -----------------------------------------------------------------
test('baseline then check passes; snapshot retains every run/case/plan ID', async (t) => {
  await withFixture(t, async ({ state, platformUrl, dir }) => {
    seedDeployment(state);
    const snapshot = path.join(dir, 'persistence.json');
    const baseline = await runCli(['baseline', '--snapshot', snapshot], { platformUrl, password: state.password, cwd: dir });
    assert.equal(baseline.code, 0, baseline.stderr);
    assert.ok(existsSync(snapshot));
    const doc = JSON.parse(readFileSync(snapshot, 'utf8'));
    assert.equal(doc.version, 1);
    // ALL original IDs retained, failing/cancelled runs and orphans included
    assert.deepEqual(doc.runIds, ['run-1', 'run-fail', 'run-cancel']);
    assert.deepEqual(doc.caseIds, ['case-1', 'case-2']);
    assert.deepEqual(doc.planIds, ['plan-1', 'plan-2']);
    // integrity details only for the completed PASSED report with evidence
    assert.deepEqual(doc.reports.map(r => r.id), ['run-1']);
    assert.equal(doc.reports[0].finishedAt, '2026-10-10T00:01:00Z');
    assert.equal(doc.reports[0].deviceId, 'dev-1');
    assert.equal(doc.reports[0].agentId, 'agent-1');
    assert.equal(doc.reports[0].evidence.length, 1);
    assert.match(doc.reports[0].evidence[0].sha256, /^[0-9a-f]{64}$/);
    assert.deepEqual(doc.resources.map(r => r.deviceId), ['dev-1']);
    // snapshot must never contain credentials
    const raw = readFileSync(snapshot, 'utf8');
    assert.ok(!raw.includes(state.password), 'snapshot leaks password');
    assert.ok(!raw.includes(state.token), 'snapshot leaks bearer token');
    const check = await runCli(['check', '--snapshot', snapshot, '--wait-seconds', '3'], { platformUrl, password: state.password, cwd: dir });
    assert.equal(check.code, 0, check.stderr);
    assert.match(check.stdout, /"status": "verified"/);
  });
});

test('check fails when any retained run ID disappears, including failing/cancelled runs', async (t) => {
  await withFixture(t, async ({ state, platformUrl, dir }) => {
    seedDeployment(state);
    const snapshot = await baselineOk(state, platformUrl, dir);
    state.runs = state.runs.filter(r => r.id !== 'run-fail');
    const noFail = await runCli(['check', '--snapshot', snapshot, '--wait-seconds', '1'], { platformUrl, password: state.password, cwd: dir });
    assert.notEqual(noFail.code, 0);
    assert.match(noFail.stderr, /run-fail is missing after restart/);
    state.runs.push({ id: 'run-fail', name: 'Failing run', status: 'FAILED', planId: 'plan-1', caseIds: ['case-1'], summary: { passed: 0, failed: 1, total: 1 }, results: [], deviceId: 'dev-1', agentId: 'agent-1' });
    state.runs = state.runs.filter(r => r.id !== 'run-cancel');
    const noCancel = await runCli(['check', '--snapshot', snapshot, '--wait-seconds', '1'], { platformUrl, password: state.password, cwd: dir });
    assert.notEqual(noCancel.code, 0);
    assert.match(noCancel.stderr, /run-cancel is missing after restart/);
  });
});

test('check fails when an unreferenced case or plan disappears', async (t) => {
  await withFixture(t, async ({ state, platformUrl, dir }) => {
    seedDeployment(state);
    const snapshot = await baselineOk(state, platformUrl, dir);
    state.cases = state.cases.filter(c => c.id !== 'case-2');
    const noCase = await runCli(['check', '--snapshot', snapshot, '--wait-seconds', '1'], { platformUrl, password: state.password, cwd: dir });
    assert.notEqual(noCase.code, 0);
    assert.match(noCase.stderr, /case-2 is missing after restart/);
    state.cases.push({ id: 'case-2', name: 'Unreferenced case', status: 'DRAFT', revision: 1 });
    state.plans = state.plans.filter(p => p.id !== 'plan-2');
    const noPlan = await runCli(['check', '--snapshot', snapshot, '--wait-seconds', '1'], { platformUrl, password: state.password, cwd: dir });
    assert.notEqual(noPlan.code, 0);
    assert.match(noPlan.stderr, /plan-2 is missing after restart/);
  });
});

test('check fails when evidence bytes change without size change', async (t) => {
  await withFixture(t, async ({ state, platformUrl, dir }) => {
    seedDeployment(state);
    const snapshot = await baselineOk(state, platformUrl, dir);
    const original = state.evidence.get('ev-1');
    const tampered = Buffer.from(original);
    tampered[0] = tampered[0] === 0x41 ? 0x42 : 0x41; // same length, different bytes
    assert.equal(tampered.length, original.length);
    state.evidence.set('ev-1', tampered);
    const check = await runCli(['check', '--snapshot', snapshot, '--wait-seconds', '1'], { platformUrl, password: state.password, cwd: dir });
    assert.notEqual(check.code, 0);
    assert.match(check.stderr, /SHA-256 integrity/);
  });
});

test('check still passes when new records were added after baseline', async (t) => {
  await withFixture(t, async ({ state, platformUrl, dir }) => {
    seedDeployment(state);
    const snapshot = await baselineOk(state, platformUrl, dir);
    state.evidence.set('ev-2', Buffer.from('new-evidence'));
    state.cases.push({ id: 'case-9', name: 'New case', status: 'DRAFT', revision: 1 });
    state.plans.push({ id: 'plan-9', name: 'New plan', caseIds: ['case-9'] });
    state.runs.push({
      id: 'run-2', name: 'Newer run', status: 'PASSED', planId: 'plan-9', caseIds: ['case-9'],
      summary: { passed: 1, failed: 0, total: 1 },
      results: [{ caseId: 'case-9', status: 'PASSED', evidence: [{ id: 'ev-2', name: 'n.png', url: '/api/evidence/ev-2' }] }],
      deviceId: 'dev-1', agentId: 'agent-1',
    });
    const check = await runCli(['check', '--snapshot', snapshot, '--wait-seconds', '2'], { platformUrl, password: state.password, cwd: dir });
    assert.equal(check.code, 0, check.stderr);
  });
});

test('baseline fails on empty deployment and writes no snapshot', async (t) => {
  await withFixture(t, async ({ state, platformUrl, dir }) => {
    const snapshot = path.join(dir, 'persistence.json');
    const result = await runCli(['baseline', '--snapshot', snapshot], { platformUrl, password: state.password, cwd: dir });
    assert.notEqual(result.code, 0);
    assert.match(result.stderr, /empty deployment|no completed PASSED run/);
    assert.ok(!existsSync(snapshot), 'failed baseline must not write a snapshot');
  });
});

test('baseline fails when the only passed run has no evidence and writes no snapshot', async (t) => {
  await withFixture(t, async ({ state, platformUrl, dir }) => {
    state.cases.push({ id: 'case-1', name: 'c', status: 'APPROVED', revision: 1 });
    state.plans.push({ id: 'plan-1', name: 'p', caseIds: ['case-1'] });
    state.runs.push({ id: 'run-9', name: 'barren', status: 'PASSED', caseIds: ['case-1'], summary: { passed: 1, failed: 0, total: 1 }, results: [], deviceId: 'dev-1', agentId: 'agent-1', finishedAt: '2026-10-10T00:00:00Z' });
    const snapshot = path.join(dir, 'persistence.json');
    const result = await runCli(['baseline', '--snapshot', snapshot], { platformUrl, password: state.password, cwd: dir });
    assert.notEqual(result.code, 0);
    assert.match(result.stderr, /no completed PASSED run with nonempty downloadable evidence/);
    assert.ok(!existsSync(snapshot));
  });
});

test('baseline rejects a completed PASSED report lacking finishedAt or resource identity', async (t) => {
  await withFixture(t, async ({ state, platformUrl, dir }) => {
    seedDeployment(state);
    delete state.runs[0].deviceId; // PASSED report with evidence but no identity
    const snapshot = path.join(dir, 'persistence.json');
    const result = await runCli(['baseline', '--snapshot', snapshot], { platformUrl, password: state.password, cwd: dir });
    assert.notEqual(result.code, 0);
    assert.match(result.stderr, /lacks finishedAt\/deviceId\/agentId/);
    assert.ok(!existsSync(snapshot), 'failed baseline must not write a snapshot');
  });
});

test('baseline resolves run identities in devices/agents and rejects missing ones', async (t) => {
  await withFixture(t, async ({ state, platformUrl, dir }) => {
    const snapshot = path.join(dir, 'persistence.json');
    resetState(state);
    seedDeployment(state);
    state.devices = []; // device identity vanished
    const noDevice = await runCli(['baseline', '--snapshot', snapshot], { platformUrl, password: state.password, cwd: dir });
    assert.notEqual(noDevice.code, 0);
    assert.match(noDevice.stderr, /dev-1 which is missing from \/api\/devices/);
    assert.ok(!existsSync(snapshot));
    resetState(state);
    seedDeployment(state);
    state.devices[0].agentId = 'agent-2'; // device reattached to another agent than the run records
    const wrongAgent = await runCli(['baseline', '--snapshot', snapshot], { platformUrl, password: state.password, cwd: dir });
    assert.notEqual(wrongAgent.code, 0);
    assert.match(wrongAgent.stderr, /belongs to agent agent-2/);
    assert.ok(!existsSync(snapshot));
    resetState(state);
    seedDeployment(state);
    state.agents = []; // agent identity vanished
    const noAgent = await runCli(['baseline', '--snapshot', snapshot], { platformUrl, password: state.password, cwd: dir });
    assert.notEqual(noAgent.code, 0);
    assert.match(noAgent.stderr, /agent-1 which is missing from \/api\/agents/);
    assert.ok(!existsSync(snapshot));
  });
});

test('check rejects a vacuous hand-edited snapshot before authenticating', async (t) => {
  await withFixture(t, async ({ state, platformUrl, dir }) => {
    seedDeployment(state);
    const vacuous = path.join(dir, 'vacuous.json');
    writeFileSync(vacuous, JSON.stringify({
      version: 1, createdAt: '2026-10-10T00:00:00Z', platformUrl,
      runIds: [], caseIds: [], planIds: [], reports: [], resources: [],
    }));
    const attemptsBefore = state.loginAttempts;
    const result = await runCli(['check', '--snapshot', vacuous, '--wait-seconds', '1'], { platformUrl, password: state.password, cwd: dir });
    assert.notEqual(result.code, 0);
    assert.match(result.stderr, /vacuous|no integrity reports/);
    assert.equal(state.loginAttempts, attemptsBefore, 'vacuous snapshot must be rejected before authentication');
  });
});

test('check rejects malformed report/evidence/resource metadata before authenticating', async (t) => {
  await withFixture(t, async ({ state, platformUrl, dir }) => {
    seedDeployment(state);
    const snapshot = await baselineOk(state, platformUrl, dir);
    const attemptsAfterBaseline = state.loginAttempts;
    const doc = JSON.parse(readFileSync(snapshot, 'utf8'));
    const cases = [
      ['finishedAt', (d) => { d.reports[0].finishedAt = ''; }, /lacks finishedAt/],
      ['identity', (d) => { d.reports[0].agentId = ''; }, /lacks deviceId\/agentId/],
      ['digest', (d) => { d.reports[0].evidence[0].sha256 = 'not-a-sha256'; }, /lacks a valid SHA-256/],
      ['size', (d) => { d.reports[0].evidence[0].size = 0; }, /lacks a valid size/],
      ['emptyEvidence', (d) => { d.reports[0].evidence = []; }, /has no evidence/],
      ['resource', (d) => { d.resources[0].agentId = ''; }, /a resource lacks deviceId\/agentId/],
    ];
    for (const [name, mutate, pattern] of cases) {
      const broken = JSON.parse(JSON.stringify(doc));
      mutate(broken);
      const file = path.join(dir, `broken-${name}.json`);
      writeFileSync(file, JSON.stringify(broken));
      const result = await runCli(['check', '--snapshot', file, '--wait-seconds', '1'], { platformUrl, password: state.password, cwd: dir });
      assert.notEqual(result.code, 0, `${name} should be rejected`);
      assert.match(result.stderr, pattern, `${name} should name its flaw`);
    }
    assert.equal(state.loginAttempts, attemptsAfterBaseline, 'malformed snapshots must be rejected before authentication');
  });
});

test('check rejects invalid, missing or wrong-version snapshots', async (t) => {
  await withFixture(t, async ({ state, platformUrl, dir }) => {
    seedDeployment(state);
    const missing = path.join(dir, 'nope.json');
    const r1 = await runCli(['check', '--snapshot', missing], { platformUrl, password: state.password, cwd: dir });
    assert.notEqual(r1.code, 0);
    assert.match(r1.stderr, /does not exist/);
    const garbage = path.join(dir, 'garbage.json');
    writeFileSync(garbage, '{not json');
    const r2 = await runCli(['check', '--snapshot', garbage], { platformUrl, password: state.password, cwd: dir });
    assert.notEqual(r2.code, 0);
    assert.match(r2.stderr, /not valid JSON/);
    const wrongVersion = path.join(dir, 'version.json');
    writeFileSync(wrongVersion, JSON.stringify({ version: 99, runIds: ['a'], caseIds: ['b'], planIds: ['c'], reports: [{}], resources: [{}] }));
    const r3 = await runCli(['check', '--snapshot', wrongVersion], { platformUrl, password: state.password, cwd: dir });
    assert.notEqual(r3.code, 0);
    assert.match(r3.stderr, /unsupported version/);
  });
});

test('check fails when the recorded resource identity of a run changes', async (t) => {
  await withFixture(t, async ({ state, platformUrl, dir }) => {
    seedDeployment(state);
    const snapshot = await baselineOk(state, platformUrl, dir);
    state.runs[0].deviceId = 'dev-2'; // same run, different identity
    const check = await runCli(['check', '--snapshot', snapshot, '--wait-seconds', '1'], { platformUrl, password: state.password, cwd: dir });
    assert.notEqual(check.code, 0);
    assert.match(check.stderr, /resource identity changed/);
  });
});

test('check fails when the device was reattached to another agent', async (t) => {
  await withFixture(t, async ({ state, platformUrl, dir }) => {
    seedDeployment(state);
    const snapshot = await baselineOk(state, platformUrl, dir);
    state.devices[0].agentId = 'agent-2';
    state.agents.push({ id: 'agent-2', name: 'agent-two', status: 'ONLINE', targetIds: ['dev-1'] });
    const check = await runCli(['check', '--snapshot', snapshot, '--wait-seconds', '1'], { platformUrl, password: state.password, cwd: dir });
    assert.notEqual(check.code, 0);
    assert.match(check.stderr, /reattached to a different agent/);
  });
});

test('check rejects a snapshot whose resource pair was edited away from the report identity', async (t) => {
  await withFixture(t, async ({ state, platformUrl, dir }) => {
    seedDeployment(state);
    const snapshot = await baselineOk(state, platformUrl, dir);
    const doc = JSON.parse(readFileSync(snapshot, 'utf8'));
    doc.resources[0].agentId = 'agent-2'; // inconsistent with report pair (dev-1, agent-1)
    writeFileSync(snapshot, JSON.stringify(doc));
    // live state "confirms" the forgery: device reattached to agent-2, agent-2 ONLINE
    state.devices[0].agentId = 'agent-2';
    state.agents.push({ id: 'agent-2', name: 'agent-two', status: 'ONLINE', targetIds: ['dev-1'] });
    const attemptsBefore = state.loginAttempts;
    const check = await runCli(['check', '--snapshot', snapshot, '--wait-seconds', '1'], { platformUrl, password: state.password, cwd: dir });
    assert.notEqual(check.code, 0);
    assert.match(check.stderr, /does not match the snapshot resource pair/);
    assert.equal(state.loginAttempts, attemptsBefore, 'inconsistent snapshot must be rejected before authentication');
  });
});

test('wrong password fails without writing snapshot or echoing the password', async (t) => {
  await withFixture(t, async ({ state, platformUrl, dir }) => {
    seedDeployment(state);
    const snapshot = path.join(dir, 'persistence.json');
    const result = await runCli(['baseline', '--snapshot', snapshot], { platformUrl, password: 'wrong-secret', cwd: dir });
    assert.notEqual(result.code, 0);
    assert.match(result.stderr, /authentication failed/);
    assert.ok(!result.stdout.includes('wrong-secret') && !result.stderr.includes('wrong-secret'), 'output echoes the password');
    assert.ok(!existsSync(snapshot));
  });
});

test('cross-origin evidence URL is rejected and the third party never sees the Bearer', async (t) => {
  const fx = makeFixture();
  const trap = makeTrap();
  const port = await listen(fx.server);
  const trapPort = await listen(trap.server);
  const { dir, cleanup } = tempWorkdir();
  t.after(async () => { await close(fx.server); await close(trap.server); cleanup(); });
  const platformUrl = `http://127.0.0.1:${port}`;
  fx.state.cases.push({ id: 'case-1', name: 'c', status: 'APPROVED', revision: 1 });
  fx.state.plans.push({ id: 'plan-1', name: 'p', caseIds: ['case-1'] });
  fx.state.devices.push({ id: 'dev-1', name: 'd', platform: 'web', status: 'IDLE', agentId: 'agent-1' });
  fx.state.agents.push({ id: 'agent-1', name: 'a', status: 'ONLINE', targetIds: ['dev-1'] });
  fx.state.runs.push({
    id: 'run-x', name: 'x', status: 'PASSED', planId: 'plan-1', caseIds: ['case-1'], summary: { passed: 1, failed: 0, total: 1 },
    results: [{ caseId: 'case-1', status: 'PASSED', evidence: [{ id: 'ev-x', name: 'x.png', url: `http://127.0.0.1:${trapPort}/evil.png` }] }],
    deviceId: 'dev-1', agentId: 'agent-1', finishedAt: '2026-10-10T00:00:00Z',
  });
  const snapshot = path.join(dir, 'persistence.json');
  const result = await runCli(['baseline', '--snapshot', snapshot], { platformUrl, password: fx.state.password, cwd: dir });
  assert.notEqual(result.code, 0);
  assert.match(result.stderr, /not same-origin/);
  assert.ok(!existsSync(snapshot));
  assert.ok(trap.seen.every(r => r.authorization == null), 'Bearer leaked to third party');
});

test('evidence redirect is not followed and never forwards the Bearer', async (t) => {
  const fx = makeFixture();
  const trap = makeTrap();
  const port = await listen(fx.server);
  const trapPort = await listen(trap.server);
  const { dir, cleanup } = tempWorkdir();
  t.after(async () => { await close(fx.server); await close(trap.server); cleanup(); });
  const platformUrl = `http://127.0.0.1:${port}`;
  seedDeployment(fx.state);
  fx.state.evidenceRedirect.set('ev-1', `http://127.0.0.1:${trapPort}/redirected.png`);
  const snapshot = path.join(dir, 'persistence.json');
  const baseline = await runCli(['baseline', '--snapshot', snapshot], { platformUrl, password: fx.state.password, cwd: dir });
  assert.notEqual(baseline.code, 0);
  assert.match(baseline.stderr, /unexpected redirect/);
  assert.ok(!existsSync(snapshot));
  assert.ok(trap.seen.every(r => r.authorization == null), 'Bearer followed the redirect');
});

test('error output never echoes credential-bearing evidence URLs', async (t) => {
  await withFixture(t, async ({ state, platformUrl, dir }) => {
    // Same-origin evidence URL that smuggles a token in its query string;
    // the fixture 404s it, so the failure path must not print the query.
    state.cases.push({ id: 'case-1', name: 'c', status: 'APPROVED', revision: 1 });
    state.plans.push({ id: 'plan-1', name: 'p', caseIds: ['case-1'] });
    state.devices.push({ id: 'dev-1', name: 'd', platform: 'web', status: 'IDLE', agentId: 'agent-1' });
    state.agents.push({ id: 'agent-1', name: 'a', status: 'ONLINE', targetIds: ['dev-1'] });
    state.runs.push({
      id: 'run-1', name: 'x', status: 'PASSED', planId: 'plan-1', caseIds: ['case-1'], summary: { passed: 1, failed: 0, total: 1 },
      results: [{ caseId: 'case-1', status: 'PASSED', evidence: [{ id: 'ev-leak', name: 'x.png', url: '/api/evidence/ev-leak?token=secretqueryvalue' }] }],
      deviceId: 'dev-1', agentId: 'agent-1', finishedAt: '2026-10-10T00:00:00Z',
    });
    const snapshot = path.join(dir, 'persistence.json');
    const result = await runCli(['baseline', '--snapshot', snapshot], { platformUrl, password: state.password, cwd: dir });
    assert.notEqual(result.code, 0);
    assert.match(result.stderr, /evidence download failed/);
    assert.ok(!result.stdout.includes('secretqueryvalue') && !result.stderr.includes('secretqueryvalue'), 'error echoes the credential query');
    assert.ok(!existsSync(snapshot));
  });
});

test('synthetic credentials in evidence URLs never leak through any error path', async (t) => {
  await withFixture(t, async ({ state, platformUrl, dir }) => {
    // Runtime-generated synthetic credentials: asserted absent from all
    // output, never interpolated into assertion messages.
    const synPass = `synpass-${randomUUID()}`;
    const synToken = `syntoken-${randomUUID()}`;
    const port = new URL(platformUrl).port;
    state.cases.push({ id: 'case-1', name: 'c', status: 'APPROVED', revision: 1 });
    state.plans.push({ id: 'plan-1', name: 'p', caseIds: ['case-1'] });
    state.devices.push({ id: 'dev-1', name: 'd', platform: 'web', status: 'IDLE', agentId: 'agent-1' });
    state.agents.push({ id: 'agent-1', name: 'a', status: 'ONLINE', targetIds: ['dev-1'] });
    state.evidence.set('ev-1', Buffer.from('evidence-bytes'));
    state.runs.push({
      id: 'run-1', name: 'x', status: 'PASSED', planId: 'plan-1', caseIds: ['case-1'], summary: { passed: 1, failed: 0, total: 1 },
      results: [{ caseId: 'case-1', status: 'PASSED', evidence: [{ id: 'ev-1', name: 'x.png', url: '/api/evidence/ev-1' }] }],
      deviceId: 'dev-1', agentId: 'agent-1', finishedAt: '2026-10-10T00:00:00Z',
    });
    const snapshot = path.join(dir, 'persistence.json');
    const scenarios = [
      ['userinfo+query', `http://user:${synPass}@127.0.0.1:${port}/api/evidence/ev-1?token=${synToken}`, /userinfo/],
      ['path token', `/api/evidence/ev-1-${synToken}`, /evidence download failed \(HTTP 404\)/],
      ['cross-origin host token', `http://${synToken}.example.invalid/evil.png`, /not same-origin/],
    ];
    for (const [name, url, pattern] of scenarios) {
      state.runs[0].results[0].evidence[0].url = url;
      const result = await runCli(['baseline', '--snapshot', snapshot], { platformUrl, password: state.password, cwd: dir });
      assert.notEqual(result.code, 0, `${name}: expected nonzero exit`);
      assert.match(result.stderr, pattern, `${name}: expected a fixed-label error`);
      const combined = `${result.stdout}\n${result.stderr}`;
      assert.ok(!combined.includes(synPass), `${name}: synthetic password leaked`);
      assert.ok(!combined.includes(synToken), `${name}: synthetic token leaked`);
      assert.ok(!existsSync(snapshot), `${name}: failed baseline must not write a snapshot`);
    }
  });
});

test('baseline refuses to write a snapshot whose platform data embeds a current credential', async (t) => {
  await withFixture(t, async ({ state, platformUrl, dir }) => {
    seedDeployment(state);
    const snapshot = path.join(dir, 'persistence.json');
    // server-controlled run name echoes the admin password
    state.runs[0].name = state.password;
    const withPassword = await runCli(['baseline', '--snapshot', snapshot], { platformUrl, password: state.password, cwd: dir });
    assert.notEqual(withPassword.code, 0);
    assert.match(withPassword.stderr, /refusing to write snapshot/);
    assert.ok(!withPassword.stdout.includes(state.password) && !withPassword.stderr.includes(state.password), 'error echoes the password');
    assert.ok(!existsSync(snapshot));
    // server-controlled run name echoes the bearer token (known after login)
    state.runs[0].name = state.token;
    const withToken = await runCli(['baseline', '--snapshot', snapshot], { platformUrl, password: state.password, cwd: dir });
    assert.notEqual(withToken.code, 0);
    assert.match(withToken.stderr, /refusing to write snapshot/);
    assert.ok(!withToken.stdout.includes(state.token) && !withToken.stderr.includes(state.token), 'error echoes the token');
    assert.ok(!existsSync(snapshot));
  });
});

test('PLATFORM_URL with userinfo or query is rejected before any request', async (t) => {
  await withFixture(t, async ({ state, platformUrl, dir }) => {
    seedDeployment(state);
    const attemptsBefore = state.loginAttempts;
    const withUserinfo = platformUrl.replace('http://', 'http://user:pass@');
    const r1 = await runCli(['baseline', '--snapshot', path.join(dir, 's1.json')], { platformUrl: withUserinfo, password: state.password, cwd: dir });
    assert.notEqual(r1.code, 0);
    assert.match(r1.stderr, /must not contain userinfo/);
    const withQuery = `${platformUrl}/?token=abc`;
    const r2 = await runCli(['baseline', '--snapshot', path.join(dir, 's2.json')], { platformUrl: withQuery, password: state.password, cwd: dir });
    assert.notEqual(r2.code, 0);
    assert.match(r2.stderr, /must not contain a query or fragment/);
    assert.equal(state.loginAttempts, attemptsBefore, 'invalid PLATFORM_URL must not reach the platform');
    assert.ok(!existsSync(path.join(dir, 's1.json')) && !existsSync(path.join(dir, 's2.json')));
  });
});

test('check fails while agent is OFFLINE even if the device already shows IDLE', async (t) => {
  await withFixture(t, async ({ state, platformUrl, dir }) => {
    seedDeployment(state);
    const snapshot = await baselineOk(state, platformUrl, dir);
    state.agents[0].status = 'OFFLINE'; // device still IDLE
    const offline = await runCli(['check', '--snapshot', snapshot, '--wait-seconds', '1'], { platformUrl, password: state.password, cwd: dir });
    assert.notEqual(offline.code, 0);
    assert.match(offline.stderr, /agent-1 status OFFLINE/);
    state.agents[0].status = 'ONLINE'; // recovery completes later
    const recovered = await runCli(['check', '--snapshot', snapshot, '--wait-seconds', '3'], { platformUrl, password: state.password, cwd: dir });
    assert.equal(recovered.code, 0, recovered.stderr);
  });
});

test('check fails with nonzero exit when resources never recover before the deadline', async (t) => {
  await withFixture(t, async ({ state, platformUrl, dir }) => {
    seedDeployment(state);
    const snapshot = await baselineOk(state, platformUrl, dir);
    state.devices[0].status = 'BUSY';
    state.agents[0].status = 'OFFLINE';
    const started = Date.now();
    const check = await runCli(['check', '--snapshot', snapshot, '--wait-seconds', '1'], { platformUrl, password: state.password, cwd: dir });
    assert.notEqual(check.code, 0);
    assert.match(check.stderr, /did not recover within 1s/);
    assert.ok(Date.now() - started < 20000, 'check ignored the time limit');
  });
});

test('usage errors exit nonzero without touching the platform', async (t) => {
  await withFixture(t, async ({ state, platformUrl, dir }) => {
    seedDeployment(state);
    const before = state.loginAttempts;
    const noArgs = await runCli([], { platformUrl, password: state.password, cwd: dir });
    assert.equal(noArgs.code, 2);
    const badCommand = await runCli(['frobnicate', '--snapshot', 'x.json'], { platformUrl, password: state.password, cwd: dir });
    assert.equal(badCommand.code, 2);
    const noSnapshot = await runCli(['baseline'], { platformUrl, password: state.password, cwd: dir });
    assert.equal(noSnapshot.code, 2);
    assert.equal(state.loginAttempts, before, 'usage errors must not call the platform');
  });
});
