# Alignify Staging & Rollback Verification Gates

**Document ID:** ALIGNIFY-STAGING-ROLLBACK-002  
**Version:** 0.1.0  
**Date:** 2026-10-14  
**Status:** IMPLEMENTATION IN PROGRESS  

---

## Overview

This document describes the implementation of staging and rollback verification gates for Alignify. It focuses on the specific safety mechanisms implemented to make staging verification and rollback procedures safe and verifiable, rather than claiming operational deployment status.

**Note:** This document tracks work in progress. Actual verification results will be recorded as gates are implemented and executed.

---

## Implemented Safety Gates

### 1. Fail-Closed Staging/Production Startup
**Implementation:** Modified startup sequence to require explicit configuration and fail fast on missing requirements
- **DATABASE_URL Requirement:** Explicit `DATABASE_URL` mandatory in staging/production; no fallback to default application database
- **Configuration Validation:** 
  - Occurs before any database connection attempts
  - Rejects missing, short (<32 chars), or development JWT secrets in staging/production
  - Uses shared validation in `normalizeAndValidateServerConfig()`
- **Connection Failure Handling:**
  - Staging/Production: PostgreSQL connection failure is fatal (no memory fallback)
  - Development/Test: Memory fallback allowed only on explicit connection failure
- **Migration Validation:**
  - Missing/empty migration directories are fatal before listener startup
  - Migration failure prevents server initialization
  - Uses `sql.ErrNoRows` distinction correctly for migration inspection

### 2. Isolated PostgreSQL Testing
**Implementation:** Added isolated database test helpers to prevent accidental data loss
- **Test Connection Protocol:**
  - Reads **only** `TEST_DATABASE_URL`; no fallback to `DATABASE_URL` or application defaults
  - Missing test URL explicitly skips PostgreSQL tests with explanation
  - Malformed, unsafe, or unreachable targets cause test failures (not skips)
  - Validates target before connecting: accepts only loopback host and test-named database (`alignify_test` or `alignify_test_<suffix>`)
- **Schema Isolation:**
  - Creates one uniquely named, quoted schema per test inside disposable database
  - Configures exclusive `search_path` in connection string before opening test pool
  - No public fallback; relies solely on test schema
  - Registers bounded cleanup: close test pool → drop schema → close bootstrap connection
- **Rollback Safety:**
  - Requires `TEST_DATABASE_ALLOW_ROLLBACK=1` before destructive migration tests
  - This opt-in never bypasses target validation in `testdb.Open()`
- **Error Prevention:**
  - Never includes credentials/full URLs in diagnostics or error messages
  - Connection/migration failures cause test failure, not silent skipping

### 3. Migration Safety Verification
**Implementation:** Enhanced migration functions to prevent unsafe operations
- **RunMigrations:**
  - Validates forward migration directory and nonempty SQL inventory before creating metadata
  - Returns wrapped errors for failed metadata inspection
  - Only `sql.ErrNoRow` means "not applied"; all other errors returned with context
  - Missing/unreadable/empty migration directories cause failure
- **RunRollbacks:**
  - Resolves rollback metadata through active search path (uses `to_regclass` without hard-coded schema)
  - Returns metadata-query errors; only absent tracking table or `sql.ErrNoRows` for unapplied version is successful no-op
  - Missing/unreadable/empty rollback directories cause failure
  - Uses same `sql.ErrNoRows` distinction as RunMigrations

### 4. Lint Gate Restoration
**Implementation:** Added ESLint 9 configuration with correctness baseline
- Prevents merging code with static analysis warnings
- Enforces TypeScript and Angular template correctness checks
- Fails build on warnings via `--max-warnings=0`

---

## Verification Procedures

### Local Safety Verification (No Infrastructure Required)
These checks can be run in any development environment without external services:

```bash
# 1. Validate lint gate
npm run lint

# 2. Validate TypeScript compilation
npm run typecheck

# 3. Validate Go build
go -C apps/collaboration build ./...

# 4. Validate Go vet
go -C apps/collaboration vet ./...

# 5. Validate startup safety - should fail with missing DATABASE_URL in staging
env ENVIRONMENT=staging go -C apps/collaboration run . 2>&1 | grep -i "required"

# 6. Validate startup safety - should fail with short JWT secret in staging
env ENVIRONMENT=staging JWT_SECRET=short go -C apps/collaboration run . 2>&1 | grep -i "secret"

# 7. Validate startup safety - should allow memory fallback in dev on connection failure
env ENVIRONMENT=development go -C apps/collaboration run . 2>&1 | grep -i "using in-memory"

# 8. Validate test isolation - should skip PostgreSQL tests without TEST_DATABASE_URL
env -u DATABASE_URL -u TEST_DATABASE_URL -u TEST_DATABASE_ALLOW_ROLLBACK \
  go -C apps/collaboration test -count=1 -v ./... 2>&1 | grep -i "skipping"

# 9. Validate migration safety - should fail on empty migration directory
# (Requires creating temporary empty directory for testing)
```

