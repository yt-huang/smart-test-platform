import test from 'node:test';
import assert from 'node:assert/strict';
import { buildMatrixPayload, isMatrixActive, matrixStatusMessage } from './matrixUtils.js';

test('matrix payload keeps request order and sends only the browser capability', () => {
  const body = buildMatrixPayload({
    planId: 'plan-1',
    name: ' 发布前矩阵 ',
    commitSha: ' 86724c5 ',
    variants: [
      { label: 'Firefox', browser: 'firefox' },
      { label: 'Chromium', browser: 'chromium' },
    ],
  });
  assert.deepEqual(body, {
    planId: 'plan-1',
    name: '发布前矩阵',
    commitSha: '86724c5',
    variants: [
      { label: 'Firefox', capabilities: { browser: 'firefox' } },
      { label: 'Chromium', capabilities: { browser: 'chromium' } },
    ],
  });
});
test('matrix payload omits optional name and commitSha when blank', () => {
  const body = buildMatrixPayload({ planId: 'plan-1', name: '  ', commitSha: '', variants: [{ label: 'a', browser: 'chromium' }, { label: 'b', browser: 'firefox' }] });
  assert.equal('name' in body, false);
  assert.equal('commitSha' in body, false);
});
test('matrix payload requires a plan and at least two targets', () => {
  assert.throws(() => buildMatrixPayload({ variants: [{ label: 'a', browser: 'chromium' }, { label: 'b', browser: 'firefox' }] }), /测试计划/);
  assert.throws(() => buildMatrixPayload({ planId: 'p', variants: [{ label: 'a', browser: 'chromium' }] }), /至少选择两个/);
  assert.throws(() => buildMatrixPayload({ planId: 'p', variants: [] }), /至少选择两个/);
  const many = Array.from({ length: 9 }, (_, i) => ({ label: `t${i}`, browser: ['chromium', 'firefox', 'webkit'][i % 3] }));
  assert.throws(() => buildMatrixPayload({ planId: 'p', variants: many }), /最多 8 个/);
});
test('matrix payload rejects unsupported browsers and duplicate labels case-insensitively', () => {
  assert.throws(() => buildMatrixPayload({ planId: 'p', variants: [{ label: 'a', browser: 'ie' }, { label: 'b', browser: 'firefox' }] }), /不支持的目标浏览器/);
  assert.throws(() => buildMatrixPayload({ planId: 'p', variants: [{ label: 'Smoke', browser: 'chromium' }, { label: ' smoke ', browser: 'firefox' }] }), /重复/);
});
test('matrix payload enforces label, name and commit length limits', () => {
  const two = [{ label: 'a', browser: 'chromium' }, { label: 'b', browser: 'firefox' }];
  assert.throws(() => buildMatrixPayload({ planId: 'p', variants: [{ label: '', browser: 'chromium' }, { label: 'b', browser: 'firefox' }] }), /1–80/);
  assert.throws(() => buildMatrixPayload({ planId: 'p', variants: [{ label: 'x'.repeat(81), browser: 'chromium' }, { label: 'b', browser: 'firefox' }] }), /1–80/);
  assert.throws(() => buildMatrixPayload({ planId: 'p', name: 'x'.repeat(151), variants: two }), /150/);
  assert.throws(() => buildMatrixPayload({ planId: 'p', commitSha: 'x'.repeat(129), variants: two }), /128/);
});
test('matrix batch is only active while queued or running', () => {
  assert.equal(isMatrixActive('QUEUED'), true);
  assert.equal(isMatrixActive('RUNNING'), true);
  for (const status of ['PASSED', 'FAILED', 'CANCELLED', 'ASSIGNED', 'TIMED_OUT']) assert.equal(isMatrixActive(status), false);
});
test('matrix status messages describe queueing and real aggregation', () => {
  assert.match(matrixStatusMessage('QUEUED'), /排队/);
  assert.match(matrixStatusMessage('RUNNING'), /终态/);
  assert.match(matrixStatusMessage('FAILED'), /失败或超时/);
  assert.equal(matrixStatusMessage('UNKNOWN'), '查看此批次的矩阵回归记录。');
});
