# Alignify Startup and Rollback Verification

**Status:** IMPLEMENTATION IN PROGRESS — execution evidence is tracked separately  
**Updated:** 2026-10-15

This runbook verifies local startup policy and isolated database tests. It does not deploy Alignify, establish production readiness, or authorize using an existing database. See [BASELINE.md](BASELINE.md) for current results and [RELEASE-CHECKLIST.md](RELEASE-CHECKLIST.md) for acceptance criteria.

## Safety boundaries

- Application startup reads `DATABASE_URL`; integration tests read only `TEST_DATABASE_URL`. The latter never configures a running application.
- Development/test permit memory storage when the application URL is absent or its connection fails. Staging/production require explicit PostgreSQL and secure JWT configuration.
- Configuration validation precedes storage allocation. Once PostgreSQL connects, migration or construction failures are fatal in every environment. Listening begins only after successful preparation.
- `testdb.Open` accepts only validated, explicit loopback, test-named PostgreSQL targets. Missing test URL means skip; invalid/unreachable explicit targets mean failure. Never substitute `DATABASE_URL` or hard-coded integration credentials inside tests.
- Each store receives an exclusive schema in its pool's connection string. Effective database verification precedes DDL. Cleanup closes the store, drops only that test's schema with a fresh timeout, and closes bootstrap.
- Rollback execution additionally requires `TEST_DATABASE_ALLOW_ROLLBACK=1`. This never waives target validation.
- No full database URLs, passwords, or raw credential-bearing connector errors should appear in diagnostics or recorded evidence.

**Before the first test run after repairing this gate:** inspect every direct PostgreSQL test connection and `RunRollbacks` call. Every live test store must come from the validated helper, and every rollback test must check the exact opt-in before setup. The historical migration-cycle test had an application-database fallback; merely unsetting environment variables was not safe with that implementation.

## Local Go verification (no PostgreSQL)

Run from the repository root in Bash/Git Bash, after the implementation and static database-path audit. Go 1.26+ and cached module dependencies are required. This sequence does not provision infrastructure, install dependencies, update module files, or launch the application listener.

```bash
(
  unset DATABASE_URL TEST_DATABASE_URL TEST_DATABASE_ALLOW_ROLLBACK
  unset JWT_SECRET ALLOWED_ORIGINS
  export ENVIRONMENT=test ENV=test GOTOOLCHAIN=local GOPROXY=off

  go -C apps/collaboration build -mod=readonly ./... &&
  go -C apps/collaboration vet -mod=readonly ./... &&
  go -C apps/collaboration test -mod=readonly -count=1 -timeout=2m -v ./internal/testdb &&
  go -C apps/collaboration test -mod=readonly -count=1 -timeout=5m -v . ./pkg/server ./pkg/storage &&
  go -C apps/collaboration test -mod=readonly -count=1 -timeout=5m -v ./...
)
```

Stop on failure and keep the actual exit status. Missing cached dependencies are a prerequisite blocker. Do not pipe output through a log search and treat matching text as test success.

Expected coverage:

- Real environment loading, precedence/normalization, and configuration-before-resource ordering.
- Development/test memory behavior and fail-closed staging/production preparation.
- Fatal migration/construction failures, resource ownership, and configuration reuse.
- `/health` and `/readyz` using request recorders, without the application listener.
- Pure test-URL validation, credential-safe diagnostics, wrapper skip/failure behavior, exact rollback opt-in, and forward SQL-inventory preflight.
- Other existing infrastructure-free tests; test-owned loopback HTTP/WebSocket servers may run.

Database-dependent tests should explicitly skip because `TEST_DATABASE_URL` is absent. A successful command containing those skips is **not** a successful PostgreSQL rehearsal. Valid-URL unit cases must parse only; connection-failure tests use injected failures rather than connecting to an assumed unused port.

Do not use `go run | grep` to check startup: it can inherit an application database, hang on successful startup, obscure process exit status, or fail on JWT validation before reaching the intended assertion. Deterministic preparation tests cover these cases without database access or a listener.

## Disposable PostgreSQL rehearsal (operator action)

