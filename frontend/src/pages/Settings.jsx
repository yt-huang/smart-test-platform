import { useState } from 'react';
import { Bot, Cloud, Globe2, History, Info, LockKeyhole, Plus, Settings, ShieldCheck, Smartphone, UserRound, Users } from 'lucide-react';
import { api, useResource } from '../api.js';
import { Badge, Button, Empty, ErrorNotice, Field, Loading, Modal, PageHeading, RefreshButton, SectionTitle, useToast } from '../components.jsx';
import { dateTime, roleLabels } from '../utils.js';

export default function SettingsPage({ user }) {
  const settings = useResource('/settings');
  const [tab, setTab] = useState('general');
  const admin = user.role === 'ADMIN';
  return <><PageHeading eyebrow="WORKSPACE SETTINGS" title="系统设置" description="了解工作空间配置、集成能力与操作审计。"><RefreshButton resource={settings} /></PageHeading><div className="settings-tabs" role="tablist" aria-label="设置页面">{[['general', '配置与集成', Settings], ...(admin ? [['users', '成员管理', Users]] : []), ['audit', '操作审计', History]].map(([id, label, Icon]) => <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)} className={tab === id ? 'active' : ''}><Icon size={17} />{label}</button>)}</div>{tab === 'general' && <><ErrorNotice message={settings.error} onRetry={settings.reload} />{settings.loading ? <Loading /> : settings.data && <GeneralSettings value={settings.data} user={user} />}</>}{tab === 'users' && admin && <UserManagement />}{tab === 'audit' && <AuditLog />}</>;
}
function GeneralSettings({ value, user }) {
  const integrations = value.integrations || {};
  const capabilities = value.capabilities || {};
  const integrationList = [
    { key: 'agent', title: '执行 Agent', icon: Globe2, description: '出站 WebSocket 接入，提供真实浏览器与设备资源。', to: '/agents' },
    { key: 'mobile', title: '移动端执行', icon: Smartphone, description: '需真实设备与对应 Appium / Maestro 执行能力。' },
    { key: 'ai', title: 'AI 用例草稿', icon: Bot, description: '需配置真实模型连接；所有草稿仍需要人工审批。' },
    { key: 'cloud', title: '云资源', icon: Cloud, description: '需配置真实云设备或浏览器服务提供商。' },
  ];
  return <><section className="card"><SectionTitle title="工作空间配置" description="配置由平台部署环境提供，页面仅展示当前实际状态" /><dl className="settings-facts"><div><dt>工作空间</dt><dd>{value.workspace || 'default'}</dd></div><div><dt>空间模式</dt><dd>{value.singleWorkspace ? '单工作空间' : '以部署配置为准'}</dd></div><div><dt>资源租约</dt><dd>{value.leaseSeconds != null ? `${value.leaseSeconds} 秒` : '未上报'}</dd></div><div><dt>登录有效期</dt><dd>{value.sessionHours != null ? `${value.sessionHours} 小时` : '未上报'}</dd></div><div><dt>证据存储</dt><dd>{value.evidenceStorage === 'local' ? '平台本地持久化' : value.evidenceStorage || '未上报'}</dd></div><div><dt>传输要求</dt><dd>{value.transport || '未上报'}</dd></div></dl></section><section className="integrations-section"><SectionTitle title="集成与执行能力" description="尚未接入的能力会明确显示，不生成模拟执行结果" /><div className="integration-grid">{integrationList.map(({ key, title, icon: Icon, description, to }) => { const connected = integrations[key] === 'connected'; return <div className="card integration-card" key={key}><div><span className={`integration-icon ${connected ? 'connected' : ''}`}><Icon size={25} /></span><Badge status={connected ? 'ONLINE' : 'OFFLINE'}>{connected ? '已连接' : '未接入'}</Badge></div><h3>{title}</h3><p>{description}</p>{to && <a className="jump-link" href={`#${to}`}>管理接入</a>}</div>; })}</div></section><section className="card"><SectionTitle title="能力开关" description="当前部署实际提供的能力" /><div className="capability-list">{[['web', 'Web 结构化测试'], ['mobile', '移动端结构化测试'], ['remoteStreaming', '资源实时画面'], ['aiDrafts', 'AI 草稿生成']].map(([key, label]) => <div key={key}><span>{label}</span><span className={`availability ${capabilities[key] ? 'available' : ''}`}>{capabilities[key] ? '已启用' : '未启用'}</span></div>)}</div></section><section className="settings-security"><ShieldCheck size={24} /><div><h3>当前账号权限</h3><p>{user.displayName || user.username} · {roleLabels[user.role]}。{user.role === 'ADMIN' ? '你可以管理成员、接入密钥和资源可信标签。' : user.role === 'VIEWER' ? '你可以查看用例、计划、执行报告和资源状态。' : '你可以维护用例、审批并发起执行；系统管理由管理员负责。'}</p></div></section></>;
}
function UserManagement() {
  const resource = useResource('/users');
  const [create, setCreate] = useState(false);
  return <><section className="card"><SectionTitle title="工作空间成员" description="管理员维护成员账号，角色约束前端操作与服务端授权"><Button onClick={() => setCreate(true)}><Plus size={16} />添加成员</Button></SectionTitle><ErrorNotice message={resource.error} onRetry={resource.reload} />{resource.loading ? <Loading /> : !resource.data?.length ? <Empty icon={Users} title="暂无成员数据" /> : <div className="table-scroll"><table><thead><tr><th>成员</th><th>用户名</th><th>角色</th><th>创建时间</th></tr></thead><tbody>{resource.data.map(item => <tr key={item.id}><td><span className="member-name"><span className="member-avatar">{(item.displayName || item.username).slice(0, 1).toUpperCase()}</span><strong>{item.displayName || item.username}</strong></span></td><td className="mono">{item.username}</td><td><span className={`role-pill ${item.role === 'ADMIN' ? 'admin' : ''}`}>{roleLabels[item.role] || item.role}</span></td><td className="muted">{dateTime(item.createdAt)}</td></tr>)}</tbody></table></div>}</section><div className="role-guide"><h3>角色权限说明</h3><p><strong>管理员：</strong>完整管理权限。<strong>测试工程师 / 开发者：</strong>用例、计划与执行写入权限。<strong>只读成员：</strong>浏览数据与报告。</p></div>{create && <CreateUser onClose={() => setCreate(false)} onCreated={() => { setCreate(false); resource.reload(); }} />}</>;
}
function CreateUser({ onClose, onCreated }) {
  const [form, setForm] = useState({ username: '', password: '', displayName: '', role: 'TESTER' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const toast = useToast();
  const update = (key, value) => setForm(f => ({ ...f, [key]: value }));
  async function save(event) {
    event.preventDefault();
    if (new TextEncoder().encode(form.password).length > 72) { setError('密码不能超过 72 个 UTF-8 字节，请缩短后重试。'); return; }
    setBusy(true); setError('');
    try { await api('/users', { method: 'POST', body: { ...form, username: form.username.trim(), displayName: form.displayName.trim() } }); toast('成员账号已创建'); onCreated(); } catch (err) { setError(err.message); } finally { setBusy(false); }
  }
  return <Modal title="添加工作空间成员" description="为成员配置账号、初始密码和角色权限。" onClose={onClose} busy={busy}><form onSubmit={save}><div className="modal-body"><div className="form-grid"><Field label="用户名" required hint="用于登录，建议使用字母、数字与下划线。"><input required pattern="[a-zA-Z0-9_.-]{3,50}" minLength={3} maxLength={50} autoComplete="off" value={form.username} onChange={e => update('username', e.target.value)} placeholder="例如：tester_01" /></Field><Field label="显示名称" required><input required maxLength={100} value={form.displayName} onChange={e => update('displayName', e.target.value)} placeholder="成员姓名或昵称" /></Field><div className="full-width"><Field label="初始密码" required hint="至少 12 位，由管理员在安全渠道交付给成员。"><input required type="password" autoComplete="new-password" minLength={12} maxLength={128} value={form.password} onChange={e => update('password', e.target.value)} placeholder="设置安全的初始密码" /></Field></div><div className="full-width"><Field label="成员角色"><select value={form.role} onChange={e => update('role', e.target.value)}>{Object.entries(roleLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></Field></div></div><ErrorNotice compact message={error} /></div><div className="modal-footer"><Button variant="secondary" disabled={busy} onClick={onClose}>取消</Button><Button type="submit" busy={busy}><UserRound size={16} />创建成员</Button></div></form></Modal>;
}
function AuditLog() {
  const resource = useResource('/audit');
  return <section className="card"><SectionTitle title="操作审计" description="追溯用例、执行、资源与权限操作"><RefreshButton resource={resource} /></SectionTitle><ErrorNotice message={resource.error} onRetry={resource.reload} />{resource.loading ? <Loading /> : !resource.data?.length ? <Empty icon={History} title="暂无审计记录" description="平台中的实际写入操作会记录在此。" /> : <div className="table-scroll"><table><thead><tr><th>操作人</th><th>操作</th><th>对象</th><th>详情</th><th>时间</th></tr></thead><tbody>{resource.data.map(item => <tr key={item.id}><td>{item.actor}</td><td><span className="audit-action">{item.action}</span></td><td className="mono audit-target">{item.target || '—'}</td><td className="audit-detail">{typeof item.detail === 'object' ? JSON.stringify(item.detail) : item.detail || '—'}</td><td className="nowrap muted">{dateTime(item.createdAt)}</td></tr>)}</tbody></table></div>}</section>;
}
