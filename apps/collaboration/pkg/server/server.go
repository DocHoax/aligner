package server

import (
	"context"
	"encoding/json"
	"log"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/gorilla/websocket"

	"alignify/collaboration/pkg/auth"
	"alignify/collaboration/pkg/client"
	"alignify/collaboration/pkg/handlers"
	"alignify/collaboration/pkg/models"
	"alignify/collaboration/pkg/rooms"
	"alignify/collaboration/pkg/storage"
)

// Server provides HTTP routing, REST API controllers, and WebSocket connection dispatching.
type Server struct {
	hub            *rooms.Hub
	store          storage.Storage
	config         ServerConfig
	jwtManager     *auth.JWTManager
	ticketStore    *auth.TicketStore
	authHandler    *handlers.AuthHandler
	workspaceHdlr  *handlers.WorkspaceHandler
	boardHdlr      *handlers.BoardHandler
	commentHdlr    *handlers.CommentHandler
	activityHdlr   *handlers.ActivityHandler
	versionHdlr    *handlers.VersionHandler
	aiHdlr         *handlers.AIHandler
	authMw         *auth.AuthMiddleware
	authLimiter    *SlidingWindowRateLimiter
	aiLimiter      *SlidingWindowRateLimiter
	generalLimiter *SlidingWindowRateLimiter
	wsUpgrader     websocket.Upgrader
	startTime      time.Time
}

// NewServer creates a new collaboration Server with environment configuration.
func NewServer(hub *rooms.Hub, stores ...storage.Storage) *Server {
	cfg, err := LoadServerConfigFromEnv()
	if err != nil {
		log.Printf("[Server Config Warning] Failed loading environment config: %v. Using defaults.", err)
		cfg = DefaultServerConfig()
	}
	return NewServerWithConfig(hub, cfg, stores...)
}

// NewServerWithConfig creates a new collaboration Server with custom ServerConfig.
func NewServerWithConfig(hub *rooms.Hub, cfg ServerConfig, stores ...storage.Storage) *Server {
	var store storage.Storage
	if len(stores) > 0 && stores[0] != nil {
		store = stores[0]
	} else if hub != nil && hub.Storage() != nil {
		store = hub.Storage()
	} else {
		store = storage.NewMemoryStorage()
	}

	jwtManager := auth.NewJWTManager(cfg.JWTSecret, cfg.JWTTTL)
	authMw := auth.NewAuthMiddleware(jwtManager)
	ticketStore := auth.NewTicketStore(60 * time.Second)

	isProd := cfg.Environment == "production" || cfg.Environment == "staging"
	wsUpgrader := websocket.Upgrader{
		ReadBufferSize:  1024 * 1024,
		WriteBufferSize: 1024 * 1024,
		CheckOrigin:     CSWSHOriginChecker(cfg.AllowedOrigins, isProd),
	}

	authLim := NewSlidingWindowRateLimiter(cfg.AuthRateLimit)
	aiLim := NewSlidingWindowRateLimiter(cfg.AIRateLimit)
	genLim := NewSlidingWindowRateLimiter(cfg.APIRateLimit)

	return &Server{
		hub:            hub,
		store:          store,
		config:         cfg,
		jwtManager:     jwtManager,
		ticketStore:    ticketStore,
		authHandler:    handlers.NewAuthHandler(store, jwtManager),
		workspaceHdlr:  handlers.NewWorkspaceHandler(store, hub),
		boardHdlr:      handlers.NewBoardHandler(store),
		commentHdlr:    handlers.NewCommentHandler(store),
		activityHdlr:   handlers.NewActivityHandler(store),
		versionHdlr:    handlers.NewVersionHandler(store, hub),
		aiHdlr:         handlers.NewAIHandler(store, hub, nil),
		authMw:         authMw,
		authLimiter:    authLim,
		aiLimiter:      aiLim,
		generalLimiter: genLim,
		wsUpgrader:     wsUpgrader,
		startTime:      time.Now(),
	}
}

