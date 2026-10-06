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

func TestServer_WebSocketRejectsInvalidToken(t *testing.T) {
	hub := rooms.NewHub()
	srv := NewServer(hub)
	testServer := httptest.NewServer(srv.Routes())
	defer testServer.Close()

	wsURL := "ws" + strings.TrimPrefix(testServer.URL, "http") +
		"/ws?boardId=test-ws-board&userId=owner-user&token=invalid-token"

	_, response, err := websocket.DefaultDialer.Dial(wsURL, nil)
	if err == nil {
		t.Fatal("expected invalid WebSocket token to be rejected")
	}
	if response == nil || response.StatusCode != http.StatusUnauthorized {
		t.Fatalf("expected 401 for invalid WebSocket token, got response %#v", response)
	}
}

func TestServer_WebSocketTicketFlow(t *testing.T) {
	hub := rooms.NewHub()
	srv := NewServer(hub)
	testServer := httptest.NewServer(srv.Routes())
	defer testServer.Close()

	// 1. Register a user
	regBody := `{"email":"ticketuser@alignify.dev","password":"Password123!","displayName":"TicketUser"}`
	resp, err := http.Post(testServer.URL+"/api/auth/register", "application/json", strings.NewReader(regBody))
	if err != nil {
		t.Fatalf("failed to register: %v", err)
	}
	var authData struct {
		Token string `json:"token"`
	}
	_ = json.NewDecoder(resp.Body).Decode(&authData)
	resp.Body.Close()
	if authData.Token == "" {
		t.Fatalf("expected token from register")
	}

	// 2. Request single-use WS ticket
	ticketReq, _ := http.NewRequest(http.MethodPost, testServer.URL+"/api/auth/ws-ticket", strings.NewReader(`{"boardId":"test-ticket-board"}`))
	ticketReq.Header.Set("Authorization", "Bearer "+authData.Token)
	ticketReq.Header.Set("Content-Type", "application/json")
	ticketResp, err := http.DefaultClient.Do(ticketReq)
	if err != nil {
		t.Fatalf("failed to request ws ticket: %v", err)
	}
	defer ticketResp.Body.Close()
	if ticketResp.StatusCode != http.StatusOK {
		t.Fatalf("expected 200 from ws-ticket, got %d", ticketResp.StatusCode)
	}
	var ticketData struct {
		Ticket string `json:"ticket"`
	}
	_ = json.NewDecoder(ticketResp.Body).Decode(&ticketData)
	if ticketData.Ticket == "" {
		t.Fatalf("expected non-empty ticket ID")
	}

	// 3. Connect to WebSocket using ticket
	wsURL := "ws" + strings.TrimPrefix(testServer.URL, "http") + "/ws?ticket=" + ticketData.Ticket
	ws, _, err := websocket.DefaultDialer.Dial(wsURL, nil)
	if err != nil {
		t.Fatalf("failed to connect via WS ticket: %v", err)
	}
	defer ws.Close()

	// Verify 'joined' message received
	_ = ws.SetReadDeadline(time.Now().Add(2 * time.Second))
	_, msgBytes, err := ws.ReadMessage()
	if err != nil {
		t.Fatalf("failed to read joined message: %v", err)
	}
	var srvMsg protocol.ServerMessage
	_ = json.Unmarshal(msgBytes, &srvMsg)
	if srvMsg.Type != "joined" {
		t.Fatalf("expected joined message, got %s", srvMsg.Type)
	}

	// 4. Second connection with same ticket MUST be rejected (single-use)
	_, replayResp, replayErr := websocket.DefaultDialer.Dial(wsURL, nil)
	if replayErr == nil {
		t.Fatal("expected replay of consumed ticket to be rejected")
	}
	if replayResp != nil && replayResp.StatusCode != http.StatusUnauthorized {
		t.Fatalf("expected 401 on ticket replay, got %d", replayResp.StatusCode)
	}
}

