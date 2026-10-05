package rooms

import (
	"context"
	"encoding/json"
	"testing"
	"time"

	"alignify/collaboration/pkg/client"
	"alignify/collaboration/pkg/models"
	"alignify/collaboration/pkg/protocol"
	"alignify/collaboration/pkg/storage"
)

// mockHandler implements client.RoomHandler for testing.
type mockHandler struct {
	handledMessages []*protocol.ClientMessage
	unregistered    []*client.Client
}

func (m *mockHandler) HandleMessage(c *client.Client, msg *protocol.ClientMessage) {
	m.handledMessages = append(m.handledMessages, msg)
}

func (m *mockHandler) Unregister(c *client.Client) {
	m.unregistered = append(m.unregistered, c)
}

func TestHub_GetOrCreateRoom(t *testing.T) {
	hub := NewHub()
	room1 := hub.GetOrCreateRoom("board-1")
	if room1 == nil {
		t.Fatal("expected non-nil room")
	}

	room1Again := hub.GetOrCreateRoom("board-1")
	if room1 != room1Again {
		t.Fatal("expected identical room instance for same board ID")
	}

	if hub.ActiveRoomsCount() != 1 {
		t.Fatalf("expected 1 active room, got %d", hub.ActiveRoomsCount())
	}

	room2 := hub.GetOrCreateRoom("board-2")
	if hub.ActiveRoomsCount() != 2 {
		t.Fatalf("expected 2 active rooms, got %d", hub.ActiveRoomsCount())
	}

	hub.RemoveRoom("board-1")
	if hub.ActiveRoomsCount() != 1 {
		t.Fatalf("expected 1 active room after removal, got %d", hub.ActiveRoomsCount())
	}

	room2.Stop()
}

func TestRoom_DirectMessageFlow(t *testing.T) {
	hub := NewHub()
	room := hub.GetOrCreateRoom("test-board-messages")
	defer room.Stop()

	// Create two fake clients
	c1 := client.NewClient("user-1", "Alice", "#ff0000", models.RoleEditor, "test-board-messages", nil, room)
	c2 := client.NewClient("user-2", "Bob", "#00ff00", models.RoleEditor, "test-board-messages", nil, room)

	// Register c1
	room.Register(c1)
	// Give room goroutine a moment to process register
	time.Sleep(50 * time.Millisecond)

	// Drain c1 joined message
	select {
	case msgBytes := <-c1.Send:
		var serverMsg protocol.ServerMessage
		if err := json.Unmarshal(msgBytes, &serverMsg); err != nil {
			t.Fatalf("failed to unmarshal server message: %v", err)
		}
		if serverMsg.Type != "joined" {
			t.Fatalf("expected 'joined' message, got '%s'", serverMsg.Type)
		}
	case <-time.After(200 * time.Millisecond):
		t.Fatal("timed out waiting for joined message")
	}

	// Register c2
	room.Register(c2)
	time.Sleep(50 * time.Millisecond)

	// c1 should receive user_joined for c2
	select {
	case msgBytes := <-c1.Send:
		var serverMsg protocol.ServerMessage
		_ = json.Unmarshal(msgBytes, &serverMsg)
		if serverMsg.Type != "user_joined" {
			t.Fatalf("expected c1 to receive 'user_joined', got '%s'", serverMsg.Type)
		}
	case <-time.After(200 * time.Millisecond):
		t.Fatal("timed out waiting for user_joined message")
	}

	// Drain c2's joined message
	select {
	case msgBytes := <-c2.Send:
		var serverMsg protocol.ServerMessage
		_ = json.Unmarshal(msgBytes, &serverMsg)
		if serverMsg.Type != "joined" {
			t.Fatalf("expected c2 to receive 'joined', got '%s'", serverMsg.Type)
		}
	case <-time.After(200 * time.Millisecond):
		t.Fatal("timed out waiting for c2 joined message")
	}

	// Now c1 creates an object
	createOp := protocol.DocumentOperation{
		Op: "create",
		Object: map[string]interface{}{
			"id":     "obj-100",
			"type":   "rectangle",
			"x":      100.0,
			"y":      200.0,
			"width":  50.0,
			"height": 50.0,
		},
	}

	clientOpMsg := protocol.NewClientMessage(
		protocol.ClientMsgOperation,
		"test-board-messages",
		"user-1",
		protocol.OperationPayload{
			Operation: createOp,
		},
	)

	room.HandleMessage(c1, clientOpMsg)
	time.Sleep(50 * time.Millisecond)

	// c1 should receive ack
	select {
	case msgBytes := <-c1.Send:
		var serverMsg protocol.ServerMessage
		_ = json.Unmarshal(msgBytes, &serverMsg)
		if serverMsg.Type != "ack" {
			t.Fatalf("expected c1 to receive 'ack', got '%s'", serverMsg.Type)
		}
	case <-time.After(200 * time.Millisecond):
		t.Fatal("timed out waiting for ack")
	}

	// c2 should receive broadcast operation
	select {
	case msgBytes := <-c2.Send:
		var serverMsg protocol.ServerMessage
		_ = json.Unmarshal(msgBytes, &serverMsg)
		if serverMsg.Type != "operation" {
			t.Fatalf("expected c2 to receive 'operation', got '%s'", serverMsg.Type)
		}
	case <-time.After(200 * time.Millisecond):
		t.Fatal("timed out waiting for operation broadcast on c2")
	}

	// Unregister c1
	room.Unregister(c1)
	time.Sleep(50 * time.Millisecond)

	// c2 should receive user_left
	select {
	case msgBytes := <-c2.Send:
		var serverMsg protocol.ServerMessage
		_ = json.Unmarshal(msgBytes, &serverMsg)
		if serverMsg.Type != "user_left" {
			t.Fatalf("expected c2 to receive 'user_left', got '%s'", serverMsg.Type)
		}
	case <-time.After(200 * time.Millisecond):
		t.Fatal("timed out waiting for user_left on c2")
	}
}

