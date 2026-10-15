package storage_test

import (
	"context"
	"database/sql"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"testing"
	"time"

	"alignify/collaboration/internal/testdb"
	"alignify/collaboration/pkg/models"
	"alignify/collaboration/pkg/storage"
)

func TestPostgresStorage_RunMigrations_InvalidInventory(t *testing.T) {
	tests := []struct {
		name  string
		path  string
		files map[string]string
		want  string
	}{
		{name: "missing directory", path: "missing", want: "failed to read migrations dir"},
		{
			name: "non-directory path", path: "not-a-directory",
			files: map[string]string{"not-a-directory": "not a directory"},
			want:  "failed to read migrations dir",
		},
		{name: "empty directory", want: "no SQL migrations found"},
		{
			name:  "non-SQL files only",
			files: map[string]string{"notes.txt": "not a migration"},
			want:  "no SQL migrations found",
		},
		{
			name:  "empty SQL file",
			files: map[string]string{"001_empty.sql": ""},
			want:  "migration 001_empty.sql is empty",
		},
		{
			name:  "whitespace SQL file",
			files: map[string]string{"001_whitespace.sql": " \t\r\n"},
			want:  "migration 001_whitespace.sql is empty",
		},
		{
			name:  "valid earlier file followed by empty file",
			files: map[string]string{"001_valid.sql": "SELECT 1;", "002_empty.sql": ""},
			want:  "migration 002_empty.sql is empty",
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			dir := t.TempDir()
			for name, content := range tt.files {
				if err := os.WriteFile(filepath.Join(dir, name), []byte(content), 0600); err != nil {
					t.Fatalf("write migration fixture: %v", err)
				}
			}
			// A nil pool makes any database access fail: the whole inventory must
			// be validated before metadata creation or execution of the first file.
			var store storage.PostgresStorage
			requireMigrationError(t, store.RunMigrations(filepath.Join(dir, tt.path)), tt.want)
		})
	}
}

