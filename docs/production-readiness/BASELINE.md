# Alignify Production Readiness Baseline

**Status:** BASELINE REPAIRED — not a release approval

**Updated:** 2026-10-23

## Purpose

Track reproducible evidence for local safety gates separately from deployment and
operational readiness. The current increment repairs Go test-harness compilation,
PostgreSQL integration coverage, and the ESLint gate. Historical security/performance
reports are not evidence that this revision is ready for production.

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

Evidence recorded 2026-10-23 on Windows with Go 1.27.1, Node 24.19.0, and PostgreSQL 16 in a
disposable local cluster. No application or production database was contacted.

| Gate | Evidence for the current working tree |
|---|---|
| Go build and vet | Passed: `go build ./...`, `go vet ./...` (exit 0) |
| Offline Go suite | Passed: `go test -count=1 ./...` with no `TEST_DATABASE_URL`; 75 tests passed, 10 PostgreSQL/rollback tests skipped |
| PostgreSQL-backed Go suite | Passed: `go test -count=1 ./...` against a disposable PostgreSQL 16 cluster; 85 tests passed, 0 skipped, 0 failed |
| Schema and data isolation | Passed: two stores use distinct quoted schemas; every pooled connection uses its exclusive `search_path`; zero `alignify_it_%` schemas and zero `public` tables remained after the suite |
| Migration, rollback, reapply | Passed: `TestPostgresStorage_MigrationAndRollbackCycle`, metadata bootstrap, malformed metadata, closed-pool, and invalid-inventory tests |
| Snapshot recovery and sequencing | Passed: compaction every 50 operations, reconnect catch-up from snapshot plus deltas, monotonic sequence/ack flow, multi-client jitter, and live end-to-end integration |
| JavaScript/Angular typecheck | Passed: `npm run typecheck` (all three build tsconfigs) |
| Package and frontend tests | Passed: 51 package tests and 28 Angular tests |
| ESLint | Passed: `npm run lint` with `--max-warnings=0`; configuration and deferred strict rules documented in [LINT-BASELINE.md](LINT-BASELINE.md) |
| Production build | Passed: `npm run build` (packages plus Angular production bundle) |
| Browser E2E, deployment, operational recovery, performance, organizational approval | Not established; outside this increment |

Do not change a row to passed based on source inspection, the existence of a test, historical caches, or a successful run that skipped its required infrastructure. Rows above record commands that were executed; skipped database coverage is called out separately.

## Reproduce local checks

From the repository root:

```bash
npm run typecheck
npm run test:packages
npm --workspace=apps/web run test:ci
npm run lint
npm run build

cd apps/collaboration
go build ./...
go vet ./...
go test -count=1 ./...          # offline: database tests skip
```

For PostgreSQL-backed verification, create a **disposable** cluster (do not use an
application database) and run:

```bash
export TEST_DATABASE_URL='postgres://postgres@127.0.0.1:55432/alignify_test?sslmode=disable&connect_timeout=5'
export TEST_DATABASE_ALLOW_ROLLBACK=1
unset DATABASE_URL
cd apps/collaboration && go test -count=1 ./...
```

The test helper requires a localhost `postgres://` URL whose database is `alignify_test` or
`alignify_test_<suffix>`, creates a unique schema per store, and drops it during cleanup.
Verify cleanup afterwards:

```sql
SELECT count(*) FROM pg_namespace WHERE nspname LIKE 'alignify_it_%';
SELECT count(*) FROM pg_tables WHERE schemaname = 'public';
```

Both counts must be zero. The disposable cluster used for this evidence was removed after
verification.

## Database rehearsal and evidence

Follow the separately authorized disposable-instance procedure in [STAGING-AND-ROLLBACK.md](STAGING-AND-ROLLBACK.md#disposable-postgresql-rehearsal-operator-action). Never reuse an application database or existing Compose volume. The rehearsal proves test/schema and migration behavior, not a deployed staging environment or production recovery.

Record:

- Date/time, checkout revision, and whether verification includes uncommitted changes.
- Toolchain and exact command/environment controls, excluding secrets.
- Exit status, executed test names/counts, skipped coverage, and blockers.
- Separate results for local tests and database-backed execution.

### Current environment observation

Go `go1.27.1 windows/amd64`, Node `v24.19.0`, and PostgreSQL 16 binaries were available. The
Docker daemon was unavailable, so a trust-authenticated disposable cluster was created with
the installed PostgreSQL 16 binaries on port 55432, not the system service on port 5432. It
was stopped and deleted after the suite.

## Next steps

1. Keep the runnable gates green and record any new skips rather than silent passes.
2. Reduce the deferred strict-rule debt described in [LINT-BASELINE.md](LINT-BASELINE.md)
   incrementally, starting with new or substantially modified files.
3. Repeat disposable PostgreSQL verification after schema, migration, or persistence changes.
4. Address browser E2E, deployment, and operational gates separately. No current result
   implies release approval.
