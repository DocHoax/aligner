package main

import (
	"log"
	"net/http"
	"os"

	"alignify/collaboration/pkg/rooms"
	"alignify/collaboration/pkg/server"
	"alignify/collaboration/pkg/storage"
)

func main() {
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	var store storage.Storage

	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		// Check common postgres individual environment variables
		pgHost := os.Getenv("POSTGRES_HOST")
		if pgHost != "" {
			pgPort := os.Getenv("POSTGRES_PORT")
			if pgPort == "" {
				pgPort = "5432"
			}
			pgUser := os.Getenv("POSTGRES_USER")
			if pgUser == "" {
				pgUser = "postgres"
			}
			pgPassword := os.Getenv("POSTGRES_PASSWORD")
			if pgPassword == "" {
				pgPassword = "postgres"
			}
			pgDB := os.Getenv("POSTGRES_DB")
			if pgDB == "" {
				pgDB = "alignify"
			}
			dbURL = "postgres://" + pgUser + ":" + pgPassword + "@" + pgHost + ":" + pgPort + "/" + pgDB + "?sslmode=disable"
		}
	}

	if dbURL != "" {
		log.Printf("Connecting to PostgreSQL database...")
		pgStore, err := storage.NewPostgresStorage(dbURL)
		if err != nil {
			log.Printf("Warning: Failed to connect to PostgreSQL (%v). Falling back to in-memory store.", err)
			store = storage.NewMemoryStorage()
		} else {
			store = pgStore
			defer pgStore.Close()

			migrationsDir := os.Getenv("MIGRATIONS_DIR")
			if migrationsDir == "" {
				migrationsDir = "migrations"
			}
			if err := pgStore.RunMigrations(migrationsDir); err != nil {
				log.Printf("Warning: Running migrations returned: %v", err)
			} else {
				log.Printf("PostgreSQL database migrations applied successfully.")
			}
		}
	} else {
		log.Printf("No DATABASE_URL provided. Initializing in-memory persistent store.")
		store = storage.NewMemoryStorage()
	}

	hub := rooms.NewHub(store)
	srv := server.NewServer(hub, store)

	log.Printf("Alignify Collaboration Server listening on port :%s", port)
	if err := http.ListenAndServe(":"+port, srv.Routes()); err != nil {
		log.Fatalf("Server shutdown with error: %v", err)
	}
}
