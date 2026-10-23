package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"

	"alignify/collaboration/pkg/rooms"
	"alignify/collaboration/pkg/server"
	"alignify/collaboration/pkg/storage"
)

// Helper to create a test server with explicit storage
func testServerWithStorage(t *testing.T, store storage.Storage) *server.Server {
	t.Helper()
	hub := rooms.NewHub(store)
	cfg := server.DefaultServerConfig()
	cfg.Environment = "development"
	srv, err := server.NewServerWithConfig(hub, cfg, store)
	if err != nil {
		t.Fatalf("failed to create server: %v", err)
	}
	return srv
}

// Helper to create a test server with memory storage (dev mode)
func testMemoryServer(t *testing.T) *server.Server {
	t.Helper()
	memStore := storage.NewMemoryStorage()
	return testServerWithStorage(t, memStore)
}

func TestHealthEndpoint(t *testing.T) {
	srv := testMemoryServer(t)

	request := httptest.NewRequest(http.MethodGet, "/health", nil)
	response := httptest.NewRecorder()
	srv.Routes().ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("expected status %d, got %d", http.StatusOK, response.Code)
	}

	var data map[string]interface{}
	if err := json.NewDecoder(response.Body).Decode(&data); err != nil {
		t.Fatalf("failed to decode JSON response: %v", err)
	}

	if data["status"] != "ok" {
		t.Fatalf("expected status 'ok', got %v", data["status"])
	}
}

func TestMemoryServer_ReadyzWithMemory(t *testing.T) {
	srv := testMemoryServer(t)

	request := httptest.NewRequest(http.MethodGet, "/readyz", nil)
	response := httptest.NewRecorder()
	srv.Routes().ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("expected status %d, got %d", http.StatusOK, response.Code)
	}

	var data map[string]interface{}
	if err := json.NewDecoder(response.Body).Decode(&data); err != nil {
		t.Fatalf("failed to decode health response: %v", err)
	}
	if data["status"] != "ready" {
		t.Fatalf("expected status 'ready', got %v", data["status"])
	}
	if data["storage"] != "ok" {
		t.Fatalf("expected storage 'ok', got %v", data["storage"])
	}
}

func TestConfiguration_LoadsWithDefaults(t *testing.T) {
	os.Unsetenv("ENVIRONMENT")
	os.Unsetenv("ENV")
	os.Unsetenv("JWT_SECRET")
	os.Unsetenv("ALLOWED_ORIGINS")

	cfg, err := server.LoadServerConfigFromEnv()
	if err != nil {
		t.Fatalf("Unexpected error loading dev config: %v", err)
	}
	if cfg.Environment != "development" {
		t.Errorf("Expected development env, got %s", cfg.Environment)
	}
	if !cfg.EnableRateLimiting {
		t.Error("Expected rate limiting enabled by default")
	}
}

func TestConfiguration_ProductionRejectsShortSecret(t *testing.T) {
	os.Setenv("ENVIRONMENT", "production")
	os.Setenv("JWT_SECRET", "short")
	defer os.Unsetenv("ENVIRONMENT")
	defer os.Unsetenv("JWT_SECRET")

	_, err := server.LoadServerConfigFromEnv()
	if err == nil {
		t.Error("Expected error for short JWT secret in production, got nil")
	}
}

func TestConfiguration_ProductionValidConfig(t *testing.T) {
	os.Setenv("ENVIRONMENT", "production")
	os.Setenv("JWT_SECRET", "super-secret-secure-production-jwt-token-key-2026-launch")
	os.Setenv("ALLOWED_ORIGINS", "https://alignify.dev,https://staging.alignify.dev")
	os.Setenv("AUTH_RATE_LIMIT", "15")
	os.Setenv("AI_RATE_LIMIT", "40")
	os.Setenv("API_RATE_LIMIT", "500")
	defer os.Unsetenv("ENVIRONMENT")
	defer os.Unsetenv("JWT_SECRET")
	defer os.Unsetenv("ALLOWED_ORIGINS")
	defer os.Unsetenv("AUTH_RATE_LIMIT")
	defer os.Unsetenv("AI_RATE_LIMIT")
	defer os.Unsetenv("API_RATE_LIMIT")

	cfg, err := server.LoadServerConfigFromEnv()
	if err != nil {
		t.Fatalf("Unexpected error: %v", err)
	}
	if cfg.Environment != "production" {
		t.Errorf("Expected production env, got %s", cfg.Environment)
	}
	if len(cfg.AllowedOrigins) != 2 {
		t.Errorf("Expected 2 allowed origins, got %d", len(cfg.AllowedOrigins))
	}
	if cfg.AuthRateLimit != 15 || cfg.AIRateLimit != 40 || cfg.APIRateLimit != 500 {
		t.Errorf("Rate limits mismatch: %+v", cfg)
	}
}

func TestConfiguration_ENVOverridesENV(t *testing.T) {
	os.Setenv("ENV", "staging")
	// ENVIRONMENT takes precedence over ENV
	os.Setenv("ENVIRONMENT", "development")
	defer os.Unsetenv("ENV")
	defer os.Unsetenv("ENVIRONMENT")

	cfg, err := server.LoadServerConfigFromEnv()
	if err != nil {
		t.Fatalf("Unexpected error: %v", err)
	}
	// ENVIRONMENT should win even though ENV is set to staging
	if cfg.Environment != "development" {
		t.Errorf("Expected development env (ENVIRONMENT wins), got %s", cfg.Environment)
	}
}

func TestConfiguration_BlankEnvFallsBackToDevelopment(t *testing.T) {
	// Clear all environment variables
	os.Unsetenv("ENVIRONMENT")
	os.Unsetenv("ENV")
	os.Unsetenv("JWT_SECRET")
	os.Unsetenv("ALLOWED_ORIGINS")

	cfg, err := server.LoadServerConfigFromEnv()
	if err != nil {
		t.Fatalf("Unexpected error: %v", err)
	}
	if cfg.Environment != "development" {
		t.Errorf("Expected development env with blank inputs, got %s", cfg.Environment)
	}
}

func TestConfiguration_WhitespaceNormalization(t *testing.T) {
	os.Setenv("ENVIRONMENT", "  production  ")
	os.Setenv("JWT_SECRET", "super-secret-secure-production-jwt-token-key-2026-launch")
	defer os.Unsetenv("ENVIRONMENT")
	defer os.Unsetenv("JWT_SECRET")

	cfg, err := server.LoadServerConfigFromEnv()
	if err != nil {
		t.Fatalf("Unexpected error: %v", err)
	}
	if cfg.Environment != "production" {
		t.Errorf("Expected production after whitespace normalization, got %s", cfg.Environment)
	}
}
