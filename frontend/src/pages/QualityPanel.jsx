import { useState } from 'react';
import { ArrowUpRight, CheckCircle2, ShieldCheck } from 'lucide-react';
import { api, useResource } from '../api.js';
import { Badge, Button, Empty, ErrorNotice, Field, Loading, Modal, RefreshButton, SectionTitle, useToast } from '../components.jsx';
import { canReviewQuality } from '../utils.js';

export default function QualityPanel({ user }) {
  const resource = useResource('/quality', { poll: 10000 });
  const [review, setReview] = useState(null);
  const metrics = resource.data || [];
  const reviewable = canReviewQuality(user.role);
  const flagged = metrics.filter(metric => metric.quarantined).length;
  return <section className="card quality-panel"><SectionTitle title="用例稳定性复核" description="由真实执行结果统计；同一非空 Commit、相同实际环境下的结果变化进入稳定性评分，已隔离用例仍会真实执行。"><RefreshButton resource={resource} /></SectionTitle><ErrorNotice compact message={resource.error} onRetry={resource.reload} />{resource.loading ? <Loading /> : !metrics.length ? <Empty icon={ShieldCheck} title="暂无用例稳定性记录" description="完成真实执行后会累计通过与失败次数；同一提交的结果变化会产生复核标记。" /> : <><div className="quality-explainer"><ShieldCheck size={16} /><span>{flagged ? `${flagged} 个用例需要人工复核。` : '当前没有待复核标记。'}复核标记用于提醒检查，不阻止显式发起执行。评分采用同一非空 Commit 的结果变化 EWMA。新提交任务的门禁将已隔离失败记为警告放行，但取消、超时与资源故障仍会阻塞；人工解除隔离只影响之后提交的任务，不修改已归档的历史门禁。</span></div><div className="table-scroll"><table><thead><tr><th>测试用例</th><th>执行统计</th><th>变化评分</th><th>最近结果 / 提交</th><th>复核状态</th><th className="right">操作</th></tr></thead><tbody>{metrics.map(metric => <tr key={metric.caseId || metric.id}><td><strong>{metric.name || metric.caseId}</strong><small className="cell-secondary mono">{metric.caseId}</small></td><td><span>{metric.executions ?? 0} 次</span><div className="result-count"><span className="pass-text">{metric.passed ?? 0} 通过</span><span className={metric.failed ? 'fail-text' : 'muted'}>{metric.failed ?? 0} 失败</span></div></td><td><span className="quality-score">{Number(metric.ewmaScore || 0).toFixed(3)}</span></td><td><Badge status={metric.lastVerdict} /><small className="cell-secondary mono" title={metric.lastCommitSha}>{metric.lastCommitSha ? String(metric.lastCommitSha).slice(0, 12) : '未关联 Commit'}</small></td><td><Badge status={metric.quarantined ? 'DRAFT' : 'APPROVED'}>{metric.quarantined ? '需人工复核' : '无复核标记'}</Badge></td><td><div className="row-actions">{metric.lastRunId && <a className="row-report" href={`#/runs/${metric.lastRunId}`}>最近报告<ArrowUpRight size={14} /></a>}{metric.quarantined && reviewable && <Button variant="soft" onClick={() => setReview(metric)}><CheckCircle2 size={14} />完成复核</Button>}{metric.quarantined && !reviewable && <span className="quality-readonly">需管理员或测试工程师复核</span>}</div></td></tr>)}</tbody></table></div></>}{review && <QualityReview metric={review} onClose={() => setReview(null)} onReleased={() => { setReview(null); resource.reload(); }} />}</section>;
}
function QualityReview({ metric, onClose, onReleased }) {
  const [reason, setReason] = useState('');
  const [checked, setChecked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const toast = useToast();
  async function release(event) {
    event.preventDefault();
    if (!checked) return;
    if (reason.trim().length < 5) { setError('请填写至少 5 个字符的实际复核依据。'); return; }
    setBusy(true); setError('');
    try { await api(`/quality/${metric.caseId}/release`, { method: 'POST', body: { reason: reason.trim() } }); toast('复核已记录，标记已解除'); onReleased(); } catch (err) { setError(err.message); } finally { setBusy(false); }
  }
  return <Modal title="完成用例稳定性复核" description={metric.name || metric.caseId} onClose={onClose} busy={busy}><form onSubmit={release}><div className="modal-body"><div className="warning-strip">此用例在同一非空 Commit 下出现结果变化。请检查测试断言、执行环境与失败证据后记录实际复核依据。</div><div className="launch-summary"><span>变化评分<strong>{Number(metric.ewmaScore || 0).toFixed(3)}</strong></span><span>最近结果<strong>{metric.lastVerdict === 'PASSED' ? '通过' : metric.lastVerdict === 'FAILED' ? '失败' : metric.lastVerdict || '未上报'}</strong></span><span>关联提交<strong className="mono">{metric.lastCommitSha || '未关联'}</strong></span></div>{metric.lastRunId && <a className="jump-link quality-report-link" href={`#/runs/${metric.lastRunId}`} onClick={onClose}>查看最近执行报告<ArrowUpRight size={15} /></a>}<Field label="复核依据" required hint="说明已检查的问题与结论，提交后会写入操作审计。"><textarea required minLength={5} maxLength={1000} rows={4} value={reason} onChange={e => setReason(e.target.value)} placeholder="记录真实复核结论，例如已确认环境依赖并修正不稳定断言。" /></Field><label className="checkbox-field review-check"><input type="checkbox" checked={checked} onChange={e => setChecked(e.target.checked)} /><span>我已查看执行依据并完成人工复核，同意解除当前复核标记。</span></label><ErrorNotice compact message={error} /></div><div className="modal-footer"><Button variant="secondary" disabled={busy} onClick={onClose}>取消</Button><Button type="submit" disabled={!checked || reason.trim().length < 5} busy={busy}><ShieldCheck size={16} />记录并解除标记</Button></div></form></Modal>;
}
