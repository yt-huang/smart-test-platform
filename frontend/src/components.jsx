import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { AlertCircle, ArrowRight, Check, CheckCircle2, ChevronRight, Inbox, LoaderCircle, RefreshCw, X } from 'lucide-react';
import { statusLabels } from './utils.js';

const ToastContext = createContext(null);
export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const timers = useRef([]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  const notify = (message, type = 'success') => {
    const id = crypto.randomUUID();
    setToasts(items => [...items.slice(-3), { id, message, type }]);
    timers.current.push(setTimeout(() => setToasts(items => items.filter(x => x.id !== id)), type === 'error' ? 9000 : 5000));
  };
  return <ToastContext.Provider value={notify}>{children}<div className="toasts" aria-live="polite">{toasts.map(t => <div className={`toast ${t.type}`} key={t.id}>{t.type === 'error' ? <AlertCircle size={19} /> : <CheckCircle2 size={19} />}<span>{t.message}</span><button aria-label="关闭通知" onClick={() => setToasts(items => items.filter(x => x.id !== t.id))}><X size={15} /></button></div>)}</div></ToastContext.Provider>;
}
export const useToast = () => useContext(ToastContext);

export function Button({ children, className = '', variant = 'primary', busy = false, disabled, ...props }) {
  return <button type="button" {...props} disabled={disabled || busy} className={`button ${variant} ${className}`}>{busy && <LoaderCircle size={16} className="spin" />}{children}</button>;
}
export function IconButton({ label, children, className = '', ...props }) {
  return <button type="button" className={`icon-button ${className}`} title={label} aria-label={label} {...props}>{children}</button>;
}
export function Badge({ status, children }) {
  return <span className={`badge status-${String(status || '').toLowerCase()}`}><span className="badge-dot" />{children || statusLabels[status] || status || '未知'}</span>;
}
export function Loading({ label = '正在加载平台数据…' }) {
  return <div className="loading" role="status"><LoaderCircle size={25} className="spin" /><span>{label}</span></div>;
}
export function ErrorNotice({ message, onRetry, compact = false }) {
  if (!message) return null;
  return <div className={`error-notice ${compact ? 'compact' : ''}`} role="alert"><AlertCircle size={20} /><div><strong>请求未完成</strong><p>{message}</p></div>{onRetry && <Button variant="secondary" onClick={onRetry}><RefreshCw size={15} />重试</Button>}</div>;
}
export function Empty({ icon: Icon = Inbox, title = '暂无数据', description, action }) {
  return <div className="empty-state"><div className="empty-icon"><Icon size={28} strokeWidth={1.5} /></div><h3>{title}</h3>{description && <p>{description}</p>}{action}</div>;
}
export function PageHeading({ eyebrow, title, description, children }) {
  return <div className="page-heading"><div>{eyebrow && <p className="eyebrow">{eyebrow}</p>}<h1>{title}</h1>{description && <p className="page-description">{description}</p>}</div><div className="heading-actions">{children}</div></div>;
}
export function SectionTitle({ title, description, children }) {
  return <div className="section-title"><div><h2>{title}</h2>{description && <p>{description}</p>}</div>{children}</div>;
}
export function RefreshButton({ resource }) {
  return <Button variant="secondary" busy={resource.refreshing} onClick={resource.reload}><RefreshCw size={16} />刷新</Button>;
}
export function Field({ label, hint, children, required }) {
  return <label className="field"><span>{label}{required && <span className="required"> *</span>}</span>{children}{hint && <small>{hint}</small>}</label>;
}
export function Modal({ title, description, children, onClose, wide = false, busy = false }) {
  const box = useRef(null);
  const close = useRef(onClose);
  const busyRef = useRef(busy);
  close.current = onClose;
  busyRef.current = busy;
  useEffect(() => {
    const prior = document.activeElement;
    const original = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    box.current?.querySelector('input,select,textarea,button')?.focus();
    const keydown = (event) => {
      if (event.key === 'Escape' && !busyRef.current) close.current();
      if (event.key !== 'Tab') return;
      const focusable = [...box.current.querySelectorAll('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),a[href]')];
      if (!focusable.length) { event.preventDefault(); return; }
      const first = focusable[0]; const last = focusable.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', keydown);
    return () => { document.body.style.overflow = original; document.removeEventListener('keydown', keydown); prior?.focus?.(); };
  }, []);
  return <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget && !busy) onClose(); }}><div ref={box} className={`modal ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true" aria-labelledby="modal-title"><div className="modal-heading"><div><h2 id="modal-title">{title}</h2>{description && <p>{description}</p>}</div><IconButton disabled={busy} label="关闭对话框" onClick={onClose}><X size={20} /></IconButton></div>{children}</div></div>;
}
export function ConfirmButton({ onConfirm, label = '删除', confirmLabel = '确认删除', icon, disabled = false, variant = 'danger-ghost' }) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  async function confirm() {
    setBusy(true);
    try { await onConfirm(); setConfirming(false); } catch (err) { toast(err.message, 'error'); } finally { setBusy(false); }
  }
  return confirming ? <span className="confirm-actions"><Button variant="danger" busy={busy} onClick={confirm}>{confirmLabel}</Button><Button variant="ghost" disabled={busy} onClick={() => setConfirming(false)}>取消</Button></span> : <Button variant={variant} disabled={disabled} onClick={() => setConfirming(true)}>{icon}{label}</Button>;
}
export function Breadcrumb({ items }) {
  return <div className="breadcrumb"><span>工作空间</span>{items.map((item, i) => <span key={i}><ChevronRight size={13} />{item}</span>)}</div>;
}
export function JumpLink({ to, children }) {
  return <a className="jump-link" href={`#${to}`}>{children}<ArrowRight size={15} /></a>;
}
export function CopyButton({ value, label = '复制' }) {
  const [copied, setCopied] = useState(false);
  const toast = useToast();
  async function copy() {
    try { await navigator.clipboard.writeText(value); setCopied(true); setTimeout(() => setCopied(false), 2500); } catch { toast('浏览器无法访问剪贴板，请手动选择并复制。', 'error'); }
  }
  return <Button variant="secondary" onClick={copy}>{copied && <Check size={15} />}{copied ? '已复制' : label}</Button>;
}