// Routes configures and returns the HTTP handler mux wrapped with the security middleware pipeline.
func (s *Server) Routes() http.Handler {
	mux := http.NewServeMux()

	// 1. Core & Diagnostics
	mux.HandleFunc("/health", s.handleHealth)
	mux.HandleFunc("/healthz", s.handleHealth)
	mux.HandleFunc("/readyz", s.handleReadyz)
	mux.HandleFunc("/api/rooms", s.handleRoomsStats)

	// 2. Auth Endpoints
	mux.HandleFunc("/api/auth/register", s.authHandler.Register)
	mux.HandleFunc("/api/auth/login", s.authHandler.Login)
	mux.HandleFunc("/api/auth/logout", s.authHandler.Logout)
	mux.HandleFunc("/api/auth/me", s.authMw.RequireAuth(s.authHandler.GetMe))
	mux.HandleFunc("/api/auth/profile", s.authMw.RequireAuth(s.authHandler.UpdateProfile))
	mux.HandleFunc("/api/auth/ws-ticket", s.authMw.RequireAuth(s.handleCreateWSTicket))

	// 3. Workspaces & Members Router
	mux.HandleFunc("/api/workspaces", s.authMw.RequireAuth(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodGet {
			s.workspaceHdlr.ListWorkspaces(w, r)
		} else if r.Method == http.MethodPost {
			s.workspaceHdlr.CreateWorkspace(w, r)
		} else {
			handlers.WriteError(w, http.StatusMethodNotAllowed, "Method not allowed")
		}
	}))

	mux.HandleFunc("/api/workspaces/", s.handleWorkspacesRouter)

	// 4. Boards Router
	mux.HandleFunc("/api/boards/", s.handleBoardsRouter)

	// 5. WebSocket Real-Time Collaboration Gateway
	mux.HandleFunc("/ws", s.handleWebSocket)

	// Security & Observability Pipeline
	isProd := s.config.Environment == "production" || s.config.Environment == "staging"
	var handler http.Handler = mux

	if s.config.EnableRateLimiting {
		handler = RateLimitMiddleware(s.authLimiter, s.aiLimiter, s.generalLimiter, handler)
	}

	handler = RequestBodyLimitMiddleware(s.config.MaxRequestBodySize, s.config.MaxThumbnailSize, handler)
	handler = CORSMiddleware(s.config.AllowedOrigins, handler)
	handler = SecurityHeadersMiddleware(isProd, handler)
	handler = StructuredLoggingMiddleware(handler)

	return handler
}

