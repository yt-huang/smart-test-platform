import test from 'node:test';
import assert from 'node:assert/strict';
import { canWrite, caseApprovalBody, resolveEvidenceUrl, validateSteps, splitTags } from './utils.js';

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
