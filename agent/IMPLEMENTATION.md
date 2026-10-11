# Runtime delivery: implemented and locally verified

Input: `docs/implementation-handoff.md` v1, commit db60c88. Actual implementation agent: Codex child `/root/runtime`; isolated branch `codex/platform-runtime`. Scope: `agent/`, `cli/`, `examples/`.

Implemented outbound browser registration, real launch/close capability probes, heartbeats, reconnect after cleanup, task deduplication, resource exclusion, cancellation and execution deadlines. Structured approved web cases run in fresh Playwright contexts, with owned multipart screenshot/video/trace/log uploads. Metadata validation rejects unsupported actions and mobile execution. The private network flag is explicit for trusted local targets. Bootstrap creates and persists an AgentKey once; restarts/reconnects reuse it. CLI selects approved suites or plans, authenticates, polls, prints the hash-route report URL, exports JUnit, and returns the specified exit codes. Docker pins official Playwright `v1.56.1-noble` matching the npm package, uses `pwuser` and writable `/agent-data`.

Wire additions agreed with backend: assigned `run.deviceId` is the registration target ID; `executionTimeoutSeconds` is supplied. Platform sends `{type:"cancel",taskId,reason}`. Browser probes send `status:"IDLE",cleanupOk:true`; heartbeat resources carry current state. Completed `done` cleanup is true only after verified context and browser closure.

Actual checks on Windows, Node v22.11.0, npm 10.9.0:

- `cd agent; npm test`: 7 passed (configuration, approval/action contract, private network, once-only credential bootstrap, assignment idempotency, cancellation/quarantine and lease exclusion).
- `cd cli; npm test`: 5 passed (validation, authenticated suite selection and JUnit, terminal exits, empty/mixed suites, polling deadline).
- `cd agent; npm run test:browser`: 2 passed using actual Chromium 141.0.7390.37 / Playwright build 1194. Verified outbound WS, duplicate assignment acknowledgement, DOM fill/click/assert/screenshot, new-context localStorage isolation, deliberate failed assertion, actual PNG/ZIP/WebM/log multipart uploads, execution timeout and cancellation cleanup.
- `npm audit`: 0 vulnerabilities after pinning patched `ws` 8.22.0.

First browser timeout test exposed concurrent context/browser closure; corrected to close the context before the browser and reran successfully. No failed assertions were weakened.

Root integration against actual Spring backend and remote deployment remains the coordinator's acceptance. Physical Android/iOS, Appium/Maestro, device streaming, cloud device providers and private models have no connected hardware/services here. ADB enumeration, when enabled and present, reports real attached devices as MAINTENANCE with enumeration-only tags; it never fabricates a successful test.
