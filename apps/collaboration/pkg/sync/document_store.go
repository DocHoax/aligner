package sync

import (
	"errors"
	"fmt"
	"sync"

	"alignify/collaboration/pkg/protocol"
)

// DocumentStore manages canonical in-memory state, operation history, and sequence tracking for a board.
type DocumentStore struct {
	mu         sync.RWMutex
	boardID    string
	objects    map[string]map[string]interface{}
	order      []string
	seq        int64
	history    []protocol.RemoteOperationPayload
	maxHistory int
}

// NewDocumentStore creates an initialized DocumentStore.
func NewDocumentStore(boardID string) *DocumentStore {
	return &DocumentStore{
		boardID:    boardID,
		objects:    make(map[string]map[string]interface{}),
		order:      make([]string, 0),
		seq:        0,
		history:    make([]protocol.RemoteOperationPayload, 0),
		maxHistory: 2000,
	}
}

// ApplyOperation executes an operation against the in-memory board state, updates history, and returns the sequence.
func (s *DocumentStore) ApplyOperation(userID string, op protocol.DocumentOperation) (int64, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	if err := s.applyOpInternal(op); err != nil {
		return s.seq, err
	}

	s.seq++
	remoteOp := protocol.RemoteOperationPayload{
		UserID:    userID,
		Operation: op,
		Seq:       s.seq,
	}

	s.history = append(s.history, remoteOp)
	if len(s.history) > s.maxHistory {
		s.history = s.history[len(s.history)-s.maxHistory:]
	}

	return s.seq, nil
}

func (s *DocumentStore) applyOpInternal(op protocol.DocumentOperation) error {
	switch op.Op {
	case "create":
		if op.Object == nil {
			return errors.New("missing object in create operation")
		}
		idVal, ok := op.Object["id"]
		if !ok {
			return errors.New("missing object id in create operation")
		}
		id, ok := idVal.(string)
		if !ok || id == "" {
			return errors.New("invalid object id in create operation")
		}

		// Deep copy object map
		newObj := make(map[string]interface{})
		for k, v := range op.Object {
			newObj[k] = v
		}

		s.objects[id] = newObj
		// Add to order if not present
		found := false
		for _, existingID := range s.order {
			if existingID == id {
				found = true
				break
			}
		}
		if !found {
			s.order = append(s.order, id)
		}

	case "delete":
		if op.ID == "" {
			return errors.New("missing id in delete operation")
		}
		delete(s.objects, op.ID)
		newOrder := make([]string, 0, len(s.order))
		for _, existingID := range s.order {
			if existingID != op.ID {
				newOrder = append(newOrder, existingID)
			}
		}
		s.order = newOrder

	case "move":
		if op.ID == "" {
			return errors.New("missing id in move operation")
		}
		obj, ok := s.objects[op.ID]
		if !ok {
			// Idempotent: ignore moves for non-existent objects
			return nil
		}
		obj["x"] = op.X
		obj["y"] = op.Y

	case "resize":
		if op.ID == "" {
			return errors.New("missing id in resize operation")
		}
		obj, ok := s.objects[op.ID]
		if !ok {
			return nil
		}
		obj["x"] = op.X
		obj["y"] = op.Y
		obj["width"] = op.Width
		obj["height"] = op.Height

	case "rotate":
		if op.ID == "" {
			return errors.New("missing id in rotate operation")
		}
		obj, ok := s.objects[op.ID]
		if !ok {
			return nil
		}
		obj["rotation"] = op.Rotation

	case "update":
		if op.ID == "" {
			return errors.New("missing id in update operation")
		}
		obj, ok := s.objects[op.ID]
		if !ok {
			return nil
		}
		for k, v := range op.Changes {
			obj[k] = v
		}

	case "group":
		if op.GroupID == "" || len(op.ChildIDs) == 0 {
			return errors.New("invalid group operation parameters")
		}
		// Update parentId on children
		for _, childID := range op.ChildIDs {
			if child, ok := s.objects[childID]; ok {
				child["groupId"] = op.GroupID
			}
		}

	case "ungroup":
		if op.GroupID == "" {
			return errors.New("missing groupId in ungroup operation")
		}
		for _, obj := range s.objects {
			if gVal, ok := obj["groupId"]; ok {
				if gStr, ok := gVal.(string); ok && gStr == op.GroupID {
					delete(obj, "groupId")
				}
			}
		}

	case "batch":
		for _, subOp := range op.Operations {
			if err := s.applyOpInternal(subOp); err != nil {
				return fmt.Errorf("batch sub-operation failed: %w", err)
			}
		}

	default:
		return fmt.Errorf("unknown operation type: %s", op.Op)
	}

	return nil
}

// GetSnapshot returns a copy of all current objects in z-index order, along with the current sequence number.
func (s *DocumentStore) GetSnapshot() ([]map[string]interface{}, int64) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	result := make([]map[string]interface{}, 0, len(s.order))
	for _, id := range s.order {
		if obj, ok := s.objects[id]; ok {
			objCopy := make(map[string]interface{}, len(obj))
			for k, v := range obj {
				objCopy[k] = v
			}
			result = append(result, objCopy)
		}
	}

	return result, s.seq
}

// GetOperationsSince returns operations occurring strictly after sinceSeq.
func (s *DocumentStore) GetOperationsSince(sinceSeq int64) ([]protocol.RemoteOperationPayload, int64) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	if len(s.history) == 0 || sinceSeq >= s.seq {
		return []protocol.RemoteOperationPayload{}, s.seq
	}

	result := make([]protocol.RemoteOperationPayload, 0)
	for _, op := range s.history {
		if op.Seq > sinceSeq {
			result = append(result, op)
		}
	}

	return result, s.seq
}

// Hydrate populates the document store from a base snapshot and replays subsequent operations.
func (s *DocumentStore) Hydrate(objects []map[string]interface{}, snapshotSeq int64, ops []protocol.RemoteOperationPayload) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	s.objects = make(map[string]map[string]interface{})
	s.order = make([]string, 0, len(objects))

	for _, obj := range objects {
		idVal, ok := obj["id"]
		if !ok {
			continue
		}
		idStr, ok := idVal.(string)
		if !ok || idStr == "" {
			continue
		}

		objCopy := make(map[string]interface{}, len(obj))
		for k, v := range obj {
			objCopy[k] = v
		}
		s.objects[idStr] = objCopy
		s.order = append(s.order, idStr)
	}

	s.seq = snapshotSeq
	s.history = make([]protocol.RemoteOperationPayload, 0, len(ops))

	for _, op := range ops {
		if err := s.applyOpInternal(op.Operation); err != nil {
			return fmt.Errorf("failed to replay operation at sequence %d: %w", op.Seq, err)
		}
		if op.Seq > s.seq {
			s.seq = op.Seq
		}
		s.history = append(s.history, op)
	}

	if len(s.history) > s.maxHistory {
		s.history = s.history[len(s.history)-s.maxHistory:]
	}

	return nil
}
