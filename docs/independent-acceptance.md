# Independent acceptance — smart test platform

Date: 2026-10-11, Asia/Shanghai. Reviewer: actual Codex fresh-context child agent `/root/acceptance`. This is acceptance evidence, not an implementation claim. The reviewer changed no production code and read no `.env`, administrator password, or saved Agent key.

## Scope and checked inputs

- Initial checked commit: `01e08612ee237cbea98f803ed3473006684b371c`, branch `codex/implement-platform`, workspace `D:\code\ai-test`.
- Read `docs/implementation-handoff.md` v1, `docs/ui-handoff.md`, `openspec/changes/implement-platform-m1/specs/platform-browser-workflow/spec.md`, and `.agents/skills/saas-multi-agent/SKILL.md`.
- Integration continued during this review. The approval fix was independently checked after `b54b4b7` / `c87713f`; structured report rendering after `22ded75`; quality UI after `58e5bac`. Capability failure was observed at `010590a0a76d886e8c72cade39d0ecf3d372603f`. Final application scheduling source and regressions were checked at `71635cc4c5779814c5f28f32078c54bd43232447`; repository HEAD during the final live repair check was `375ac46a042ddcb5bade9d5ecffba5753c188e6f` (the additional change concerns Codespaces setup).
- Local API: `http://127.0.0.1:8080`; frontend: `http://127.0.0.1:5173`. All mutation checks used the coordinator-provided disposable TESTER account. Test-created cases/plans/runs remain visibly named `Acceptance ...`; no existing user case was edited.
- Dedicated CUA IAB and Chrome sessions both refused the local URL with `net::ERR_BLOCKED_BY_CLIENT`. Per the coordinator's explicit fallback authorization, actual application-only Playwright browser tests were used in new headless Chromium contexts. No unrelated browser tab was accessed.

## Current verdict

**PASS for the tested local browser workflow after repairs.** All four correctness findings are repaired and independently checked. The final version-range task was assigned to a real Agent, passed actual Chromium steps, archived four evidence files, and returned the resource to IDLE. Remote Codespaces deployment, PostgreSQL persistence, and physical-device execution remain separate, independently unverified dependencies; this result does not mark the complete cloud delivery or original M2/M3 scope as accepted.

## Findings and repair verification

### A1 — P1: a stale human review could approve unseen revised steps — repaired and verified

Original path: `PlatformService.approveCase` read the current case without checking the revision displayed by `CaseReview`.

Reproduction on the initial live backend:

1. Create a draft with `goto https://example.com` and read revision 1.
2. A second editor performs `PUT /api/cases/{id}`, changing the target to `https://different-target.example`, yielding revision 2.
3. Submit `POST /api/cases/{id}/approve` from the original review.
4. Observed HTTP 200, APPROVED revision 2, including the target the reviewer had never seen.

Disposable original case: `case-3a7a1e92-f565-4f17-bca1-b71c0584d80d`.

Repair verification: stale `{revision:1}` now returns 409, keeps the current case DRAFT, and leaves history unchanged at CREATE + UPDATE. Current `{revision:2}` succeeds. An actual browser review held open while a second API editor changed its case showed the explicit expired-review error and left that case DRAFT. The frontend sends the displayed revision and requires another explicit review after conflict. The backend regression test also passed.

### A2 — P1: structured resource fingerprint was rendered as a React child — repaired and verified

The live API returns `deviceFingerprint` as a resource object. Original `RunDetail` inserted that object directly into `<dd>`, which is invalid React child content and prevents usable assigned/completed reports. This mismatch was established by source review and the live API object; the original crash was not claimed as a separately observed browser exception.

Repair verification: actual PASSED report `run-cea9a1d8-278c-4bce-8ea8-a1f985eddf5f` and FAILED report `run-1f6221cd-fbe0-4f42-bf6d-128804736003` both rendered readable device/Agent/platform/version/provider fields. Logs, authenticated screenshot preview, and JUnit browser download worked. Browser `pageerror` collection was empty.

### A3 — P2: browser version ranges reject a compatible multidotted version — repaired and verified

