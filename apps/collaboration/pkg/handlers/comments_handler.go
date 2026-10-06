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

type CommentHandler struct {
	store storage.Storage
}

func NewCommentHandler(store storage.Storage) *CommentHandler {
	return &CommentHandler{store: store}
}

type CreateCommentRequest struct {
	ParentID       *string  `json:"parentId,omitempty"`
	Content        string   `json:"content"`
	X              *float64 `json:"x,omitempty"`
	Y              *float64 `json:"y,omitempty"`
	TargetObjectID *string  `json:"targetObjectId,omitempty"`
}

type UpdateCommentRequest struct {
	Content  *string `json:"content,omitempty"`
	Resolved *bool   `json:"resolved,omitempty"`
}

// GetComments retrieves all threaded comments for a board
func (h *CommentHandler) GetComments(w http.ResponseWriter, r *http.Request, boardID string) {
	board, err := h.store.Boards().GetBoardByID(r.Context(), boardID)
	if err != nil {
		WriteError(w, http.StatusNotFound, "Board not found")
		return
	}

	userID, _ := auth.GetUserIDFromContext(r.Context())
	_, err = h.store.Boards().GetBoardEffectiveRole(r.Context(), boardID, userID)
	if err != nil && !board.IsPublic {
		WriteError(w, http.StatusForbidden, "Access denied to board comments")
		return
	}

	comments, err := h.store.Comments().GetCommentsByBoardID(r.Context(), boardID)
	if err != nil {
		WriteError(w, http.StatusInternalServerError, "Failed to retrieve comments: "+err.Error())
		return
	}

	if comments == nil {
		comments = []models.BoardComment{}
	}

	WriteJSON(w, http.StatusOK, map[string]interface{}{
		"success":  true,
		"comments": comments,
	})
}

// CreateComment posts a new root comment or reply
func (h *CommentHandler) CreateComment(w http.ResponseWriter, r *http.Request, boardID string) {
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

	role, err := h.store.Boards().GetBoardEffectiveRole(r.Context(), boardID, userID)
	if err != nil && !board.IsPublic {
		WriteError(w, http.StatusForbidden, "Access denied to board")
		return
	}
	if !board.IsPublic && !role.IsValid() {
		WriteError(w, http.StatusForbidden, "Access denied to board")
		return
	}

	var req CreateCommentRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		WriteError(w, http.StatusBadRequest, "Invalid request payload")
		return
	}

	req.Content = strings.TrimSpace(req.Content)
	if req.Content == "" {
		WriteError(w, http.StatusBadRequest, "Comment content cannot be empty")
		return
	}

	// Fetch author profile
	user, err := h.store.Users().GetUserByID(r.Context(), userID)
	userName := ""
	userColor := "#3B82F6"
	if err == nil && user != nil {
		userName = user.DisplayName
		if user.AvatarColor != "" {
			userColor = user.AvatarColor
		}
	}

	commentID := utils.GenerateID("cmt")
	comment := &models.BoardComment{
		ID:              commentID,
		BoardID:         boardID,
		ParentID:        req.ParentID,
		UserID:          userID,
		UserName:        userName,
		UserAvatarColor: userColor,
		Content:         req.Content,
		X:               req.X,
		Y:               req.Y,
		TargetObjectID:  req.TargetObjectID,
		Resolved:        false,
		CreatedAt:       time.Now().UTC(),
		UpdatedAt:       time.Now().UTC(),
		Replies:         []models.BoardComment{},
	}

	if err := h.store.Comments().CreateComment(r.Context(), comment); err != nil {
		WriteError(w, http.StatusInternalServerError, "Failed to create comment: "+err.Error())
		return
	}

	// Audit activity
	actionDesc := "added a comment"
	if req.ParentID != nil && *req.ParentID != "" {
		actionDesc = "replied to a comment"
	}
	_ = h.store.Activity().LogActivity(r.Context(), &models.BoardActivity{
		BoardID:         boardID,
		UserID:          userID,
		UserName:        userName,
		UserAvatarColor: userColor,
		ActionType:      "comment_created",
		Description:     actionDesc,
		Metadata:        json.RawMessage(`{"commentId":"` + commentID + `"}`),
		CreatedAt:       time.Now().UTC(),
	})

	WriteJSON(w, http.StatusCreated, map[string]interface{}{
		"success": true,
		"comment": comment,
	})
}

