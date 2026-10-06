package auth

import (
	"crypto/rand"
	"encoding/hex"
	"sync"
	"time"
)

// WSTicket represents a short-lived single-use ticket for WebSocket authentication.
type WSTicket struct {
	ID          string    `json:"ticket"`
	UserID      string    `json:"userId"`
	Email       string    `json:"email"`
	DisplayName string    `json:"displayName"`
	BoardID     string    `json:"boardId,omitempty"`
	CreatedAt   time.Time `json:"createdAt"`
	ExpiresAt   time.Time `json:"expiresAt"`
}

// TicketStore manages creation, consumption, and expiration of WebSocket tickets.
type TicketStore struct {
	mu      sync.Mutex
	tickets map[string]*WSTicket
	ttl     time.Duration
}

// NewTicketStore initializes a TicketStore with the specified TTL duration.
func NewTicketStore(ttl time.Duration) *TicketStore {
	if ttl <= 0 {
		ttl = 60 * time.Second
	}
	ts := &TicketStore{
		tickets: make(map[string]*WSTicket),
		ttl:     ttl,
	}
	go ts.reapLoop()
	return ts
}

// CreateTicket generates and stores a new single-use ticket.
func (ts *TicketStore) CreateTicket(userID, email, displayName, boardID string) *WSTicket {
	ts.mu.Lock()
	defer ts.mu.Unlock()

	b := make([]byte, 24)
	_, _ = rand.Read(b)
	ticketID := "wst_" + hex.EncodeToString(b)

	now := time.Now().UTC()
	ticket := &WSTicket{
		ID:          ticketID,
		UserID:      userID,
		Email:       email,
		DisplayName: displayName,
		BoardID:     boardID,
		CreatedAt:   now,
		ExpiresAt:   now.Add(ts.ttl),
	}

	ts.tickets[ticketID] = ticket
	return ticket
}

// ConsumeTicket atomically validates and consumes a single-use ticket.
func (ts *TicketStore) ConsumeTicket(ticketID string) (*WSTicket, bool) {
	ts.mu.Lock()
	defer ts.mu.Unlock()

	ticket, exists := ts.tickets[ticketID]
	if !exists {
		return nil, false
	}

	// Single-use: delete immediately
	delete(ts.tickets, ticketID)

	if time.Now().UTC().After(ticket.ExpiresAt) {
		return nil, false
	}

	return ticket, true
}

func (ts *TicketStore) reapLoop() {
	ticker := time.NewTicker(30 * time.Second)
	for range ticker.C {
		ts.mu.Lock()
		now := time.Now().UTC()
		for id, t := range ts.tickets {
			if now.After(t.ExpiresAt) {
				delete(ts.tickets, id)
			}
		}
		ts.mu.Unlock()
	}
}
