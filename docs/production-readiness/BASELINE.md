# Alignify Production Readiness Verification Plan

**Document ID:** ALIGNIFY-PROD-BASE-002  
**Date:** 2026-10-14  
**Version:** 0.1.0  
**Phase:** Implementation of Production Readiness Gates  
**Target:** Establish verifiable production readiness baseline  
**Status:** IMPLEMENTATION IN PROGRESS  

---

## Overview

This document outlines the implementation of production readiness verification gates for Alignify. It separates historical assertions from current verification efforts and documents the specific gates being implemented to make production readiness safe and verifiable.

**Note:** This document tracks work in progress. Actual verification results will be recorded as gates are implemented and executed.

---

## Implemented Verification Gates

### 1. Isolated PostgreSQL Test Gates
**Implementation:** Added isolated database test helpers in `apps/collaboration/internal/testdb/`
- **Variables:** `TEST_DATABASE_URL` (required for PostgreSQL tests)
- **Isolation:** Schema-per-test approach with explicit search_path configuration
- **Validation:** 
  - Only accepts PostgreSQL URLs with loopback host (127.0.0.1/localhost)
  - Database name must match `alignify_test` or `alignify_test_<suffix>`
  - Only allows `sslmode` and `connect_timeout` query options
- **Rollback Opt-in:** `TEST_DATABASE_ALLOW_ROLLBACK=1` required for destructive migration tests
- **Failure Behavior:** Malformed URLs, connection failures, or migration failures cause test failures (not skips)

**Verification Method:** 
```bash
env -u DATABASE_URL TEST_DATABASE_URL='postgres://postgres:postgres@127.0.0.1:5432/alignify_test?sslmode=disable' TEST_DATABASE_ALLOW_ROLLBACK=1 go -C apps/collaboration test -count=1 -v ./...
```

### 2. Fail-Closed Startup Gates
**Implementation:** Modified startup sequence in `apps/collaboration/main.go`
- **Configuration Validation:** 
  - Occurs before any database connection attempts
  - Requires explicit `DATABASE_URL` in staging/production environments
  - Rejects missing, short (<32 chars), or development JWT secrets in staging/production
- **Storage Fallback Policy:**
  - Development/test: Memory fallback allowed only on PostgreSQL connection failure
  - Staging/production: No fallback; connection failure is fatal
- **Migration Validation:**
  - Missing/empty migration directories are fatal in all environments
  - Migration failure prevents server startup
- **Error Handling:** 
  - No raw database URL logging to prevent credential exposure
  - Configuration validation errors returned before DB connection attempts

**Verification Method:** 
```bash
# Should fail with missing DATABASE_URL in staging
env ENVIRONMENT=staging go -C apps/collaboration run .

# Should fail with short JWT secret in staging
env ENVIRONMENT=staging JWT_SECRET=short go -C apps/collaboration run .

# Should allow memory fallback in dev on connection failure
env ENVIRONMENT=development go -C apps/collaboration run .
```

### 3. Lint Gate Restoration
**Implementation:** Added ESLint 9 with typescript-eslint 8 and Angular ESLint 19
- **Dependencies:** 
  - `eslint@^9.0.0`
  - `@typescript-eslint/parser@^8.0.0`
  - `@typescript-eslint/eslint-plugin@^8.0.0`
  - `@angular-eslint/eslint-plugin@^19.0.0`
  - `@angular-eslint/template-parser@^19.0.0`
- **Configuration:** `eslint.config.mjs` with correctness-focused baseline
- **Execution:** `npm run lint` fails on warnings (`--max-warnings=0`)
- **Rules:** 
  - TypeScript: strict-null-checks, no-floating-promises, consistent-type-exports, etc.
  - Angular template: banana-in-box, negated-async expressions, etc.
  - General: no-duplicate-class-members, no-unreachable, no-constant-binary-expression, etc.

**Verification Method:** 
```bash
npm run lint
```

---

## Verification Requirements

### Go Prerequisite
- **Minimum Version:** Go 1.26.0 (updated from previous 1.22+ requirement)
- **Reason:** Leverages newer SQL features and security improvements

### Test Execution
**Local Verification (No PostgreSQL Required):**
```bash
# Build packages and run type checking
npm ci
npm run build:packages
npm run typecheck

# Run JS/TS tests
npm test

# Run Go tests (will skip PostgreSQL without TEST_DATABASE_URL)
env -u DATABASE_URL -u TEST_DATABASE_URL -u TEST_DATABASE_ALLOW_ROLLBACK \
  go -C apps/collaboration test -count=1 -v ./...
go -C apps/collaboration vet ./...
```

**PostgreSQL-Backed Validation (Requires Disposable Instance):**
```bash
# Requires explicitly disposable PostgreSQL 16 instance
# Do NOT use existing development databases or Compose volumes
env -u DATABASE_URL \
  TEST_DATABASE_URL='postgres://postgres:postgres@127.0.0.1:5432/alignify_test?sslmode=disable' \
  TEST_DATABASE_ALLOW_ROLLBACK=1 \
  go -C apps/collaboration test -count=1 -v ./...

# With race detection (if CGO available)
env -u DATABASE_URL \
  TEST_DATABASE_URL='postgres://postgres:postgres@127.0.0.1:5432/alignify_test?sslmode=disable' \
  TEST_DATABASE_ALLOW_ROLLBACK=1 \
  CGO_ENABLED=1 go -C apps/collaboration test -race -count=1 ./...
```

---

## Blockers and Implementation Status

### Completed
- [x] Isolated PostgreSQL test helpers with validation
- [x] Fail-closed startup sequence with configuration-first validation
- [x] ESLint 9 configuration with correctness baseline
- [x] Updated migration functions to fail on empty directories
- [x] Removed configuration fallbacks in security validation

### In Progress
- [ ] Full test suite execution with new gates
- [ ] Documentation updates for all verification requirements
- [ ] Dependency lockfile stabilization after ESLint additions

### Not Started
- [ ] Disposable PostgreSQL validation (requires infrastructure)
- [ ] Performance benchmarking (deferred to later phase)
- [ ] Deployment verification (out of scope for readiness gates)

---

## Verification Artifacts

As gates are implemented and verified, this document will be updated with:
- **Checkout/Revision:** Git commit hash of verified state
- **Commands:** Exact verification commands used
- **Toolchain:** Versions of all tools used (Go, Node, npm, etc.)
- **Actual Results:** Pass/fail status of each verification gate
- **Skipped Coverage:** Any intentionally skipped tests with justification
- **Tilskuere:** Blockers preventing verification completion

**Important:** This document does not infer live deployment status, fabricate approvals, or claim benchmarks that have not been run. Release readiness is considered unverified until all gates actually execute successfully.

---

## Next Steps

1. Execute verification gates in local environment (no PostgreSQL required)
2. Address any failures discovered during verification
3. Update documentation with actual verification results
4. Prepare for PostgreSQL-backed validation when infrastructure becomes available
5. Remove historical assertions as current verification evidence accumulates

*This document will be updated as verification progresses.*