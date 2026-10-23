package testdb

import (
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"errors"
	"net/url"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/lib/pq"

	"alignify/collaboration/pkg/storage"
)

const queryTimeout = 5 * time.Second

var testDatabaseName = regexp.MustCompile(`^alignify_test(_[a-zA-Z0-9_-]+)?$`)

// reporter keeps the policy wrapper testable without implementing testing.TB.
// Fatalf and Skip must abort the current test, as they do on testing.TB.
type reporter interface {
	Helper()
	Skip(...any)
	Fatalf(string, ...any)
	Errorf(string, ...any)
	Cleanup(func())
}

type databaseTarget struct {
	url      url.URL
	database string
}

// validateURL is pure and returns only fixed, credential-safe diagnostics.
func validateURL(raw string) (databaseTarget, error) {
	invalid := func(message string) (databaseTarget, error) {
		return databaseTarget{}, errors.New(message)
	}
	u, err := url.Parse(raw)
	if err != nil {
		return invalid("malformed PostgreSQL URL")
	}
	if u.Scheme != "postgres" || u.Opaque != "" || strings.Contains(raw, "#") {
		return invalid("use a postgres:// URL without an opaque path or fragment")
	}
	host := u.Hostname()
	if host != "127.0.0.1" && host != "localhost" {
		return invalid("host must be explicitly localhost or 127.0.0.1")
	}
	port := u.Port()
	if port == "" {
		if u.Host != host {
			return invalid("port must be an integer from 1 to 65535")
		}
		// Do not inherit an unrelated PGPORT from the caller's environment.
		u.Host = host + ":5432"
	} else {
		n, err := strconv.ParseUint(port, 10, 16)
		if err != nil || n == 0 || u.Host != host+":"+port {
			return invalid("port must be an integer from 1 to 65535")
		}
	}
	if u.User != nil {
		password, _ := u.User.Password()
		if strings.ContainsRune(u.User.Username(), '\x00') || strings.ContainsRune(password, '\x00') {
			return invalid("credentials must not contain NUL characters")
		}
	}
	if !strings.HasPrefix(u.Path, "/") {
		return invalid("an explicit test database path is required")
	}
	database := strings.TrimPrefix(u.Path, "/")
	if len(database) > 63 || !testDatabaseName.MatchString(database) {
		return invalid("database must be alignify_test or alignify_test_<suffix>, at most 63 characters")
	}
	q, err := url.ParseQuery(u.RawQuery)
	if err != nil {
		return invalid("malformed query options")
	}
	for key, values := range q {
		if len(values) != 1 {
			return invalid("duplicate query options are not permitted")
		}
		switch key {
		case "sslmode":
			switch values[0] {
			case "disable", "require", "verify-ca", "verify-full":
			default:
				return invalid("sslmode must be disable, require, verify-ca, or verify-full")
			}
		case "connect_timeout":
			seconds, err := strconv.ParseUint(values[0], 10, 8)
			if err != nil || seconds < 1 || seconds > 30 {
				return invalid("connect_timeout must be an integer from 1 to 30 seconds")
			}
		default:
			return invalid("only sslmode and connect_timeout query options are permitted")
		}
	}
	if !q.Has("sslmode") {
		q.Set("sslmode", "require")
	}
	if !q.Has("connect_timeout") {
		q.Set("connect_timeout", "5")
	}
	// Preserve the validated database in the path; never append a second dbname.
	u.RawPath = ""
	u.RawQuery = q.Encode()
	return databaseTarget{url: *u, database: database}, nil
}

func (target databaseTarget) schemaDSN(schema string) string {
	u := target.url
	q := u.Query()
	q.Set("search_path", pq.QuoteIdentifier(schema))
	u.RawQuery = q.Encode()
	return u.String()
}

func newSchemaName() (string, error) {
	var random [16]byte
	if _, err := rand.Read(random[:]); err != nil {
		return "", errors.New("could not generate an isolated schema name")
	}
	// Independent of the database name, and well below PostgreSQL's 63-byte limit.
	return "alignify_it_" + hex.EncodeToString(random[:]), nil
}

// Open returns an unmigrated PostgreSQL store in a unique, quoted schema.
// Only TEST_DATABASE_URL is read: absence skips; an invalid or unreachable
// explicit target fails. The URL must use postgres://, localhost or 127.0.0.1,
// and alignify_test or alignify_test_<suffix> (at most 63 characters). Only
// sslmode and connect_timeout (1-30 seconds; default 5) options are accepted.
// An omitted port defaults to 5432 and omitted sslmode defaults to require.
//
// Every connection in the pool has the same exclusive schema search_path, with
// no public fallback. Test cleanup closes the store, drops only its schema,
// then closes the bootstrap pool. Callers may close the store earlier, but
// store.Close alone does not remove the schema: the test cleanup owns it.
func Open(t testing.TB) *storage.PostgresStorage {
	t.Helper()
	return open(t, func(t reporter, target databaseTarget) (*storage.PostgresStorage, error) {
		return establish(t, target, storage.NewPostgresStorage)
	})
}

