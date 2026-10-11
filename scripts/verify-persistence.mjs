#!/usr/bin/env node
// Credential-safe deployment persistence verifier.
// baseline: records a versioned snapshot of EVERY case/plan/run ID plus full
//           integrity details (report metadata, evidence SHA-256, device/agent
//           identity) of real completed PASSED runs — never passwords/tokens.
// check:    after a restart, proves every baseline ID still exists, report
//           metadata and evidence bytes are unchanged, and the same
//           device+agent pair recovered (device IDLE, agent ONLINE).
// Usage: node scripts/verify-persistence.mjs <baseline|check> --snapshot <path> [--wait-seconds N]
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';

const SNAPSHOT_VERSION = 1;
const DEFAULT_BASE = 'http://127.0.0.1:8080';
const REQUEST_TIMEOUT_MS = 30000;
const DEFAULT_WAIT_SECONDS = 90;
const SHA256_RE = /^[0-9a-f]{64}$/;

class VerifyError extends Error {}

function usage() {
  console.error('Usage: node scripts/verify-persistence.mjs <baseline|check> --snapshot <path> [--wait-seconds N]');
  process.exit(2);
}

function parseArgs(argv) {
  if (argv.length === 0) usage();
  const [command, ...rest] = argv;
  if (command !== 'baseline' && command !== 'check') usage();
  let snapshot;
  let waitSeconds = DEFAULT_WAIT_SECONDS;
  for (let i = 0; i < rest.length; i += 1) {
    if (rest[i] === '--snapshot') snapshot = rest[++i];
    else if (rest[i] === '--wait-seconds') waitSeconds = Number(rest[++i]);
    else usage();
  }
  if (!snapshot) usage();
  if (!Number.isFinite(waitSeconds) || waitSeconds < 0) usage();
  return { command, snapshot, waitSeconds };
}

function nonEmptyString(value) {
  return typeof value === 'string' && value.length > 0;
}

// PLATFORM_URL must be a plain http(s) origin: no userinfo, query or fragment,
// so no credential can smuggle in through configuration.
function normalizeBase(raw) {
  let parsed;
  try { parsed = new URL(raw); } catch { throw new VerifyError('PLATFORM_URL is not a valid URL'); }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') throw new VerifyError(`PLATFORM_URL must use http(s), got "${parsed.protocol}"`);
  if (parsed.username || parsed.password) throw new VerifyError('PLATFORM_URL must not contain userinfo');
  if (parsed.search || parsed.hash) throw new VerifyError('PLATFORM_URL must not contain a query or fragment');
  return parsed.origin;
}

