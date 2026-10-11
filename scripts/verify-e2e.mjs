import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';

const base = (process.env.PLATFORM_URL || 'http://127.0.0.1:8080').replace(/\/$/, '');
const password = process.env.PLATFORM_ADMIN_PASSWORD || (existsSync('.env') && readFileSync('.env', 'utf8').match(/^PLATFORM_ADMIN_PASSWORD=(.+)$/m)?.[1]);
assert.ok(password, 'PLATFORM_ADMIN_PASSWORD is required');
let token;
async function api(path, method = 'GET', body, expected = 200, auth = token) {
  const response = await fetch(`${base}/api${path}`, { method, headers: { ...(auth ? { Authorization: `Bearer ${auth}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body && JSON.stringify(body) });
  const text = await response.text();
  assert.equal(response.status, expected, `${method} ${path}: ${text}`);
  return text ? JSON.parse(text) : null;
}
async function waitFor(predicate, label, timeout = 90000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const result = await predicate();
    if (result) return result;
    await delay(500);
  }
  throw new Error(`Timed out waiting for ${label}`);
}
const target = createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end('<!doctype html><html><body><h1>Acceptance target</h1><label for="username">Username</label><input id="username"><button id="login">Login</button><p id="welcome"></p><script>document.querySelector("#login").onclick=()=>document.querySelector("#welcome").textContent="Welcome "+document.querySelector("#username").value</script></body></html>');
});
await new Promise(resolve => target.listen(8091, '0.0.0.0', resolve));
const targetUrl = process.env.ACCEPTANCE_TARGET_URL || 'http://127.0.0.1:8091/';
const stamp = Date.now().toString(36);
try {
  await waitFor(async () => { try { return (await fetch(`${base}/api/health`)).ok; } catch { return false; } }, 'platform readiness');
  token = (await api('/auth/login', 'POST', { username: 'admin', password })).token;
  assert.ok(token, 'Login returns token');
  await api('/cases', 'GET', null, 401, null);
  const resources = await waitFor(async () => { const devices = await api('/devices'); return devices.find(d => d.platform === 'web' && d.status === 'IDLE'); }, 'real browser Agent');
  assert.ok(resources.agentId, 'Device belongs to registered Agent');
  const steps = [{ action: 'goto', target: targetUrl }, { action: 'fill', target: '#username', value: 'qa' }, { action: 'click', target: '#login' }, { action: 'expectText', target: '#welcome', value: 'Welcome qa' }, { action: 'screenshot' }];
  const good = await api('/cases', 'POST', { name: `Acceptance PASS ${stamp}`, platform: 'web', framework: 'playwright', suite: 'smoke', status: 'DRAFT', priority: 'P0', tags: ['acceptance'], sensitive: false, steps }, 200);
  assert.equal(good.status, 'DRAFT');
  const rejected = await fetch(`${base}/api/runs`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ caseIds: [good.id], capabilities: { platform: 'web', browser: 'chromium' } }) });
  assert.ok([400, 409, 422].includes(rejected.status), 'Unreviewed draft cannot run');
  await api(`/cases/${good.id}/approve`, 'POST', { revision: good.revision });
  const plan = await api('/plans', 'POST', { name: `Acceptance smoke ${stamp}`, caseIds: [good.id], capabilities: { platform: 'web', browser: 'chromium', provider: 'local' }, queueTimeoutSeconds: 20, executionTimeoutSeconds: 30 }, 200);
  const run = await api('/runs', 'POST', { planId: plan.id, commitSha: process.env.GITHUB_SHA || 'local-acceptance' }, 200);
  const terminal = new Set(['PASSED', 'FAILED', 'TIMED_OUT', 'CANCELLED']);
  const finished = await waitFor(async () => { const r = await api(`/runs/${run.id}`); return terminal.has(r.status) && r; }, 'real passing execution');
  assert.equal(finished.status, 'PASSED', JSON.stringify(finished));
  assert.equal(finished.summary.passed, 1);
  assert.ok(finished.deviceFingerprint, 'Report contains actual device fingerprint');
  const evidence = finished.results.flatMap(r => r.evidence || []);
  assert.ok(evidence.length > 0, 'Actual execution generates downloadable evidence');
  for (const item of evidence) {
    const url = new URL(item.url, base);
    assert.equal(url.origin, new URL(base).origin, 'Evidence remains same-origin');
    const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    assert.equal(response.status, 200, `Evidence ${item.name} accessible to authenticated user`);
    assert.ok((await response.arrayBuffer()).byteLength > 0, 'Evidence is nonempty');
    assert.equal((await fetch(url)).status, 401, 'Evidence requires authentication');
  }
  const xml = await fetch(`${base}/api/runs/${run.id}/junit`, { headers: { Authorization: `Bearer ${token}` } });
  assert.equal(xml.status, 200);
  assert.match(await xml.text(), /<testsuite/);
  await api(`/runs/${run.id}/allure`);
  const bad = await api('/cases', 'POST', { name: `Acceptance FAIL ${stamp}`, platform: 'web', framework: 'playwright', suite: 'regression', priority: 'P1', steps: [{ action: 'goto', target: targetUrl }, { action: 'expectText', target: 'h1', value: 'This assertion must fail' }] });
  await api(`/cases/${bad.id}/approve`, 'POST', { revision: bad.revision });
  const failed = await api('/runs', 'POST', { caseIds: [bad.id], capabilities: { platform: 'web', browser: 'chromium' }, executionTimeoutSeconds: 20, queueTimeoutSeconds: 20 });
  const failedResult = await waitFor(async () => { const r = await api(`/runs/${failed.id}`); return terminal.has(r.status) && r; }, 'deliberate failing execution');
  assert.equal(failedResult.status, 'FAILED');
  assert.ok(failedResult.results.some(r => r.error), 'Failure contains actual assertion error');
  const unmatched = { caseIds: [good.id], capabilities: { platform: 'web', browser: 'nonexistent-browser' }, queueTimeoutSeconds: 2, executionTimeoutSeconds: 10 };
  const timeout = await api('/runs', 'POST', unmatched);
  const timeoutResult = await waitFor(async () => { const r = await api(`/runs/${timeout.id}`); return terminal.has(r.status) && r; }, 'queue timeout', 15000);
  assert.equal(timeoutResult.status, 'TIMED_OUT');
  const cancelled = await api('/runs', 'POST', { ...unmatched, queueTimeoutSeconds: 60 });
  await api(`/runs/${cancelled.id}/cancel`, 'POST', {});
  assert.equal((await api(`/runs/${cancelled.id}`)).status, 'CANCELLED');
  const viewerPassword = `Viewer-${stamp}-secure-password`;
  await api('/users', 'POST', { username: `viewer-${stamp}`, displayName: 'Acceptance viewer', password: viewerPassword, role: 'VIEWER' });
  const viewer = (await api('/auth/login', 'POST', { username: `viewer-${stamp}`, password: viewerPassword })).token;
  await api('/cases', 'GET', null, 200, viewer);
  await api('/runs', 'POST', { planId: plan.id }, 403, viewer);
  await api('/agent-keys', 'POST', { name: 'forbidden' }, 403, viewer);
  const audit = await api('/audit');
  assert.ok(audit.length > 0, 'Sensitive actions generate audit events');
  const dashboard = await api('/dashboard');
  assert.ok(dashboard.totalRuns >= 4);
  await waitFor(async () => (await api('/devices')).find(d => d.id === resources.id && d.status === 'IDLE'), 'resource cleanup');
  console.log(JSON.stringify({ status: 'verified', passedRunId: run.id, failedRunId: failed.id, evidenceFiles: evidence.length, checks: ['draft review gate', 'actual Playwright pass', 'actual assertion failure', 'authenticated evidence', 'device fingerprint', 'JUnit and Allure', 'queue timeout', 'cancel', 'viewer RBAC', 'audit', 'resource cleanup'] }, null, 2));
} finally {
  await new Promise(resolve => target.close(resolve));
}
