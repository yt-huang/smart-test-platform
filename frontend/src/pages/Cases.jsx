import { useState } from 'react';
import { CheckCircle2, ChevronDown, FileCheck2, History, Pencil, Plus, Search, ShieldCheck, Trash2 } from 'lucide-react';
import { api, useResource } from '../api.js';
import { Badge, Button, ConfirmButton, Empty, ErrorNotice, Field, Loading, Modal, PageHeading, RefreshButton, useToast } from '../components.jsx';
import { canWrite, caseApprovalBody, dateTime, platformLabels, splitTags, validateSteps } from '../utils.js';

const actions = { goto: '打开页面', click: '点击元素', fill: '输入文本', expectText: '断言文本', expectVisible: '断言可见', screenshot: '截图' };
const blankCase = () => ({ name: '', description: '', platform: 'web', framework: 'playwright', suite: 'smoke', priority: 'P1', tags: [], sensitive: false, steps: [{ action: 'goto', target: '', value: '' }] });

export default function Cases({ user }) {
  const resource = useResource('/cases');
  const [search, setSearch] = useState('');
  const [platform, setPlatform] = useState('');
  const [status, setStatus] = useState('');
  const [editor, setEditor] = useState(null);
  const [history, setHistory] = useState(null);
  const [review, setReview] = useState(null);
  const toast = useToast();
  const writable = canWrite(user.role);
  const cases = (resource.data || []).filter(c => `${c.name} ${c.description || ''} ${(c.tags || []).join(' ')}`.toLowerCase().includes(search.toLowerCase()) && (!platform || c.platform === platform) && (!status || c.status === status));
  async function remove(item) { await api(`/cases/${item.id}`, { method: 'DELETE' }); toast('用例已删除'); resource.reload(); }
  return <><PageHeading eyebrow="TEST CASES" title="用例库" description="定义测试意图，审核结构化步骤，让每次执行有据可依。"><RefreshButton resource={resource} />{writable && <Button onClick={() => setEditor(blankCase())}><Plus size={17} />新建用例</Button>}</PageHeading><div className="info-strip"><ShieldCheck size={17} /><span>用例编辑后进入待审批状态。人工审核通过后，才能加入测试执行。</span></div><ErrorNotice message={resource.error} onRetry={resource.reload} /><section className="card"><div className="table-toolbar"><div className="search-field"><Search size={17} /><input aria-label="搜索用例" value={search} onChange={e => setSearch(e.target.value)} placeholder="搜索用例名称、描述或标签" /></div><div className="filter-group"><select aria-label="筛选平台" value={platform} onChange={e => setPlatform(e.target.value)}><option value="">全部平台</option>{Object.entries(platformLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select><select aria-label="筛选审批状态" value={status} onChange={e => setStatus(e.target.value)}><option value="">全部状态</option><option value="DRAFT">待审批</option><option value="APPROVED">已审批</option></select></div></div>{resource.loading ? <Loading /> : !cases.length ? <Empty icon={FileCheck2} title={resource.data?.length ? '没有匹配的用例' : '建立你的第一个测试用例'} description={resource.data?.length ? '调整搜索条件或筛选项后重试。' : '从页面地址、操作步骤和预期结果开始。新用例需要人工审批。'} action={writable && !resource.data?.length && <Button variant="secondary" onClick={() => setEditor(blankCase())}><Plus size={16} />新建用例</Button>} /> : <div className="table-scroll"><table><thead><tr><th>用例名称</th><th>平台 / 套件</th><th>优先级</th><th>审批状态</th><th>更新时间</th><th className="right">操作</th></tr></thead><tbody>{cases.map(item => <tr key={item.id}><td><button className="table-name" onClick={() => writable ? setEditor(item) : setReview(item)}>{item.name}</button><div className="table-subline">{item.description || '暂无描述'}{item.sensitive && <span className="sensitive-tag">敏感</span>}</div>{item.tags?.length > 0 && <div className="tags">{item.tags.slice(0, 4).map(tag => <span key={tag}>{tag}</span>)}</div>}</td><td><span>{platformLabels[item.platform] || item.platform}</span><small className="cell-secondary">{item.framework} · {item.suite === 'smoke' ? '冒烟测试' : '回归测试'}</small></td><td><span className={`priority priority-${item.priority?.toLowerCase()}`}>{item.priority}</span></td><td><Badge status={item.status} /></td><td className="nowrap muted">{dateTime(item.updatedAt || item.createdAt)}</td><td><div className="row-actions">{writable && item.status === 'DRAFT' && <Button variant="soft" onClick={() => setReview(item)}><CheckCircle2 size={15} />审批</Button>}{writable && <Button variant="ghost" onClick={() => setEditor(item)}><Pencil size={14} />编辑</Button>}<Button variant="ghost" onClick={() => setHistory(item)}><History size={14} />历史</Button>{writable && <ConfirmButton label="删除" icon={<Trash2 size={14} />} onConfirm={() => remove(item)} />}</div></td></tr>)}</tbody></table></div>}<div className="table-footer">共 {cases.length} 个用例{!writable && <span>当前角色为只读</span>}</div></section>{editor && <CaseEditor value={editor} onClose={() => setEditor(null)} onSaved={() => { setEditor(null); resource.reload(); }} />}{history && <CaseHistory item={history} onClose={() => setHistory(null)} />}{review && <CaseReview item={review} writable={writable} onClose={() => setReview(null)} onApproved={() => { setReview(null); resource.reload(); }} />}</>;
}
function CaseEditor({ value, onClose, onSaved }) {
  const [form, setForm] = useState({ ...blankCase(), ...structuredClone(value) });
  const [tags, setTags] = useState((value.tags || []).join(', '));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const toast = useToast();
  const update = (key, val) => setForm(f => ({ ...f, [key]: val }));
  const stepUpdate = (index, key, val) => setForm(f => ({ ...f, steps: f.steps.map((s, i) => i === index ? { ...s, [key]: val } : s) }));
  async function save(event) {
    event.preventDefault();
    const validation = validateSteps(form.steps);
    if (validation) { setError(validation); return; }
    setBusy(true); setError('');
    try { await api(form.id ? `/cases/${form.id}` : '/cases', { method: form.id ? 'PUT' : 'POST', body: { ...form, name: form.name.trim(), tags: splitTags(tags), status: 'DRAFT' } }); toast('用例已保存，等待人工审批'); onSaved(); }
    catch (err) { setError(err.message); } finally { setBusy(false); }
  }
  return <Modal wide title={form.id ? '编辑测试用例' : '新建测试用例'} description="将操作和断言写成结构化步骤，保存后由人工审核。" onClose={onClose} busy={busy}><form onSubmit={save}><div className="modal-body"><div className="form-grid"><Field label="用例名称" required><input required maxLength={150} value={form.name} onChange={e => update('name', e.target.value)} placeholder="例如：登录页正确显示欢迎标题" /></Field><Field label="优先级"><select value={form.priority} onChange={e => update('priority', e.target.value)}><option value="P0">P0 · 核心链路</option><option value="P1">P1 · 常规功能</option><option value="P2">P2 · 次要功能</option></select></Field><Field label="测试平台"><select value={form.platform} onChange={e => { update('platform', e.target.value); update('framework', e.target.value === 'web' ? 'playwright' : 'appium'); }}><option value="web">Web 浏览器</option><option value="android">Android</option><option value="ios">iOS</option></select></Field><Field label="执行框架"><select value={form.framework} onChange={e => update('framework', e.target.value)}>{form.platform === 'web' ? <option value="playwright">Playwright</option> : <><option value="appium">Appium</option><option value="maestro">Maestro</option></>}</select></Field><Field label="测试套件"><select value={form.suite} onChange={e => update('suite', e.target.value)}><option value="smoke">冒烟测试</option><option value="regression">回归测试</option></select></Field><Field label="标签" hint="多个标签用逗号分隔。"><input value={tags} onChange={e => setTags(e.target.value)} placeholder="login, smoke" /></Field><div className="full-width"><Field label="用例描述"><textarea rows={2} maxLength={2000} value={form.description} onChange={e => update('description', e.target.value)} placeholder="说明验证目标与前置条件" /></Field></div></div><label className="checkbox-field"><input type="checkbox" checked={form.sensitive} onChange={e => update('sensitive', e.target.checked)} /><span><strong>包含敏感数据</strong><small>标记敏感用例，平台将据此约束执行资源路由。</small></span></label>{form.platform !== 'web' && <div className="warning-strip">当前执行端仅支持 Web 结构化步骤。移动端用例可保存，需接入支持对应能力的真实 Agent 后执行。</div>}<div className="steps-heading"><div><h3>测试步骤</h3><p>CSS 选择器用于定位元素；打开页面需填写完整 URL。</p></div><Button variant="secondary" onClick={() => update('steps', [...form.steps, { action: 'click', target: '', value: '' }])}><Plus size={15} />添加步骤</Button></div><div className="step-editor-list">{form.steps.map((step, i) => <div className="step-editor" key={i}><span className="step-number">{i + 1}</span><select aria-label={`步骤 ${i + 1} 操作`} value={step.action} onChange={e => stepUpdate(i, 'action', e.target.value)}>{Object.entries(actions).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select><input aria-label={`步骤 ${i + 1} 目标`} disabled={step.action === 'screenshot'} value={step.target || ''} onChange={e => stepUpdate(i, 'target', e.target.value)} placeholder={step.action === 'goto' ? 'https://example.com' : step.action === 'screenshot' ? '截取当前页面' : 'CSS 选择器，例如 h1'} />{['fill', 'expectText'].includes(step.action) && <input aria-label={`步骤 ${i + 1} 文本`} value={step.value || ''} onChange={e => stepUpdate(i, 'value', e.target.value)} placeholder="输入文本值" />}<button type="button" className="icon-button danger-text" aria-label={`删除步骤 ${i + 1}`} disabled={form.steps.length <= 1} onClick={() => update('steps', form.steps.filter((_, index) => index !== i))}><Trash2 size={17} /></button></div>)}</div><ErrorNotice compact message={error} /></div><div className="modal-footer"><span>保存后状态为「待审批」</span><Button variant="secondary" disabled={busy} onClick={onClose}>取消</Button><Button type="submit" busy={busy}>保存用例</Button></div></form></Modal>;
}
function CaseReview({ item, onClose, onApproved, writable }) {
  const [reviewed, setReviewed] = useState(item);
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [checked, setChecked] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [error, setError] = useState('');
  const toast = useToast();
  async function approve() {
    if (conflict || !checked) return;
    setBusy(true); setError('');
    try {
      await api(`/cases/${reviewed.id}/approve`, { method: 'POST', body: caseApprovalBody(reviewed) });
      toast('用例已审批，可加入测试计划'); onApproved();
    } catch (err) {
      setChecked(false);
      if (err.status === 409 || !Number.isSafeInteger(reviewed.revision) || reviewed.revision < 1) {
        setConflict(true);
        setError(err.status === 409 ? '用例已被其他成员修改，当前审核内容已过期。请刷新并重新检查最新步骤，再明确确认审批。' : err.message);
      } else setError(err.message);
    } finally { setBusy(false); }
  }
  async function refreshReview() {
    setRefreshing(true);
    setChecked(false);
    try {
      const latest = await api(`/cases/${reviewed.id}`);
      caseApprovalBody(latest);
      setReviewed(latest); setConflict(false); setError('');
      toast('已加载最新版本，请重新审核并确认');
    } catch (err) { setError(err.message); } finally { setRefreshing(false); }
  }
  const approvable = writable && reviewed.status === 'DRAFT';
  return <Modal title={approvable ? '人工审核用例' : '用例详情'} description={reviewed.name} onClose={onClose} busy={busy || refreshing}><div className="modal-body"><div className="review-meta"><Badge status={reviewed.status} /><span>{platformLabels[reviewed.platform]} · {reviewed.framework}</span><span>{reviewed.priority}</span><span>审核版本：{reviewed.revision ?? '需刷新'}</span>{reviewed.sensitive && <span className="sensitive-tag">敏感数据</span>}</div><p className="muted">{reviewed.description || '暂无描述'}</p><StepList steps={reviewed.steps} />{approvable && <label className="checkbox-field review-check"><input type="checkbox" checked={checked} disabled={busy || refreshing || conflict} onChange={e => setChecked(e.target.checked)} /><span>我已检查当前版本的操作步骤、断言和目标地址，确认此用例可交由 Agent 执行。</span></label>}<ErrorNotice compact message={error} /></div><div className="modal-footer"><Button variant="secondary" disabled={busy || refreshing} onClick={onClose}>关闭</Button>{conflict && <Button variant="secondary" busy={refreshing} disabled={busy} onClick={refreshReview}>刷新并重新审核</Button>}{approvable && <Button disabled={!checked || conflict || refreshing} busy={busy} onClick={approve}><ShieldCheck size={16} />确认审批</Button>}</div></Modal>;
}
export function StepList({ steps }) {
  return <ol className="review-steps">{(steps || []).map((step, i) => <li key={i}><span className="step-number">{i + 1}</span><div><strong>{actions[step.action] || step.action}</strong>{step.target && <code>{step.target}</code>}{step.value && <span className="step-value">{step.value}</span>}</div></li>)}</ol>;
}
function CaseHistory({ item, onClose }) {
  const resource = useResource(`/cases/${item.id}/history`);
  return <Modal title="用例修订历史" description={item.name} onClose={onClose}><div className="modal-body"><ErrorNotice message={resource.error} onRetry={resource.reload} />{resource.loading ? <Loading /> : !resource.data?.length ? <Empty icon={History} title="暂无修订记录" /> : <div className="history-list">{[...resource.data].reverse().map((revision, i) => <details key={revision.id || i}><summary><History size={16} /><strong>版本 {revision.revision ?? i + 1}</strong><span>{({ CREATE: '创建', UPDATE: '编辑', APPROVE: '审批' })[revision.action] || revision.action}</span><small>{revision.actor} · {dateTime(revision.createdAt)}</small><ChevronDown size={15} /></summary><StepList steps={revision.snapshot?.steps} /></details>)}</div>}</div><div className="modal-footer"><Button variant="secondary" onClick={onClose}>关闭</Button></div></Modal>;
}
