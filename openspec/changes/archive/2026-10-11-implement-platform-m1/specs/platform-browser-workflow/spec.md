# Platform browser workflow

## ADDED Requirements

### Requirement: Reviewed cases and persistent plans
The platform SHALL persist cases, revision history and plans in a workspace-scoped database. Draft cases MUST NOT enter execution until an authenticated user explicitly approves them.

#### Scenario: Review gate blocks drafts
- **WHEN** a user submits a run containing an unapproved case
- **THEN** the platform rejects the run with a clear error without assigning a resource

#### Scenario: Another editor changes reviewed content
- **WHEN** a reviewer submits approval for a revision that another editor has changed
- **THEN** approval returns HTTP 409, leaves the current case as a draft and requires explicit review of its current revision

### Requirement: Actual isolated browser execution
An outbound authenticated Agent SHALL execute approved structured Playwright steps in an isolated browser context and return actual verdicts, errors and evidence. Unsupported mobile and model dependencies MUST be identified explicitly.

#### Scenario: Browser assertion failure
- **WHEN** an expected value does not match the tested page
- **THEN** the run fails and its report contains the assertion error and collected evidence

### Requirement: Scheduling and resource recovery
The platform SHALL match capability declarations, maintain priority/FIFO queue order, enforce queue/execution timeouts and leases, and require verified cleanup before a resource returns to idle.

#### Scenario: No compatible resource
- **WHEN** no resource satisfies a run's capabilities until its queue deadline
- **THEN** the run becomes timed out without claiming an execution occurred

#### Scenario: Browser version contains numeric components
- **WHEN** a Chromium resource reports version `156.0.8078.4` and a run requires version `>=1`
- **THEN** the platform compares numeric version components and considers the version requirement satisfied

#### Scenario: Equal priority queue uses chronological time
- **WHEN** equal-priority runs have creation timestamps with different fractional-second precision
- **THEN** the earlier instant is assigned first regardless of its timestamp's textual representation

### Requirement: Authenticated evidence and role enforcement
The platform SHALL require authentication for reports and evidence and SHALL enforce the ADMIN, TESTER, DEVELOPER and VIEWER role matrix on mutations. Agent evidence uploads MUST belong to its assigned run.

#### Scenario: Viewer cannot submit work
- **WHEN** a VIEWER sends a run or AgentKey creation request
- **THEN** the request is rejected with HTTP 403 and no execution or credential is created

### Requirement: Codespaces deployment
The integrated application SHALL be published to the configured GitHub repository and deployed in a Codespace with a forwarded portal port, PostgreSQL persistence and a real browser Agent.

#### Scenario: Owner accesses portal
- **WHEN** the Codespace is running and its owner follows the forwarded port URL
- **THEN** GitHub access checks and platform login allow the owner to use the portal and inspect actual execution reports
