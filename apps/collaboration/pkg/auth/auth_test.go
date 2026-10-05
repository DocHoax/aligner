package auth_test

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"alignify/collaboration/pkg/auth"
	"alignify/collaboration/pkg/models"
)

func TestPasswordHashing(t *testing.T) {
	rawPass := "SuperSecretPassword123!"

	hash, err := auth.HashPassword(rawPass)
	if err != nil {
		t.Fatalf("failed to hash password: %v", err)
	}

	if hash == rawPass {
		t.Error("hash should not equal raw password")
	}

	if !auth.CheckPasswordHash(rawPass, hash) {
		t.Error("expected correct password to match hash")
	}

	if auth.CheckPasswordHash("WrongPassword456", hash) {
		t.Error("expected wrong password to fail match")
	}
}

func TestJWTManager_GenerateAndValidate(t *testing.T) {
	secret := "test-secret-key-for-jwt-manager-987"
	jwtMgr := auth.NewJWTManager(secret, 1*time.Hour)

	user := &models.User{
		ID:          "usr_123456",
		Email:       "test@alignify.dev",
		DisplayName: "Test Architect",
	}

	tokenStr, err := jwtMgr.GenerateToken(user)
	if err != nil {
		t.Fatalf("failed to generate token: %v", err)
	}

	if tokenStr == "" {
		t.Fatal("expected non-empty token string")
	}

	claims, err := jwtMgr.ValidateToken(tokenStr)
	if err != nil {
		t.Fatalf("failed to validate token: %v", err)
	}

	if claims.UserID != user.ID || claims.Email != user.Email || claims.DisplayName != user.DisplayName {
		t.Errorf("claims mismatch: %+v vs %+v", claims, user)
	}

	// Test expired or forged token
	wrongJwtMgr := auth.NewJWTManager("wrong-secret-key-111", 1*time.Hour)
	_, errWrong := wrongJwtMgr.ValidateToken(tokenStr)
	if errWrong != auth.ErrInvalidToken {
		t.Errorf("expected ErrInvalidToken for forged token, got: %v", errWrong)
	}
}

func TestAuthMiddleware_RequireAuth(t *testing.T) {
	secret := "test-auth-middleware-secret"
	jwtMgr := auth.NewJWTManager(secret, 1*time.Hour)
	middleware := auth.NewAuthMiddleware(jwtMgr)

	user := &models.User{
		ID:          "usr_authtest",
		Email:       "auth@alignify.dev",
		DisplayName: "Auth Tester",
	}
	validToken, _ := jwtMgr.GenerateToken(user)

	handler := middleware.RequireAuth(func(w http.ResponseWriter, r *http.Request) {
		claims, ok := auth.GetClaimsFromContext(r.Context())
		if !ok || claims.UserID != user.ID {
			http.Error(w, "no claims", http.StatusUnauthorized)
			return
		}
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("authorized"))
	})

	// 1. Request without token -> 401
	req1 := httptest.NewRequest(http.MethodGet, "/api/protected", nil)
	rec1 := httptest.NewRecorder()
	handler.ServeHTTP(rec1, req1)
	if rec1.Code != http.StatusUnauthorized {
		t.Errorf("expected 401 Unauthorized, got %d", rec1.Code)
	}

	// 2. Request with Bearer header -> 200
	req2 := httptest.NewRequest(http.MethodGet, "/api/protected", nil)
	req2.Header.Set("Authorization", "Bearer "+validToken)
	rec2 := httptest.NewRecorder()
	handler.ServeHTTP(rec2, req2)
	if rec2.Code != http.StatusOK {
		t.Errorf("expected 200 OK, got %d (body: %s)", rec2.Code, rec2.Body.String())
	}

	// 3. Request with query param token -> 200
	req3 := httptest.NewRequest(http.MethodGet, "/api/protected?token="+validToken, nil)
	rec3 := httptest.NewRecorder()
	handler.ServeHTTP(rec3, req3)
	if rec3.Code != http.StatusOK {
		t.Errorf("expected 200 OK with query token, got %d", rec3.Code)
	}
}
