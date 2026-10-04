package main

import (
	"log"
	"net/http"
	"os"

	"alignify/collaboration/pkg/rooms"
	"alignify/collaboration/pkg/server"
)

func main() {
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	hub := rooms.NewHub()
	srv := server.NewServer(hub)

	log.Printf("Alignify Collaboration Server listening on port :%s", port)
	if err := http.ListenAndServe(":"+port, srv.Routes()); err != nil {
		log.Fatalf("Server shutdown with error: %v", err)
	}
}
