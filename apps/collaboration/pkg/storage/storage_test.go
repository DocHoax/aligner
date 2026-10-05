package storage_test

import (
	"context"
	"encoding/json"
	"testing"
	"time"

	"alignify/collaboration/pkg/models"
	"alignify/collaboration/pkg/storage"
)

func TestMemoryStorage_UserCRUD(t *testing.T) {
	ctx := context.Background()
	store := storage.NewMemoryStorage()

	user := &models.User{
		ID:           "usr_test1",
		Email:        "architect@alignify.dev",
		PasswordHash: "hashed_pass_123",
		DisplayName:  "Lead Architect",
		AvatarColor:  "#3b82f6",
	}

	// 1. Create User
	if err := store.Users().CreateUser(ctx, user); err != nil {
		t.Fatalf("failed to create user: %v", err)
	}

	// 2. Duplicate rejection
	dupUser := &models.User{
		ID:    "usr_test2",
		Email: "ARCHITECT@ALIGNIFY.DEV",
	}
	if err := store.Users().CreateUser(ctx, dupUser); err != storage.ErrAlreadyExists {
		t.Fatalf("expected ErrAlreadyExists, got %v", err)
	}

	// 3. Get User by ID
	found, err := store.Users().GetUserByID(ctx, "usr_test1")
	if err != nil {
		t.Fatalf("failed to get user by id: %v", err)
	}
	if found.Email != "architect@alignify.dev" || found.DisplayName != "Lead Architect" {
		t.Errorf("unexpected user data: %+v", found)
	}

	// 4. Get User by Email
	foundEmail, err := store.Users().GetUserByEmail(ctx, "architect@alignify.dev")
	if err != nil {
		t.Fatalf("failed to get user by email: %v", err)
	}
	if foundEmail.ID != "usr_test1" {
		t.Errorf("expected usr_test1, got %s", foundEmail.ID)
	}

	// 5. Update User
	found.DisplayName = "Senior System Architect"
	found.AvatarColor = "#10b981"
	if err := store.Users().UpdateUser(ctx, found); err != nil {
		t.Fatalf("failed to update user: %v", err)
	}

	updated, _ := store.Users().GetUserByID(ctx, "usr_test1")
	if updated.DisplayName != "Senior System Architect" || updated.AvatarColor != "#10b981" {
		t.Errorf("user update failed to persist: %+v", updated)
	}
}

func TestMemoryStorage_WorkspaceAndMembers(t *testing.T) {
	ctx := context.Background()
	store := storage.NewMemoryStorage()

	owner := &models.User{ID: "usr_owner", Email: "owner@alignify.dev", DisplayName: "Owner"}
	editor := &models.User{ID: "usr_editor", Email: "editor@alignify.dev", DisplayName: "Editor"}
	viewer := &models.User{ID: "usr_viewer", Email: "viewer@alignify.dev", DisplayName: "Viewer"}

	store.Users().CreateUser(ctx, owner)
	store.Users().CreateUser(ctx, editor)
	store.Users().CreateUser(ctx, viewer)

	ws := &models.Workspace{
		ID:          "ws_core",
		Name:        "Core Systems",
		Slug:        "core-systems",
		Description: "Mission critical architecture diagrams",
		OwnerID:     owner.ID,
	}
	if err := store.Workspaces().CreateWorkspace(ctx, ws); err != nil {
		t.Fatalf("failed to create workspace: %v", err)
	}

	// Add memberships
	store.Workspaces().AddMember(ctx, &models.WorkspaceMembership{
		ID: "mem_1", WorkspaceID: ws.ID, UserID: owner.ID, Role: models.RoleOwner,
	})
	store.Workspaces().AddMember(ctx, &models.WorkspaceMembership{
		ID: "mem_2", WorkspaceID: ws.ID, UserID: editor.ID, Role: models.RoleEditor,
	})
	store.Workspaces().AddMember(ctx, &models.WorkspaceMembership{
		ID: "mem_3", WorkspaceID: ws.ID, UserID: viewer.ID, Role: models.RoleViewer,
	})

	// Get Members
	members, err := store.Workspaces().GetMembers(ctx, ws.ID)
	if err != nil {
		t.Fatalf("failed to get members: %v", err)
	}
	if len(members) != 3 {
		t.Fatalf("expected 3 members, got %d", len(members))
	}

	// Check Workspaces for User
	userWorkspaces, err := store.Workspaces().GetWorkspacesByUserID(ctx, editor.ID)
	if err != nil {
		t.Fatalf("failed to get workspaces by user: %v", err)
	}
	if len(userWorkspaces) != 1 || userWorkspaces[0].UserRole != models.RoleEditor {
		t.Errorf("unexpected workspace role for editor: %+v", userWorkspaces)
	}

	// Update Member Role
	if err := store.Workspaces().UpdateMemberRole(ctx, ws.ID, viewer.ID, models.RoleEditor); err != nil {
		t.Fatalf("failed to update member role: %v", err)
	}
	m, _ := store.Workspaces().GetMembership(ctx, ws.ID, viewer.ID)
	if m.Role != models.RoleEditor {
		t.Errorf("expected promoted role editor, got %s", m.Role)
	}

	// Remove Member
	if err := store.Workspaces().RemoveMember(ctx, ws.ID, viewer.ID); err != nil {
		t.Fatalf("failed to remove member: %v", err)
	}
	_, err = store.Workspaces().GetMembership(ctx, ws.ID, viewer.ID)
	if err != storage.ErrNotFound {
		t.Errorf("expected ErrNotFound after member removal, got %v", err)
	}
}

