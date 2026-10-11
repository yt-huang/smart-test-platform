import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { existsSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { runCommand } from '../cli/src/run.js';

const base = (process.env.PLATFORM_URL || 'http://127.0.0.1:8080').replace(/\/$/, '');
const password = process.env.PLATFORM_ADMIN_PASSWORD || (existsSync('.env') && readFileSync('.env', 'utf8').match(/^PLATFORM_ADMIN_PASSWORD=(.+)$/m)?.[1]);
assert.ok(password, 'PLATFORM_ADMIN_PASSWORD is required');
let token;
const terminal = new Set(['PASSED', 'FAILED', 'CANCELLED']);
const variants = ['chromium', 'firefox'].map(browser => ({ label: browser, capabilities: { browser } }));
async function request(route, method = 'GET', body, expected = 200, auth = token, xml = false) {
  const response = await fetch(`${base}/api${route}`, {
    method, redirect: 'error', signal: AbortSignal.timeout(30000),
    headers: { ...(auth ? { Authorization: `Bearer ${auth}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body && JSON.stringify(body),
  });
  assert.equal(response.status, expected, `${method} ${route}: unexpected HTTP status`);
  const text = await response.text();
  return xml ? text : text ? JSON.parse(text) : null;
}
async function waitFor(predicate, label, timeout = 120000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) { const result = await predicate(); if (result) return result; await delay(300); }
  throw new Error(`Timed out waiting for ${label}`);
}
const target = createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end('<!doctype html><html><body><h1>Matrix acceptance target</h1><label for="username">Username</label><input id="username"><button id="login">Login</button><p id="welcome"></p><p id="engine"></p><script>document.querySelector("#login").onclick=()=>document.querySelector("#welcome").textContent="Welcome "+document.querySelector("#username").value;document.querySelector("#engine").textContent=navigator.userAgent.includes("Firefox/")?"firefox":"chromium";</script></body></html>');
});
await new Promise((resolve, reject) => { target.once('error', reject); target.listen(8092, '0.0.0.0', resolve); });
const targetUrl = process.env.MATRIX_TARGET_URL || 'http://127.0.0.1:8092/';
const stamp = Date.now().toString(36);
const outputs = [];
const pending = new Set();
try {
  await waitFor(async () => { try { return (await fetch(`${base}/api/health`)).ok; } catch { return false; } }, 'platform readiness');
  token = (await request('/auth/login', 'POST', { username: 'admin', password })).token;
  await request('/matrices', 'GET', undefined, 401, null);
  const devices = await waitFor(async () => {
    const ds = await request('/devices');
    return variants.every(v => ds.some(d => d.browser === v.label && d.status === 'IDLE')) && ds;
  }, 'two real, clean browser resources');
  assert.ok(devices.find(d => d.browser === 'chromium')?.version);
  assert.ok(devices.find(d => d.browser === 'firefox')?.version);
  const steps = [
    { action: 'goto', target: targetUrl }, { action: 'fill', target: '#username', value: 'matrix-qa' },
    { action: 'click', target: '#login' }, { action: 'expectText', target: '#welcome', value: 'Welcome matrix-qa' },
    { action: 'screenshot' },
  ];
  const testCase = await request('/cases', 'POST', { name: `Matrix PASS ${stamp}`, platform: 'web', framework: 'playwright', suite: 'regression', steps });
  const plan = await request('/plans', 'POST', { name: `Matrix acceptance ${stamp}`, caseIds: [testCase.id], capabilities: { platform: 'web', browser: 'chromium', provider: 'local', tags: [] }, queueTimeoutSeconds: 30, executionTimeoutSeconds: 60 });
  const input = { planId: plan.id, name: `Browser matrix ${stamp}`, commitSha: process.env.GITHUB_SHA || 'matrix-acceptance', variants };
  await request('/matrices', 'POST', input, 400);
  await request(`/cases/${testCase.id}/approve`, 'POST', { revision: testCase.revision });
  const before = { runs: (await request('/runs')).length, matrices: (await request('/matrices')).length };
  await request('/matrices', 'POST', { ...input, variants: [variants[0], { label: 'invalid', capabilities: { browser: 'unsupported' } }] }, 400);
  await request('/matrices', 'POST', { ...input, variants: [variants[0], { label: 'duplicate', capabilities: { browser: 'chromium' } }] }, 400);
  assert.equal((await request('/runs')).length, before.runs, 'Invalid submission creates no partial runs');
  assert.equal((await request('/matrices')).length, before.matrices, 'Invalid submission creates no partial matrix');

  const created = await request('/matrices', 'POST', input); pending.add(created.id);
  assert.equal(created.variants.length, 2);
  const passed = await waitFor(async () => { const m = await request(`/matrices/${created.id}`); return terminal.has(m.status) && m; }, 'real passing browser matrix'); pending.delete(created.id);
  assert.equal(passed.status, 'PASSED');
  assert.equal(passed.summary.totalVariants, 2); assert.equal(passed.summary.completedVariants, 2);
  assert.equal(passed.summary.passedVariants, 2); assert.equal(passed.summary.total, 2); assert.equal(passed.summary.passed, 2);
  const evidence = [];
  for (const variant of passed.variants) {
    assert.equal(variant.status, 'PASSED'); assert.equal(variant.deviceFingerprint.browser, variant.capabilities.browser);
    assert.ok(variant.deviceFingerprint.version, 'Actual browser version is recorded');
    const run = await request(`/runs/${variant.runId}`);
    assert.equal(run.matrixId, passed.id); assert.equal(run.matrixLabel, variant.label); assert.equal(run.commitSha, input.commitSha);
    for (const item of run.results.flatMap(r => r.evidence || [])) {
      const url = new URL(item.url, base); assert.equal(url.origin, new URL(base).origin);
      const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, redirect: 'error' });
      assert.equal(response.status, 200); const data = Buffer.from(await response.arrayBuffer()); assert.ok(data.length > 0);
      assert.equal((await fetch(url, { redirect: 'error' })).status, 401);
      evidence.push({ runId: run.id, id: item.id, size: data.length, sha256: createHash('sha256').update(data).digest('hex') });
    }
  }
  assert.ok(evidence.length >= 4, 'Both targets upload real nonempty evidence');
  const xml = await request(`/matrices/${passed.id}/junit`, 'GET', undefined, 200, token, true);
  assert.match(xml, /<testsuites\b/); assert.equal((xml.match(/<testsuite\b/g) || []).length, 2);
  assert.match(xml, /chromium/); assert.match(xml, /firefox/); assert.doesNotMatch(xml, /<failure\b|<error\b/);

  const bad = await request('/cases', 'POST', { name: `Matrix browser-specific assertion ${stamp}`, platform: 'web', framework: 'playwright', suite: 'regression', steps: [...steps, { action: 'expectText', target: '#engine', value: 'chromium' }] });
  await request(`/cases/${bad.id}/approve`, 'POST', { revision: bad.revision });
  const mixedPlan = await request('/plans', 'POST', { ...plan, name: `Mixed result matrix ${stamp}`, caseIds: [bad.id] });
  const mixedCreated = await request('/matrices', 'POST', { ...input, planId: mixedPlan.id, name: `Mixed browser matrix ${stamp}` }); pending.add(mixedCreated.id);
  const mixed = await waitFor(async () => { const m = await request(`/matrices/${mixedCreated.id}`); return terminal.has(m.status) && m; }, 'browser-specific real assertion failure'); pending.delete(mixedCreated.id);
  assert.equal(mixed.status, 'FAILED'); assert.equal(mixed.summary.passedVariants, 1); assert.equal(mixed.summary.failedVariants, 1);
  assert.equal(mixed.variants.find(v => v.label === 'chromium').status, 'PASSED');
  assert.equal(mixed.variants.find(v => v.label === 'firefox').status, 'FAILED');
  const quality = (await request('/quality')).find(q => q.caseId === bad.id);
  assert.ok(quality); assert.equal(quality.executions, 2);
  assert.equal(quality.ewmaScore, 0, 'Cross-browser compatibility difference is not a flaky flip');
  assert.equal(quality.quarantined, false);
  const failedXml = await request(`/matrices/${mixed.id}/junit`, 'GET', undefined, 200, token, true);
  assert.match(failedXml, /<failure\b/);

  const unmatched = variants.map(v => ({ ...v, capabilities: { ...v.capabilities, version: '=0' } }));
  const queued = await request('/matrices', 'POST', { ...input, name: `Cancelled matrix ${stamp}`, variants: unmatched }); pending.add(queued.id);
  assert.equal(queued.status, 'QUEUED');
  await request(`/matrices/${queued.id}/junit`, 'GET', undefined, 409);
  const cancelled = await request(`/matrices/${queued.id}/cancel`, 'POST', {}); pending.delete(queued.id);
  assert.equal(cancelled.status, 'CANCELLED'); assert.ok(cancelled.variants.every(v => v.status === 'CANCELLED'));
  assert.equal((await request(`/matrices/${queued.id}/cancel`, 'POST', {})).status, 'CANCELLED');
  const cancelledXml = await request(`/matrices/${queued.id}/junit`, 'GET', undefined, 200, token, true);
  assert.match(cancelledXml, /<error\b/, 'Unexecuted cancellation is not exported as passing tests');

  const timeoutPlan = await request('/plans', 'POST', { ...plan, name: `Queue timeout matrix ${stamp}`, queueTimeoutSeconds: 2 });
  const timeoutCreated = await request('/matrices', 'POST', { ...input, planId: timeoutPlan.id, name: `Timed out matrix ${stamp}`, variants: unmatched }); pending.add(timeoutCreated.id);
  const timedOut = await waitFor(async () => { const m = await request(`/matrices/${timeoutCreated.id}`); return terminal.has(m.status) && m; }, 'matrix queue timeout', 15000); pending.delete(timeoutCreated.id);
  assert.equal(timedOut.status, 'FAILED'); assert.ok(timedOut.variants.every(v => v.status === 'TIMED_OUT'));
  assert.equal(timedOut.summary.failedVariants, 2);

  const viewerName = `matrix-viewer-${stamp}`, viewerPassword = `Matrix-viewer-${stamp}-password`;
  await request('/users', 'POST', { username: viewerName, displayName: 'Matrix acceptance viewer', password: viewerPassword, role: 'VIEWER' });
  const viewer = (await request('/auth/login', 'POST', { username: viewerName, password: viewerPassword })).token;
  assert.equal((await request(`/matrices/${passed.id}`, 'GET', undefined, 200, viewer)).status, 'PASSED');
  await request('/matrices', 'POST', input, 403, viewer);
  await request(`/matrices/${passed.id}/cancel`, 'POST', {}, 403, viewer);
  const logs = [], errors = [];
  const cliExit = await runCommand(['matrix', '--plan', plan.id, '--browsers', 'chromium,firefox', '--timeout', '90', '--poll-interval', '300'], { PLATFORM_URL: base, PLATFORM_TOKEN: token }, { out: line => logs.push(line), err: line => errors.push(line) });
  assert.equal(cliExit, 0, 'Real passing matrix CLI exits 0'); assert.equal(errors.length, 0);
  assert.ok(logs.some(line => line.includes('/#/matrices/')), 'CLI prints matrix report URL');
  const failExit = await runCommand(['matrix', '--plan', mixedPlan.id, '--browsers', 'chromium,firefox', '--timeout', '90', '--poll-interval', '300'], { PLATFORM_URL: base, PLATFORM_TOKEN: token }, { out: line => outputs.push(line), err: line => errors.push(line) });
  assert.equal(failExit, 1, 'Real mixed-result matrix CLI exits 1');
  await waitFor(async () => { const ds = await request('/devices'); return variants.every(v => ds.some(d => d.browser === v.label && d.status === 'IDLE')); }, 'both resources cleanup');
  console.log(JSON.stringify({ status: 'verified', passedMatrixId: passed.id, mixedMatrixId: mixed.id, cancelledMatrixId: cancelled.id, timedOutMatrixId: timedOut.id, planId: plan.id, browsers: passed.variants.map(v => ({ browser: v.deviceFingerprint.browser, version: v.deviceFingerprint.version, runId: v.runId })), evidence, cliExitCodes: [cliExit, failExit], checks: ['approval gate', 'atomic invalid submission', 'duplicate target rejection', 'real Chromium + Firefox pass', 'real browser-specific failure', 'environment-aware quality', 'authenticated evidence', 'target fingerprints', 'aggregate JUnit', 'active export rejection', 'idempotent cancel', 'queue timeout', 'viewer RBAC', 'real CLI success/failure', 'resource cleanup'] }, null, 2));
} finally {
  for (const id of pending) await request(`/matrices/${id}/cancel`, 'POST', {}).catch(() => {});
  target.closeAllConnections(); await new Promise(resolve => target.close(resolve));
}
