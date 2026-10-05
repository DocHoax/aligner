package handlers

import (
	"encoding/json"
	"net/http"
	"strings"
	"time"

	"alignify/collaboration/pkg/auth"
	"alignify/collaboration/pkg/models"
	"alignify/collaboration/pkg/storage"
	"alignify/collaboration/pkg/utils"
)

type BoardHandler struct {
	store storage.Storage
}

func NewBoardHandler(store storage.Storage) *BoardHandler {
	return &BoardHandler{store: store}
}

type CreateBoardRequest struct {
	Name        string `json:"name"`
	Description string `json:"description"`
	IsPublic    bool   `json:"isPublic"`
}

type UpdateBoardRequest struct {
	Name        string `json:"name"`
	Description string `json:"description"`
	IsPublic    *bool  `json:"isPublic,omitempty"`
}

// ListWorkspaceBoards returns all boards in a workspace
func (h *BoardHandler) ListWorkspaceBoards(w http.ResponseWriter, r *http.Request, workspaceID string) {
	if r.Method != http.MethodGet {
		WriteError(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}

	userID, ok := auth.GetUserIDFromContext(r.Context())
	if !ok {
		WriteError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	// Verify membership
	_, err := h.store.Workspaces().GetMembership(r.Context(), workspaceID, userID)
	if err != nil {
		WriteError(w, http.StatusForbidden, "Access denied to workspace")
		return
	}

	boards, err := h.store.Boards().GetBoardsByWorkspaceID(r.Context(), workspaceID)
	if err != nil {
		WriteError(w, http.StatusInternalServerError, "Failed to retrieve boards: "+err.Error())
		return
	}

	if boards == nil {
		boards = []models.Board{}
	}

	WriteJSON(w, http.StatusOK, map[string]interface{}{
		"success": true,
		"boards":  boards,
	})
}

// CreateBoard creates a new board inside a workspace
func (h *BoardHandler) CreateBoard(w http.ResponseWriter, r *http.Request, workspaceID string) {
	if r.Method != http.MethodPost {
		WriteError(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}

	userID, ok := auth.GetUserIDFromContext(r.Context())
	if !ok {
		WriteError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	membership, err := h.store.Workspaces().GetMembership(r.Context(), workspaceID, userID)
	if err != nil || !membership.Role.CanWrite() {
		WriteError(w, http.StatusForbidden, "Viewers cannot create new boards in this workspace")
		return
	}

	var req CreateBoardRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		WriteError(w, http.StatusBadRequest, "Invalid request payload")
		return
	}

	req.Name = strings.TrimSpace(req.Name)
	if req.Name == "" {
		req.Name = "Untitled Diagram"
	}

	boardID := utils.GenerateID("brd")
	board := &models.Board{
		ID:          boardID,
		WorkspaceID: workspaceID,
		Name:        req.Name,
		Description: req.Description,
		CreatedBy:   userID,
		IsPublic:    req.IsPublic,
		CreatedAt:   time.Now().UTC(),
		UpdatedAt:   time.Now().UTC(),
	}

	if err := h.store.Boards().CreateBoard(r.Context(), board); err != nil {
		WriteError(w, http.StatusInternalServerError, "Failed to create board: "+err.Error())
		return
	}

	WriteJSON(w, http.StatusCreated, map[string]interface{}{
		"success":  true,
		"board":    board,
		"userRole": membership.Role,
	})
}

// GetBoard returns metadata and effective role for a board
func (h *BoardHandler) GetBoard(w http.ResponseWriter, r *http.Request, boardID string) {
	board, err := h.store.Boards().GetBoardByID(r.Context(), boardID)
	if err != nil {
		WriteError(w, http.StatusNotFound, "Board not found")
		return
	}

	userID, _ := auth.GetUserIDFromContext(r.Context())
	role, err := h.store.Boards().GetBoardEffectiveRole(r.Context(), boardID, userID)
	if err != nil {
		if board.IsPublic {
			role = models.RoleViewer
		} else {
			WriteError(w, http.StatusForbidden, "Access denied to board")
			return
		}
	}

	// Fetch parent workspace name
	wsName := ""
	if ws, err := h.store.Workspaces().GetWorkspaceByID(r.Context(), board.WorkspaceID); err == nil {
		wsName = ws.Name
	}

	WriteJSON(w, http.StatusOK, map[string]interface{}{
		"success":       true,
		"board":         board,
		"userRole":      role,
		"workspaceName": wsName,
	})
}

// UpdateBoard updates board name, description, or visibility
func (h *BoardHandler) UpdateBoard(w http.ResponseWriter, r *http.Request, boardID string) {
	userID, ok := auth.GetUserIDFromContext(r.Context())
	if !ok {
		WriteError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	role, err := h.store.Boards().GetBoardEffectiveRole(r.Context(), boardID, userID)
	if err != nil || !role.CanWrite() {
		WriteError(w, http.StatusForbidden, "Only editors and owners can edit board details")
		return
	}

	board, err := h.store.Boards().GetBoardByID(r.Context(), boardID)
	if err != nil {
		WriteError(w, http.StatusNotFound, "Board not found")
		return
	}

	var req UpdateBoardRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		WriteError(w, http.StatusBadRequest, "Invalid request payload")
		return
	}

	if strings.TrimSpace(req.Name) != "" {
		board.Name = strings.TrimSpace(req.Name)
	}
	if req.Description != "" {
		board.Description = req.Description
	}
	if req.IsPublic != nil {
		board.IsPublic = *req.IsPublic
	}

	if err := h.store.Boards().UpdateBoard(r.Context(), board); err != nil {
		WriteError(w, http.StatusInternalServerError, "Failed to update board: "+err.Error())
		return
	}

	WriteJSON(w, http.StatusOK, map[string]interface{}{
		"success": true,
		"board":   board,
	})
}

// DeleteBoard deletes a board
func (h *BoardHandler) DeleteBoard(w http.ResponseWriter, r *http.Request, boardID string) {
	userID, ok := auth.GetUserIDFromContext(r.Context())
	if !ok {
		WriteError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	board, err := h.store.Boards().GetBoardByID(r.Context(), boardID)
	if err != nil {
		WriteError(w, http.StatusNotFound, "Board not found")
		return
	}

	// Must be workspace owner or board creator
	membership, _ := h.store.Workspaces().GetMembership(r.Context(), board.WorkspaceID, userID)
	isOwner := membership != nil && membership.Role.CanAdmin()
	isCreator := board.CreatedBy == userID

	if !isOwner && !isCreator {
		WriteError(w, http.StatusForbidden, "Only the workspace owner or board creator can delete this board")
		return
	}

	if err := h.store.Boards().DeleteBoard(r.Context(), boardID); err != nil {
		WriteError(w, http.StatusInternalServerError, "Failed to delete board: "+err.Error())
		return
	}

	WriteJSON(w, http.StatusOK, map[string]interface{}{
		"success": true,
		"message": "Board deleted successfully",
	})
}

// ExportBoard exports the board metadata and snapshot
func (h *BoardHandler) ExportBoard(w http.ResponseWriter, r *http.Request, boardID string) {
	board, err := h.store.Boards().GetBoardByID(r.Context(), boardID)
	if err != nil {
		WriteError(w, http.StatusNotFound, "Board not found")
		return
	}

	userID, _ := auth.GetUserIDFromContext(r.Context())
	_, err = h.store.Boards().GetBoardEffectiveRole(r.Context(), boardID, userID)
	if err != nil && !board.IsPublic {
		WriteError(w, http.StatusForbidden, "Access denied")
		return
	}

	snapshot, _ := h.store.Snapshots().GetLatestSnapshot(r.Context(), boardID)
	var objects json.RawMessage
	if snapshot != nil {
		objects = snapshot.Data
	} else {
		objects = json.RawMessage(`[]`)
	}

	WriteJSON(w, http.StatusOK, map[string]interface{}{
		"success":     true,
		"board":       board,
		"exportedAt":  time.Now().UTC(),
		"objects":     objects,
		"snapshotSeq": func() int64 { if snapshot != nil { return snapshot.Seq }; return 0 }(),
	})
}
