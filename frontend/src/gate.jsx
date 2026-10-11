import { ShieldAlert, ShieldCheck, ShieldQuestion } from 'lucide-react';
import { Badge } from './components.jsx';
import { gateCounts, gateFreezeNote, gateStatusDescription, gateStatusLabels, isGatePresent } from './gateUtils.js';

const gateIcons = { PENDING: ShieldQuestion, PASSED: ShieldCheck, WARN: ShieldCheck, BLOCKED: ShieldAlert };

export function GateSummary({ gate }) {
  if (!isGatePresent(gate)) {
    return <div className="info-strip gate-empty"><ShieldQuestion size={16} /><span>此历史报告未提供门禁判定，仅展示原始执行结果，不推断为通过。</span></div>;
  }
  const counts = gateCounts(gate);
  const Icon = gateIcons[gate.status] || ShieldQuestion;
  const items = [
    ['计划用例', counts.total, ''],
    ['通过', counts.passed, counts.passed ? 'pass-text' : 'muted'],
    ['隔离失败（警告放行）', counts.quarantined, counts.quarantined ? 'gate-quarantined' : 'muted'],
    ['阻塞失败', counts.blocking, counts.blocking ? 'fail-text' : 'muted'],
    ['基础设施错误', counts.infrastructure, counts.infrastructure ? 'fail-text' : 'muted'],
  ];
  return <section className={`gate-card gate-${gate.status.toLowerCase()}`} aria-label="门禁判定">
    <div className="gate-card-header"><Icon size={17} /><h2>门禁判定</h2><Badge status={gate.status}>{gateStatusLabels[gate.status]}</Badge></div>
    <p className="gate-card-desc">{gateStatusDescription(gate.status)}</p>
    <div className="gate-metrics">{items.map(([label, value, className]) => <div key={label}><span>{label}</span><strong className={className || undefined}>{value}</strong></div>)}</div>
    <p className="gate-card-note">{gateFreezeNote}</p>
  </section>;
}

export function GateBadge({ gate }) {
  if (!isGatePresent(gate)) return <span className="muted">—</span>;
  return <Badge status={gate.status}>{gateStatusLabels[gate.status]}</Badge>;
}
