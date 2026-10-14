// Package testdb provides opt-in PostgreSQL tests in disposable, isolated schemas.
package testdb

import (
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"errors"
	"net"
	"net/url"
	"os"
	"path/filepath"
	"regexp"
	"runtime"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/lib/pq"

	"alignify/collaboration/pkg/storage"
)

const operationTimeout = 5 * time.Second

var databaseNamePattern = regexp.MustCompile(`^alignify_test(?:_[A-Za-z0-9_]+)?$`)

// Open returns an unmigrated store in a new schema owned by this test. Only an
// explicit TEST_DATABASE_URL pointing to a loopback test database is accepted.
// The helper owns closing the store and removing its schema; callers must stop
// database users (servers, rooms, and clients) before its cleanup runs.
func Open(t testing.TB) *storage.PostgresStorage {
	t.Helper()
	config := testConfig(t)

	var random [16]byte
	if _, err := rand.Read(random[:]); err != nil {
		t.Fatal("test database: could not generate an isolated schema name")
	}
	schema := "alignify_test_" + hex.EncodeToString(random[:])

	var bootstrap, store *storage.PostgresStorage
	var conn *sql.Conn
	ownsSchema := false
	// Register before acquiring resources, including when setup fails partway.
	t.Cleanup(func() {
		if store != nil {
			closeBounded(t, "scoped pool", store.Close)
		}
		if ownsSchema {
			ctx, cancel := context.WithTimeout(context.Background(), operationTimeout)
			defer cancel()
			// conn is the same connection whose database was checked before CREATE.
			if _, err := conn.ExecContext(ctx, "DROP SCHEMA "+pq.QuoteIdentifier(schema)+" CASCADE"); err != nil {
				t.Error("test database cleanup: could not drop the owned schema")
			}
		}
		if conn != nil {
			closeBounded(t, "bootstrap connection", conn.Close)
		}
		if bootstrap != nil {
			closeBounded(t, "bootstrap pool", bootstrap.Close)
		}
	})

	var err error
	bootstrap, err = storage.NewPostgresStorage(scopedURL(config, "pg_catalog"))
	if err != nil {
		// Driver errors may contain credentials or other connection parameters.
		t.Fatal("test database: could not connect using TEST_DATABASE_URL")
	}
	bootstrap.DB().SetMaxOpenConns(1)
	bootstrap.DB().SetMaxIdleConns(1)

	ctx, cancel := context.WithTimeout(context.Background(), operationTimeout)
	defer cancel()
	conn, err = bootstrap.DB().Conn(ctx)
	if err != nil {
		t.Fatal("test database: could not acquire the bootstrap connection")
	}
	var database string
	if err := conn.QueryRowContext(ctx, "SELECT pg_catalog.current_database()").Scan(&database); err != nil {
		t.Fatal("test database: could not confirm the effective database")
	}
	if database != strings.TrimPrefix(config.Path, "/") {
		t.Fatal("test database: effective database does not match the validated test target")
	}
	// Do not use IF NOT EXISTS: a collision must fail, not adopt another schema.
	if _, err := conn.ExecContext(ctx, "CREATE SCHEMA "+pq.QuoteIdentifier(schema)); err != nil {
		t.Fatal("test database: could not create a new isolated schema")
	}
	ownsSchema = true

	store, err = storage.NewPostgresStorage(scopedURL(config, schema))
	if err != nil {
		t.Fatal("test database: could not open the isolated connection pool")
	}
	var currentSchema, searchPath string
	if err := store.DB().QueryRowContext(ctx, `
		SELECT pg_catalog.current_database(), pg_catalog.current_schema(), pg_catalog.current_setting('search_path')
	`).Scan(&database, &currentSchema, &searchPath); err != nil {
		t.Fatal("test database: could not confirm the isolated connection settings")
	}
	if database != strings.TrimPrefix(config.Path, "/") || currentSchema != schema || searchPath != pq.QuoteIdentifier(schema) {
		t.Fatal("test database: connection settings do not match the isolated test target")
	}
	return store
}

// RequireRollback must be called before Open by tests that execute rollbacks.
// An absent opt-in skips; an invalid supplied opt-in or target fails without
// connecting. Opting in never bypasses the same validation used by Open.
func RequireRollback(t testing.TB) {
	t.Helper()
	_ = testConfig(t)
	switch os.Getenv("TEST_DATABASE_ALLOW_ROLLBACK") {
	case "":
		t.Skip("PostgreSQL rollback test requires TEST_DATABASE_ALLOW_ROLLBACK=1")
	case "1":
		return
	default:
		t.Fatal("TEST_DATABASE_ALLOW_ROLLBACK must be 1 or unset")
	}
}

// MigrationsDir resolves the repository's migrations independently of the
// calling test package's working directory.
func MigrationsDir(t testing.TB) string {
	t.Helper()
	_, source, _, ok := runtime.Caller(0)
	if !ok {
		t.Fatal("test database: could not locate the migrations directory")
	}
	dir := filepath.Join(filepath.Dir(source), "..", "..", "migrations")
	info, err := os.Stat(dir)
	if err != nil || !info.IsDir() {
		t.Fatal("test database: repository migrations directory is unavailable")
	}
	return dir
}

