package testdb

import (
	"context"
	"database/sql"
	"errors"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/lib/pq"

	"alignify/collaboration/pkg/storage"
)

// recordingReporter records how the wrapper's reporter methods were used.
// Fatal messages are matched against the credential-safe sentinel only; fatal
// calls abort like testing.TB.Fatalf by panicking with their own sentinel. All
// reported strings are fixed literals, so no credentials can leak into them.
type recordingReporter struct {
	fatalf     []string
	errorf     []string
	cleanups   []func()
	skipped    bool
	broadcasts []string
}

func (r *recordingReporter) Helper() {}

func (r *recordingReporter) Skip(args ...any) {
	r.skipped = true
	panic(skipSentinel{args})
}

func (r *recordingReporter) Fatalf(format string, args ...any) {
	r.fatalf = append(r.fatalf, format)
	panic(fatalSentinel{format})
}

func (r *recordingReporter) Errorf(format string, args ...any) {
	r.errorf = append(r.errorf, format)
}

func (r *recordingReporter) Cleanup(fn func()) {
	r.cleanups = append(r.cleanups, fn)
}

func (r *recordingReporter) broadcast(format string, args ...any) {
	line := format
	if len(args) > 0 {
		line = format + " " + strings.Repeat("%v ", len(args))
	}
	r.broadcasts = append(r.broadcasts, strings.TrimSpace(line))
}

type fatalSentinel struct{ message string }

type skipSentinel struct{ args []any }

// runOpen executes open() against a recording reporter and recovers the fatal
// and skip sentinels so the real test runner is never aborted. The registered
// cleanups run in reverse order, mirroring testing.TB.Cleanup.
func runOpen(env map[string]string, connect func(reporter, databaseTarget) (*storage.PostgresStorage, error)) (store *storage.PostgresStorage, r *recordingReporter, outcome any) {
	r = &recordingReporter{}
	for key, value := range env {
		os.Setenv(key, value)
	}
	defer func() {
		for _, key := range env {
			os.Unsetenv(key)
		}
	}()
	defer func() {
		for i := len(r.cleanups) - 1; i >= 0; i-- {
			r.cleanups[i]()
		}
	}()
	defer func() {
		outcome = recover()
	}()
	store = open(r, connect)
	return store, r, outcome
}

func TestOpen_MissingURLSkipsWithoutConnecting(t *testing.T) {
	store, r, outcome := runOpen(map[string]string{}, func(r reporter, target databaseTarget) (*storage.PostgresStorage, error) {
		t.Fatalf("establish should not run when TEST_DATABASE_URL is missing")
		return nil, errors.New("unreachable")
	})
	if store != nil {
		t.Fatalf("expected a nil store when TEST_DATABASE_URL is missing")
	}
	if outcome == nil {
		t.Fatalf("expected a skip sentinel to abort open")
	}
	if _, ok := outcome.(skipSentinel); !ok {
		t.Fatalf("expected a skip sentinel, got %T", outcome)
	}
	if !r.skipped {
		t.Fatalf("expected the reporter to record a skip")
	}
}

func TestOpen_InvalidURLFailsWithoutConnecting(t *testing.T) {
	store, r, outcome := runOpen(map[string]string{
		"TEST_DATABASE_URL": "postgres://testuser:testpass@example.com/alignify_test",
	}, func(r reporter, target databaseTarget) (*storage.PostgresStorage, error) {
		t.Fatalf("establish should not run for an invalid URL")
		return nil, errors.New("unreachable")
	})
	if store != nil {
		t.Fatalf("expected a nil store for an invalid URL")
	}
	if outcome == nil {
		t.Fatalf("expected a fatal sentinel to abort open")
	}
	if _, ok := outcome.(fatalSentinel); !ok {
		t.Fatalf("expected a fatal sentinel, got %T", outcome)
	}
	if len(r.fatalf) != 1 {
		t.Fatalf("expected exactly one fatal message, got %d: %v", len(r.fatalf), r.fatalf)
	}
	for _, msg := range r.fatalf {
		for _, needle := range []string{"testpass", "example.com", "alignify_test"} {
			if strings.Contains(msg, needle) {
				t.Errorf("fatal message %q leaked %q", msg, needle)
			}
		}
	}
}

