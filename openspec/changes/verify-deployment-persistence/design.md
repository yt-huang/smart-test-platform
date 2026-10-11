# Deployment verification

The verifier uses existing authenticated read APIs. Baseline must contain an actual PASSED execution with downloaded nonempty evidence. Store only record IDs, selected report metadata, evidence SHA-256 digests and resource identity in a versioned JSON snapshot; never store passwords or bearer tokens. Check retains baseline record IDs even when new records have been added, validates report/evidence integrity, and waits for the same Agent resource to become IDLE. Reject missing/unsupported snapshots and corrupted/missing artifacts with nonzero exit status. Configuration reuses PLATFORM_URL, PLATFORM_ADMIN_PASSWORD or the current working directory's ignored .env.

Kimi Code CLI is the implementation executor, verified alias kimi-code/kimi-for-coding through managed:kimi-code provider (type kimi, api.kimi.com). Codex coordinates independent review and cloud execution, then integrates checked changes.
