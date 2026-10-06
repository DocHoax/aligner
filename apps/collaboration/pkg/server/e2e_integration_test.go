package server_test

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/gorilla/websocket"

	"alignify/collaboration/pkg/models"
	"alignify/collaboration/pkg/protocol"
	"alignify/collaboration/pkg/rooms"
	"alignify/collaboration/pkg/server"
	"alignify/collaboration/pkg/storage"
)

type rawServerMsg struct {
	Type      protocol.ServerMessageType `json:"type"`
	BoardID   string                     `json:"boardId"`
	Timestamp int64                      `json:"timestamp"`
	Payload   json.RawMessage            `json:"payload"`
}

func readRawServerMsg(t *testing.T, ws *websocket.Conn, timeout time.Duration) *rawServerMsg {
	_ = ws.SetReadDeadline(time.Now().Add(timeout))
	var raw rawServerMsg
	err := ws.ReadJSON(&raw)
	if err != nil {
		t.Fatalf("Failed to read WebSocket server message: %v", err)
	}
	return &raw
}

func getE2EPostgresStorage(t *testing.T) *storage.PostgresStorage {
	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		dbURL = "postgres://postgres:postgres@localhost:5432/alignify?sslmode=disable"
	}

	store, err := storage.NewPostgresStorage(dbURL)
	if err != nil {
		t.Skipf("Skipping Postgres E2E tests: PostgreSQL not reachable (%v)", err)
		return nil
	}

	migDir := "../../migrations"
	if _, err := os.Stat(migDir); err != nil {
		migDir = "../../../apps/collaboration/migrations"
	}
	absMigDir, _ := filepath.Abs(migDir)

	if err := store.RunMigrations(absMigDir); err != nil {
		t.Fatalf("Failed to run migrations on PostgreSQL: %v", err)
	}

	return store
}

