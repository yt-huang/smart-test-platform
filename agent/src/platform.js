import { readFile, mkdir, writeFile, chmod } from 'node:fs/promises';
import path from 'node:path';

export async function api(config, route, { token, key, body, method = 'GET', signal } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (key) headers['X-Agent-Key'] = key;
  if (body !== undefined && !(body instanceof FormData)) headers['Content-Type'] = 'application/json';
  const response = await fetch(`${config.platformUrl}/api${route}`, {
    method, headers, body: body instanceof FormData ? body : body === undefined ? undefined : JSON.stringify(body),
    signal: signal || AbortSignal.timeout(15000)
  });
  const text = await response.text();
  let value;
  try { value = text ? JSON.parse(text) : null; } catch { value = null; }
  if (!response.ok) throw new Error(`Platform ${route}: HTTP ${response.status} ${value?.message || 'request failed'}`);
  return value;
}

export async function resolveAgentKey(config) {
  if (config.key) return config.key;
  try {
    const saved = JSON.parse(await readFile(config.keyFile, 'utf8'));
    if (!saved.key || saved.agentId !== config.agentId || saved.hostFingerprint !== config.hostFingerprint) {
      throw new Error('Persisted agent key belongs to another agent; use its AGENT_ID and host or provision a new key');
    }
    return saved.key;
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  if (!config.adminPassword) throw new Error('Set AGENT_KEY, provide AGENT_KEY_FILE, or set PLATFORM_ADMIN_PASSWORD for initial bootstrap');
  const login = await api(config, '/auth/login', { method: 'POST', body: { username: 'admin', password: config.adminPassword } });
  const created = await api(config, '/agent-keys', { method: 'POST', token: login.token, body: { name: `${config.name} (${config.agentId})` } });
  if (!created?.key || !created?.id) throw new Error('Platform did not return a newly provisioned agent key');
  try {
    await mkdir(path.dirname(config.keyFile), { recursive: true });
    await writeFile(config.keyFile, JSON.stringify({ id: created.id, key: created.key, agentId: config.agentId, hostFingerprint: config.hostFingerprint }), { mode: 0o600, flag: 'wx' });
    await chmod(config.keyFile, 0o600);
  } catch (error) {
    await api(config, `/agent-keys/${encodeURIComponent(created.id)}`, { method: 'DELETE', token: login.token }).catch(() => {});
    if (error.code === 'EEXIST') return resolveAgentKey(config);
    throw new Error(`Could not persist new agent key: ${error.message}`);
  }
  return created.key;
}

export async function uploadEvidence(config, key, taskId, filePath, capture) {
  const name = path.basename(filePath);
  const contentType = name.endsWith('.png') ? 'image/png' : name.endsWith('.webm') ? 'video/webm' : name.endsWith('.zip') ? 'application/zip' : 'text/plain';
  const body = new FormData();
  body.set('taskId', taskId);
  body.set('file', new Blob([await readFile(filePath)], { type: contentType }), name);
  if (capture !== undefined) body.set('capture', JSON.stringify(capture));
  const result = await api(config, '/agent/evidence', { method: 'POST', key, body, signal: AbortSignal.timeout(60000) });
  if (!result?.id || !result?.url) throw new Error('Invalid evidence upload response');
  return result;
}
