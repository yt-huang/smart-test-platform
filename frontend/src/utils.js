export const roleLabels = { ADMIN: '管理员', TESTER: '测试工程师', DEVELOPER: '开发者', VIEWER: '只读成员' };
export const statusLabels = {
  DRAFT: '待审批', APPROVED: '已审批', QUEUED: '排队中', ASSIGNED: '已分配', RUNNING: '执行中', CLEANING: '清理中',
  PASSED: '通过', FAILED: '失败', TIMED_OUT: '已超时', CANCELLED: '已取消', OFFLINE: '离线', ONLINE: '在线',
  IDLE: '空闲', BUSY: '使用中', MAINTENANCE: '维护中', ACTIVE: '有效', REVOKED: '已撤销', SKIPPED: '已跳过',
};
export const activeStatuses = ['QUEUED', 'ASSIGNED', 'RUNNING', 'CLEANING'];
export const canWrite = (role) => ['ADMIN', 'TESTER', 'DEVELOPER'].includes(role);
export const canReviewQuality = (role) => ['ADMIN', 'TESTER'].includes(role);
export const dateTime = (value) => value ? new Intl.DateTimeFormat('zh-CN', { dateStyle: 'short', timeStyle: 'medium' }).format(new Date(value)) : '—';
export const shortDate = (value) => value ? new Intl.DateTimeFormat('zh-CN', { month: '2-digit', day: '2-digit' }).format(new Date(value)) : '—';
export const duration = (ms) => ms == null ? '—' : ms < 1000 ? `${Math.round(ms)} ms` : ms < 60000 ? `${(ms / 1000).toFixed(1)} 秒` : `${Math.floor(ms / 60000)} 分 ${Math.round(ms % 60000 / 1000)} 秒`;
export const platformLabels = { web: 'Web 浏览器', android: 'Android', ios: 'iOS' };
export const splitTags = (value) => [...new Set(value.split(/[,，]/).map(x => x.trim()).filter(Boolean))];
export const isTerminal = (status) => !activeStatuses.includes(status);

const fieldText = (value, fallback = '未上报') => typeof value === 'string' && value.trim() ? value : typeof value === 'number' && Number.isFinite(value) ? String(value) : fallback;
export function fingerprintDetails(fingerprint) {
  if (!fingerprint || typeof fingerprint !== 'object' || Array.isArray(fingerprint)) return [{ label: '资源指纹', value: fieldText(fingerprint, '尚未获取') }];
  const platform = fieldText(fingerprint.platform);
  const model = [fingerprint.brand, fingerprint.model, fingerprint.browser].map(value => fieldText(value, '')).filter(Boolean).join(' / ');
  return [
    { label: '设备名称', value: fieldText(fingerprint.name, fieldText(fingerprint.id)) },
    { label: '型号 / 浏览器', value: model || '未上报' },
    { label: '平台', value: platformLabels[platform] || platform },
    { label: '系统 / 版本', value: fieldText(fingerprint.os, fieldText(fingerprint.version)) },
    { label: '资源来源', value: fieldText(fingerprint.provider) },
    { label: '所属 Agent', value: fieldText(fingerprint.agentId) },
  ];
}

export function caseApprovalBody(item) {
  const revision = item.revision;
  if (!Number.isSafeInteger(revision) || revision < 1) throw new Error('当前用例缺少有效版本号，请刷新后重新审核。');
  return { revision };
}

export function validateSteps(steps) {
  if (!steps.length) return '至少添加一个测试步骤。';
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    const prefix = `步骤 ${i + 1}：`;
    if (step.action === 'goto') {
      try {
        const url = new URL(step.target);
        if (!['http:', 'https:'].includes(url.protocol)) return prefix + '页面地址必须使用 http 或 https。';
      } catch { return prefix + '请输入完整页面地址。'; }
    } else if (step.action !== 'screenshot' && !step.target?.trim()) return prefix + '请输入目标元素选择器。';
    if (['fill', 'expectText'].includes(step.action) && !step.value?.trim()) return prefix + '请输入文本值。';
  }
  return null;
}

export function resolveEvidenceUrl(url, apiOrigin, pageOrigin) {
  const origin = new URL(apiOrigin || pageOrigin, pageOrigin).origin;
  const resolved = new URL(url, `${origin}/`);
  if (resolved.origin !== origin) throw new Error('证据链接不属于当前平台，无法发送登录凭据。');
  if (!['http:', 'https:'].includes(resolved.protocol)) throw new Error('不支持此证据链接。');
  return resolved.href;
}