Path: `backend/src/main/java/com/smarttest/platform/PlatformService.java`, `matches()`. Range matching applies `Double.parseDouble` to the full device version; Chromium reports `156.0.8078.4`, which cannot be parsed as a double. Thus a valid `version: ">=1"` never matches that resource.

Live reproduction, with the Agent online:

1. Verify `local-browser-chromium` is IDLE, web/chromium/local, version `156.0.8078.4`.
2. Submit an approved web case with `{platform:"web",browser:"chromium",provider:"local",version:">=1",tags:[]}` and `queueTimeoutSeconds:2`.
3. Run `run-36c5574b-5241-42a9-a400-2201d6411c37` remains QUEUED and then becomes TIMED_OUT with no `deviceId`.
4. The same resource remains IDLE with the same version after timeout.

Repair `71635cc` compares numeric components with zero padding and supports explicit comparison operators. Independent final Maven execution passed the actual Chromium assignment, too-new rejection, Chromium component and Android range regressions. After the coordinator restarted the final local application, a new unchanged approved case used a temporary local HTTP fixture and `version: ">=1"`. Run `run-57a6a4d8-3ae9-4204-a786-6a666a98cf35` immediately became ASSIGNED to `local-browser-chromium` (`156.0.8078.4`), then PASSED with two real steps and four evidence records. The resource was IDLE after completion. The fixture was closed after verification.

### A4 — P2: string timestamps break chronological FIFO — repaired and verified

Path: `PlatformService.tick()` queue comparator, and timestamp sorting in `list()` / `caseHistory()`. `Instant.toString()` uses variable fractional precision; comparing these strings does not always compare time.

Deterministic example: the later `2026-10-11T10:59:43.012345Z` sorts before the earlier `2026-10-11T10:59:43.012Z`. Equal-priority queued jobs with these generated timestamp forms can dispatch in the wrong order. Existing scheduling coverage checks differing priorities rather than equal-priority fractional precision.

Repair `71635cc` compares parsed `Instant` values in the queue, public lists and history. The independently executed regression controls equal-priority timestamps ending `.012Z` and `.012345Z`, then verifies the earlier run receives the resource, the later run remains queued, public lists return chronological latest first, and history returns CREATE before APPROVE. This is source plus executed service/DB regression evidence, not a claimed live HTTP queue-order observation.

### Report export check

The original empty terminal infrastructure report added an error testcase while reporting zero tests. The coordinator's export repair was independently verified live: a queued timeout produced `<testsuite tests="1" failures="0" errors="1">` and an infrastructure error testcase. Anonymous JUnit requests return 401.

## Actual browser and API checks

- Login accepts the disposable account; an incorrect password produces the server error. All seven navigation destinations were verified against their actual expected headings.
- UI creates a DRAFT case; approval is disabled until the reviewer checks the acknowledgement. Approval succeeds and a plan can select that approved case.
- A real server rejection from 31 case tags displays `Invalid tags` while retaining the case name and form values. Correcting the tags saves the same draft.
- Editing an approved case creates another revision and returns it to DRAFT. History visibly shows CREATE, APPROVE, and UPDATE. The previously saved plan's launch dialog disables execution with a clear invalid-case error.
- `POST /api/runs` containing a draft is rejected with 400 and a human-approval message. A `javascript:` goto is rejected with 400.
- Actual success/failure reports displayed stored steps, errors and logs. The deliberate browser assertion failure showed the expected text and received `Acceptance target`.
- Screenshot preview fetched authenticated evidence and displayed a real 1280×720 PNG. The same evidence URL without authentication returned 401. JUnit downloads completed through the browser.
- Anonymous dashboard and report reads returned 401. TESTER user creation and Agent-key creation returned 403. Public user/key lists contain neither password hashes nor key hashes/plaintext keys.
- Desktop 1440×1000 and mobile 390×844 layouts were visually reviewed. Document width equals viewport width. The mobile navigation opens, selects the destination, and closes after its transition; the wide case table remains within its horizontal scroll container. No browser JavaScript errors occurred in the checked flows.
- Quality UI was verified using a new temporary local HTTP fixture and unchanged approved case `case-952ff437-0b1c-4363-b140-d38036e38d49`: actual Agent run `run-3a9d2b35-a7a7-4782-ad77-7eb7e71bbe13` passed with GOOD, then run `run-d05d19a9-e98b-4e19-a476-091c9737f990` failed after the fixture changed to BAD. Both used the same nonempty commit. The API and UI showed executions 2, passed 1, failed 1, EWMA 0.200 and a persistent human-review flag. The release button was initially disabled; entering a substantive review reason and checking acknowledgement allowed release. The API recorded `releasedBy: qa-review`, and `RELEASE_QUALITY_QUARANTINE` audit detail exactly matched the reason. No fabricated run or direct DB edit was used. Fixture and browser were closed after the check.

