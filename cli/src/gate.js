import { ConfigurationError } from './errors.js';

const terminal = new Set(['PASSED', 'FAILED', 'TIMED_OUT', 'CANCELLED']);
const gateStatuses = new Set(['PENDING', 'PASSED', 'WARN', 'BLOCKED']);
const runPolicies = new Set(['quarantine-at-submission-v1', 'strict-legacy-v1']);
const countKeys = ['total', 'passed', 'blockingFailures', 'quarantinedFailures', 'infrastructureFailures'];
const invalid = detail => { throw new ConfigurationError(`Platform returned invalid gate: ${detail}`); };

function sum(values) {
  const total = values.reduce((result, value) => result + value, 0);
  if (!Number.isSafeInteger(total)) invalid('count overflow');
  return total;
}

function validateGate(execution, aggregate = false) {
  const gate = execution.gate;
  if (!gate || typeof gate !== 'object' || Array.isArray(gate)) invalid('missing gate object');
  if (aggregate ? gate.policy !== 'aggregate-v1' : !runPolicies.has(gate.policy)) invalid('unsupported policy');
  if (!gateStatuses.has(gate.status)) invalid('unknown status');
  if (countKeys.some(key => !Number.isSafeInteger(gate[key]) || gate[key] < 0) || gate.total === 0) invalid('counts must be safe nonnegative integers with positive total');
  if (!Array.isArray(gate.quarantinedCaseIds) || gate.quarantinedCaseIds.some(id => typeof id !== 'string' || !id.trim())
    || new Set(gate.quarantinedCaseIds).size !== gate.quarantinedCaseIds.length || gate.quarantinedCaseIds.length > gate.total) invalid('invalid quarantined case IDs');
  if (gate.quarantinedFailures > gate.quarantinedCaseIds.length && !aggregate) invalid('quarantined failures exceed frozen cases');
  if (gate.policy === 'strict-legacy-v1' && (gate.quarantinedCaseIds.length || gate.quarantinedFailures)) invalid('legacy policy cannot quarantine failures');
  const completed = sum([gate.passed, gate.blockingFailures, gate.quarantinedFailures]);
  if (completed > gate.total) invalid('case counts exceed total');
  const finished = terminal.has(execution.status);
  if (finished !== (gate.status !== 'PENDING')) invalid('gate and raw completion disagree');
  if (finished && completed !== gate.total) invalid('terminal case counts do not equal total');
  if (finished) {
    const expected = gate.blockingFailures || gate.infrastructureFailures ? 'BLOCKED' : gate.quarantinedFailures ? 'WARN' : 'PASSED';
    if (gate.status !== expected) invalid('status contradicts counts');
    if (execution.status === 'PASSED' ? gate.status !== 'PASSED' : gate.status === 'PASSED') invalid('gate contradicts raw result');
    if (gate.status === 'WARN' && execution.status !== 'FAILED') invalid('warning requires a raw failure');
    if (['TIMED_OUT', 'CANCELLED'].includes(execution.status) && (gate.status !== 'BLOCKED' || !gate.infrastructureFailures)) invalid('timeout or cancellation must block on infrastructure');
  }
  const summary = execution.summary;
  if (!summary || ['total', 'passed', 'failed'].some(key => !Number.isSafeInteger(summary[key]) || summary[key] < 0)
    || sum([summary.passed, summary.failed]) > summary.total || summary.total !== gate.total) invalid('raw summary does not match total');
  // Infrastructure failures freeze the gate before late evidence can update raw counts.
  if (!gate.infrastructureFailures && (summary.passed !== gate.passed
    || summary.failed !== sum([gate.blockingFailures, gate.quarantinedFailures]))) invalid('gate counts contradict raw counts');
  return gate;
}

export function validateExecutionGate(execution, command) {
  const gate = validateGate(execution, command === 'matrix');
  if (command !== 'matrix') return;
  const gates = execution.variants.map(variant => validateGate(variant));
  const rawVariantCounts = {
    totalVariants: execution.variants.length,
    completedVariants: execution.variants.filter(variant => terminal.has(variant.status)).length,
    passedVariants: execution.variants.filter(variant => variant.status === 'PASSED').length,
    failedVariants: execution.variants.filter(variant => ['FAILED', 'TIMED_OUT'].includes(variant.status)).length
  };
  for (const [key, expected] of Object.entries(rawVariantCounts)) {
    if (Object.hasOwn(execution.summary, key) && execution.summary[key] !== expected) invalid('raw matrix target counts disagree');
  }
  for (const key of countKeys) {
    if (gate[key] !== sum(gates.map(variantGate => variantGate[key]))) invalid('matrix counts disagree with targets');
  }
  const expected = gates.some(value => value.status === 'PENDING') ? 'PENDING'
    : gates.some(value => value.status === 'BLOCKED') ? 'BLOCKED'
      : gates.some(value => value.status === 'WARN') ? 'WARN' : 'PASSED';
  if (gate.status !== expected) invalid('matrix status disagrees with targets');
  const ids = [...new Set(gates.flatMap(value => value.quarantinedCaseIds))];
  if (ids.length !== gate.quarantinedCaseIds.length || ids.some((id, index) => id !== gate.quarantinedCaseIds[index])) invalid('matrix frozen case IDs disagree with targets');
}

export function gateIdentity(execution, command) {
  const identity = (gate, id) => ({ id, policy: gate.policy, total: gate.total, quarantinedCaseIds: gate.quarantinedCaseIds });
  return JSON.stringify({ gate: identity(execution.gate, execution.id), variants: command === 'matrix'
    ? execution.variants.map(variant => ({ label: variant.label, ...identity(variant.gate, variant.runId) })) : [] });
}

export function gateDescription(gate) {
  return `${gate.status} (${gate.passed} passed, ${gate.quarantinedFailures} quarantined failures, ${gate.blockingFailures} blocking failures, ${gate.infrastructureFailures} infrastructure failures, ${gate.total} total; policy ${gate.policy})`;
}
