import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { existsSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';

const base = (process.env.PLATFORM_URL || 'http://127.0.0.1:8080').replace(/\/$/, '');
const password = process.env.PLATFORM_ADMIN_PASSWORD || (existsSync('.env') && readFileSync('.env', 'utf8').match(/^PLATFORM_ADMIN_PASSWORD=(.+)$/m)?.[1]);
assert.ok(password, 'PLATFORM_ADMIN_PASSWORD is required');
let token;
const stamp = Date.now().toString(36), pending = new Map(), evidence = [], checks = [];
const terminal = new Set(['PASSED', 'FAILED', 'CANCELLED', 'TIMED_OUT']);
const hash = value => createHash('sha256').update(value).digest('hex');
const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(k => [k, canonical(value[k])])) : value;
async function request(route, method = 'GET', body, expected = 200, auth = token, xml = false) {
  const response = await fetch(`${base}/api${route}`, { method, redirect: 'error', signal: AbortSignal.timeout(30000), headers: { ...(auth ? { Authorization: `Bearer ${auth}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body && JSON.stringify(body) });
  assert.equal(response.status, expected, route); const text = await response.text(); return xml ? text : text ? JSON.parse(text) : null;
}
async function waitFor(predicate, label, timeout = 120000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) { const value = await predicate(); if (value) return value; await delay(300); }
  throw new Error(`Timed out waiting for ${label}`);
}
async function finish(kind, id) {
  const value = await waitFor(async () => { const v = await request(`/${kind}/${id}`); return terminal.has(v.status) && v; }, id);
  pending.delete(id); return value;
}
function span(value, label) {
  assert.ok(value && typeof value.startedAt === 'string' && typeof value.finishedAt === 'string', label);
  const start = Date.parse(value.startedAt), end = Date.parse(value.finishedAt);
  assert.ok(Number.isFinite(start) && Number.isFinite(end) && start <= end, label); return [start, end];
}
async function inspect(run) {
  assert.equal(run.status, 'FAILED'); assert.equal(run.gate.status, 'BLOCKED'); assert.equal(run.summary.passed, 1); assert.equal(run.summary.failed, 1);
  for (const result of run.results) {
    const [start, end] = span(result.timing, 'real case time'); assert.ok(result.steps.length > 0);
    for (const step of result.steps) { const [a, b] = span(step.timing, 'real step time'); assert.ok(a >= start && b <= end); }
    assert.ok(result.evidence.some(e => e.capture?.kind === 'video'));
    assert.ok(result.evidence.some(e => e.capture?.kind === 'screenshot'));
    assert.ok(result.evidence.some(e => e.capture?.kind === 'trace'));
    for (const item of result.evidence) {
      const capture = item.capture; assert.ok(capture); const [a, b] = span(capture, 'real capture interval');
      if (capture.kind !== 'log') { assert.equal(capture.caseId, result.caseId); assert.ok(a >= start && b <= end); }
      const url = new URL(item.url, base); assert.equal(url.origin, new URL(base).origin);
      const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, redirect: 'error' }); assert.equal(response.status, 200);
      const data = Buffer.from(await response.arrayBuffer()); assert.ok(data.length > 0);
      assert.equal((await fetch(url, { redirect: 'error' })).status, 401);
      evidence.push({ runId: run.id, caseId: result.caseId, id: item.id, name: item.name, capture, size: data.length, sha256: hash(data) });
    }
  }
  const failed = run.results.find(r => r.status === 'FAILED');
  const step = failed.steps.find(s => s.status === 'FAILED'); assert.ok(step?.timing); assert.match(failed.error, /expected/);
  assert.ok(run.logs.some(line => typeof line === 'string' && /^\d{4}-\d\d-\d\dT.*Z Timeline/.test(line)), 'Actual page console logs have source timestamps');
  const video = failed.evidence.find(e => e.capture.kind === 'video');
  assert.ok(Date.parse(video.capture.startedAt) <= Date.parse(step.timing.finishedAt));
  assert.ok(Date.parse(step.timing.finishedAt) <= Date.parse(video.capture.finishedAt));
  return { runId: run.id, browser: run.deviceFingerprint.browser, version: run.deviceFingerprint.version, failedCaseId: failed.caseId,
    failedStepIndex: failed.steps.indexOf(step), failureAt: step.timing.finishedAt, videoId: video.id,
    expectedSeekSeconds: (Date.parse(step.timing.finishedAt) - Date.parse(video.capture.startedAt)) / 1000,
    metadataHash: hash(JSON.stringify(canonical(run.results))), junitHash: hash(await request(`/runs/${run.id}/junit`, 'GET', undefined, 200, token, true)), gateJunitHash: hash(await request(`/runs/${run.id}/gate-junit`, 'GET', undefined, 200, token, true)) };
}
const server = createServer((req, res) => {
  const ok = req.url.startsWith('/pass');
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(`<!doctype html><html><body><h1 id="result">${ok ? 'expected' : 'actual failure'}</h1><p>Real timeline acceptance</p><script>console.log('Timeline page loaded');setInterval(()=>console.log('Timeline live tick '+Date.now()),250);</script></body></html>`);
});
await new Promise((resolve, reject) => { server.once('error', reject); server.listen(8094, '0.0.0.0', resolve); });
const url = (process.env.TIMELINE_TARGET_URL || 'http://127.0.0.1:8094').replace(/\/$/, '');
try {
  await waitFor(async () => { try { return (await fetch(`${base}/api/health`)).ok; } catch { return false; } }, 'platform');
  token = (await request('/auth/login', 'POST', { username: 'admin', password })).token;
  await waitFor(async () => { const ds = await request('/devices'); return ['chromium', 'firefox'].every(b => ds.some(d => d.browser === b && d.status === 'IDLE')); }, 'real browser resources');
  const cases = [];
  for (const mode of ['pass', 'fail']) {
    const c = await request('/cases', 'POST', { name: `Timeline ${mode} ${stamp}`, platform: 'web', framework: 'playwright', suite: 'regression', steps: [{ action: 'goto', target: `${url}/${mode}` }, { action: 'screenshot' }, { action: 'expectText', target: '#result', value: 'expected' }] });
    await request(`/cases/${c.id}/approve`, 'POST', { revision: c.revision }); cases.push(c);
  }
  const plan = await request('/plans', 'POST', { name: `Timeline acceptance ${stamp}`, caseIds: cases.map(c => c.id), capabilities: { platform: 'web', browser: 'chromium' }, queueTimeoutSeconds: 30, executionTimeoutSeconds: 60 });
  const created = await request('/runs', 'POST', { planId: plan.id, name: `Actual timeline ${stamp}`, commitSha: process.env.GITHUB_SHA || `timeline-${stamp}` }); pending.set(created.id, 'runs');
  const run = await finish('runs', created.id); const runs = [await inspect(run)];
  checks.push('actual passing and failing case with source times', 'case-step interval containment', 'capture case ownership and intervals', 'real screenshots video trace and shared log', 'nonempty authenticated evidence SHA256', 'actual page console source timestamps', 'failure point lies in video capture', 'original FAILED and blocked gate preserved');
  const matrixCreated = await request('/matrices', 'POST', { planId: plan.id, name: `Actual timeline browser matrix ${stamp}`, commitSha: process.env.GITHUB_SHA || `timeline-${stamp}`, variants: ['chromium', 'firefox'].map(browser => ({ label: browser, capabilities: { browser } })) }); pending.set(matrixCreated.id, 'matrices');
  const matrix = await finish('matrices', matrixCreated.id); assert.equal(matrix.status, 'FAILED'); assert.equal(matrix.gate.status, 'BLOCKED');
  for (const v of matrix.variants) runs.push(await inspect(await request(`/runs/${v.runId}`)));
  const xml = await request(`/matrices/${matrix.id}/junit`, 'GET', undefined, 200, token, true); assert.equal((xml.match(/<testsuite\b/g) || []).length, 2); assert.match(xml, /<failure\b/);
  checks.push('actual Chromium and Firefox timeline matrix', 'original matrix JUnit and gate still truthful');
  assert.equal(runs.find(r => r.browser === 'firefox').version, matrix.variants.find(v => v.label === 'firefox').deviceFingerprint.version);
  await waitFor(async () => { const ds = await request('/devices'); return ['chromium', 'firefox'].every(b => ds.some(d => d.browser === b && d.status === 'IDLE')); }, 'cleanup'); checks.push('real browser resources clean after failure');
  console.log(JSON.stringify({ status: 'verified', planId: plan.id, runId: run.id, matrixId: matrix.id, caseIds: cases.map(c => c.id), runs, evidence, checks }, null, 2));
} finally {
  for (const [id, kind] of pending) await request(`/${kind}/${id}/cancel`, 'POST', {}).catch(() => {});
  server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
}
