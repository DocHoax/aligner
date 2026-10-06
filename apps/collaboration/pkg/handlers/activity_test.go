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

func TestActivityHandler_GetActivities(t *testing.T) {
	store := storage.NewMemoryStorage()
	activityH := handlers.NewActivityHandler(store)

	ctx := context.Background()
	user := &models.User{ID: "usr_bob", Email: "bob@alignify.dev", DisplayName: "Bob", AvatarColor: "#10B981"}
	_ = store.Users().CreateUser(ctx, user)

	ws := &models.Workspace{ID: "ws_act", Name: "Design System", OwnerID: user.ID}
	_ = store.Workspaces().CreateWorkspace(ctx, ws)
	_ = store.Workspaces().AddMember(ctx, &models.WorkspaceMembership{
		ID:          "mem_bob",
		WorkspaceID: ws.ID,
		UserID:      user.ID,
		Role:        models.RoleEditor,
		CreatedAt:   time.Now().UTC(),
	})

	board := &models.Board{ID: "brd_act", WorkspaceID: ws.ID, Name: "Flowchart", CreatedBy: user.ID}
	_ = store.Boards().CreateBoard(ctx, board)

	userCtx := context.WithValue(context.Background(), auth.UserClaimsContextKey, &auth.UserClaims{
		UserID:      user.ID,
		Email:       user.Email,
		DisplayName: user.DisplayName,
	})

	// Log some sample activities
	_ = store.Activity().LogActivity(ctx, &models.BoardActivity{
		BoardID:         board.ID,
		UserID:          user.ID,
		UserName:        user.DisplayName,
		UserAvatarColor: user.AvatarColor,
		ActionType:      "board_created",
		Description:     "created the board",
		Metadata:        json.RawMessage(`{}`),
		CreatedAt:       time.Now().UTC(),
	})

	_ = store.Activity().LogActivity(ctx, &models.BoardActivity{
		BoardID:         board.ID,
		UserID:          user.ID,
		UserName:        user.DisplayName,
		UserAvatarColor: user.AvatarColor,
		ActionType:      "comment_created",
		Description:     "added a note",
		Metadata:        json.RawMessage(`{"commentId":"cmt_1"}`),
		CreatedAt:       time.Now().UTC(),
	})

	req := httptest.NewRequest(http.MethodGet, "/api/boards/brd_act/activity?limit=10&offset=0", nil).WithContext(userCtx)
	rec := httptest.NewRecorder()
	activityH.GetActivities(rec, req, board.ID)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200 OK, got %d (body: %s)", rec.Code, rec.Body.String())
	}

	var res struct {
		Success    bool                   `json:"success"`
		Activities []models.BoardActivity `json:"activities"`
	}
	_ = json.Unmarshal(rec.Body.Bytes(), &res)

	if !res.Success || len(res.Activities) != 2 {
		t.Fatalf("expected 2 activities, got %+v", res.Activities)
	}
}
