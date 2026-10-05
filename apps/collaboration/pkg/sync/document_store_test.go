package sync

import (
	"testing"

	"alignify/collaboration/pkg/protocol"
)

func TestDocumentStore_CRUD(t *testing.T) {
	store := NewDocumentStore("test-board")

	// 1. Create Object
	createOp := protocol.DocumentOperation{
		Op: "create",
		Object: map[string]interface{}{
			"id":     "rect-1",
			"type":   "rectangle",
			"x":      10.0,
			"y":      20.0,
			"width":  100.0,
			"height": 80.0,
		},
	}

	seq, err := store.ApplyOperation("user-1", createOp)
	if err != nil {
		t.Fatalf("failed to create object: %v", err)
	}
	if seq != 1 {
		t.Fatalf("expected seq 1, got %d", seq)
	}

	objs, snapshotSeq := store.GetSnapshot()
	if len(objs) != 1 {
		t.Fatalf("expected 1 object, got %d", len(objs))
	}
	if snapshotSeq != 1 {
		t.Fatalf("expected snapshot seq 1, got %d", snapshotSeq)
	}

	// 2. Move Object
	moveOp := protocol.DocumentOperation{
		Op: "move",
		ID: "rect-1",
		X:  50.0,
		Y:  60.0,
	}

	seq, err = store.ApplyOperation("user-1", moveOp)
	if err != nil {
		t.Fatalf("failed to move object: %v", err)
	}
	if seq != 2 {
		t.Fatalf("expected seq 2, got %d", seq)
	}

	objs, _ = store.GetSnapshot()
	if objs[0]["x"].(float64) != 50.0 || objs[0]["y"].(float64) != 60.0 {
		t.Fatalf("object did not move: %+v", objs[0])
	}

	// 3. Update Object
	updateOp := protocol.DocumentOperation{
		Op: "update",
		ID: "rect-1",
		Changes: map[string]interface{}{
			"fillColor": "#3b82f6",
			"opacity":   0.8,
		},
	}
	seq, err = store.ApplyOperation("user-2", updateOp)
	if err != nil {
		t.Fatalf("failed to update object: %v", err)
	}
	if seq != 3 {
		t.Fatalf("expected seq 3, got %d", seq)
	}

	objs, _ = store.GetSnapshot()
	if objs[0]["fillColor"] != "#3b82f6" || objs[0]["opacity"].(float64) != 0.8 {
		t.Fatalf("object did not update properly: %+v", objs[0])
	}

	// 4. Batch Operations
	batchOp := protocol.DocumentOperation{
		Op: "batch",
		Operations: []protocol.DocumentOperation{
			{
				Op: "create",
				Object: map[string]interface{}{
					"id":   "rect-2",
					"type": "rectangle",
					"x":    200.0,
					"y":    300.0,
				},
			},
			{
				Op: "delete",
				ID: "rect-1",
			},
		},
	}

	seq, err = store.ApplyOperation("user-1", batchOp)
	if err != nil {
		t.Fatalf("failed to apply batch op: %v", err)
	}
	if seq != 4 {
		t.Fatalf("expected seq 4, got %d", seq)
	}

	objs, _ = store.GetSnapshot()
	if len(objs) != 1 || objs[0]["id"] != "rect-2" {
		t.Fatalf("expected 1 object (rect-2), got %+v", objs)
	}

	// 5. Test History Catch-Up
	history, currentSeq := store.GetOperationsSince(2)
	if currentSeq != 4 {
		t.Fatalf("expected current seq 4, got %d", currentSeq)
	}
	if len(history) != 2 {
		t.Fatalf("expected 2 operations since seq 2, got %d", len(history))
	}
	if history[0].Seq != 3 || history[1].Seq != 4 {
		t.Fatalf("unexpected history sequences: %+v", history)
	}
}

func TestDocumentStore_Hydrate(t *testing.T) {
	store := NewDocumentStore("board-hydrate")

	snapshotObjs := []map[string]interface{}{
		{
			"id":     "node-1",
			"type":   "service",
			"x":      50.0,
			"y":      50.0,
			"width":  120.0,
			"height": 60.0,
		},
	}

	ops := []protocol.RemoteOperationPayload{
		{
			UserID: "user-1",
			Seq:    10,
			Operation: protocol.DocumentOperation{
				Op: "create",
				Object: map[string]interface{}{
					"id":     "node-2",
					"type":   "database",
					"x":      200.0,
					"y":      150.0,
					"width":  80.0,
					"height": 80.0,
				},
			},
		},
		{
			UserID: "user-2",
			Seq:    11,
			Operation: protocol.DocumentOperation{
				Op: "move",
				ID: "node-1",
				X:  100.0,
				Y:  120.0,
			},
		},
	}

	if err := store.Hydrate(snapshotObjs, 9, ops); err != nil {
		t.Fatalf("failed to hydrate store: %v", err)
	}

	objs, currentSeq := store.GetSnapshot()
	if currentSeq != 11 {
		t.Fatalf("expected currentSeq 11 after hydration, got %d", currentSeq)
	}
	if len(objs) != 2 {
		t.Fatalf("expected 2 objects, got %d", len(objs))
	}

	// Verify node-1 has moved
	if objs[0]["x"].(float64) != 100.0 || objs[0]["y"].(float64) != 120.0 {
		t.Fatalf("expected node-1 moved to (100,120), got (%v,%v)", objs[0]["x"], objs[0]["y"])
	}
	// Verify node-2 exists
	if objs[1]["id"] != "node-2" {
		t.Fatalf("expected node-2 in position 1, got %v", objs[1]["id"])
	}
}

func TestDocumentStore_HydrateRejectsInvalidOperation(t *testing.T) {
	store := NewDocumentStore("board-invalid-hydrate")

	err := store.Hydrate(nil, 4, []protocol.RemoteOperationPayload{
		{
			Seq: 5,
			Operation: protocol.DocumentOperation{
				Op: "unsupported",
			},
		},
	})
	if err == nil {
		t.Fatal("expected hydration to reject an invalid operation")
	}

	_, seq := store.GetSnapshot()
	if seq != 4 {
		t.Fatalf("expected sequence to remain at snapshot sequence 4, got %d", seq)
	}
}
