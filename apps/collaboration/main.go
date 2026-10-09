package main

import (
	"context"
	"errors"
	"log"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"syscall"
	"time"

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

	httpServer := &http.Server{
		Addr:              ":" + port,
		Handler:           srv.Routes(),
		ReadHeaderTimeout: 10 * time.Second,
		IdleTimeout:       120 * time.Second,
	}

	// Channel to listen for errors coming from the listener.
	serverErrors := make(chan error, 1)

	// Start the service listening for requests in background.
	go func() {
		log.Printf("Alignify Collaboration Server listening on port :%s", port)
		serverErrors <- httpServer.ListenAndServe()
	}()

	// Channel to listen for an interrupt or terminate signal from the OS.
	shutdown := make(chan os.Signal, 1)
	signal.Notify(shutdown, os.Interrupt, syscall.SIGTERM, syscall.SIGINT)

	// Blocking main and waiting for shutdown or error.
	select {
	case err := <-serverErrors:
		if !errors.Is(err, http.ErrServerClosed) {
			log.Fatalf("Server startup failed: %v", err)
		}

	case sig := <-shutdown:
		log.Printf("Shutdown signal received (%v). Initiating graceful shutdown...", sig)

		// Give outstanding requests a deadline for completion.
		ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
		defer cancel()

		// Asking listener to shut down and shed load.
		if err := httpServer.Shutdown(ctx); err != nil {
			log.Printf("[Warning] Graceful shutdown timeout reached, forcing close: %v", err)
			_ = httpServer.Close()
		}

		// Close database connection pool if Postgres
		if pgStore != nil {
			log.Printf("[Storage] Closing PostgreSQL connection pool...")
			_ = pgStore.Close()
		}

		log.Printf("Alignify Collaboration Server stopped cleanly.")
	}
}
