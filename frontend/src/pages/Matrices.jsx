import { useEffect, useState } from 'react';
import { ArrowLeft, ArrowUpRight, Clock3, Download, Fingerprint, Layers, Play, Search, ShieldCheck, Square } from 'lucide-react';
import { api, apiOrigin, downloadFile, useResource } from '../api.js';
import { Badge, Button, ConfirmButton, Empty, ErrorNotice, Field, Loading, Modal, PageHeading, RefreshButton, SectionTitle, useToast } from '../components.jsx';
import { GateBadge, GateSummary } from '../gate.jsx';
import { activeStatuses, canWrite, dateTime, duration, statusLabels } from '../utils.js';
import { buildMatrixPayload, defaultMatrixName, isMatrixActive, matrixBrowsers, matrixFingerprintLines, matrixStatusMessage } from '../matrixUtils.js';

export default function Matrices({ user }) {
  const resource = useResource('/matrices', { poll: 7000 });
  const [search, setSearch] = useState('');
  const writable = canWrite(user.role);
  const matrices = (resource.data || []).filter(m => `${m.name || ''} ${m.id}`.toLowerCase().includes(search.toLowerCase()));
  return <><PageHeading eyebrow="BROWSER MATRIX" title="矩阵回归" description="一次提交多个浏览器目标，平台按真实资源能力分别调度并汇总结果。"><RefreshButton resource={resource} /><a className="button secondary" href="#/plans">{writable ? <><Play size={16} />从计划发起</> : <><Layers size={16} />查看测试计划</>}</a></PageHeading><ErrorNotice message={resource.error} onRetry={resource.reload} /><section className="card"><div className="table-toolbar"><div className="search-field"><Search size={17} /><input aria-label="搜索矩阵批次" placeholder="搜索批次名称或 ID" value={search} onChange={e => setSearch(e.target.value)} /></div><span className="poll-label"><span />每 7 秒更新</span></div>{resource.loading ? <Loading /> : !matrices.length ? <Empty icon={Layers} title={resource.data?.length ? '没有匹配的矩阵批次' : '还没有矩阵回归批次'} description={resource.data?.length ? '尝试其他搜索词。' : writable ? '在测试计划卡片上选择「矩阵回归」，一次发起多个浏览器目标。' : '等待有权限的成员从测试计划发起；只读成员可在这里查看批次进度与报告。'} action={writable && !resource.data?.length ? <a className="button secondary" href="#/plans">前往测试计划<ArrowUpRight size={15} /></a> : null} /> : <MatrixTable matrices={matrices} />}<div className="table-footer">共 {matrices.length} 个矩阵批次</div></section></>;
}
function MatrixTable({ matrices }) {
  return <div className="table-scroll"><table><thead><tr><th>矩阵批次</th><th>状态</th><th>目标进度</th><th>用例结果</th><th>耗时</th><th>创建时间</th><th className="right">报告</th></tr></thead><tbody>{matrices.map(matrix => <tr key={matrix.id}><td><a className="table-name" href={`#/matrices/${matrix.id}`}>{matrix.name || '未命名批次'}</a><span className="cell-secondary mono">{String(matrix.id).slice(0, 12)}</span></td><td><Badge status={matrix.status} /></td><td className="muted nowrap">{matrix.summary?.completedVariants ?? 0} / {matrix.summary?.totalVariants ?? matrix.variants?.length ?? 0} 完成</td><td>{matrix.summary?.total ? <div className="result-count"><span className="pass-text">{matrix.summary.passed || 0} 通过</span><span className={(matrix.summary.failed || 0) > 0 ? 'fail-text' : 'muted'}>{matrix.summary.failed || 0} 失败</span></div> : <span className="muted">{isMatrixActive(matrix.status) ? '等待结果' : '暂无结果'}</span>}</td><td className="muted nowrap">{duration(matrix.summary?.durationMs)}</td><td className="muted nowrap">{dateTime(matrix.createdAt)}</td><td className="right"><a className="row-report" href={`#/matrices/${matrix.id}`}>查看<ArrowUpRight size={14} /></a></td></tr>)}</tbody></table></div>;
}
export function MatrixDetail({ id, user }) {
  const [poll, setPoll] = useState(4000);
  const resource = useResource(`/matrices/${encodeURIComponent(id)}`, { poll });
  const [downloading, setDownloading] = useState('');
  const toast = useToast();
  const matrix = resource.data;
  const active = matrix ? isMatrixActive(matrix.status) : false;
  useEffect(() => { if (matrix) setPoll(isMatrixActive(matrix.status) ? 4000 : 0); }, [matrix?.status]);
  async function cancel() { await api(`/matrices/${encodeURIComponent(id)}/cancel`, { method: 'POST' }); toast('取消请求已提交，仅影响仍活跃的目标'); resource.reload(); }
  async function download(type) {
    setDownloading(type);
    try { await downloadFile(`${apiOrigin}/api/matrices/${encodeURIComponent(id)}/${type}`, `matrix-${id}.${type === 'gate-junit' ? 'gate.xml' : 'xml'}`); toast(type === 'gate-junit' ? '门禁报告已下载' : '聚合报告已下载'); } catch (err) { toast(err.message, 'error'); } finally { setDownloading(''); }
  }
  return <><a className="back-link" href="#/matrices"><ArrowLeft size={16} />返回矩阵回归</a><PageHeading eyebrow="MATRIX BATCH" title={matrix?.name || '矩阵批次详情'} description={`批次 ID：${id}`}><RefreshButton resource={resource} />{matrix && active && canWrite(user.role) && <ConfirmButton label="取消批次" confirmLabel="确认取消" icon={<Square size={14} />} onConfirm={cancel} variant="secondary" />}{matrix && <span className="junit-action"><Button variant="secondary" busy={downloading === 'junit'} disabled={!!downloading || active} onClick={() => download('junit')}><Download size={16} />聚合 JUnit</Button><Button variant="secondary" busy={downloading === 'gate-junit'} disabled={!!downloading || active} onClick={() => download('gate-junit')}><ShieldCheck size={16} />门禁 JUnit</Button>{active && <small className="muted">批次结束后可下载报告。</small>}</span>}</PageHeading><ErrorNotice message={resource.error} onRetry={resource.reload} />{resource.loading ? <Loading /> : matrix && <><section className={`run-status-panel run-${matrix.status.toLowerCase()}`}><div><Badge status={matrix.status} />{active && <span className="poll-label"><span />每 4 秒更新</span>}</div><h2>{matrixStatusMessage(matrix.status)}</h2><div className="run-time-meta"><span><Clock3 size={15} />创建：{dateTime(matrix.createdAt)}</span><span>发起人：{matrix.createdBy || '—'}</span><span>关联提交：{matrix.commitSha || '未填写'}</span></div></section><div className="report-metrics matrix-metrics"><div><span>目标完成</span><strong>{matrix.summary?.completedVariants ?? 0} / {matrix.summary?.totalVariants ?? matrix.variants?.length ?? 0}</strong></div><div><span>通过目标</span><strong className="pass-text">{matrix.summary?.passedVariants ?? 0}</strong></div><div><span>失败目标</span><strong className="fail-text">{matrix.summary?.failedVariants ?? 0}</strong></div><div><span>用例通过 / 失败</span><strong><span className="pass-text">{matrix.summary?.passed ?? 0}</span> / <span className={(matrix.summary?.failed ?? 0) > 0 ? 'fail-text' : 'muted'}>{matrix.summary?.failed ?? 0}</span></strong></div><div><span>用例总数</span><strong>{matrix.summary?.total ?? 0}</strong></div><div><span>批次耗时</span><strong>{duration(matrix.summary?.durationMs)}</strong></div></div><GateSummary gate={matrix.gate} /><section className="card execution-resource"><SectionTitle title="执行目标" description="每个目标是一次真实执行子任务，按资源能力独立调度；全部目标终态后批次才汇总判定。" />{!matrix.variants?.length ? <Empty icon={Layers} title="批次中没有目标" /> : <div className="table-scroll"><table><thead><tr><th>目标</th><th>状态</th><th>门禁</th><th>用例结果</th><th>实际资源指纹</th><th>说明</th><th className="right">原执行报告</th></tr></thead><tbody>{matrix.variants.map(variant => <tr key={variant.label}><td><span className="table-name">{variant.label}</span><span className="cell-secondary">{variant.capabilities?.browser || '—'}{variant.capabilities?.provider ? ` / ${variant.capabilities.provider}` : ''}</span></td><td><Badge status={variant.status} />{activeStatuses.includes(variant.status) && <span className="poll-label inline"><span />进行中</span>}</td><td><GateBadge gate={variant.gate} /></td><td>{variant.summary?.total ? <div className="result-count"><span className="pass-text">{variant.summary.passed || 0} 通过</span><span className={(variant.summary.failed || 0) > 0 ? 'fail-text' : 'muted'}>{variant.summary.failed || 0} 失败</span></div> : <span className="muted">{activeStatuses.includes(variant.status) ? '等待结果' : '暂无结果'}</span>}</td><td><VariantFingerprint value={variant.deviceFingerprint} /></td><td className="muted variant-message">{variant.message || statusLabels[variant.status] || '—'}</td><td className="right">{variant.runId ? <a className="row-report" href={`#/runs/${variant.runId}`}>#{String(variant.runId).slice(0, 8)}<ArrowUpRight size={14} /></a> : <span className="muted">未创建</span>}</td></tr>)}</tbody></table></div>}</section>{!canWrite(user.role) && <p className="muted readonly-note">当前为只读角色，可查看批次与报告，但不能创建或取消。</p>}</>}</>;
}
function VariantFingerprint({ value }) {
  const lines = matrixFingerprintLines(value);
  if (!lines.length) return <span className="muted fingerprint-empty"><Fingerprint size={13} />尚未获取</span>;
  return <dl className="fingerprint-lines">{lines.map(field => <div key={field.label}><dt>{field.label}</dt><dd>{field.value}</dd></div>)}</dl>;
}
export function MatrixLaunch({ plan, onClose }) {
  const [selected, setSelected] = useState(['chromium', 'firefox']);
  const [name, setName] = useState(() => defaultMatrixName(plan.name));
  const [commitSha, setCommitSha] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const toast = useToast();
  const toggle = (browser) => setSelected(list => list.includes(browser) ? list.filter(item => item !== browser) : [...list, browser]);
  async function submit(event) {
    event.preventDefault();
    let body;
    try {
      body = buildMatrixPayload({
        planId: plan.id,
        name,
        commitSha,
        variants: selected.map(browser => ({ label: matrixBrowsers.find(entry => entry.id === browser).label, browser })),
      });
    } catch (err) { setError(err.message); return; }
    setBusy(true); setError('');
    try { const result = await api('/matrices', { method: 'POST', body }); toast('矩阵批次已提交，等待真实资源调度'); onClose(); window.location.hash = `/matrices/${result.id}`; } catch (err) { setError(err.status === 403 ? '当前角色无权创建矩阵批次。' : err.message); } finally { setBusy(false); }
  }
  return <Modal title="发起矩阵回归" description={`基于 Web 计划「${plan.name}」一次提交多个浏览器目标。`} onClose={onClose} busy={busy}><form onSubmit={submit}><div className="modal-body"><fieldset className="browser-field"><legend>目标浏览器<span className="required"> *</span></legend><div className="browser-checks">{matrixBrowsers.map(({ id, label }) => <label key={id} className={`browser-check ${selected.includes(id) ? 'on' : ''}`}><input type="checkbox" checked={selected.includes(id)} onChange={() => toggle(id)} disabled={busy} /><span>{label}</span></label>)}</div><small>至少选择两种，平台按各浏览器真实资源能力分别调度。</small></fieldset><Field label="本次批次名称" required><input required maxLength={150} value={name} onChange={e => setName(e.target.value)} /></Field><Field label="关联 Commit SHA" hint="可选，用于追踪本次批次对应的代码版本。"><input value={commitSha} maxLength={128} onChange={e => setCommitSha(e.target.value)} placeholder="例如：完整的 Git 提交 SHA" /></Field><div className="launch-summary"><span>用例数量<strong>{plan.caseIds?.length || 0}</strong></span><span>继承资源来源<strong>{plan.capabilities?.provider || '按原计划'}</strong></span><span>继承资源标签<strong>{plan.capabilities?.tags?.length ? plan.capabilities.tags.join(', ') : '无'}</strong></span><span>排队超时<strong>{plan.queueTimeoutSeconds} 秒</strong></span><span>执行超时<strong>{plan.executionTimeoutSeconds} 秒</strong></span></div><div className="info-strip"><Play size={16} /><span>目标继承计划的资源来源、标签与超时；提交后按各浏览器真实资源能力排队调度，每个目标的结果可在执行记录中查看原始报告。</span></div><ErrorNotice compact message={selected.length < 2 ? '请至少选择两种浏览器。' : error} /></div><div className="modal-footer"><Button variant="secondary" disabled={busy} onClick={onClose}>取消</Button><Button type="submit" disabled={selected.length < 2} busy={busy}><Play size={16} />确认提交矩阵</Button></div></form></Modal>;
}
