# Alignify Production Readiness Baseline

**Status:** IMPLEMENTATION IN PROGRESS — not a release approval  
**Updated:** 2026-10-15

## Purpose

Track reproducible evidence for local safety gates separately from database integration, deployment, and operational readiness. The current increment repairs Go startup preparation and the PostgreSQL test harness. Historical security/performance reports are not evidence that this revision is ready for production.

## Gate contracts

### Startup preparation

- Normalize and validate configuration before allocating storage. `ENVIRONMENT` takes precedence over `ENV`; a blank primary value falls back to the alias. The default is development.
- Staging/production reject missing, short, or development JWT secrets and require an explicit application `DATABASE_URL`. A failed PostgreSQL connection is fatal.
- Development/test may use memory when `DATABASE_URL` is absent or a connection attempt fails. Memory startup does not require migration files.
- After PostgreSQL connects, migration-directory resolution, migration execution, and server construction must all succeed before listening. Failure closes acquired storage; it never triggers memory fallback.
- Reuse the already validated configuration when constructing the server. Connection diagnostics must not expose connection URLs or credentials.

### PostgreSQL tests

- `testdb.Open` reads only `TEST_DATABASE_URL`. No application/default database fallback is permitted.
- Missing test URL skips database-dependent coverage. Unsafe or malformed explicit targets fail before connecting; connection/setup failures fail rather than skip.
- Accept only `postgres://` URLs with explicit localhost/127.0.0.1, database `alignify_test` or `alignify_test_<suffix>`, and validated `sslmode`/`connect_timeout` options.
- Verify the effective database before DDL. Each store gets a short, unique, quoted schema and a pool-wide search path without `public` fallback.
- Test cleanup owns pool closure and schema removal, including partial setup failures. Closing a store alone does not remove its schema.
- Every rollback test additionally requires exactly `TEST_DATABASE_ALLOW_ROLLBACK=1`; that permission never bypasses target validation.

### Migration behavior

Forward migration validates the entire nonempty SQL inventory before database metadata access. It creates missing tracking metadata and treats only `sql.ErrNoRows` as an unapplied version. Rollback resolves metadata through the active search path: absent metadata is an intentional no-op **before** directory inspection. When metadata exists, missing/empty rollback directories and metadata-query errors must fail. Existing per-file transactions are retained.

## Verification status

| Gate | Evidence for the current working tree |
|---|---|
| Go build and vet | Pending execution after implementation |
| Offline startup/configuration/helper/inventory regression tests | Pending execution after the database-path safety audit |
| Full Go suite without PostgreSQL | Pending; database-dependent skips will be reported separately |
| PostgreSQL isolation, cleanup, migration/rollback/reapply, API/WebSocket integration | Pending disposable PostgreSQL 16 infrastructure |
| JavaScript/Angular lint, tests, typechecking, production build | Not executed by this Go-focused increment |
| Browser E2E, deployment, operational recovery, performance, organizational approval | Not established; outside this increment |

Do not change a row to passed based on source inspection, the existence of a test, historical caches, or a successful run that skipped its required infrastructure.

## Reproduce local Go checks

Use Go 1.26 or newer (the module declares 1.26). From the repository root in Bash/Git Bash, run the bounded sequence in [STAGING-AND-ROLLBACK.md](STAGING-AND-ROLLBACK.md#local-go-verification-no-postgresql).

The sequence clears application/test database variables, uses local cached dependencies without modifying module files, and runs build, vet, focused tests, then the complete suite. Missing cached dependencies are a prerequisite failure, not a reason to claim success or silently change dependencies. Database-dependent tests must explicitly skip while offline tests actually execute.

JavaScript verification remains a separate gate. Its existing commands are `npm run build:packages`, `npm run typecheck`, `npm run lint`, `npm test`, and `npm run build`, after dependencies have been intentionally provisioned. Build packages before typechecking; existing generated output must not be mistaken for clean-checkout reproducibility.

## Database rehearsal and evidence

Follow the separately authorized disposable-instance procedure in [STAGING-AND-ROLLBACK.md](STAGING-AND-ROLLBACK.md#disposable-postgresql-rehearsal-operator-action). Never reuse an application database or existing Compose volume. The rehearsal proves test/schema and migration behavior, not a deployed staging environment or production recovery.

Record:

- Date/time, checkout revision, and whether verification includes uncommitted changes.
- Toolchain and exact command/environment controls, excluding secrets.
- Exit status, executed test names/counts, skipped coverage, and blockers.
- Separate results for local tests and database-backed execution.

### Current environment observation

Planning observed Go `go1.27.1 windows/amd64`. Docker CLI was available, but its Linux daemon was unavailable; no `psql` executable was found. This is an environment observation, not build/test evidence. PostgreSQL-backed verification remains pending unless that prerequisite changes through an approved operator action.

## Next steps

1. Finish the startup and test-harness repairs and inspect all database-test entry points before running tests.
2. Execute the local Go gate and record actual results; surface unrelated failures without weakening tests.
3. Perform the disposable PostgreSQL rehearsal when approved infrastructure is available.
4. Address frontend/lint and operational gates separately. No current result implies release approval.
