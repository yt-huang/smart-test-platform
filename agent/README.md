# Outbound browser Agent

Node 22+, pinned Playwright 1.56.1 and `ws` 8.22.0. Start with `npm ci`, `npm run install:browser`, then `npm start`. Container builds use the matching official Playwright image and its installed browsers.

Required configuration is `PLATFORM_URL` and one of `AGENT_KEY`, an existing `AGENT_KEY_FILE`, or `PLATFORM_ADMIN_PASSWORD` for initial bootstrap. Bootstrap logs in as the configured platform admin, creates a key once, and persists it with restricted file permissions. Restarts and reconnects reuse the persisted secret. Do not commit the key file or configure a default password. Keep `AGENT_ID` and the host stable for key ownership; the default ID derives from a hostname/platform/architecture fingerprint.

| Environment | Default / meaning |
| --- | --- |
| `PLATFORM_URL` | `http://localhost:8080`; HTTP becomes WS, HTTPS becomes WSS |
| `AGENT_KEY` | Optional pre-provisioned key; overrides saved key |
| `AGENT_KEY_FILE` | `.state/agent-key.json`; container `/agent-data/agent-key.json` |
| `AGENT_ID`, `AGENT_NAME` | Stable fingerprint ID and hostname display name |
| `AGENT_HOST_FINGERPRINT` | Optional stable deployment fingerprint; otherwise hostname/platform/architecture hash. Set this or a fixed container hostname when reusing a key volume across container recreation. |
| `AGENT_BROWSERS` | `chromium`; comma-separated installed `firefox`, `webkit` optional |
| `AGENT_TAGS` | Comma-separated target capability tags |
| `AGENT_ARTIFACTS_DIR` / `AGENT_WORK_DIR` | Artifact directory; container `/agent-data/work` |
| `AGENT_STEP_TIMEOUT_MS` | `15000` |
| `AGENT_EXECUTION_TIMEOUT_SECONDS` | `300`; assigned run timeout takes precedence |
| `AGENT_HEADLESS` | `true`; set `false` for local debugging |
| `AGENT_ALLOW_PRIVATE_NETWORK` | `false`; opt in on a trusted Agent for localhost/private test systems |
| `AGENT_ENABLE_ADB` | `false`; true performs actual ADB device enumeration only |

The Agent probes each browser by launching and verifying closure before advertising an IDLE resource with `cleanupOk:true`. It registers through `/ws/agent`, sends heartbeats, acknowledges assignments, deduplicates task IDs, and rejects a second lease on a busy target. Server cancellation uses `{type:"cancel",taskId,reason}`. Connection loss aborts current execution; reconnect waits for cleanup and repeats the probe. Authentication rejection/revocation closes the Agent with an error.

Every approved web/Playwright case receives a fresh non-persistent context. Supported actions are `goto` (HTTP(S) target), `click`, `fill`, `expectText` (contains value), `expectVisible`, and `screenshot` (optional element target). Raw scripts/shell commands are rejected. Browser requests to private destinations require explicit Agent configuration. Console/error/request logs, screenshots, traces and videos upload to `/api/agent/evidence` with `X-Agent-Key` and the owned `taskId`. Only verified browser/context closure produces `cleanupOk:true`. Failed cleanup quarantines the resource; upload failure fails the case and retains local artifacts for inspection.

Mobile enumeration advertises MAINTENANCE with the `enumeration-only` tag. Appium, Maestro, iOS devices and streaming remain unconnected; they do not produce simulated success. Connect actual hardware and an executor before enabling mobile scheduling.

Run `npm test` for metadata, credentials, private network, lease, idempotency and cancellation contract checks; `npm run test:browser` performs actual Chromium DOM execution and evidence uploads through a local outbound WS platform fixture. The root integration suite additionally verifies the real backend, CLI and authenticated reports.
