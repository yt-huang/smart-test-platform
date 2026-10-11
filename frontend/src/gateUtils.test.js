import test from 'node:test';
import assert from 'node:assert/strict';
import { gateCounts, gateFreezeNote, gateStatusDescription, gateStatusLabels, isGateDataValid, isGatePresent } from './gateUtils.js';

const contractGate = { policy: 'quarantine-at-submission-v1', status: 'WARN', total: 3, passed: 1, blockingFailures: 0, quarantinedFailures: 2, infrastructureFailures: 0, quarantinedCaseIds: ['case-1', 'case-2'] };

const pendingGate = { policy: 'quarantine-at-submission-v1', status: 'PENDING', total: 4, passed: 1, blockingFailures: 0, quarantinedFailures: 1, infrastructureFailures: 0, quarantinedCaseIds: ['case-q1'] };
const passedGate = { policy: 'quarantine-at-submission-v1', status: 'PASSED', total: 2, passed: 2, blockingFailures: 0, quarantinedFailures: 0, infrastructureFailures: 0, quarantinedCaseIds: [] };
const warnGate = { policy: 'quarantine-at-submission-v1', status: 'WARN', total: 3, passed: 1, blockingFailures: 0, quarantinedFailures: 2, infrastructureFailures: 0, quarantinedCaseIds: ['case-1', 'case-2'] };
const blockedGate = { policy: 'quarantine-at-submission-v1', status: 'BLOCKED', total: 3, passed: 1, blockingFailures: 2, quarantinedFailures: 0, infrastructureFailures: 0, quarantinedCaseIds: [] };
const infraBlockedGate = { policy: 'strict-legacy-v1', status: 'BLOCKED', total: 2, passed: 0, blockingFailures: 2, quarantinedFailures: 0, infrastructureFailures: 1, quarantinedCaseIds: [] };
const pendingMatrixGate = { policy: 'aggregate-v1', status: 'PENDING', total: 4, passed: 2, blockingFailures: 0, quarantinedFailures: 0, infrastructureFailures: 1, quarantinedCaseIds: [] };

test('gate statuses map to concise Chinese labels for every contract state', () => {
  assert.deepEqual(gateStatusLabels, { PENDING: '等待判定', PASSED: '通过', WARN: '警告放行', BLOCKED: '阻塞' });
});

test('isGatePresent accepts contract gate objects and rejects missing or unrecognized gates', () => {
  for (const status of ['PENDING', 'PASSED', 'WARN', 'BLOCKED']) assert.equal(isGatePresent({ ...contractGate, status }), true);
  for (const gate of [null, undefined, '', 'PASSED', [], {}, { status: '' }, { status: 'HTTP_200' }, { status: 200 }, { status: 'PASSED_EXTRA' }]) {
    assert.equal(isGatePresent(gate), false, JSON.stringify(gate));
  }
});

test('isGatePresent rejects prototype property names and other non-contract statuses', () => {
  for (const status of ['toString', 'constructor', 'hasOwnProperty', '__proto__', 'valueOf', 'then', 'null', 'true', 'pending']) {
    assert.equal(isGatePresent({ ...contractGate, status }), false, String(status));
  }
  for (const status of [null, undefined, true, 0, {}, ['PASSED']]) {
    assert.equal(isGatePresent({ ...contractGate, status }), false, JSON.stringify(status));
  }
});

test('isGateDataValid accepts contract-consistent gates for every status and policy', () => {
  for (const gate of [pendingGate, passedGate, warnGate, blockedGate, infraBlockedGate, pendingMatrixGate]) {
    assert.equal(isGateDataValid(gate), true, JSON.stringify(gate));
  }
  // PENDING 允许计数和小于 total（活跃中）；聚合矩阵允许已有子任务产生基础设施错误。
  assert.equal(isGateDataValid({ ...pendingGate, total: 10, passed: 0, quarantinedFailures: 0 }), true);
});

test('isGateDataValid rejects contradictory success instead of clamping malformed counts to zero', () => {
  const contradictory = [
    { ...passedGate, passed: 1 },                                    // PASSED 却非全部通过
    { ...passedGate, quarantinedFailures: 0, blockingFailures: 0, total: 3 }, // 计数和 2 ≠ 3
    { ...passedGate, infrastructureFailures: 1 },                    // PASSED 却带基础设施错误
    { ...passedGate, total: 0, passed: 0 },                          // 空 total 不得渲染为通过
    { ...passedGate, policy: 'client-injected-v2' },                 // policy 必须为三种允许值
    { ...passedGate, policy: undefined },
    { ...warnGate, blockingFailures: 1 },                            // WARN 不得含阻塞失败
    { ...warnGate, infrastructureFailures: 1 },                      // WARN 不得含基础设施错误
    { ...warnGate, quarantinedFailures: 0, passed: 3 },              // WARN 必须确有隔离失败
    { ...blockedGate, blockingFailures: 0 },                         // BLOCKED 必须确有阻塞或基础设施错误
    { ...pendingGate, passed: 9 },                                   // PENDING 计数和不得超过 total
    { ...passedGate, total: '3' },                                   // 计数必须是安全非负整数
    { ...passedGate, passed: -1 },
    { ...passedGate, total: 1.5 },
    { ...passedGate, total: Number.MAX_SAFE_INTEGER + 1 },
    { ...passedGate, passed: null },
  ];
  for (const gate of contradictory) assert.equal(isGateDataValid(gate), false, JSON.stringify(gate));
  for (const gate of [null, undefined, {}, [], { status: 'toString' }]) assert.equal(isGateDataValid(gate), false, JSON.stringify(gate));
});

