## ADDED Requirements

### Requirement: Proven recovery verification
The verifier SHALL require a real completed passing run and nonempty downloaded evidence before creating a baseline, and SHALL reject lost baseline records, changed evidence bytes, invalid snapshots, or resources that do not recover after restart.

#### Scenario: Successful service restart
- **WHEN** PostgreSQL, the central service and the Agent restart after a valid baseline
- **THEN** checking the snapshot verifies retained records and SHA-256 evidence integrity and confirms the same resource returns to IDLE

#### Scenario: Evidence changes without size changes
- **WHEN** a stored evidence file is replaced by different bytes with the same length
- **THEN** checking the snapshot fails with a nonzero exit status

#### Scenario: Empty deployment lacks proof
- **WHEN** baseline is requested without a real passing report and its evidence
- **THEN** verification fails clearly instead of reporting a successful recovery

### Requirement: Complete record retention
The verifier SHALL retain every baseline case, plan and run identifier, including records outside the passing report. Additional records SHALL be allowed.

#### Scenario: Unselected record disappears
- **WHEN** an original case, plan or nonpassing run disappears after the baseline
- **THEN** checking the snapshot fails even if the selected passing report is intact

### Requirement: Resource identity recovery
Recovery SHALL require the same device and Agent identifiers, with the device IDLE and Agent ONLINE.

#### Scenario: Offline Agent cannot prove recovery
- **WHEN** the baseline device reports IDLE but its Agent is OFFLINE
- **THEN** checking the snapshot fails after the bounded recovery wait

### Requirement: Credential-safe verification
Snapshots and command output MUST NOT include passwords or bearer credentials. Authenticated requests SHALL reject unexpected redirects and cross-origin evidence URLs before credentials can be sent to another origin.

#### Scenario: Redirected evidence does not receive credentials
- **WHEN** a report references another origin or an authenticated endpoint redirects to another origin
- **THEN** verification rejects the request without sending a bearer credential to that origin
