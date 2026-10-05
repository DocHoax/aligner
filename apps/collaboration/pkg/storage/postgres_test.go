package storage_test

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
	"time"

	"alignify/collaboration/pkg/models"
	"alignify/collaboration/pkg/storage"
)

func getTestPostgresStorage(t *testing.T) *storage.PostgresStorage {
	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		dbURL = "postgres://postgres:postgres@localhost:5432/alignify?sslmode=disable"
	}

	store, err := storage.NewPostgresStorage(dbURL)
	if err != nil {
		t.Skipf("Skipping Postgres integration tests: PostgreSQL not reachable (%v)", err)
		return nil
	}

	// Run migrations
	migDir := "../../migrations"
	if _, err := os.Stat(migDir); err != nil {
		migDir = "../../../apps/collaboration/migrations"
	}
	absMigDir, _ := filepath.Abs(migDir)

	if err := store.RunMigrations(absMigDir); err != nil {
		t.Fatalf("Failed to run migrations on PostgreSQL: %v", err)
	}

	return store
}

func TestPostgresStorage_FullLifecycle(t *testing.T) {
	store := getTestPostgresStorage(t)
	if store == nil {
		return
	}
	defer store.Close()

	ctx := context.Background()
	ts := time.Now().UnixNano()

	// 1. Create Users
	user1 := &models.User{
		ID:           models.GenerateID("usr"),
		Email:        models.FormatSlug(time.Now().Format("20060102150405")) + "-owner@alignify.dev",
		PasswordHash: "$2a$10$abcdefghijklmnopqrstuvwxyz123456",
		DisplayName:  "Alice System Owner",
		AvatarColor:  "#3b82f6",
	}
	if err := store.Users().CreateUser(ctx, user1); err != nil {
		t.Fatalf("Postgres: failed to create user1: %v", err)
	}

	user2 := &models.User{
		ID:           models.GenerateID("usr"),
		Email:        models.FormatSlug(time.Now().Format("20060102150405")) + "-editor@alignify.dev",
		PasswordHash: "$2a$10$abcdefghijklmnopqrstuvwxyz123456",
		DisplayName:  "Bob System Editor",
		AvatarColor:  "#10b981",
	}
	if err := store.Users().CreateUser(ctx, user2); err != nil {
		t.Fatalf("Postgres: failed to create user2: %v", err)
	}

	// Verify duplicate email constraint
	dupUser := &models.User{
		ID:    models.GenerateID("usr"),
		Email: user1.Email,
	}
	if err := store.Users().CreateUser(ctx, dupUser); err != storage.ErrAlreadyExists {
		t.Fatalf("Postgres: expected ErrAlreadyExists for duplicate email, got %v", err)
	}

	// 2. Create Workspace
	ws := &models.Workspace{
		ID:          models.GenerateID("ws"),
		Name:        "Engineering Live Test",
		Slug:        "eng-live-test",
		Description: "Workspace for PostgreSQL integration tests",
		OwnerID:     user1.ID,
	}
	if err := store.Workspaces().CreateWorkspace(ctx, ws); err != nil {
		t.Fatalf("Postgres: failed to create workspace: %v", err)
	}

	// Add Owner Membership
	mem1 := &models.WorkspaceMembership{
		ID:          models.GenerateID("mem"),
		WorkspaceID: ws.ID,
		UserID:      user1.ID,
		Role:        models.RoleOwner,
	}
	if err := store.Workspaces().AddMember(ctx, mem1); err != nil {
		t.Fatalf("Postgres: failed to add owner membership: %v", err)
	}

	// Add Editor Membership
	mem2 := &models.WorkspaceMembership{
		ID:          models.GenerateID("mem"),
		WorkspaceID: ws.ID,
		UserID:      user2.ID,
		Role:        models.RoleEditor,
	}
	if err := store.Workspaces().AddMember(ctx, mem2); err != nil {
		t.Fatalf("Postgres: failed to add editor membership: %v", err)
	}

	// List Members
	members, err := store.Workspaces().GetMembers(ctx, ws.ID)
	if err != nil {
		t.Fatalf("Postgres: failed to list members: %v", err)
	}
	if len(members) != 2 {
		t.Fatalf("Postgres: expected 2 members, got %d", len(members))
	}

	// 3. Create Board
	board := &models.Board{
		ID:          models.GenerateID("brd"),
		WorkspaceID: ws.ID,
		Name:        "Architecture Roadmap",
		Description: "Main product architecture canvas",
		CreatedBy:   user1.ID,
		IsPublic:    false,
	}
	if err := store.Boards().CreateBoard(ctx, board); err != nil {
		t.Fatalf("Postgres: failed to create board: %v", err)
	}

	// Check Effective Roles
	r1, err := store.Boards().GetBoardEffectiveRole(ctx, board.ID, user1.ID)
	if err != nil || r1 != models.RoleOwner {
		t.Fatalf("Postgres: expected owner role for user1, got role=%v err=%v", r1, err)
	}

	r2, err := store.Boards().GetBoardEffectiveRole(ctx, board.ID, user2.ID)
	if err != nil || r2 != models.RoleEditor {
		t.Fatalf("Postgres: expected editor role for user2, got role=%v err=%v", r2, err)
	}

	// 4. Test Operations Persistence & Monotonic Sequencing
	op1 := &models.OperationRecord{
		BoardID: board.ID,
		Seq:     1,
		UserID:  user1.ID,
		OpType:  "OBJECT_CREATE",
		Payload: json.RawMessage(`{"id":"obj_rect_1","type":"rectangle","x":100,"y":200}`),
	}
	if err := store.Operations().AppendOperation(ctx, op1); err != nil {
		t.Fatalf("Postgres: failed to append op1: %v", err)
	}

	op2 := &models.OperationRecord{
		BoardID: board.ID,
		Seq:     2,
		UserID:  user2.ID,
		OpType:  "OBJECT_MOVE",
		Payload: json.RawMessage(`{"id":"obj_rect_1","x":150,"y":250}`),
	}
	if err := store.Operations().AppendOperation(ctx, op2); err != nil {
		t.Fatalf("Postgres: failed to append op2: %v", err)
	}

	// Test conflict rejection on duplicate seq
	dupOp := &models.OperationRecord{
		BoardID: board.ID,
		Seq:     2,
		UserID:  user1.ID,
		OpType:  "OBJECT_DELETE",
		Payload: json.RawMessage(`{"id":"obj_rect_1"}`),
	}
	if err := store.Operations().AppendOperation(ctx, dupOp); err != storage.ErrOperationConflict {
		t.Fatalf("Postgres: expected ErrOperationConflict for duplicate seq, got %v", err)
	}

	// 5. Test Snapshot Persistence
	snap := &models.BoardSnapshot{
		BoardID:   board.ID,
		Seq:       2,
		Data:      json.RawMessage(`{"objects":[{"id":"obj_rect_1","type":"rectangle","x":150,"y":250}]}`),
		CreatedBy: user1.ID,
	}
	if err := store.Snapshots().SaveSnapshot(ctx, snap); err != nil {
		t.Fatalf("Postgres: failed to save snapshot: %v", err)
	}

	// Verify Latest Snapshot
	latestSnap, err := store.Snapshots().GetLatestSnapshot(ctx, board.ID)
	if err != nil {
		t.Fatalf("Postgres: failed to get latest snapshot: %v", err)
	}
	if latestSnap.Seq != 2 {
		t.Fatalf("Postgres: expected snapshot seq 2, got %d", latestSnap.Seq)
	}

	// Append op3 after snapshot
	op3 := &models.OperationRecord{
		BoardID: board.ID,
		Seq:     3,
		UserID:  user2.ID,
		OpType:  "OBJECT_STYLE",
		Payload: json.RawMessage(`{"id":"obj_rect_1","color":"#ef4444"}`),
	}
	if err := store.Operations().AppendOperation(ctx, op3); err != nil {
		t.Fatalf("Postgres: failed to append op3: %v", err)
	}

	// Query operations after snapshot seq (seq > 2)
	tailOps, err := store.Operations().GetOperationsAfterSeq(ctx, board.ID, 2)
	if err != nil {
		t.Fatalf("Postgres: failed to get tail operations: %v", err)
	}
	if len(tailOps) != 1 || tailOps[0].Seq != 3 {
		t.Fatalf("Postgres: expected 1 tail operation with seq 3, got %d", len(tailOps))
	}

	_ = ts
}
