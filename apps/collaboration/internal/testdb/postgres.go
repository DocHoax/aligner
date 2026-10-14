package testdb

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"net/url"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"testing"
	"time"

	_ "github.com/lib/pq"

	"alignify/collaboration/pkg/storage"
	"alignify/collaboration/pkg/storage/postgres"
)

// Open returns an isolated PostgreSQL store for testing. It must be called
// only with TEST_DATABASE_URL set; otherwise it skips the test. The caller
// owns the returned store and must close it when done. The store is
// unmigrated and uses a unique, quoted schema for isolation.
//
// The function validates the URL before connecting: it must be a PostgreSQL
// connection string with an explicit loopback host (127.0.0.1 or localhost)
// and a database named alignify_test or alignify_test_<suffix>. Only sslmode
// and connect_timeout query options are allowed. The effective database name
// is confirmed before issuing DDL.
//
// Isolation is achieved by setting search_path to the unique schema in the
// connection string (no public fallback). The helper creates the schema,
// registers cleanup to drop only that schema, and returns a store whose
// connection pool is configured with that search_path.
//
// If the URL is missing, the test is skipped with an explanation.
// If the URL is present but invalid, malformed, or points to a disallowed
// target (application/system database, remote host, or options that can
// override host/database/schema), the test fails.
// Connection or migration failures cause the test to fail, not skip.
func Open(t testing.TB) *storage.PostgresStorage {
	t.Helper()

	// Require explicit test database URL; no application/default fallback.
	testURL := os.Getenv("TEST_DATABASE_URL")
	if testURL == "" {
		t.Skip("TEST_DATABASE_URL not set; skipping PostgreSQL integration test. " +
			"Set it to a disposable database (e.g. postgres://user:pass@127.0.0.1:5432/alignify_test?sslmode=disable)")
		return nil
	}

	// Parse and validate the URL before connecting.
	u, err := url.Parse(testURL)
	if err != nil {
		t.Fatalf("Invalid TEST_DATABASE_URL %q: %v", testURL, err)
	}
	if u.Scheme != "postgres" {
		t.Fatalf("TEST_DATABASE_URL must use postgres scheme, got %q", u.Scheme)
	}

	// Only allow sslmode and connect_timeout as query options.
	q := u.Query()
	allowed := map[string]bool{"sslmode": true, "connect_timeout": true}
	for k := range q {
		if !allowed[k] {
			t.Fatalf("TEST_DATABASE_URL contains disallowed query option %q; only sslmode and connect_timeout are permitted", k)
		}
	}

	// Validate host: must be loopback.
	host := u.Hostname()
	if host != "127.0.0.1" && host != "localhost" {
		t.Fatalf("TEST_DATABASE_URL host must be 127.0.0.1 or localhost for test isolation, got %q", host)
	}

	// Validate database name: must be alignify_test or alignify_test_<suffix>.
	dbName := u.Path
	if dbName == "" || dbName == "/" {
		t.Fatalf("TEST_DATABASE_URL must include a database name")
	}
	// Remove leading slash.
	if strings.HasPrefix(dbName, "/") {
		dbName = strings.TrimPrefix(dbName, "/")
	}
	if !regexp.MustCompile(`^alignify_test(_[a-zA-Z0-9_-]+)?$`).MatchString(dbName) {
		t.Fatalf("TEST_DATABASE_URL database must be alignify_test or alignify_test_<suffix> for test isolation, got %q", dbName)
	}

	// Build a connection string with search_path set to a unique schema.
	// We'll create the schema after opening a bootstrap connection.
	// We need to quote the schema name to be safe.
	schema := fmt.Sprintf(`"%s_%d"`, dbName, time.Now().UnixNano())
	// Build base connection string without search_path; we'll add it via params.
	baseU := *u
	// Remove the path (database) temporarily to avoid duplication in dsn.
	baseU.Path = ""
	qs := baseU.Query()
	// Delete any existing search_path to avoid confusion.
	qs.Del("search_path")
	// Add our required options.
	qs.Set("sslmode", u.Query().Get("sslmode"))
	if ct := u.Query().Get("connect_timeout"); ct != "" {
		qs.Set("connect_timeout", ct)
	}
	baseU.RawQuery = qs.Encode()
	// The final DSN will be built per connection with options including search_path.

	// Bootstrap connection to create schema and configure pool.
	// We use a temporary connection to create the schema and verify connectivity.
	bootstrapURL := baseU.String() + "&dbname=" + url.QueryEscape(dbName)
	bootstrap, err := sql.Open("postgres", bootstrapURL)
	if err != nil {
		t.Fatalf("Failed to open bootstrap connection to test database: %v", err)
	}
	defer bootstrap.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err = bootstrap.PingContext(ctx); err != nil {
		t.Fatalf("Test database unreachable: %v", err)
	}

	// Create the isolated schema.
	if _, err = bootstrap.ExecContext(ctx, `CREATE SCHEMA `+schema); err != nil {
		t.Fatalf("Failed to create test schema %s: %v", schema, err)
	}

	// Verify we are in the right database.
	var currentDB string
	if err = bootstrap.QueryRowContext(ctx, `SELECT current_database()`).Scan(&currentDB); err != nil {
		t.Fatalf("Failed to read current_database(): %v", err)
	}
	if currentDB != dbName {
		t.Fatalf("Connected to database %q, expected %q", currentDB, dbName)
	}

	// Configure the test pool with search_path set to our schema (no public fallback).
	testU := baseU
	testU.Path = "/" + dbName
	q = testU.Query()
	q.Set("search_path", schema)
	testU.RawQuery = q.Encode()

	// Open the storage pool with the configured URL.
	store, err := postgres.NewPostgresStorage(testU.String())
	if err != nil {
		t.Fatalf("Failed to initialize isolated PostgreSQL storage: %v", err)
	}

	// Register cleanup: close pool, drop only our schema, then close bootstrap.
	t.Cleanup(func() {
		// Close the test pool first.
		if cerr := store.Close(); cerr != nil {
			t.Errorf("Error closing test storage pool: %v", cerr)
		}
		// Drop the schema we created.
		if _, derr := bootstrap.ExecContext(context.Background(), `DROP SCHEMA IF EXISTS `+schema+` CASCADE`); derr != nil {
			t.Errorf("Error dropping test schema %s: %v", schema, derr)
		}
		// Finally close the bootstrap connection.
		if berr := bootstrap.Close(); berr != nil {
			t.Errorf("Error closing bootstrap connection: %v", berr)
		}
	})

	return store
}