func (s *Server) handleWorkspacesRouter(w http.ResponseWriter, r *http.Request) {
	subPath := strings.TrimPrefix(r.URL.Path, "/api/workspaces/")
	if subPath == "" {
		if r.Method == http.MethodGet {
			s.authMw.RequireAuth(s.workspaceHdlr.ListWorkspaces)(w, r)
		} else if r.Method == http.MethodPost {
			s.authMw.RequireAuth(s.workspaceHdlr.CreateWorkspace)(w, r)
		} else {
			handlers.WriteError(w, http.StatusMethodNotAllowed, "Method not allowed")
		}
		return
	}

	parts := strings.Split(subPath, "/")
	workspaceID := parts[0]

	// 1. /api/workspaces/:workspaceId
	if len(parts) == 1 {
		switch r.Method {
		case http.MethodGet:
			s.authMw.RequireAuth(func(w http.ResponseWriter, r *http.Request) {
				s.workspaceHdlr.GetWorkspace(w, r, workspaceID)
			})(w, r)
		case http.MethodPatch, http.MethodPut:
			s.authMw.RequireAuth(func(w http.ResponseWriter, r *http.Request) {
				s.workspaceHdlr.UpdateWorkspace(w, r, workspaceID)
			})(w, r)
		case http.MethodDelete:
			s.authMw.RequireAuth(func(w http.ResponseWriter, r *http.Request) {
				s.workspaceHdlr.DeleteWorkspace(w, r, workspaceID)
			})(w, r)
		default:
			handlers.WriteError(w, http.StatusMethodNotAllowed, "Method not allowed")
		}
		return
	}

	// 2. /api/workspaces/:workspaceId/members
	if len(parts) == 2 && parts[1] == "members" {
		switch r.Method {
		case http.MethodGet:
			s.authMw.RequireAuth(func(w http.ResponseWriter, r *http.Request) {
				s.workspaceHdlr.GetMembers(w, r, workspaceID)
			})(w, r)
		case http.MethodPost:
			s.authMw.RequireAuth(func(w http.ResponseWriter, r *http.Request) {
				s.workspaceHdlr.AddMember(w, r, workspaceID)
			})(w, r)
		default:
			handlers.WriteError(w, http.StatusMethodNotAllowed, "Method not allowed")
		}
		return
	}

	// 3. /api/workspaces/:workspaceId/members/:userId
	if len(parts) == 3 && parts[1] == "members" {
		memberUserID := parts[2]
		switch r.Method {
		case http.MethodPatch, http.MethodPut:
			s.authMw.RequireAuth(func(w http.ResponseWriter, r *http.Request) {
				s.workspaceHdlr.UpdateMemberRole(w, r, workspaceID, memberUserID)
			})(w, r)
		case http.MethodDelete:
			s.authMw.RequireAuth(func(w http.ResponseWriter, r *http.Request) {
				s.workspaceHdlr.RemoveMember(w, r, workspaceID, memberUserID)
			})(w, r)
		default:
			handlers.WriteError(w, http.StatusMethodNotAllowed, "Method not allowed")
		}
		return
	}

	// 4. /api/workspaces/:workspaceId/boards
	if len(parts) == 2 && parts[1] == "boards" {
		switch r.Method {
		case http.MethodGet:
			s.authMw.RequireAuth(func(w http.ResponseWriter, r *http.Request) {
				s.boardHdlr.ListWorkspaceBoards(w, r, workspaceID)
			})(w, r)
		case http.MethodPost:
			s.authMw.RequireAuth(func(w http.ResponseWriter, r *http.Request) {
				s.boardHdlr.CreateBoard(w, r, workspaceID)
			})(w, r)
		default:
			handlers.WriteError(w, http.StatusMethodNotAllowed, "Method not allowed")
		}
		return
	}

	handlers.WriteError(w, http.StatusNotFound, "Resource not found")
}

