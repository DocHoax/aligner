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

type AuthHandler struct {
	store      storage.Storage
	jwtManager *auth.JWTManager
}

func NewAuthHandler(store storage.Storage, jwtManager *auth.JWTManager) *AuthHandler {
	return &AuthHandler{
		store:      store,
		jwtManager: jwtManager,
	}
}

type RegisterRequest struct {
	Email       string `json:"email"`
	Password    string `json:"password"`
	DisplayName string `json:"displayName"`
	AvatarColor string `json:"avatarColor"`
}

type LoginRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

type UpdateProfileRequest struct {
	DisplayName     string `json:"displayName"`
	AvatarColor     string `json:"avatarColor"`
	CurrentPassword string `json:"currentPassword,omitempty"`
	NewPassword     string `json:"newPassword,omitempty"`
}

// Register creates a new user account, a default personal workspace, and returns a JWT
func (h *AuthHandler) Register(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		WriteError(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}

	var req RegisterRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		WriteError(w, http.StatusBadRequest, "Invalid request payload")
		return
	}

	req.Email = strings.TrimSpace(strings.ToLower(req.Email))
	req.DisplayName = strings.TrimSpace(req.DisplayName)

	if req.Email == "" || !strings.Contains(req.Email, "@") {
		WriteError(w, http.StatusBadRequest, "A valid email address is required")
		return
	}
	if len(req.Password) < 6 {
		WriteError(w, http.StatusBadRequest, "Password must be at least 6 characters")
		return
	}
	if req.DisplayName == "" {
		req.DisplayName = strings.Split(req.Email, "@")[0]
	}
	if req.AvatarColor == "" {
		colors := []string{"#3b82f6", "#10b981", "#8b5cf6", "#f59e0b", "#ef4444", "#06b6d4", "#ec4899"}
		req.AvatarColor = colors[time.Now().UnixNano()%int64(len(colors))]
	}

	// 1. Hash password
	passwordHash, err := auth.HashPassword(req.Password)
	if err != nil {
		WriteError(w, http.StatusInternalServerError, "Failed to secure password")
		return
	}

	// 2. Create User
	userID := utils.GenerateID("usr")
	user := &models.User{
		ID:           userID,
		Email:        req.Email,
		PasswordHash: passwordHash,
		DisplayName:  req.DisplayName,
		AvatarColor:  req.AvatarColor,
		CreatedAt:    time.Now().UTC(),
		UpdatedAt:    time.Now().UTC(),
	}

	if err := h.store.Users().CreateUser(r.Context(), user); err != nil {
		if err == storage.ErrAlreadyExists {
			WriteError(w, http.StatusConflict, "An account with this email already exists")
			return
		}
		WriteError(w, http.StatusInternalServerError, "Failed to create user account: "+err.Error())
		return
	}

	// 3. Create default Personal Workspace
	wsID := utils.GenerateID("ws")
	workspace := &models.Workspace{
		ID:          wsID,
		Name:        user.DisplayName + "'s Workspace",
		Slug:        "personal",
		Description: "Your personal workspace for architecture diagrams and models.",
		OwnerID:     user.ID,
		CreatedAt:   time.Now().UTC(),
		UpdatedAt:   time.Now().UTC(),
	}

	if err := h.store.Workspaces().CreateWorkspace(r.Context(), workspace); err != nil {
		WriteError(w, http.StatusInternalServerError, "Failed to create personal workspace")
		return
	}

	if err := h.store.Workspaces().AddMember(r.Context(), &models.WorkspaceMembership{
		ID:          utils.GenerateID("mem"),
		WorkspaceID: wsID,
		UserID:      user.ID,
		Role:        models.RoleOwner,
		CreatedAt:   time.Now().UTC(),
		UpdatedAt:   time.Now().UTC(),
	}); err != nil {
		WriteError(w, http.StatusInternalServerError, "Failed to initialize workspace membership")
		return
	}

	// 4. Create default starter Board
	boardID := utils.GenerateID("brd")
	starterBoard := &models.Board{
		ID:          boardID,
		WorkspaceID: wsID,
		Name:        "Architecture Canvas",
		Description: "Welcome to Alignify! Start collaborating and drawing diagrams.",
		CreatedBy:   user.ID,
		IsPublic:    false,
		CreatedAt:   time.Now().UTC(),
		UpdatedAt:   time.Now().UTC(),
	}
	if err := h.store.Boards().CreateBoard(r.Context(), starterBoard); err != nil {
		WriteError(w, http.StatusInternalServerError, "Failed to create starter board")
		return
	}

	// 5. Generate JWT Token
	token, err := h.jwtManager.GenerateToken(user)
	if err != nil {
		WriteError(w, http.StatusInternalServerError, "Failed to generate authentication token")
		return
	}

	WriteJSON(w, http.StatusCreated, map[string]interface{}{
		"success":   true,
		"token":     token,
		"user":      user.ToPublic(),
		"workspace": workspace,
		"boardId":   boardID,
	})
}

