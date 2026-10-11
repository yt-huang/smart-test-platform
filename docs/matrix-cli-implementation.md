# Matrix CLI implementation

Status: implemented; independent acceptance and integrated backend/browser execution are owned by the coordinator.

- Executor: Codex native child agent `/root/matrix_cli`; provider/runtime: Codex collaboration tools. Exact model metadata was not exposed to this task.
- Input commit: `86724c5f2a7ade2c035216e626f46a6cb33a63d3`.
- Work directory: `C:/Users/admin/.codex/worktrees/platform-runtime/ai-test`.
- Branch: `codex/matrix-cli`.
- Allowed changes: `cli/` and this report only.
- Contract: `openspec/changes/add-browser-regression-matrix/design.md` (REST/CLI v1) and `specs/browser-regression-matrix/spec.md`.

`platform matrix --plan ID --browsers chromium,firefox[,webkit]` now validates and deduplicates browser selections, creates the matrix using browser-only capabilities so other plan requirements remain inherited, and polls the stable matrix ID. Output includes the matrix portal URL and each target's current status, real summary counts, message and run URL. API details must provide the requested distinct targets and summaries. A terminal aggregate must agree with all target terminal states and the specified failure/cancellation precedence before returning success or exporting XML. Invalid API details return exit 2.

Common options retain `--junit`, `--timeout`, `--poll-interval`, `--name`, `--commit`, `PLATFORM_URL`, `PLATFORM_TOKEN`, and `GITHUB_SHA`. Matrix rejects suite/single-browser/platform options, and run rejects `--browsers`. Run selectors and approved-case filtering remain covered by the original tests. A wait timeout returns exit 1 without cancellation or active-state XML download.

Shared API requests use `redirect: error`, and also reject redirect responses from injected transports. The platform root rejects non-HTTP(S), embedded credentials, queries and fragments. Transport failures omit arbitrary transport messages; API errors and target messages redact known token values, Bearer values, URL credentials and common secret assignments. The real HTTP test records authorization at the source while proving zero requests reach a second origin.

Validation commands and actual results:

- `npm test --prefix cli` with system Node `v22.11.0`, npm `10.9.0`: exit 0; 18 tests passed, 0 failed, including final implementation.
- `C:/Users/admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe --test cli/test/*.test.js` with bundled Node `v24.19.0`: exit 0; 18 tests passed, 0 failed.
- `git diff --check`: exit 0. Git reported only existing Windows line-ending conversion notices.
- `node cli/src/index.js --help`: exit 0; both run and matrix command forms printed.

This report is committed together with the implementation; the commit SHA is returned through the agent handoff so it does not create a self-referential commit field.

Test coverage includes mixed PASSED/FAILED, PASSED/TIMED_OUT and PASSED/CANCELLED results; partial progress; polling deadline; all-pass and failure terminal XML exports; export errors; invalid options before any API call; malformed/inconsistent matrix responses; run compatibility; URL/token validation; credential redaction; and a real cross-origin redirect.

Not verified here: matrix endpoints against the final backend, real browser agent runs, deployment, or the final integrated branch. No push, deployment, or credential configuration read was performed.
