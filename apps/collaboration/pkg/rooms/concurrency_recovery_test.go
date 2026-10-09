package rooms_test

import (
	"context"
	"encoding/json"
	"fmt"
	"math/rand"
	"sync"
	"testing"
	"time"

	"alignify/collaboration/pkg/client"
	"alignify/collaboration/pkg/models"
	"alignify/collaboration/pkg/protocol"
	"alignify/collaboration/pkg/rooms"
	"alignify/collaboration/pkg/storage"
)

// Helper to create a fake test client connected to a room.
func createTestClient(userID, userName, color string, role models.Role, boardID string, room *rooms.Room) *client.Client {
	c := client.NewClient(userID, userName, color, role, boardID, nil, room)
	return c
}

// 1. Test Monotonic Sequence Numbers and ACK Confirmation Flow
func TestConcurrency_MonotonicSequenceAndAckFlow(t *testing.T) {
	memStore := storage.NewMemoryStorage()
	hub := rooms.NewHub()
	boardID := "board-monotonic-test"
	room := rooms.NewRoom(boardID, hub, memStore)
	go room.Run()
	defer room.Stop()

	c1 := createTestClient("user-1", "Alice", "#3b82f6", models.RoleEditor, boardID, room)
	c2 := createTestClient("user-2", "Bob", "#10b981", models.RoleEditor, boardID, room)

	room.Register(c1)
	room.Register(c2)
	time.Sleep(50 * time.Millisecond)

	// Drain joined messages
	drainChannel(c1.Send, 50*time.Millisecond)
	drainChannel(c2.Send, 50*time.Millisecond)

	const opCount = 20
	receivedAcks := make([]int64, 0, opCount)
	receivedBroadcasts := make([]int64, 0, opCount)

	for i := 1; i <= opCount; i++ {
		op := protocol.DocumentOperation{
			Op: "create",
			Object: map[string]interface{}{
				"id":     fmt.Sprintf("node-%d", i),
				"type":   "service",
				"x":      float64(i * 10),
				"y":      float64(i * 20),
				"width":  120.0,
				"height": 60.0,
			},
		}

		msg := protocol.NewClientMessage(protocol.ClientMsgOperation, boardID, c1.UserID, protocol.OperationPayload{
			Operation: op,
		})
		room.HandleMessage(c1, msg)

		// Author c1 should receive ACK
		select {
		case raw := <-c1.Send:
			var sMsg protocol.ServerMessage
			if err := json.Unmarshal(raw, &sMsg); err != nil {
				t.Fatalf("failed to parse c1 msg: %v", err)
			}
			if sMsg.Type != "ack" {
				t.Fatalf("expected 'ack', got '%s'", sMsg.Type)
			}
			var ack protocol.AckPayload
			b, _ := json.Marshal(sMsg.Payload)
			_ = json.Unmarshal(b, &ack)
			receivedAcks = append(receivedAcks, ack.Seq)
		case <-time.After(500 * time.Millisecond):
			t.Fatalf("timed out waiting for ack on op %d", i)
		}

		// Peer c2 should receive broadcast operation
		select {
		case raw := <-c2.Send:
			var sMsg protocol.ServerMessage
			if err := json.Unmarshal(raw, &sMsg); err != nil {
				t.Fatalf("failed to parse c2 msg: %v", err)
			}
			if sMsg.Type != "operation" {
				t.Fatalf("expected 'operation', got '%s'", sMsg.Type)
			}
			var remoteOp protocol.RemoteOperationPayload
			b, _ := json.Marshal(sMsg.Payload)
			_ = json.Unmarshal(b, &remoteOp)
			receivedBroadcasts = append(receivedBroadcasts, remoteOp.Seq)
		case <-time.After(500 * time.Millisecond):
			t.Fatalf("timed out waiting for broadcast on op %d", i)
		}
	}

	// Verify Monotonic Sequence Numbers: strictly 1..opCount with 0 gaps and 0 duplicates
	for i := 1; i <= opCount; i++ {
		expectedSeq := int64(i)
		if receivedAcks[i-1] != expectedSeq {
			t.Errorf("ACK seq mismatch at index %d: expected %d, got %d", i-1, expectedSeq, receivedAcks[i-1])
		}
		if receivedBroadcasts[i-1] != expectedSeq {
			t.Errorf("Broadcast seq mismatch at index %d: expected %d, got %d", i-1, expectedSeq, receivedBroadcasts[i-1])
		}
	}
}