### Staging-Verification Procedures (Requires Disposable Infrastructure)
**Important:** These procedures require an explicitly disposable PostgreSQL 16 instance. 
Do NOT use existing development databases, Compose volumes, or production systems.

```bash
# Requires provisioned disposable PostgreSQL 16 instance with:
# - Database: alignify_test
# - Host: 127.0.0.1 (loopback only for test isolation)
# - Credentials: disposable test credentials
# - No persistent data volumes

# 1. Full test suite with PostgreSQL isolation and rollback opt-in
env -u DATABASE_URL \
  TEST_DATABASE_URL='postgres://test_user:test_pass@127.0.0.1:5432/alignify_test?sslmode=disable' \
  TEST_DATABASE_ALLOW_ROLLBACK=1 \
  go -C apps/collaboration test -count=1 -v ./...

# 2. Verify schema isolation between parallel test executions
# (Automatically verified by testdb.Open() isolation tests)

# 3. Verify migration rollback safety
# (Automatically verified by TestPostgresStorage_MigrationAndRollbackCycle)

# 4. Validate fail-closed startup in staging environment
env -u DATABASE_URL \
  ENVIRONMENT=staging \
  TEST_DATABASE_URL='postgres://test_user:test_pass@127.0.0.1:5432/alignify_test?sslmode=disable' \
  TEST_DATABASE_ALLOW_ROLLBACK=1 \
  go -C apps/collaboration run . 2>&1 | grep -i "listening"

# 5. Validate that missing DATABASE_URL fails in staging
env -u DATABASE_URL \
  ENVIRONMENT=staging \
  go -C apps/collaboration run . 2>&1 | grep -i "required"
```

---

## Implementation Status

### Completed
- [x] Fail-closed startup sequence with configuration-first validation
- [x] Isolated PostgreSQL test helpers with schema protection
- [x] Enhanced migration functions with proper error handling
- [x] ESLint 9 configuration with correctness baseline
- [x] Removed dangerous fallbacks in configuration validation
- [x] Separated startup preparation from listening

### In Progress
- [ ] Documentation of exact verification procedures
- [ ] Creation of disposable PostgreSQL validation instructions
- [ ] Dependency verification after ESLint addition

### Not Applicable (by Design)
- [ ] Live deployment status claims (intentionally omitted)
- [ ] Infrastructure-as-code for production deployment (out of scope)
- [ ] Performance benchmarking (deferred to later phase)
- [ ] Organizational sign-off procedures (out of scope for technical gates)

---

## Key Safety Properties

### Test Isolation
- **Schema Per Test:** Each test gets unique schema in `alignify_test_*` database
- **No Cross-Test Contamination:** Schemas dropped immediately after test completion
- **No Public Fallback:** `search_path` limited to test schema only
- **Explicit Opt-in Required:** Destructive tests require `TEST_DATABASE_ALLOW_ROLLBACK=1`

### Startup Safety
- **Configuration First:** Validation occurs before resource allocation
- **No Silent Fallbacks:** Explicit configuration required for staging/production
- **Credential Protection:** No database URLs in logs or error messages
- **Defensive Defaults:** Development/test memory fallback only on explicit connection failure

### Migration Safety
- **Directory Validation:** Fails early on missing/empty migration directories
- **Metadata Safety:** Proper error handling for schema_migrations inspection
- **Search Path Consistency:** Uses active search path for metadata lookup
- **Atomicity:** Per-file transaction boundaries preserved

### Lint Safety
- **Correctness Focus:** Baseline rules prevent common programming errors
- **Template Checking:** Angular template syntax validated
- **Warning Equals Failure:** `--max-warnings=0` ensures clean lint state

---

## Verification Artifacts to Record

As verification procedures are executed, record:
- **Timestamp:** Date/time of verification execution
- **Instructions:** Exact commands or procedures followed
- **Environment:** Tool versions, configuration used, git commit hash
- **Results:** Pass/fail status for each verification procedure
- **Exceptions:** Any unexpected behaviors or errors encountered
- **Mitigations:** Actions taken to resolve verification failures

**Important:** This document does not:
- Claim live deployment status or operational readiness
- Fabricate approval timelines or sign-off dates  
- Infer performance characteristics from unverified benchmarks
- Suggest production deployment is imminent or recommended

Verification gates are considered successful only when the specified procedures execute successfully in the target environment. Release readiness assertions require successful execution of all verification procedures.

*This document will be updated as verification procedures are defined and executed.*