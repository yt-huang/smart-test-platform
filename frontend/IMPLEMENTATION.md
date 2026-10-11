# Frontend implementation report

Status: implemented. Input contracts: `docs/implementation-handoff.md` API v1 and `docs/ui-handoff.md` v1. Owner: actual Codex frontend child agent. Isolated branch: `codex/platform-frontend`.

## Delivered behavior

- Chinese React/Vite portal with responsive navy sidebar, light canvas, teal actions, mobile navigation, accessible dialogs and toast feedback.
- Password login and session validation. Bearer token is kept in `sessionStorage`; 401 invalidates the session. UI controls follow ADMIN / TESTER / DEVELOPER / VIEWER roles; backend remains the authority.
- Dashboard metrics and trend derive exclusively from `/api/dashboard`; empty workspaces show actionable first-run guidance.
- Case create/edit/delete, structured step validation, real revision history and explicit human approval. Editing saves DRAFT, never auto-approves.
- Plan create/edit/delete, approved-case selection, capability matching, timeouts, sensitive-case local routing and real run submission.
- Execution polling, cancellation, result steps/errors, resource fingerprint, logs, authenticated evidence previews/downloads, JUnit XML and Allure JSON download.
- Real device/Agent states with empty states. Admin resource status/tags management, trusted-resource guidance, one-time Agent key display with Bash/PowerShell setup commands, and revocation.
- Actual settings/integration states, admin user creation and operation audit.
- Loading, empty, error, disabled and success feedback throughout. Failed forms preserve entered values. Destructive actions require inline confirmation.

## Runtime and deployment

`npm ci`, `npm run dev`, `npm run build`. Vite development proxies `/api` and `/ws` to `http://localhost:8080`; `PLATFORM_API_URL` overrides the development target. Production defaults to same-origin `/api`. Optional `VITE_API_BASE_URL` is a backend **origin**, without `/api`, configured at build time. Never place credentials into VITE variables.

Hash routes work on Codespaces and static serving without deep-link fallback. Execution report URL: `https://<platform>/#/runs/<id>`. Production root must proxy `/api` and `/ws` to backend and serve `dist` assets; root coordinator owns deployment.

## Verification evidence

- `npm install`: successful; 67 packages audited, 0 vulnerabilities reported at implementation time.
- `npm run build`: successful with Vite 6.4.4, 1,589 modules transformed.
- `npm test`: 4 tests passed (authoring roles, authenticated evidence origin isolation, executable structured step validation, capability tag normalization).

API integration, browser screenshots/responsive review, complete real execution and deployment are pending root integration and independent acceptance. This report does not claim those checks passed. No fabricated run results, device feeds, model integrations or cost figures were added.

## Independent acceptance fix: case approval revision race

Approval POST now carries the revision of the case content displayed in the review dialog. Missing or invalid revisions are blocked. HTTP 409 invalidates the previous confirmation and disables approval until the reviewer explicitly refreshes the case, inspects its latest content and checks the human confirmation again. Refresh never submits approval or changes draft content. API errors retain HTTP status for this conflict handling. The backend is responsible for an atomic compare-and-approve transaction.

Validation for this fix: `npm test` 5/5 passed; `npm run build` passed. Browser/API race verification remains for root independent acceptance.