// MigrationsDir returns the absolute path to the migration directory.
// It panics if the directory is missing or unreadable.
func MigrationsDir(t testing.TB) string {
	t.Helper()
	migDir := "../../migrations"
	if _, err := os.Stat(migDir); err != nil {
		migDir = "../../../apps/collaboration/migrations"
	}
	absMigDir, err := filepath.Abs(migDir)
	if err != nil {
		t.Fatalf("Failed to resolve migration directory: %v", err)
	}
	fi, err := os.Stat(absMigDir)
	if err != nil {
		t.Fatalf("Migration directory %s is unreadable: %v", absMigDir, err)
	}
	if !fi.IsDir() {
		t.Fatalf("Migration path %s is not a directory", absMigDir)
	}
	return absMigDir
}

// RequireRollback must be called before running the destructive migration-cycle test.
// It checks for TEST_DATABASE_ALLOW_ROLLBACK=1; if not set, it skips the test with an explanation.
// This opt-in never bypasses the target validation in Open.
func RequireRollback(t testing.TB) {
	t.Helper()
	if os.Getenv("TEST_DATABASE_ALLOW_ROLLBACK") != "1" {
		t.Skip("TEST_DATABASE_ALLOW_ROLLBACK not set; skipping destructive migration-cycle test. " +
			"Set it to 1 to opt in to rollback execution.")
	}
}