// UpdateComment updates comment content or resolution status
func (h *CommentHandler) UpdateComment(w http.ResponseWriter, r *http.Request, boardID, commentID string) {
	userID, ok := auth.GetUserIDFromContext(r.Context())
	if !ok {
		WriteError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	comment, err := h.store.Comments().GetCommentByID(r.Context(), commentID)
	if err != nil {
		WriteError(w, http.StatusNotFound, "Comment not found")
		return
	}

	if comment.BoardID != boardID {
		WriteError(w, http.StatusBadRequest, "Comment does not belong to specified board")
		return
	}

	role, _ := h.store.Boards().GetBoardEffectiveRole(r.Context(), boardID, userID)
	isAuthor := comment.UserID == userID
	canManage := isAuthor || role.CanWrite()

	if !canManage {
		WriteError(w, http.StatusForbidden, "You do not have permission to update this comment")
		return
	}

	var req UpdateCommentRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		WriteError(w, http.StatusBadRequest, "Invalid request payload")
		return
	}

	now := time.Now().UTC()
	if req.Content != nil && isAuthor {
		trimmed := strings.TrimSpace(*req.Content)
		if trimmed != "" {
			comment.Content = trimmed
		}
	}

	if req.Resolved != nil {
		comment.Resolved = *req.Resolved
		if *req.Resolved {
			comment.ResolvedBy = &userID
			comment.ResolvedAt = &now
		} else {
			comment.ResolvedBy = nil
			comment.ResolvedAt = nil
		}
	}
	comment.UpdatedAt = now

	if err := h.store.Comments().UpdateComment(r.Context(), comment); err != nil {
		WriteError(w, http.StatusInternalServerError, "Failed to update comment: "+err.Error())
		return
	}

	// Audit activity if resolved state changed
	if req.Resolved != nil {
		actionType := "comment_resolved"
		desc := "resolved a comment thread"
		if !*req.Resolved {
			actionType = "comment_reopened"
			desc = "reopened a comment thread"
		}
		user, _ := h.store.Users().GetUserByID(r.Context(), userID)
		uName := ""
		uColor := ""
		if user != nil {
			uName = user.DisplayName
			uColor = user.AvatarColor
		}
		_ = h.store.Activity().LogActivity(r.Context(), &models.BoardActivity{
			BoardID:         boardID,
			UserID:          userID,
			UserName:        uName,
			UserAvatarColor: uColor,
			ActionType:      actionType,
			Description:     desc,
			Metadata:        json.RawMessage(`{"commentId":"` + commentID + `"}`),
			CreatedAt:       now,
		})
	}

	WriteJSON(w, http.StatusOK, map[string]interface{}{
		"success": true,
		"comment": comment,
	})
}

// DeleteComment removes a comment
func (h *CommentHandler) DeleteComment(w http.ResponseWriter, r *http.Request, boardID, commentID string) {
	userID, ok := auth.GetUserIDFromContext(r.Context())
	if !ok {
		WriteError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	comment, err := h.store.Comments().GetCommentByID(r.Context(), commentID)
	if err != nil {
		WriteError(w, http.StatusNotFound, "Comment not found")
		return
	}

	if comment.BoardID != boardID {
		WriteError(w, http.StatusBadRequest, "Comment does not belong to specified board")
		return
	}

	role, _ := h.store.Boards().GetBoardEffectiveRole(r.Context(), boardID, userID)
	isAuthor := comment.UserID == userID
	canDelete := isAuthor || role.CanAdmin()

	if !canDelete {
		WriteError(w, http.StatusForbidden, "You do not have permission to delete this comment")
		return
	}

	if err := h.store.Comments().DeleteComment(r.Context(), commentID); err != nil {
		WriteError(w, http.StatusInternalServerError, "Failed to delete comment: "+err.Error())
		return
	}

	WriteJSON(w, http.StatusOK, map[string]interface{}{
		"success": true,
		"message": "Comment deleted successfully",
	})
}
