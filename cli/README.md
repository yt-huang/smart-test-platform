# Platform CLI

Requires Node 22+. Run `npm ci`, then `node src/index.js run --suite smoke --platform web --junit smoke.xml` or `node src/index.js run --plan PLAN_ID`. Use `npm link` locally to expose the `platform` command.

Set `PLATFORM_URL` to the reachable platform root and `PLATFORM_TOKEN` to a bearer token from `/api/auth/login`. Tokens and passwords are never printed. Suite selection uses approved cases only; mixed-platform suites require `--platform` or a capability-specific plan. Browser selection defaults to Chromium for web suites.

The CLI submits a stored run, polls terminal status, prints `/#/runs/ID` for the portal report, and optionally exports the platform's JUnit XML. `--timeout` sets the client polling deadline (default 900 seconds), independently of the plan's server execution timeout; the platform run remains active when the client deadline expires. `--poll-interval` defaults to 1000 milliseconds. `--name`, `--commit` and `GITHUB_SHA` provide run metadata.

Exit 0 means PASSED, exit 1 means FAILED/TIMED_OUT/CANCELLED or polling deadline, exit 2 means malformed configuration, authentication/API or export failure. `npm test` covers these exits, draft filtering, polling, authorization headers and JUnit export.
