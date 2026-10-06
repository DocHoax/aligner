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
	"alignify/collaboration/pkg/storage"
)

func TestBoardHandler_SearchFavoritesAndThumbnails(t *testing.T) {
	store := storage.NewMemoryStorage()
	boardH := handlers.NewBoardHandler(store)

	ctx := context.Background()
	user := &models.User{ID: "usr_dave", Email: "dave@alignify.dev", DisplayName: "Dave"}
	_ = store.Users().CreateUser(ctx, user)

	ws := &models.Workspace{ID: "ws_search", Name: "Marketing", OwnerID: user.ID}
	_ = store.Workspaces().CreateWorkspace(ctx, ws)
	_ = store.Workspaces().AddMember(ctx, &models.WorkspaceMembership{
		ID:          "mem_dave",
		WorkspaceID: ws.ID,
		UserID:      user.ID,
		Role:        models.RoleOwner,
		CreatedAt:   time.Now().UTC(),
	})

	b1 := &models.Board{ID: "brd_1", WorkspaceID: ws.ID, Name: "Q4 Campaign Plan", CreatedBy: user.ID, CreatedAt: time.Now().UTC()}
	b2 := &models.Board{ID: "brd_2", WorkspaceID: ws.ID, Name: "Brand Identity Guidelines", CreatedBy: user.ID, CreatedAt: time.Now().UTC().Add(time.Minute)}
	_ = store.Boards().CreateBoard(ctx, b1)
	_ = store.Boards().CreateBoard(ctx, b2)

	userCtx := context.WithValue(context.Background(), auth.UserClaimsContextKey, &auth.UserClaims{
		UserID:      user.ID,
		Email:       user.Email,
		DisplayName: user.DisplayName,
	})

	// 1. Toggle favorite on b1
	reqFav := httptest.NewRequest(http.MethodPost, "/api/boards/brd_1/favorite", nil).WithContext(userCtx)
	recFav := httptest.NewRecorder()
	boardH.ToggleFavorite(recFav, reqFav, b1.ID)

	if recFav.Code != http.StatusOK {
		t.Fatalf("expected 200 OK on favorite toggle, got %d", recFav.Code)
	}

	// 2. Filter favorites only
	reqFavList := httptest.NewRequest(http.MethodGet, "/api/workspaces/ws_search/boards?favorites=true", nil).WithContext(userCtx)
	recFavList := httptest.NewRecorder()
	boardH.ListWorkspaceBoards(recFavList, reqFavList, ws.ID)

	if recFavList.Code != http.StatusOK {
		t.Fatalf("expected 200 OK, got %d", recFavList.Code)
	}

	var favListRes struct {
		Success bool                   `json:"success"`
		Boards  []models.BoardWithRole `json:"boards"`
	}
	_ = json.Unmarshal(recFavList.Body.Bytes(), &favListRes)
	if len(favListRes.Boards) != 1 || favListRes.Boards[0].ID != "brd_1" || !favListRes.Boards[0].IsFavorite {
		t.Fatalf("expected 1 favorite board (brd_1), got %+v", favListRes.Boards)
	}

	// 3. Search by keyword
	reqSearch := httptest.NewRequest(http.MethodGet, "/api/workspaces/ws_search/boards?q=Brand", nil).WithContext(userCtx)
	recSearch := httptest.NewRecorder()
	boardH.ListWorkspaceBoards(recSearch, reqSearch, ws.ID)

	var searchRes struct {
		Success bool                   `json:"success"`
		Boards  []models.BoardWithRole `json:"boards"`
	}
	_ = json.Unmarshal(recSearch.Body.Bytes(), &searchRes)
	if len(searchRes.Boards) != 1 || searchRes.Boards[0].ID != "brd_2" {
		t.Fatalf("expected 1 matching board (brd_2), got %+v", searchRes.Boards)
	}
}
