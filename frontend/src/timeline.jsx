import { useEffect, useRef, useState } from 'react';
import { Camera, Clock3, Crosshair, FileDown, FileImage, Film, ListOrdered, TerminalSquare } from 'lucide-react';
import { authenticatedBlob, downloadFile } from './api.js';
import { Badge, Button, Empty, ErrorNotice, Loading } from './components.jsx';
import { duration } from './utils.js';
import {
  approxSecondsLabel, caseWindow, clampSeek, clockTime, defaultCaseId, defaultFocusTime,
  evidenceCapture, evidenceKind, hasTimelineData, logsInWindow, nearestScreenshot, relativeLabel,
  screenshotDecodeState, SCREENSHOT_DECODE_ERROR_MESSAGE, stepTiming,
} from './timelineUtils.js';

// 取真实 Blob 并管理 Object URL：切换 case/unmount 时中止未完成请求并释放旧 URL，避免旧媒体覆盖当前用例。
function useObjectUrl(url) {
  const [reloadKey, setReloadKey] = useState(0);
  const [state, setState] = useState({ objectUrl: '', loading: false, error: '' });
  useEffect(() => {
    if (!url) { setState({ objectUrl: '', loading: false, error: '' }); return undefined; }
    let alive = true;
    let created = '';
    const controller = new AbortController();
    setState({ objectUrl: '', loading: true, error: '' });
    authenticatedBlob(url, controller.signal)
      .then(blob => {
        if (!alive) return;
        created = URL.createObjectURL(blob);
        setState({ objectUrl: created, loading: false, error: '' });
      })
      .catch(err => {
        if (!alive || err.name === 'AbortError') return;
        setState({ objectUrl: '', loading: false, error: err.message || '媒体加载失败' });
      });
    return () => { alive = false; controller.abort(); if (created) URL.revokeObjectURL(created); };
  }, [url, reloadKey]);
  return { ...state, retry: () => setReloadKey(key => key + 1) };
}

function normalizeEvidence(result) {
  return (result?.evidence || []).map(item => (typeof item === 'string' ? { url: item } : item));
}

export function TimelinePanel({ run }) {
  const results = run?.results || [];
  const [caseId, setCaseId] = useState(() => defaultCaseId(results));
  useEffect(() => {
    if (!results.some(r => r.caseId === caseId)) setCaseId(defaultCaseId(results));
  }, [results, caseId]);
  if (!hasTimelineData(run)) {
    return <div className="timeline-panel"><Empty icon={Clock3} title="未记录采集时间" description="此报告来自未记录采集时刻的执行版本，无法按时间同步定位；时间轴不会用上传时间或耗时推断虚构事件，仍可在「用例与步骤」「执行日志」「执行证据」查看原始内容与证据。" /></div>;
  }
  const result = results.find(r => r.caseId === caseId) || null;
  return <div className="timeline-panel">
    <div className="timeline-head">
      <label className="timeline-case-field"><span>关联用例</span>
        <select aria-label="选择时间轴用例" value={caseId ?? ''} onChange={e => setCaseId(e.target.value)}>
          {results.map((r, i) => <option key={`${r.caseId}-${i}`} value={r.caseId}>{r.name || r.caseId}{r.status === 'FAILED' ? '（失败）' : ''}</option>)}
        </select>
      </label>
    </div>
    {result ? <CaseTimeline key={caseId} run={run} result={result} /> : <Empty icon={ListOrdered} title="此任务没有用例执行结果" description="时间轴需要至少一个用例结果；可切换到「执行日志」查看原始日志。" />}
  </div>;
}

