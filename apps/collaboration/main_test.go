package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"alignify/collaboration/pkg/rooms"
	"alignify/collaboration/pkg/server"
)

func TestHealthEndpoint(t *testing.T) {
	hub := rooms.NewHub()
	srv := server.NewServer(hub)

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
