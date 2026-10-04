package presence

import (
	"testing"
	"time"

	"alignify/collaboration/pkg/protocol"
)

func TestPresenceManager(t *testing.T) {
	pm := NewManager()

	user1 := protocol.UserPresence{
		UserID:      "u1",
		UserName:    "Alice",
		UserColor:   "#3b82f6",
		SelectedIDs: []string{"obj-1"},
	}

	pm.SetUser(user1)

	users := pm.GetUsers()
	if len(users) != 1 {
		t.Fatalf("expected 1 user, got %d", len(users))
	}
	if users[0].UserName != "Alice" {
		t.Fatalf("expected Alice, got %s", users[0].UserName)
	}

	// Update cursor
	pm.UpdateCursor("u1", protocol.Point{X: 100, Y: 200})
	u, ok := pm.GetUser("u1")
	if !ok || u.Cursor == nil || u.Cursor.X != 100 || u.Cursor.Y != 200 {
		t.Fatalf("cursor not updated correctly: %+v", u)
	}

	// Update selection
	pm.UpdateSelection("u1", []string{"obj-1", "obj-2"})
	u, _ = pm.GetUser("u1")
	if len(u.SelectedIDs) != 2 {
		t.Fatalf("selection not updated: %+v", u)
	}

	// Reap inactive
	time.Sleep(10 * time.Millisecond)
	reaped := pm.ReapInactiveUsers(5 * time.Millisecond)
	if len(reaped) != 1 || reaped[0] != "u1" {
		t.Fatalf("expected u1 to be reaped, got %+v", reaped)
	}

	if len(pm.GetUsers()) != 0 {
		t.Fatalf("expected 0 users after reaping, got %d", len(pm.GetUsers()))
	}
}
