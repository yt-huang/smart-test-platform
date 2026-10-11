import test from 'node:test';
import assert from 'node:assert/strict';
import { canWrite, caseApprovalBody, fingerprintDetails, resolveEvidenceUrl, validateSteps, splitTags } from './utils.js';

test('only authoring roles can make write controls available', () => {
  for (const role of ['ADMIN', 'TESTER', 'DEVELOPER']) assert.equal(canWrite(role), true);
  for (const role of ['VIEWER', undefined, 'UNKNOWN']) assert.equal(canWrite(role), false);
});
test('authenticated evidence stays on the configured platform origin', () => {
  assert.equal(resolveEvidenceUrl('/api/evidence/123', '', 'https://portal.example'), 'https://portal.example/api/evidence/123');
  assert.equal(resolveEvidenceUrl('/api/evidence/123', 'https://backend.example', 'https://portal.example'), 'https://backend.example/api/evidence/123');
  assert.throws(() => resolveEvidenceUrl('https://attacker.example/file', '', 'https://portal.example'));
  assert.throws(() => resolveEvidenceUrl('//attacker.example/file', '', 'https://portal.example'));
});
test('structured steps require executable URLs, selectors and text', () => {
  assert.ok(validateSteps([]));
  assert.ok(validateSteps([{ action: 'goto', target: 'javascript:alert(1)' }]));
  assert.ok(validateSteps([{ action: 'fill', target: '#name', value: '' }]));
  assert.equal(validateSteps([{ action: 'goto', target: 'https://example.com' }, { action: 'expectVisible', target: 'h1' }]), null);
});
test('capability tags are trimmed and deduplicated', () => {
  assert.deepEqual(splitTags(' smoke,， smoke, private '), ['smoke', 'private']);
});
test('approval carries precisely the displayed revision and rejects an absent revision', () => {
  assert.deepEqual(caseApprovalBody({ id: 'case-1', revision: 4 }), { revision: 4 });
  assert.deepEqual(caseApprovalBody({ id: 'case-1', revision: 5 }), { revision: 5 });
  for (const revision of [undefined, null, 0, -1, 1.5, '4', Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => caseApprovalBody({ revision }), /版本号/);
  }
});
test('run device publicDocument renders only readable scalar fingerprint fields', () => {
  const actualFingerprint = { id: 'agent-browser-1', name: 'Codespaces Chromium', platform: 'web', version: 'linux x64', browser: 'chromium', brand: '', model: '', provider: 'local', tags: ['trusted'], status: 'IDLE', agentId: 'codespace-agent', lastSeen: '2026-10-11T12:00:00Z' };
  assert.deepEqual(fingerprintDetails(actualFingerprint), [
    { label: '设备名称', value: 'Codespaces Chromium' }, { label: '型号 / 浏览器', value: 'chromium' },
    { label: '平台', value: 'Web 浏览器' }, { label: '系统 / 版本', value: 'linux x64' },
    { label: '资源来源', value: 'local' }, { label: '所属 Agent', value: 'codespace-agent' },
  ]);
  for (const fingerprint of [null, {}, [], { name: { unexpected: true }, model: null, version: { nested: 'value' }, agentId: [] }]) {
    assert.ok(fingerprintDetails(fingerprint).every(field => typeof field.value === 'string' && !field.value.includes('[object Object]')));
  }
  assert.deepEqual(fingerprintDetails('legacy-host-fingerprint'), [{ label: '资源指纹', value: 'legacy-host-fingerprint' }]);
});