function CaseTimeline({ run, result }) {
  const window_ = caseWindow(result);
  const initialFocus = defaultFocusTime(result);
  const [focus, setFocus] = useState(initialFocus);
  const evidence = normalizeEvidence(result);
  const shots = evidence.filter(e => evidenceKind(e) === 'screenshot' && evidenceCapture(e)).map(e => ({ ...e, capture: evidenceCapture(e) }));
  const videos = evidence.filter(e => evidenceKind(e) === 'video' && evidenceCapture(e)).map(e => ({ ...e, capture: evidenceCapture(e) }));
  const traces = evidence.filter(e => evidenceKind(e) === 'trace');
  const [traceError, setTraceError] = useState('');
  const { lines, unpositioned } = logsInWindow(run.logs, window_);
  async function downloadTrace(item, index) {
    setTraceError('');
    try { await downloadFile(item.url, item.name || `trace-${index + 1}.zip`); } catch (err) { setTraceError(err.message); }
  }
  return <div className="timeline-case">
    <div className="timeline-focus-meta">
      <span>焦点时刻：<strong>{focus != null ? `${clockTime(focus)}（${relativeLabel(window_ ? focus - window_.start : null)}）` : '未定位'}</strong></span>
      <span>用例窗口：<strong>{window_ ? `${clockTime(window_.start)} → ${clockTime(window_.end)}` : '未记录用例起止时间'}</strong></span>
      <Button variant="secondary" disabled={initialFocus == null} onClick={() => setFocus(initialFocus)}><Crosshair size={14} />定位首个失败点</Button>
    </div>
    {!window_ && <p className="timeline-note">该用例未记录起止时间，无法圈定日志窗口或计算相对时刻；以下仅显示真实存在的采集时间。</p>}
    <div className="timeline-grid">
      <StepTrack result={result} focus={focus} windowStart={window_?.start} onFocus={setFocus} />
      <ScreenshotTrack shots={shots} focus={focus} windowStart={window_?.start} onFocus={setFocus} />
      <VideoTrack videos={videos} focus={focus} />
      <LogTrack lines={lines} unpositioned={unpositioned} focus={focus} />
    </div>
    {traces.length > 0 && <div className="timeline-traces"><span>追踪文件（trace 不是录像，按原方式下载）：</span>{traces.map((t, i) => <Button key={t.id || t.url || i} variant="secondary" onClick={() => downloadTrace(t, i)}><FileDown size={14} />{t.name || `trace-${i + 1}`}</Button>)}</div>}
    <ErrorNotice compact message={traceError} />
  </div>;
}

function StepTrack({ result, focus, windowStart, onFocus }) {
  const steps = result.steps || [];
  return <section className="timeline-track">
    <header><ListOrdered size={15} />步骤<span>{steps.length ? `${steps.length} 步` : ''}</span></header>
    {steps.length ? <ol className="timeline-track-list">{steps.map((step, i) => {
      const timing = stepTiming(step);
      const label = step.action || step.name || `步骤 ${i + 1}`;
      const body = <><div className="timeline-event-body"><strong>{label}</strong>{step.target && <code>{step.target}</code>}{step.error && <p className="fail-text">{step.error}</p>}</div>{step.status && <Badge status={step.status} />}</>;
      if (!timing) return <li key={i}><div className="timeline-event static"><span className="step-number">{i + 1}</span>{body}<span className="timeline-event-time">未记录时刻</span></div></li>;
      return <li key={i}><button type="button" className={`timeline-event ${focus === timing.end ? 'active' : ''}`} aria-label={`定位步骤 ${i + 1} ${label} 的完成时刻`} onClick={() => onFocus(timing.end)}>
        <span className="step-number">{i + 1}</span>{body}
        <span className="timeline-event-time" title={`${clockTime(timing.start)} → ${clockTime(timing.end)}`}>{relativeLabel(windowStart != null ? timing.end - windowStart : null)}</span>
      </button></li>;
    })}</ol> : <p className="timeline-note">Agent 未提供逐步结果。</p>}
  </section>;
}

