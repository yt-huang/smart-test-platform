# Outbound browser Agent

Node 22+, pinned Playwright 1.64.0 and `ws` 8.22.0. Start with `npm ci`, `npm run install:browser`, then `npm start`. Container builds use the matching official Playwright image and its installed browsers.

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
| `AGENT_ENABLE_ADB` | `false`; true performs actual ADB enumeration and, when configured, Appium probes |
| `APPIUM_URL` / `APPIUM_TOKEN` | Optional trusted W3C Appium endpoint and bearer credential; no embedded URL secrets |
| `AGENT_ANDROID_APP_PACKAGE` / `AGENT_ANDROID_APP_ACTIVITY` | Explicit installed Android test application for UiAutomator2; each case resets this application's data |
| `AGENT_ANDROID_BROWSER` | Optional `Chrome` instead of a native test app; each case resets its test browser profile |

The Agent probes each browser by launching and verifying closure before advertising an IDLE resource with `cleanupOk:true`. It registers through `/ws/agent`, sends heartbeats, acknowledges assignments, deduplicates task IDs, and rejects a second lease on a busy target. Server cancellation uses `{type:"cancel",taskId,reason}`. Connection loss aborts current execution; reconnect waits for cleanup and repeats the probe. Authentication rejection/revocation closes the Agent with an error.

Every approved web/Playwright case receives a fresh non-persistent context. Supported actions are `goto` (HTTP(S) target), `click`, `fill`, `expectText` (contains value), `expectVisible`, and `screenshot` (optional element target). Raw scripts/shell commands are rejected. Browser requests to private destinations require explicit Agent configuration. Console/error/request logs, screenshots, traces and videos upload to `/api/agent/evidence` with `X-Agent-Key` and the owned `taskId`. Only verified browser/context closure produces `cleanupOk:true`. Failed cleanup quarantines the resource; upload failure fails the case and retains local artifacts for inspection.

Android discovery uses actual `adb devices -l`. Without a configured, healthy Appium endpoint and test app/Chrome, devices advertise MAINTENANCE with the `enumeration-only` tag. With configuration, the Agent verifies no existing session owns the device, creates a real UiAutomator2 W3C session, deletes it, verifies `invalid session id`, force-stops the configured test app and confirms its data reset through ADB before advertising IDLE with the `appium` tag. The Playwright image does not include ADB or an Appium server; use a suitably prepared device host for mobile execution.

The optional Android adapter supports the same approved structured actions through W3C commands. Native cases start in the configured test app; `goto` is available for configured Chrome only. Selectors accept `id:`, `accessibility:`, `xpath:` and `css:` prefixes (unprefixed native selectors are resource IDs, unprefixed Chrome selectors are CSS). Evidence is device screenshots and execution logs; mobile video/trace is not implemented. Credentials, ADB commands, app capabilities and endpoint configuration come only from trusted Agent environment settings. Portal cases cannot request arbitrary shell/script execution.

Appium cancellation aborts active commands but retains session creation until its response supplies an ID for cleanup. A lost creation response, failed DELETE verification, failed ADB reset or lost device quarantines the target. Unidentified existing Appium sessions block a clean probe. Browser quarantine persists through reconnects within the same running Agent. Maestro, iOS, remote streaming and cloud provider execution remain unconnected. Actual Android hardware validation is still required; protocol-fixture tests never register synthetic devices with the platform.

Run `npm test` for metadata, credentials, private network, lease, idempotency and cancellation contract checks; `npm run test:browser` performs actual Chromium DOM execution and evidence uploads through a local outbound WS platform fixture. The root integration suite additionally verifies the real backend, CLI and authenticated reports.
