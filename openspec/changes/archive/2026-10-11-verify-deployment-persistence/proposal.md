## Why
The Codespaces deployment has passed a manual database/service restart check. A repeatable check is needed to verify retained records and evidence integrity without exposing credentials or confusing an empty deployment with a proven recovery.

## What Changes
Add a credential-safe Node CLI for baseline/check persistence verification, meaningful failure tests, and actual Kimi implementation evidence. Application APIs remain unchanged. The coordinator runs it against the real PostgreSQL Codespaces deployment.
