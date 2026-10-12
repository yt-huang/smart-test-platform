import test from 'node:test';
import assert from 'node:assert/strict';
import {
  approxSecondsLabel, caseWindow, clampSeek, defaultCaseId, defaultFocusTime,
  evidenceCapture, evidenceKind, hasTimelineData, logEntryTime, logsInWindow,
  nearestScreenshot, normalizeTiming, parseIso, relativeLabel,
  screenshotDecodeState, SCREENSHOT_DECODE_ERROR_MESSAGE, VIDEO_DECODE_ERROR_MESSAGE, videoDecodeState,
} from './timelineUtils.js';

const TIMED_CASE = {
  caseId: 'case-1', status: 'FAILED',
  timing: { startedAt: '2026-10-12T00:00:10.000Z', finishedAt: '2026-10-12T00:00:20.000Z' },
  steps: [
    { action: 'goto', status: 'PASSED', timing: { startedAt: '2026-10-12T00:00:10.000Z', finishedAt: '2026-10-12T00:00:11.000Z' } },
    { action: 'expectText', status: 'FAILED', timing: { startedAt: '2026-10-12T00:00:11.500Z', finishedAt: '2026-10-12T00:00:12.400Z' } },
  ],
};

test('parseIso only accepts anchored ISO stamps with zone offset', () => {
  assert.equal(parseIso('2026-10-12T00:00:01.000Z'), Date.parse('2026-10-12T00:00:01.000Z'));
  assert.equal(parseIso('2026-10-12T08:00:01+08:00'), Date.parse('2026-10-12T08:00:01+08:00'));
  assert.equal(parseIso('2026-10-12T08:00:01+0800'), Date.parse('2026-10-12T08:00:01+0800'));
  assert.equal(parseIso('2026-10-12 00:00:01Z'), null);
  assert.equal(parseIso('2026-10-12T00:00:01'), null);
  assert.equal(parseIso('nope'), null);
  assert.equal(parseIso(123), null);
});

test('parseIso strictly validates calendar, clock time and offset instead of Date.parse normalization', () => {
  // Date.parse 会把这些不存在的日期静默归一化，严格校验必须拒绝。
  assert.equal(parseIso('2026-02-30T00:00:00.000Z'), null);
  assert.equal(parseIso('2026-02-29T00:00:00.000Z'), null); // 2026 非闰年
  assert.equal(parseIso('2028-02-29T00:00:00.000Z'), Date.parse('2028-02-29T00:00:00.000Z')); // 闰年合法
  assert.equal(parseIso('2026-04-31T00:00:00.000Z'), null); // 4 月无 31 日
  assert.equal(parseIso('2026-00-12T00:00:00.000Z'), null);
  assert.equal(parseIso('2026-13-12T00:00:01Z'), null);
  assert.equal(parseIso('2026-10-00T00:00:01Z'), null);
  assert.equal(parseIso('2026-10-32T00:00:01Z'), null);
  assert.equal(parseIso('2026-10-12T24:00:01Z'), null);
  assert.equal(parseIso('2026-10-12T00:60:01Z'), null);
  assert.equal(parseIso('2026-10-12T00:00:60Z'), null);
  assert.equal(parseIso('2026-10-12T00:00:01+24:00'), null);
  assert.equal(parseIso('2026-10-12T00:00:01+08:60'), null);
  assert.equal(parseIso('2026-10-12T00:00:01+2360'), null);
});

test('normalizeTiming keeps paired ordered stamps and rejects reversed or partial pairs', () => {
  const timing = normalizeTiming({ startedAt: '2026-10-12T00:00:01.000Z', finishedAt: '2026-10-12T00:00:01.030Z' });
  assert.equal(timing.start, Date.parse('2026-10-12T00:00:01.000Z'));
  assert.equal(timing.end, Date.parse('2026-10-12T00:00:01.030Z'));
  assert.equal(normalizeTiming({ startedAt: '2026-10-12T00:00:02Z', finishedAt: '2026-10-12T00:00:01Z' }), null);
  assert.equal(normalizeTiming({ startedAt: '2026-10-12T00:00:01Z' }), null);
  assert.equal(normalizeTiming(null), null);
});

test('caseWindow stays null for legacy results so no fabricated timeline appears', () => {
  assert.equal(caseWindow({ caseId: 'case-9', durationMs: 5300 }), null);
  assert.equal(caseWindow(TIMED_CASE).start, Date.parse('2026-10-12T00:00:10.000Z'));
});

