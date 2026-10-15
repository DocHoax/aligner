# Alignify Readiness Gate Checklist

**Status:** IMPLEMENTATION IN PROGRESS — not release approval
**Updated:** 2026-10-15

Use this checklist with [BASELINE.md](BASELINE.md) and the bounded commands in [STAGING-AND-ROLLBACK.md](STAGING-AND-ROLLBACK.md). Source implementation, offline execution, database integration, and operational readiness are distinct claims. Check an execution item only after recording actual evidence.

## Implementation review

### Test-database boundary

- [ ] All live PostgreSQL tests acquire storage through `testdb.Open`, using only `TEST_DATABASE_URL` with no application/default target.
- [ ] Missing URL skips; unsafe/malformed URLs fail before connection; explicit connection/setup failures fail rather than skip.
- [ ] URL parsing validates scheme, loopback host, database name, port, query encoding/options/duplicates, and rejects target/schema overrides.
- [ ] Diagnostics contain no credentials or full URLs.
- [ ] Effective database verification precedes DDL; unique short quoted schemas and exclusive DSN-level search paths cover the entire pool.
- [ ] Resource acquisition registers cleanup for success and partial failure; cleanup uses a fresh bounded context and never drops another test's schema.
- [ ] Every rollback test checks exact `TEST_DATABASE_ALLOW_ROLLBACK=1` before setup, without bypassing URL validation.
- [ ] Offline tests assert helper skip/failure behavior without failing their own runner, relying on live ports, or overwriting operator integration URLs.

### Startup and migration behavior

- [ ] Shared configuration validation runs before storage allocation, preserving `ENVIRONMENT`/`ENV` precedence and normalization.
- [ ] Staging/production require a secure JWT secret and application `DATABASE_URL`, with no memory fallback.
- [ ] Development/test permit memory when the URL is absent or connection fails, without requiring migrations.
- [ ] Connected PostgreSQL requires successful migration resolution/execution and handler construction before listening; errors close acquired storage exactly once.
- [ ] Construction reuses the validated configuration; no second environment load or duplicate migration-inventory implementation.
- [ ] Migration preflight rejects invalid/empty forward inventory before database access.
- [ ] Forward migration creates absent metadata; rollback with absent metadata is a no-op before directory inspection; real metadata-query errors propagate.
- [ ] The migration cycle includes genuinely consecutive rollback calls and schema-scoped assertions.

## Local execution evidence

Run only after the database-entry-point audit above. Use the runbook's cleared database environment and cached-dependency controls; stop on failure.

- [ ] Changed Go files are formatted and the final diff has been reviewed.
- [ ] `go build -mod=readonly ./...` succeeds in the collaboration module.
- [ ] `go vet -mod=readonly ./...` succeeds.
- [ ] Focused helper/startup/configuration/inventory tests execute successfully without PostgreSQL.
- [ ] Full Go suite executes successfully without PostgreSQL; skipped test names are recorded separately.
- [ ] Health/readiness behavior is exercised through request recorders; preparation tests do not start the application listener.
- [ ] Revision, working-tree state, toolchain, commands, outcomes, and limitations are recorded in the baseline.

## Disposable PostgreSQL execution evidence

**Pending separately approved infrastructure.** Never use an application database, existing Compose volume, or production target.

- [ ] PostgreSQL 16 is newly provisioned with loopback-only exposure, test-named database, disposable credentials, and ephemeral storage.
- [ ] Helper tests prove multi-connection isolation and independently observed schema cleanup, including partial initialization failure.
- [ ] Opted-in forward/idempotence/rollback/no-op/reapply cycle passes with exact metadata and schema assertions.
- [ ] Missing/malformed metadata, closed pool, and invalid rollback-directory regressions execute and pass.
- [ ] PostgreSQL API/auth/WebSocket/recovery integration coverage actually executes, not skips.
- [ ] Only the created disposable instance is torn down; database evidence is recorded independently from offline checks.
- [ ] Race tests run with a supported CGO/compiler toolchain, or are explicitly recorded as unrun.

## Other gates remain separate

JavaScript/Angular lint, tests, typechecking, production build, and browser E2E are not covered by the Go-only increment. Neither offline nor isolated PostgreSQL success establishes deployed startup, production recovery, performance benchmarks, secure operational configuration, or organizational approval.

Historical audit/report language is superseded by the current baseline's evidence status. A source-level check, a log match, an old cache, or a passing suite with skipped integrations must not be presented as release readiness.
