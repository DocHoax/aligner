package handlers

import (
	"net/http"
	"strconv"

	"alignify/collaboration/pkg/auth"
	"alignify/collaboration/pkg/models"
	"alignify/collaboration/pkg/storage"
)

type ActivityHandler struct {
	store storage.Storage
}

func NewActivityHandler(store storage.Storage) *ActivityHandler {
	return &ActivityHandler{store: store}
}

// GetActivities returns chronological activity logs for a board
func (h *ActivityHandler) GetActivities(w http.ResponseWriter, r *http.Request, boardID string) {
	board, err := h.store.Boards().GetBoardByID(r.Context(), boardID)
	if err != nil {
		WriteError(w, http.StatusNotFound, "Board not found")
		return
	}

	userID, _ := auth.GetUserIDFromContext(r.Context())
	_, err = h.store.Boards().GetBoardEffectiveRole(r.Context(), boardID, userID)
	if err != nil && !board.IsPublic {
		WriteError(w, http.StatusForbidden, "Access denied to board activity")
		return
	}

	limit := 50
	offset := 0
	if lStr := r.URL.Query().Get("limit"); lStr != "" {
		if l, err := strconv.Atoi(lStr); err == nil && l > 0 && l <= 100 {
			limit = l
		}
	}
	if oStr := r.URL.Query().Get("offset"); oStr != "" {
		if o, err := strconv.Atoi(oStr); err == nil && o >= 0 {
			offset = o
		}
	}

	activities, err := h.store.Activity().GetActivitiesByBoardID(r.Context(), boardID, limit, offset)
	if err != nil {
		WriteError(w, http.StatusInternalServerError, "Failed to retrieve activity: "+err.Error())
		return
	}

	if activities == nil {
		activities = []models.BoardActivity{}
	}

	WriteJSON(w, http.StatusOK, map[string]interface{}{
		"success":    true,
		"activities": activities,
		"limit":      limit,
		"offset":     offset,
	})
}
