package server

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/gorilla/websocket"

	"alignify/collaboration/pkg/protocol"
	"alignify/collaboration/pkg/rooms"
)

func TestServer_RESTEndpoints(t *testing.T) {
	hub := rooms.NewHub()
	srv := NewServer(hub)
	handler := srv.Routes()

	// 1. Test /health
	req := httptest.NewRequest(http.MethodGet, "/health", nil)
	w := httptest.NewRecorder()
	handler.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected /health 200, got %d", w.Code)
	}

	var healthData map[string]interface{}
	if err := json.NewDecoder(w.Body).Decode(&healthData); err != nil {
		t.Fatalf("failed to decode health response: %v", err)
	}
	if healthData["status"] != "ok" {
		t.Fatalf("expected status 'ok', got %v", healthData["status"])
	}

	// 2. Test /api/rooms
	req2 := httptest.NewRequest(http.MethodGet, "/api/rooms", nil)
	w2 := httptest.NewRecorder()
	handler.ServeHTTP(w2, req2)

	if w2.Code != http.StatusOK {
		t.Fatalf("expected /api/rooms 200, got %d", w2.Code)
	}
}

func TestServer_WebSocketConnection(t *testing.T) {
	hub := rooms.NewHub()
	srv := NewServer(hub)
	testServer := httptest.NewServer(srv.Routes())
	defer testServer.Close()

	// Convert http:// to ws://
	wsURL := "ws" + strings.TrimPrefix(testServer.URL, "http") + "/ws?boardId=test-ws-board&userId=user-ws-1&userName=TestUser"

	ws, _, err := websocket.DefaultDialer.Dial(wsURL, nil)
	if err != nil {
		t.Fatalf("failed to dial websocket: %v", err)
	}
	defer ws.Close()

	// Should receive 'joined' message from server
	_ = ws.SetReadDeadline(time.Now().Add(2 * time.Second))
	_, msgBytes, err := ws.ReadMessage()
	if err != nil {
		t.Fatalf("failed to read message from server: %v", err)
	}

	var srvMsg protocol.ServerMessage
	if err := json.Unmarshal(msgBytes, &srvMsg); err != nil {
		t.Fatalf("failed to parse server message: %v", err)
	}

	if srvMsg.Type != "joined" {
		t.Fatalf("expected 'joined' message, got '%s'", srvMsg.Type)
	}
}