func (s *Server) handleBoardsRouter(w http.ResponseWriter, r *http.Request) {
	subPath := strings.TrimPrefix(r.URL.Path, "/api/boards/")
	if subPath == "" {
		handlers.WriteError(w, http.StatusNotFound, "Board ID is required")
		return
	}

	parts := strings.Split(subPath, "/")
	boardID := parts[0]

	// 1. /api/boards/:boardId
	if len(parts) == 1 {
		switch r.Method {
		case http.MethodGet:
			s.authMw.Authenticate(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				s.boardHdlr.GetBoard(w, r, boardID)
			})).ServeHTTP(w, r)
		case http.MethodPatch, http.MethodPut:
			s.authMw.RequireAuth(func(w http.ResponseWriter, r *http.Request) {
				s.boardHdlr.UpdateBoard(w, r, boardID)
			})(w, r)
		case http.MethodDelete:
			s.authMw.RequireAuth(func(w http.ResponseWriter, r *http.Request) {
				s.boardHdlr.DeleteBoard(w, r, boardID)
			})(w, r)
		default:
			handlers.WriteError(w, http.StatusMethodNotAllowed, "Method not allowed")
		}
		return
	}

	// 2. /api/boards/:boardId/export
	if len(parts) == 2 && parts[1] == "export" {
		if r.Method == http.MethodGet {
			s.authMw.Authenticate(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				s.boardHdlr.ExportBoard(w, r, boardID)
			})).ServeHTTP(w, r)
		} else {
			handlers.WriteError(w, http.StatusMethodNotAllowed, "Method not allowed")
		}
		return
	}

	// 3. /api/boards/:boardId/favorite
	if len(parts) == 2 && parts[1] == "favorite" {
		if r.Method == http.MethodPost {
			s.authMw.RequireAuth(func(w http.ResponseWriter, r *http.Request) {
				s.boardHdlr.ToggleFavorite(w, r, boardID)
			})(w, r)
		} else {
			handlers.WriteError(w, http.StatusMethodNotAllowed, "Method not allowed")
		}
		return
	}

	// 4. /api/boards/:boardId/thumbnail
	if len(parts) == 2 && parts[1] == "thumbnail" {
		if r.Method == http.MethodPatch || r.Method == http.MethodPut {
			s.authMw.RequireAuth(func(w http.ResponseWriter, r *http.Request) {
				s.boardHdlr.UpdateThumbnail(w, r, boardID)
			})(w, r)
		} else {
			handlers.WriteError(w, http.StatusMethodNotAllowed, "Method not allowed")
		}
		return
	}

	// 5. /api/boards/:boardId/comments
	if len(parts) == 2 && parts[1] == "comments" {
		switch r.Method {
		case http.MethodGet:
			s.authMw.Authenticate(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				s.commentHdlr.GetComments(w, r, boardID)
			})).ServeHTTP(w, r)
		case http.MethodPost:
			s.authMw.RequireAuth(func(w http.ResponseWriter, r *http.Request) {
				s.commentHdlr.CreateComment(w, r, boardID)
			})(w, r)
		default:
			handlers.WriteError(w, http.StatusMethodNotAllowed, "Method not allowed")
		}
		return
	}

	// 6. /api/boards/:boardId/comments/:commentId
	if len(parts) == 3 && parts[1] == "comments" {
		commentID := parts[2]
		switch r.Method {
		case http.MethodPatch, http.MethodPut:
			s.authMw.RequireAuth(func(w http.ResponseWriter, r *http.Request) {
				s.commentHdlr.UpdateComment(w, r, boardID, commentID)
			})(w, r)
		case http.MethodDelete:
			s.authMw.RequireAuth(func(w http.ResponseWriter, r *http.Request) {
				s.commentHdlr.DeleteComment(w, r, boardID, commentID)
			})(w, r)
		default:
			handlers.WriteError(w, http.StatusMethodNotAllowed, "Method not allowed")
		}
		return
	}

	// 7. /api/boards/:boardId/activity
	if len(parts) == 2 && parts[1] == "activity" {
		if r.Method == http.MethodGet {
			s.authMw.Authenticate(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				s.activityHdlr.GetActivities(w, r, boardID)
			})).ServeHTTP(w, r)
		} else {
			handlers.WriteError(w, http.StatusMethodNotAllowed, "Method not allowed")
		}
		return
	}

	// 8. /api/boards/:boardId/versions
	if len(parts) == 2 && parts[1] == "versions" {
		if r.Method == http.MethodGet {
			s.authMw.Authenticate(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				s.versionHdlr.ListVersions(w, r, boardID)
			})).ServeHTTP(w, r)
		} else {
			handlers.WriteError(w, http.StatusMethodNotAllowed, "Method not allowed")
		}
		return
	}

	// 9. /api/boards/:boardId/versions/:versionId
	if len(parts) == 3 && parts[1] == "versions" {
		vID, err := strconv.ParseInt(parts[2], 10, 64)
		if err != nil {
			handlers.WriteError(w, http.StatusBadRequest, "Invalid version ID")
			return
		}
		if r.Method == http.MethodGet {
			s.authMw.Authenticate(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				s.versionHdlr.GetVersion(w, r, boardID, vID)
			})).ServeHTTP(w, r)
		} else {
			handlers.WriteError(w, http.StatusMethodNotAllowed, "Method not allowed")
		}
		return
	}

	// 10. /api/boards/:boardId/versions/:versionId/restore
	if len(parts) == 4 && parts[1] == "versions" && parts[3] == "restore" {
		vID, err := strconv.ParseInt(parts[2], 10, 64)
		if err != nil {
			handlers.WriteError(w, http.StatusBadRequest, "Invalid version ID")
			return
		}
		if r.Method == http.MethodPost {
			s.authMw.RequireAuth(func(w http.ResponseWriter, r *http.Request) {
				s.versionHdlr.RestoreVersion(w, r, boardID, vID)
			})(w, r)
		} else {
			handlers.WriteError(w, http.StatusMethodNotAllowed, "Method not allowed")
		}
		return
	}

	// 11. /api/boards/:boardId/ai/generate
	if len(parts) == 3 && parts[1] == "ai" && parts[2] == "generate" {
		s.authMw.RequireAuth(func(w http.ResponseWriter, r *http.Request) {
			s.aiHdlr.Generate(w, r, boardID)
		})(w, r)
		return
	}

	// 12. /api/boards/:boardId/ai/modify
	if len(parts) == 3 && parts[1] == "ai" && parts[2] == "modify" {
		s.authMw.RequireAuth(func(w http.ResponseWriter, r *http.Request) {
			s.aiHdlr.Modify(w, r, boardID)
		})(w, r)
		return
	}

	// 13. /api/boards/:boardId/ai/analyze
	if len(parts) == 3 && parts[1] == "ai" && parts[2] == "analyze" {
		s.authMw.Authenticate(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			s.aiHdlr.Analyze(w, r, boardID)
		})).ServeHTTP(w, r)
		return
	}

	// 14. /api/boards/:boardId/ai/explain
	if len(parts) == 3 && parts[1] == "ai" && parts[2] == "explain" {
		s.authMw.Authenticate(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			s.aiHdlr.Explain(w, r, boardID)
		})).ServeHTTP(w, r)
		return
	}

	// 15. /api/boards/:boardId/ai/mermaid/export
	if len(parts) == 4 && parts[1] == "ai" && parts[2] == "mermaid" && parts[3] == "export" {
		s.authMw.Authenticate(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			s.aiHdlr.ExportMermaid(w, r, boardID)
		})).ServeHTTP(w, r)
		return
	}

	// 16. /api/boards/:boardId/ai/mermaid/import
	if len(parts) == 4 && parts[1] == "ai" && parts[2] == "mermaid" && parts[3] == "import" {
		s.authMw.RequireAuth(func(w http.ResponseWriter, r *http.Request) {
			s.aiHdlr.ImportMermaid(w, r, boardID)
		})(w, r)
		return
	}

	handlers.WriteError(w, http.StatusNotFound, "Resource not found")
}