func TestPostgresStorage_MigrationAndRollbackCycle(t *testing.T) {
	testdb.RequireRollback(t)
	store := testdb.Open(t)
	migrationsDir := testdb.MigrationsDir(t)
	rollbackDir := filepath.Join(migrationsDir, "rollback")
	versions := migrationFiles(t, migrationsDir)
	assertPostgresTables(t, store.DB(), nil)

	steps := []struct {
		name string
		run  func(string) error
		dir  string
		want []string
	}{
		{"forward", store.RunMigrations, migrationsDir, versions},
		{"idempotent forward", store.RunMigrations, migrationsDir, versions},
		{"rollback", store.RunRollbacks, rollbackDir, nil},
		{"immediate no-op rollback", store.RunRollbacks, rollbackDir, nil},
		{"reapply", store.RunMigrations, migrationsDir, versions},
	}
	for _, step := range steps {
		t.Logf("Checking %s", step.name)
		if err := step.run(step.dir); err != nil {
			t.Fatalf("%s: %v", step.name, err)
		}
		assertMigrationState(t, store.DB(), step.want)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	user := &models.User{
		ID:           "test-user-" + time.Now().UTC().Format("20060102150405"),
		Email:        "test@example.com",
		PasswordHash: "$2a$10$abcdefghijklmnopqrstuvwxyz123456",
		DisplayName:  "Test User",
		AvatarColor:  "#3b82f6",
	}
	if err := store.Users().CreateUser(ctx, user); err != nil {
		t.Fatalf("create user after reapply: %v", err)
	}
	got, err := store.Users().GetUserByID(ctx, user.ID)
	if err != nil {
		t.Fatalf("read user after reapply: %v", err)
	}
	if got == nil || got.ID != user.ID || got.Email != user.Email || got.DisplayName != user.DisplayName {
		t.Fatalf("user did not round-trip after reapply: got %+v", got)
	}
}

func TestPostgresStorage_RunMigrations_BootstrapsMetadata(t *testing.T) {
	store := testdb.Open(t)
	assertPostgresTables(t, store.DB(), nil)
	migrationsDir := testdb.MigrationsDir(t)
	if err := store.RunMigrations(migrationsDir); err != nil {
		t.Fatalf("forward migration with absent metadata: %v", err)
	}
	assertMigrationState(t, store.DB(), migrationFiles(t, migrationsDir))
}

func TestPostgresStorage_RunRollbacks_AbsentMetadata(t *testing.T) {
	testdb.RequireRollback(t)
	store := testdb.Open(t)
	assertPostgresTables(t, store.DB(), nil)
	// Absent metadata is a no-op even when the rollback directory is missing.
	if err := store.RunRollbacks(filepath.Join(t.TempDir(), "missing")); err != nil {
		t.Fatalf("rollback with absent metadata: %v", err)
	}
	assertPostgresTables(t, store.DB(), nil)
}

func TestPostgresStorage_MalformedMigrationMetadata(t *testing.T) {
	t.Run("forward", func(t *testing.T) {
		store := testdb.Open(t)
		createMalformedMigrationMetadata(t, store.DB())
		requireMigrationError(t, store.RunMigrations(testdb.MigrationsDir(t)), "failed to inspect migration")
		assertPostgresTables(t, store.DB(), []string{"schema_migrations"})
	})
	t.Run("rollback", func(t *testing.T) {
		testdb.RequireRollback(t)
		store := testdb.Open(t)
		createMalformedMigrationMetadata(t, store.DB())
		err := store.RunRollbacks(filepath.Join(testdb.MigrationsDir(t), "rollback"))
		requireMigrationError(t, err, "failed to inspect rollback")
		assertPostgresTables(t, store.DB(), []string{"schema_migrations"})
	})
}

func TestPostgresStorage_Migrations_ClosedPool(t *testing.T) {
	t.Run("forward", func(t *testing.T) {
		store := testdb.Open(t)
		if err := store.Close(); err != nil {
			t.Fatalf("close test pool: %v", err)
		}
		requireMigrationError(t, store.RunMigrations(testdb.MigrationsDir(t)), "sql: database is closed")
	})
	t.Run("rollback", func(t *testing.T) {
		testdb.RequireRollback(t)
		store := testdb.Open(t)
		if err := store.Close(); err != nil {
			t.Fatalf("close test pool: %v", err)
		}
		err := store.RunRollbacks(filepath.Join(testdb.MigrationsDir(t), "rollback"))
		requireMigrationError(t, err, "sql: database is closed")
	})
}

func TestPostgresStorage_RunRollbacks_InvalidInventory(t *testing.T) {
	for _, tt := range []struct {
		name string
		path string
		want string
	}{
		{"missing directory", "missing", "failed to read rollback dir"},
		{"empty directory", "", "no SQL rollback files found"},
	} {
		t.Run(tt.name, func(t *testing.T) {
			testdb.RequireRollback(t)
			store := testdb.Open(t)
			migrationsDir := testdb.MigrationsDir(t)
			if err := store.RunMigrations(migrationsDir); err != nil {
				t.Fatalf("create migration metadata and application schema: %v", err)
			}
			versions := migrationFiles(t, migrationsDir)
			assertMigrationState(t, store.DB(), versions)
			err := store.RunRollbacks(filepath.Join(t.TempDir(), tt.path))
			requireMigrationError(t, err, tt.want)
			assertMigrationState(t, store.DB(), versions)
		})
	}
}

func requireMigrationError(t *testing.T, err error, want string) {
	t.Helper()
	if err == nil || !strings.Contains(err.Error(), want) {
		t.Fatalf("expected error containing %q, got %v", want, err)
	}
}

func migrationFiles(t *testing.T, dir string) []string {
	t.Helper()
	entries, err := os.ReadDir(dir)
	if err != nil {
		t.Fatalf("read migration inventory: %v", err)
	}
	var names []string
	// ReadDir returns entries sorted by filename, as does migration tracking.
	for _, entry := range entries {
		if !entry.IsDir() && strings.HasSuffix(entry.Name(), ".sql") {
			names = append(names, entry.Name())
		}
	}
	if len(names) == 0 {
		t.Fatal("expected a nonempty forward migration inventory")
	}
	return names
}

func assertMigrationState(t *testing.T, db *sql.DB, wantVersions []string) {
	t.Helper()
	got := postgresStrings(t, db, `SELECT version FROM schema_migrations ORDER BY version`)
	if !slices.Equal(got, wantVersions) {
		t.Fatalf("applied migrations: got %v, want %v", got, wantVersions)
	}
	migrated := len(wantVersions) != 0
	wantTables := []string{"schema_migrations"}
	if migrated {
		wantTables = []string{
			"board_activities", "board_comments", "board_favorites", "board_permissions",
			"board_snapshots", "boards", "operation_log", "schema_migrations",
			"users", "workspace_memberships", "workspaces",
		}
	}
	assertPostgresTables(t, db, wantTables)

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	var hasThumbnail bool
	err := db.QueryRowContext(ctx, `
		SELECT EXISTS (
			SELECT 1 FROM information_schema.columns
			WHERE table_schema = current_schema()
			  AND table_name = 'boards' AND column_name = 'thumbnail_url'
		)
	`).Scan(&hasThumbnail)
	if err != nil {
		t.Fatalf("inspect boards.thumbnail_url: %v", err)
	}
	if hasThumbnail != migrated {
		t.Fatalf("boards.thumbnail_url exists: got %t, want %t", hasThumbnail, migrated)
	}
}

func assertPostgresTables(t *testing.T, db *sql.DB, want []string) {
	t.Helper()
	got := postgresStrings(t, db, `
		SELECT table_name FROM information_schema.tables
		WHERE table_schema = current_schema() AND table_type = 'BASE TABLE'
		ORDER BY table_name
	`)
	if !slices.Equal(got, want) {
		t.Fatalf("tables in isolated schema: got %v, want %v", got, want)
	}
}

func postgresStrings(t *testing.T, db *sql.DB, query string) []string {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	rows, err := db.QueryContext(ctx, query)
	if err != nil {
		t.Fatalf("query migration state: %v", err)
	}
	defer rows.Close()
	var values []string
	for rows.Next() {
		var value string
		if err := rows.Scan(&value); err != nil {
			t.Fatalf("scan migration state: %v", err)
		}
		values = append(values, value)
	}
	if err := rows.Err(); err != nil {
		t.Fatalf("read migration state: %v", err)
	}
	return values
}

func createMalformedMigrationMetadata(t *testing.T, db *sql.DB) {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	// A missing version column must be reported as an inspection failure,
	// not mistaken for an unapplied migration or an empty rollback inventory.
	if _, err := db.ExecContext(ctx, `CREATE TABLE schema_migrations (unexpected TEXT)`); err != nil {
		t.Fatalf("create malformed migration metadata: %v", err)
	}
}