func open(t reporter, connect func(reporter, databaseTarget) (*storage.PostgresStorage, error)) *storage.PostgresStorage {
	t.Helper()
	raw := os.Getenv("TEST_DATABASE_URL")
	if raw == "" {
		t.Skip("TEST_DATABASE_URL not set; skipping PostgreSQL integration test. Supply an explicit disposable local test database to opt in.")
		return nil
	}
	target, err := validateURL(raw)
	if err != nil {
		// Only the pure validator's fixed diagnostics are safe to report.
		t.Fatalf("Invalid TEST_DATABASE_URL: %s", err)
		return nil
	}
	store, err := connect(t, target)
	if err != nil || store == nil {
		// Connector errors can include credentials, URLs, or server-supplied text.
		t.Fatalf("Failed to initialize isolated PostgreSQL test storage; check TEST_DATABASE_URL connectivity and schema permissions")
		return nil
	}
	return store
}

// establish returns setup errors instead of terminating the test. Cleanup is
// registered as resources are acquired, including on partial initialization.
// openStore is injectable to exercise failure after the schema has been created.
func establish(t reporter, target databaseTarget, openStore func(string) (*storage.PostgresStorage, error)) (*storage.PostgresStorage, error) {
	schema, err := newSchemaName()
	if err != nil {
		return nil, err
	}
	bootstrap, err := sql.Open("postgres", target.url.String())
	if err != nil {
		return nil, errors.New("could not open test database bootstrap pool")
	}
	t.Cleanup(func() {
		if err := bootstrap.Close(); err != nil {
			t.Errorf("Failed to close test database bootstrap pool")
		}
	})
	bootstrap.SetMaxOpenConns(1)
	bootstrap.SetMaxIdleConns(1)

	ctx, cancel := context.WithTimeout(context.Background(), queryTimeout)
	defer cancel()
	var database string
	if err := bootstrap.QueryRowContext(ctx, `SELECT pg_catalog.current_database()`).Scan(&database); err != nil {
		return nil, errors.New("could not verify test database connection")
	}
	if database != target.database {
		return nil, errors.New("test database connection selected an unexpected database")
	}

	// A transaction handles a CREATE whose response is lost: rollback prevents
	// an orphan schema. Register DROP after successful CREATE but before COMMIT,
	// covering an ambiguous commit without ever dropping a pre-existing schema.
	tx, err := bootstrap.BeginTx(ctx, nil)
	if err != nil {
		return nil, errors.New("could not begin isolated schema creation")
	}
	defer tx.Rollback()
	quotedSchema := pq.QuoteIdentifier(schema)
	if _, err := tx.ExecContext(ctx, `CREATE SCHEMA `+quotedSchema); err != nil {
		return nil, errors.New("could not create isolated test schema")
	}
	t.Cleanup(func() {
		cleanupCtx, cleanupCancel := context.WithTimeout(context.Background(), queryTimeout)
		defer cleanupCancel()
		if _, err := bootstrap.ExecContext(cleanupCtx, `DROP SCHEMA IF EXISTS `+quotedSchema+` CASCADE`); err != nil {
			t.Errorf("Failed to drop owned test schema")
		}
	})
	if err := tx.Commit(); err != nil {
		return nil, errors.New("could not commit isolated schema creation")
	}

	store, err := openStore(target.schemaDSN(schema))
	if store != nil {
		t.Cleanup(func() {
			if err := store.Close(); err != nil {
				t.Errorf("Failed to close isolated PostgreSQL test storage")
			}
		})
		// Expose the isolated schema so integration tests can derive an
		// independent observer connection without parsing search_path.
		store.Schema = schema
	}
	if err != nil || store == nil || store.DB() == nil {
		return nil, errors.New("could not open isolated PostgreSQL test storage")
	}
	verifyCtx, verifyCancel := context.WithTimeout(context.Background(), queryTimeout)
	defer verifyCancel()
	var currentSchema, searchPath string
	if err := store.DB().QueryRowContext(verifyCtx, `
		SELECT pg_catalog.current_database(), pg_catalog.current_schema(), pg_catalog.current_setting('search_path')
	`).Scan(&database, &currentSchema, &searchPath); err != nil {
		return nil, errors.New("could not verify isolated PostgreSQL test storage")
	}
	if database != target.database || currentSchema != schema || searchPath != quotedSchema {
		return nil, errors.New("isolated test storage selected an unexpected database or search path")
	}
	return store, nil
}

// MigrationsDir returns the absolute path to the migration directory.
// It fails the test if the directory is missing or unreadable.
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

// RequireRollback must be called before setting up destructive migration tests.
// It requires TEST_DATABASE_ALLOW_ROLLBACK=1; this never bypasses Open validation.
func RequireRollback(t testing.TB) {
	t.Helper()
	requireRollback(t)
}

func requireRollback(t reporter) {
	t.Helper()
	if os.Getenv("TEST_DATABASE_ALLOW_ROLLBACK") != "1" {
		t.Skip("TEST_DATABASE_ALLOW_ROLLBACK must be 1; skipping destructive migration-cycle test. Set it to 1 to opt in to rollback execution.")
	}
}
