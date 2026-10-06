package rooms

import (
	"context"
	"encoding/json"
	"log"
	"sync"
	"time"

	"alignify/collaboration/pkg/client"
	"alignify/collaboration/pkg/models"
	"alignify/collaboration/pkg/presence"
	"alignify/collaboration/pkg/protocol"
	"alignify/collaboration/pkg/storage"
	docSync "alignify/collaboration/pkg/sync"
)

type clientMessageWrapper struct {
	client *client.Client
	msg    *protocol.ClientMessage
}

// Room represents a collaborative session for a single board.
type Room struct {
	BoardID      string
	hub          *Hub
	store        storage.Storage
	clients      map[*client.Client]bool
	userToClient map[string]*client.Client
	docStore     *docSync.DocumentStore
	presence     *presence.Manager
	register     chan *client.Client
	unregister   chan *client.Client
	messages     chan clientMessageWrapper
	stop         chan struct{}
	mu           sync.RWMutex
	reaperTicker *time.Ticker
}

// NewRoom creates an active room instance for a given board ID.
func NewRoom(boardID string, hub *Hub, stores ...storage.Storage) *Room {
	var store storage.Storage
	if len(stores) > 0 {
		store = stores[0]
	}

	r := &Room{
		BoardID:      boardID,
		hub:          hub,
		store:        store,
		clients:      make(map[*client.Client]bool),
		userToClient: make(map[string]*client.Client),
		docStore:     docSync.NewDocumentStore(boardID),
		presence:     presence.NewManager(),
		register:     make(chan *client.Client),
		unregister:   make(chan *client.Client),
		messages:     make(chan clientMessageWrapper, 1024),
		stop:         make(chan struct{}),
		reaperTicker: time.NewTicker(10 * time.Second),
	}

	r.hydrateFromStorage()
	return r
}

