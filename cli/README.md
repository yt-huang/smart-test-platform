# Platform CLI

Requires Node 22+. Run `npm ci`, then `node src/index.js run --suite smoke --platform web --junit smoke.xml` or `node src/index.js run --plan PLAN_ID`. Use `npm link` locally to expose the `platform` command.

Run a stored Web plan across browsers with `platform matrix --plan PLAN_ID --browsers chromium,firefox --junit matrix.xml`. Add WebKit with `--browsers chromium,firefox,webkit`. The matrix command trims browser names and removes duplicates, then requires at least two distinct names from `chromium`, `firefox`, and `webkit`. Browser names are case-sensitive; empty list entries are invalid. Matrix accepts `--plan` and `--browsers`, and rejects `--suite`, `--browser`, and `--platform`. The platform validates the plan and inherits its other capability requirements.

Set `PLATFORM_URL` to the reachable platform root and `PLATFORM_TOKEN` to a bearer token from `/api/auth/login`. Tokens and passwords are never printed. Suite selection uses approved cases only; mixed-platform suites require `--platform` or a capability-specific plan. Browser selection defaults to Chromium for web suites.

`PLATFORM_URL` must use HTTP(S) and contain no embedded credentials, query, or fragment. Authenticated requests reject redirects; configure the final platform root directly. Error details and target messages redact the configured token, bearer values, embedded URL credentials, and common secret assignments.

The CLI submits a stored run, polls terminal status, prints `/#/runs/ID` for the portal report, and optionally exports the platform's JUnit XML. `--timeout` sets the client polling deadline (default 900 seconds), independently of the plan's server execution timeout; the platform run remains active when the client deadline expires. `--poll-interval` defaults to 1000 milliseconds. `--name`, `--commit` and `GITHUB_SHA` provide run metadata.

Matrix execution prints `/#/matrices/ID` plus each target's status, passed/failed/total counts, message when supplied, and original run report URL. It polls until every target reaches a terminal state and rejects inconsistent aggregate results as API errors. `--junit` downloads the aggregate XML only after completion, including failure or cancellation. The same timeout, polling, name, commit and GitHub metadata options apply; a client wait timeout leaves the remote matrix active and sends no cancellation request.

Exit 0 means PASSED (every browser target PASSED for matrix), exit 1 means FAILED/TIMED_OUT/CANCELLED or polling deadline, exit 2 means malformed configuration, authentication/API or export failure. `npm test` covers these exits, draft filtering, polling, authorization headers, matrix validation and JUnit export, credential redaction, and a real cross-origin HTTP redirect rejection.
