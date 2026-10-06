package handlers_test

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"alignify/collaboration/pkg/ai"
	"alignify/collaboration/pkg/auth"
	"alignify/collaboration/pkg/handlers"
	"alignify/collaboration/pkg/models"
	"alignify/collaboration/pkg/rooms"
	"alignify/collaboration/pkg/storage"
)

func setupAITestEnv(t *testing.T) (storage.Storage, *rooms.Hub, *handlers.AIHandler, *models.User, *models.User, *models.Board) {
	store := storage.NewMemoryStorage()
	hub := rooms.NewHub(store)
	provider := ai.NewMockAIProvider()
	aiHandler := handlers.NewAIHandler(store, hub, provider)

	ctx := context.Background()

	// 1. Create Editor User
	editor := &models.User{
		ID:          "usr_editor",
		Email:       "editor@alignify.dev",
		DisplayName: "Editor User",
		AvatarColor: "#6366f1",
	}
	_ = store.Users().CreateUser(ctx, editor)

	// 2. Create Viewer User
	viewer := &models.User{
		ID:          "usr_viewer",
		Email:       "viewer@alignify.dev",
		DisplayName: "Viewer User",
		AvatarColor: "#ec4899",
	}
	_ = store.Users().CreateUser(ctx, viewer)

	// 3. Create Workspace
	ws := &models.Workspace{
		ID:      "ws_ai_test",
		Name:    "AI Architecture Lab",
		OwnerID: editor.ID,
	}
	_ = store.Workspaces().CreateWorkspace(ctx, ws)

	_ = store.Workspaces().AddMember(ctx, &models.WorkspaceMembership{
		ID:          "mem_editor",
		WorkspaceID: ws.ID,
		UserID:      editor.ID,
		Role:        models.RoleEditor,
		CreatedAt:   time.Now().UTC(),
	})

	_ = store.Workspaces().AddMember(ctx, &models.WorkspaceMembership{
		ID:          "mem_viewer",
		WorkspaceID: ws.ID,
		UserID:      viewer.ID,
		Role:        models.RoleViewer,
		CreatedAt:   time.Now().UTC(),
	})

	// 4. Create Board
	board := &models.Board{
		ID:          "brd_ai_test",
		WorkspaceID: ws.ID,
		Name:        "Cloud Architecture Board",
		CreatedBy:   editor.ID,
	}
	_ = store.Boards().CreateBoard(ctx, board)

	return store, hub, aiHandler, editor, viewer, board
}

func contextWithUser(user *models.User) context.Context {
	return context.WithValue(context.Background(), auth.UserClaimsContextKey, &auth.UserClaims{
		UserID:      user.ID,
		Email:       user.Email,
		DisplayName: user.DisplayName,
	})
}

func TestAIHandler_Generate(t *testing.T) {
	store, _, aiHandler, editor, viewer, board := setupAITestEnv(t)

	// 1. Successful generation by editor
	payload := map[string]interface{}{
		"prompt":    "Build an e-commerce microservices platform with postgres and redis",
		"direction": "LR",
	}
	body, _ := json.Marshal(payload)

	req := httptest.NewRequest(http.MethodPost, "/api/boards/"+board.ID+"/ai/generate", bytes.NewBuffer(body))
	req = req.WithContext(contextWithUser(editor))
	w := httptest.NewRecorder()

	aiHandler.Generate(w, req, board.ID)

	if w.Code != http.StatusOK {
		t.Fatalf("Expected 200 OK, got %d: %s", w.Code, w.Body.String())
	}

	var resp ai.GenerateResponse
	if err := json.NewDecoder(w.Body).Decode(&resp); err != nil {
		t.Fatalf("Failed to decode response: %v", err)
	}

	if len(resp.Diagram.Nodes) == 0 || len(resp.Operations) == 0 {
		t.Errorf("Expected nodes and operations in generated response, got %d nodes, %d ops", len(resp.Diagram.Nodes), len(resp.Operations))
	}

	// Verify activity was logged
	activities, _ := store.Activity().GetActivitiesByBoardID(context.Background(), board.ID, 10, 0)
	if len(activities) == 0 {
		t.Error("Expected activity logged for AI generation")
	}

	// 2. Forbidden generation by viewer
	reqViewer := httptest.NewRequest(http.MethodPost, "/api/boards/"+board.ID+"/ai/generate", bytes.NewBuffer(body))
	reqViewer = reqViewer.WithContext(contextWithUser(viewer))
	wViewer := httptest.NewRecorder()

	aiHandler.Generate(wViewer, reqViewer, board.ID)
	if wViewer.Code != http.StatusForbidden {
		t.Errorf("Expected 403 Forbidden for viewer, got %d", wViewer.Code)
	}
}

func TestAIHandler_Modify(t *testing.T) {
	_, _, aiHandler, editor, viewer, board := setupAITestEnv(t)

	payload := map[string]interface{}{
		"prompt": "Add Redis cache to API service",
	}
	body, _ := json.Marshal(payload)

	// 1. Success by editor
	req := httptest.NewRequest(http.MethodPost, "/api/boards/"+board.ID+"/ai/modify", bytes.NewBuffer(body))
	req = req.WithContext(contextWithUser(editor))
	w := httptest.NewRecorder()

	aiHandler.Modify(w, req, board.ID)

	if w.Code != http.StatusOK {
		t.Fatalf("Expected 200 OK, got %d: %s", w.Code, w.Body.String())
	}

	var resp ai.ModifyResponse
	if err := json.NewDecoder(w.Body).Decode(&resp); err != nil {
		t.Fatalf("Failed to decode response: %v", err)
	}

	if len(resp.Operations) == 0 {
		t.Error("Expected modification operations in response")
	}

	// 2. Forbidden by viewer
	reqViewer := httptest.NewRequest(http.MethodPost, "/api/boards/"+board.ID+"/ai/modify", bytes.NewBuffer(body))
	reqViewer = reqViewer.WithContext(contextWithUser(viewer))
	wViewer := httptest.NewRecorder()

	aiHandler.Modify(wViewer, reqViewer, board.ID)
	if wViewer.Code != http.StatusForbidden {
		t.Errorf("Expected 403 Forbidden for viewer modification, got %d", wViewer.Code)
	}
}