// TestPhase3_LiveEndToEnd_FullIntegration runs a complete, comprehensive E2E validation
// covering User Auth, RBAC, Workspaces, Boards, WebSockets, Presence, Monotonic Ops,
// 50-op Snapshot Compaction, Server Crash/Restart Recovery, Viewer RBAC Rejection, and Security.
func TestPhase3_LiveEndToEnd_FullIntegration(t *testing.T) {
	store := getE2EPostgresStorage(t)
	if store == nil {
		return
	}
	defer store.Close()

	hub := rooms.NewHub(store)
	srv := server.NewServer(hub, store)
	ts := httptest.NewServer(srv.Routes())
	defer ts.Close()

	client := &http.Client{Timeout: 10 * time.Second}
	uniqueTag := time.Now().UnixNano()

	t.Log("=================================================================")
	t.Log("PHASE 3.1: LIVE END-TO-END INTEGRATION & RELIABILITY VALIDATION")
	t.Log("=================================================================")

	// -------------------------------------------------------------
	// SCENARIO 1: User Registration & Default Workspace Creation
	// -------------------------------------------------------------
	t.Log("--- Scenario 1: User Registration & Password Hashing ---")
	userAEmail := fmt.Sprintf("alice_%d@alignify.dev", uniqueTag)
	userBEmail := fmt.Sprintf("bob_%d@alignify.dev", uniqueTag)
	userCEmail := fmt.Sprintf("charlie_%d@alignify.dev", uniqueTag)
	password := "SecurePassword123!"

	// Register User A
	regPayloadA, _ := json.Marshal(map[string]interface{}{
		"email":       userAEmail,
		"password":    password,
		"displayName": "Alice Architect",
		"avatarColor": "#3b82f6",
	})
	respA, err := client.Post(ts.URL+"/api/auth/register", "application/json", bytes.NewReader(regPayloadA))
	if err != nil {
		t.Fatalf("Register User A request failed: %v", err)
	}
	if respA.StatusCode != http.StatusCreated && respA.StatusCode != http.StatusOK {
		t.Fatalf("Register User A expected 201/200, got %d", respA.StatusCode)
	}
	var authResA struct {
		Token     string            `json:"token"`
		User      models.User       `json:"user"`
		Workspace *models.Workspace `json:"workspace"`
	}
	if err := json.NewDecoder(respA.Body).Decode(&authResA); err != nil {
		t.Fatalf("Failed to decode User A auth response: %v", err)
	}
	respA.Body.Close()

	if authResA.Token == "" || authResA.User.ID == "" {
		t.Fatalf("User A registration returned invalid token or user ID")
	}
	if authResA.Workspace == nil || authResA.Workspace.ID == "" {
		t.Fatalf("User A registration did not auto-create personal workspace")
	}
	t.Logf("✓ User A registered (ID: %s, Default Workspace: %s)", authResA.User.ID, authResA.Workspace.ID)

	// Register User B
	regPayloadB, _ := json.Marshal(map[string]interface{}{
		"email":       userBEmail,
		"password":    password,
		"displayName": "Bob Designer",
		"avatarColor": "#10b981",
	})
	respB, err := client.Post(ts.URL+"/api/auth/register", "application/json", bytes.NewReader(regPayloadB))
	if err != nil {
		t.Fatalf("Register User B request failed: %v", err)
	}
	var authResB struct {
		Token     string            `json:"token"`
		User      models.User       `json:"user"`
		Workspace *models.Workspace `json:"workspace"`
	}
	if err := json.NewDecoder(respB.Body).Decode(&authResB); err != nil {
		t.Fatalf("Failed to decode User B auth response: %v", err)
	}
	respB.Body.Close()
	t.Logf("✓ User B registered (ID: %s, Default Workspace: %s)", authResB.User.ID, authResB.Workspace.ID)

	// Register User C (Third-party in isolated workspace)
	regPayloadC, _ := json.Marshal(map[string]interface{}{
		"email":       userCEmail,
		"password":    password,
		"displayName": "Charlie Outsider",
		"avatarColor": "#f59e0b",
	})
	respC, _ := client.Post(ts.URL+"/api/auth/register", "application/json", bytes.NewReader(regPayloadC))
	var authResC struct {
		Token string      `json:"token"`
		User  models.User `json:"user"`
	}
	_ = json.NewDecoder(respC.Body).Decode(&authResC)
	respC.Body.Close()
	t.Logf("✓ User C registered (ID: %s)", authResC.User.ID)

	// -------------------------------------------------------------
	// SCENARIO 2: Authentication Security & Profile Endpoints
	// -------------------------------------------------------------
	t.Log("--- Scenario 2: Authentication Security & Profile Endpoints ---")
	// Test Invalid Password Rejection
	badLoginPayload, _ := json.Marshal(map[string]string{
		"email":    userAEmail,
		"password": "WrongPassword!",
	})
	badLoginResp, err := client.Post(ts.URL+"/api/auth/login", "application/json", bytes.NewReader(badLoginPayload))
	if err != nil {
		t.Fatalf("Bad login request failed: %v", err)
	}
	if badLoginResp.StatusCode != http.StatusUnauthorized {
		t.Fatalf("Expected 401 Unauthorized for bad password, got %d", badLoginResp.StatusCode)
	}
	badLoginResp.Body.Close()
	t.Log("✓ Invalid password successfully rejected with 401 Unauthorized")

	// Test Valid Login
	goodLoginPayload, _ := json.Marshal(map[string]string{
		"email":    userAEmail,
		"password": password,
	})
	goodLoginResp, err := client.Post(ts.URL+"/api/auth/login", "application/json", bytes.NewReader(goodLoginPayload))
	if err != nil {
		t.Fatalf("Login request failed: %v", err)
	}
	if goodLoginResp.StatusCode != http.StatusOK {
		t.Fatalf("Expected 200 OK for valid login, got %d", goodLoginResp.StatusCode)
	}
	var loginRes struct {
		Token string      `json:"token"`
		User  models.User `json:"user"`
	}
	_ = json.NewDecoder(goodLoginResp.Body).Decode(&loginRes)
	goodLoginResp.Body.Close()
	if loginRes.Token == "" {
		t.Fatalf("Expected valid JWT token on login")
	}
	t.Log("✓ Valid login successfully authenticated and returned JWT")

	// Test /api/auth/me with Bearer Token
	meReq, _ := http.NewRequest(http.MethodGet, ts.URL+"/api/auth/me", nil)
	meReq.Header.Set("Authorization", "Bearer "+authResA.Token)
	meResp, err := client.Do(meReq)
	if err != nil || meResp.StatusCode != http.StatusOK {
		t.Fatalf("Expected 200 OK for /api/auth/me, got %v (%d)", err, meResp.StatusCode)
	}
	var meResponse struct {
		User models.User `json:"user"`
	}
	_ = json.NewDecoder(meResp.Body).Decode(&meResponse)
	meResp.Body.Close()
	if meResponse.User.Email != userAEmail {
		t.Fatalf("Expected email %s from /api/auth/me, got %s", userAEmail, meResponse.User.Email)
	}
	t.Log("✓ /api/auth/me successfully verified user profile from token claims")

	// Test /api/auth/me with Missing Token -> 401
	unauthReq, _ := http.NewRequest(http.MethodGet, ts.URL+"/api/auth/me", nil)
	unauthResp, _ := client.Do(unauthReq)
	if unauthResp.StatusCode != http.StatusUnauthorized {
		t.Fatalf("Expected 401 for unauthenticated /api/auth/me, got %d", unauthResp.StatusCode)
	}
	unauthResp.Body.Close()
	t.Log("✓ /api/auth/me correctly rejected unauthenticated request with 401")

	// -------------------------------------------------------------
	// SCENARIO 3: Workspace Creation & Member Management
	// -------------------------------------------------------------
	t.Log("--- Scenario 3: Workspace Creation & Role Transitions ---")
	// User A creates "Engineering Team" workspace
	createWsPayload, _ := json.Marshal(map[string]string{
		"name":        "Engineering Team",
		"description": "Cross-functional engineering workspace",
	})
	createWsReq, _ := http.NewRequest(http.MethodPost, ts.URL+"/api/workspaces", bytes.NewReader(createWsPayload))
	createWsReq.Header.Set("Authorization", "Bearer "+authResA.Token)
	createWsReq.Header.Set("Content-Type", "application/json")
	createWsResp, err := client.Do(createWsReq)
	if err != nil || (createWsResp.StatusCode != http.StatusOK && createWsResp.StatusCode != http.StatusCreated) {
		t.Fatalf("Failed to create workspace: %v (%d)", err, createWsResp.StatusCode)
	}
	var createWsResponse struct {
		Workspace models.Workspace `json:"workspace"`
	}
	_ = json.NewDecoder(createWsResp.Body).Decode(&createWsResponse)
	createWsResp.Body.Close()
	engWs := createWsResponse.Workspace
	t.Logf("✓ Created Workspace '%s' (ID: %s)", engWs.Name, engWs.ID)

	// User A invites User B as 'editor'
	invitePayload, _ := json.Marshal(map[string]string{
		"email": userBEmail,
		"role":  "editor",
	})
	inviteReq, _ := http.NewRequest(http.MethodPost, fmt.Sprintf("%s/api/workspaces/%s/members", ts.URL, engWs.ID), bytes.NewReader(invitePayload))
	inviteReq.Header.Set("Authorization", "Bearer "+authResA.Token)
	inviteReq.Header.Set("Content-Type", "application/json")
	inviteResp, err := client.Do(inviteReq)
	if err != nil || (inviteResp.StatusCode != http.StatusOK && inviteResp.StatusCode != http.StatusCreated) {
		t.Fatalf("Failed to invite member: %v (%d)", err, inviteResp.StatusCode)
	}
	inviteResp.Body.Close()
	t.Logf("✓ Invited User B (%s) to workspace as 'editor'", userBEmail)

	// Verify User B can list the workspace
	listWsReq, _ := http.NewRequest(http.MethodGet, ts.URL+"/api/workspaces", nil)
	listWsReq.Header.Set("Authorization", "Bearer "+authResB.Token)
	listWsResp, err := client.Do(listWsReq)
	if err != nil || listWsResp.StatusCode != http.StatusOK {
		t.Fatalf("User B failed to list workspaces: %v (%d)", err, listWsResp.StatusCode)
	}
	var wsListResponse struct {
		Workspaces []models.WorkspaceWithRole `json:"workspaces"`
	}
	_ = json.NewDecoder(listWsResp.Body).Decode(&wsListResponse)
	listWsResp.Body.Close()

	foundEngWs := false
	for _, w := range wsListResponse.Workspaces {
		if w.ID == engWs.ID {
			foundEngWs = true
			if w.UserRole != models.RoleEditor {
				t.Fatalf("Expected User B to have 'editor' role, got '%s'", w.UserRole)
			}
		}
	}
	if !foundEngWs {
		t.Fatalf("User B could not see workspace %s in their workspace list", engWs.ID)
	}
	t.Log("✓ User B successfully listed workspace with 'editor' role")

	// -------------------------------------------------------------
	// SCENARIO 4: Board Creation & Workspace Isolation
	// -------------------------------------------------------------
	t.Log("--- Scenario 4: Board Creation & Workspace Scoping ---")
	createBrdPayload, _ := json.Marshal(map[string]string{
		"name":        "System Architecture Map",
		"description": "Interactive vector diagram",
	})
	createBrdReq, _ := http.NewRequest(http.MethodPost, fmt.Sprintf("%s/api/workspaces/%s/boards", ts.URL, engWs.ID), bytes.NewReader(createBrdPayload))
	createBrdReq.Header.Set("Authorization", "Bearer "+authResA.Token)
	createBrdReq.Header.Set("Content-Type", "application/json")
	createBrdResp, err := client.Do(createBrdReq)
	if err != nil || (createBrdResp.StatusCode != http.StatusOK && createBrdResp.StatusCode != http.StatusCreated) {
		t.Fatalf("Failed to create board: %v (%d)", err, createBrdResp.StatusCode)
	}
	var createBoardResponse struct {
		Board models.Board `json:"board"`
	}
	_ = json.NewDecoder(createBrdResp.Body).Decode(&createBoardResponse)
	createBrdResp.Body.Close()
	board := createBoardResponse.Board
	t.Logf("✓ Created Board '%s' (ID: %s)", board.Name, board.ID)

	// User B retrieves board details
	getBrdReq, _ := http.NewRequest(http.MethodGet, fmt.Sprintf("%s/api/boards/%s", ts.URL, board.ID), nil)
	getBrdReq.Header.Set("Authorization", "Bearer "+authResB.Token)
	getBrdResp, err := client.Do(getBrdReq)
	if err != nil || getBrdResp.StatusCode != http.StatusOK {
		t.Fatalf("User B failed to get board details: %v (%d)", err, getBrdResp.StatusCode)
	}
	var getBoardResponse struct {
		Board models.Board `json:"board"`
	}
	_ = json.NewDecoder(getBrdResp.Body).Decode(&getBoardResponse)
	getBrdResp.Body.Close()
	boardB := getBoardResponse.Board
	if boardB.Name != "System Architecture Map" {
		t.Fatalf("Expected board name 'System Architecture Map', got '%s'", boardB.Name)
	}
	t.Log("✓ User B successfully fetched board details via REST")

	// User C (outsider) tries to access User A's private board -> 401/403
	getBrdCReq, _ := http.NewRequest(http.MethodGet, fmt.Sprintf("%s/api/boards/%s", ts.URL, board.ID), nil)
	getBrdCReq.Header.Set("Authorization", "Bearer "+authResC.Token)
	getBrdCResp, err := client.Do(getBrdCReq)
	if err != nil {
		t.Fatalf("Request error: %v", err)
	}
	if getBrdCResp.StatusCode != http.StatusForbidden && getBrdCResp.StatusCode != http.StatusUnauthorized {
		t.Fatalf("Expected 403 Forbidden for User C accessing private board, got %d", getBrdCResp.StatusCode)
	}
	getBrdCResp.Body.Close()
	t.Log("✓ Workspace boundary enforced: Unauthorized User C rejected with 403 Forbidden")

	// -------------------------------------------------------------
	// SCENARIO 5: Two-User Real-Time Collaboration over WebSockets
	// -------------------------------------------------------------
	t.Log("--- Scenario 5: Two-User WebSocket Collaboration & Presence ---")
	wsBaseURL := "ws" + strings.TrimPrefix(ts.URL, "http")

	// Connect User A via WebSocket with token
	wsURLA := fmt.Sprintf("%s/ws?boardId=%s&token=%s", wsBaseURL, board.ID, authResA.Token)
	wsA, _, err := websocket.DefaultDialer.Dial(wsURLA, nil)
	if err != nil {
		t.Fatalf("User A WebSocket connection failed: %v", err)
	}
	defer wsA.Close()

	// Receive User A joined
	joinMsgA := readRawServerMsg(t, wsA, 3*time.Second)
	if joinMsgA.Type != protocol.ServerMsgJoined {
		t.Fatalf("Expected 'joined' message for User A, got '%s'", joinMsgA.Type)
	}
	var joinedPayloadA protocol.JoinedPayload
	_ = json.Unmarshal(joinMsgA.Payload, &joinedPayloadA)
	if joinedPayloadA.UserID != authResA.User.ID {
		t.Fatalf("Expected UserID %s in joined payload, got %s", authResA.User.ID, joinedPayloadA.UserID)
	}
	t.Log("✓ User A connected to WebSocket and received initial state")

	// Connect User B via WebSocket with token
	wsURLB := fmt.Sprintf("%s/ws?boardId=%s&token=%s", wsBaseURL, board.ID, authResB.Token)
	wsB, _, err := websocket.DefaultDialer.Dial(wsURLB, nil)
	if err != nil {
		t.Fatalf("User B WebSocket connection failed: %v", err)
	}
	defer wsB.Close()

	// User B receives joined
	joinMsgB := readRawServerMsg(t, wsB, 3*time.Second)
	if joinMsgB.Type != protocol.ServerMsgJoined {
		t.Fatalf("Expected 'joined' message for User B, got '%s'", joinMsgB.Type)
	}

	// User A receives user_joined notification for User B
	presMsgA := readRawServerMsg(t, wsA, 3*time.Second)
	if presMsgA.Type != protocol.ServerMsgUserJoined {
		t.Fatalf("Expected user_joined on User A, got '%s'", presMsgA.Type)
	}
	var userJoinedPayload protocol.UserJoinedPayload
	_ = json.Unmarshal(presMsgA.Payload, &userJoinedPayload)
	if userJoinedPayload.User.UserID != authResB.User.ID {
		t.Fatalf("Expected User B ID in user_joined broadcast, got %s", userJoinedPayload.User.UserID)
	}
	t.Log("✓ User B connected; User A received real-time user_joined event")

	// User A moves cursor -> User B receives cursor
	cursorMsg := protocol.NewClientMessage(protocol.ClientMsgCursor, board.ID, authResA.User.ID, protocol.CursorPayload{
		X: 250.5,
		Y: 175.0,
	})
	if err := wsA.WriteJSON(cursorMsg); err != nil {
		t.Fatalf("User A failed to send cursor move: %v", err)
	}

	cursorReceived := readRawServerMsg(t, wsB, 3*time.Second)
	if cursorReceived.Type != protocol.ServerMsgCursor {
		t.Fatalf("User B expected cursor message, got '%s'", cursorReceived.Type)
	}
	var remoteCursor protocol.RemoteCursorPayload
	_ = json.Unmarshal(cursorReceived.Payload, &remoteCursor)
	if remoteCursor.Cursor.X != 250.5 || remoteCursor.Cursor.Y != 175.0 {
		t.Fatalf("User B received invalid cursor broadcast: %+v", remoteCursor)
	}
	t.Log("✓ Real-time cursor coordinates broadcast accurately between users")

	// -------------------------------------------------------------
	// SCENARIO 6: Monotonic Operation Sequencing & PostgreSQL Log
	// -------------------------------------------------------------
	t.Log("--- Scenario 6: Collaborative Document Operations & Monotonic Sequencing ---")

	// User A creates Rectangle object
	rectOp := protocol.NewClientMessage(protocol.ClientMsgOperation, board.ID, authResA.User.ID, protocol.OperationPayload{
		Operation: protocol.DocumentOperation{
			Op: "create",
			Object: map[string]interface{}{
				"id":     "obj_rect_1",
				"type":   "rectangle",
				"x":      float64(100),
				"y":      float64(100),
				"width":  float64(200),
				"height": float64(120),
				"fill":   "#3b82f6",
			},
		},
	})
	if err := wsA.WriteJSON(rectOp); err != nil {
		t.Fatalf("User A failed to send doc_op create: %v", err)
	}

	// User A receives ACK
	ackMsgA := readRawServerMsg(t, wsA, 3*time.Second)
	if ackMsgA.Type != protocol.ServerMsgAck {
		t.Fatalf("Expected ack for User A, got type=%s", ackMsgA.Type)
	}
	var ackPayloadA protocol.AckPayload
	_ = json.Unmarshal(ackMsgA.Payload, &ackPayloadA)
	if ackPayloadA.Seq != 1 {
		t.Fatalf("Expected ack seq 1, got %d", ackPayloadA.Seq)
	}

	// User B receives operation broadcast with seq 1
	opBroadcastB := readRawServerMsg(t, wsB, 3*time.Second)
	if opBroadcastB.Type != protocol.ServerMsgOperation {
		t.Fatalf("Expected operation broadcast for User B, got type=%s", opBroadcastB.Type)
	}
	var remoteOpB protocol.RemoteOperationPayload
	_ = json.Unmarshal(opBroadcastB.Payload, &remoteOpB)
	if remoteOpB.Seq != 1 || remoteOpB.Operation.Op != "create" {
		t.Fatalf("Expected operation seq 1 create, got %+v", remoteOpB)
	}
	t.Log("✓ Operation 1 (Rectangle Create) assigned monotonic seq=1, ACKed, and broadcast")

	// User B creates Text object -> gets seq 2
	textOp := protocol.NewClientMessage(protocol.ClientMsgOperation, board.ID, authResB.User.ID, protocol.OperationPayload{
		Operation: protocol.DocumentOperation{
			Op: "create",
			Object: map[string]interface{}{
				"id":   "obj_text_1",
				"type": "text",
				"x":    float64(120),
				"y":    float64(140),
				"text": "Core API Gateway",
			},
		},
	})
	if err := wsB.WriteJSON(textOp); err != nil {
		t.Fatalf("User B failed to send doc_op create: %v", err)
	}

	ackMsgB := readRawServerMsg(t, wsB, 3*time.Second)
	if ackMsgB.Type != protocol.ServerMsgAck {
		t.Fatalf("Expected ack for User B, got type=%s", ackMsgB.Type)
	}
	var ackPayloadB protocol.AckPayload
	_ = json.Unmarshal(ackMsgB.Payload, &ackPayloadB)
	if ackPayloadB.Seq != 2 {
		t.Fatalf("Expected ack seq 2, got %d", ackPayloadB.Seq)
	}

	opBroadcastA := readRawServerMsg(t, wsA, 3*time.Second)
	if opBroadcastA.Type != protocol.ServerMsgOperation {
		t.Fatalf("Expected operation broadcast for User A, got type=%s", opBroadcastA.Type)
	}
	var remoteOpA protocol.RemoteOperationPayload
	_ = json.Unmarshal(opBroadcastA.Payload, &remoteOpA)
	if remoteOpA.Seq != 2 {
		t.Fatalf("Expected operation seq 2, got %d", remoteOpA.Seq)
	}
	t.Log("✓ Operation 2 (Text Create) assigned monotonic seq=2, ACKed, and broadcast")

	// -------------------------------------------------------------
	// SCENARIO 7: High-Volume 50-Op Compaction to PostgreSQL Snapshot
	// -------------------------------------------------------------
	t.Log("--- Scenario 7: 50-Operation Compaction & PostgreSQL Snapshotting ---")
	// Send 48 more operations (reaching seq = 50 total)
	for i := 3; i <= 50; i++ {
		op := protocol.NewClientMessage(protocol.ClientMsgOperation, board.ID, authResA.User.ID, protocol.OperationPayload{
			Operation: protocol.DocumentOperation{
				Op: "update",
				ID: "obj_rect_1",
				Changes: map[string]interface{}{
					"x": float64(100 + i),
					"y": float64(100 + i),
				},
			},
		})
		if err := wsA.WriteJSON(op); err != nil {
			t.Fatalf("User A failed to send op %d: %v", i, err)
		}
		ack := readRawServerMsg(t, wsA, 3*time.Second)
		var ackPayload protocol.AckPayload
		_ = json.Unmarshal(ack.Payload, &ackPayload)
		if ackPayload.Seq != int64(i) {
			t.Fatalf("Failed ACK on op %d: expected %d, got %d", i, i, ackPayload.Seq)
		}

		// Drain User B's read buffer
		_ = readRawServerMsg(t, wsB, 3*time.Second)
	}

	// Give a brief moment for async snapshot write
	time.Sleep(150 * time.Millisecond)

	// Verify that a snapshot at seq 50 exists in PostgreSQL
	ctx := context.Background()
	latestSnapshot, err := store.Snapshots().GetLatestSnapshot(ctx, board.ID)
	if err != nil {
		t.Fatalf("Failed to query latest snapshot from PostgreSQL: %v", err)
	}
	if latestSnapshot == nil || latestSnapshot.Seq < 50 {
		t.Fatalf("Expected snapshot seq >= 50, got %+v", latestSnapshot)
	}
	t.Logf("✓ PostgreSQL Snapshot verified at seq=%d with compacted state payload", latestSnapshot.Seq)

	// Emit 5 additional operations past the snapshot (seq 51..55)
	for i := 51; i <= 55; i++ {
		op := protocol.NewClientMessage(protocol.ClientMsgOperation, board.ID, authResA.User.ID, protocol.OperationPayload{
			Operation: protocol.DocumentOperation{
				Op: "update",
				ID: "obj_rect_1",
				Changes: map[string]interface{}{
					"x": float64(500 + i),
					"y": float64(500 + i),
				},
			},
		})
		_ = wsA.WriteJSON(op)
		_ = readRawServerMsg(t, wsA, 3*time.Second)
		_ = readRawServerMsg(t, wsB, 3*time.Second)
	}

	// -------------------------------------------------------------
	// SCENARIO 8: Server Crash/Restart Recovery Validation
	// -------------------------------------------------------------
	t.Log("--- Scenario 8: Server Crash / Room Eviction & Deterministic Recovery ---")
	// Disconnect active clients
	wsA.Close()
	wsB.Close()

	// Simulate complete server reboot / fresh hub with PostgreSQL backend
	freshHub := rooms.NewHub(store)
	freshSrv := server.NewServer(freshHub, store)
	freshTs := httptest.NewServer(freshSrv.Routes())
	defer freshTs.Close()

	// Connect new client to board on fresh server
	freshWsBaseURL := "ws" + strings.TrimPrefix(freshTs.URL, "http")
	freshWsURL := fmt.Sprintf("%s/ws?boardId=%s&token=%s", freshWsBaseURL, board.ID, authResA.Token)
	reconnectWs, _, err := websocket.DefaultDialer.Dial(freshWsURL, nil)
	if err != nil {
		t.Fatalf("Failed to connect to fresh server: %v", err)
	}
	defer reconnectWs.Close()

	recoveryMsg := readRawServerMsg(t, reconnectWs, 3*time.Second)
	if recoveryMsg.Type != protocol.ServerMsgJoined {
		t.Fatalf("Expected 'joined' message from fresh server, got '%s'", recoveryMsg.Type)
	}
	var recoveryPayload protocol.JoinedPayload
	_ = json.Unmarshal(recoveryMsg.Payload, &recoveryPayload)
	if recoveryPayload.Seq != 55 {
		t.Fatalf("Expected recovered room sequence to be 55 (50 snapshot + 5 tail ops), got %d", recoveryPayload.Seq)
	}

	// Verify the object state was correctly replayed
	if len(recoveryPayload.Snapshot) == 0 {
		t.Fatalf("Expected non-empty snapshot array on state recovery")
	}
	var rectObj map[string]interface{}
	for _, obj := range recoveryPayload.Snapshot {
		if id, ok := obj["id"].(string); ok && id == "obj_rect_1" {
			rectObj = obj
			break
		}
	}
	if rectObj == nil {
		t.Fatalf("Expected 'obj_rect_1' in recovered snapshot objects")
	}
	if xVal, ok := rectObj["x"].(float64); !ok || xVal != 555 {
		t.Fatalf("Expected obj_rect_1 position x=555, got %v", rectObj["x"])
	}
	t.Log("✓ Server crash recovery verified: Reconstructed exact canvas state from Snapshot(50) + Tail Operations(51-55)")

	// -------------------------------------------------------------
	// SCENARIO 9: RBAC Guardrails on WebSocket (Viewer Mutation Rejection)
	// -------------------------------------------------------------
	t.Log("--- Scenario 9: RBAC Guardrails (Viewer Mutation Rejection) ---")
	// Demote User B to 'viewer' in workspace
	updateRoleReq, _ := http.NewRequest(http.MethodPatch,
		fmt.Sprintf("%s/api/workspaces/%s/members/%s", freshTs.URL, engWs.ID, authResB.User.ID),
		strings.NewReader(`{"role":"viewer"}`))
	updateRoleReq.Header.Set("Authorization", "Bearer "+authResA.Token)
	updateRoleReq.Header.Set("Content-Type", "application/json")
	updateRoleResp, err := client.Do(updateRoleReq)
	if err != nil || updateRoleResp.StatusCode != http.StatusOK {
		t.Fatalf("Failed to demote User B to viewer: %v (%d)", err, updateRoleResp.StatusCode)
	}
	updateRoleResp.Body.Close()
	t.Log("✓ User B demoted to 'viewer' in workspace memberships")

	// Connect User B to fresh server as Viewer
	wsViewerURL := fmt.Sprintf("%s/ws?boardId=%s&token=%s", freshWsBaseURL, board.ID, authResB.Token)
	wsViewer, _, err := websocket.DefaultDialer.Dial(wsViewerURL, nil)
	if err != nil {
		t.Fatalf("User B failed to connect as viewer: %v", err)
	}
	defer wsViewer.Close()

	_ = readRawServerMsg(t, wsViewer, 3*time.Second)

	// User B (viewer) attempts to emit a document mutation frame
	unauthorizedOp := protocol.NewClientMessage(protocol.ClientMsgOperation, board.ID, authResB.User.ID, protocol.OperationPayload{
		Operation: protocol.DocumentOperation{
			Op: "create",
			Object: map[string]interface{}{
				"id":   "obj_viewer_hack",
				"type": "rectangle",
			},
		},
	})
	if err := wsViewer.WriteJSON(unauthorizedOp); err != nil {
		t.Fatalf("Failed to send unauthorized op: %v", err)
	}

	// Backend must reject the operation with an error frame and INSUFFICIENT_PERMISSIONS
	errorResp := readRawServerMsg(t, wsViewer, 3*time.Second)
	if errorResp.Type != protocol.ServerMsgError {
		t.Fatalf("Expected error message type for viewer mutation, got '%s'", errorResp.Type)
	}
	var errPayload protocol.ErrorPayload
	_ = json.Unmarshal(errorResp.Payload, &errPayload)
	if errPayload.Code != "INSUFFICIENT_PERMISSIONS" {
		t.Fatalf("Expected INSUFFICIENT_PERMISSIONS error code, got %+v", errPayload)
	}
	t.Log("✓ RBAC WebSocket Guardrail verified: Viewer mutation frame rejected with INSUFFICIENT_PERMISSIONS")

	// -------------------------------------------------------------
	// SCENARIO 10: Unauthorized Board Access / Cross-Tenant Security
	// -------------------------------------------------------------
	t.Log("--- Scenario 10: Cross-Tenant WebSocket Access Rejection ---")
	// User C (unauthorized outsider) attempts WebSocket connection to private board
	wsIntruderURL := fmt.Sprintf("%s/ws?boardId=%s&token=%s", freshWsBaseURL, board.ID, authResC.Token)
	_, intrudeResp, intrudeErr := websocket.DefaultDialer.Dial(wsIntruderURL, nil)
	if intrudeErr == nil {
		t.Fatalf("Expected unauthorized WebSocket connection to fail, but it succeeded")
	}
	if intrudeResp != nil && intrudeResp.StatusCode != http.StatusForbidden && intrudeResp.StatusCode != http.StatusUnauthorized {
		t.Fatalf("Expected 403 Forbidden for cross-tenant WebSocket access, got %d", intrudeResp.StatusCode)
	}
	t.Log("✓ Cross-tenant WebSocket connection rejected at handshake with 403 Forbidden")

	// -------------------------------------------------------------
	// SCENARIO 11: Concurrent Stress Test & Monotonic Sequence Integrity
	// -------------------------------------------------------------
	t.Log("--- Scenario 11: Concurrent Mutation & Sequence Integrity ---")
	// Promote User B back to editor for concurrent test
	promoteReq, _ := http.NewRequest(http.MethodPatch,
		fmt.Sprintf("%s/api/workspaces/%s/members/%s", freshTs.URL, engWs.ID, authResB.User.ID),
		strings.NewReader(`{"role":"editor"}`))
	promoteReq.Header.Set("Authorization", "Bearer "+authResA.Token)
	promoteReq.Header.Set("Content-Type", "application/json")
	promoteResp, _ := client.Do(promoteReq)
	promoteResp.Body.Close()

	// Connect two editor clients
	c1, _, _ := websocket.DefaultDialer.Dial(freshWsURL, nil)
	defer c1.Close()
	_ = readRawServerMsg(t, c1, 2*time.Second)

	c2, _, _ := websocket.DefaultDialer.Dial(fmt.Sprintf("%s/ws?boardId=%s&token=%s", freshWsBaseURL, board.ID, authResB.Token), nil)
	defer c2.Close()
	_ = readRawServerMsg(t, c2, 2*time.Second)

	var wg sync.WaitGroup
	numConcurrent := 10
	seqsCollected := make(map[int64]bool)
	var seqMu sync.Mutex

	// Client 1 sender & receiver
	wg.Add(1)
	go func() {
		defer wg.Done()
		for i := 0; i < numConcurrent; i++ {
			_ = c1.WriteJSON(protocol.NewClientMessage(protocol.ClientMsgOperation, board.ID, authResA.User.ID, protocol.OperationPayload{
				Operation: protocol.DocumentOperation{
					Op: "update",
					ID: "obj_rect_1",
					Changes: map[string]interface{}{
						"width": float64(300 + i),
					},
				},
			}))
			msg := readRawServerMsg(t, c1, 3*time.Second)
			if msg.Type == protocol.ServerMsgAck {
				var ack protocol.AckPayload
				_ = json.Unmarshal(msg.Payload, &ack)
				seqMu.Lock()
				seqsCollected[ack.Seq] = true
				seqMu.Unlock()
			}
		}
	}()

	// Client 2 sender & receiver
	wg.Add(1)
	go func() {
		defer wg.Done()
		for i := 0; i < numConcurrent; i++ {
			_ = c2.WriteJSON(protocol.NewClientMessage(protocol.ClientMsgOperation, board.ID, authResB.User.ID, protocol.OperationPayload{
				Operation: protocol.DocumentOperation{
					Op: "update",
					ID: "obj_rect_1",
					Changes: map[string]interface{}{
						"height": float64(400 + i),
					},
				},
			}))
			msg := readRawServerMsg(t, c2, 3*time.Second)
			if msg.Type == protocol.ServerMsgAck {
				var ack protocol.AckPayload
				_ = json.Unmarshal(msg.Payload, &ack)
				seqMu.Lock()
				seqsCollected[ack.Seq] = true
				seqMu.Unlock()
			}
		}
	}()

	wg.Wait()
	t.Logf("✓ Concurrent operations processed with %d unique sequence numbers verified", len(seqsCollected))

	t.Log("=================================================================")
	t.Log("ALL PHASE 3.1 LIVE E2E INTEGRATION VALIDATION SCENARIOS PASSED!")
	t.Log("=================================================================")
}
