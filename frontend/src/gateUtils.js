export const gateStatusLabels = { PENDING: '等待判定', PASSED: '通过', WARN: '警告放行', BLOCKED: '阻塞' };

const nonNegativeInt = (value) => Number.isSafeInteger(value) && value >= 0 ? value : 0;

// 契约 v1：公开 gate 的 status 仅为 PENDING/PASSED/WARN/BLOCKED。
// 缺失或状态无法识别的数据一律视为“未提供门禁判定”，绝不推断为通过，也不把原始字段渲染成界面文案。
export function isGatePresent(gate) {
  return !!gate && typeof gate === 'object' && !Array.isArray(gate) && !!gateStatusLabels[gate.status];
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
  return {
    PENDING: '结果尚未冻结，等待全部计划用例到达终态后再给出放行结论。',
    PASSED: '全部计划用例真实通过，门禁放行。',
    WARN: '已隔离的失败按警告放行；隔离集合冻结于提交时刻，原始失败证据仍完整保留在本报告中。',
    BLOCKED: '存在未隔离的阻塞失败或基础设施错误；隔离不能抵消取消、超时与资源故障。',
  }[status] || '';
}

export const gateFreezeNote = '门禁判定与隔离集合在提交时冻结；之后人工解除隔离或编辑用例不会改变已归档的门禁报告。';
