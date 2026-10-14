func TestPostgresStorage_MigrationAndRollbackCycle(t *testing.T) {
	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		dbURL = "postgres://postgres:postgres@localhost:5432/alignify?sslmode=disable"
	}

	store, err := storage.NewPostgresStorage(dbURL)
	if err != nil {
		t.Skipf("Skipping Postgres migration/rollback test: PostgreSQL not reachable (%v)", err)
		return
	}
	defer store.Close()

	migDir := "../../migrations"
	if _, err := os.Stat(migDir); err != nil {
		migDir = "../../../apps/collaboration/migrations"
	}
	absMigDir, _ := filepath.Abs(migDir)
	absRollbackDir := filepath.Join(absMigDir, "rollback")

	// Helper to get migration filenames sorted.
	getMigrationFiles := func(dir string) []string {
		files, err := os.ReadDir(dir)
		if err != nil {
			t.Fatalf("Failed to read migrations dir %s: %v", dir, err)
		}
		var names []string
		for _, f := range files {
			if !f.IsDir() && strings.HasSuffix(f.Name(), ".sql") {
				names = append(names, f.Name())
			}
		}
		sort.Strings(names)
		return names
	}
	// Helper to get applied migrations from schema_migrations.
	getAppliedMigrations := func(db *sql.DB) []string {
		rows, err := db.QueryContext(context.Background(), `SELECT version FROM schema_migrations ORDER BY version`)
		if err != nil {
			t.Fatalf("Failed to read schema_migrations: %v", err)
		}
		defer rows.Close()
		var applied []string
		for rows.Next() {
			var v string
			if err := rows.Scan(&v); err != nil {
				t.Fatalf("Failed to scan version: %v", err)
			}
			applied = append(applied, v)
		}
		if err := rows.Err(); err != nil {
			t.Fatalf("Error iterating schema_migrations: %v", err)
		}
		return applied
	}
	// Helper to check if a table exists in the current search path.
	tableExists := func(db *sql.DB, tableName string) bool {
		var exists bool
		err := db.QueryRowContext(context.Background(), `
			SELECT pg_catalog.to_regclass($1) IS NOT NULL;
		`, tableName).Scan(&exists)
		if err != nil {
			t.Fatalf("Failed to check existence of table %s: %v", tableName, err)
		}
		return exists
	}

	// Step 1: Run all forward migrations
	if err := store.RunMigrations(absMigDir); err != nil {
		t.Fatalf("Forward migration failed: %v", err)
	}
	// Verify forward tracking versions exactly match the SQL-file inventory.
	applied := getAppliedMigrations(store.DB())
	expected := getMigrationFiles(absMigDir)
	if len(applied) != len(expected) {
		t.Fatalf("Expected %d applied migrations, got %d", len(expected), len(applied))
	}
	for i, v := range applied {
		if v != expected[i] {
			t.Fatalf("Migration version mismatch at index %d: expected %s, got %s", i, expected[i], v)
		}
	}
	// Verify expected tables and boards.thumbnail_url exist.
	expectedTables := []string{
		"users",
		"workspaces",
		"workspace_memberships",
		"boards",
		"board_permissions",
		"board_snapshots",
		"operation_log",
		"board_comments",
		"board_activities",
		"board_favorites",
		"schema_migrations",
	}
	for _, tbl := range expectedTables {
		if !tableExists(store.DB(), tbl) {
			t.Fatalf("Expected table %s to exist after forward migration", tbl)
		}
	}
	if !tableExists(store.DB(), "boards") {
		t.Fatalf("Expected table boards to exist")
	}
	// Check that boards.thumbnail_url column exists.
	var hasThumbnailColumn bool
	err := store.DB().QueryRowContext(context.Background(), `
		SELECT EXISTS (
			SELECT 1 FROM information_schema.columns
			WHERE table_name = 'boards' AND column_name = 'thumbnail_url'
		);
	`).Scan(&hasThumbnailColumn)
	if err != nil {
		t.Fatalf("Failed to check for thumbnail_url column: %v", err)
	}
	if !hasThumbnailColumn {
		t.Fatalf("Expected boards.thumbnail_url column to exist after forward migration")
	}

	// Step 2: Run all rollback migrations (011 -> 001)
	if err := store.RunRollbacks(absRollbackDir); err != nil {
		t.Fatalf("Rollback migration execution failed: %v", err)
	}
	// Verify rollback leaves zero tracking rows and removes the application tables.
	appliedAfterRollback := getAppliedMigrations(store.DB())
	if len(appliedAfterRollback) != 0 {
		t.Fatalf("Expected zero applied migrations after rollback, got %d", len(appliedAfterRollback))
	}
	// Verify that the application tables have been dropped.
	for _, tbl := range expectedTables {
		if tbl == "schema_migrations" {
			continue // schema_migrations should still exist (but empty)
		}
		if tableExists(store.DB(), tbl) {
			t.Fatalf("Expected table %s to be dropped after rollback, but it still exists", tbl)
		}
	}
	// Verify that schema_migrations table still exists (but empty).
	if !tableExists(store.DB(), "schema_migrations") {
		t.Fatalf("Expected schema_migrations table to exist after rollback")
	}

	// Step 3: Re-apply all forward migrations (001 -> 011) to confirm complete clean recovery
	if err := store.RunMigrations(absMigDir); err != nil {
		t.Fatalf("Re-applying forward migrations after rollback failed: %v", err)
	}
	// Verify reapplication restores versions/schema.
	appliedAfterReapply := getAppliedMigrations(store.DB())
	if len(appliedAfterReapply) != len(expected) {
		t.Fatalf("Expected %d applied migrations after reapplication, got %d", len(expected), len(appliedAfterReapply))
	}
	for i, v := range appliedAfterReapply {
		if v != expected[i] {
			t.Fatalf("Migration version mismatch at index %d after reapplication: expected %s, got %s", i, expected[i], v)
		}
	}
	// Verify expected tables and boards.thumbnail_url exist again.
	for _, tbl := range expectedTables {
		if !tableExists(store.DB(), tbl) {
			t.Fatalf("Expected table %s to exist after reapplication", tbl)
		}
	}
	if !tableExists(store.DB(), "boards") {
		t.Fatalf("Expected table boards to exist after reapplication")
	}
	err = store.DB().QueryRowContext(context.Background(), `
		SELECT EXISTS (
			SELECT 1 FROM information_schema.columns
			WHERE table_name = 'boards' AND column_name = 'thumbnail_url'
		);
	`).Scan(&hasThumbnailColumn)
	if err != nil {
		t.Fatalf("Failed to check for thumbnail_url column after reapplication: %v", err)
	}
	if !hasThumbnailColumn {
		t.Fatalf("Expected boards.thumbnail_url column to exist after reapplication")
	}
	// Support a small repository operation.
	ctx := context.Background()
	user := &models.User{
		ID:           "test-user-" + time.Now().UTC().Format("20060102150405"),
		Email:        "test@example.com",
		PasswordHash: "$2a$10$abcdefghijklmnopqrstuvwxyz123456",
		DisplayName:  "Test User",
		AvatarColor:  "#3b82f6",
	}
	if err := store.Users().CreateUser(ctx, user); err != nil {
		t.Fatalf("Failed to create user after reapplication: %v", err)
	}
	// Verify we can read it back.
	readUser, err := store.Users().GetUserByID(ctx, user.ID)
	if err != nil {
		t.Fatalf("Failed to read back created user: %v", err)
	}
	if readUser.ID != user.ID {
		t.Fatalf("Read back user ID mismatch: expected %s, got %s", user.ID, readUser.ID)
	}

	// Additional: Repeated rollback is a no-op.
	if err := store.RunRollbacks(absRollbackDir); err != nil {
		t.Fatalf("Repeated rollback should be a no-op, got error: %v", err)
	}
	// After repeated rollback, schema_migrations should still be empty.
	appliedAfterRepeatedRollback := getAppliedMigrations(store.DB())
	if len(appliedAfterRepeatedRollback) != 0 {
		t.Fatalf("Expected zero applied migrations after repeated rollback, got %d", len(appliedAfterRepeatedRollback))
	}
}