func (s *Server) handleHealth(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method Not Allowed", http.StatusMethodNotAllowed)
		return
	}

	stats := map[string]interface{}{
		"status":        "ok",
		"uptimeSeconds": int64(time.Since(s.startTime).Seconds()),
		"activeRooms":   s.hub.ActiveRoomsCount(),
		"activeClients": s.hub.ActiveClientsCount(),
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(stats)
}

func (s *Server) handleReadyz(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method Not Allowed", http.StatusMethodNotAllowed)
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 2*time.Second)
	defer cancel()

	status := "ready"
	storageStatus := "ok"
	statusCode := http.StatusOK

	if _, err := s.store.Users().GetUserByEmail(ctx, "nonexistent-probe@alignify.dev"); err != nil && !strings.Contains(err.Error(), "not found") {
		storageStatus = "degraded"
		status = "degraded"
		statusCode = http.StatusServiceUnavailable
	}

	resp := map[string]interface{}{
		"status":        status,
		"storage":       storageStatus,
		"uptimeSeconds": int64(time.Since(s.startTime).Seconds()),
		"activeRooms":   s.hub.ActiveRoomsCount(),
		"activeClients": s.hub.ActiveClientsCount(),
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(statusCode)
	_ = json.NewEncoder(w).Encode(resp)
}

