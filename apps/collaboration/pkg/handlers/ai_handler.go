package handlers

import (
	"context"
	"encoding/json"
	"net/http"
	"time"

	"alignify/collaboration/pkg/ai"
	"alignify/collaboration/pkg/auth"
	"alignify/collaboration/pkg/models"
	"alignify/collaboration/pkg/rooms"
	"alignify/collaboration/pkg/storage"
)

// AIHandler coordinates REST API requests for AI-assisted diagramming, inspection, and Mermaid conversion.
type AIHandler struct {
	store    storage.Storage
	hub      *rooms.Hub
	provider ai.AIProvider
	mermaid  *ai.MermaidEngine
}

// NewAIHandler initializes an AIHandler instance.
func NewAIHandler(store storage.Storage, hub *rooms.Hub, provider ai.AIProvider) *AIHandler {
	if provider == nil {
		provider = ai.CreateProviderFromEnv()
	}
	return &AIHandler{
		store:    store,
		hub:      hub,
		provider: provider,
		mermaid:  ai.NewMermaidEngine(),
	}
}

// Generate handles natural-language diagram generation requests.
func (h *AIHandler) Generate(w http.ResponseWriter, r *http.Request, boardID string) {
	if r.Method != http.MethodPost {
		WriteError(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}

	userID, ok := auth.GetUserIDFromContext(r.Context())
	if !ok {
		WriteError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	role, err := h.store.Boards().GetBoardEffectiveRole(r.Context(), boardID, userID)
	if err != nil {
		WriteError(w, http.StatusForbidden, "Access denied to board")
		return
	}
	if role == models.RoleViewer {
		WriteError(w, http.StatusForbidden, "Viewer role cannot generate architectural changes")
		return
	}

	var req ai.GenerateRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		WriteError(w, http.StatusBadRequest, "Invalid request payload: "+err.Error())
		return
	}

	if req.Prompt == "" {
		WriteError(w, http.StatusBadRequest, "Prompt is required")
		return
	}

	sanitized, err := ai.SanitizePrompt(req.Prompt)
	if err != nil {
		WriteError(w, http.StatusBadRequest, err.Error())
		return
	}
	if isInj, _ := ai.CheckPromptInjection(sanitized); isInj {
		WriteError(w, http.StatusBadRequest, "Prompt rejected: security policy violation (disallowed instruction)")
		return
	}
	req.Prompt = sanitized

	req.BoardID = boardID

	resp, err := h.provider.GenerateDiagram(r.Context(), req)
	if err != nil {
		WriteError(w, http.StatusInternalServerError, "AI generation failed: "+err.Error())
		return
	}

	h.logActivity(r.Context(), boardID, userID, "ai_generate", "Generated architecture diagram: "+req.Prompt, map[string]interface{}{
		"prompt":    req.Prompt,
		"nodeCount": len(resp.Diagram.Nodes),
		"edgeCount": len(resp.Diagram.Edges),
	})

	WriteJSON(w, http.StatusOK, resp)
}

// Modify handles contextual modification of existing board diagrams.
func (h *AIHandler) Modify(w http.ResponseWriter, r *http.Request, boardID string) {
	if r.Method != http.MethodPost {
		WriteError(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}

	userID, ok := auth.GetUserIDFromContext(r.Context())
	if !ok {
		WriteError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	role, err := h.store.Boards().GetBoardEffectiveRole(r.Context(), boardID, userID)
	if err != nil {
		WriteError(w, http.StatusForbidden, "Access denied to board")
		return
	}
	if role == models.RoleViewer {
		WriteError(w, http.StatusForbidden, "Viewer role cannot modify board architecture")
		return
	}

	var req ai.ModifyRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		WriteError(w, http.StatusBadRequest, "Invalid request payload: "+err.Error())
		return
	}

	if req.Prompt == "" {
		WriteError(w, http.StatusBadRequest, "Modification prompt is required")
		return
	}

	sanitized, err := ai.SanitizePrompt(req.Prompt)
	if err != nil {
		WriteError(w, http.StatusBadRequest, err.Error())
		return
	}
	if isInj, _ := ai.CheckPromptInjection(sanitized); isInj {
		WriteError(w, http.StatusBadRequest, "Prompt rejected: security policy violation (disallowed instruction)")
		return
	}
	req.Prompt = sanitized

	req.BoardID = boardID
	if len(req.ExistingObjects) == 0 {
		req.ExistingObjects = h.getCurrentBoardObjects(r.Context(), boardID)
	}

	resp, err := h.provider.ModifyDiagram(r.Context(), req)
	if err != nil {
		WriteError(w, http.StatusInternalServerError, "AI diagram modification failed: "+err.Error())
		return
	}

	h.logActivity(r.Context(), boardID, userID, "ai_modify", "Applied AI modification: "+req.Prompt, map[string]interface{}{
		"prompt":        req.Prompt,
		"addedNodes":    len(resp.AddedNodeIDs),
		"modifiedNodes": len(resp.ModifiedNodeIDs),
		"deletedNodes":  len(resp.DeletedNodeIDs),
	})

	WriteJSON(w, http.StatusOK, resp)
}

// Analyze performs automated structural & security inspection of current board state.
func (h *AIHandler) Analyze(w http.ResponseWriter, r *http.Request, boardID string) {
	if r.Method != http.MethodPost {
		WriteError(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}

	userID, _ := auth.GetUserIDFromContext(r.Context())
	board, err := h.store.Boards().GetBoardByID(r.Context(), boardID)
	if err != nil {
		WriteError(w, http.StatusNotFound, "Board not found")
		return
	}

	if !board.IsPublic {
		if userID == "" {
			WriteError(w, http.StatusUnauthorized, "Unauthorized")
			return
		}
		_, err := h.store.Boards().GetBoardEffectiveRole(r.Context(), boardID, userID)
		if err != nil {
			WriteError(w, http.StatusForbidden, "Access denied to board")
			return
		}
	}

	var req ai.AnalyzeRequest
	_ = json.NewDecoder(r.Body).Decode(&req)

	req.BoardID = boardID
	if len(req.Objects) == 0 {
		req.Objects = h.getCurrentBoardObjects(r.Context(), boardID)
	}

	resp, err := h.provider.AnalyzeDiagram(r.Context(), req)
	if err != nil {
		WriteError(w, http.StatusInternalServerError, "AI diagram analysis failed: "+err.Error())
		return
	}

	if userID != "" {
		h.logActivity(r.Context(), boardID, userID, "ai_analyze", "Ran architecture analysis scan", map[string]interface{}{
			"overallScore": resp.Report.OverallScore,
			"findingCount": len(resp.Report.Findings),
		})
	}

	WriteJSON(w, http.StatusOK, resp)
}

// Explain provides architectural breakdowns and answers questions about the diagram.
func (h *AIHandler) Explain(w http.ResponseWriter, r *http.Request, boardID string) {
	if r.Method != http.MethodPost {
		WriteError(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}

	userID, _ := auth.GetUserIDFromContext(r.Context())
	board, err := h.store.Boards().GetBoardByID(r.Context(), boardID)
	if err != nil {
		WriteError(w, http.StatusNotFound, "Board not found")
		return
	}

	if !board.IsPublic {
		if userID == "" {
			WriteError(w, http.StatusUnauthorized, "Unauthorized")
			return
		}
		_, err := h.store.Boards().GetBoardEffectiveRole(r.Context(), boardID, userID)
		if err != nil {
			WriteError(w, http.StatusForbidden, "Access denied to board")
			return
		}
	}

	var req ai.ExplainRequest
	_ = json.NewDecoder(r.Body).Decode(&req)

	if req.Question != "" {
		sanitized, err := ai.SanitizePrompt(req.Question)
		if err != nil {
			WriteError(w, http.StatusBadRequest, err.Error())
			return
		}
		if isInj, _ := ai.CheckPromptInjection(sanitized); isInj {
			WriteError(w, http.StatusBadRequest, "Question rejected: security policy violation (disallowed instruction)")
			return
		}
		req.Question = sanitized
	}

	req.BoardID = boardID
	if len(req.Objects) == 0 {
		req.Objects = h.getCurrentBoardObjects(r.Context(), boardID)
	}

	resp, err := h.provider.ExplainDiagram(r.Context(), req)
	if err != nil {
		WriteError(w, http.StatusInternalServerError, "AI explanation failed: "+err.Error())
		return
	}

	WriteJSON(w, http.StatusOK, resp)
}

// ExportMermaid serializes current canvas components to Mermaid flowchart syntax.
func (h *AIHandler) ExportMermaid(w http.ResponseWriter, r *http.Request, boardID string) {
	if r.Method != http.MethodPost && r.Method != http.MethodGet {
		WriteError(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}

	userID, _ := auth.GetUserIDFromContext(r.Context())
	board, err := h.store.Boards().GetBoardByID(r.Context(), boardID)
	if err != nil {
		WriteError(w, http.StatusNotFound, "Board not found")
		return
	}

	if !board.IsPublic {
		if userID == "" {
			WriteError(w, http.StatusUnauthorized, "Unauthorized")
			return
		}
		_, err := h.store.Boards().GetBoardEffectiveRole(r.Context(), boardID, userID)
		if err != nil {
			WriteError(w, http.StatusForbidden, "Access denied to board")
			return
		}
	}

	var objects []map[string]interface{}
	direction := "LR"

	if r.Method == http.MethodPost && r.Body != nil {
		var req struct {
			Objects   []map[string]interface{} `json:"objects,omitempty"`
			Direction string                   `json:"direction,omitempty"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err == nil {
			objects = req.Objects
			if req.Direction != "" {
				direction = req.Direction
			}
		}
	}

	if len(objects) == 0 {
		objects = h.getCurrentBoardObjects(r.Context(), boardID)
	}

	mermaidText, err := h.mermaid.ExportToMermaid(objects, direction)
	if err != nil {
		WriteError(w, http.StatusInternalServerError, "Failed to export Mermaid: "+err.Error())
		return
	}

	WriteJSON(w, http.StatusOK, map[string]string{
		"mermaid": mermaidText,
	})
}

// ImportMermaid parses Mermaid flowchart syntax into native Canvas DocumentOperations.
func (h *AIHandler) ImportMermaid(w http.ResponseWriter, r *http.Request, boardID string) {
	if r.Method != http.MethodPost {
		WriteError(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}

	userID, ok := auth.GetUserIDFromContext(r.Context())
	if !ok {
		WriteError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	role, err := h.store.Boards().GetBoardEffectiveRole(r.Context(), boardID, userID)
	if err != nil {
		WriteError(w, http.StatusForbidden, "Access denied to board")
		return
	}
	if role == models.RoleViewer {
		WriteError(w, http.StatusForbidden, "Viewer role cannot import diagrams")
		return
	}

	var req struct {
		Mermaid string `json:"mermaid"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		WriteError(w, http.StatusBadRequest, "Invalid request payload: "+err.Error())
		return
	}

	if req.Mermaid == "" {
		WriteError(w, http.StatusBadRequest, "Mermaid code is required")
		return
	}

	resp, err := h.mermaid.ImportFromMermaid(req.Mermaid)
	if err != nil {
		WriteError(w, http.StatusBadRequest, "Failed to parse Mermaid diagram: "+err.Error())
		return
	}

	h.logActivity(r.Context(), boardID, userID, "ai_mermaid_import", "Imported Mermaid flowchart", map[string]interface{}{
		"nodeCount": len(resp.Diagram.Nodes),
		"edgeCount": len(resp.Diagram.Edges),
	})

	WriteJSON(w, http.StatusOK, resp)
}

func (h *AIHandler) getCurrentBoardObjects(ctx context.Context, boardID string) []map[string]interface{} {
	// First attempt live room memory state
	if h.hub != nil {
		if room, ok := h.hub.GetRoom(boardID); ok && room != nil {
			objs := room.GetObjects()
			if len(objs) > 0 {
				var result []map[string]interface{}
				bytes, err := json.Marshal(objs)
				if err == nil {
					_ = json.Unmarshal(bytes, &result)
					return result
				}
			}
		}
	}

	// Fallback to snapshot in storage
	if h.store != nil {
		snap, err := h.store.Snapshots().GetLatestSnapshot(ctx, boardID)
		if err == nil && snap != nil && len(snap.Data) > 0 {
			var result []map[string]interface{}
			if err := json.Unmarshal(snap.Data, &result); err == nil {
				return result
			}
		}
	}

	return make([]map[string]interface{}, 0)
}

func (h *AIHandler) logActivity(ctx context.Context, boardID, userID, actionType, description string, metadata map[string]interface{}) {
	if h.store == nil || h.store.Activity() == nil {
		return
	}

	user, _ := h.store.Users().GetUserByID(ctx, userID)
	userName := "AI User"
	userAvatar := "#6366f1"
	if user != nil {
		userName = user.DisplayName
		userAvatar = user.AvatarColor
	}

	metaBytes, _ := json.Marshal(metadata)

	_ = h.store.Activity().LogActivity(ctx, &models.BoardActivity{
		BoardID:         boardID,
		UserID:          userID,
		UserName:        userName,
		UserAvatarColor: userAvatar,
		ActionType:      actionType,
		Description:     description,
		Metadata:        metaBytes,
		CreatedAt:       time.Now(),
	})
}
