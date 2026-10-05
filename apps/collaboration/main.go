package main

import (
	"log"
	"net/http"
	"os"
	"path/filepath"

	"alignify/collaboration/pkg/rooms"
	"alignify/collaboration/pkg/server"
	"alignify/collaboration/pkg/storage"
)

func findMigrationsDir() string {
	candidates := []string{
		"./apps/collaboration/migrations",
		"./migrations",
		"../migrations",
		"../../apps/collaboration/migrations",
	}
	for _, dir := range candidates {
		if fi, err := os.Stat(dir); err == nil && fi.IsDir() {
			abs, _ := filepath.Abs(dir)
			return abs
		}
	}
	return ""
}

func main() {
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		dbURL = "postgres://postgres:postgres@localhost:5432/alignify?sslmode=disable"
	}

	var store storage.Storage
	pgStore, err := storage.NewPostgresStorage(dbURL)
	if err != nil {
		log.Printf("[Warning] PostgreSQL connection failed (%v). Falling back to in-memory storage.", err)
		store = storage.NewMemoryStorage()
	} else {
		log.Printf("[Storage] Connected to PostgreSQL successfully at %s", dbURL)
		store = pgStore

		// Run migrations
		migDir := findMigrationsDir()
		if migDir != "" {
			log.Printf("[Storage] Running database migrations from %s ...", migDir)
			if err := pgStore.RunMigrations(migDir); err != nil {
				log.Fatalf("[Storage] Failed to run database migrations: %v", err)
			}
			log.Printf("[Storage] Database migrations applied successfully.")
		} else {
			log.Printf("[Storage] Warning: Migrations directory not found. Skipping auto-migrations.")
		}
	}

	hub := rooms.NewHub(store)
	srv := server.NewServer(hub, store)

	log.Printf("Alignify Collaboration Server listening on port :%s", port)
	if err := http.ListenAndServe(":"+port, srv.Routes()); err != nil {
		log.Fatalf("Server shutdown with error: %v", err)
	}
}
