# Platform implementation handoff v1

Input: db60c88, existing PRD and `build-test-platform-agent-arch` delta specs. Coordinator: root. Implementation: actual Codex child agents with isolated worktrees. No AGENTS.md exists. No Figma connection is required. OpenSpec markdown exists; CLI validation is additional to runtime checks.

## Delivery boundary

Implement a usable central platform with real persistence, password login and four roles, cases and plans, capability-based queue and resource leases, outbound Agent protocol, browser execution, reports/evidence, audits, and deployment to GitHub Codespaces. Keep physical-device and private-model capabilities explicitly unconnected until their actual dependencies are supplied. Never seed fabricated successful executions or pretend a hardware stream exists. AI drafts require explicit human approval.

Keep Spring Boot 3 / Java 21 + PostgreSQL modular monolith. H2 file database is allowed only for local verification. Portal: React/Vite; Agent and CLI: Node/Playwright (a documented first-version deviation from the proposed Go binary, preserving the wire contract). Root owns Docker/Codespaces/CI/root docs/specs and integration. Backend owns `backend/`; frontend owns `frontend/`; runtime agent owns `agent/`, `cli/`, `examples/`. Independent acceptance is assigned to a fresh-context agent after integration.

## API contract v1

All routes under `/api`. JSON request/response, failures `{message}`. List endpoints return arrays. Authentication: `POST /auth/login {username,password}` -> `{token,user:{id,username,displayName,role}}`; `GET /auth/me` -> user; `Authorization: Bearer <token>`. Bootstrap admin comes only from `PLATFORM_ADMIN_PASSWORD`, username `admin`; empty configured password must fail startup. Roles `ADMIN,TESTER,DEVELOPER,VIEWER`. GET allowed for authenticated users; case/plan/run writes for ADMIN/TESTER/DEVELOPER; users/keys/devices admin writes for ADMIN. Owner-only workspace baseline.

`GET /dashboard` -> `{totalCases,totalPlans,totalRuns,passRate,onlineAgents,availableDevices,runningRuns,queuedRuns,recentRuns,trend:[{date,passed,failed}],platformStatus}`.

`GET/POST /cases`; `PUT/DELETE /cases/{id}`. Case: `{id,name,description,platform:'web'|'android'|'ios',framework:'playwright'|'appium'|'maestro',suite:'smoke'|'regression',status:'DRAFT'|'APPROVED',priority:'P0'|'P1'|'P2',tags:[],sensitive:false,steps:[{action:'goto'|'click'|'fill'|'expectText'|'expectVisible'|'screenshot',target,value}],createdAt,updatedAt}`. Only APPROVED cases may enter a run. `POST /cases/{id}/approve` human review. Retain revision history server-side; `GET /cases/{id}/history` array. No arbitrary script execution from portal.

`GET/POST /plans`; `PUT/DELETE /plans/{id}`. Plan: `{id,name,description,caseIds:[],capabilities:{platform:'web',browser:'chromium',provider:'local',tags:[]},priority:0,queueTimeoutSeconds:600,executionTimeoutSeconds:300,createdAt}`.

`GET /runs`; `GET /runs/{id}` -> run; `POST /runs {planId?,caseIds?:[],name?,capabilities?:{},priority?:0,commitSha?:'',queueTimeoutSeconds?:600,executionTimeoutSeconds?:300}` -> run. Run: `{id,name,planId,status:'QUEUED'|'ASSIGNED'|'RUNNING'|'CLEANING'|'PASSED'|'FAILED'|'TIMED_OUT'|'CANCELLED',createdAt,startedAt,finishedAt,deviceId,agentId,deviceFingerprint,caseIds,results:[{caseId,name,status,durationMs,error,steps:[],evidence:[]}],logs:[],summary:{passed,failed,total,durationMs},message}`. `POST /runs/{id}/cancel`. `GET /runs/{id}/junit` returns XML; `GET /runs/{id}/allure` JSON. Evidence URLs are authenticated. No fabricated data; dashboard derives from stored runs.

`GET /agents`; `GET /devices`; `PUT /devices/{id} {status?,tags?}`. Device: `{id,name,platform,version,browser,brand,model,provider,tags:[],status:'OFFLINE'|'IDLE'|'BUSY'|'CLEANING'|'MAINTENANCE',agentId,lastSeen}`. `GET/POST /agent-keys`; `DELETE /agent-keys/{id}`. POST `{name}` -> `{id,name,key}`; key plaintext shown once. `GET /users`; `POST /users {username,password,displayName,role}`. `GET /audit` array `{id,actor,action,target,createdAt,detail}`. `GET /settings` public configuration/integration state, no secrets. `GET /health` unauthenticated readiness.

## Agent wire protocol

Outbound WS `/ws/agent` (WSS externally), register first `{type:'register',agentKey,agentId,name,hostFingerprint,targets:[{id,name,platform,version,browser,brand,model,provider,tags}]}`. Platform `{type:'registered',agentId,heartbeatIntervalMs:10000}`. Agent heartbeat `{type:'heartbeat',targets:[...]}`; server heartbeat acknowledgement optional. Assignment `{type:'assign',taskId,run:{id,...},cases:[...]}`. Agent `{type:'ack',taskId}`, `{type:'progress',taskId,message}`, `{type:'done',taskId,status:'PASSED'|'FAILED',results:[...],logs:[],cleanupOk:true}`. Platform owns state and derives verdict from results, not trusted claimed status. End device BUSY -> CLEANING -> IDLE only with successful cleanup; false cleanup -> MAINTENANCE. Close/expiry quarantines resources, fails active run, requires clean resource confirmation on reconnect. Deduplicate task messages; enforce agent/assignment ownership. Keys bind on first registration. Revocation immediately closes WS. `/api/agent/evidence` multipart `file,taskId` with AgentKey auth `X-Agent-Key`; returns `{id,url,name,contentType,size}`. Agent only uploads evidence for its current owned run. Evidence retrieval bearer auth.

Runtime uses structured Playwright steps in fresh browser contexts, trace/video/screenshots. Browser resource targets `chromium`, optionally Firefox/WebKit if installed. No arbitrary shell endpoint. Mobile resources are enumerated only if real ADB exists; unsupported flows fail clearly, never produce synthetic PASS. CLI polls terminal state, prints report URL, exit 0 on pass, 1 failure/timeout, 2 configuration. Config env `PLATFORM_URL`, `PLATFORM_TOKEN`, `AGENT_KEY`, `AGENT_ID`.

## Verification

Backend: Maven test/package, negative authorization, input validation, scheduling/timeout/sensitive routing, Agent ownership/idempotency. Frontend: npm build, user flows against real API, responsive review. Agent/CLI: node tests on contract and CLI exit handling, one actual Playwright smoke through platform, report + evidence + JUnit. Integration: docker/compose validation as available, CI definition, local full flow, remote URL HTTP and authenticated UI when authorization completes. Costs unavailable -> unknown, no invented costs.
