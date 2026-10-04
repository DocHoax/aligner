package server

import (
	"encoding/json"
	"log"
	"net/http"
	"time"

	"github.com/gorilla/websocket"

	"alignify/collaboration/pkg/client"
	"alignify/collaboration/pkg/rooms"
)

var upgrader = websocket.Upgrader{
	ReadBufferSize:  1024 * 1024,
	WriteBufferSize: 1024 * 1024,
	CheckOrigin: func(r *http.Request) bool {
		// Allow all origins for local dev and cross-origin WebSocket connections
		return true
	},
}

// Server provides HTTP routing and WebSocket connection dispatching.
type Server struct {
	hub       *rooms.Hub
	startTime time.Time
}

// NewServer creates a new collaboration Server.
func NewServer(hub *rooms.Hub) *Server {
	return &Server{
		hub:       hub,
		startTime: time.Now(),
	}
}

// Routes configures and returns the HTTP handler mux.
func (s *Server) Routes() http.Handler {
	mux := http.NewServeMux()

	mux.HandleFunc("/health", s.handleHealth)
	mux.HandleFunc("/api/rooms", s.handleRoomsStats)
	mux.HandleFunc("/ws", s.handleWebSocket)

	return corsMiddleware(mux)
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

	userID := query.Get("userId")
	if userID == "" {
		userID = "anonymous-" + randomID(8)
	}

	userName := query.Get("userName")
	if userName == "" {
		userName = "Collaborator"
	}

	userColor := query.Get("userColor")
	if userColor == "" {
		userColor = "#3b82f6"
	}

	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("[Server] WebSocket upgrade error: %v", err)
		return
	}

	room := s.hub.GetOrCreateRoom(boardID)
	cl := client.NewClient(userID, userName, userColor, boardID, conn, room)

	room.Register(cl)

	go cl.WritePump()
	go cl.ReadPump()
}

func corsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")

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