Final visual evidence was inspected and preserved in the ignored local QA directory at the coordinator's request. These PNGs contain no password or token:

- Desktop dashboard: `D:\code\ai-test\.data\acceptance\desktop.png`.
- Mobile cases and closed navigation: `D:\code\ai-test\.data\acceptance\mobile.png`.
- Actual failure report, resource fingerprint and authenticated screenshot preview: `D:\code\ai-test\.data\acceptance\report.png`.

The empty login screen was also inspected in `%TEMP%/platform-acceptance-login.png`; it is not a repository deliverable.

## Independently executed checks

| Check | Actual result |
| --- | --- |
| Maven `-f backend/pom.xml test -q`, Java 21.0.12.1 / Maven 3.9.9, isolated H2 memory DB | Initial 14 tests passed; final scheduling repair suite 17 tests, 0 failures/errors/skips, exit 0 at `71635cc` |
| `npm test --prefix agent` | 14 passed; exit 0; includes contract/idempotency/lease checks and mocked Appium service/ADB behavior |
| `npm run test:browser --prefix agent` | 2 passed; exit 0; real Chromium DOM actions, fresh contexts, assertion failure evidence, timeout/cancel cleanup, outbound WS and owned multipart upload against local fixtures |
| `npm test --prefix cli` | 5 passed; exit 0; approved-case selection, authenticated polling/export and exit semantics |
| `npm test --prefix frontend` | Final 7 passed; exit 0; includes structured fingerprint fields and quality-release roles |
| Actual local portal/API scenarios above | Passed after the described repairs, including the final real Agent version-range execution |

Backend code review found parameterized database access, one default workspace, hashed bearer sessions and Agent keys, explicit mutation role rules, task/lease/evidence ownership checks, result-derived verdicts, revocation closing an Agent connection, quarantine on disconnect or failed cleanup, restart recovery, and an aspect retaining the single-instance lock through transaction commit. These behaviors are covered by the existing meaningful backend regressions, which were independently run. This is a single-instance architecture review; multi-replica correctness was not asserted.

## External dependencies and limits

- Codespaces owner access, forwarded HTTPS URL, real PostgreSQL storage/restart persistence, and cloud deployed source SHA require the coordinator's separate live deployment verification. This reviewer did not infer them from a successful local build or config file.
- Remote TLS was reviewed in code/config and transport helper tests, not tested over a remote network. Local loopback HTTP is allowed. Compose intentionally enables private-network HTTP and trusted forwarding for the Codespaces proxy. TLS enforcement for a publicly exposed deployment therefore depends on the documented trusted reverse proxy/network boundary; internal TLS is explicitly unimplemented.
- Android has an optional Appium adapter with structured W3C actions and session/ADB cleanup guards. Its tests use mocked Appium/ADB. No physical Android device, real Appium service, iOS/Mac/WDA, mobile stream, private AI model, or cloud-device provider was available to this reviewer. Settings correctly report mobile/AI/cloud/streaming dependencies as unconnected.
- Allure export is structured result JSON, not a verified standalone Allure site. Performance sampling, S3 retention, external IdP/account lifecycle, notifications, cross-workspace use, and automatic CI quarantine are outside the documented M1 implementation boundary.
- Costs were not observable and remain unknown.

No open correctness finding remains from this local acceptance pass. Production deployment and the external capabilities listed above require their own evidence.
