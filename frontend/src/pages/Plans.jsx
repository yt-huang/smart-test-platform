import { useState } from 'react';
import { ClipboardList, FileCheck2, Layers, Pencil, Play, Plus, Search, Trash2 } from 'lucide-react';
import { api, useResource } from '../api.js';
import { Button, ConfirmButton, Empty, ErrorNotice, Field, Loading, Modal, PageHeading, RefreshButton, useToast } from '../components.jsx';
import { MatrixLaunch } from './Matrices.jsx';
import { canWrite, dateTime, platformLabels, splitTags } from '../utils.js';

const newPlan = () => ({ name: '', description: '', caseIds: [], capabilities: { platform: 'web', browser: 'chromium', provider: 'local', tags: [] }, priority: 0, queueTimeoutSeconds: 600, executionTimeoutSeconds: 300 });
export default function Plans({ user }) {
  const resource = useResource('/plans');
  const caseResource = useResource('/cases');
  const [search, setSearch] = useState('');
  const [editor, setEditor] = useState(null);
  const [launch, setLaunch] = useState(null);
  const [matrix, setMatrix] = useState(null);
  const toast = useToast();
  const writable = canWrite(user.role);
  const plans = (resource.data || []).filter(p => `${p.name} ${p.description || ''}`.toLowerCase().includes(search.toLowerCase()));
  async function remove(plan) { await api(`/plans/${plan.id}`, { method: 'DELETE' }); toast('测试计划已删除'); resource.reload(); }
  return <><PageHeading eyebrow="TEST PLANS" title="测试计划" description="组合已审批用例，声明资源能力，将执行交给平台调度。"><RefreshButton resource={resource} />{writable && <Button onClick={() => setEditor(newPlan())}><Plus size={17} />创建计划</Button>}</PageHeading><ErrorNotice message={resource.error} onRetry={resource.reload} /><ErrorNotice message={caseResource.error} onRetry={caseResource.reload} /><section className="card"><div className="table-toolbar"><div className="search-field"><Search size={17} /><input aria-label="搜索计划" placeholder="搜索计划名称或描述" value={search} onChange={e => setSearch(e.target.value)} /></div><span className="muted toolbar-hint">执行前会再次核验用例审批状态</span></div>{resource.loading ? <Loading /> : !plans.length ? <Empty icon={ClipboardList} title={resource.data?.length ? '没有匹配的测试计划' : '将用例组织成可执行计划'} description={resource.data?.length ? '尝试其他搜索词。' : '选择已审批用例，匹配浏览器、资源来源和标签。'} action={writable && !resource.data?.length && <Button variant="secondary" onClick={() => setEditor(newPlan())}><Plus size={16} />创建计划</Button>} /> : <div className="plan-grid">{plans.map(plan => <div className="plan-card" key={plan.id}><div className="plan-card-heading"><div className="plan-icon"><ClipboardList size={23} /></div><span className="plan-platform">{platformLabels[plan.capabilities?.platform] || plan.capabilities?.platform || 'Web 浏览器'}</span></div><h3>{plan.name}</h3><p>{plan.description || '暂无计划描述'}</p><div className="plan-facts"><span><FileCheck2 size={15} />{plan.caseIds?.length || 0} 个用例</span><span>{plan.capabilities?.browser || '任意浏览器'}</span><span>{plan.capabilities?.provider || '任意来源'}</span></div>{plan.capabilities?.tags?.length > 0 && <div className="tags">{plan.capabilities.tags.map(tag => <span key={tag}>{tag}</span>)}</div>}<div className="plan-date">创建于 {dateTime(plan.createdAt)}</div><div className="plan-actions">{writable ? <><Button onClick={() => setLaunch(plan)} disabled={!plan.caseIds?.length || caseResource.loading || !!caseResource.error}><Play size={15} />发起执行</Button>{plan.capabilities?.platform === 'web' && <Button variant="ghost" onClick={() => setMatrix(plan)} disabled={!plan.caseIds?.length || caseResource.loading || !!caseResource.error}><Layers size={15} />矩阵回归</Button>}<Button variant="ghost" onClick={() => setEditor(plan)}><Pencil size={15} />编辑</Button><ConfirmButton icon={<Trash2 size={14} />} onConfirm={() => remove(plan)} /></> : <span className="muted">只读计划</span>}</div></div>)}</div>}<div className="table-footer">共 {plans.length} 个测试计划</div></section>{editor && <PlanEditor value={editor} cases={caseResource.data || []} casesLoading={caseResource.loading} casesError={caseResource.error} onClose={() => setEditor(null)} onSaved={() => { setEditor(null); resource.reload(); }} />}{launch && <LaunchPlan plan={launch} cases={caseResource.data || []} onClose={() => setLaunch(null)} />}{matrix && <MatrixLaunch plan={matrix} onClose={() => setMatrix(null)} />}</>;
}
function PlanEditor({ value, cases, casesLoading, casesError, onClose, onSaved }) {
  const [form, setForm] = useState({ ...newPlan(), ...structuredClone(value), capabilities: { ...newPlan().capabilities, ...value.capabilities } });
  const [tags, setTags] = useState((value.capabilities?.tags || []).join(', '));
  const [filter, setFilter] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const toast = useToast();
  const update = (key, val) => setForm(f => ({ ...f, [key]: val }));
  const capability = (key, val) => setForm(f => ({ ...f, capabilities: { ...f.capabilities, [key]: val } }));
  const approved = cases.filter(c => c.status === 'APPROVED' && c.platform === form.capabilities.platform);
  const visible = approved.filter(c => c.name.toLowerCase().includes(filter.toLowerCase()));
  const selectedInvalid = form.caseIds.filter(id => !approved.some(c => String(c.id) === String(id)));
  const selectedSensitive = approved.some(c => c.sensitive && form.caseIds.some(id => String(id) === String(c.id)));
  const toggle = (id) => update('caseIds', form.caseIds.some(x => String(x) === String(id)) ? form.caseIds.filter(x => String(x) !== String(id)) : [...form.caseIds, id]);
  async function save(event) {
    event.preventDefault();
    if (!form.caseIds.length) { setError('至少选择一个已审批用例。'); return; }
    if (selectedInvalid.length) { setError('计划包含未审批、已删除或平台不匹配的用例，请移除后重新选择。'); return; }
    if (selectedSensitive && form.capabilities.provider !== 'local') { setError('敏感用例仅能使用本地可信资源，请将资源来源设为 local。'); return; }
    setBusy(true); setError('');
    try { await api(form.id ? `/plans/${form.id}` : '/plans', { method: form.id ? 'PUT' : 'POST', body: { ...form, name: form.name.trim(), capabilities: { ...form.capabilities, tags: splitTags(tags) } } }); toast('测试计划已保存'); onSaved(); } catch (err) { setError(err.message); } finally { setBusy(false); }
  }
  return <Modal wide title={form.id ? '编辑测试计划' : '创建测试计划'} description="声明执行能力，平台会等待并分配匹配的真实资源。" onClose={onClose} busy={busy}><form onSubmit={save}><div className="modal-body"><div className="form-grid"><Field label="计划名称" required><input required maxLength={150} value={form.name} onChange={e => update('name', e.target.value)} placeholder="例如：发布前核心链路验证" /></Field><Field label="调度优先级" hint="数值越大，优先级越高。"><input type="number" min={0} max={100} required value={form.priority} onChange={e => update('priority', Number(e.target.value))} /></Field><div className="full-width"><Field label="计划描述"><textarea rows={2} value={form.description} maxLength={2000} onChange={e => update('description', e.target.value)} placeholder="说明本计划的验证目标" /></Field></div><Field label="目标平台"><select value={form.capabilities.platform} onChange={e => { capability('platform', e.target.value); update('caseIds', []); }}>{Object.entries(platformLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></Field><Field label="目标浏览器"><select disabled={form.capabilities.platform !== 'web'} value={form.capabilities.browser} onChange={e => capability('browser', e.target.value)}><option value="chromium">Chromium</option><option value="firefox">Firefox</option><option value="webkit">WebKit</option></select></Field><Field label="资源来源"><select value={form.capabilities.provider} onChange={e => capability('provider', e.target.value)}><option value="local">本地 · local</option><option value="cloud">云资源 · cloud</option></select></Field><Field label="资源标签" hint="所有标签必须与执行资源匹配。"><input value={tags} onChange={e => setTags(e.target.value)} placeholder="多个标签用逗号分隔" /></Field><Field label="排队超时（秒）"><input type="number" required min={5} max={86400} value={form.queueTimeoutSeconds} onChange={e => update('queueTimeoutSeconds', Number(e.target.value))} /></Field><Field label="执行超时（秒）"><input type="number" required min={5} max={86400} value={form.executionTimeoutSeconds} onChange={e => update('executionTimeoutSeconds', Number(e.target.value))} /></Field></div><div className="steps-heading"><div><h3>选择测试用例 <span className="count-pill">{form.caseIds.length}</span></h3><p>仅显示目标平台下的已审批用例。</p></div><div className="search-field compact-search"><Search size={15} /><input aria-label="搜索可选用例" value={filter} onChange={e => setFilter(e.target.value)} placeholder="搜索用例" /></div></div>{selectedInvalid.length > 0 && <div className="warning-strip">已选用例中有 {selectedInvalid.length} 个不再可用。<button type="button" onClick={() => update('caseIds', form.caseIds.filter(id => !selectedInvalid.includes(id)))}>移除不可用用例</button></div>}{casesError ? <ErrorNotice compact message={casesError} /> : casesLoading ? <Loading /> : !visible.length ? <Empty icon={FileCheck2} title="暂无可选的已审批用例" description="先去用例库创建并审批，或调整平台与搜索条件。" action={<a href="#/cases" className="jump-link" onClick={onClose}>前往用例库</a>} /> : <div className="case-picker">{visible.map(item => <label key={item.id} className={form.caseIds.some(id => String(id) === String(item.id)) ? 'selected' : ''}><input type="checkbox" checked={form.caseIds.some(id => String(id) === String(item.id))} onChange={() => toggle(item.id)} /><div><strong>{item.name}</strong><small>{item.description || item.framework}</small></div><span className={`priority priority-${item.priority.toLowerCase()}`}>{item.priority}</span>{item.sensitive && <span className="sensitive-tag">敏感</span>}</label>)}</div>}<ErrorNotice compact message={error} /></div><div className="modal-footer"><span>已选择 {form.caseIds.length} 个用例</span><Button variant="secondary" disabled={busy} onClick={onClose}>取消</Button><Button type="submit" disabled={casesLoading || !!casesError || !form.caseIds.length} busy={busy}>保存计划</Button></div></form></Modal>;
}
function LaunchPlan({ plan, cases, onClose }) {
  const [name, setName] = useState(plan.name);
  const [commitSha, setCommitSha] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const toast = useToast();
  const selected = plan.caseIds.map(id => cases.find(c => String(c.id) === String(id)));
  const invalid = selected.some(c => !c || c.status !== 'APPROVED');
  async function run(event) {
    event.preventDefault(); setBusy(true); setError('');
    try { const result = await api('/runs', { method: 'POST', body: { planId: plan.id, name: name.trim(), commitSha: commitSha.trim() } }); toast('执行任务已提交，等待匹配资源'); onClose(); window.location.hash = `/runs/${result.id}`; } catch (err) { setError(err.message); } finally { setBusy(false); }
  }
  return <Modal title="发起测试执行" description={`基于计划「${plan.name}」创建真实执行任务。`} onClose={onClose} busy={busy}><form onSubmit={run}><div className="modal-body"><Field label="本次执行名称" required><input required maxLength={150} value={name} onChange={e => setName(e.target.value)} /></Field><Field label="关联 Commit SHA" hint="可选，用于追踪本次执行对应的代码版本。"><input value={commitSha} maxLength={64} onChange={e => setCommitSha(e.target.value)} placeholder="例如：完整的 Git 提交 SHA" /></Field><div className="launch-summary"><span>用例数量<strong>{plan.caseIds.length}</strong></span><span>目标资源<strong>{plan.capabilities?.browser || plan.capabilities?.platform} / {plan.capabilities?.provider}</strong></span><span>排队超时<strong>{plan.queueTimeoutSeconds} 秒</strong></span></div>{invalid && <ErrorNotice compact message="部分用例已被编辑、删除或尚未审批，请先编辑计划并重新选择。" />}<div className="info-strip"><Play size={16} /><span>若没有匹配的空闲资源，任务将进入队列；超时后会显示真实失败原因。</span></div><ErrorNotice compact message={error} /></div><div className="modal-footer"><Button variant="secondary" disabled={busy} onClick={onClose}>取消</Button><Button type="submit" disabled={invalid} busy={busy}><Play size={16} />确认执行</Button></div></form></Modal>;
}

