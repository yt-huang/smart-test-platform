export const matrixBrowsers = [
  { id: 'chromium', label: 'Chromium' },
  { id: 'firefox', label: 'Firefox' },
  { id: 'webkit', label: 'WebKit' },
];
export const matrixActiveStatuses = ['QUEUED', 'RUNNING'];
export const isMatrixActive = (status) => matrixActiveStatuses.includes(status);

export function buildMatrixPayload({ planId, name = '', commitSha = '', variants = [] }) {
  if (!planId) throw new Error('请先选择一个测试计划。');
  if (!Array.isArray(variants) || variants.length < 2) throw new Error('至少选择两个浏览器目标。');
  if (variants.length > 8) throw new Error('单个批次最多 8 个目标。');
  const cleanName = name.trim();
  const cleanCommit = commitSha.trim();
  if (cleanName.length > 150) throw new Error('批次名称最多 150 个字符。');
  if (cleanCommit.length > 128) throw new Error('关联 Commit 最多 128 个字符。');
  const seen = new Set();
  const normalized = variants.map((variant) => {
    const label = String(variant.label || '').trim();
    const browser = String(variant.browser || '').trim().toLowerCase();
    if (!label || label.length > 80) throw new Error('每个目标名称需为 1–80 个字符。');
    const key = label.toLowerCase();
    if (seen.has(key)) throw new Error(`目标名称「${label}」重复，请区分不同目标。`);
    seen.add(key);
    if (!matrixBrowsers.some(entry => entry.id === browser)) throw new Error(`不支持的目标浏览器：${browser || '空'}。`);
    return { label, capabilities: { browser } };
  });
  const body = { planId, variants: normalized };
  if (cleanName) body.name = cleanName;
  if (cleanCommit) body.commitSha = cleanCommit;
  return body;
}

export function matrixStatusMessage(status) {
  return {
    QUEUED: '批次已创建，全部目标排队等待匹配的真实资源。',
    RUNNING: '部分目标正在执行，等待全部目标到达终态后再汇总判定。',
    PASSED: '全部目标完成且所有用例通过。',
    FAILED: '存在失败或超时的目标，证据与失败原因保留在对应执行记录中。',
    CANCELLED: '批次已取消，取消前已完成的目标结果保留。',
  }[status] || '查看此批次的矩阵回归记录。';
}
