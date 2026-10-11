import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { existsSync, readFileSync } from 'node:fs';
import { mkdir, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { runCommand } from '../cli/src/run.js';

// Acceptance harness: these are real approved cases and browser assertions against
// a temporary controlled HTTP page. No Agent results or quality metrics are seeded.
const base = (process.env.PLATFORM_URL || 'http://127.0.0.1:8080').replace(/\/$/, '');
const password = process.env.PLATFORM_ADMIN_PASSWORD || (existsSync('.env') && readFileSync('.env', 'utf8').match(/^PLATFORM_ADMIN_PASSWORD=(.+)$/m)?.[1]);
assert.ok(password, 'PLATFORM_ADMIN_PASSWORD is required');
let token, healthy = true;
const stamp = Date.now().toString(36), commit = process.env.GITHUB_SHA || `gate-acceptance-${stamp}`;
const terminal = new Set(['PASSED', 'FAILED', 'CANCELLED', 'TIMED_OUT']);
const pending = new Map(), cliIds = [], evidence = [], checks = [];
const hash = value => createHash('sha256').update(value).digest('hex');
async function request(route, method = 'GET', body, expected = 200, auth = token, xml = false) {
  const response = await fetch(`${base}/api${route}`, { method, redirect: 'error', signal: AbortSignal.timeout(30000), headers: { ...(auth ? { Authorization: `Bearer ${auth}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body && JSON.stringify(body) });
  assert.equal(response.status, expected, `${method} ${route}: unexpected HTTP status`);
  const text = await response.text(); return xml ? text : text ? JSON.parse(text) : null;
}
async function waitFor(predicate, label, timeout = 120000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) { const value = await predicate(); if (value) return value; await delay(300); }
  throw new Error(`Timed out waiting for ${label}`);
}
function validateGate(value, status) {
  const g = value.gate; assert.ok(g); assert.equal(g.status, status);
  for (const key of ['total', 'passed', 'blockingFailures', 'quarantinedFailures', 'infrastructureFailures']) assert.ok(Number.isSafeInteger(g[key]) && g[key] >= 0, key);
  assert.ok(g.total > 0); assert.equal(g.total, value.summary.total);
  if (status !== 'PENDING') assert.equal(g.passed + g.blockingFailures + g.quarantinedFailures, g.total);
  if (status === 'WARN') { assert.equal(g.blockingFailures, 0); assert.equal(g.infrastructureFailures, 0); assert.ok(g.quarantinedFailures > 0); assert.equal(value.status, 'FAILED'); }
  return g;
}
async function finish(route, id) {
  const value = await waitFor(async () => { const v = await request(`/${route}/${id}`); return terminal.has(v.status) && v; }, `${route} ${id}`);
  pending.delete(id); return value;
}
async function startRun(planId, name, extra = {}) {
  const r = await request('/runs', 'POST', { planId, name, commitSha: commit, ...extra }); pending.set(r.id, 'runs'); return finish('runs', r.id);
}
const server = createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(`<!doctype html><html><body><h1>Gate acceptance page</h1><p id="gate-status">${healthy ? 'approved' : 'temporarily &lt;offline&gt; &amp; failing'}</p></body></html>`);
});
await new Promise((resolve, reject) => { server.once('error', reject); server.listen(8093, '0.0.0.0', resolve); });
const url = process.env.GATE_TARGET_URL || 'http://127.0.0.1:8093/';
try {
  await waitFor(async () => { try { return (await fetch(`${base}/api/health`)).ok; } catch { return false; } }, 'platform readiness');
  token = (await request('/auth/login', 'POST', { username: 'admin', password })).token;
  await waitFor(async () => { const ds = await request('/devices'); return ['chromium', 'firefox'].every(b => ds.some(d => d.browser === b && d.status === 'IDLE')); }, 'real clean Chromium and Firefox');
  const c = await request('/cases', 'POST', { name: `Gate actual assertion ${stamp}`, platform: 'web', framework: 'playwright', suite: 'regression', steps: [{ action: 'goto', target: url }, { action: 'expectText', target: '#gate-status', value: 'approved' }, { action: 'screenshot' }] });
  await request(`/cases/${c.id}/approve`, 'POST', { revision: c.revision });
  const plan = await request('/plans', 'POST', { name: `Gate acceptance ${stamp}`, caseIds: [c.id], capabilities: { platform: 'web', browser: 'chromium', provider: 'local', tags: [] }, queueTimeoutSeconds: 30, executionTimeoutSeconds: 60 });
  const passed = await startRun(plan.id, `Gate baseline PASS ${stamp}`, { gate: { status: 'WARN', quarantinedCaseIds: [c.id] }, quarantinedCaseIds: [c.id] });
  assert.equal(passed.status, 'PASSED'); validateGate(passed, 'PASSED'); assert.deepEqual(passed.gate.quarantinedCaseIds, []);
  assert.equal(passed.deviceFingerprint.browser, 'chromium'); assert.ok(passed.deviceFingerprint.version);
  checks.push('real baseline assertion and server-owned snapshot');

  healthy = false;
  const firstFailed = await startRun(plan.id, `Gate first actual failure ${stamp}`);
  assert.equal(firstFailed.status, 'FAILED'); validateGate(firstFailed, 'BLOCKED'); assert.equal(firstFailed.gate.blockingFailures, 1); assert.equal(firstFailed.gate.quarantinedFailures, 0);
  const metric = (await request('/quality')).find(q => q.caseId === c.id);
  assert.equal(metric.quarantined, true); assert.ok(metric.ewmaScore >= 0.15);
  checks.push('real same-commit assertion flip triggers quarantine without retroactive release');

  const warning = await startRun(plan.id, `Gate quarantined actual failure ${stamp}`);
  assert.equal(warning.results[0].status, 'FAILED'); validateGate(warning, 'WARN'); assert.deepEqual(warning.gate.quarantinedCaseIds, [c.id]);
  assert.equal(warning.gate.quarantinedFailures, 1); assert.match(warning.results[0].error, /approved/);
  const rawXml = await request(`/runs/${warning.id}/junit`, 'GET', undefined, 200, token, true);
  const gateXml = await request(`/runs/${warning.id}/gate-junit`, 'GET', undefined, 200, token, true);
  assert.match(rawXml, /<failure\b/); assert.match(gateXml, /<skipped\b/); assert.doesNotMatch(gateXml, /<failure\b|<error\b/); assert.match(gateXml, /approved/);
  checks.push('quarantined case still executes and preserves raw failure plus gated skipped report');
  for (const item of warning.results.flatMap(r => r.evidence || [])) {
    const u = new URL(item.url, base); assert.equal(u.origin, new URL(base).origin);
    const response = await fetch(u, { headers: { Authorization: `Bearer ${token}` }, redirect: 'error' }); assert.equal(response.status, 200);
    const bytes = Buffer.from(await response.arrayBuffer()); assert.ok(bytes.length > 0); assert.equal((await fetch(u, { redirect: 'error' })).status, 401);
    evidence.push({ id: item.id, runId: warning.id, size: bytes.length, sha256: hash(bytes) });
  }
  assert.ok(evidence.length >= 4); checks.push('actual failed browser evidence is nonempty, authenticated and hashed');

  const cli = async (args, filename) => {
    const lines = [], errors = [];
    const result = await runCommand([...args, '--timeout', '90', '--poll-interval', '300', '--commit', commit, ...(filename ? ['--junit', filename] : [])], { PLATFORM_URL: base, PLATFORM_TOKEN: token }, { out: v => lines.push(v), err: v => errors.push(v) });
    const id = lines.find(v => /^(Run|Matrix) /.test(v))?.split(' ')[1]?.replace(/:$/, ''); if (id) cliIds.push(id);
    return { result, lines, errors, id };
  };
  await mkdir('.data/gate-acceptance', { recursive: true });
  const gated = await cli(['run', '--plan', plan.id, '--gate'], '.data/gate-acceptance/cli-gate.xml');
  assert.equal(gated.result, 0); assert.ok(gated.lines.some(v => /WARN/.test(v))); assert.match(await readFile('.data/gate-acceptance/cli-gate.xml', 'utf8'), /<skipped\b/);
  const strict = await cli(['run', '--plan', plan.id]); assert.equal(strict.result, 1);
  for (const id of [gated.id, strict.id]) { const run = await request(`/runs/${id}`); assert.equal(run.status, 'FAILED'); validateGate(run, 'WARN'); }
  checks.push('real CLI gate 0 and strict 1 both retain actual FAILED');

  const variants = ['chromium', 'firefox'].map(browser => ({ label: browser, capabilities: { browser } }));
  const m = await request('/matrices', 'POST', { planId: plan.id, name: `Gate actual warning matrix ${stamp}`, commitSha: commit, variants }); pending.set(m.id, 'matrices');
  const matrix = await finish('matrices', m.id); validateGate(matrix, 'WARN'); assert.equal(matrix.gate.total, 2); assert.equal(matrix.gate.quarantinedFailures, 2);
  for (const variant of matrix.variants) { validateGate(variant, 'WARN'); assert.ok(variant.deviceFingerprint.version); }
  const matrixGateXml = await request(`/matrices/${matrix.id}/gate-junit`, 'GET', undefined, 200, token, true);
  assert.equal((matrixGateXml.match(/<testsuite\b/g) || []).length, 2); assert.equal((matrixGateXml.match(/<skipped\b/g) || []).length, 2); assert.doesNotMatch(matrixGateXml, /<failure\b|<error\b/);
  checks.push('real Chromium and Firefox warning matrix with legal target aggregates');
  const gatedMatrix = await cli(['matrix', '--plan', plan.id, '--browsers', 'chromium,firefox', '--gate']); assert.equal(gatedMatrix.result, 0); checks.push('real matrix CLI gate warning returns 0');

  const queued = await request('/runs', 'POST', { planId: plan.id, name: `Gate snapshot queued ${stamp}`, capabilities: { platform: 'web', browser: 'chromium', version: '=0' } }); pending.set(queued.id, 'runs');
  validateGate(queued, 'PENDING'); assert.deepEqual(queued.gate.quarantinedCaseIds, [c.id]);
  await request(`/runs/${queued.id}/gate-junit`, 'GET', undefined, 409); await request(`/runs/${warning.id}/gate-junit`, 'GET', undefined, 401, null);
  const gateHash = hash(JSON.stringify(warning.gate)), xmlHash = hash(gateXml), matrixHash = hash(matrixGateXml);
  await request(`/quality/${c.id}/release`, 'POST', { reason: 'Acceptance confirms approved snapshot and controlled assertion change; restore strict gate for new submissions.' });
  assert.equal((await request('/quality')).find(q => q.caseId === c.id).quarantined, false);
  assert.equal(hash(JSON.stringify((await request(`/runs/${warning.id}`)).gate)), gateHash);
  assert.equal(hash(await request(`/runs/${warning.id}/gate-junit`, 'GET', undefined, 200, token, true)), xmlHash);
  assert.equal(hash(await request(`/matrices/${matrix.id}/gate-junit`, 'GET', undefined, 200, token, true)), matrixHash);
  assert.deepEqual((await request(`/runs/${queued.id}`)).gate.quarantinedCaseIds, [c.id]);
  checks.push('active export 409, anonymous 401 and manual release leaves frozen snapshots and XML hashes unchanged');
  const cancelled = await request(`/runs/${queued.id}/cancel`, 'POST', {}); pending.delete(queued.id); validateGate(cancelled, 'BLOCKED'); assert.ok(cancelled.gate.infrastructureFailures > 0);
  assert.deepEqual(cancelled.gate.quarantinedCaseIds, [c.id]); assert.match(await request(`/runs/${cancelled.id}/gate-junit`, 'GET', undefined, 200, token, true), /<error\b/);
  checks.push('quarantine does not hide cancellation infrastructure error');

  const released = await startRun(plan.id, `Gate failure after reviewed release ${stamp}`); validateGate(released, 'BLOCKED'); assert.equal(released.gate.quarantinedFailures, 0); assert.equal(released.gate.blockingFailures, 1);
  checks.push('new submission after release blocks actual assertion failure');
  const timeoutPlan = await request('/plans', 'POST', { ...plan, name: `Gate unavailable ${stamp}`, queueTimeoutSeconds: 2 });
  const tm = await request('/matrices', 'POST', { planId: timeoutPlan.id, name: `Gate real queue timeout ${stamp}`, variants: variants.map(v => ({ ...v, capabilities: { ...v.capabilities, version: '=0' } })) }); pending.set(tm.id, 'matrices');
  const timedOut = await finish('matrices', tm.id); validateGate(timedOut, 'BLOCKED'); assert.equal(timedOut.gate.infrastructureFailures, 2); checks.push('unavailable target timeout matrix always blocks');

  const viewerName = `gate-viewer-${stamp}`, viewerPassword = `Gate-viewer-${stamp}-password`;
  await request('/users', 'POST', { username: viewerName, password: viewerPassword, displayName: 'Gate acceptance viewer', role: 'VIEWER' });
  const viewer = (await request('/auth/login', 'POST', { username: viewerName, password: viewerPassword })).token;
  assert.equal((await request(`/runs/${warning.id}`, 'GET', undefined, 200, viewer)).gate.status, 'WARN');
  assert.equal(await request(`/runs/${warning.id}/gate-junit`, 'GET', undefined, 200, viewer, true), gateXml);
  await request(`/quality/${c.id}/release`, 'POST', { reason: 'Readonly users cannot release' }, 403, viewer);
  await request('/runs', 'POST', { planId: plan.id }, 403, viewer); checks.push('VIEWER reads gate and exports but cannot release or execute');
  await waitFor(async () => { const ds = await request('/devices'); return ['chromium', 'firefox'].every(b => ds.some(d => d.browser === b && d.status === 'IDLE')); }, 'resources cleaned');
  checks.push('browser resources recovered cleanly');
  console.log(JSON.stringify({ status: 'verified', caseId: c.id, planId: plan.id, commit, passedRunId: passed.id, firstFailedRunId: firstFailed.id, warningRunId: warning.id, warningMatrixId: matrix.id, cancelledRunId: cancelled.id, releasedFailedRunId: released.id, timedOutMatrixId: timedOut.id, cliExecutionIds: cliIds, cliExitCodes: [gated.result, strict.result, gatedMatrix.result], gateHash, gateJunitHash: xmlHash, matrixGateJunitHash: matrixHash, evidence, browsers: matrix.variants.map(v => ({ browser: v.deviceFingerprint.browser, version: v.deviceFingerprint.version })), checks }, null, 2));
} finally {
  for (const [id, kind] of pending) await request(`/${kind}/${id}/cancel`, 'POST', {}).catch(() => {});
  server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
}
