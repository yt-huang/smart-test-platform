## ADDED Requirements

### Requirement: Proven recovery verification
The verifier SHALL require a real completed passing run and nonempty downloaded evidence before creating a baseline, and SHALL reject lost baseline records, changed evidence bytes, invalid snapshots, or resources that do not recover after restart. Snapshots and command output MUST NOT include passwords or bearer credentials.

#### Scenario: Successful service restart
- **WHEN** PostgreSQL, the central service and the Agent restart after a valid baseline
- **THEN** checking the snapshot verifies retained records and SHA-256 evidence integrity and confirms the same resource returns to IDLE

#### Scenario: Evidence changes without size changes
- **WHEN** a stored evidence file is replaced by different bytes with the same length
- **THEN** checking the snapshot fails with a nonzero exit status

#### Scenario: Empty deployment lacks proof
- **WHEN** baseline is requested without a real passing report and its evidence
- **THEN** verification fails clearly instead of reporting a successful recovery