test('evidenceCapture keeps only whitelisted fields and accepts archived JSON strings', () => {
  const capture = evidenceCapture({
    url: '/api/evidence/1',
    capture: { kind: 'screenshot', caseId: 'case-1', startedAt: '2026-10-12T00:00:01.000Z', finishedAt: '2026-10-12T00:00:01.030Z', injected: 'drop-me' },
  });
  assert.deepEqual(Object.keys(capture), ['kind', 'caseId', 'startedAt', 'finishedAt', 'start', 'end']);
  assert.equal(capture.kind, 'screenshot');
  const fromString = evidenceCapture({ capture: JSON.stringify({ kind: 'video', startedAt: '2026-10-12T00:00:00.000Z', finishedAt: '2026-10-12T00:00:09.000Z' }) });
  assert.equal(fromString.kind, 'video');
  assert.equal(fromString.start, Date.parse('2026-10-12T00:00:00.000Z'));
  assert.equal(evidenceCapture({ capture: { kind: 'screenshot', startedAt: 'x', finishedAt: 'y' } }), null);
  assert.equal(evidenceCapture({ capture: { kind: 'other', startedAt: '2026-10-12T00:00:01Z', finishedAt: '2026-10-12T00:00:02Z' } }), null);
  assert.equal(evidenceCapture({ capture: '{broken' }), null);
  assert.equal(evidenceCapture({}), null);
});

test('evidenceKind falls back to media type without inventing capture times', () => {
  assert.equal(evidenceKind({ contentType: 'image/png' }), 'screenshot');
  assert.equal(evidenceKind({ contentType: 'video/webm' }), 'video');
  assert.equal(evidenceKind({ contentType: 'application/zip', name: 'trace.zip' }), 'trace');
  assert.equal(evidenceKind({ url: '/api/evidence/7' }), 'file');
});

test('clampSeek maps event time onto video seconds bounded by metadata duration', () => {
  const start = Date.parse('2026-10-12T00:00:00.000Z');
  assert.equal(clampSeek(Date.parse('2026-10-12T00:00:05.500Z'), start, 9), 5.5);
  assert.equal(clampSeek(Date.parse('2026-10-12T00:00:05.500Z'), start, 4), 4);
  assert.equal(clampSeek(Date.parse('2026-10-11T23:59:58.000Z'), start, 9), 0);
  assert.equal(clampSeek(null, start, 9), null);
  assert.equal(clampSeek(start + 1000, null, 9), null);
  assert.equal(clampSeek(start + 1000, start, 0), null);
});

test('nearestScreenshot picks the capture containing the moment, else the closest interval', () => {
  const shots = [
    { id: 'a', capture: { start: 1000, end: 1100 } },
    { id: 'b', capture: { start: 2000, end: 2100 } },
  ];
  assert.equal(nearestScreenshot(shots, 2050)?.id, 'b');
  assert.equal(nearestScreenshot(shots, 1500)?.id, 'a');
  assert.equal(nearestScreenshot(shots, 2500)?.id, 'b');
  assert.equal(nearestScreenshot(shots, null), null);
  assert.equal(nearestScreenshot([{ id: 'plain' }], 1500), null);
});

test('logsInWindow parses strict ISO prefixes, filters to the case window and counts unpositioned lines', () => {
  const logs = [
    '2026-10-12T00:00:10.200Z page loaded',
    '2026-10-12T00:00:19.900Z assertion failed',
    '2026-10-12T00:00:25.000Z outside window',
    'no timestamp here',
    { timestamp: '2026-10-12T00:00:15.000Z', message: 'object log' },
  ];
  const { lines, unpositioned } = logsInWindow(logs, { start: Date.parse('2026-10-12T00:00:10.000Z'), end: Date.parse('2026-10-12T00:00:20.000Z') });
  assert.deepEqual(lines.map(l => l.text.trim()), ['page loaded', 'object log', 'assertion failed']);
  assert.equal(unpositioned, 1);
  assert.equal(logEntryTime('2026-10-12 00:00:10Z not iso'), null);
});

test('logsInWindow without a valid case window generates no case log events', () => {
  // 共享 run 日志无法证明属于所选用例：无窗口时即便有可解析 ISO 时间也不生成事件。
  const none = logsInWindow(['2026-10-12T00:00:01.000Z other case synthetic log'], null);
  assert.equal(none.lines.length, 0);
  assert.equal(none.unpositioned, 0);
  const mixed = logsInWindow(['2026-10-12T00:00:01.000Z other case log', 'plain line'], null);
  assert.equal(mixed.lines.length, 0);
  assert.equal(mixed.unpositioned, 1);
});

test('logEntryTime rejects calendar-invalid prefixes and createdAt upload attributes', () => {
  // Date.parse 会归一化 2 月 30 日，严格校验必须视为不可定位。
  assert.equal(logEntryTime('2026-02-30T00:00:00.000Z synthetic impossible date'), null);
  assert.equal(logEntryTime('2026-13-12T00:00:00.000Z bad month'), null);
  // 对象日志只认 timestamp；createdAt 是上传属性，不作为源时间。
  assert.equal(logEntryTime({ createdAt: '2026-10-12T00:00:01.000Z', message: 'upload attr only' }), null);
  assert.equal(logEntryTime({ timestamp: '2026-10-12T00:00:01.000Z', message: 'ok' }), Date.parse('2026-10-12T00:00:01.000Z'));
  assert.equal(logEntryTime(null), null);
});