// 2. Test Multi-Client Concurrent Operations with Artificial Jitter
func TestConcurrency_MultiClientWithJitter(t *testing.T) {
	memStore := storage.NewMemoryStorage()
	hub := rooms.NewHub()
	boardID := "board-concurrent-jitter"
	room := rooms.NewRoom(boardID, hub, memStore)
	go room.Run()
	defer room.Stop()

	const numClients = 4
	const opsPerClient = 15
	totalOps := numClients * opsPerClient

	clients := make([]*client.Client, numClients)
	for i := 0; i < numClients; i++ {
		c := createTestClient(fmt.Sprintf("user-%d", i+1), fmt.Sprintf("User%d", i+1), "#f59e0b", models.RoleEditor, boardID, room)
		clients[i] = c
		room.Register(c)
	}
	time.Sleep(50 * time.Millisecond)

	for _, c := range clients {
		drainChannel(c.Send, 50*time.Millisecond)
	}

	var wg sync.WaitGroup
	wg.Add(numClients)

	for clientIdx := 0; clientIdx < numClients; clientIdx++ {
		go func(cIdx int) {
			defer wg.Done()
			c := clients[cIdx]

			for opIdx := 0; opIdx < opsPerClient; opIdx++ {
				// Artificial jitter simulation (1-5ms)
				time.Sleep(time.Duration(rand.Intn(5)+1) * time.Millisecond)

				nodeID := fmt.Sprintf("node-c%d-%d", cIdx, opIdx)
				op := protocol.DocumentOperation{
					Op: "create",
					Object: map[string]interface{}{
						"id":     nodeID,
						"type":   "service",
						"x":      float64(cIdx * 100),
						"y":      float64(opIdx * 50),
						"width":  100.0,
						"height": 50.0,
					},
				}

				msg := protocol.NewClientMessage(protocol.ClientMsgOperation, boardID, c.UserID, protocol.OperationPayload{
					Operation: op,
				})
				room.HandleMessage(c, msg)
			}
		}(clientIdx)
	}

	wg.Wait()
	time.Sleep(200 * time.Millisecond)

	// Verify in storage that all operations were processed and have unique, monotonic sequence numbers
	ctx := context.Background()
	ops, err := memStore.Operations().GetOperationsAfterSeq(ctx, boardID, 0)
	if err != nil {
		t.Fatalf("failed to query operations: %v", err)
	}

	if len(ops) != totalOps {
		t.Fatalf("expected %d total operations processed, got %d", totalOps, len(ops))
	}

	// Ensure no duplicate sequence numbers and strict progression 1..totalOps
	seenSeq := make(map[int64]bool)
	for idx, op := range ops {
		expectedSeq := int64(idx + 1)
		if op.Seq != expectedSeq {
			t.Errorf("expected op %d to have seq %d, got %d", idx, expectedSeq, op.Seq)
		}
		if seenSeq[op.Seq] {
			t.Fatalf("duplicate sequence number detected: %d", op.Seq)
		}
		seenSeq[op.Seq] = true
	}
}

