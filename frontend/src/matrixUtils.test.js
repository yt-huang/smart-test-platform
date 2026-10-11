import test from 'node:test';
import assert from 'node:assert/strict';
import { buildMatrixPayload, defaultMatrixName, isMatrixActive, matrixFingerprintLines, matrixStatusMessage } from './matrixUtils.js';

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
test('default matrix name keeps the suffix within the 150 character limit', () => {
  assert.equal(defaultMatrixName('核心链路'), '核心链路 矩阵回归');
  assert.equal(defaultMatrixName('  '), '矩阵回归');
  const long = '发'.repeat(200);
  const fallback = defaultMatrixName(long);
  assert.equal(fallback.length, 150);
  assert.ok(fallback.endsWith(' 矩阵回归'));
  const payload = buildMatrixPayload({ planId: 'p', name: fallback, variants: [{ label: 'a', browser: 'chromium' }, { label: 'b', browser: 'firefox' }] });
  assert.equal(payload.name, fallback);
  const over = defaultMatrixName('x'.repeat(200)) + 'x';
  assert.throws(() => buildMatrixPayload({ planId: 'p', name: over, variants: [{ label: 'a', browser: 'chromium' }, { label: 'b', browser: 'firefox' }] }), /150/);
});
test('variant fingerprint lines expose browser, version, provider and identity or 尚未获取', () => {
  assert.deepEqual(matrixFingerprintLines({ name: 'Codespaces Chromium', browser: 'firefox', version: '132.0', provider: 'cloud', agentId: 'a1' }), [
    { label: '浏览器', value: 'firefox' },
    { label: '版本', value: '132.0' },
    { label: '来源', value: 'cloud' },
    { label: '资源标识', value: 'Codespaces Chromium' },
  ]);
  assert.deepEqual(matrixFingerprintLines({ id: 'dev-9', os: 'linux x64' }), [
    { label: '浏览器', value: '尚未获取' },
    { label: '版本', value: 'linux x64' },
    { label: '来源', value: '尚未获取' },
    { label: '资源标识', value: 'dev-9' },
  ]);
  assert.deepEqual(matrixFingerprintLines(null), []);
  assert.deepEqual(matrixFingerprintLines('legacy-host'), [{ label: '资源指纹', value: 'legacy-host' }]);
});