function loadConfig() {
  const base = normalizeBase((process.env.PLATFORM_URL || DEFAULT_BASE).replace(/\/+$/, ''));
  let password = process.env.PLATFORM_ADMIN_PASSWORD;
  if (!password && existsSync('.env')) {
    password = readFileSync('.env', 'utf8').match(/^PLATFORM_ADMIN_PASSWORD=(.+)$/m)?.[1]?.trim().replace(/^["']|["']$/g, '');
  }
  if (!password) throw new VerifyError('PLATFORM_ADMIN_PASSWORD is required (env var or current directory .env)');
  return { base, origin: base, password };
}

// A credential-safe endpoint label: origin + pathname only. Server-controlled
// URLs may carry passwords/tokens in query parameters and must never reach
// stderr, snapshots or logs.
function endpointLabel(raw) {
  try {
    const u = new URL(raw);
    return `${u.origin}${u.pathname}`;
  } catch {
    return '(unparsable URL)';
  }
}

// Every authenticated request uses redirect:'manual' so a 3xx can never
// silently forward the Bearer header across origins.
async function apiFetch(label, url, { method = 'GET', body, token } = {}) {
  let response;
  try {
    response = await fetch(url, {
      method,
      redirect: 'manual',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (err) {
    throw new VerifyError(`request to ${label} failed: ${err.message}`);
  }
  if (response.status >= 300 && response.status < 400) {
    throw new VerifyError(`unexpected redirect (HTTP ${response.status}) on ${label}; refusing to follow`);
  }
  return response;
}

async function login(base, password) {
  const response = await apiFetch('POST /api/auth/login', `${base}/api/auth/login`, { method: 'POST', body: { username: 'admin', password } });
  if (response.status === 401 || response.status === 400) {
    throw new VerifyError('authentication failed (HTTP 401); check PLATFORM_ADMIN_PASSWORD');
  }
  if (response.status === 429) throw new VerifyError('login rate-limited (HTTP 429); wait one minute and retry');
  if (!response.ok) throw new VerifyError(`login failed (HTTP ${response.status})`);
  let data;
  try { data = await response.json(); } catch { throw new VerifyError('login returned invalid JSON'); }
  if (!data?.token) throw new VerifyError('login response did not include a token');
  return data.token;
}

async function apiJson(base, token, path) {
  const response = await apiFetch(`GET ${path}`, `${base}${path}`, { token });
  if (response.status === 401) throw new VerifyError(`authentication expired or invalid for GET ${path} (HTTP 401)`);
  if (!response.ok) throw new VerifyError(`GET ${path} failed (HTTP ${response.status})`);
  try { return await response.json(); } catch { throw new VerifyError(`GET ${path} returned invalid JSON`); }
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

// Evidence bytes are only ever fetched from the platform origin; the Bearer
// token must never be sent to a third party.
async function downloadEvidence(origin, base, token, url) {
  let parsed;
  try { parsed = new URL(url, base); } catch { throw new VerifyError('evidence URL is not a valid URL'); }
  if (parsed.origin !== origin) {
    throw new VerifyError(`evidence host ${parsed.host} is not same-origin with platform ${origin}; refusing to send credentials elsewhere`);
  }
  const label = `${parsed.origin}${parsed.pathname}`;
  const response = await apiFetch(label, parsed, { token });
  if (!response.ok) throw new VerifyError(`evidence download failed (HTTP ${response.status}) on ${label}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length === 0) throw new VerifyError(`evidence on ${label} is empty; refusing to verify on empty bytes`);
  return bytes;
}

function evidenceOf(run) {
  return (run.results || []).flatMap(r => r.evidence || []).filter(e => e && e.id && e.url);
}

async function fetchAll(base, token) {
  const [runs, cases, plans, devices, agents] = await Promise.all(
    ['/api/runs', '/api/cases', '/api/plans', '/api/devices', '/api/agents'].map(p => apiJson(base, token, p)));
  for (const [name, list] of [['runs', runs], ['cases', cases], ['plans', plans], ['devices', devices], ['agents', agents]]) {
    if (!Array.isArray(list)) throw new VerifyError(`GET /api/${name} did not return a JSON array`);
  }
  return { runs, cases, plans, devices, agents };
}

async function baseline({ origin, base, password, snapshot }) {
  const token = await login(base, password);
  const { runs, cases, plans, devices, agents } = await fetchAll(base, token);

  // Retain EVERY original record ID — failing/cancelled runs, unreferenced
  // cases and plans included. Integrity details below are selective, these
  // retention lists are not.
  const runIds = runs.map(r => r?.id).filter(nonEmptyString);
  const caseIds = cases.map(c => c?.id).filter(nonEmptyString);
  const planIds = plans.map(p => p?.id).filter(nonEmptyString);
  if (runIds.length === 0 || caseIds.length === 0 || planIds.length === 0) {
    throw new VerifyError('deployment has no runs, cases or plans to retain; an empty deployment cannot prove recovery');
  }

  const devicesById = new Map(devices.map(d => [d?.id, d]));
  const agentsById = new Map(agents.map(a => [a?.id, a]));

  // Integrity reports: only completed PASSED runs with nonempty downloadable
  // evidence, and each must carry finishedAt plus a resolvable device+agent
  // identity — nothing may be silently filtered away.
  const reports = [];
  for (const run of runs) {
    if (!run || !nonEmptyString(run.id)) continue;
    if (run.status !== 'PASSED') continue; // non-passing runs stay retained by ID only
    if (!run.summary || typeof run.summary.passed !== 'number' || run.summary.passed < 1) continue;
    const items = evidenceOf(run);
    if (items.length === 0) continue; // a PASSED run without evidence cannot prove recovery
    if (!nonEmptyString(run.finishedAt) || !nonEmptyString(run.deviceId) || !nonEmptyString(run.agentId)) {
      throw new VerifyError(`completed PASSED run ${run.id} lacks finishedAt/deviceId/agentId; cannot prove resource recovery`);
    }
    const device = devicesById.get(run.deviceId);
    if (!device) throw new VerifyError(`run ${run.id} references device ${run.deviceId} which is missing from /api/devices`);
    if ((device.agentId ?? '') !== run.agentId) {
      throw new VerifyError(`run ${run.id} device ${run.deviceId} belongs to agent ${device.agentId || '(none)'} but the run was executed by agent ${run.agentId}`);
    }
    if (!agentsById.has(run.agentId)) throw new VerifyError(`run ${run.id} references agent ${run.agentId} which is missing from /api/agents`);
    const evidence = [];
    for (const item of items) {
      const bytes = await downloadEvidence(origin, base, token, item.url);
      evidence.push({ id: item.id, name: item.name ?? '', size: bytes.length, sha256: sha256(bytes) });
    }
    reports.push({
      id: run.id,
      name: run.name ?? '',
      status: run.status,
      planId: run.planId ?? '',
      caseIds: [...(run.caseIds || [])],
      commitSha: run.commitSha ?? '',
      createdAt: run.createdAt ?? '',
      finishedAt: run.finishedAt,
      summary: { passed: run.summary.passed, failed: run.summary.failed, total: run.summary.total },
      deviceId: run.deviceId,
      agentId: run.agentId,
      evidence,
    });
  }
  if (reports.length === 0) {
    throw new VerifyError('no completed PASSED run with nonempty downloadable evidence found; an empty deployment cannot prove recovery');
  }

  const resources = [];
  const seenDevices = new Set();
  for (const r of reports) {
    if (seenDevices.has(r.deviceId)) continue;
    seenDevices.add(r.deviceId);
    const d = devicesById.get(r.deviceId); // existence proven above, never filtered
    resources.push({ deviceId: d.id, agentId: d.agentId ?? '', deviceName: d.name ?? '', platform: d.platform ?? '' });
  }

  const snapshotDoc = {
    version: SNAPSHOT_VERSION,
    createdAt: new Date().toISOString(),
    platformUrl: base,
    runIds,
    caseIds,
    planIds,
    reports,
    resources,
  };
  // Only write the snapshot once every check above succeeded, so failed
  // baselines (bad credentials, empty deployment) never leave a file behind.
  writeFileSync(snapshot, `${JSON.stringify(snapshotDoc, null, 2)}\n`);
  console.log(JSON.stringify({
    status: 'baseline-created',
    snapshot,
    runs: runIds.length,
    cases: caseIds.length,
    plans: planIds.length,
    reports: reports.length,
    evidence: reports.reduce((n, r) => n + r.evidence.length, 0),
    resources: resources.map(r => r.deviceId),
  }, null, 2));
}

// Strict structural validation BEFORE any authentication or check: a vacuous
// or hand-edited snapshot must fail here, never report a false "verified".
function validateSnapshot(doc, snapshot) {
  const fail = (msg) => { throw new VerifyError(`snapshot ${snapshot} is invalid: ${msg}`); };
  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) fail('not a JSON object');
  if (doc.version !== SNAPSHOT_VERSION) fail(`unsupported version ${doc.version ?? '(missing)'}`);
  if (!nonEmptyString(doc.createdAt)) fail('missing createdAt');
  if (!nonEmptyString(doc.platformUrl)) fail('missing platformUrl');
  const idList = (key) => {
    if (!Array.isArray(doc[key])) fail(`missing a valid "${key}" list`);
    const ids = doc[key];
    if (ids.length === 0) fail(`"${key}" is empty; a vacuous snapshot cannot prove persistence`);
    for (const id of ids) if (!nonEmptyString(id)) fail(`"${key}" contains an empty or non-string id`);
    if (new Set(ids).size !== ids.length) fail(`"${key}" contains duplicate ids`);
    return ids;
  };
  const runIds = idList('runIds');
  const caseIds = idList('caseIds');
  const planIds = idList('planIds');
  if (!Array.isArray(doc.reports) || doc.reports.length === 0) {
    fail('no integrity reports; require at least one completed PASSED report with nonempty evidence');
  }
  const runIdSet = new Set(runIds);
  for (const r of doc.reports) {
    if (!r || typeof r !== 'object') fail('a report entry is not an object');
    if (!nonEmptyString(r.id)) fail('a report has no id');
    if (!runIdSet.has(r.id)) fail(`report ${r.id} is not part of runIds`);
    if (r.status !== 'PASSED') fail(`report ${r.id} is not a completed PASSED report`);
    if (!nonEmptyString(r.finishedAt)) fail(`report ${r.id} lacks finishedAt`);
    if (!nonEmptyString(r.deviceId) || !nonEmptyString(r.agentId)) fail(`report ${r.id} lacks deviceId/agentId identity`);
    if (typeof r.name !== 'string' || typeof r.planId !== 'string' || typeof r.commitSha !== 'string' || typeof r.createdAt !== 'string') {
      fail(`report ${r.id} lacks stable metadata fields`);
    }
    if (!Array.isArray(r.caseIds)) fail(`report ${r.id} lacks a valid caseIds list`);
    if (!r.summary || typeof r.summary.passed !== 'number' || typeof r.summary.failed !== 'number' || typeof r.summary.total !== 'number') {
      fail(`report ${r.id} lacks a valid summary`);
    }
    if (!Array.isArray(r.evidence) || r.evidence.length === 0) fail(`report ${r.id} has no evidence`);
    for (const e of r.evidence) {
      if (!e || !nonEmptyString(e.id)) fail(`report ${r.id} has evidence without id`);
      if (typeof e.name !== 'string') fail(`evidence ${e.id} of report ${r.id} lacks a name`);
      if (!Number.isInteger(e.size) || e.size <= 0) fail(`evidence ${e.id} of report ${r.id} lacks a valid size`);
      if (!SHA256_RE.test(e.sha256 ?? '')) fail(`evidence ${e.id} of report ${r.id} lacks a valid SHA-256 digest`);
    }
  }
  if (!Array.isArray(doc.resources) || doc.resources.length === 0) fail('no resource identities');
  const resourceDevices = new Set();
  for (const res of doc.resources) {
    if (!res || !nonEmptyString(res.deviceId) || !nonEmptyString(res.agentId)) fail('a resource lacks deviceId/agentId');
    if (resourceDevices.has(res.deviceId)) fail(`duplicate resource identity for device ${res.deviceId}`);
    resourceDevices.add(res.deviceId);
  }
  for (const r of doc.reports) {
    if (!resourceDevices.has(r.deviceId)) fail(`report ${r.id} device ${r.deviceId} has no resolved resource identity`);
  }
  return { runIds, caseIds, planIds, reports: doc.reports, resources: doc.resources };
}

function loadSnapshot(snapshot) {
  if (!existsSync(snapshot)) throw new VerifyError(`snapshot ${snapshot} does not exist; run baseline first`);
  let doc;
  try { doc = JSON.parse(readFileSync(snapshot, 'utf8')); } catch { throw new VerifyError(`snapshot ${snapshot} is not valid JSON`); }
  return validateSnapshot(doc, snapshot);
}

function sameSet(a, b) {
  const x = new Set(a || []); const y = new Set(b || []);
  return x.size === y.size && [...x].every(v => y.has(v));
}

async function check({ origin, base, password, snapshot, waitSeconds }) {
  const baselineState = loadSnapshot(snapshot);
  const token = await login(base, password);
  const { runs, cases, plans } = await fetchAll(base, token);

  const runsById = new Map(runs.map(r => [r?.id, r]));
  const casesById = new Map(cases.map(c => [c?.id, c]));
  const plansById = new Map(plans.map(p => [p?.id, p]));

  // Every original ID must survive the restart; new records are permitted.
  for (const id of baselineState.runIds) {
    if (!runsById.has(id)) throw new VerifyError(`baseline run ${id} is missing after restart`);
  }
  for (const id of baselineState.caseIds) {
    if (!casesById.has(id)) throw new VerifyError(`baseline case ${id} is missing after restart`);
  }
  for (const id of baselineState.planIds) {
    if (!plansById.has(id)) throw new VerifyError(`baseline plan ${id} is missing after restart`);
  }

  for (const b of baselineState.reports) {
    const run = runsById.get(b.id);
    if (run.status !== 'PASSED') throw new VerifyError(`baseline run ${b.id} is no longer PASSED (status: ${run.status})`);
    if (run.name !== b.name) throw new VerifyError(`baseline run ${b.id} report name changed`);
    if ((run.planId ?? '') !== b.planId) throw new VerifyError(`baseline run ${b.id} planId changed`);
    if ((run.commitSha ?? '') !== b.commitSha) throw new VerifyError(`baseline run ${b.id} commitSha changed`);
    if ((run.createdAt ?? '') !== b.createdAt || (run.finishedAt ?? '') !== b.finishedAt) {
      throw new VerifyError(`baseline run ${b.id} timestamps changed`);
    }
    if ((run.deviceId ?? '') !== b.deviceId || (run.agentId ?? '') !== b.agentId) {
      throw new VerifyError(`baseline run ${b.id} resource identity changed (deviceId/agentId)`);
    }
    if (run.summary?.passed !== b.summary.passed || run.summary?.failed !== b.summary.failed || run.summary?.total !== b.summary.total) {
      throw new VerifyError(`baseline run ${b.id} summary changed`);
    }
    if (!sameSet(run.caseIds, b.caseIds)) throw new VerifyError(`baseline run ${b.id} caseIds changed`);
    const currentEvidence = evidenceOf(run);
    for (const e of b.evidence) {
      const item = currentEvidence.find(x => x.id === e.id);
      if (!item) throw new VerifyError(`evidence ${e.id} of run ${b.id} is missing after restart`);
      const bytes = await downloadEvidence(origin, base, token, item.url);
      if (bytes.length !== e.size || sha256(bytes) !== e.sha256) {
        throw new VerifyError(`evidence ${e.id} of run ${b.id} failed SHA-256 integrity check (content changed, possibly equal-length tampering)`);
      }
    }
  }

  const deadline = Date.now() + waitSeconds * 1000;
  for (;;) {
    const { devices, agents } = await fetchAll(base, token);
    const devicesById = new Map(devices.map(d => [d?.id, d]));
    const agentsById = new Map(agents.map(a => [a?.id, a]));
    const pending = [];
    for (const r of baselineState.resources) {
      const device = devicesById.get(r.deviceId);
      const agent = agentsById.get(r.agentId);
      if (!device) { pending.push(`device ${r.deviceId} missing`); continue; }
      if (device.agentId !== r.agentId) { pending.push(`device ${r.deviceId} reattached to a different agent`); continue; }
      if (device.status !== 'IDLE') { pending.push(`device ${r.deviceId} status ${device.status}`); continue; }
      if (!agent) { pending.push(`agent ${r.agentId} missing`); continue; }
      if (agent.status !== 'ONLINE') { pending.push(`agent ${r.agentId} status ${agent.status}`); continue; }
    }
    if (pending.length === 0) break;
    if (Date.now() >= deadline) {
      throw new VerifyError(`resources did not recover within ${waitSeconds}s: ${pending.join('; ')}`);
    }
    await delay(1000);
  }

  console.log(JSON.stringify({
    status: 'verified',
    snapshot,
    runsRetained: baselineState.runIds.length,
    casesRetained: baselineState.caseIds.length,
    plansRetained: baselineState.planIds.length,
    reportsVerified: baselineState.reports.length,
    evidenceIntact: baselineState.reports.reduce((n, r) => n + r.evidence.length, 0),
    resourcesRecovered: baselineState.resources.map(r => r.deviceId),
  }, null, 2));
}

const args = parseArgs(process.argv.slice(2));
const config = loadConfig();
const action = args.command === 'baseline' ? baseline : check;
action({ origin: config.origin, base: config.base, password: config.password, snapshot: args.snapshot, waitSeconds: args.waitSeconds }).catch((err) => {
  console.error(`verify-persistence: ${err.message}`);
  process.exit(1);
});