func TestOpen_ConnectFailureFailsAndReportsSafely(t *testing.T) {
	store, r, outcome := runOpen(map[string]string{
		"TEST_DATABASE_URL": "postgres://testuser:testpass@127.0.0.1:5432/alignify_test?sslmode=disable",
	}, func(r reporter, target databaseTarget) (*storage.PostgresStorage, error) {
		return nil, errors.New("connection refused: 127.0.0.1:5432 testpass")
	})
	if store != nil {
		t.Fatalf("expected a nil store after a connect failure")
	}
	if outcome == nil {
		t.Fatalf("expected a fatal sentinel to abort open")
	}
	if _, ok := outcome.(fatalSentinel); !ok {
		t.Fatalf("expected a fatal sentinel, got %T", outcome)
	}
	for _, msg := range r.fatalf {
		for _, needle := range []string{"testpass", "refused", "5432", "127.0.0.1"} {
			if strings.Contains(msg, needle) {
				t.Errorf("fatal message %q leaked raw connection details %q", msg, needle)
			}
		}
	}
}

func TestRequireRollback_Offline(t *testing.T) {
	r := &recordingReporter{}
	os.Unsetenv("TEST_DATABASE_ALLOW_ROLLBACK")
	func() {
		defer func() {
			if outcome := recover(); outcome != nil {
				if _, ok := outcome.(skipSentinel); !ok {
					t.Fatalf("expected a skip sentinel, got %T", outcome)
				}
			}
		}()
		requireRollback(r)
	}()
	if !r.skipped {
		t.Fatalf("requireRollback should skip when TEST_DATABASE_ALLOW_ROLLBACK is not set")
	}

	r2 := &recordingReporter{}
	os.Setenv("TEST_DATABASE_ALLOW_ROLLBACK", "1")
	defer os.Unsetenv("TEST_DATABASE_ALLOW_ROLLBACK")
	requireRollback(r2)
	if r2.skipped {
		t.Fatalf("requireRollback should not skip when TEST_DATABASE_ALLOW_ROLLBACK is 1")
	}
}

// ---------------------------------------------------------------------------
// Optional integration coverage: these tests exercise real PostgreSQL and only
// run when an explicit TEST_DATABASE_URL is supplied. They skip offline.
// ---------------------------------------------------------------------------

func TestValidateURL_OfflineValidation(t *testing.T) {
	valid := "postgres://testuser:testpass@127.0.0.1:5432/alignify_test?sslmode=disable"
	target, err := validateURL(valid)
	if err != nil {
		t.Fatalf("validateURL(%q) returned error: %v", valid, err)
	}
	if target.database != "alignify_test" {
		t.Fatalf("expected database alignify_test, got %q", target.database)
	}
	if got := target.url.Host; got != "127.0.0.1:5432" {
		t.Fatalf("expected host 127.0.0.1:5432, got %q", got)
	}
	if !target.url.Query().Has("sslmode") || !target.url.Query().Has("connect_timeout") {
		t.Fatalf("expected explicit sslmode and connect_timeout options in the target DSN")
	}
}

