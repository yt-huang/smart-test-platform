// 时间轴纯函数。所有时刻必须来自真实采集元数据（timing/capture/日志 ISO 前缀），
// 缺失或无效一律返回 null，绝不由 createdAt/duration 推断同步位置。

// 捕获组分组的 ISO 形状：Date.parse 会把不存在的日期（如 2 月 30 日）静默归一化，
// 所以形状匹配后仍须按日历/时刻/offset 数值范围严格校验。
const ISO_PARTS = '(\\d{4})-(\\d{2})-(\\d{2})T(\\d{2}):(\\d{2}):(\\d{2})(?:\\.\\d+)?(Z|[+-]\\d{2}:?\\d{2})';
const ISO_ANCHORED = new RegExp(`^${ISO_PARTS}$`);
const ISO_PREFIX = new RegExp(`^(${ISO_PARTS})(?:\\s|$)`);
const OFFSET_PARTS = /^([+-])(\d{2}):?(\d{2})$/;
export const CAPTURE_KINDS = ['screenshot', 'video', 'trace', 'log'];

function daysInMonth(year, month) {
  if (month === 2) return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0 ? 29 : 28;
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

export function parseIso(value) {
  if (typeof value !== 'string') return null;
  const m = value.match(ISO_ANCHORED);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  const hour = Number(m[4]);
  const minute = Number(m[5]);
  const second = Number(m[6]);
  if (month < 1 || month > 12) return null;
  if (day < 1 || day > daysInMonth(year, month)) return null;
  if (hour > 23 || minute > 59 || second > 59) return null;
  if (m[7] !== 'Z') {
    const offset = m[7].match(OFFSET_PARTS);
    if (!offset || Number(offset[2]) > 23 || Number(offset[3]) > 59) return null;
  }
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

// 截图解码失败提示与复位规则：fetch 200 但 PNG 损坏时 img 触发 error，须给出明确可重试提示；
// 错误按其所属 Object URL 记录，换图或重试拿到新 URL 时旧错误自动失效，不得滞留覆盖新截图。
export const SCREENSHOT_DECODE_ERROR_MESSAGE = '截图已加载但无法解码显示，可能文件损坏，可重试或下载查看。';
export function screenshotDecodeState(objectUrl, error) {
  if (!objectUrl) return '';
  return error && error.url === objectUrl ? error.message : '';
}

// 录像解码失败提示与复位规则：fetch 200 但 WebM 损坏时 video 触发 error，须给出明确可重试提示；
// 错误按其所属 Object URL 记录——重试/换来源拿到新 URL 时旧错误自动失效，
// 不得滞留拦截有效新录像的挂载（旧实现 error 为裸字符串，重试后 video 永不重新挂载）。
export const VIDEO_DECODE_ERROR_MESSAGE = '录像已加载但无法解码播放，可能文件损坏，可重试或下载查看。';
export function videoDecodeState(objectUrl, error) {
  if (!objectUrl) return '';
  return error && error.url === objectUrl ? error.message : '';
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

// 日志：字符串按严格 ISO 前缀解析，对象只取 timestamp；createdAt 等上传属性不作为源时间。
// 没有有效用例窗口时不生成任何 case 日志事件（共享 run 日志无法证明属于所选用例）。
export function logEntryTime(entry) {
  if (typeof entry === 'string') {
    const match = entry.match(ISO_PREFIX);
    return match ? parseIso(match[1]) : null;
  }
  if (entry && typeof entry === 'object') return parseIso(entry.timestamp);
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
    if (!window || time < window.start || time > window.end) continue;
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

// 只有 case/step timing 或 evidence capture 这类可关联采集时间才算已有同步数据；
// 仅有可解析 ISO 前缀的共享日志（却无 case/step/capture 关联时间）的历史报告不算，
// 否则会把别用例/别来源的日志误当作时间轴事件。
export function hasTimelineData(run) {
  const results = run?.results || [];
  if (results.some(r => caseWindow(r) || (r.steps || []).some(s => stepTiming(s)))) return true;
  return results.some(r => (r.evidence || []).some(e => evidenceCapture(e)));
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