// 3. Test Snapshot Compaction at 50-Operation Intervals
func TestSnapshotCompaction_Every50Operations(t *testing.T) {
	memStore := storage.NewMemoryStorage()
	hub := rooms.NewHub()
	boardID := "board-compaction-50"
	room := rooms.NewRoom(boardID, hub, memStore)
	go room.Run()
	defer room.Stop()

	c := createTestClient("user-snapshot", "Snapshotter", "#8b5cf6", models.RoleEditor, boardID, room)
	room.Register(c)
	time.Sleep(50 * time.Millisecond)
	drainChannel(c.Send, 50*time.Millisecond)

	// Dispatch 110 sequential operations
	const totalOps = 110
	for i := 1; i <= totalOps; i++ {
		op := protocol.DocumentOperation{
			Op: "create",
			Object: map[string]interface{}{
				"id":     fmt.Sprintf("item-%d", i),
				"type":   "box",
				"x":      float64(i * 5),
				"y":      float64(i * 5),
				"width":  50.0,
				"height": 50.0,
			},
		}

		msg := protocol.NewClientMessage(protocol.ClientMsgOperation, boardID, c.UserID, protocol.OperationPayload{
			Operation: op,
		})
		room.HandleMessage(c, msg)
		// Small yield to let room process sequentially
		time.Sleep(2 * time.Millisecond)
	}

	time.Sleep(100 * time.Millisecond)

	// Verify snapshots in storage
	ctx := context.Background()
	snapshots, err := memStore.Snapshots().ListSnapshots(ctx, boardID)
	if err != nil {
		t.Fatalf("failed to list snapshots: %v", err)
	}

	// Should have snapshots at seq=50 and seq=100
	if len(snapshots) < 2 {
		t.Fatalf("expected at least 2 snapshots (at 50 and 100 ops), got %d", len(snapshots))
	}

	// Verify latest snapshot is at least seq=100
	latest, err := memStore.Snapshots().GetLatestSnapshot(ctx, boardID)
	if err != nil {
		t.Fatalf("failed to get latest snapshot: %v", err)
	}
	if latest.Seq != 100 {
		t.Errorf("expected latest snapshot at seq 100, got %d", latest.Seq)
	}

	// Verify snapshot contains 100 objects
	var snapObjs []map[string]interface{}
	if err := json.Unmarshal(latest.Data, &snapObjs); err != nil {
		t.Fatalf("failed to unmarshal snapshot data: %v", err)
	}
	if len(snapObjs) != 100 {
		t.Errorf("expected 100 objects in snapshot 100, got %d", len(snapObjs))
	}
}

// 4. Test Reconnect and Catch-Up from Snapshot + Delta Operations
func TestReconnect_CatchUpFromSnapshotAndDeltas(t *testing.T) {
	memStore := storage.NewMemoryStorage()
	hub := rooms.NewHub()
	boardID := "board-reconnect-catchup"
	room := rooms.NewRoom(boardID, hub, memStore)
	go room.Run()
	defer room.Stop()

	c1 := createTestClient("user-1", "Alice", "#3b82f6", models.RoleEditor, boardID, room)
	room.Register(c1)
	time.Sleep(50 * time.Millisecond)
	drainChannel(c1.Send, 50*time.Millisecond)

	// Execute 60 operations (triggering snapshot at 50, and 10 deltas 51..60)
	for i := 1; i <= 60; i++ {
		op := protocol.DocumentOperation{
			Op: "create",
			Object: map[string]interface{}{
				"id":     fmt.Sprintf("node-%d", i),
				"type":   "service",
				"x":      float64(i * 10),
				"y":      float64(i * 10),
				"width":  80.0,
				"height": 40.0,
			},
		}
		room.HandleMessage(c1, protocol.NewClientMessage(protocol.ClientMsgOperation, boardID, c1.UserID, protocol.OperationPayload{
			Operation: op,
		}))
		time.Sleep(2 * time.Millisecond)
	}

	time.Sleep(50 * time.Millisecond)

	// Connect Client 2 who was disconnected since seq 50 and requests sync
	c2 := createTestClient("user-2", "Bob", "#10b981", models.RoleEditor, boardID, room)
	room.Register(c2)
	time.Sleep(50 * time.Millisecond)
	drainChannel(c2.Send, 50*time.Millisecond)

	// Bob asks for delta operations since seq 50
	syncReq := protocol.NewClientMessage(protocol.ClientMsgSyncRequest, boardID, c2.UserID, protocol.SyncRequestPayload{
		LastKnownSeq: 50,
	})
	room.HandleMessage(c2, syncReq)

	// Bob should receive exactly 10 delta operations (51 through 60)
	deltaSeqs := make([]int64, 0, 10)
	for i := 51; i <= 60; i++ {
		select {
		case raw := <-c2.Send:
			var sMsg protocol.ServerMessage
			if err := json.Unmarshal(raw, &sMsg); err != nil {
				t.Fatalf("failed to unmarshal message: %v", err)
			}
			if sMsg.Type != "operation" {
				t.Fatalf("expected 'operation' delta, got '%s'", sMsg.Type)
			}
			var opPayload protocol.RemoteOperationPayload
			b, _ := json.Marshal(sMsg.Payload)
			_ = json.Unmarshal(b, &opPayload)
			deltaSeqs = append(deltaSeqs, opPayload.Seq)
		case <-time.After(500 * time.Millisecond):
			t.Fatalf("timed out waiting for delta op %d", i)
		}
	}

	if len(deltaSeqs) != 10 {
		t.Fatalf("expected 10 delta operations, got %d", len(deltaSeqs))
	}
	for idx, s := range deltaSeqs {
		if s != int64(51+idx) {
			t.Errorf("expected delta seq %d, got %d", 51+idx, s)
		}
	}
}

