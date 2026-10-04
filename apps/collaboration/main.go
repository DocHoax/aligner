package main

import (
	"log"
	"net/http"
	"os"

	"github.com/gorilla/websocket"
)

type client struct {
	conn *websocket.Conn
	send chan []byte
}

type boardHub struct {
	clients    map[*client]struct{}
	register   chan *client
	unregister chan *client
	broadcast  chan []byte
}

func newBoardHub() *boardHub {
	return &boardHub{
		clients:    make(map[*client]struct{}),
		register:   make(chan *client),
		unregister: make(chan *client),
		broadcast:  make(chan []byte),
	}
}

func (h *boardHub) run() {
	for {
		select {
		case c := <-h.register:
			h.clients[c] = struct{}{}
		case c := <-h.unregister:
			if _, ok := h.clients[c]; ok {
				delete(h.clients, c)
				close(c.send)
			}
		case message := <-h.broadcast:
			for c := range h.clients {
				select {
				case c.send <- message:
				default:
					delete(h.clients, c)
					close(c.send)
					_ = c.conn.Close()
				}
			}
		}
	}
}

var upgrader = websocket.Upgrader{
	CheckOrigin: func(_ *http.Request) bool { return true },
}

func serveBoard(h *boardHub, w http.ResponseWriter, r *http.Request) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		return
	}

	c := &client{conn: conn, send: make(chan []byte, 16)}
	h.register <- c
	defer func() {
		h.unregister <- c
		_ = conn.Close()
	}()

	go writeMessages(c)
	for {
		_, message, err := conn.ReadMessage()
		if err != nil {
			return
		}
		h.broadcast <- message
	}
}

func writeMessages(c *client) {
	for message := range c.send {
		if err := c.conn.WriteMessage(websocket.TextMessage, message); err != nil {
			return
		}
	}
}

func main() {
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	hub := newBoardHub()
	go hub.run()

	http.HandleFunc("/health", func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("ok"))
	})
	http.HandleFunc("/ws", func(w http.ResponseWriter, r *http.Request) {
		serveBoard(hub, w, r)
	})

	log.Printf("collaboration server listening on :%s", port)
	log.Fatal(http.ListenAndServe(":"+port, nil))
}
