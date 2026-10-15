package main

import (
	"context"
	"errors"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"alignify/collaboration/pkg/rooms"
	"alignify/collaboration/pkg/server"
	"alignify/collaboration/pkg/storage"
)

// prepareServer performs startup preparation but does not start listening.
// It returns the HTTP server, storage, and any error encountered during preparation.
func prepareServer() (*http.Server, storage.Storage, error) {
	// 1. Load and validate configuration first
	cfg, err := server.LoadServerConfigFromEnv()
	if err != nil {
		return nil, nil, fmt.Errorf("failed to load configuration: %w", err)
	}
	isProdLike := cfg.IsProductionLike()

	// 2. Handle PORT
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	// 3. Handle DATABASE_URL
	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" && isProdLike {
		return nil, nil, errors.New("DATABASE_URL is required in production/staging environments")
	}
	// For development/test, allow empty DATABASE_URL (will use memory storage if connection fails)
	// But if DATABASE_URL is set, we must use it and validate it's not the default application DB
	if dbURL != "" && !isProdLike {
		// In dev/test, if DATABASE_URL is explicitly set, we should use it but allow fallback on failure
	} else if dbURL == "" && !isProdLike {
		// Explicitly unset for dev/test - will use memory storage
		dbURL = ""
	}

	// 4. Initialize storage
	var store storage.Storage
	var pgStore *storage.PostgresStorage

	if dbURL != "" {
		// Attempt PostgreSQL connection
		pgStore, err = storage.NewPostgresStorage(dbURL)
		if err != nil {
			if isProdLike {
				return nil, nil, fmt.Errorf("failed to connect to PostgreSQL in %s environment: %w", cfg.Environment, err)
			}
			// Development/test: fallback to memory storage on connection failure
			log.Printf("[Warning] PostgreSQL connection failed (%v). Falling back to in-memory storage.", err)
			store = storage.NewMemoryStorage()
		} else {
			// Successfully connected to PostgreSQL
			store = pgStore

			// 5. Validate and run migrations
			migDir, err := resolveMigrationsDir()
			if err != nil {
				// Close storage on migration resolution failure
				if pgStore != nil {
					pgStore.Close()
				}
				return nil, nil, fmt.Errorf("failed to resolve migration directory: %w", err)
			}

			// Run migrations (validates inventory internally)
			if err := pgStore.RunMigrations(migDir); err != nil {
				// Close storage on migration failure
				if pgStore != nil {
					pgStore.Close()
				}
				return nil, nil, fmt.Errorf("failed to run database migrations: %w", err)
			}
		}
	} else {
		// No DATABASE_URL specified - use memory storage (only allowed in development/test)
		if isProdLike {
			return nil, nil, errors.New("DATABASE_URL is required in production/staging environments")
		}
		log.Printf("[Storage] Using in-memory storage (development/test mode)")
		store = storage.NewMemoryStorage()
	}

	// 6. Create server with validated config
	hub := rooms.NewHub(store)
	srv, err := server.NewServerWithConfig(hub, cfg, store)
	if err != nil {
		// Close storage on server construction failure
		if pgStore != nil {
			pgStore.Close()
		}
		return nil, nil, fmt.Errorf("failed to initialize server: %w", err)
	}

	// 7. Create HTTP server (but don't start listening yet)
	httpServer := &http.Server{
		Addr:              ":" + port,
		Handler:           srv.Routes(),
		ReadHeaderTimeout: 10 * time.Second,
		IdleTimeout:       120 * time.Second,
	}

	return httpServer, store, nil
}

func main() {
	// Perform startup preparation
	httpServer, store, err := prepareServer()
	if err != nil {
		log.Fatalf("[Startup] Failed to prepare server: %v", err)
	}

	// Determine storage type for logging
	var storageType string
	if _, ok := store.(*storage.PostgresStorage); ok {
		storageType = "PostgreSQL"
	} else {
		storageType = "in-memory"
	}

	// Start listening
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	// Channel to listen for errors coming from the listener.
	serverErrors := make(chan error, 1)

	// Start the service listening for requests in background.
	go func() {
		log.Printf("Alignify Collaboration Server listening on port :%s (%s storage)", port, storageType)
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
		if pgStore, ok := store.(*storage.PostgresStorage); ok {
			log.Printf("[Storage] Closing PostgreSQL connection pool...")
			_ = pgStore.Close()
		}

		log.Printf("Alignify Collaboration Server stopped cleanly.")
	}
}

// resolveMigrationsDir resolves the migration directory for the current execution context.
// It checks for migrations in the module-relative path first, then falls back to the repository root.
// It returns an error if the directory is missing or unreadable.
func resolveMigrationsDir() (string, error) {
	// Check for migrations in the module-relative path (when running from module directory)
	migDir := "../../migrations"
	if _, err := os.Stat(migDir); err == nil {
		return migDir, nil
	}

	// Fall back to repository root path (when running from repository root)
	migDir = "../../../apps/collaboration/migrations"
	if _, err := os.Stat(migDir); err != nil {
		return "", fmt.Errorf("migrations directory not found")
	}

	fi, err := os.Stat(migDir)
	if err != nil {
		return "", fmt.Errorf("migrations directory %s is unreadable: %w", migDir, err)
	}
	if !fi.IsDir() {
		return "", fmt.Errorf("migration path %s is not a directory", migDir)
	}
	return migDir, nil
}
