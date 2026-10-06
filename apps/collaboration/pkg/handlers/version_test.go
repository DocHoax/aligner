package handlers_test

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"alignify/collaboration/pkg/auth"
	"alignify/collaboration/pkg/handlers"
	"alignify/collaboration/pkg/models"
	"alignify/collaboration/pkg/rooms"
	"alignify/collaboration/pkg/storage"
)

func TestVersionHandler_ListGetAndRestore(t *testing.T) {
	store := storage.NewMemoryStorage()
	hub := rooms.NewHub(store)
	versionH := handlers.NewVersionHandler(store, hub)

	ctx := context.Background()
	user := &models.User{ID: "usr_carol", Email: "carol@alignify.dev", DisplayName: "Carol"}
	_ = store.Users().CreateUser(ctx, user)

	ws := &models.Workspace{ID: "ws_ver", Name: "Product", OwnerID: user.ID}
	_ = store.Workspaces().CreateWorkspace(ctx, ws)
	_ = store.Workspaces().AddMember(ctx, &models.WorkspaceMembership{
		ID:          "mem_carol",
		WorkspaceID: ws.ID,
		UserID:      user.ID,
		Role:        models.RoleEditor,
		CreatedAt:   time.Now().UTC(),
	})

	board := &models.Board{ID: "brd_ver", WorkspaceID: ws.ID, Name: "Roadmap", CreatedBy: user.ID}
	_ = store.Boards().CreateBoard(ctx, board)

	userCtx := context.WithValue(context.Background(), auth.UserClaimsContextKey, &auth.UserClaims{
		UserID:      user.ID,
		Email:       user.Email,
		DisplayName: user.DisplayName,
	})

	// Save snapshot 1
	snapData1 := json.RawMessage(`[{"id":"rect_1","type":"rectangle","x":10,"y":20}]`)
	snap1 := &models.BoardSnapshot{
		BoardID:   board.ID,
		Seq:       10,
		Data:      snapData1,
		CreatedBy: user.ID,
		CreatedAt: time.Now().UTC().Add(-1 * time.Hour),
	}
	_ = store.Snapshots().SaveSnapshot(ctx, snap1)

	// 1. List snapshots
	reqList := httptest.NewRequest(http.MethodGet, "/api/boards/brd_ver/versions", nil).WithContext(userCtx)
	recList := httptest.NewRecorder()
	versionH.ListVersions(recList, reqList, board.ID)

	if recList.Code != http.StatusOK {
		t.Fatalf("expected 200 OK on list versions, got %d", recList.Code)
	}

	var listRes struct {
		Success  bool                   `json:"success"`
		Versions []models.BoardSnapshot `json:"versions"`
	}
	_ = json.Unmarshal(recList.Body.Bytes(), &listRes)
	if len(listRes.Versions) != 1 {
		t.Fatalf("expected 1 version, got %d", len(listRes.Versions))
	}
	snapshotID := listRes.Versions[0].ID

	// 2. Get single snapshot
	reqGet := httptest.NewRequest(http.MethodGet, "/api/boards/brd_ver/versions/1", nil).WithContext(userCtx)
	recGet := httptest.NewRecorder()
	versionH.GetVersion(recGet, reqGet, board.ID, snapshotID)

	if recGet.Code != http.StatusOK {
		t.Fatalf("expected 200 OK on get version, got %d", recGet.Code)
	}

	// 3. Restore snapshot
	reqRestore := httptest.NewRequest(http.MethodPost, "/api/boards/brd_ver/versions/1/restore", nil).WithContext(userCtx)
	recRestore := httptest.NewRecorder()
	versionH.RestoreVersion(recRestore, reqRestore, board.ID, snapshotID)

	if recRestore.Code != http.StatusOK {
		t.Fatalf("expected 200 OK on restore version, got %d (body: %s)", recRestore.Code, recRestore.Body.String())
	}

	var restoreRes struct {
		Success     bool  `json:"success"`
		RestoredSeq int64 `json:"restoredSeq"`
	}
	_ = json.Unmarshal(recRestore.Body.Bytes(), &restoreRes)
	if !restoreRes.Success || restoreRes.RestoredSeq != 11 {
		t.Fatalf("unexpected restore response: %+v", restoreRes)
	}
}
