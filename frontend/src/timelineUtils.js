// 时间轴纯函数。所有时刻必须来自真实采集元数据（timing/capture/日志 ISO 前缀），
// 缺失或无效一律返回 null，绝不由 createdAt/duration 推断同步位置。

const ISO_STAMP = '\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(?:\\.\\d+)?(?:Z|[+-]\\d{2}:?\\d{2})';
const ISO_ANCHORED = new RegExp(`^${ISO_STAMP}$`);
const ISO_PREFIX = new RegExp(`^(${ISO_STAMP})(?:\\s|$)`);
export const CAPTURE_KINDS = ['screenshot', 'video', 'trace', 'log'];

export function parseIso(value) {
  if (typeof value !== 'string' || !ISO_ANCHORED.test(value)) return null;
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? null : ms;
}

export function normalizeTiming(timing) {
  if (!timing || typeof timing !== 'object') return null;
  const start = parseIso(timing.startedAt);
  const end = parseIso(timing.finishedAt);
  if (start === null || end === null || end < start) return null;
  return { startedAt: timing.startedAt, finishedAt: timing.finishedAt, start, end };
}

export function caseWindow(result) {
  return normalizeTiming(result?.timing);
}

export function stepTiming(step) {
  return normalizeTiming(step?.timing);
}

// capture 可能是归档对象或 JSON 字符串；只保留白名单字段，无效即视为无采集时间。
export function evidenceCapture(evidence) {
  let raw = evidence?.capture;
  if (typeof raw === 'string') {
    try { raw = JSON.parse(raw); } catch { return null; }
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  if (!CAPTURE_KINDS.includes(raw.kind)) return null;
  const timing = normalizeTiming({ startedAt: raw.startedAt, finishedAt: raw.finishedAt });
  if (!timing) return null;
  return {
    kind: raw.kind,
    caseId: typeof raw.caseId === 'string' ? raw.caseId : undefined,
    startedAt: timing.startedAt,
    finishedAt: timing.finishedAt,
    start: timing.start,
    end: timing.end,
  };
}

// 无 capture 时按媒体类型归类，用于“无采集时间”提示，不生成时间事件。
export function evidenceKind(evidence) {
  const capture = evidenceCapture(evidence);
  if (capture) return capture.kind;
  const type = evidence?.contentType || '';
  if (type.startsWith('image/')) return 'screenshot';
  if (type.startsWith('video/')) return 'video';
  if (type.startsWith('text/')) return 'log';
  if (type.includes('zip') || /\.(zip|har)$/i.test(evidence?.name || evidence?.url || '')) return 'trace';
  return 'file';
}

// 事件时刻定位到录像秒数，metadata.duration 为上界；首帧延迟决定这只是近似位置。
export function clampSeek(eventMs, captureStartMs, durationSec) {
  if (eventMs === null || eventMs === undefined || captureStartMs === null || captureStartMs === undefined) return null;
  if (!(durationSec > 0)) return null;
  const seconds = (eventMs - captureStartMs) / 1000;
  return Math.min(Math.max(seconds, 0), durationSec);
}

// 选包含该时刻的截图，否则选区间距离最近者；并列取靠前。
export function nearestScreenshot(items, timeMs) {
  if (timeMs === null || timeMs === undefined) return null;
  let best = null;
  let bestDistance = Infinity;
  for (const item of items || []) {
    const capture = item.capture || evidenceCapture(item);
    if (!capture) continue;
    const distance = timeMs < capture.start ? capture.start - timeMs : timeMs > capture.end ? timeMs - capture.end : 0;
    if (distance < bestDistance) { bestDistance = distance; best = item; }
  }
  return best;
}

// 日志：字符串按严格 ISO 前缀解析，对象取 timestamp/createdAt；无窗口时保留全部可定位行。
export function logEntryTime(entry) {
  if (typeof entry === 'string') {
    const match = entry.match(ISO_PREFIX);
    return match ? parseIso(match[1]) : null;
  }
  if (entry && typeof entry === 'object') return parseIso(entry.timestamp) ?? parseIso(entry.createdAt);
  return null;
}

export function logEntryText(entry) {
  if (typeof entry === 'string') {
    const match = entry.match(ISO_PREFIX);
    return match ? entry.slice(match[0].length) : entry;
  }
  if (entry && typeof entry === 'object') return typeof entry.message === 'string' ? entry.message : JSON.stringify(entry);
  return String(entry);
}

export function logsInWindow(logs, window) {
  const lines = [];
  let unpositioned = 0;
  for (const entry of logs || []) {
    const time = logEntryTime(entry);
    if (time === null) { unpositioned++; continue; }
    if (window && (time < window.start || time > window.end)) continue;
    lines.push({ time, text: logEntryText(entry) });
  }
  lines.sort((a, b) => a.time - b.time);
  return { lines, unpositioned };
}

export function defaultCaseId(results) {
  const list = results || [];
  const failed = list.find(r => r.status === 'FAILED');
  if (failed) return failed.caseId ?? null;
  const timed = list.find(r => caseWindow(r));
  if (timed) return timed.caseId ?? null;
  return list[0]?.caseId ?? null;
}

// 默认失败点：首个失败步骤的 finishedAt；没有失败步骤则无定位。
export function defaultFocusTime(result) {
  for (const step of result?.steps || []) {
    if (step?.status === 'FAILED' || step?.status === 'ERROR') {
      const timing = stepTiming(step);
      if (timing) return timing.end;
    }
  }
  return null;
}

export function hasTimelineData(run) {
  const results = run?.results || [];
  if (results.some(r => caseWindow(r) || (r.steps || []).some(s => stepTiming(s)))) return true;
  if (results.some(r => (r.evidence || []).some(e => evidenceCapture(e)))) return true;
  return (run?.logs || []).some(entry => logEntryTime(entry) !== null);
}

export function clockTime(ms) {
  if (ms === null || ms === undefined) return '—';
  return new Date(ms).toISOString().slice(11, 23);
}

export function relativeLabel(ms) {
  if (ms === null || ms === undefined) return '—';
  const sign = ms < 0 ? '-' : '+';
  return `${sign}${(Math.abs(ms) / 1000).toFixed(1)} 秒`;
}

export function approxSecondsLabel(seconds) {
  if (seconds === null || seconds === undefined) return '';
  return `约 ${seconds.toFixed(1)} 秒`;
}
