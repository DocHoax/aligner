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