// Login verifies credentials and returns a JWT
func (h *AuthHandler) Login(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		WriteError(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}

	var req LoginRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		WriteError(w, http.StatusBadRequest, "Invalid request payload")
		return
	}

	req.Email = strings.TrimSpace(strings.ToLower(req.Email))
	if req.Email == "" || req.Password == "" {
		WriteError(w, http.StatusBadRequest, "Email and password are required")
		return
	}

	user, err := h.store.Users().GetUserByEmail(r.Context(), req.Email)
	if err != nil {
		WriteError(w, http.StatusUnauthorized, "Invalid email or password")
		return
	}

	if !auth.CheckPasswordHash(req.Password, user.PasswordHash) {
		WriteError(w, http.StatusUnauthorized, "Invalid email or password")
		return
	}

	token, err := h.jwtManager.GenerateToken(user)
	if err != nil {
		WriteError(w, http.StatusInternalServerError, "Failed to generate authentication token")
		return
	}

	WriteJSON(w, http.StatusOK, map[string]interface{}{
		"success": true,
		"token":   token,
		"user":    user.ToPublic(),
	})
}

// Logout acknowledges user sign-out
func (h *AuthHandler) Logout(w http.ResponseWriter, r *http.Request) {
	WriteJSON(w, http.StatusOK, map[string]interface{}{
		"success": true,
		"message": "Logged out successfully",
	})
}

// GetMe returns the profile of the current authenticated user
func (h *AuthHandler) GetMe(w http.ResponseWriter, r *http.Request) {
	userID, ok := auth.GetUserIDFromContext(r.Context())
	if !ok {
		WriteError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	user, err := h.store.Users().GetUserByID(r.Context(), userID)
	if err != nil {
		WriteError(w, http.StatusNotFound, "User not found")
		return
	}

	WriteJSON(w, http.StatusOK, map[string]interface{}{
		"success": true,
		"user":    user.ToPublic(),
	})
}

// UpdateProfile allows updating display name, avatar color, or password
func (h *AuthHandler) UpdateProfile(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPatch && r.Method != http.MethodPut {
		WriteError(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}

	userID, ok := auth.GetUserIDFromContext(r.Context())
	if !ok {
		WriteError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	var req UpdateProfileRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		WriteError(w, http.StatusBadRequest, "Invalid request payload")
		return
	}

	user, err := h.store.Users().GetUserByID(r.Context(), userID)
	if err != nil {
		WriteError(w, http.StatusNotFound, "User not found")
		return
	}

	if strings.TrimSpace(req.DisplayName) != "" {
		user.DisplayName = strings.TrimSpace(req.DisplayName)
	}
	if strings.TrimSpace(req.AvatarColor) != "" {
		user.AvatarColor = strings.TrimSpace(req.AvatarColor)
	}

	if req.NewPassword != "" {
		if req.CurrentPassword == "" {
			WriteError(w, http.StatusBadRequest, "Current password is required to set a new password")
			return
		}
		if !auth.CheckPasswordHash(req.CurrentPassword, user.PasswordHash) {
			WriteError(w, http.StatusBadRequest, "Incorrect current password")
			return
		}
		if len(req.NewPassword) < 6 {
			WriteError(w, http.StatusBadRequest, "New password must be at least 6 characters")
			return
		}
		newHash, err := auth.HashPassword(req.NewPassword)
		if err != nil {
			WriteError(w, http.StatusInternalServerError, "Failed to hash password")
			return
		}
		user.PasswordHash = newHash
	}

	if err := h.store.Users().UpdateUser(r.Context(), user); err != nil {
		WriteError(w, http.StatusInternalServerError, "Failed to update profile: "+err.Error())
		return
	}

	WriteJSON(w, http.StatusOK, map[string]interface{}{
		"success": true,
		"user":    user.ToPublic(),
	})
}
