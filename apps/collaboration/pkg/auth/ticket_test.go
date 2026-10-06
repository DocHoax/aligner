package auth

import (
	"testing"
	"time"
)

func TestTicketStore(t *testing.T) {
	ts := NewTicketStore(1 * time.Second)

	ticket := ts.CreateTicket("usr_123", "test@alignify.dev", "Alice", "board_abc")
	if ticket == nil || ticket.ID == "" {
		t.Fatalf("expected non-empty ticket")
	}

	// Consume valid ticket
	consumed, ok := ts.ConsumeTicket(ticket.ID)
	if !ok || consumed == nil {
		t.Fatalf("expected ticket to be consumed successfully")
	}
	if consumed.UserID != "usr_123" || consumed.BoardID != "board_abc" {
		t.Errorf("unexpected ticket payload: %+v", consumed)
	}

	// Single use: second consume must fail
	consumed2, ok2 := ts.ConsumeTicket(ticket.ID)
	if ok2 || consumed2 != nil {
		t.Fatalf("expected single-use ticket to fail on second consume")
	}

	// Expired ticket test
	shortTS := NewTicketStore(10 * time.Millisecond)
	expTicket := shortTS.CreateTicket("usr_456", "bob@alignify.dev", "Bob", "board_def")
	time.Sleep(25 * time.Millisecond)

	consumedExp, okExp := shortTS.ConsumeTicket(expTicket.ID)
	if okExp || consumedExp != nil {
		t.Fatalf("expected expired ticket to fail consumption")
	}
}
