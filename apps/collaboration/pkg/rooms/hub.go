package rooms

import (
	"sync"

	"alignify/collaboration/pkg/storage"
)

// Hub maintains the set of active rooms and handles routing to rooms.
type Hub struct {
	mu    sync.RWMutex
	rooms map[string]*Room
	store storage.Storage
}

// NewHub creates a new Hub instance with optional storage.
func NewHub(store ...storage.Storage) *Hub {
	var s storage.Storage
	if len(store) > 0 && store[0] != nil {
		s = store[0]
	} else {
		s = storage.NewMemoryStorage()
	}

	return &Hub{
		rooms: make(map[string]*Room),
		store: s,
	}
}

// GetOrCreateRoom returns an existing room or creates and starts a new one.
func (h *Hub) GetOrCreateRoom(boardID string) *Room {
	h.mu.Lock()
	defer h.mu.Unlock()

	room, exists := h.rooms[boardID]
	if !exists {
		room = NewRoom(boardID, h, h.store)
		h.rooms[boardID] = room
		go room.Run()
	}

	return room
}

// GetRoom retrieves a room if it exists.
func (h *Hub) GetRoom(boardID string) (*Room, bool) {
	h.mu.RLock()
	defer h.mu.RUnlock()

	room, exists := h.rooms[boardID]
	return room, exists
}

// RemoveRoom stops and removes a room from the hub.
func (h *Hub) RemoveRoom(boardID string) {
	h.mu.Lock()
	room, exists := h.rooms[boardID]
	if exists {
		delete(h.rooms, boardID)
	}
	h.mu.Unlock()

	if exists && room != nil {
		room.Stop()
	}
}

// NotifyEmptyRoom is invoked when all clients have left a room.
func (h *Hub) NotifyEmptyRoom(boardID string) {
	// For persistent in-memory board state across quick reconnects, we can keep the room or clean it up.
	// We keep the room active in memory for document preservation.
}

// Storage returns the storage instance used by the hub.
func (h *Hub) Storage() storage.Storage {
	h.mu.RLock()
	defer h.mu.RUnlock()
	return h.store
}

// ActiveRoomsCount returns the number of active rooms.
func (h *Hub) ActiveRoomsCount() int {
	h.mu.RLock()
	defer h.mu.RUnlock()
	return len(h.rooms)
}

// ActiveClientsCount returns the total number of connected clients across all rooms.
func (h *Hub) ActiveClientsCount() int {
	h.mu.RLock()
	defer h.mu.RUnlock()

	total := 0
	for _, room := range h.rooms {
		total += room.ClientCount()
	}
	return total
}