func TestValidateURL_NeverConnects(t *testing.T) {
	cases := map[string][]string{
		"missing":  {},
		"empty":    {""},
		"bad":      {"postgres://testuser:testpass@:0alignify_test"},
		"scheme":   {"mysql://testuser:testpass@127.0.0.1/alignify_test"},
		"schempgq": {"postgresql://testuser:testpass@127.0.0.1/alignify_test"},
		"remote":   {"postgres://testuser:testpass@example.com/alignify_test"},
		"ipv6h":    {"postgres://testuser:testpass@[::1]:5432/alignify_test"},
		"fragment": {"postgres://testuser:testpass@127.0.0.1:5432/alignify_test#frag"},
		"opaque":   {"postgres:testuser:testpass@127.0.0.1/alignify_test"},
		"nopath":   {"postgres://testuser:testpass@127.0.0.1:5432"},
		"dbname":   {"postgres://testuser:testpass@127.0.0.1/alignify"},
		"dbsuf":    {"postgres://testuser:testpass@127.0.0.1/alignify_test/abc"},
		"dupp":     {"postgres://testuser:testpass@127.0.0.1:5432/alignify_test?sslmode=disable&connect_timeout=5&connect_timeout=4"},
		"opt":      {"postgres://testuser:testpass@127.0.0.1:5432/alignify_test?sslmode=disable&options=-c+search_path%3Dpublic"},
		"sslhost":  {"postgres://testuser:testpass@127.0.0.1:5432/alignify_test?sslmode=disable&host=localhost"},
		"to":       {"postgres://testuser:testpass@127.0.0.1:5432/alignify_test?connect_timeout=15"},
		"box":      {"postgres://testuser:testpass@127.0.0.1:5432/alignify_test?sslmode=disable&timeout=5"},
		"zerot":    {"postgres://testuser:testpass@127.0.0.1:5432/alignify_test?connect_timeout=0"},
		"badt":     {"postgres://testuser:testpass@127.0.0.1:5432/alignify_test?connect_timeout=abc"},
		"range":    {"postgres://testuser:testpass@127.0.0.1:5432/alignify_test?sslmode=disable&connect_timeout=31"},
	}
	for name, urls := range cases {
		for _, raw := range urls {
			if raw == "" {
				continue
			}
			if _, err := validateURL(raw); err == nil {
				t.Errorf("%s: validateURL(%q) unexpectedly accepted the URL", name, raw)
			}
		}
	}
}

func TestValidateURL_Defaults(t *testing.T) {
	target, err := validateURL("postgres://testuser:testpass@localhost/alignify_test_abc")
	if err != nil {
		t.Fatalf("validateURL returned error: %v", err)
	}
	if target.url.Host != "localhost:5432" {
		t.Fatalf("expected default port 5432, got %q", target.url.Host)
	}
	if got := target.url.Query().Get("sslmode"); got != "require" {
		t.Fatalf("expected default sslmode require, got %q", got)
	}
	if got := target.url.Query().Get("connect_timeout"); got != "5" {
		t.Fatalf("expected default connect_timeout 5, got %q", got)
	}
}

func TestValidateURL_RedactsCredentials(t *testing.T) {
	for _, raw := range []string{
		"postgres://user:supersecret@example.com/alignify_test",
		"postgres://invalid:pass@127.0.0.1:5432/alignify?sslmode=disable",
		"postgres://user:supersecret@127.0.0.1:5432/alignify_test?sslmode=disable&secret=value",
	} {
		_, err := validateURL(raw)
		if err == nil {
			t.Fatalf("validateURL(%q) unexpectedly accepted the URL", raw)
		}
		for _, needle := range []string{"supersecret", "example.com", "secret", "value", "alignify", "invalid"} {
			if strings.Contains(err.Error(), needle) {
				t.Errorf("validateURL(%q) leaked %q in error: %v", raw, needle, err)
			}
		}
	}
}

// testStore opens a real isolated store, skipping when TEST_DATABASE_URL is
// absent. Other environment variables that could change the target or cleanup
// policy are explicitly cleared so the test only ever uses the supplied URL.
func testStore(t testing.TB) *storage.PostgresStorage {
	os.Unsetenv("TEST_DATABASE_ALLOW_ROLLBACK")
	os.Unsetenv("DATABASE_URL")
	return Open(t)
}

