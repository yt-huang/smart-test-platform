export const gateStatusLabels = { PENDING: '等待判定', PASSED: '通过', WARN: '警告放行', BLOCKED: '阻塞' };

// 契约 v1：policy 仅这三种取值（新运行提交隔离快照、历史无快照任务、矩阵聚合）。
export const gatePolicies = Object.freeze(['quarantine-at-submission-v1', 'strict-legacy-v1', 'aggregate-v1']);

const nonNegativeInt = (value) => Number.isSafeInteger(value) && value >= 0 ? value : 0;

const isSafeNonNegativeInt = (value) => Number.isSafeInteger(value) && value >= 0;

// 状态必须是字符串且是自有属性，避免 toString/constructor/__proto__ 等原型属性被当成有效状态。
const isGateStatus = (status) => typeof status === 'string' && Object.hasOwn(gateStatusLabels, status);

// 契约 v1：公开 gate 的 status 仅为 PENDING/PASSED/WARN/BLOCKED。
// 缺失或状态无法识别的数据一律视为“未提供门禁判定”，绝不推断为通过，也不把原始字段渲染成界面文案。
export function isGatePresent(gate) {
  return !!gate && typeof gate === 'object' && !Array.isArray(gate) && isGateStatus(gate.status);
}

// 契约 v1 严格校验：total 为正整数，全部计数为安全非负整数；policy 为三种允许值之一；
// quarantinedCaseIds 必须为数组：每项是非空字符串、彼此唯一且数量不超过 total（矩阵聚合时 ID 去重）；
// strict-legacy-v1 为历史无快照任务，隔离集必须为空且不得有隔离失败（quarantinedFailures 恒为 0）；
// 单运行策略（quarantine-at-submission-v1）的隔离失败只能来自提交时冻结的集合，quarantinedFailures 不得超过 ID 数；
// aggregate-v1 按子任务求和计数、ID 去重，不同目标可重复计入同一 ID，允许 quarantinedFailures 大于去重后 ID 数；
// 终态（PASSED/WARN/BLOCKED）passed+blockingFailures+quarantinedFailures=total，基础设施错误另计；
// PASSED 必须全部真实通过；WARN 只能有隔离失败且阻塞/基础设施为 0；BLOCKED 必须有阻塞或基础设施错误；
// PENDING 为活跃态，计数和允许小于 total（矩阵可已有子任务终态），但不得超过 total。
// 任何矛盾或畸形数据都判为不可用，绝不把 clamp 后的 0 计数渲染成通过。
export function isGateDataValid(gate) {
  if (!isGatePresent(gate)) return false;
  if (typeof gate.policy !== 'string' || !gatePolicies.includes(gate.policy)) return false;
  const { total, passed, quarantinedFailures, blockingFailures, infrastructureFailures } = gate;
  if (![total, passed, quarantinedFailures, blockingFailures, infrastructureFailures].every(isSafeNonNegativeInt)) return false;
  if (total <= 0) return false;
  const quarantinedCaseIds = gate.quarantinedCaseIds;
  if (!Array.isArray(quarantinedCaseIds)) return false;
  if (quarantinedCaseIds.length > total) return false;
  if (!quarantinedCaseIds.every((id) => typeof id === 'string' && id.length > 0)) return false;
  if (new Set(quarantinedCaseIds).size !== quarantinedCaseIds.length) return false;
  if (gate.policy === 'strict-legacy-v1') {
    if (quarantinedCaseIds.length !== 0 || quarantinedFailures !== 0) return false;
  } else if (gate.policy !== 'aggregate-v1' && quarantinedFailures > quarantinedCaseIds.length) {
    return false;
  }
  const finished = passed + blockingFailures + quarantinedFailures;
  if (gate.status === 'PENDING') return finished <= total;
  if (finished !== total) return false;
  if (gate.status === 'PASSED') return passed === total && infrastructureFailures === 0;
  if (gate.status === 'WARN') return quarantinedFailures > 0 && blockingFailures === 0 && infrastructureFailures === 0;
  return blockingFailures > 0 || infrastructureFailures > 0;
}

export function gateCounts(gate) {
  return {
    total: nonNegativeInt(gate.total),
    passed: nonNegativeInt(gate.passed),
    quarantined: nonNegativeInt(gate.quarantinedFailures),
    blocking: nonNegativeInt(gate.blockingFailures),
    infrastructure: nonNegativeInt(gate.infrastructureFailures),
  };
}

export function gateStatusDescription(status) {
  if (!isGateStatus(status)) return '';
  return {
    PENDING: '结果尚未冻结，等待全部计划用例到达终态后再给出放行结论。',
    PASSED: '全部计划用例真实通过，门禁放行。',
    WARN: '已隔离的失败按警告放行；隔离集合冻结于提交时刻，原始失败证据仍完整保留在本报告中。',
    BLOCKED: '存在未隔离的阻塞失败或基础设施错误；隔离不能抵消取消、超时与资源故障。',
  }[status];
}

// 隔离集合在提交事务内冻结；门禁判定与导出的结果快照在首次到达终态时冻结，晚到的完成不会改写已冻结结论。
export const gateFreezeNote = '隔离集合在提交时冻结；门禁判定与导出快照在首次到达终态时冻结；之后人工解除隔离或编辑用例不会改变已归档的门禁报告。';
