import { useEffect, useState } from 'react';
import { Activity, ArrowRight, Boxes, Check, ChevronDown, ClipboardList, FileCheck2, FlaskConical, LayoutDashboard, LogOut, Menu, Monitor, Settings, ShieldCheck, TerminalSquare, X } from 'lucide-react';
import { api, getToken, setToken } from './api.js';
import { Breadcrumb, Button, ErrorNotice, Loading, ToastProvider, useToast } from './components.jsx';
import { roleLabels } from './utils.js';
import Dashboard from './pages/Dashboard.jsx';
import Cases from './pages/Cases.jsx';
import Plans from './pages/Plans.jsx';
import Runs, { RunDetail } from './pages/Runs.jsx';
import Resources from './pages/Resources.jsx';
import Agents from './pages/Agents.jsx';
import SettingsPage from './pages/Settings.jsx';

const navigation = [
  { id: 'dashboard', name: '工作概览', icon: LayoutDashboard },
  { id: 'cases', name: '用例库', icon: FileCheck2 },
  { id: 'plans', name: '测试计划', icon: ClipboardList },
  { id: 'runs', name: '执行记录', icon: Activity },
  { id: 'resources', name: '资源池', icon: Monitor },
  { id: 'agents', name: 'Agent 管理', icon: TerminalSquare },
  { id: 'settings', name: '系统设置', icon: Settings },
];
const readRoute = () => window.location.hash.replace(/^#\/?/, '').split('/').filter(Boolean);

export default function App() { return <ToastProvider><Application /></ToastProvider>; }

function Application() {
  const [user, setUser] = useState(null);
  const [checking, setChecking] = useState(!!getToken());
  const [sessionError, setSessionError] = useState('');
  const [route, setRoute] = useState(readRoute);
  const [drawer, setDrawer] = useState(false);
  const toast = useToast();
  useEffect(() => {
    const hash = () => { setRoute(readRoute()); setDrawer(false); window.scrollTo(0, 0); };
    const expired = () => { setUser(null); setChecking(false); setSessionError('登录已过期，请重新登录。'); };
    window.addEventListener('hashchange', hash);
    window.addEventListener('platform:session-expired', expired);
    return () => { window.removeEventListener('hashchange', hash); window.removeEventListener('platform:session-expired', expired); };
  }, []);
  const checkSession = async () => {
    setChecking(true); setSessionError('');
    try { setUser(await api('/auth/me')); } catch (err) { setSessionError(err.message); } finally { setChecking(false); }
  };
  useEffect(() => { if (getToken()) checkSession(); }, []);
  const logout = () => { setToken(null); setUser(null); setSessionError(''); toast('已退出登录'); };
  if (checking) return <div className="boot-screen"><Brand /><Loading label="正在验证登录状态…" /></div>;
  if (!user) return <Login onLogin={setUser} initialError={sessionError} onRetry={getToken() ? checkSession : null} />;
  const active = navigation.find(n => n.id === route[0]) || navigation[0];
  const View = { dashboard: Dashboard, cases: Cases, plans: Plans, runs: Runs, resources: Resources, agents: Agents, settings: SettingsPage }[active.id];
  return <div className="app-shell"><a href="#main" className="skip-link" onClick={e => { e.preventDefault(); document.getElementById('main')?.focus(); }}>跳转到内容</a>{drawer && <button className="drawer-overlay" aria-label="关闭导航" onClick={() => setDrawer(false)} />}<aside className={`sidebar ${drawer ? 'open' : ''}`}><div className="sidebar-brand"><Brand /><button className="mobile-only icon-button" onClick={() => setDrawer(false)} aria-label="关闭导航"><X size={20} /></button></div><div className="workspace-switch"><span className="workspace-icon"><Boxes size={19} /></span><div><strong>默认工作空间</strong><small>DEFAULT WORKSPACE</small></div><span className="workspace-lock" title="当前版本提供单工作空间"><ShieldCheck size={16} /></span></div><div className="nav-label">测试工作台</div><nav aria-label="主导航">{navigation.map(({ id, name, icon: Icon }) => <a key={id} href={`#/${id}`} className={`nav-item ${active.id === id ? 'active' : ''}`} aria-current={active.id === id ? 'page' : undefined}><Icon size={19} /><span>{name}</span>{active.id === id && <span className="nav-active-dot" />}</a>)}</nav><div className="sidebar-bottom"><div className="workspace-note"><ShieldCheck size={17} /><span>真实资源 · 可追溯执行</span></div><div className="sidebar-version"><span className="version-dot" />Smart Test Platform <span>v1.0</span></div></div></aside><div className="main-shell"><header className="topbar"><button className="mobile-only icon-button" aria-label="打开导航" onClick={() => setDrawer(true)}><Menu size={22} /></button><Breadcrumb items={[active.name, ...(active.id === 'runs' && route[1] ? ['执行详情'] : [])]} /><div className="user-area"><div className="user-avatar">{(user.displayName || user.username).slice(0, 1).toUpperCase()}</div><div className="user-details"><strong>{user.displayName || user.username}</strong><span>{roleLabels[user.role] || user.role}</span></div><button className="logout-button" onClick={logout} aria-label="退出登录" title="退出登录"><LogOut size={18} /></button></div></header><main id="main" className="content" tabIndex={-1}>{active.id === 'runs' && route[1] ? <RunDetail key={route[1]} id={route[1]} user={user} /> : <View key={active.id} user={user} />}</main><footer className="app-footer"><span>智测平台 · 每一次执行都有依据</span><span>Smart Test Platform</span></footer></div></div>;
}

function Brand({ light = true }) {
  return <a className={`brand ${light ? 'light' : ''}`} href="#/dashboard"><span className="brand-mark"><Check size={24} strokeWidth={3} /></span><span><strong>智测平台</strong><small>SMART TEST PLATFORM</small></span></a>;
}

function Login({ onLogin, initialError, onRetry }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(initialError);
  const [health, setHealth] = useState(null);
  useEffect(() => {
    let alive = true;
    api('/health').then(() => { if (alive) setHealth(true); }).catch(() => { if (alive) setHealth(false); });
    return () => { alive = false; };
  }, []);
  async function submit(event) {
    event.preventDefault(); setBusy(true); setError('');
    try { const result = await api('/auth/login', { method: 'POST', body: { username: username.trim(), password } }); setToken(result.token); onLogin(result.user); }
    catch (err) { setError(err.message); } finally { setBusy(false); }
  }
  return <div className="login-layout"><section className="login-story"><Brand /><div className="story-body"><span className="story-pill"><FlaskConical size={15} />为每一次发布建立信心</span><h1>从测试意图，<br />到可验证的结果。</h1><p>在一个工作台里管理用例、编排计划，连接真实执行资源，让团队看见每一步的依据。</p><div className="flow-illustration" aria-hidden="true"><div className="flow-line" /><div className="flow-node"><FileCheck2 size={23} /><span>定义用例</span></div><ChevronDown size={20} className="flow-chevron" /><div className="flow-node accent"><Boxes size={23} /><span>连接资源</span></div><ChevronDown size={20} className="flow-chevron" /><div className="flow-node"><ShieldCheck size={23} /><span>追溯结果</span></div></div><div className="story-points"><span><Check size={16} />人工审批测试用例</span><span><Check size={16} />出站 Agent 安全接入</span><span><Check size={16} />日志与证据统一归档</span></div></div><div className="story-footer">SMART TEST PLATFORM <span>TEST WITH CLARITY.</span></div></section><section className="login-form-panel"><div className="login-card"><div className="login-mobile-brand"><Brand light={false} /></div><p className="eyebrow">欢迎回到工作台</p><h2>登录智测平台</h2><p className="login-description">使用管理员为你创建的平台账号。</p><form onSubmit={submit}><label className="field"><span>用户名</span><input autoFocus autoComplete="username" required value={username} onChange={e => setUsername(e.target.value)} placeholder="输入用户名" disabled={busy} /></label><label className="field"><span>密码</span><input type="password" autoComplete="current-password" required value={password} onChange={e => setPassword(e.target.value)} placeholder="输入登录密码" disabled={busy} /></label><ErrorNotice compact message={error} onRetry={onRetry} /><Button type="submit" busy={busy} className="login-submit">登录工作台<ArrowRight size={18} /></Button></form><div className="login-support"><ShieldCheck size={16} /><span>首次登录请使用部署时配置的管理员凭据。</span></div><div className={`service-status ${health === false ? 'offline' : ''}`}><span />{health === null ? '正在检查服务…' : health ? '平台服务可连接' : '平台服务暂时无法连接'}</div></div><p className="login-copyright">智测平台 © {new Date().getFullYear()}</p></section></div>;
}