// 5. Test Presence Heartbeat & Stale User Cleanup
func TestPresence_HeartbeatAndCleanup(t *testing.T) {
	hub := rooms.NewHub()
	boardID := "board-presence-cleanup"
	room := rooms.NewRoom(boardID, hub)
	go room.Run()
	defer room.Stop()

	cActive := createTestClient("user-active", "ActiveUser", "#3b82f6", models.RoleEditor, boardID, room)
	cStale := createTestClient("user-stale", "StaleUser", "#ef4444", models.RoleEditor, boardID, room)

	room.Register(cActive)
	room.Register(cStale)
	time.Sleep(50 * time.Millisecond)
	drainChannel(cActive.Send, 50*time.Millisecond)
	drainChannel(cStale.Send, 50*time.Millisecond)

	// Send heartbeat for active user
	room.HandleMessage(cActive, protocol.NewClientMessage(protocol.ClientMsgHeartbeat, boardID, cActive.UserID, nil))

	// Verify unregister cleans up presence and broadcasts user_left
	room.Unregister(cStale)
	time.Sleep(50 * time.Millisecond)

	select {
	case raw := <-cActive.Send:
		var sMsg protocol.ServerMessage
		_ = json.Unmarshal(raw, &sMsg)
		if sMsg.Type != "user_left" {
			t.Fatalf("expected 'user_left' broadcast on unregister, got '%s'", sMsg.Type)
		}
		var leftPayload protocol.UserLeftPayload
		b, _ := json.Marshal(sMsg.Payload)
		_ = json.Unmarshal(b, &leftPayload)
		if leftPayload.UserID != cStale.UserID {
			t.Errorf("expected user_left for %s, got %s", cStale.UserID, leftPayload.UserID)
		}
	case <-time.After(300 * time.Millisecond):
		t.Fatal("timed out waiting for user_left message")
	}
}