**Not run as part of offline verification. Requires separate approval and a working Docker daemon.** The example can download the PostgreSQL 16 image if absent. It creates a new disposable server with test-only credentials, loopback exposure, and temporary storage; never substitute an existing development/production server or Compose volume. The fixed host port must be free.

From the repository root in Bash/Git Bash:

```bash
(
  container_id=$(MSYS_NO_PATHCONV=1 docker run --rm --detach \
    --publish 127.0.0.1:55432:5432 \
    --tmpfs /var/lib/postgresql/data:rw \
    --env POSTGRES_DB=alignify_test \
    --env POSTGRES_USER=alignify_test \
    --env POSTGRES_PASSWORD=disposable_test_only \
    postgres:16) || exit 1
  trap 'docker stop "$container_id" >/dev/null' EXIT

  ready=0
  for attempt in {1..30}; do
    if docker exec "$container_id" pg_isready \
      --username=alignify_test --dbname=alignify_test >/dev/null 2>&1; then
      ready=1
      break
    fi
    sleep 1
  done
  if [ "$ready" != 1 ]; then
    printf '%s\n' 'Disposable PostgreSQL did not become ready.' >&2
    exit 1
  fi

  unset DATABASE_URL TEST_DATABASE_ALLOW_ROLLBACK JWT_SECRET ALLOWED_ORIGINS
  export ENVIRONMENT=test ENV=test GOTOOLCHAIN=local GOPROXY=off
  export TEST_DATABASE_URL='postgres://alignify_test:disposable_test_only@127.0.0.1:55432/alignify_test?sslmode=disable&connect_timeout=5'

  # Prove the helper boundary without permission to invoke migration rollback.
  go -C apps/collaboration test -mod=readonly -count=1 -timeout=5m -v ./internal/testdb || exit 1

  # Only this new disposable target is authorized for the rollback cycle.
  export TEST_DATABASE_ALLOW_ROLLBACK=1
  go -C apps/collaboration test -mod=readonly -count=1 -timeout=5m -v ./pkg/storage &&
  go -C apps/collaboration test -mod=readonly -count=1 -timeout=10m -v ./...
)
```

The trap stops only the container created by this invocation; `--rm` removes it and its temporary database storage. Do not replace it with a broad container/volume cleanup command. If the shell or Docker crashes, use the recorded container ID to inspect and clean up that specific disposable instance.

Git Bash may translate Linux-style Docker arguments on Windows. If that occurs, use the environment-specific Docker invocation recommended for your shell; preserve loopback publication and ephemeral storage. Do not work around an unavailable daemon by pointing tests at an application database.

### What the database run must prove

- Actual database and pool-level schema match the validated target; multiple simultaneously acquired connections preserve isolation.
- Separate stores cannot see each other's test tables. An independent observer confirms schema removal after successful and failed child setup while its own schema survives.
- Forward migration inventory and tracking match; repeated forward application is idempotent.
- Forward → rollback → immediate repeated rollback → reapply restores the expected schema, including `boards.thumbnail_url`, and a user create/read operation works.
- Missing tracking metadata bootstraps forward migration and makes rollback a no-op. Malformed metadata and closed pools produce real errors.
- Missing/empty rollback directories fail when tracking metadata exists. Absent metadata intentionally returns before directory inspection.
- Existing PostgreSQL API/auth/WebSocket/recovery integration tests execute rather than skip. These are test-harness integrations, not proof of a deployed process restart or production failover.

Race testing may be run separately only when a working CGO/compiler toolchain is available; report it as unrun otherwise.

## Evidence and status

For each run, record the date/time, checkout revision plus working-tree state, Go version, exact command and nonsecret environment controls, exit status, executed/skipped coverage, and blockers in [BASELINE.md](BASELINE.md). Keep database-backed results distinct from offline results.

Planning observed an unavailable Docker Linux daemon. Until the disposable rehearsal actually executes, its status remains **pending**. Deployment, browser E2E, performance benchmarking, production recovery exercises, secrets/TLS configuration, and organizational approval remain separate gates.
