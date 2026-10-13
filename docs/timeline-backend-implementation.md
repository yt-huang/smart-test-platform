# Evidence timeline backend — implementation record

Status: **implemented**. Independent acceptance, integrated runtime checks, PostgreSQL process restart, and real browser playback remain the coordinator's separate acceptance work.

## Execution identity and input

- Executor: real Codex child agent `/root/timeline_backend`, launched through the available `collaboration.spawn_agent` tool. Provider: OpenAI; the concrete model alias is not exposed by the child-agent runtime and is recorded as unknown. This execution is not Kimi.
- Absolute work directory: `C:/Users/admin/.codex/worktrees/platform-backend/ai-test`.
- Branch: `codex/timeline-backend`.
- Input commit: `921b5d0fa5ae5b26d210d8c5e2ed87ebb1792575`.
- Implementation commit: `8ed21963da97a39419b0f20a756af7d40cfc5594`.
- Contract: `openspec/changes/archive/2026-10-13-add-evidence-timeline/design.md`, Contract v1, and `specs/evidence-timeline/spec.md` at the input commit.
- Write ownership: `backend/src/main/java`, `backend/src/test/java`, and this report. Agent, frontend, CLI, specification, and other execution reports were not modified.

## Implemented behavior

`POST /api/agent/evidence` accepts the optional multipart string field `capture`. The existing three-argument service method delegates to the new optional-metadata path, preserving callers that omit metadata. Capture is validated before opening the file stream, copying bytes, saving its index, or auditing an upload. JSON must be an object, contain at most 4000 characters, and supply complete `startedAt` and `finishedAt` strings with valid ISO offsets. Source strings are preserved unchanged; comparisons use their instants. Unknown fields are discarded. No timestamp is derived from upload `createdAt`, duration, or server time.

The allowed capture kinds are `screenshot`, `video`, `trace`, and `log`. MIME families are image, video, and text respectively; trace accepts `application/zip` or `application/x-zip-compressed`. Wildcard or invalid MIME types are rejected. Screenshots, video, and trace require a case from the task's immutable `_cases` approval snapshot. Logs may omit the case or use an owned case. Intervals must be ordered and lie within the inclusive assignment-minus-five-minutes to validation-time-plus-five-minutes clock window.

Done results and steps accept optional complete `timing` objects. Explicit null, non-object, incomplete, invalid-offset, reversed, or out-of-window timing is rejected. Step timing requires and fits within case timing. All results and related envelope fields are validated before results, summary, logs, completion facts, quality, or lease state are written. Captured evidence references retain the stored metadata and cannot cross cases; screenshot/video/trace intervals must fit case timing when it exists. Shared or scoped logs may span the case interval.

Metadata persists through the existing JSON document store and is exposed in `run.results`, `step.timing`, and `evidence.capture`. Untimed historical results and evidence remain untimed. The original and gate JUnit formats are unchanged, and valid late timing does not alter a terminal frozen gate. Existing authenticated evidence delivery and VIEWER read access are retained. A failed evidence-index transaction also removes the copied, uncommitted file.

## Actual checks and output

Execution used Microsoft OpenJDK `21.0.12.1+1-LTS` from `D:/code/ai-test/tools/java/jdk-21.0.12.1+1`, and Maven `D:/code/ai-test/tools/java/apache-maven-3.9.9/bin/mvn.cmd`. No server was started and port 8080 or user processes were not changed.

From the absolute backend directory:

```powershell
$env:JAVA_HOME='D:/code/ai-test/tools/java/jdk-21.0.12.1+1'
$env:PATH="$env:JAVA_HOME/bin;$env:PATH"
& 'D:/code/ai-test/tools/java/apache-maven-3.9.9/bin/mvn.cmd' verify
```

The first actual attempt exited **1** during test compilation: a test's overridden `getInputStream` lacked the declared IOException. That signature was corrected; unchecked map conversions were also replaced with typed reads. The second actual attempt exited **0**, `BUILD SUCCESS`, finishing at `2026-10-12T07:58:44+08:00` (`2026-10-11T23:58:44Z`), in 25.901 seconds.

| Actual suite | Tests | Failures | Errors | Skipped |
| --- | ---: | ---: | ---: | ---: |
| GateIntegrationTest | 18 | 0 | 0 | 0 |
| MatrixIntegrationTest | 21 | 0 | 0 | 0 |
| PlatformIntegrationTest | 17 | 0 | 0 | 0 |
| TimelineIntegrationTest | 15 | 0 | 0 | 0 |
| Total | **71** | **0** | **0** | **0** |

The original 56 tests were retained and passed. The 15 new protocol/API tests check the multipart path, immutable snapshot ownership, source-offset preservation, ignored fields, malformed/oversized capture without opening bytes, invalid intervals and clock windows without files or indexes, MIME/case rejection, copied-file rollback, whole-done atomic rejection, step nesting, cross-case evidence denial, capture containment, spanning logs, three-argument legacy uploads without synthetic times, JUnit byte parity, and terminal gate freezing. They also check H2 document reload with preserved media SHA-256, anonymous evidence 401, authenticated VIEWER evidence 200, and VIEWER mutation 403.

Actual Surefire artifacts are in the worktree's ignored `backend/target/surefire-reports/` directory. `git diff --check` exited **0** before the implementation commit. The implementation commit command exited **0**.

## Limits

The new tests use explicit protocol boundary fixtures, MockMvc, and H2; their byte payloads are not playable browser media. Calling `initialize()` and re-reading documents tests service reload behavior, not a PostgreSQL or host-process restart. Real Chromium/Firefox execution, video metadata and seek behavior, portal interaction, deployed Codespaces restart, and independent acceptance are not claimed here. Invalid messages through the actual WebSocket may trigger the existing socket close/resource cleanup behavior; the direct service fixtures specifically verify absence of partial result/summary/log/quality writes.
