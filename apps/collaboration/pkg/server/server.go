package server

import (
	"context"
	"encoding/json"
	"log"
	"net/http"
	"os"
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

var upgrader = websocket.Upgrader{
	ReadBufferSize:  1024 * 1024,
	WriteBufferSize: 1024 * 1024,
	CheckOrigin: func(r *http.Request) bool {
		// Allow all origins for local dev and cross-origin WebSocket connections
		return true
	},
}

// Server provides HTTP routing, REST API controllers, and WebSocket connection dispatching.
type Server struct {
	hub           *rooms.Hub
	store         storage.Storage
	jwtManager    *auth.JWTManager
	authHandler   *handlers.AuthHandler
	workspaceHdlr *handlers.WorkspaceHandler
	boardHdlr     *handlers.BoardHandler
	authMw        *auth.AuthMiddleware
	startTime     time.Time
}

// NewServer creates a new collaboration Server.
func NewServer(hub *rooms.Hub, stores ...storage.Storage) *Server {
	var store storage.Storage
	if len(stores) > 0 && stores[0] != nil {
		store = stores[0]
	} else if hub != nil && hub.Storage() != nil {
		store = hub.Storage()
	} else {
		store = storage.NewMemoryStorage()
	}

	secret := os.Getenv("JWT_SECRET")
	if secret == "" {
		secret = "alignify-dev-jwt-secret-key-change-in-production-2026"
	}

	jwtManager := auth.NewJWTManager(secret, 7*24*time.Hour)
	authMw := auth.NewAuthMiddleware(jwtManager)

	return &Server{
		hub:           hub,
		store:         store,
		jwtManager:    jwtManager,
		authHandler:   handlers.NewAuthHandler(store, jwtManager),
		workspaceHdlr: handlers.NewWorkspaceHandler(store),
		boardHdlr:     handlers.NewBoardHandler(store),
		authMw:        authMw,
		startTime:     time.Now(),
	}
}

// Routes configures and returns the HTTP handler mux.
func (s *Server) Routes() http.Handler {
	mux := http.NewServeMux()

	// 1. Core & Diagnostics
	mux.HandleFunc("/health", s.handleHealth)
	mux.HandleFunc("/api/rooms", s.handleRoomsStats)

	// 2. Auth Endpoints
	mux.HandleFunc("/api/auth/register", s.authHandler.Register)
	mux.HandleFunc("/api/auth/login", s.authHandler.Login)
	mux.HandleFunc("/api/auth/logout", s.authHandler.Logout)
	mux.HandleFunc("/api/auth/me", s.authMw.RequireAuth(s.authHandler.GetMe))
	mux.HandleFunc("/api/auth/profile", s.authMw.RequireAuth(s.authHandler.UpdateProfile))

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

	return corsMiddleware(mux)
}

func (s *Server) handleWorkspacesRouter(w http.ResponseWriter, r *http.Request) {
	// Path format: /api/workspaces/{workspaceId}[/members[/{userId}] | /boards]
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
	// Path format: /api/boards/{boardId}[/export]
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
			// Allows authenticated users or public boards
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

	tokenStr := auth.ExtractToken(r)
	var userID, userName, userColor string
	role := models.RoleEditor // Default role for local dev / unmanaged boards

	if tokenStr != "" {
		claims, err := s.jwtManager.ValidateToken(tokenStr)
		if err == nil && claims != nil {
			userID = claims.UserID
			userName = claims.DisplayName

			// Check user profile for avatar color
			if user, err := s.store.Users().GetUserByID(r.Context(), userID); err == nil && user != nil {
				if user.AvatarColor != "" {
					userColor = user.AvatarColor
				}
			}
		}
	}

	// Fallbacks if not authenticated via token
	if userID == "" {
		userID = query.Get("userId")
		if userID == "" {
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

	conn, err := upgrader.Upgrade(w, r, nil)
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

func corsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With")

		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusOK)
			return
		}

		next.ServeHTTP(w, r)
	})
}

func randomID(n int) string {
	const letters = "abcdefghijklmnopqrstuvwxyz0123456789"
	b := make([]byte, n)
	for i := range b {
		b[i] = letters[time.Now().UnixNano()%int64(len(letters))]
	}
	return string(b)
}
