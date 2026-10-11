import WebSocket from 'ws';
import { executeTask } from './task-executor.js';
import { discoverTargets } from './targets.js';
import { uploadEvidence } from './platform.js';

export class AgentClient {
  constructor(config, key, { execute = executeTask, discover = discoverTargets, log = console.log, socketFactory = url => new WebSocket(url, { maxPayload: 2 * 1024 * 1024, handshakeTimeout: 15000 }) } = {}) {
    Object.assign(this, { config, key, execute, discover, log, socketFactory });
    this.active = new Map(); this.completed = new Map(); this.targets = []; this.quarantined = new Set();
    this.stopped = false; this.registered = false; this.reconnectAttempt = 0;
  }

  async start() {
    this.targets = await this.discover(this.config, this.log);
    if (!this.targets.some(target => target.status === 'IDLE' && target.cleanupOk)) throw new Error('No usable target: install a browser or connect and configure an actual Android/Appium device');
    this.connect();
  }

  connect() {
    if (this.stopped) return;
    this.registered = false;
    const socket = this.socketFactory(this.config.wsUrl);
    this.socket = socket;
    socket.on('open', () => {
      this.send({ type: 'register', agentKey: this.key, agentId: this.config.agentId, name: this.config.name,
        hostFingerprint: this.config.hostFingerprint, targets: this.targets }, socket);
      this.registrationTimer = setTimeout(() => socket.close(1000, 'Registration timeout'), 15000);
    });
    socket.on('message', data => {
      try {
        const payload = JSON.parse(data.toString());
        if (this.socket === socket) this.handle(payload, socket);
      } catch (error) { this.log(`Invalid platform message: ${error.message}`); }
    });
    socket.on('error', error => this.log(`Agent connection error: ${error.message}`));
    socket.on('close', (code, reason) => {
      clearTimeout(this.registrationTimer); clearInterval(this.heartbeat);
      this.registered = false;
      for (const task of this.active.values()) task.controller.abort(new Error('Platform connection lost'));
      if (this.stopped) return;
      if ([1008, 4001, 4003].includes(code)) {
        this.log(`Agent authorization rejected or revoked (${code}): ${reason.toString()}`);
        this.stopped = true; process.exitCode = 1; return;
      }
      this.log(`Agent disconnected (${code}); reconnecting after resource cleanup`);
      this.reconnectAfterCleanup().catch(error => { this.log(`Reconnect failed: ${error.message}`); this.scheduleReconnect(); });
    });
  }

  async reconnectAfterCleanup() {
    await Promise.allSettled([...this.active.values()].map(task => task.promise));
    if (this.stopped) return;
    this.targets = await this.discover(this.config, this.log);
    for (const target of this.targets) if (this.quarantined.has(target.id)) { target.status = 'MAINTENANCE'; target.cleanupOk = false; }
    this.scheduleReconnect();
  }

  scheduleReconnect() {
    if (this.stopped) return;
    const timeout = Math.min(30000, 1000 * 2 ** Math.min(this.reconnectAttempt++, 5));
    this.reconnectTimer = setTimeout(() => this.connect(), timeout);
  }

  handle(payload, socket = this.socket) {
    if (payload.type === 'registered') {
      if (payload.agentId !== this.config.agentId) { socket.close(1008, 'Agent identity mismatch'); return; }
      clearTimeout(this.registrationTimer);
      this.registered = true; this.reconnectAttempt = 0;
      const interval = Math.max(1000, Math.min(30000, Number(payload.heartbeatIntervalMs) || 10000));
      clearInterval(this.heartbeat);
      this.heartbeat = setInterval(() => this.send({ type: 'heartbeat', targets: this.targets }), interval);
      this.log(`Agent ${this.config.agentId} registered with ${this.targets.length} real target(s)`);
    } else if (payload.type === 'assign' && this.registered) {
      this.assign(payload, socket);
    } else if (payload.type === 'cancel') {
      this.active.get(payload.taskId)?.controller.abort(new Error(payload.reason || 'Platform cancelled execution'));
    } else if (payload.type === 'error') {
      this.log(`Platform protocol error: ${payload.message || 'unknown'}`);
    }
  }

  assign(assignment, socket) {
    if (typeof assignment.taskId !== 'string' || !assignment.run?.id || !Array.isArray(assignment.cases) || !assignment.cases.length) {
      this.log('Invalid assignment ignored'); return;
    }
    if (this.completed.has(assignment.taskId)) {
      this.send({ type: 'ack', taskId: assignment.taskId }, socket);
      this.send(this.completed.get(assignment.taskId), socket); return;
    }
    if (this.active.has(assignment.taskId)) { this.send({ type: 'ack', taskId: assignment.taskId }, socket); return; }
    const target = this.targets.find(item => item.id === assignment.run.deviceId);
    const leased = [...this.active.values()].some(task => task.target?.id === target?.id);
    this.send({ type: 'ack', taskId: assignment.taskId }, socket);
    if (!target || leased || target.status !== 'IDLE') {
      const done = { type: 'done', taskId: assignment.taskId, status: 'FAILED', infrastructureErrors: ['EXECUTOR_FAILED'], cleanupOk: !leased && target?.cleanupOk === true,
        results: assignment.cases.map(testCase => ({ caseId: testCase.id, name: testCase.name, status: 'FAILED', durationMs: 0, error: 'Assigned resource is unavailable, busy, or quarantined', steps: [], evidence: [] })), logs: [] };
      this.send(done, socket); this.remember(done); return;
    }
    target.status = 'BUSY'; target.cleanupOk = false;
    const task = { target, controller: new AbortController(), promise: null };
    this.active.set(assignment.taskId, task);
    task.promise = Promise.resolve().then(() => this.execute({ assignment, target, config: this.config, signal: task.controller.signal,
      upload: file => uploadEvidence(this.config, this.key, assignment.taskId, file),
      progress: message => this.send({ type: 'progress', taskId: assignment.taskId, message }, socket)
    })).catch(error => ({ type: 'done', taskId: assignment.taskId, status: 'FAILED', infrastructureErrors: ['EXECUTOR_FAILED'], cleanupOk: false,
      results: assignment.cases.map(testCase => ({ caseId: testCase.id, name: testCase.name, status: 'FAILED', durationMs: 0, error: error.message, steps: [], evidence: [] })), logs: [error.message]
    })).then(done => {
      target.status = done.cleanupOk ? 'IDLE' : 'MAINTENANCE'; target.cleanupOk = done.cleanupOk === true;
      if (!done.cleanupOk) this.quarantined.add(target.id);
      this.active.delete(assignment.taskId); this.remember(done);
      this.send(done, socket);
      this.log(`Task ${assignment.taskId}: ${done.status}; cleanup ${done.cleanupOk ? 'verified' : 'failed'}`);
      return done;
    });
  }

  remember(done) {
    this.completed.set(done.taskId, done);
    if (this.completed.size > 100) this.completed.delete(this.completed.keys().next().value);
  }

  send(payload, socket = this.socket) {
    if (socket === this.socket && socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(payload));
  }

  async stop(reason = 'Agent stopped') {
    this.stopped = true;
    clearTimeout(this.reconnectTimer); clearTimeout(this.registrationTimer); clearInterval(this.heartbeat);
    for (const task of this.active.values()) task.controller.abort(new Error(reason));
    await Promise.allSettled([...this.active.values()].map(task => task.promise));
    this.socket?.close(1000, reason);
  }
}
