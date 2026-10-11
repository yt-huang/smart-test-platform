import { useState } from 'react';
import { CheckCircle2, Copy, KeyRound, Plus, ShieldCheck, TerminalSquare, Trash2 } from 'lucide-react';
import { api, apiOrigin, useResource } from '../api.js';
import { Badge, Button, ConfirmButton, CopyButton, Empty, ErrorNotice, Field, Loading, Modal, PageHeading, RefreshButton, SectionTitle, useToast } from '../components.jsx';
import { dateTime } from '../utils.js';

export default function Agents({ user }) {
  const agents = useResource('/agents', { poll: 10000 });
  const keys = useResource('/agent-keys');
  const [create, setCreate] = useState(false);
  const [oneTime, setOneTime] = useState(null);
  const admin = user.role === 'ADMIN';
  const toast = useToast();
  async function revoke(key) { await api(`/agent-keys/${key.id}`, { method: 'DELETE' }); toast('Agent 密钥已撤销，关联连接已关闭'); keys.reload(); agents.reload(); }
  return <><PageHeading eyebrow="AGENT CONTROL" title="Agent 管理" description="通过出站连接接入执行环境，以密钥绑定真实 Agent 身份。"><RefreshButton resource={agents} />{admin && <Button onClick={() => setCreate(true)}><Plus size={17} />创建接入密钥</Button>}</PageHeading><ErrorNotice message={agents.error} onRetry={agents.reload} /><section className="agent-connect-banner"><span className="connect-icon"><TerminalSquare size={27} /></span><div><h2>让执行资源安全地连接平台</h2><p>Agent 主动建立 WebSocket 连接，接收结构化任务、上传真实执行证据。无需开放执行环境的入站端口。</p></div><span className="outbound-chip"><ShieldCheck size={15} />OUTBOUND CONNECTION</span></section><section className="card"><SectionTitle title="已注册 Agent" description="在线状态与资源数量来自真实注册和心跳" />{agents.loading ? <Loading /> : !agents.data?.length ? <Empty icon={TerminalSquare} title="暂无已注册 Agent" description={admin ? '创建密钥后，在执行环境运行 Agent，即可注册浏览器与设备资源。' : '请联系管理员创建密钥并接入执行环境。'} /> : <div className="table-scroll"><table><thead><tr><th>Agent</th><th>连接状态</th><th>资源数量</th><th>主机指纹</th><th>最近心跳</th></tr></thead><tbody>{agents.data.map(agent => <tr key={agent.id}><td><strong>{agent.name || agent.id}</strong><small className="cell-secondary mono">{agent.id}</small></td><td><Badge status={agent.status} /></td><td>{agent.targetIds?.length ?? agent.targets?.length ?? 0}</td><td className="mono fingerprint">{agent.hostFingerprint || '未上报'}</td><td className="nowrap muted">{dateTime(agent.lastSeen)}</td></tr>)}</tbody></table></div>}</section><section className="card"><SectionTitle title="Agent 接入密钥" description="密钥明文仅在创建时显示一次，请在可信执行环境中妥善保存"><RefreshButton resource={keys} /></SectionTitle><ErrorNotice message={keys.error} onRetry={keys.reload} />{keys.loading ? <Loading /> : !keys.data?.length ? <Empty icon={KeyRound} title="暂无接入密钥" description={admin ? '为执行环境创建独立密钥，便于绑定与撤销。' : '密钥由管理员创建与管理。'} action={admin && <Button variant="secondary" onClick={() => setCreate(true)}><Plus size={16} />创建密钥</Button>} /> : <div className="table-scroll"><table><thead><tr><th>密钥名称</th><th>状态</th><th>绑定 Agent</th><th>创建时间</th>{admin && <th className="right">操作</th>}</tr></thead><tbody>{keys.data.map(key => { const revoked = key.revoked || key.revokedAt || key.status === 'REVOKED'; return <tr key={key.id}><td><div className="key-name"><KeyRound size={17} /><strong>{key.name}</strong></div><span className="cell-secondary mono">{key.id}</span></td><td><Badge status={revoked ? 'REVOKED' : 'ACTIVE'} /></td><td className="mono">{key.agentId || key.boundAgentId || '尚未绑定'}</td><td className="muted nowrap">{dateTime(key.createdAt)}</td>{admin && <td className="right">{revoked ? <span className="muted">已撤销</span> : <ConfirmButton label="撤销密钥" confirmLabel="确认撤销" icon={<Trash2 size={14} />} onConfirm={() => revoke(key)} />}</td>}</tr>; })}</tbody></table></div>}</section><section className="connection-steps"><SectionTitle title="接入流程" description="密钥不会写入浏览器构建配置或提交到代码仓库" /><div><p><span>1</span>管理员创建 Agent 密钥，复制一次性凭据。</p><p><span>2</span>在执行环境安装 Agent 依赖与真实浏览器，配置平台地址和密钥。</p><p><span>3</span>启动 Agent。注册与心跳成功后，可在资源池查看真实可用能力。</p></div></section>{create && <CreateKey onClose={() => setCreate(false)} onCreated={key => { setCreate(false); setOneTime(key); keys.reload(); }} />}{oneTime && <OneTimeKey value={oneTime} onClose={() => setOneTime(null)} />}</>;
}
function CreateKey({ onClose, onCreated }) {
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function save(event) {
    event.preventDefault(); setBusy(true); setError('');
    try { const result = await api('/agent-keys', { method: 'POST', body: { name: name.trim() } }); onCreated(result); } catch (err) { setError(err.message); } finally { setBusy(false); }
  }
  return <Modal title="创建 Agent 接入密钥" description="每个执行环境使用独立密钥，首次注册后绑定 Agent。" onClose={onClose} busy={busy}><form onSubmit={save}><div className="modal-body"><Field label="密钥名称" required><input required maxLength={100} autoFocus value={name} onChange={e => setName(e.target.value)} placeholder="例如：研发本地 Chromium 执行端" /></Field><div className="warning-strip">创建后请立即复制。离开凭据窗口后，平台不会再次展示明文密钥。</div><ErrorNotice compact message={error} /></div><div className="modal-footer"><Button variant="secondary" disabled={busy} onClick={onClose}>取消</Button><Button type="submit" busy={busy}><KeyRound size={16} />创建密钥</Button></div></form></Modal>;
}
function OneTimeKey({ value, onClose }) {
  const [shell, setShell] = useState('bash');
  const [saved, setSaved] = useState(false);
  const origin = apiOrigin || window.location.origin;
  const setup = 'git clone https://github.com/yt-huang/smart-test-platform.git\ncd smart-test-platform/agent\nnpm ci\nnpx playwright install chromium';
  const command = `${setup}\n${shell === 'bash' ? `export PLATFORM_URL='${origin}'\nexport AGENT_KEY='${value.key}'` : `$env:PLATFORM_URL = '${origin}'\n$env:AGENT_KEY = '${value.key}'`}\nnpm start`;
  return <Modal wide title="接入密钥已创建" description={value.name} onClose={onClose} busy={!saved}><div className="modal-body"><div className="one-time-warning"><ShieldCheck size={22} /><div><strong>此密钥明文仅展示一次</strong><p>请立即复制到安全位置。撤销后，关联 Agent 连接将立即关闭。</p></div></div><div className="secret-box"><code>{value.key}</code><CopyButton value={value.key} label="复制密钥" /></div><div className="steps-heading"><div><h3>在执行环境启动 Agent</h3><p>安装真实浏览器后再连接平台；Linux 可能需要系统浏览器依赖。</p></div><select aria-label="命令行类型" value={shell} onChange={e => setShell(e.target.value)}><option value="bash">Bash</option><option value="powershell">PowerShell</option></select></div><div className="command-block"><pre>{command}</pre><CopyButton value={command} label="复制命令" /></div><label className="checkbox-field"><input type="checkbox" checked={saved} onChange={e => setSaved(e.target.checked)} /><span>我已安全保存密钥，知道关闭窗口后无法再次查看。</span></label></div><div className="modal-footer"><Button disabled={!saved} onClick={onClose}><CheckCircle2 size={16} />完成</Button></div></Modal>;
}

