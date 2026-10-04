package rooms

import (
	"encoding/json"
	"testing"
	"time"

	"alignify/collaboration/pkg/client"
	"alignify/collaboration/pkg/protocol"
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
	c1 := client.NewClient("user-1", "Alice", "#ff0000", "test-board-messages", nil, room)
	c2 := client.NewClient("user-2", "Bob", "#00ff00", "test-board-messages", nil, room)

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
		"operation",
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