// 6. Test Board State Persistence & Server Restart Hydration
func TestBoardStatePersistence_ServerRestartHydration(t *testing.T) {
	memStore := storage.NewMemoryStorage()
	boardID := "board-persist-restart"

	// 1. First Server Run: Initialize Room 1 and apply state mutations
	hub1 := rooms.NewHub()
	room1 := rooms.NewRoom(boardID, hub1, memStore)
	go room1.Run()

	c1 := createTestClient("user-admin", "Admin", "#3b82f6", models.RoleOwner, boardID, room1)
	room1.Register(c1)
	time.Sleep(50 * time.Millisecond)
	drainChannel(c1.Send, 50*time.Millisecond)

	// Create 3 nodes, update 1, delete 1
	room1.HandleMessage(c1, protocol.NewClientMessage(protocol.ClientMsgOperation, boardID, c1.UserID, protocol.OperationPayload{
		Operation: protocol.DocumentOperation{
			Op: "create",
			Object: map[string]interface{}{"id": "node-A", "type": "gateway", "x": 10.0, "y": 10.0, "width": 100.0, "height": 50.0},
		},
	}))
	room1.HandleMessage(c1, protocol.NewClientMessage(protocol.ClientMsgOperation, boardID, c1.UserID, protocol.OperationPayload{
		Operation: protocol.DocumentOperation{
			Op: "create",
			Object: map[string]interface{}{"id": "node-B", "type": "service", "x": 150.0, "y": 10.0, "width": 120.0, "height": 60.0},
		},
	}))
	room1.HandleMessage(c1, protocol.NewClientMessage(protocol.ClientMsgOperation, boardID, c1.UserID, protocol.OperationPayload{
		Operation: protocol.DocumentOperation{
			Op: "create",
			Object: map[string]interface{}{"id": "node-C", "type": "database", "x": 300.0, "y": 10.0, "width": 80.0, "height": 80.0},
		},
	}))
	// Move node-B
	room1.HandleMessage(c1, protocol.NewClientMessage(protocol.ClientMsgOperation, boardID, c1.UserID, protocol.OperationPayload{
		Operation: protocol.DocumentOperation{
			Op: "move",
			ID: "node-B",
			X:  200.0,
			Y:  250.0,
		},
	}))
	// Delete node-A
	room1.HandleMessage(c1, protocol.NewClientMessage(protocol.ClientMsgOperation, boardID, c1.UserID, protocol.OperationPayload{
		Operation: protocol.DocumentOperation{
			Op: "delete",
			ID: "node-A",
		},
	}))

	time.Sleep(100 * time.Millisecond)

	// Simulate Server Shutdown / Crash
	room1.Stop()
	time.Sleep(50 * time.Millisecond)

	// 2. Second Server Run: Spin up fresh Hub & Room with the same persistent storage
	hub2 := rooms.NewHub()
	room2 := rooms.NewRoom(boardID, hub2, memStore)
	go room2.Run()
	defer room2.Stop()

	// Connect a new client to the restored room
	c2 := createTestClient("user-verifier", "Verifier", "#10b981", models.RoleEditor, boardID, room2)
	room2.Register(c2)

	// Wait for 'joined' message which includes the hydrated snapshot state
	var joinedPayload protocol.JoinedPayload
	select {
	case raw := <-c2.Send:
		var sMsg protocol.ServerMessage
		if err := json.Unmarshal(raw, &sMsg); err != nil {
			t.Fatalf("failed to unmarshal joined response: %v", err)
		}
		if sMsg.Type != "joined" {
			t.Fatalf("expected 'joined' message upon registration, got '%s'", sMsg.Type)
		}
		b, _ := json.Marshal(sMsg.Payload)
		_ = json.Unmarshal(b, &joinedPayload)
	case <-time.After(1 * time.Second):
		t.Fatal("timed out waiting for joined message on restarted server")
	}

	// Verify sequence number is 5
	if joinedPayload.Seq != 5 {
		t.Fatalf("expected restored seq 5, got %d", joinedPayload.Seq)
	}

	// Verify remaining objects (node-B and node-C; node-A was deleted)
	if len(joinedPayload.Snapshot) != 2 {
		t.Fatalf("expected 2 objects after restart, got %d", len(joinedPayload.Snapshot))
	}

	objMap := make(map[string]map[string]interface{})
	for _, obj := range joinedPayload.Snapshot {
		if id, ok := obj["id"].(string); ok {
			objMap[id] = obj
		}
	}

	if _, exists := objMap["node-A"]; exists {
		t.Error("deleted node-A should not exist after restart")
	}

	nodeB, exists := objMap["node-B"]
	if !exists {
		t.Fatal("node-B missing after restart")
	}
	if nodeB["x"].(float64) != 200.0 || nodeB["y"].(float64) != 250.0 {
		t.Errorf("node-B coordinates not preserved: got (%v, %v), expected (200, 250)", nodeB["x"], nodeB["y"])
	}

	if _, exists := objMap["node-C"]; !exists {
		t.Fatal("node-C missing after restart")
	}
}

func drainChannel(ch chan []byte, d time.Duration) {
	timeout := time.After(d)
	for {
		select {
		case <-ch:
		case <-timeout:
			return
		}
	}
}
