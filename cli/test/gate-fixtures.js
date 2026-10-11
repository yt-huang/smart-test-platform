// Synthetic API/report fixtures for CLI boundary tests; these are not browser runs.
export function runFixture({ status = 'FAILED', gateStatus = 'WARN', total = 2, passed = 1, blockingFailures = 0,
  quarantinedFailures = 1, infrastructureFailures = 0, quarantinedCaseIds = ['login'], policy = 'quarantine-at-submission-v1', id = 'r1', summary } = {}) {
  return { id, status, summary: summary || { total, passed, failed: blockingFailures + quarantinedFailures },
    gate: { policy, status: gateStatus, total, passed, blockingFailures, quarantinedFailures, infrastructureFailures, quarantinedCaseIds } };
}

export function matrixFixture(runs = [runFixture(), runFixture({ status: 'PASSED', gateStatus: 'PASSED', passed: 2, quarantinedFailures: 0, id: 'r2' })]) {
  const variants = runs.map((run, index) => ({ label: ['chromium', 'firefox'][index], runId: run.id, status: run.status, summary: run.summary, gate: run.gate }));
  const active = variants.some(variant => !['PASSED', 'FAILED', 'TIMED_OUT', 'CANCELLED'].includes(variant.status));
  const summary = Object.fromEntries(['total', 'passed', 'failed'].map(key => [key, variants.reduce((sum, variant) => sum + variant.summary[key], 0)]));
  const gate = { policy: 'aggregate-v1', status: active ? 'PENDING' : variants.some(variant => variant.gate.status === 'BLOCKED') ? 'BLOCKED'
    : variants.some(variant => variant.gate.status === 'WARN') ? 'WARN' : 'PASSED',
    ...Object.fromEntries(['total', 'passed', 'blockingFailures', 'quarantinedFailures', 'infrastructureFailures'].map(key => [key, variants.reduce((sum, variant) => sum + variant.gate[key], 0)])),
    quarantinedCaseIds: [...new Set(variants.flatMap(variant => variant.gate.quarantinedCaseIds))] };
  return { id: 'm1', status: active ? 'RUNNING' : variants.some(variant => ['FAILED', 'TIMED_OUT'].includes(variant.status)) ? 'FAILED'
    : variants.some(variant => variant.status === 'CANCELLED') ? 'CANCELLED' : 'PASSED', summary, variants, gate };
}

export function suiteXml(gate, name = 'run') {
  const cases = [
    ...Array.from({ length: gate.passed }, (_, index) => `<testcase name="pass-${index}"/>`),
    ...Array.from({ length: gate.blockingFailures }, (_, index) => `<testcase name="block-${index}"><failure message="Actual assertion failure"/></testcase>`),
    ...Array.from({ length: gate.quarantinedFailures }, (_, index) => `<testcase name="quarantine-${index}"><skipped message="Quarantined failure: expected &lt; success &amp; actual failure"/><properties><property name="caseId" value="login"/><property name="rawStatus" value="FAILED"/></properties><system-out>Actual failure retained</system-out></testcase>`),
    ...Array.from({ length: gate.infrastructureFailures }, (_, index) => `<testcase name="infrastructure-${index}"><error message="Agent cleanup failed"/></testcase>`)
  ];
  return `<testsuite name="${name}" tests="${cases.length}" failures="${gate.blockingFailures}" errors="${gate.infrastructureFailures}" skipped="${gate.quarantinedFailures}">${cases.join('')}</testsuite>`;
}

export function matrixXml(matrix) {
  const gate = matrix.gate;
  return `<testsuites name="matrix" tests="${gate.total + gate.infrastructureFailures}" failures="${gate.blockingFailures}" errors="${gate.infrastructureFailures}" skipped="${gate.quarantinedFailures}">${matrix.variants.map(variant => suiteXml(variant.gate, `plan [${variant.label}]`)).join('')}</testsuites>`;
}
