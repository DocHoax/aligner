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

func setupTestEnvironment() (storage.Storage, *auth.JWTManager, *handlers.AuthHandler, *handlers.WorkspaceHandler, *handlers.BoardHandler) {
	store := storage.NewMemoryStorage()
	jwtMgr := auth.NewJWTManager("test-secret-key-123", 24*time.Hour)
	authH := handlers.NewAuthHandler(store, jwtMgr)
	wsH := handlers.NewWorkspaceHandler(store)
	boardH := handlers.NewBoardHandler(store)
	return store, jwtMgr, authH, wsH, boardH
}

func TestAuthHandler_RegisterAndLogin(t *testing.T) {
	_, _, authH, _, _ := setupTestEnvironment()

	// 1. Register User
	regPayload, _ := json.Marshal(map[string]string{
		"email":       "architect@alignify.dev",
		"password":    "securePass123",
		"displayName": "Lead Architect",
	})
	req := httptest.NewRequest(http.MethodPost, "/api/auth/register", bytes.NewBuffer(regPayload))
	rec := httptest.NewRecorder()
	authH.Register(rec, req)

	if rec.Code != http.StatusCreated {
		t.Fatalf("expected 201 Created, got %d (body: %s)", rec.Code, rec.Body.String())
	}

	var regRes struct {
		Success   bool              `json:"success"`
		Token     string            `json:"token"`
		User      models.UserPublic `json:"user"`
		Workspace models.Workspace  `json:"workspace"`
		BoardID   string            `json:"boardId"`
	}
	_ = json.Unmarshal(rec.Body.Bytes(), &regRes)

	if !regRes.Success || regRes.Token == "" || regRes.User.Email != "architect@alignify.dev" {
		t.Fatalf("invalid registration response: %+v", regRes)
	}
	if regRes.Workspace.ID == "" || regRes.BoardID == "" {
		t.Errorf("expected default workspace and board created upon registration")
	}

	// 2. Duplicate Registration Rejection
	recDup := httptest.NewRecorder()
	reqDup := httptest.NewRequest(http.MethodPost, "/api/auth/register", bytes.NewBuffer(regPayload))
	authH.Register(recDup, reqDup)
	if recDup.Code != http.StatusConflict {
		t.Errorf("expected 409 Conflict for duplicate email, got %d", recDup.Code)
	}

	// 3. Login with correct credentials
	loginPayload, _ := json.Marshal(map[string]string{
		"email":    "architect@alignify.dev",
		"password": "securePass123",
	})
	reqLogin := httptest.NewRequest(http.MethodPost, "/api/auth/login", bytes.NewBuffer(loginPayload))
	recLogin := httptest.NewRecorder()
	authH.Login(recLogin, reqLogin)

	if recLogin.Code != http.StatusOK {
		t.Fatalf("expected 200 OK on login, got %d", recLogin.Code)
	}

	// 4. Login with wrong password
	wrongLoginPayload, _ := json.Marshal(map[string]string{
		"email":    "architect@alignify.dev",
		"password": "wrongPassword",
	})
	reqWrong := httptest.NewRequest(http.MethodPost, "/api/auth/login", bytes.NewBuffer(wrongLoginPayload))
	recWrong := httptest.NewRecorder()
	authH.Login(recWrong, reqWrong)
	if recWrong.Code != http.StatusUnauthorized {
		t.Errorf("expected 401 Unauthorized for wrong password, got %d", recWrong.Code)
	}
}