func (r *Room) hydrateFromStorage() {
	if r.store == nil {
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	var snapshotSeq int64 = 0
	var snapshotObjs []map[string]interface{}

	snapshot, err := r.store.Snapshots().GetLatestSnapshot(ctx, r.BoardID)
	if err == nil && snapshot != nil && len(snapshot.Data) > 0 {
		snapshotSeq = snapshot.Seq
		_ = json.Unmarshal(snapshot.Data, &snapshotObjs)
	}

	ops, err := r.store.Operations().GetOperationsAfterSeq(ctx, r.BoardID, snapshotSeq)
	var remoteOps []protocol.RemoteOperationPayload
	if err == nil && len(ops) > 0 {
		remoteOps = make([]protocol.RemoteOperationPayload, 0, len(ops))
		for _, opRec := range ops {
			var docOp protocol.DocumentOperation
			if err := json.Unmarshal(opRec.Payload, &docOp); err == nil {
				remoteOps = append(remoteOps, protocol.RemoteOperationPayload{
					UserID:    opRec.UserID,
					Seq:       opRec.Seq,
					Operation: docOp,
				})
			}
		}
	}

	if err := r.docStore.Hydrate(snapshotObjs, snapshotSeq, remoteOps); err != nil {
		log.Printf("[Room %s] Failed to hydrate document store: %v", r.BoardID, err)
	}
}

func (r *Room) createSnapshot(seq int64, userID string) {
	if r.store == nil {
		return
	}

	objs, currentSeq := r.docStore.GetSnapshot()
	dataBytes, err := json.Marshal(objs)
	if err != nil {
		return
	}

	_ = r.store.Snapshots().SaveSnapshot(context.Background(), &models.BoardSnapshot{
		BoardID:   r.BoardID,
		Seq:       currentSeq,
		Data:      json.RawMessage(dataBytes),
		CreatedBy: userID,
		CreatedAt: time.Now().UTC(),
	})
}

// HandleMessage implements client.RoomHandler.
func (r *Room) HandleMessage(c *client.Client, msg *protocol.ClientMessage) {
	select {
	case r.messages <- clientMessageWrapper{client: c, msg: msg}:
	default:
		log.Printf("[Room %s] Message channel full, dropping message from user %s", r.BoardID, c.UserID)
	}
}

// Register enqueues a client registration.
func (r *Room) Register(c *client.Client) {
	r.register <- c
}

// Unregister implements client.RoomHandler.
func (r *Room) Unregister(c *client.Client) {
	r.unregister <- c
}

// Run executes the central event loop for this room.
func (r *Room) Run() {
	defer func() {
		r.reaperTicker.Stop()
	}()

	for {
		select {
		case c := <-r.register:
			r.handleRegister(c)

		case c := <-r.unregister:
			r.handleUnregister(c)

		case wrapper := <-r.messages:
			r.dispatchMessage(wrapper.client, wrapper.msg)

		case <-r.reaperTicker.C:
			r.reapInactiveUsers()

		case <-r.stop:
			r.cleanup()
			return
		}
	}
}

// Stop shuts down the room event loop.
func (r *Room) Stop() {
	close(r.stop)
}

func (r *Room) handleRegister(c *client.Client) {
	r.mu.Lock()
	r.clients[c] = true
	r.userToClient[c.UserID] = c
	r.mu.Unlock()

	// Register user in presence
	userPresence := r.presence.AddUser(c.UserID, c.UserName, c.UserColor)

	// Fetch current document state
	snapshotObjects, currentSeq := r.docStore.GetSnapshot()
	allUsers := r.presence.GetUsers()

	// 1. Send 'joined' packet to newly connected client
	joinedMsg := protocol.JoinedPayload{
		UserID:   c.UserID,
		BoardID:  r.BoardID,
		Role:     string(c.GetRole()),
		Users:    allUsers,
		Snapshot: snapshotObjects,
		Seq:      currentSeq,
	}
	c.SendMessage(protocol.NewServerMessage("joined", r.BoardID, joinedMsg))

	// 2. Broadcast 'user_joined' to other participants
	userJoinedMsg := protocol.UserJoinedPayload{
		User: *userPresence,
	}
	r.BroadcastExcept(protocol.NewServerMessage("user_joined", r.BoardID, userJoinedMsg), c.UserID)
	log.Printf("[Room %s] User %s (%s) connected. Total clients: %d", r.BoardID, c.UserID, c.UserName, len(r.clients))
}

func (r *Room) handleUnregister(c *client.Client) {
	r.mu.Lock()
	if _, ok := r.clients[c]; ok {
		delete(r.clients, c)
		delete(r.userToClient, c.UserID)
	}
	clientCount := len(r.clients)
	r.mu.Unlock()

	r.presence.RemoveUser(c.UserID)

	// Broadcast 'user_left'
	userLeftMsg := protocol.UserLeftPayload{
		UserID: c.UserID,
	}
	r.BroadcastExcept(protocol.NewServerMessage("user_left", r.BoardID, userLeftMsg), c.UserID)
	log.Printf("[Room %s] User %s disconnected. Remaining clients: %d", r.BoardID, c.UserID, clientCount)

	if clientCount == 0 && r.hub != nil {
		r.hub.NotifyEmptyRoom(r.BoardID)
	}
}

func (r *Room) dispatchMessage(c *client.Client, msg *protocol.ClientMessage) {
	switch msg.Type {
	case "join":
		var payload protocol.JoinPayload
		if err := decodePayload(msg.Payload, &payload); err == nil {
			if payload.UserName != "" {
				c.UserName = payload.UserName
			}
			if payload.UserColor != "" {
				c.UserColor = payload.UserColor
			}
			userPres := r.presence.AddUser(c.UserID, c.UserName, c.UserColor)
			r.BroadcastExcept(protocol.NewServerMessage("user_joined", r.BoardID, protocol.UserJoinedPayload{User: *userPres}), c.UserID)
		}

	case "leave":
		r.handleUnregister(c)
		c.Close()

	case "cursor":
		var payload protocol.CursorPayload
		if err := decodePayload(msg.Payload, &payload); err == nil {
			pt := protocol.Point{X: payload.X, Y: payload.Y}
			if user, ok := r.presence.UpdateCursor(c.UserID, pt); ok {
				cursorMsg := protocol.RemoteCursorPayload{
					UserID:    user.UserID,
					UserName:  user.UserName,
					UserColor: user.UserColor,
					Cursor:    pt,
				}
				r.BroadcastExcept(protocol.NewServerMessage("cursor", r.BoardID, cursorMsg), c.UserID)
			}
		}

	case "selection":
		var payload protocol.SelectionPayload
		if err := decodePayload(msg.Payload, &payload); err == nil {
			if user, ok := r.presence.UpdateSelection(c.UserID, payload.SelectedIDs); ok {
				selectionMsg := protocol.RemoteSelectionPayload{
					UserID:      user.UserID,
					UserName:    user.UserName,
					UserColor:   user.UserColor,
					SelectedIDs: payload.SelectedIDs,
				}
				r.BroadcastExcept(protocol.NewServerMessage("selection", r.BoardID, selectionMsg), c.UserID)
			}
		}

	case "operation":
		var payload protocol.OperationPayload
		if err := decodePayload(msg.Payload, &payload); err == nil {
			// Enforce viewer permissions: viewers cannot mutate state
			if !c.GetRole().CanWrite() {
				errMsg := protocol.ErrorPayload{
					Code:    "INSUFFICIENT_PERMISSIONS",
					Message: "Viewers cannot modify the board",
				}
				c.SendMessage(protocol.NewServerMessage("error", r.BoardID, errMsg))
				return
			}

			seq, err := r.docStore.ApplyOperation(c.UserID, payload.Operation)
			if err != nil {
				errMsg := protocol.ErrorPayload{
					Code:    "OPERATION_REJECTED",
					Message: err.Error(),
				}
				c.SendMessage(protocol.NewServerMessage("error", r.BoardID, errMsg))
				return
			}

			// Persist operation to storage
			if r.store != nil {
				opPayloadBytes, _ := json.Marshal(payload.Operation)
				opRecord := &models.OperationRecord{
					BoardID:   r.BoardID,
					Seq:       seq,
					UserID:    c.UserID,
					OpType:    payload.Operation.Op,
					Payload:   json.RawMessage(opPayloadBytes),
					CreatedAt: time.Now().UTC(),
				}
				_ = r.store.Operations().AppendOperation(context.Background(), opRecord)

				// Compaction: save snapshot every 50 operations
				if seq > 0 && seq%50 == 0 {
					r.createSnapshot(seq, c.UserID)
				}
			}

			// 1. Send Ack to author
			ackMsg := protocol.AckPayload{Seq: seq}
			c.SendMessage(protocol.NewServerMessage("ack", r.BoardID, ackMsg))

			// 2. Broadcast operation to other room members
			remoteOpMsg := protocol.RemoteOperationPayload{
				UserID:    c.UserID,
				Operation: payload.Operation,
				Seq:       seq,
			}
			r.BroadcastExcept(protocol.NewServerMessage("operation", r.BoardID, remoteOpMsg), c.UserID)
		}

	case "sync_request":
		var payload protocol.SyncRequestPayload
		_ = decodePayload(msg.Payload, &payload)

		if payload.LastKnownSeq > 0 {
			history, currentSeq := r.docStore.GetOperationsSince(payload.LastKnownSeq)
			if len(history) > 0 {
				for _, op := range history {
					c.SendMessage(protocol.NewServerMessage("operation", r.BoardID, op))
				}
				return
			} else if payload.LastKnownSeq == currentSeq {
				// Up to date
				return
			}
		}

		// Fall back to full snapshot
		objs, seq := r.docStore.GetSnapshot()
		snapshotMsg := protocol.SnapshotPayload{
			BoardID: r.BoardID,
			Objects: objs,
			Seq:     seq,
		}
		c.SendMessage(protocol.NewServerMessage("snapshot", r.BoardID, snapshotMsg))

	case "heartbeat":
		r.presence.Touch(c.UserID)
	}
}

// Broadcast sends a server message to all connected clients in this room.
func (r *Room) Broadcast(msg *protocol.ServerMessage) {
	r.mu.RLock()
	defer r.mu.RUnlock()

	for c := range r.clients {
		c.SendMessage(msg)
	}
}

// BroadcastExcept sends a server message to all clients except the one with exceptUserID.
func (r *Room) BroadcastExcept(msg *protocol.ServerMessage, exceptUserID string) {
	r.mu.RLock()
	defer r.mu.RUnlock()

	for c := range r.clients {
		if c.UserID != exceptUserID {
			c.SendMessage(msg)
		}
	}
}

func (r *Room) reapInactiveUsers() {
	staleIDs := r.presence.ReapStaleUsers(30 * time.Second)
	for _, id := range staleIDs {
		userLeftMsg := protocol.UserLeftPayload{
			UserID: id,
		}
		r.Broadcast(protocol.NewServerMessage("user_left", r.BoardID, userLeftMsg))
	}
}

func (r *Room) cleanup() {
	r.mu.Lock()
	defer r.mu.Unlock()

	for c := range r.clients {
		c.Close()
	}
	r.clients = make(map[*client.Client]bool)
	r.userToClient = make(map[string]*client.Client)
}

// RestoreFromSnapshot resets the room document state from a snapshot and broadcasts to all clients.
func (r *Room) RestoreFromSnapshot(objects []map[string]interface{}, seq int64, restoredBy string) {
	r.docStore.ResetToState(objects, seq)
	snapshotMsg := protocol.SnapshotPayload{
		BoardID: r.BoardID,
		Objects: objects,
		Seq:     seq,
	}
	r.Broadcast(protocol.NewServerMessage("snapshot", r.BoardID, snapshotMsg))
}

// UpdateUserRole updates the role for a connected user and notifies them.
func (r *Room) UpdateUserRole(userID string, newRole models.Role) {
	r.mu.RLock()
	cl, exists := r.userToClient[userID]
	r.mu.RUnlock()

	if exists && cl != nil {
		cl.SetRole(newRole)
		log.Printf("[Room %s] User %s role dynamically updated to %s", r.BoardID, userID, newRole)
		if !newRole.CanWrite() {
			errMsg := protocol.ErrorPayload{
				Code:    "ROLE_CHANGED",
				Message: "Your workspace role has been changed to viewer",
			}
			cl.SendMessage(protocol.NewServerMessage("error", r.BoardID, errMsg))
		}
	}
}

// DisconnectUser kicks a user from the room with a reason.
func (r *Room) DisconnectUser(userID string, reason string) {
	r.mu.RLock()
	cl, exists := r.userToClient[userID]
	r.mu.RUnlock()

	if exists && cl != nil {
		log.Printf("[Room %s] Disconnecting user %s (reason: %s)", r.BoardID, userID, reason)
		errMsg := protocol.ErrorPayload{
			Code:    "SESSION_REVOKED",
			Message: reason,
		}
		cl.SendMessage(protocol.NewServerMessage("error", r.BoardID, errMsg))
		go func(c *client.Client) {
			time.Sleep(100 * time.Millisecond)
			r.Unregister(c)
			c.Close()
		}(cl)
	}
}

// ClientCount returns the number of active clients in this room.
func (r *Room) ClientCount() int {
	r.mu.RLock()
	defer r.mu.RUnlock()
	return len(r.clients)
}

// GetObjects returns the current snapshot objects from the document store.
func (r *Room) GetObjects() []map[string]interface{} {
	if r.docStore == nil {
		return nil
	}
	objs, _ := r.docStore.GetSnapshot()
	return objs
}

// Helper function to decode unstructured payload map/struct to concrete target.
func decodePayload(src interface{}, dest interface{}) error {
	if src == nil {
		return nil
	}
	bytes, err := json.Marshal(src)
	if err != nil {
		return err
	}
	return json.Unmarshal(bytes, dest)
}
