package handlers_test

import (
	"bytes"
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

func TestCommentsHandler_CRUDAndResolution(t *testing.T) {
	store := storage.NewMemoryStorage()
	commentH := handlers.NewCommentHandler(store)

	ctx := context.Background()
	user := &models.User{ID: "usr_alice", Email: "alice@alignify.dev", DisplayName: "Alice", AvatarColor: "#3B82F6"}
	_ = store.Users().CreateUser(ctx, user)

	ws := &models.Workspace{ID: "ws_test", Name: "Engineering", OwnerID: user.ID}
	_ = store.Workspaces().CreateWorkspace(ctx, ws)
	_ = store.Workspaces().AddMember(ctx, &models.WorkspaceMembership{
		ID:          "mem_alice",
		WorkspaceID: ws.ID,
		UserID:      user.ID,
		Role:        models.RoleEditor,
		CreatedAt:   time.Now().UTC(),
	})

	board := &models.Board{ID: "brd_test", WorkspaceID: ws.ID, Name: "Architecture Board", CreatedBy: user.ID}
	_ = store.Boards().CreateBoard(ctx, board)

	userCtx := context.WithValue(context.Background(), auth.UserClaimsContextKey, &auth.UserClaims{
		UserID:      user.ID,
		Email:       user.Email,
		DisplayName: user.DisplayName,
	})

	// 1. Create root comment
	commentPayload, _ := json.Marshal(map[string]interface{}{
		"content": "Check this boundary shape",
		"x":       150.5,
		"y":       320.0,
	})
	req := httptest.NewRequest(http.MethodPost, "/api/boards/brd_test/comments", bytes.NewBuffer(commentPayload)).WithContext(userCtx)
	rec := httptest.NewRecorder()
	commentH.CreateComment(rec, req, board.ID)

	if rec.Code != http.StatusCreated {
		t.Fatalf("expected 201 Created, got %d (body: %s)", rec.Code, rec.Body.String())
	}

	var createRes struct {
		Success bool                `json:"success"`
		Comment models.BoardComment `json:"comment"`
	}
	_ = json.Unmarshal(rec.Body.Bytes(), &createRes)

	if !createRes.Success || createRes.Comment.ID == "" || createRes.Comment.Content != "Check this boundary shape" {
		t.Fatalf("unexpected comment response: %+v", createRes)
	}
	rootCommentID := createRes.Comment.ID

	// 2. Reply to root comment
	replyPayload, _ := json.Marshal(map[string]interface{}{
		"parentId": rootCommentID,
		"content":  "Looks solid, approved!",
	})
	reqReply := httptest.NewRequest(http.MethodPost, "/api/boards/brd_test/comments", bytes.NewBuffer(replyPayload)).WithContext(userCtx)
	recReply := httptest.NewRecorder()
	commentH.CreateComment(recReply, reqReply, board.ID)

	if recReply.Code != http.StatusCreated {
		t.Fatalf("expected 201 Created on reply, got %d", recReply.Code)
	}

	// 3. List comments
	reqList := httptest.NewRequest(http.MethodGet, "/api/boards/brd_test/comments", nil).WithContext(userCtx)
	recList := httptest.NewRecorder()
	commentH.GetComments(recList, reqList, board.ID)

	if recList.Code != http.StatusOK {
		t.Fatalf("expected 200 OK on get comments, got %d", recList.Code)
	}

	var listRes struct {
		Success  bool                  `json:"success"`
		Comments []models.BoardComment `json:"comments"`
	}
	_ = json.Unmarshal(recList.Body.Bytes(), &listRes)

	if len(listRes.Comments) != 1 || len(listRes.Comments[0].Replies) != 1 {
		t.Fatalf("expected 1 root comment with 1 reply, got %+v", listRes.Comments)
	}

	// 4. Resolve comment thread
	resolved := true
	updatePayload, _ := json.Marshal(map[string]interface{}{
		"resolved": &resolved,
	})
	reqUpdate := httptest.NewRequest(http.MethodPatch, "/api/boards/brd_test/comments/"+rootCommentID, bytes.NewBuffer(updatePayload)).WithContext(userCtx)
	recUpdate := httptest.NewRecorder()
	commentH.UpdateComment(recUpdate, reqUpdate, board.ID, rootCommentID)

	if recUpdate.Code != http.StatusOK {
		t.Fatalf("expected 200 OK on resolving comment, got %d", recUpdate.Code)
	}

	// Verify resolved state
	cmt, _ := store.Comments().GetCommentByID(ctx, rootCommentID)
	if !cmt.Resolved || cmt.ResolvedBy == nil || *cmt.ResolvedBy != user.ID {
		t.Fatalf("comment should be marked resolved by user")
	}

	// 5. Delete comment
	reqDel := httptest.NewRequest(http.MethodDelete, "/api/boards/brd_test/comments/"+rootCommentID, nil).WithContext(userCtx)
	recDel := httptest.NewRecorder()
	commentH.DeleteComment(recDel, reqDel, board.ID, rootCommentID)

	if recDel.Code != http.StatusOK {
		t.Fatalf("expected 200 OK on deleting comment, got %d", recDel.Code)
	}
}
