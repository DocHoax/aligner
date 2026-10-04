package client

import (
	"encoding/json"
	"log"
	"sync"
	"time"

	"github.com/gorilla/websocket"

	"alignify/collaboration/pkg/protocol"
)

const (
	// Time allowed to write a message to the peer.
	writeWait = 10 * time.Second

	// Time allowed to read the next pong message from the peer.
	pongWait = 60 * time.Second

	// Send pings to peer with this period. Must be less than pongWait.
	pingPeriod = (pongWait * 9) / 10

	// Maximum message size allowed from peer (1MB).
	maxMessageSize = 1024 * 1024

	// Size of outbound message buffer.
	sendBufferSize = 256
)

// RoomHandler provides message dispatching and unregistration callbacks.
type RoomHandler interface {
	HandleMessage(client *Client, msg *protocol.ClientMessage)
	Unregister(client *Client)
}

// Client is a middleman between the WebSocket connection and the room actor.
type Client struct {
	UserID    string
	UserName  string
	UserColor string
	BoardID   string
	Conn      *websocket.Conn
	Handler   RoomHandler
	Send      chan []byte
	closed    bool
	mu        sync.Mutex
}

// NewClient creates a new Client instance.
func NewClient(userID, userName, userColor, boardID string, conn *websocket.Conn, handler RoomHandler) *Client {
	return &Client{
		UserID:    userID,
		UserName:  userName,
		UserColor: userColor,
		BoardID:   boardID,
		Conn:      conn,
		Handler:   handler,
		Send:      make(chan []byte, sendBufferSize),
	}
}

// SendMessage serializes and enqueues a ServerMessage for this client.
func (c *Client) SendMessage(msg *protocol.ServerMessage) {
	data, err := json.Marshal(msg)
	if err != nil {
		log.Printf("[Client %s] JSON marshal error: %v", c.UserID, err)
		return
	}

	c.mu.Lock()
	defer c.mu.Unlock()
	if c.closed {
		return
	}

	select {
	case c.Send <- data:
	default:
		log.Printf("[Client %s] Send buffer full, dropping message or terminating", c.UserID)
	}
}

// ReadPump pumps messages from the websocket connection to the room handler.
func (c *Client) ReadPump() {
	defer func() {
		c.Handler.Unregister(c)
		c.Close()
	}()

	c.Conn.SetReadLimit(maxMessageSize)
	_ = c.Conn.SetReadDeadline(time.Now().Add(pongWait))
	c.Conn.SetPongHandler(func(string) error {
		_ = c.Conn.SetReadDeadline(time.Now().Add(pongWait))
		return nil
	})

	for {
		_, messageBytes, err := c.Conn.ReadMessage()
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
				log.Printf("[Client %s] Read error: %v", c.UserID, err)
			}
			break
		}

		var msg protocol.ClientMessage
		if err := json.Unmarshal(messageBytes, &msg); err != nil {
			log.Printf("[Client %s] JSON unmarshal error: %v", c.UserID, err)
			continue
		}

		// Ensure boardId and userId match client session if missing
		if msg.BoardID == "" {
			msg.BoardID = c.BoardID
		}
		if msg.UserID == "" {
			msg.UserID = c.UserID
		}

		c.Handler.HandleMessage(c, &msg)
	}
}

// WritePump pumps messages from the send channel to the websocket connection.
func (c *Client) WritePump() {
	ticker := time.NewTicker(pingPeriod)
	defer func() {
		ticker.Stop()
		c.Close()
	}()

	for {
		select {
		case message, ok := <-c.Send:
			_ = c.Conn.SetWriteDeadline(time.Now().Add(writeWait))
			if !ok {
				// The channel was closed by the room.
				_ = c.Conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}

			w, err := c.Conn.NextWriter(websocket.TextMessage)
			if err != nil {
				return
			}
			_, _ = w.Write(message)

			if err := w.Close(); err != nil {
				return
			}

		case <-ticker.C:
			_ = c.Conn.SetWriteDeadline(time.Now().Add(writeWait))
			if err := c.Conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
		}
	}
}

// Close gracefully closes the client channels and connection.
func (c *Client) Close() {
	c.mu.Lock()
	defer c.mu.Unlock()

	if !c.closed {
		c.closed = true
		close(c.Send)
		if c.Conn != nil {
			_ = c.Conn.Close()
		}
	}
}