func TestRoom_ViewerCannotMutate(t *testing.T) {
	hub := NewHub()
	room := hub.GetOrCreateRoom("test-viewer-board")
	defer room.Stop()

	// Create a viewer client
	cViewer := client.NewClient("user-viewer", "Charlie", "#0000ff", models.RoleViewer, "test-viewer-board", nil, room)
	room.Register(cViewer)
	time.Sleep(50 * time.Millisecond)

	// Drain joined message
	select {
	case <-cViewer.Send:
	case <-time.After(200 * time.Millisecond):
		t.Fatal("timed out waiting for joined message")
	}

	// Viewer attempts to create an object
	createOp := protocol.DocumentOperation{
		Op: "create",
		Object: map[string]interface{}{
			"id":     "shape-1",
			"type":   "rectangle",
			"x":      10.0,
			"y":      20.0,
			"width":  100.0,
			"height": 50.0,
		},
	}

	clientOpMsg := protocol.NewClientMessage(
		protocol.ClientMsgOperation,
		"test-viewer-board",
		"user-viewer",
		protocol.OperationPayload{
			Operation: createOp,
		},
	)

	room.HandleMessage(cViewer, clientOpMsg)
	time.Sleep(50 * time.Millisecond)

	// Viewer should receive an error with INSUFFICIENT_PERMISSIONS
	select {
	case msgBytes := <-cViewer.Send:
		var serverMsg protocol.ServerMessage
		if err := json.Unmarshal(msgBytes, &serverMsg); err != nil {
			t.Fatalf("failed to unmarshal server message: %v", err)
		}
		if serverMsg.Type != "error" {
			t.Fatalf("expected 'error' message, got '%s'", serverMsg.Type)
		}
		var errPayload protocol.ErrorPayload
		payloadBytes, _ := json.Marshal(serverMsg.Payload)
		_ = json.Unmarshal(payloadBytes, &errPayload)
		if errPayload.Code != "INSUFFICIENT_PERMISSIONS" {
			t.Fatalf("expected error code 'INSUFFICIENT_PERMISSIONS', got '%s'", errPayload.Code)
		}
	case <-time.After(200 * time.Millisecond):
		t.Fatal("timed out waiting for error response on viewer mutation")
	}

	// Document store should remain empty
	objs, seq := room.docStore.GetSnapshot()
	if len(objs) != 0 {
		t.Fatalf("expected 0 objects in docStore, got %d", len(objs))
	}
	if seq != 0 {
		t.Fatalf("expected seq 0, got %d", seq)
	}
}