test('isGateDataValid enforces policy-specific quarantine ID constraints', () => {
  // strict-legacy-v1 为历史无快照任务：隔离集必须为空且不得有隔离失败，legacy WARN 不允许存在。
  const legacyWarnGate = { policy: 'strict-legacy-v1', status: 'WARN', total: 1, passed: 0, blockingFailures: 0, quarantinedFailures: 1, infrastructureFailures: 0, quarantinedCaseIds: [] };
  assert.equal(isGateDataValid(legacyWarnGate), false, JSON.stringify(legacyWarnGate));
  const illegalLegacyGates = [
    { ...passedGate, policy: 'strict-legacy-v1', quarantinedCaseIds: ['case-1'] }, // legacy 不得带任何隔离 ID
    { ...passedGate, policy: 'strict-legacy-v1', quarantinedCaseIds: ['case-1'], quarantinedFailures: 1, passed: 1 }, // legacy 不得有隔离失败
    { ...infraBlockedGate, quarantinedFailures: 1, blockingFailures: 1 }, // legacy 计数和不变，隔离失败仍禁止
  ];
  for (const gate of illegalLegacyGates) assert.equal(isGateDataValid(gate), false, JSON.stringify(gate));

  // quarantinedCaseIds 必须是数组：每项非空字符串、唯一、数量不超过 total。
  const malformedIds = [
    { ...passedGate, quarantinedCaseIds: undefined },
    { ...passedGate, quarantinedCaseIds: 'case-1' },
    { ...passedGate, quarantinedCaseIds: null },
    { ...passedGate, quarantinedCaseIds: {} },
    { ...passedGate, quarantinedCaseIds: ['case-1', ''] },          // 空白项
    { ...passedGate, quarantinedCaseIds: ['case-1', 2] },           // 非字符串项
    { ...passedGate, quarantinedCaseIds: ['case-1', null] },
    { ...passedGate, quarantinedCaseIds: ['case-1', 'case-1'] },    // 重复项
    { ...passedGate, quarantinedCaseIds: ['case-a', 'case-b', 'case-c'] }, // 数量超过 total
  ];
  for (const gate of malformedIds) assert.equal(isGateDataValid(gate), false, JSON.stringify(gate));

  // 单运行策略：隔离失败只能来自冻结集合，quarantinedFailures 不得超过 ID 数；不超过时允许放行。
  assert.equal(isGateDataValid({ ...warnGate, quarantinedCaseIds: ['case-1'] }), false, 'missing ID for quarantined failure');
  assert.equal(isGateDataValid({ ...warnGate, quarantinedCaseIds: ['case-1', 'case-2', 'case-3'] }), true, 'fewer failures than frozen IDs stays consistent');
  assert.equal(isGateDataValid({ ...pendingGate, quarantinedCaseIds: ['case-q1', 'case-q2'] }), true, 'PENDING single-run gate may freeze IDs ahead of failures');

  // aggregate-v1：不同目标可重复计入同一 ID，quarantinedFailures 允许大于去重后 ID 数；ID 唯一性等其余约束不变。
  const aggregateRepeatedIdGate = { policy: 'aggregate-v1', status: 'WARN', total: 2, passed: 0, blockingFailures: 0, quarantinedFailures: 2, infrastructureFailures: 0, quarantinedCaseIds: ['case-1'] };
  assert.equal(isGateDataValid(aggregateRepeatedIdGate), true, JSON.stringify(aggregateRepeatedIdGate));
  const illegalAggregateGates = [
    { ...aggregateRepeatedIdGate, quarantinedCaseIds: ['case-1', 'case-1'] }, // 聚合仍须 ID 去重
    { ...aggregateRepeatedIdGate, quarantinedCaseIds: ['case-1', ''] },
    { ...aggregateRepeatedIdGate, quarantinedCaseIds: ['case-1', 'case-2', 'case-3'] }, // 去重后 ID 数仍不得超过 total
  ];
  for (const gate of illegalAggregateGates) assert.equal(isGateDataValid(gate), false, JSON.stringify(gate));
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
  assert.equal(gateStatusDescription('toString'), '');
  assert.equal(gateStatusDescription(undefined), '');
});

test('gateFreezeNote freezes the quarantine set at submission and the verdict at first terminal state', () => {
  assert.match(gateFreezeNote, /隔离集合在提交时冻结/);
  assert.match(gateFreezeNote, /首次到达终态时冻结/);
  assert.match(gateFreezeNote, /人工解除隔离或编辑用例不会改变已归档的门禁报告/);
  assert.doesNotMatch(gateFreezeNote, /判定与隔离集合在提交时冻结/);
});
