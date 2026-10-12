import test from 'node:test';
import assert from 'node:assert/strict';
import {
  approxSecondsLabel, caseWindow, clampSeek, defaultCaseId, defaultFocusTime,
  evidenceCapture, evidenceKind, hasTimelineData, logEntryTime, logsInWindow,
  nearestScreenshot, normalizeTiming, parseIso, relativeLabel,
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
  assert.equal(parseIso('2026-10-12 00:00:01Z'), null);
  assert.equal(parseIso('2026-10-12T00:00:01'), null);
  assert.equal(parseIso('2026-13-12T00:00:01Z'), null);
  assert.equal(parseIso('nope'), null);
  assert.equal(parseIso(123), null);
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
  const all = logsInWindow(logs, null);
  assert.equal(all.lines.length, 4);
  assert.equal(logEntryTime('2026-10-12 00:00:10Z not iso'), null);
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

test('hasTimelineData is false for legacy reports without any real timestamps', () => {
  assert.equal(hasTimelineData({ results: [{ caseId: 'c', durationMs: 100 }], logs: ['plain log line'] }), false);
  assert.equal(hasTimelineData({ results: [TIMED_CASE] }), true);
  assert.equal(hasTimelineData({ results: [{ caseId: 'c', evidence: [{ capture: { kind: 'screenshot', startedAt: '2026-10-12T00:00:01Z', finishedAt: '2026-10-12T00:00:02Z' } }] }] }), true);
  assert.equal(hasTimelineData({ logs: ['2026-10-12T00:00:01Z hello'] }), true);
  assert.equal(hasTimelineData({}), false);
});

test('labels render relative offsets and approximate positions without claiming frame accuracy', () => {
  assert.equal(relativeLabel(1234), '+1.2 秒');
  assert.equal(relativeLabel(-500), '-0.5 秒');
  assert.equal(relativeLabel(null), '—');
  assert.equal(approxSecondsLabel(5.55), '约 5.5 秒');
  assert.equal(approxSecondsLabel(null), '');
});
