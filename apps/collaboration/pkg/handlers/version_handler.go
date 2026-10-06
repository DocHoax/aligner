package handlers

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"time"

	"alignify/collaboration/pkg/auth"
	"alignify/collaboration/pkg/models"
	"alignify/collaboration/pkg/protocol"
	"alignify/collaboration/pkg/rooms"
	"alignify/collaboration/pkg/storage"
)

type VersionHandler struct {
	store storage.Storage
	hub   *rooms.Hub
}

func NewVersionHandler(store storage.Storage, hub *rooms.Hub) *VersionHandler {
	return &VersionHandler{
		store: store,
		hub:   hub,
	}
}

// ListVersions returns all saved snapshots for a board
func (h *VersionHandler) ListVersions(w http.ResponseWriter, r *http.Request, boardID string) {
	board, err := h.store.Boards().GetBoardByID(r.Context(), boardID)
	if err != nil {
		WriteError(w, http.StatusNotFound, "Board not found")
		return
	}

	userID, _ := auth.GetUserIDFromContext(r.Context())
	_, err = h.store.Boards().GetBoardEffectiveRole(r.Context(), boardID, userID)
	if err != nil && !board.IsPublic {
		WriteError(w, http.StatusForbidden, "Access denied to board versions")
		return
	}

	snapshots, err := h.store.Snapshots().ListSnapshots(r.Context(), boardID)
	if err != nil {
		WriteError(w, http.StatusInternalServerError, "Failed to retrieve versions: "+err.Error())
		return
	}

	if snapshots == nil {
		snapshots = []models.BoardSnapshot{}
	}

	WriteJSON(w, http.StatusOK, map[string]interface{}{
		"success":  true,
		"versions": snapshots,
	})
}

// GetVersion returns a single snapshot version data
func (h *VersionHandler) GetVersion(w http.ResponseWriter, r *http.Request, boardID string, snapshotID int64) {
	board, err := h.store.Boards().GetBoardByID(r.Context(), boardID)
	if err != nil {
		WriteError(w, http.StatusNotFound, "Board not found")
		return
	}

	userID, _ := auth.GetUserIDFromContext(r.Context())
	_, err = h.store.Boards().GetBoardEffectiveRole(r.Context(), boardID, userID)
	if err != nil && !board.IsPublic {
		WriteError(w, http.StatusForbidden, "Access denied to board version")
		return
	}

	snapshot, err := h.store.Snapshots().GetSnapshotByID(r.Context(), snapshotID)
	if err != nil || snapshot.BoardID != boardID {
		WriteError(w, http.StatusNotFound, "Version snapshot not found")
		return
	}

	WriteJSON(w, http.StatusOK, map[string]interface{}{
		"success": true,
		"version": snapshot,
	})
}

// RestoreVersion restores the board state to a historical snapshot
func (h *VersionHandler) RestoreVersion(w http.ResponseWriter, r *http.Request, boardID string, snapshotID int64) {
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
	if err != nil || !role.CanWrite() {
		WriteError(w, http.StatusForbidden, "Only editors and owners can restore board versions")
		return
	}

	snapshot, err := h.store.Snapshots().GetSnapshotByID(r.Context(), snapshotID)
	if err != nil || snapshot.BoardID != boardID {
		WriteError(w, http.StatusNotFound, "Snapshot version not found")
		return
	}

	var objects []map[string]interface{}
	if err := json.Unmarshal(snapshot.Data, &objects); err != nil {
		WriteError(w, http.StatusInternalServerError, "Failed to parse snapshot data: "+err.Error())
		return
	}

	// Fetch current max seq or active room state
	var nextSeq int64 = snapshot.Seq + 1
	if h.hub != nil {
		if room, exists := h.hub.GetRoom(boardID); exists {
			// Room is active in memory: restore directly and broadcast to all live peers
			room.RestoreFromSnapshot(objects, nextSeq, userID)
		}
	}

	// Save new active snapshot with restored state
	newSnapshot := &models.BoardSnapshot{
		BoardID:   boardID,
		Seq:       nextSeq,
		Data:      snapshot.Data,
		CreatedBy: userID,
		CreatedAt: time.Now().UTC(),
	}
	_ = h.store.Snapshots().SaveSnapshot(r.Context(), newSnapshot)

	// Also record operation record for history replay
	batchSubOps := make([]protocol.DocumentOperation, 0, len(objects))
	for _, obj := range objects {
		batchSubOps = append(batchSubOps, protocol.DocumentOperation{
			Op:     "create",
			Object: obj,
		})
	}
	batchOp := protocol.DocumentOperation{
		Op:         "batch",
		Operations: batchSubOps,
	}
	batchBytes, _ := json.Marshal(batchOp)
	_ = h.store.Operations().AppendOperation(r.Context(), &models.OperationRecord{
		BoardID:   boardID,
		Seq:       nextSeq,
		UserID:    userID,
		OpType:    "restore_version",
		Payload:   json.RawMessage(batchBytes),
		CreatedAt: time.Now().UTC(),
	})

	// Log audit activity
	user, _ := h.store.Users().GetUserByID(r.Context(), userID)
	userName := ""
	userColor := ""
	if user != nil {
		userName = user.DisplayName
		userColor = user.AvatarColor
	}
	_ = h.store.Activity().LogActivity(r.Context(), &models.BoardActivity{
		BoardID:         boardID,
		UserID:          userID,
		UserName:        userName,
		UserAvatarColor: userColor,
		ActionType:      "version_restored",
		Description:     fmt.Sprintf("restored board to version from %s", snapshot.CreatedAt.Format("Jan 02, 15:04")),
		Metadata:        json.RawMessage(fmt.Sprintf(`{"snapshotId":%d,"seq":%d}`, snapshot.ID, snapshot.Seq)),
		CreatedAt:       time.Now().UTC(),
	})

	WriteJSON(w, http.StatusOK, map[string]interface{}{
		"success":     true,
		"message":     "Board version restored successfully",
		"restoredSeq": nextSeq,
		"snapshot":    newSnapshot,
	})
}