func TestOpen_Integration_EffectiveDatabaseAndSchema(t *testing.T) {
	store := testStore(t)
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	var currentDatabase string
	if err := store.DB().QueryRowContext(ctx, `SELECT pg_catalog.current_database()`).Scan(&currentDatabase); err != nil {
		t.Fatalf("failed to read current_database(): %v", err)
	}
	if currentDatabase != "alignify_test" {
		t.Fatalf("expected effective database alignify_test, got %q", currentDatabase)
	}
}

func TestOpen_Integration_TwoStoresUseExclusiveSchemas(t *testing.T) {
	store1 := testStore(t)
	store2 := testStore(t)
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	var searchPath1, searchPath2 string
	for _, probe := range []struct {
		db   *sql.DB
		dest *string
	}{
		{store1.DB(), &searchPath1},
		{store2.DB(), &searchPath2},
	} {
		if err := probe.db.QueryRowContext(ctx, `SHOW search_path`).Scan(probe.dest); err != nil {
			t.Fatalf("failed to read search_path: %v", err)
		}
	}
	if searchPath1 == searchPath2 {
		t.Fatalf("expected exclusive search paths for independent stores, both were %q", searchPath1)
	}
	if !strings.HasPrefix(searchPath1, "\"alignify_it_") || !strings.HasPrefix(searchPath2, "\"alignify_it_") {
		t.Fatalf("expected quoted random schema search paths, got %q and %q", searchPath1, searchPath2)
	}
}

func TestOpen_Integration_SearchPathIsExclusiveOnEveryPoolConnection(t *testing.T) {
	store := testStore(t)
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	queries := make(chan string, 8)
	errs := make(chan error, 8)
	results := make(chan string, 8)
	for i := 0; i < 8; i++ {
		go func() {
			var searchPath, schema string
			err := store.DB().QueryRowContext(ctx,
				`SELECT pg_catalog.current_setting('search_path'), pg_catalog.current_schema()`).Scan(&searchPath, &schema)
			queries <- searchPath
			errs <- err
			results <- schema
		}()
	}
	for i := 0; i < 8; i++ {
		searchPath, schema, err := <-queries, <-results, <-errs
		if err != nil {
			t.Fatalf("concurrent pool query failed: %v", err)
		}
		if searchPath != schema {
			t.Fatalf("expected every pooled connection to use its exclusive search_path, got %q vs current schema %q", searchPath, schema)
		}
	}
}

// TestOpen_Integration_CrossSchemaIsolation creates a table in one store's
// exclusive schema and proves another store cannot see it.
func TestOpen_Integration_CrossSchemaIsolation(t *testing.T) {
	store1 := testStore(t)
	store2 := testStore(t)
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if _, err := store1.DB().ExecContext(ctx, `CREATE TABLE isolation_probe (id INT)`); err != nil {
		t.Fatalf("failed to create table in first store: %v", err)
	}
	if _, err := store2.DB().ExecContext(ctx, `SELECT 1 FROM isolation_probe`); err == nil {
		t.Fatalf("second store unexpectedly saw the first store's table")
	} else {
		var isUndefinedTable bool
		if strings.Contains(err.Error(), "does not exist") {
			isUndefinedTable = true
		} else if pqErr, ok := err.(*pq.Error); ok && pqErr.Code == "42P01" {
			isUndefinedTable = true
		}
		if !isUndefinedTable {
			t.Fatalf("expected an undefined-table error, got: %v", err)
		}
	}
}