func (s *Server) handleCreateWSTicket(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		handlers.WriteError(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}

	userID, ok := auth.GetUserIDFromContext(r.Context())
	if !ok {
		handlers.WriteError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	var req struct {
		BoardID string `json:"boardId"`
	}
	_ = json.NewDecoder(r.Body).Decode(&req)
	if req.BoardID == "" {
		req.BoardID = "default"
	}

	user, err := s.store.Users().GetUserByID(r.Context(), userID)
	email := ""
	displayName := ""
	if err == nil && user != nil {
		email = user.Email
		displayName = user.DisplayName
	}

	ticket := s.ticketStore.CreateTicket(userID, email, displayName, req.BoardID)
	handlers.WriteJSON(w, http.StatusOK, map[string]interface{}{
		"success":   true,
		"ticket":    ticket.ID,
		"expiresAt": ticket.ExpiresAt,
	})
}

func (s *Server) handleRoomsStats(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method Not Allowed", http.StatusMethodNotAllowed)
		return
	}

	stats := map[string]interface{}{
		"activeRooms":   s.hub.ActiveRoomsCount(),
		"activeClients": s.hub.ActiveClientsCount(),
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(stats)
}

func (s *Server) handleWebSocket(w http.ResponseWriter, r *http.Request) {
	query := r.URL.Query()
	boardID := query.Get("boardId")
	if boardID == "" {
		boardID = "default"
	}

	ticketID := query.Get("ticket")
	tokenStr := auth.ExtractToken(r)
	var userID, userName, userColor string
	role := models.RoleEditor // Default role for local dev / unmanaged boards

	if ticketID != "" && s.ticketStore != nil {
		if ticket, ok := s.ticketStore.ConsumeTicket(ticketID); ok && ticket != nil {
			userID = ticket.UserID
			userName = ticket.DisplayName
			if ticket.BoardID != "" && (boardID == "default" || boardID == "") {
				boardID = ticket.BoardID
			}

			// Check user profile for avatar color
			if user, err := s.store.Users().GetUserByID(r.Context(), userID); err == nil && user != nil {
				if user.AvatarColor != "" {
					userColor = user.AvatarColor
				}
				if userName == "" {
					userName = user.DisplayName
				}
			}
		} else {
			http.Error(w, "Unauthorized: invalid or expired WebSocket ticket", http.StatusUnauthorized)
			return
		}
	} else if tokenStr != "" {
		claims, err := s.jwtManager.ValidateToken(tokenStr)
		if err != nil || claims == nil {
			http.Error(w, "Unauthorized: invalid WebSocket token", http.StatusUnauthorized)
			return
		}

		userID = claims.UserID
		userName = claims.DisplayName

		// Check user profile for avatar color
		if user, err := s.store.Users().GetUserByID(r.Context(), userID); err == nil && user != nil {
			if user.AvatarColor != "" {
				userColor = user.AvatarColor
			}
		}
	}

	// Fallbacks if not authenticated via token
	if userID == "" {
		if boardID == "default" || strings.HasPrefix(boardID, "test-") {
			userID = query.Get("userId")
			if userID == "" {
				userID = "anonymous-" + randomID(8)
			}
		} else {
			userID = "anonymous-" + randomID(8)
		}
	}

	if userName == "" {
		userName = query.Get("userName")
		if userName == "" {
			userName = "Collaborator"
		}
	}

	if userColor == "" {
		userColor = query.Get("userColor")
		if userColor == "" {
			userColor = "#3b82f6"
		}
	}

	// Resolve Board Role & Permission Guardrails
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	board, err := s.store.Boards().GetBoardByID(ctx, boardID)
	if err == nil && board != nil {
		effRole, roleErr := s.store.Boards().GetBoardEffectiveRole(ctx, boardID, userID)
		if roleErr == nil {
			role = effRole
		} else if board.IsPublic {
			role = models.RoleViewer
		} else {
			http.Error(w, "Forbidden: you do not have permission to access this board", http.StatusForbidden)
			return
		}
	} else if strings.HasPrefix(userID, "anonymous-") {
		// Default anonymous users to viewer if connecting to a specific managed board
		if boardID != "default" && !strings.HasPrefix(boardID, "test-") {
			role = models.RoleViewer
		}
	}

	conn, err := s.wsUpgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("[Server] WebSocket upgrade error: %v", err)
		return
	}

	room := s.hub.GetOrCreateRoom(boardID)
	cl := client.NewClient(userID, userName, userColor, role, boardID, conn, room)

	room.Register(cl)

	go cl.WritePump()
	go cl.ReadPump()
}

func randomID(n int) string {
	const letters = "abcdefghijklmnopqrstuvwxyz0123456789"
	b := make([]byte, n)
	for i := range b {
		b[i] = letters[time.Now().UnixNano()%int64(len(letters))]
	}
	return string(b)
}