test('defaultCaseId prefers the first failure, then the first timed case', () => {
  const timedPassed = { ...TIMED_CASE, caseId: 'case-1', status: 'PASSED' };
  assert.equal(defaultCaseId([timedPassed, { caseId: 'case-2', status: 'FAILED' }]), 'case-2');
  assert.equal(defaultCaseId([TIMED_CASE, { caseId: 'case-2', status: 'FAILED' }]), 'case-1');
  assert.equal(defaultCaseId([{ caseId: 'case-3', status: 'PASSED' }, TIMED_CASE]), 'case-1');
  assert.equal(defaultCaseId([{ caseId: 'case-4' }, { caseId: 'case-5' }]), 'case-4');
  assert.equal(defaultCaseId([]), null);
});

test('defaultFocusTime uses the first failed step finishedAt and nothing else', () => {
  assert.equal(defaultFocusTime(TIMED_CASE), Date.parse('2026-10-12T00:00:12.400Z'));
  assert.equal(defaultFocusTime({ steps: [{ action: 'goto', status: 'PASSED', timing: { startedAt: '2026-10-12T00:00:01Z', finishedAt: '2026-10-12T00:00:02Z' } }] }), null);
  assert.equal(defaultFocusTime({ steps: [{ action: 'x', status: 'FAILED' }] }), null);
  assert.equal(defaultFocusTime({}), null);
});

test('hasTimelineData is false for legacy reports without correlatable capture times', () => {
  assert.equal(hasTimelineData({ results: [{ caseId: 'c', durationMs: 100 }], logs: ['plain log line'] }), false);
  assert.equal(hasTimelineData({ results: [TIMED_CASE] }), true);
  assert.equal(hasTimelineData({ results: [{ caseId: 'c', evidence: [{ capture: { kind: 'screenshot', startedAt: '2026-10-12T00:00:01Z', finishedAt: '2026-10-12T00:00:02Z' } }] }] }), true);
  assert.equal(hasTimelineData({}), false);
});

test('hasTimelineData ignores ISO-only logs and createdAt upload attributes in legacy history', () => {
  // 旧报告只有可解析 ISO 的共享日志与 createdAt 等上传属性，缺 case/step/capture 关联时间，
  // 不能当作已有同步数据，否则时间轴会被误选并展示别来源的日志事件。
  const legacy = {
    createdAt: '2026-10-12T00:00:00.000Z',
    results: [{
      caseId: 'c', status: 'PASSED', durationMs: 1000,
      createdAt: '2026-10-12T00:00:00.500Z',
      evidence: [{ contentType: 'image/png', createdAt: '2026-10-12T00:00:01.000Z', url: '/api/evidence/1' }],
    }],
    logs: ['2026-10-12T00:00:01.000Z plain iso log', { createdAt: '2026-10-12T00:00:02.000Z', message: 'upload attr log' }],
  };
  assert.equal(hasTimelineData(legacy), false);
  // 一旦存在真实 step timing，即便其余字段是 legacy 上传属性也仍算有同步数据。
  assert.equal(hasTimelineData({ ...legacy, results: [{ ...legacy.results[0], steps: TIMED_CASE.steps }] }), true);
});

test('screenshotDecodeState reports decode failure only for the current object URL and resets on change', () => {
  const errA = { url: 'blob:a', message: SCREENSHOT_DECODE_ERROR_MESSAGE };
  // 正常解码无错误；fetch 200 但 PNG 损坏时对当前 URL 给出可重试提示。
  assert.equal(screenshotDecodeState('blob:a', null), '');
  assert.equal(screenshotDecodeState('blob:a', errA), SCREENSHOT_DECODE_ERROR_MESSAGE);
  // 换图（新 Object URL）或重试后旧错误必须失效，不能滞留覆盖新截图；无当前图时不显示。
  assert.equal(screenshotDecodeState('blob:b', errA), '');
  assert.equal(screenshotDecodeState('', errA), '');
});

test('videoDecodeState reports decode failure only for the current object URL and resets on change', () => {
  const errA = { url: 'blob:a', message: VIDEO_DECODE_ERROR_MESSAGE };
  // fetch 200 但 WebM 损坏：仅对当前 URL 报可重试提示；重试/换来源拿到新 URL 后旧错误必须失效，
  // 否则 !decodeMessage 条件会让有效新录像永远不挂载（真实门禁复核发现的恢复死锁）。
  assert.equal(videoDecodeState('blob:a', null), '');
  assert.equal(videoDecodeState('blob:a', errA), VIDEO_DECODE_ERROR_MESSAGE);
  assert.equal(videoDecodeState('blob:b', errA), '');
  assert.equal(videoDecodeState('', errA), '');
});

test('labels render relative offsets and approximate positions without claiming frame accuracy', () => {
  assert.equal(relativeLabel(1234), '+1.2 秒');
  assert.equal(relativeLabel(-500), '-0.5 秒');
  assert.equal(relativeLabel(null), '—');
  assert.equal(approxSecondsLabel(5.55), '约 5.5 秒');
  assert.equal(approxSecondsLabel(null), '');
});