// TestOpen_Integration_SchemaCleanupProvenAfterChildSubtests opens a store,
// derives its schema, runs a child subtest, and proves that a separate
// surviving observer connection sees the schema removed after the child ends.
func TestOpen_Integration_SchemaCleanupProvenAfterChildSubtests(t *testing.T) {
	store := testStore(t)
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	var searchPath string
	if err := store.DB().QueryRowContext(ctx, `SHOW search_path`).Scan(&searchPath); err != nil {
		t.Fatalf("failed to read search_path: %v", err)
	}
	schema := strings.Trim(searchPath, `"`)
	observer, err := sql.Open("postgres", store.SchemaDSNForTest())
	if err != nil {
		t.Fatalf("failed to open observer pool: %v", err)
	}
	defer observer.Close()
	observer.SetMaxOpenConns(1)

	t.Run("child", func(t *testing.T) {
		if _, err := store.DB().ExecContext(ctx, `CREATE TABLE cleanup_probe (id INT)`); err != nil {
			t.Fatalf("failed to create table in child subtest: %v", err)
		}
	})

	deadline := time.Now().Add(10 * time.Second)
	for {
		existsCtx, existsCancel := context.WithTimeout(context.Background(), 5*time.Second)
		var exists bool
		err := observer.QueryRowContext(existsCtx, `SELECT EXISTS(SELECT 1 FROM pg_catalog.pg_namespace WHERE nspname = $1)`, schema).Scan(&exists)
		existsCancel()
		if err != nil {
			t.Fatalf("observer failed to inspect schema presence: %v", err)
		}
		if !exists {
			break
		}
		if time.Now().After(deadline) {
			t.Fatalf("schema %s was not cleaned up after the child subtest ended", schema)
		}
		time.Sleep(100 * time.Millisecond)
	}
}

// TestOpen_Integration_PartialSetupFailureDropsSchema uses an injectable opener
// that fails after the schema is created, then proves a surviving observer no
// longer sees that schema once Open's cleanup has run.
func TestOpen_Integration_PartialSetupFailureDropsSchema(t *testing.T) {
	raw := os.Getenv("TEST_DATABASE_URL")
	if raw == "" {
		t.Skip("TEST_DATABASE_URL not set; skipping PostgreSQL integration test")
	}
	target, err := validateURL(raw)
	if err != nil {
		t.Skipf("TEST_DATABASE_URL rejected by the validator: %v", err)
	}
	var createdSchema string
	schemaCreated := make(chan string, 1)
	store, r, outcome := runOpen(map[string]string{
		"TEST_DATABASE_URL": raw,
	}, func(r reporter, target databaseTarget) (*storage.PostgresStorage, error) {
		schema, err := newSchemaName()
		if err != nil {
			return nil, err
		}
		createdSchema = schema
		bootstrap, err := sql.Open("postgres", target.url.String())
		if err != nil {
			return nil, err
		}
		defer bootstrap.Close()
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		if _, err := bootstrap.ExecContext(ctx, `CREATE SCHEMA `+pq.QuoteIdentifier(schema)); err != nil {
			return nil, err
		}
		schemaCreated <- schema
		return nil, errors.New("injected failure after schema creation")
	})
	if store != nil {
		t.Fatalf("expected a nil store after the injected failure")
	}
	if outcome == nil {
		t.Fatalf("expected a fatal sentinel to abort open")
	}
	if _, ok := outcome.(fatalSentinel); !ok {
		t.Fatalf("expected a fatal sentinel, got %T", outcome)
	}
	schema := <-schemaCreated

	observer, err := sql.Open("postgres", target.url.String())
	if err != nil {
		t.Fatalf("failed to open observer pool: %v", err)
	}
	defer observer.Close()
	observer.SetMaxOpenConns(1)

	// runOpen already ran the cleanups before returning, so the schema must be
	// gone by the time the observer polls.
	deadline := time.Now().Add(10 * time.Second)
	for {
		existsCtx, existsCancel := context.WithTimeout(context.Background(), 5*time.Second)
		var exists bool
		err := observer.QueryRowContext(existsCtx, `SELECT EXISTS(SELECT 1 FROM pg_catalog.pg_namespace WHERE nspname = $1)`, schema).Scan(&exists)
		existsCancel()
		if err != nil {
			t.Fatalf("observer failed to inspect schema presence: %v", err)
		}
		if !exists {
			break
		}
		if time.Now().After(deadline) {
			t.Fatalf("schema %s survived the injected partial setup failure", schema)
		}
		time.Sleep(100 * time.Millisecond)
	}
}