function ScreenshotTrack({ shots, focus, windowStart, onFocus }) {
  const nearest = nearestScreenshot(shots, focus);
  const current = useObjectUrl(nearest?.url);
  // 解码错误按其 Object URL 记录：换图/重试拿到新 URL 时旧错误自动失效（见 screenshotDecodeState）。
  const [decodeError, setDecodeError] = useState(null);
  const decodeMessage = screenshotDecodeState(current.objectUrl, decodeError);
  const distance = nearest && focus != null ? (focus < nearest.capture.start ? nearest.capture.start - focus : focus > nearest.capture.end ? focus - nearest.capture.end : 0) : null;
  const mediaError = current.error || decodeMessage;
  return <section className="timeline-track">
    <header><Camera size={15} />截图<span>{shots.length ? `${shots.length} 张` : '无'}</span></header>
    {shots.length ? <ul className="timeline-track-list">{shots.map((shot, i) => <li key={shot.id || shot.url || i}>
      <button type="button" className={`timeline-event ${nearest === shot ? 'active' : ''}`} aria-label={`定位截图 ${shot.name || i + 1} 的采集完成时刻`} onClick={() => onFocus(shot.capture.end)}>
        <FileImage size={13} /><span className="timeline-shot-name">{shot.name || `截图 ${i + 1}`}</span>
        <span className="timeline-event-time" title={`${clockTime(shot.capture.start)} → ${clockTime(shot.capture.end)}`}>{relativeLabel(windowStart != null ? shot.capture.end - windowStart : null)}</span>
      </button>
    </li>)}</ul> : <p className="timeline-note">该用例没有带采集时间的截图证据。</p>}
    <div className="timeline-media">
      {current.loading && <div className="timeline-media-status"><Loading label="正在加载截图…" /></div>}
      {!current.loading && mediaError && <div className="timeline-media-status"><ErrorNotice compact message={mediaError} onRetry={current.retry} /></div>}
      {!current.loading && !mediaError && !current.objectUrl && <div className="timeline-media-status">点击步骤或截图事件后，这里显示对应时刻最接近的真实截图。</div>}
      {current.objectUrl && nearest && !decodeMessage && <figure>
        <a href={current.objectUrl} target="_blank" rel="noreferrer"><img src={current.objectUrl} alt={`截图 ${nearest.name || '证据'}`} onError={() => setDecodeError({ url: current.objectUrl, message: SCREENSHOT_DECODE_ERROR_MESSAGE })} /></a>
        <figcaption>{nearest.name || '截图'} · 采集于 {clockTime(nearest.capture.start)}{distance != null && distance > 0 ? ` · 距焦点 ${relativeLabel(distance)}` : ' · 包含焦点时刻'}</figcaption>
      </figure>}
    </div>
  </section>;
}

function VideoTrack({ videos, focus }) {
  const primary = videos[0];
  const capture = primary ? evidenceCapture(primary) : null;
  const { objectUrl, loading, error, retry } = useObjectUrl(primary?.url);
  const videoRef = useRef(null);
  const [meta, setMeta] = useState(null);
  const [decodeError, setDecodeError] = useState('');
  const [seekHint, setSeekHint] = useState(null);
  const captureStart = capture?.start ?? null;
  useEffect(() => {
    if (focus == null || captureStart == null || meta == null || !videoRef.current) return;
    const target = clampSeek(focus, captureStart, meta.duration);
    if (target == null) return;
    try { videoRef.current.currentTime = target; videoRef.current.pause(); setSeekHint(target); } catch { setSeekHint(null); }
  }, [focus, captureStart, meta]);
  const mediaError = error || decodeError;
  return <section className="timeline-track">
    <header><Film size={15} />录像<span>{videos.length ? `${videos.length} 段` : '无'}{meta ? ` · ${duration(meta.duration * 1000)}` : ''}</span></header>
    {!primary && <p className="timeline-note">该用例没有带采集时间的录像证据。</p>}
    {videos.length > 1 && <p className="timeline-note">该用例有多段录像，此处播放第一段；其余请在「执行证据」查看。</p>}
    {primary && <div className="timeline-media">
      {loading && <div className="timeline-media-status"><Loading label="正在加载录像…" /></div>}
      {mediaError && !loading && <div className="timeline-media-status"><ErrorNotice compact message={mediaError} onRetry={retry} /></div>}
      {objectUrl && !loading && !decodeError && <video ref={videoRef} controls src={objectUrl} onLoadedMetadata={e => { setMeta({ duration: e.currentTarget.duration }); setDecodeError(''); }} onError={() => setDecodeError('录像已加载但无法解码播放，可能文件损坏，可重试或下载查看。')} />}
    </div>}
    {primary && capture && <p className="timeline-note">录像起点为录制启动时刻（非精确首帧，首帧延迟影响定位精度）；seek 上界取媒体 metadata.duration。{seekHint != null && <strong>已定位到 {approxSecondsLabel(seekHint)}（近似位置）。</strong>}</p>}
  </section>;
}

function LogTrack({ lines, unpositioned, focus }) {
  return <section className="timeline-track">
    <header><TerminalSquare size={15} />日志<span>{lines.length ? `${lines.length} 行在窗口内` : ''}</span></header>
    {lines.length ? <ol className="timeline-log-list">{lines.map((line, i) => {
      const near = focus != null && Math.abs(line.time - focus) <= 5000;
      return <li key={i} className={`timeline-log-line ${near ? 'near' : ''}`}><span className="tl-ts">{clockTime(line.time)}</span>{line.text}</li>;
    })}</ol> : <p className="timeline-note">当前用例时间窗口内没有可定位的日志。</p>}
    {unpositioned > 0 && <p className="timeline-note">{unpositioned} 行日志缺少可解析的 ISO 时间，未在时间轴定位；可在「执行日志」标签查看原文。</p>}
  </section>;
}
