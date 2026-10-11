import { useCallback, useEffect, useRef, useState } from 'react';
import { resolveEvidenceUrl } from './utils.js';

export const apiOrigin = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');
const TOKEN_KEY = 'smart-test-platform-session';
export const getToken = () => sessionStorage.getItem(TOKEN_KEY);
export const setToken = (token) => token ? sessionStorage.setItem(TOKEN_KEY, token) : sessionStorage.removeItem(TOKEN_KEY);

async function handleFailure(response) {
  let message = `请求失败（${response.status}）`;
  try { const body = await response.json(); message = body.message || message; } catch { /* non-JSON proxy failure */ }
  if (response.status === 401 && getToken()) {
    setToken(null);
    window.dispatchEvent(new Event('platform:session-expired'));
  }
  throw new Error(message);
}

export async function api(path, options = {}) {
  const { method = 'GET', body, signal } = options;
  let response;
  try {
    response = await fetch(`${apiOrigin}/api${path}`, {
      method, signal,
      headers: { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(getToken() ? { Authorization: `Bearer ${getToken()}` } : {}) },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
  } catch (error) {
    if (error.name === 'AbortError') throw error;
    throw new Error('无法连接平台服务，请检查网络或服务状态。');
  }
  if (!response.ok) return handleFailure(response);
  if (response.status === 204) return null;
  const contentType = response.headers.get('content-type') || '';
  return contentType.includes('application/json') ? response.json() : response.text();
}

export async function authenticatedBlob(url) {
  const target = resolveEvidenceUrl(url, apiOrigin, window.location.origin);
  const response = await fetch(target, { headers: { Authorization: `Bearer ${getToken()}` } });
  if (!response.ok) return handleFailure(response);
  return response.blob();
}

export async function downloadFile(url, filename) {
  const blob = await authenticatedBlob(url);
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = objectUrl;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(objectUrl), 30000);
}

export function useResource(path, { poll = 0, enabled = true } = {}) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(enabled);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [version, setVersion] = useState(0);
  const first = useRef(true);
  const reload = useCallback(() => setVersion(v => v + 1), []);
  useEffect(() => {
    if (!enabled) { setLoading(false); return; }
    let alive = true;
    let controller = null;
    let timer = null;
    const load = async () => {
      controller = new AbortController();
      if (first.current) setLoading(true); else setRefreshing(true);
      try {
        const result = await api(path, { signal: controller.signal });
        if (alive) { setData(result); setError(''); }
      } catch (err) {
        if (alive && err.name !== 'AbortError') setError(err.message);
      } finally {
        if (alive) { first.current = false; setLoading(false); setRefreshing(false); if (poll) timer = setTimeout(load, poll); }
      }
    };
    load();
    return () => { alive = false; controller?.abort(); clearTimeout(timer); };
  }, [path, poll, enabled, version]);
  return { data, loading, refreshing, error, reload };
}