func testConfig(t testing.TB) *url.URL {
	t.Helper()
	raw := os.Getenv("TEST_DATABASE_URL")
	if raw == "" {
		t.Skip("PostgreSQL integration test requires TEST_DATABASE_URL (no application database fallback)")
	}
	config, err := validateURL(raw)
	if err != nil {
		t.Fatalf("unsafe TEST_DATABASE_URL: %s", err)
	}
	if err := validateEnvironment(os.Environ()); err != nil {
		t.Fatal(err)
	}
	return config
}

// validateURL deliberately returns only fixed messages, never parser errors or
// user-supplied fragments of the URL, which may contain credentials.
func validateURL(raw string) (*url.URL, error) {
	parsed, err := url.Parse(raw)
	if err != nil || parsed.Opaque != "" || (parsed.Scheme != "postgres" && parsed.Scheme != "postgresql") {
		return nil, errors.New("expected a PostgreSQL URL")
	}
	if strings.TrimSpace(raw) != raw || strings.Contains(raw, "#") {
		return nil, errors.New("whitespace and URL fragments are not allowed")
	}
	host := parsed.Hostname()
	if host == "localhost" {
		// Pin the address rather than depending on host-file or DNS resolution.
		host = "127.0.0.1"
	} else if ip := net.ParseIP(host); ip != nil && ip.IsLoopback() {
		host = ip.String()
	} else {
		return nil, errors.New("an explicit loopback host is required")
	}
	port := parsed.Port()
	if port == "" {
		if strings.HasSuffix(parsed.Host, ":") {
			return nil, errors.New("the port must be a number between 1 and 65535")
		}
		port = "5432"
	}
	portNumber, err := strconv.ParseUint(port, 10, 16)
	if err != nil || portNumber == 0 {
		return nil, errors.New("the port must be a number between 1 and 65535")
	}
	database := strings.TrimPrefix(parsed.Path, "/")
	if !strings.HasPrefix(parsed.Path, "/") || len(database) > 63 || !databaseNamePattern.MatchString(database) {
		return nil, errors.New("database must be alignify_test or alignify_test_<suffix> (at most 63 ASCII characters)")
	}
	query, err := url.ParseQuery(parsed.RawQuery)
	if err != nil {
		return nil, errors.New("invalid connection query options")
	}
	for key, values := range query {
		if len(values) != 1 {
			return nil, errors.New("duplicate connection query options are not allowed")
		}
		switch key {
		case "sslmode":
			switch values[0] {
			case "disable", "require", "verify-ca", "verify-full":
			default:
				return nil, errors.New("unsupported sslmode")
			}
		case "connect_timeout":
			seconds, err := strconv.Atoi(values[0])
			if err != nil || seconds < 1 || seconds > 10 {
				return nil, errors.New("connect_timeout must be between 1 and 10 seconds")
			}
		default:
			return nil, errors.New("only sslmode and connect_timeout query options are allowed")
		}
	}
	if !query.Has("connect_timeout") {
		query.Set("connect_timeout", "5")
	}
	if !query.Has("sslmode") {
		query.Set("sslmode", "require")
	}
	parsed.Host = net.JoinHostPort(host, strconv.FormatUint(portNumber, 10))
	parsed.Path = "/" + database
	parsed.RawPath = ""
	parsed.RawQuery = query.Encode()
	return parsed, nil
}

func validateEnvironment(environ []string) error {
	// lib/pq reads PG* environment settings even when given a URL. In particular
	// PGOPTIONS can change search_path; some service/host settings even panic.
	// Reject ambient PostgreSQL settings instead of mutating process-wide env
	// (which would also be unsafe for parallel tests). Credentials belong in URL.
	for _, entry := range environ {
		key, _, _ := strings.Cut(entry, "=")
		if strings.HasPrefix(strings.ToUpper(key), "PG") {
			return errors.New("test database: unset PG* environment settings; configure only TEST_DATABASE_URL")
		}
	}
	return nil
}

func scopedURL(config *url.URL, schema string) string {
	scoped := *config
	query := scoped.Query()
	// These are startup parameters on every pooled connection, not a one-off SET.
	query.Set("search_path", pq.QuoteIdentifier(schema))
	query.Set("statement_timeout", "5000")
	query.Set("lock_timeout", "5000")
	scoped.RawQuery = query.Encode()
	return scoped.String()
}

func closeBounded(t testing.TB, resource string, close func() error) {
	t.Helper()
	result := make(chan error, 1)
	go func() { result <- close() }()
	timer := time.NewTimer(operationTimeout)
	defer timer.Stop()
	select {
	case err := <-result:
		if err != nil {
			t.Errorf("test database cleanup: could not close %s", resource)
		}
	case <-timer.C:
		t.Errorf("test database cleanup: timed out closing %s", resource)
	}
}
