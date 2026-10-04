package presence

import (
	"sync"
	"time"

	"alignify/collaboration/pkg/protocol"
)

// Manager tracks real-time user presence, cursors, and selections for a board.
type Manager struct {
	mu    sync.RWMutex
	users map[string]*protocol.UserPresence
}

// NewManager creates a new presence Manager.
func NewManager() *Manager {
	return &Manager{
		users: make(map[string]*protocol.UserPresence),
	}
}

// SetUser registers or updates full user presence.
func (m *Manager) SetUser(user protocol.UserPresence) {
	m.mu.Lock()
	defer m.mu.Unlock()

	user.LastActive = time.Now().UnixMilli()
	if user.SelectedIDs == nil {
		user.SelectedIDs = make([]string, 0)
	}
	m.users[user.UserID] = &user
}

// RemoveUser unregisters a user.
func (m *Manager) RemoveUser(userID string) bool {
	m.mu.Lock()
	defer m.mu.Unlock()

	if _, exists := m.users[userID]; exists {
		delete(m.users, userID)
		return true
	}
	return false
}

// UpdateCursor updates a user's cursor position and refreshes activity timestamp.
func (m *Manager) UpdateCursor(userID string, pt protocol.Point) (*protocol.UserPresence, bool) {
	m.mu.Lock()
	defer m.mu.Unlock()

	user, exists := m.users[userID]
	if !exists {
		return nil, false
	}

	user.Cursor = &pt
	user.LastActive = time.Now().UnixMilli()
	return user, true
}

// UpdateSelection updates a user's selected object IDs.
func (m *Manager) UpdateSelection(userID string, selectedIDs []string) (*protocol.UserPresence, bool) {
	m.mu.Lock()
	defer m.mu.Unlock()

	user, exists := m.users[userID]
	if !exists {
		return nil, false
	}

	if selectedIDs == nil {
		selectedIDs = make([]string, 0)
	}
	user.SelectedIDs = selectedIDs
	user.LastActive = time.Now().UnixMilli()
	return user, true
}

// GetUsers returns a snapshot of all active users.
func (m *Manager) GetUsers() []protocol.UserPresence {
	m.mu.RLock()
	defer m.mu.RUnlock()

	list := make([]protocol.UserPresence, 0, len(m.users))
	for _, u := range m.users {
		list = append(list, *u)
	}
	return list
}

// GetUser returns presence for a specific user.
func (m *Manager) GetUser(userID string) (*protocol.UserPresence, bool) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	user, exists := m.users[userID]
	if !exists {
		return nil, false
	}
	uCopy := *user
	return &uCopy, true
}

// ReapInactiveUsers removes users who haven't updated in the given duration and returns their IDs.
func (m *Manager) ReapInactiveUsers(timeout time.Duration) []string {
	m.mu.Lock()
	defer m.mu.Unlock()

	threshold := time.Now().Add(-timeout).UnixMilli()
	reaped := make([]string, 0)

	for id, u := range m.users {
		if u.LastActive < threshold {
			delete(m.users, id)
			reaped = append(reaped, id)
		}
	}

	return reaped
}