func TestMemoryStorage_BoardAndPermissions(t *testing.T) {
	ctx := context.Background()
	store := storage.NewMemoryStorage()

	owner := &models.User{ID: "usr_o", Email: "o@test.dev"}
	viewer := &models.User{ID: "usr_v", Email: "v@test.dev"}
	stranger := &models.User{ID: "usr_x", Email: "x@test.dev"}
	store.Users().CreateUser(ctx, owner)
	store.Users().CreateUser(ctx, viewer)
	store.Users().CreateUser(ctx, stranger)

	ws := &models.Workspace{ID: "ws_1", Name: "Team", OwnerID: owner.ID}
	store.Workspaces().CreateWorkspace(ctx, ws)
	store.Workspaces().AddMember(ctx, &models.WorkspaceMembership{
		ID: "m1", WorkspaceID: ws.ID, UserID: owner.ID, Role: models.RoleOwner,
	})
	store.Workspaces().AddMember(ctx, &models.WorkspaceMembership{
		ID: "m2", WorkspaceID: ws.ID, UserID: viewer.ID, Role: models.RoleViewer,
	})

	board := &models.Board{
		ID:          "brd_microservices",
		WorkspaceID: ws.ID,
		Name:        "Microservices Topology",
		CreatedBy:   owner.ID,
		IsPublic:    false,
	}
	if err := store.Boards().CreateBoard(ctx, board); err != nil {
		t.Fatalf("failed to create board: %v", err)
	}

	// Test effective role resolution
	roleOwner, err := store.Boards().GetBoardEffectiveRole(ctx, board.ID, owner.ID)
	if err != nil || roleOwner != models.RoleOwner {
		t.Errorf("expected owner role, got %s (err: %v)", roleOwner, err)
	}

	roleViewer, err := store.Boards().GetBoardEffectiveRole(ctx, board.ID, viewer.ID)
	if err != nil || roleViewer != models.RoleViewer {
		t.Errorf("expected viewer role, got %s (err: %v)", roleViewer, err)
	}

	_, errStranger := store.Boards().GetBoardEffectiveRole(ctx, board.ID, stranger.ID)
	if errStranger != storage.ErrUnauthorized {
		t.Errorf("expected ErrUnauthorized for stranger, got %v", errStranger)
	}

	// Make public and check stranger role
	board.IsPublic = true
	store.Boards().UpdateBoard(ctx, board)
	rolePublic, errPublic := store.Boards().GetBoardEffectiveRole(ctx, board.ID, stranger.ID)
	if errPublic != nil || rolePublic != models.RoleViewer {
		t.Errorf("expected viewer role for public board, got %s (err: %v)", rolePublic, errPublic)
	}
}

func TestMemoryStorage_SnapshotsAndOperations(t *testing.T) {
	ctx := context.Background()
	store := storage.NewMemoryStorage()

	boardID := "brd_sync_test"

	// 1. Initial snapshot
	initialData := json.RawMessage(`[{"id":"rect1","type":"rectangle","x":10,"y":20}]`)
	snap1 := &models.BoardSnapshot{
		BoardID:   boardID,
		Seq:       10,
		Data:      initialData,
		CreatedAt: time.Now().UTC(),
	}
	if err := store.Snapshots().SaveSnapshot(ctx, snap1); err != nil {
		t.Fatalf("failed to save snapshot: %v", err)
	}

	latest, err := store.Snapshots().GetLatestSnapshot(ctx, boardID)
	if err != nil {
		t.Fatalf("failed to get latest snapshot: %v", err)
	}
	if latest.Seq != 10 {
		t.Errorf("expected snapshot seq 10, got %d", latest.Seq)
	}

	// 2. Append operations
	op1 := &models.OperationRecord{
		BoardID: boardID,
		Seq:     11,
		UserID:  "u1",
		OpType:  "move",
		Payload: json.RawMessage(`{"id":"rect1","x":50,"y":20}`),
	}
	op2 := &models.OperationRecord{
		BoardID: boardID,
		Seq:     12,
		UserID:  "u2",
		OpType:  "create",
		Payload: json.RawMessage(`{"id":"ellipse1","type":"ellipse","x":100,"y":100}`),
	}
	if err := store.Operations().AppendOperation(ctx, op1); err != nil {
		t.Fatalf("failed to append op1: %v", err)
	}
	if err := store.Operations().AppendOperation(ctx, op2); err != nil {
		t.Fatalf("failed to append op2: %v", err)
	}

	// Conflict rejection test
	opConflict := &models.OperationRecord{
		BoardID: boardID,
		Seq:     11,
		UserID:  "u3",
		OpType:  "delete",
	}
	if err := store.Operations().AppendOperation(ctx, opConflict); err != storage.ErrOperationConflict {
		t.Fatalf("expected ErrOperationConflict, got %v", err)
	}

	// 3. Fetch operations after sequence
	opsAfter10, err := store.Operations().GetOperationsAfterSeq(ctx, boardID, 10)
	if err != nil {
		t.Fatalf("failed to get operations: %v", err)
	}
	if len(opsAfter10) != 2 {
		t.Fatalf("expected 2 operations, got %d", len(opsAfter10))
	}

	opsAfter11, err := store.Operations().GetOperationsAfterSeq(ctx, boardID, 11)
	if err != nil || len(opsAfter11) != 1 || opsAfter11[0].Seq != 12 {
		t.Fatalf("expected 1 operation seq 12, got %+v", opsAfter11)
	}
}