func TestWorkspaceAndBoardHandlers_FullFlow(t *testing.T) {
	store, jwtMgr, authH, wsH, boardH := setupTestEnvironment()

	// 1. Create Owner and Editor users
	userOwner := &models.User{ID: "usr_owner", Email: "owner@alignify.dev", DisplayName: "Owner"}
	userEditor := &models.User{ID: "usr_editor", Email: "editor@alignify.dev", DisplayName: "Editor"}
	store.Users().CreateUser(context.Background(), userOwner)
	store.Users().CreateUser(context.Background(), userEditor)

	tokenOwner, _ := jwtMgr.GenerateToken(userOwner)
	claimsOwner, _ := jwtMgr.ValidateToken(tokenOwner)
	ctxOwner := context.WithValue(context.Background(), auth.UserClaimsContextKey, claimsOwner)

	tokenEditor, _ := jwtMgr.GenerateToken(userEditor)
	claimsEditor, _ := jwtMgr.ValidateToken(tokenEditor)
	ctxEditor := context.WithValue(context.Background(), auth.UserClaimsContextKey, claimsEditor)

	// 2. Owner creates a workspace
	wsPayload, _ := json.Marshal(map[string]string{
		"name":        "Cloud Infrastructure",
		"description": "AWS & GCP topologies",
	})
	reqCreateWs := httptest.NewRequest(http.MethodPost, "/api/workspaces", bytes.NewBuffer(wsPayload)).WithContext(ctxOwner)
	recCreateWs := httptest.NewRecorder()
	wsH.CreateWorkspace(recCreateWs, reqCreateWs)

	if recCreateWs.Code != http.StatusCreated {
		t.Fatalf("expected 201 Created on workspace create, got %d", recCreateWs.Code)
	}

	var createWsRes struct {
		Workspace models.Workspace `json:"workspace"`
	}
	_ = json.Unmarshal(recCreateWs.Body.Bytes(), &createWsRes)
	wsID := createWsRes.Workspace.ID

	// 3. Owner adds editor to workspace
	addMemberPayload, _ := json.Marshal(map[string]interface{}{
		"email": "editor@alignify.dev",
		"role":  "editor",
	})
	reqAddMem := httptest.NewRequest(http.MethodPost, "/api/workspaces/"+wsID+"/members", bytes.NewBuffer(addMemberPayload)).WithContext(ctxOwner)
	recAddMem := httptest.NewRecorder()
	wsH.AddMember(recAddMem, reqAddMem, wsID)

	if recAddMem.Code != http.StatusCreated {
		t.Fatalf("expected 201 Created on adding member, got %d (body: %s)", recAddMem.Code, recAddMem.Body.String())
	}

	// 4. Editor creates a board in the workspace
	boardPayload, _ := json.Marshal(map[string]interface{}{
		"name":        "Kubernetes Cluster",
		"description": "Control plane and worker nodes",
		"isPublic":    false,
	})
	reqCreateBoard := httptest.NewRequest(http.MethodPost, "/api/workspaces/"+wsID+"/boards", bytes.NewBuffer(boardPayload)).WithContext(ctxEditor)
	recCreateBoard := httptest.NewRecorder()
	boardH.CreateBoard(recCreateBoard, reqCreateBoard, wsID)

	if recCreateBoard.Code != http.StatusCreated {
		t.Fatalf("expected 201 Created on board create, got %d", recCreateBoard.Code)
	}

	var boardRes struct {
		Board models.Board `json:"board"`
	}
	_ = json.Unmarshal(recCreateBoard.Body.Bytes(), &boardRes)
	boardID := boardRes.Board.ID

	// 5. Get board details
	reqGetBoard := httptest.NewRequest(http.MethodGet, "/api/boards/"+boardID, nil).WithContext(ctxEditor)
	recGetBoard := httptest.NewRecorder()
	boardH.GetBoard(recGetBoard, reqGetBoard, boardID)

	if recGetBoard.Code != http.StatusOK {
		t.Fatalf("expected 200 OK on get board, got %d", recGetBoard.Code)
	}

	var getBoardRes struct {
		Board    models.Board `json:"board"`
		UserRole models.Role  `json:"userRole"`
	}
	_ = json.Unmarshal(recGetBoard.Body.Bytes(), &getBoardRes)
	if getBoardRes.UserRole != models.RoleEditor {
		t.Errorf("expected editor role, got %s", getBoardRes.UserRole)
	}

	_ = authH
}
