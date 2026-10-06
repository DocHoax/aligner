package handlers

import (
	"encoding/json"
	"net/http"
	"strings"
	"time"

	"alignify/collaboration/pkg/auth"
	"alignify/collaboration/pkg/models"
	"alignify/collaboration/pkg/rooms"
	"alignify/collaboration/pkg/storage"
	"alignify/collaboration/pkg/utils"
)

type WorkspaceHandler struct {
	store storage.Storage
	hub   *rooms.Hub
}

func NewWorkspaceHandler(store storage.Storage, hubs ...*rooms.Hub) *WorkspaceHandler {
	var h *rooms.Hub
	if len(hubs) > 0 {
		h = hubs[0]
	}
	return &WorkspaceHandler{store: store, hub: h}
}

type CreateWorkspaceRequest struct {
	Name        string `json:"name"`
	Description string `json:"description"`
}

type UpdateWorkspaceRequest struct {
	Name        string `json:"name"`
	Description string `json:"description"`
}

type AddMemberRequest struct {
	Email string      `json:"email"`
	Role  models.Role `json:"role"`
}

type UpdateMemberRoleRequest struct {
	Role models.Role `json:"role"`
}

// ListWorkspaces returns all workspaces the user has access to
func (h *WorkspaceHandler) ListWorkspaces(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		WriteError(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}

	userID, ok := auth.GetUserIDFromContext(r.Context())
	if !ok {
		WriteError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	workspaces, err := h.store.Workspaces().GetWorkspacesByUserID(r.Context(), userID)
	if err != nil {
		WriteError(w, http.StatusInternalServerError, "Failed to retrieve workspaces: "+err.Error())
		return
	}

	if workspaces == nil {
		workspaces = []models.WorkspaceWithRole{}
	}

	WriteJSON(w, http.StatusOK, map[string]interface{}{
		"success":    true,
		"workspaces": workspaces,
	})
}

// CreateWorkspace creates a new workspace and assigns the caller as owner
func (h *WorkspaceHandler) CreateWorkspace(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		WriteError(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}

	userID, ok := auth.GetUserIDFromContext(r.Context())
	if !ok {
		WriteError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	var req CreateWorkspaceRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		WriteError(w, http.StatusBadRequest, "Invalid request payload")
		return
	}

	req.Name = strings.TrimSpace(req.Name)
	if req.Name == "" {
		WriteError(w, http.StatusBadRequest, "Workspace name is required")
		return
	}

	slug := strings.ToLower(strings.ReplaceAll(req.Name, " ", "-"))
	wsID := utils.GenerateID("ws")
	ws := &models.Workspace{
		ID:          wsID,
		Name:        req.Name,
		Slug:        slug,
		Description: req.Description,
		OwnerID:     userID,
		CreatedAt:   time.Now().UTC(),
		UpdatedAt:   time.Now().UTC(),
	}

	if err := h.store.Workspaces().CreateWorkspace(r.Context(), ws); err != nil {
		WriteError(w, http.StatusInternalServerError, "Failed to create workspace: "+err.Error())
		return
	}

	// Add membership
	_ = h.store.Workspaces().AddMember(r.Context(), &models.WorkspaceMembership{
		ID:          utils.GenerateID("mem"),
		WorkspaceID: ws.ID,
		UserID:      userID,
		Role:        models.RoleOwner,
		CreatedAt:   time.Now().UTC(),
		UpdatedAt:   time.Now().UTC(),
	})

	WriteJSON(w, http.StatusCreated, map[string]interface{}{
		"success":   true,
		"workspace": ws,
		"userRole":  models.RoleOwner,
	})
}

// GetWorkspace returns details for a single workspace
func (h *WorkspaceHandler) GetWorkspace(w http.ResponseWriter, r *http.Request, workspaceID string) {
	userID, ok := auth.GetUserIDFromContext(r.Context())
	if !ok {
		WriteError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	membership, err := h.store.Workspaces().GetMembership(r.Context(), workspaceID, userID)
	if err != nil {
		WriteError(w, http.StatusForbidden, "Access denied or workspace does not exist")
		return
	}

	ws, err := h.store.Workspaces().GetWorkspaceByID(r.Context(), workspaceID)
	if err != nil {
		WriteError(w, http.StatusNotFound, "Workspace not found")
		return
	}

	WriteJSON(w, http.StatusOK, map[string]interface{}{
		"success":   true,
		"workspace": ws,
		"userRole":  membership.Role,
	})
}

// UpdateWorkspace updates workspace details
func (h *WorkspaceHandler) UpdateWorkspace(w http.ResponseWriter, r *http.Request, workspaceID string) {
	userID, ok := auth.GetUserIDFromContext(r.Context())
	if !ok {
		WriteError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	membership, err := h.store.Workspaces().GetMembership(r.Context(), workspaceID, userID)
	if err != nil || !membership.Role.CanWrite() {
		WriteError(w, http.StatusForbidden, "Only workspace owners and editors can update settings")
		return
	}

	var req UpdateWorkspaceRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		WriteError(w, http.StatusBadRequest, "Invalid request payload")
		return
	}

	ws, err := h.store.Workspaces().GetWorkspaceByID(r.Context(), workspaceID)
	if err != nil {
		WriteError(w, http.StatusNotFound, "Workspace not found")
		return
	}

	if strings.TrimSpace(req.Name) != "" {
		ws.Name = strings.TrimSpace(req.Name)
		ws.Slug = strings.ToLower(strings.ReplaceAll(ws.Name, " ", "-"))
	}
	ws.Description = req.Description

	if err := h.store.Workspaces().UpdateWorkspace(r.Context(), ws); err != nil {
		WriteError(w, http.StatusInternalServerError, "Failed to update workspace: "+err.Error())
		return
	}

	WriteJSON(w, http.StatusOK, map[string]interface{}{
		"success":   true,
		"workspace": ws,
	})
}

// DeleteWorkspace deletes a workspace
func (h *WorkspaceHandler) DeleteWorkspace(w http.ResponseWriter, r *http.Request, workspaceID string) {
	userID, ok := auth.GetUserIDFromContext(r.Context())
	if !ok {
		WriteError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	membership, err := h.store.Workspaces().GetMembership(r.Context(), workspaceID, userID)
	if err != nil || !membership.Role.CanAdmin() {
		WriteError(w, http.StatusForbidden, "Only the workspace owner can delete this workspace")
		return
	}

	if err := h.store.Workspaces().DeleteWorkspace(r.Context(), workspaceID); err != nil {
		WriteError(w, http.StatusInternalServerError, "Failed to delete workspace: "+err.Error())
		return
	}

	WriteJSON(w, http.StatusOK, map[string]interface{}{
		"success": true,
		"message": "Workspace deleted successfully",
	})
}

// GetMembers returns all members of a workspace
func (h *WorkspaceHandler) GetMembers(w http.ResponseWriter, r *http.Request, workspaceID string) {
	userID, ok := auth.GetUserIDFromContext(r.Context())
	if !ok {
		WriteError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	_, err := h.store.Workspaces().GetMembership(r.Context(), workspaceID, userID)
	if err != nil {
		WriteError(w, http.StatusForbidden, "Access denied to workspace members")
		return
	}

	members, err := h.store.Workspaces().GetMembers(r.Context(), workspaceID)
	if err != nil {
		WriteError(w, http.StatusInternalServerError, "Failed to retrieve members: "+err.Error())
		return
	}

	if members == nil {
		members = []models.WorkspaceMember{}
	}

	WriteJSON(w, http.StatusOK, map[string]interface{}{
		"success": true,
		"members": members,
	})
}

// AddMember invites or adds a member to the workspace
func (h *WorkspaceHandler) AddMember(w http.ResponseWriter, r *http.Request, workspaceID string) {
	userID, ok := auth.GetUserIDFromContext(r.Context())
	if !ok {
		WriteError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	membership, err := h.store.Workspaces().GetMembership(r.Context(), workspaceID, userID)
	if err != nil || !membership.Role.CanAdmin() {
		WriteError(w, http.StatusForbidden, "Only workspace owners can add new members")
		return
	}

	var req AddMemberRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		WriteError(w, http.StatusBadRequest, "Invalid request payload")
		return
	}

	req.Email = strings.TrimSpace(strings.ToLower(req.Email))
	if req.Email == "" || !strings.Contains(req.Email, "@") {
		WriteError(w, http.StatusBadRequest, "A valid user email is required")
		return
	}

	if !req.Role.IsValid() {
		req.Role = models.RoleEditor
	}

	// Check if target user exists in database
	targetUser, err := h.store.Users().GetUserByEmail(r.Context(), req.Email)
	if err != nil {
		// If user doesn't exist yet, automatically create an invited user account
		targetUser = &models.User{
			ID:           utils.GenerateID("usr"),
			Email:        req.Email,
			DisplayName:  strings.Split(req.Email, "@")[0],
			AvatarColor:  "#6366f1",
			PasswordHash: "$2a$10$UninitializedAccountPlaceholderHashValue",
			CreatedAt:    time.Now().UTC(),
			UpdatedAt:    time.Now().UTC(),
		}
		_ = h.store.Users().CreateUser(r.Context(), targetUser)
	}

	// Check if already a member
	existingMem, _ := h.store.Workspaces().GetMembership(r.Context(), workspaceID, targetUser.ID)
	if existingMem != nil {
		WriteError(w, http.StatusConflict, "User is already a member of this workspace")
		return
	}

	newMembership := &models.WorkspaceMembership{
		ID:          utils.GenerateID("mem"),
		WorkspaceID: workspaceID,
		UserID:      targetUser.ID,
		Role:        req.Role,
		CreatedAt:   time.Now().UTC(),
		UpdatedAt:   time.Now().UTC(),
	}

	if err := h.store.Workspaces().AddMember(r.Context(), newMembership); err != nil {
		WriteError(w, http.StatusInternalServerError, "Failed to add member: "+err.Error())
		return
	}

	WriteJSON(w, http.StatusCreated, map[string]interface{}{
		"success": true,
		"member": models.WorkspaceMember{
			UserID:      targetUser.ID,
			Email:       targetUser.Email,
			DisplayName: targetUser.DisplayName,
			AvatarColor: targetUser.AvatarColor,
			Role:        req.Role,
			JoinedAt:    newMembership.CreatedAt,
		},
	})
}

// UpdateMemberRole updates a member's role
func (h *WorkspaceHandler) UpdateMemberRole(w http.ResponseWriter, r *http.Request, workspaceID, memberUserID string) {
	userID, ok := auth.GetUserIDFromContext(r.Context())
	if !ok {
		WriteError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	membership, err := h.store.Workspaces().GetMembership(r.Context(), workspaceID, userID)
	if err != nil || !membership.Role.CanAdmin() {
		WriteError(w, http.StatusForbidden, "Only workspace owners can update member roles")
		return
	}

	var req UpdateMemberRoleRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		WriteError(w, http.StatusBadRequest, "Invalid request payload")
		return
	}

	if !req.Role.IsValid() {
		WriteError(w, http.StatusBadRequest, "Invalid role specified")
		return
	}

	if err := h.store.Workspaces().UpdateMemberRole(r.Context(), workspaceID, memberUserID, req.Role); err != nil {
		WriteError(w, http.StatusInternalServerError, "Failed to update member role: "+err.Error())
		return
	}

	// Propagate updated role to any active board rooms in this workspace
	if h.hub != nil {
		if boards, err := h.store.Boards().GetBoardsByWorkspaceID(r.Context(), workspaceID); err == nil {
			for _, b := range boards {
				h.hub.UpdateUserRoleInBoard(b.ID, memberUserID, req.Role)
			}
		}
	}

	WriteJSON(w, http.StatusOK, map[string]interface{}{
		"success": true,
		"message": "Role updated successfully",
	})
}

// RemoveMember removes a user from the workspace
func (h *WorkspaceHandler) RemoveMember(w http.ResponseWriter, r *http.Request, workspaceID, memberUserID string) {
	userID, ok := auth.GetUserIDFromContext(r.Context())
	if !ok {
		WriteError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	membership, err := h.store.Workspaces().GetMembership(r.Context(), workspaceID, userID)
	if err != nil {
		WriteError(w, http.StatusForbidden, "Access denied")
		return
	}

	// Only owner can remove others; users can remove themselves (leave workspace)
	if userID != memberUserID && !membership.Role.CanAdmin() {
		WriteError(w, http.StatusForbidden, "Only workspace owners can remove other members")
		return
	}

	if err := h.store.Workspaces().RemoveMember(r.Context(), workspaceID, memberUserID); err != nil {
		WriteError(w, http.StatusInternalServerError, "Failed to remove member: "+err.Error())
		return
	}

	// Terminate active WebSocket sessions in this workspace's boards
	if h.hub != nil {
		if boards, err := h.store.Boards().GetBoardsByWorkspaceID(r.Context(), workspaceID); err == nil {
			for _, b := range boards {
				h.hub.DisconnectUserFromBoard(b.ID, memberUserID, "Membership revoked from workspace")
			}
		}
	}

	WriteJSON(w, http.StatusOK, map[string]interface{}{
		"success": true,
		"message": "Member removed successfully",
	})
}