func TestRoom_HydrationAndPersistence(t *testing.T) {
	memStore := storage.NewMemoryStorage()
	ctx := context.Background()

	// Pre-populate storage with a snapshot and an operation
	snapshotData, _ := json.Marshal([]map[string]interface{}{
		{
			"id":     "rect-init",
			"type":   "rectangle",
			"x":      10.0,
			"y":      10.0,
			"width":  100.0,
			"height": 100.0,
		},
	})
	_ = memStore.Snapshots().SaveSnapshot(ctx, &models.BoardSnapshot{
		BoardID:   "durable-board",
		Seq:       1,
		Data:      json.RawMessage(snapshotData),
		CreatedBy: "user-1",
		CreatedAt: time.Now().UTC(),
	})

	opPayload, _ := json.Marshal(protocol.DocumentOperation{
		Op: "move",
		ID: "rect-init",
		X:  200.0,
		Y:  300.0,
	})
	_ = memStore.Operations().AppendOperation(ctx, &models.OperationRecord{
		BoardID:   "durable-board",
		Seq:       2,
		UserID:    "user-1",
		OpType:    "move",
		Payload:   json.RawMessage(opPayload),
		CreatedAt: time.Now().UTC(),
	})

	// Create hub with memory storage
	hub := NewHub(memStore)
	room := hub.GetOrCreateRoom("durable-board")
	defer room.Stop()

	// Verify room hydrated state
	objs, seq := room.docStore.GetSnapshot()
	if seq != 2 {
		t.Fatalf("expected hydrated sequence 2, got %d", seq)
	}
	if len(objs) != 1 {
		t.Fatalf("expected 1 hydrated object, got %d", len(objs))
	}
	if objs[0]["x"].(float64) != 200.0 || objs[0]["y"].(float64) != 300.0 {
		t.Fatalf("expected moved coordinates (200, 300), got (%v, %v)", objs[0]["x"], objs[0]["y"])
	}

	// Connect editor client and submit a new operation
	cEditor := client.NewClient("user-2", "Dave", "#ff00ff", models.RoleEditor, "durable-board", nil, room)
	room.Register(cEditor)
	time.Sleep(50 * time.Millisecond)

	// Drain joined
	select {
	case <-cEditor.Send:
	case <-time.After(200 * time.Millisecond):
		t.Fatal("timed out waiting for joined")
	}

	newOp := protocol.DocumentOperation{
		Op: "create",
		Object: map[string]interface{}{
			"id":     "circle-2",
			"type":   "circle",
			"x":      400.0,
			"y":      400.0,
			"width":  80.0,
			"height": 80.0,
		},
	}

	room.HandleMessage(cEditor, protocol.NewClientMessage(
		protocol.ClientMsgOperation,
		"durable-board",
		"user-2",
		protocol.OperationPayload{
			Operation: newOp,
		},
	))
	time.Sleep(50 * time.Millisecond)

	// Verify operation was appended to store
	ops, err := memStore.Operations().GetOperationsAfterSeq(ctx, "durable-board", 2)
	if err != nil {
		t.Fatalf("failed to query operations: %v", err)
	}
	if len(ops) != 1 {
		t.Fatalf("expected 1 persisted operation after seq 2, got %d", len(ops))
	}
	if ops[0].Seq != 3 {
		t.Fatalf("expected seq 3, got %d", ops[0].Seq)
	}
}