func TestAIHandler_Analyze(t *testing.T) {
	_, _, aiHandler, _, viewer, board := setupAITestEnv(t)

	payload := map[string]interface{}{
		"objects": []map[string]interface{}{
			{
				"id":     "node_db",
				"type":   "rectangle",
				"x":      100.0,
				"y":      100.0,
				"width":  160.0,
				"height": 72.0,
				"metadata": map[string]interface{}{
					"label": "Postgres DB",
				},
			},
		},
	}
	body, _ := json.Marshal(payload)

	// Viewers CAN analyze diagrams
	req := httptest.NewRequest(http.MethodPost, "/api/boards/"+board.ID+"/ai/analyze", bytes.NewBuffer(body))
	req = req.WithContext(contextWithUser(viewer))
	w := httptest.NewRecorder()

	aiHandler.Analyze(w, req, board.ID)

	if w.Code != http.StatusOK {
		t.Fatalf("Expected 200 OK, got %d: %s", w.Code, w.Body.String())
	}

	var resp ai.AnalyzeResponse
	if err := json.NewDecoder(w.Body).Decode(&resp); err != nil {
		t.Fatalf("Failed to decode response: %v", err)
	}

	if resp.Report.OverallScore == 0 {
		t.Error("Expected valid analysis report with score")
	}
}

func TestAIHandler_Explain(t *testing.T) {
	_, _, aiHandler, editor, _, board := setupAITestEnv(t)

	payload := map[string]interface{}{
		"question": "Explain the architecture and data flows",
	}
	body, _ := json.Marshal(payload)

	req := httptest.NewRequest(http.MethodPost, "/api/boards/"+board.ID+"/ai/explain", bytes.NewBuffer(body))
	req = req.WithContext(contextWithUser(editor))
	w := httptest.NewRecorder()

	aiHandler.Explain(w, req, board.ID)

	if w.Code != http.StatusOK {
		t.Fatalf("Expected 200 OK, got %d: %s", w.Code, w.Body.String())
	}

	var resp ai.ExplainResponse
	if err := json.NewDecoder(w.Body).Decode(&resp); err != nil {
		t.Fatalf("Failed to decode response: %v", err)
	}

	if resp.Explanation.Summary == "" && resp.Explanation.FullText == "" {
		t.Error("Expected valid architecture explanation summary or full text")
	}
}

func TestAIHandler_MermaidExportAndImport(t *testing.T) {
	_, _, aiHandler, editor, viewer, board := setupAITestEnv(t)

	// 1. Export Mermaid
	exportReq := httptest.NewRequest(http.MethodPost, "/api/boards/"+board.ID+"/ai/mermaid/export", bytes.NewBufferString(`{"direction":"LR"}`))
	exportReq = exportReq.WithContext(contextWithUser(viewer)) // Viewers can export
	wExport := httptest.NewRecorder()

	aiHandler.ExportMermaid(wExport, exportReq, board.ID)
	if wExport.Code != http.StatusOK {
		t.Fatalf("Expected 200 OK for Mermaid export, got %d", wExport.Code)
	}

	// 2. Import Mermaid (Editor allowed, Viewer forbidden)
	importPayload := map[string]interface{}{
		"mermaid": "flowchart LR\n    A[Gateway] --> B[Service]\n",
	}
	importBody, _ := json.Marshal(importPayload)

	// Viewer import attempt
	importReqViewer := httptest.NewRequest(http.MethodPost, "/api/boards/"+board.ID+"/ai/mermaid/import", bytes.NewBuffer(importBody))
	importReqViewer = importReqViewer.WithContext(contextWithUser(viewer))
	wImportViewer := httptest.NewRecorder()

	aiHandler.ImportMermaid(wImportViewer, importReqViewer, board.ID)
	if wImportViewer.Code != http.StatusForbidden {
		t.Errorf("Expected 403 Forbidden for viewer Mermaid import, got %d", wImportViewer.Code)
	}

	// Editor import attempt
	importReqEditor := httptest.NewRequest(http.MethodPost, "/api/boards/"+board.ID+"/ai/mermaid/import", bytes.NewBuffer(importBody))
	importReqEditor = importReqEditor.WithContext(contextWithUser(editor))
	wImportEditor := httptest.NewRecorder()

	aiHandler.ImportMermaid(wImportEditor, importReqEditor, board.ID)
	if wImportEditor.Code != http.StatusOK {
		t.Fatalf("Expected 200 OK for editor Mermaid import, got %d: %s", wImportEditor.Code, wImportEditor.Body.String())
	}

	var importResp ai.GenerateResponse
	if err := json.NewDecoder(wImportEditor.Body).Decode(&importResp); err != nil {
		t.Fatalf("Failed to decode mermaid import response: %v", err)
	}

	if len(importResp.Diagram.Nodes) != 2 || len(importResp.Operations) == 0 {
		t.Errorf("Expected 2 nodes and operations in imported response, got %d nodes, %d ops", len(importResp.Diagram.Nodes), len(importResp.Operations))
	}
}
