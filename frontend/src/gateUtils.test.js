import test from 'node:test';
import assert from 'node:assert/strict';
import { gateCounts, gateStatusDescription, gateStatusLabels, isGatePresent } from './gateUtils.js';

const contractGate = { policy: 'quarantine-at-submission-v1', status: 'WARN', total: 3, passed: 1, blockingFailures: 0, quarantinedFailures: 2, infrastructureFailures: 0, quarantinedCaseIds: ['case-1', 'case-2'] };

test('gate statuses map to concise Chinese labels for every contract state', () => {
  assert.deepEqual(gateStatusLabels, { PENDING: '等待判定', PASSED: '通过', WARN: '警告放行', BLOCKED: '阻塞' });
});

test('isGatePresent accepts contract gate objects and rejects missing or unrecognized gates', () => {
  for (const status of ['PENDING', 'PASSED', 'WARN', 'BLOCKED']) assert.equal(isGatePresent({ ...contractGate, status }), true);
  for (const gate of [null, undefined, '', 'PASSED', [], {}, { status: '' }, { status: 'HTTP_200' }, { status: 200 }, { status: 'PASSED_EXTRA' }]) {
    assert.equal(isGatePresent(gate), false, JSON.stringify(gate));
  }
});

test('gateCounts reads the contract fields and clamps malformed values to non-negative integers', () => {
  assert.deepEqual(gateCounts(contractGate), { total: 3, passed: 1, quarantined: 2, blocking: 0, infrastructure: 0 });
  const clamped = gateCounts({ total: -2, passed: 'x', quarantinedFailures: 1.5, blockingFailures: null, infrastructureFailures: NaN });
  assert.deepEqual(clamped, { total: 0, passed: 0, quarantined: 0, blocking: 0, infrastructure: 0 });
  for (const gate of [contractGate, {}, { total: 0, passed: 0, quarantinedFailures: 0, blockingFailures: 0, infrastructureFailures: 0 }]) {
    const counts = gateCounts(gate);
    for (const value of Object.values(counts)) assert.ok(Number.isSafeInteger(value) && value >= 0);
  }
});

test('gateStatusDescription explains pending, freeze, quarantine and infrastructure differences in plain words', () => {
  assert.match(gateStatusDescription('PENDING'), /尚未冻结/);
  assert.match(gateStatusDescription('PASSED'), /真实通过/);
  assert.match(gateStatusDescription('WARN'), /冻结于提交/);
  assert.match(gateStatusDescription('WARN'), /原始失败证据仍完整保留/);
  assert.match(gateStatusDescription('BLOCKED'), /基础设施错误/);
  assert.match(gateStatusDescription('BLOCKED'), /不能抵消/);
  assert.equal(gateStatusDescription('UNKNOWN'), '');
  assert.equal(gateStatusDescription(undefined), '');
});
