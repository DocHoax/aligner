package server_test

import (
	"bytes"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"

	"alignify/collaboration/pkg/server"
)

func TestLoadServerConfigFromEnv(t *testing.T) {
	// Test Development defaults
	t.Run("Development Defaults", func(t *testing.T) {
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
	})

	// Test Production with insecure JWT secret (must fail)
	t.Run("Production Insecure JWT Secret Rejection", func(t *testing.T) {
		os.Setenv("ENVIRONMENT", "production")
		os.Setenv("JWT_SECRET", "short")
		defer os.Unsetenv("ENVIRONMENT")
		defer os.Unsetenv("JWT_SECRET")

		_, err := server.LoadServerConfigFromEnv()
		if err == nil {
			t.Error("Expected error for short JWT secret in production, got nil")
		}
	})

	// Test Production with valid config
	t.Run("Production Valid Config", func(t *testing.T) {
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
	})
}

func TestSecurityHeadersMiddleware(t *testing.T) {
	dummyHandler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("ok"))
	})

	t.Run("Standard Hardening Headers", func(t *testing.T) {
		middleware := server.SecurityHeadersMiddleware(false, dummyHandler)
		req := httptest.NewRequest(http.MethodGet, "/api/test", nil)
		rec := httptest.NewRecorder()

		middleware.ServeHTTP(rec, req)

		if rec.Header().Get("X-Content-Type-Options") != "nosniff" {
			t.Errorf("Missing X-Content-Type-Options: nosniff")
		}
		if rec.Header().Get("X-Frame-Options") != "DENY" {
			t.Errorf("Missing X-Frame-Options: DENY")
		}
		if rec.Header().Get("X-XSS-Protection") != "1; mode=block" {
			t.Errorf("Missing X-XSS-Protection: 1; mode=block")
		}
		if rec.Header().Get("Referrer-Policy") != "strict-origin-when-cross-origin" {
			t.Errorf("Missing Referrer-Policy: strict-origin-when-cross-origin")
		}
		if !strings.Contains(rec.Header().Get("Content-Security-Policy"), "default-src 'self'") {
			t.Errorf("Missing Content-Security-Policy header")
		}
	})

	t.Run("HSTS in Production Mode", func(t *testing.T) {
		middleware := server.SecurityHeadersMiddleware(true, dummyHandler)
		req := httptest.NewRequest(http.MethodGet, "/api/test", nil)
		rec := httptest.NewRecorder()

		middleware.ServeHTTP(rec, req)

		hsts := rec.Header().Get("Strict-Transport-Security")
		if !strings.Contains(hsts, "max-age=31536000") {
			t.Errorf("Expected Strict-Transport-Security header in production, got: %s", hsts)
		}
	})
}

func TestCORSMiddleware(t *testing.T) {
	dummyHandler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("ok"))
	})

	allowedOrigins := []string{"https://alignify.dev", "https://staging.alignify.dev"}
	cors := server.CORSMiddleware(allowedOrigins, dummyHandler)

	t.Run("Allowed Origin Whitelisted", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/api/boards", nil)
		req.Header.Set("Origin", "https://alignify.dev")
		rec := httptest.NewRecorder()

		cors.ServeHTTP(rec, req)

		if rec.Header().Get("Access-Control-Allow-Origin") != "https://alignify.dev" {
			t.Errorf("Expected Access-Control-Allow-Origin: https://alignify.dev, got: %s", rec.Header().Get("Access-Control-Allow-Origin"))
		}
		if rec.Header().Get("Access-Control-Allow-Credentials") != "true" {
			t.Error("Expected Access-Control-Allow-Credentials: true")
		}
	})

	t.Run("Disallowed Origin Rejected", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/api/boards", nil)
		req.Header.Set("Origin", "https://attacker-domain.evil")
		rec := httptest.NewRecorder()

		cors.ServeHTTP(rec, req)

		if rec.Header().Get("Access-Control-Allow-Origin") != "" {
			t.Errorf("Expected no CORS origin header for attacker domain, got: %s", rec.Header().Get("Access-Control-Allow-Origin"))
		}
	})

	t.Run("Preflight OPTIONS Handling", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodOptions, "/api/boards", nil)
		req.Header.Set("Origin", "https://alignify.dev")
		rec := httptest.NewRecorder()

		cors.ServeHTTP(rec, req)

		if rec.Code != http.StatusNoContent {
			t.Errorf("Expected 204 No Content for OPTIONS, got %d", rec.Code)
		}
		if !strings.Contains(rec.Header().Get("Access-Control-Allow-Methods"), "POST") {
			t.Errorf("Missing allowed methods in preflight")
		}
	})
}

func TestCSWSHOriginChecker(t *testing.T) {
	allowedOrigins := []string{"https://alignify.dev"}
	checkerProd := server.CSWSHOriginChecker(allowedOrigins, true)
	checkerDev := server.CSWSHOriginChecker(allowedOrigins, false)

	t.Run("Production CSWSH Validation", func(t *testing.T) {
		reqAllowed := httptest.NewRequest(http.MethodGet, "/ws", nil)
		reqAllowed.Header.Set("Origin", "https://alignify.dev")
		if !checkerProd(reqAllowed) {
			t.Error("Expected allowed origin to pass CSWSH checker")
		}

		reqEvil := httptest.NewRequest(http.MethodGet, "/ws", nil)
		reqEvil.Header.Set("Origin", "https://malicious-origin.com")
		if checkerProd(reqEvil) {
			t.Error("Expected malicious origin to fail CSWSH checker in prod")
		}

		// Non-browser client without Origin header should pass (CLI/desktop workers)
		reqNoOrigin := httptest.NewRequest(http.MethodGet, "/ws", nil)
		if !checkerProd(reqNoOrigin) {
			t.Error("Expected non-browser request without Origin to pass")
		}
	})

	t.Run("Development Localhost Allowed", func(t *testing.T) {
		reqLocal := httptest.NewRequest(http.MethodGet, "/ws", nil)
		reqLocal.Header.Set("Origin", "http://localhost:5173")
		if !checkerDev(reqLocal) {
			t.Error("Expected localhost origin to pass in dev")
		}
	})
}

func TestSlidingWindowRateLimiter(t *testing.T) {
	limiter := server.NewSlidingWindowRateLimiter(3) // 3 requests per minute limit
	ip := "192.168.1.50"

	// 1-3 should pass
	for i := 1; i <= 3; i++ {
		allowed, _ := limiter.Allow(ip)
		if !allowed {
			t.Errorf("Request %d should have been allowed", i)
		}
	}

	// 4th request should be blocked
	allowed, retryAfter := limiter.Allow(ip)
	if allowed {
		t.Error("Request 4 should have been blocked")
	}
	if retryAfter <= 0 {
		t.Errorf("Expected positive retry-after duration, got %v", retryAfter)
	}

	// Different IP should still be allowed
	allowedOther, _ := limiter.Allow("10.0.0.1")
	if !allowedOther {
		t.Error("Different IP should not be blocked")
	}
}

func TestRateLimitMiddleware(t *testing.T) {
	authLimiter := server.NewSlidingWindowRateLimiter(2)
	aiLimiter := server.NewSlidingWindowRateLimiter(2)
	apiLimiter := server.NewSlidingWindowRateLimiter(5)

	dummyHandler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("success"))
	})

	mw := server.RateLimitMiddleware(authLimiter, aiLimiter, apiLimiter, dummyHandler)

	// Test Auth Endpoint Rate Limiting
	for i := 0; i < 2; i++ {
		req := httptest.NewRequest(http.MethodPost, "/api/auth/login", nil)
		req.RemoteAddr = "1.2.3.4:1234"
		rec := httptest.NewRecorder()
		mw.ServeHTTP(rec, req)
		if rec.Code != http.StatusOK {
			t.Fatalf("Request %d failed with status %d", i+1, rec.Code)
		}
	}

	// 3rd auth request must return 429 Too Many Requests
	req := httptest.NewRequest(http.MethodPost, "/api/auth/login", nil)
	req.RemoteAddr = "1.2.3.4:1234"
	rec := httptest.NewRecorder()
	mw.ServeHTTP(rec, req)

	if rec.Code != http.StatusTooManyRequests {
		t.Errorf("Expected status 429 Too Many Requests, got %d", rec.Code)
	}
	if rec.Header().Get("Retry-After") == "" {
		t.Error("Missing Retry-After header on 429 response")
	}
}

func TestRequestBodyLimitMiddleware(t *testing.T) {
	dummyHandler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, err := io.ReadAll(r.Body)
		if err != nil {
			http.Error(w, err.Error(), http.StatusRequestEntityTooLarge)
			return
		}
		w.WriteHeader(http.StatusOK)
	})

	limitMw := server.RequestBodyLimitMiddleware(1024, 4096, dummyHandler) // 1 KB std, 4 KB thumb

	t.Run("Payload Under Limit Succeeds", func(t *testing.T) {
		smallBody := bytes.NewBuffer(make([]byte, 500))
		req := httptest.NewRequest(http.MethodPost, "/api/boards", smallBody)
		rec := httptest.NewRecorder()

		limitMw.ServeHTTP(rec, req)
		if rec.Code != http.StatusOK {
			t.Errorf("Expected 200 OK, got %d", rec.Code)
		}
	})

	t.Run("Payload Over Standard Limit Fails", func(t *testing.T) {
		largeBody := bytes.NewBuffer(make([]byte, 2048))
		req := httptest.NewRequest(http.MethodPost, "/api/boards", largeBody)
		rec := httptest.NewRecorder()

		limitMw.ServeHTTP(rec, req)
		if rec.Code != http.StatusRequestEntityTooLarge {
			t.Errorf("Expected 413 Payload Too Large, got %d", rec.Code)
		}
	})
}

func TestRedactSensitiveURL(t *testing.T) {
	testCases := []struct {
		input    string
		expected string
	}{
		{
			input:    "/api/boards?token=super-secret-jwt&limit=10",
			expected: "/api/boards?token=[REDACTED]&limit=10",
		},
		{
			input:    "/ws?ticket=user-session-ticket-12345",
			expected: "/ws?ticket=[REDACTED]",
		},
		{
			input:    "/api/auth/reset?password=mypassword&apiKey=1234-abcd",
			expected: "/api/auth/reset?password=[REDACTED]&apiKey=[REDACTED]",
		},
		{
			input:    "/api/boards/123/objects?filter=nodes&page=1",
			expected: "/api/boards/123/objects?filter=nodes&page=1",
		},
	}

	for _, tc := range testCases {
		res := server.RedactSensitiveURL(tc.input)
		if res != tc.expected {
			t.Errorf("RedactSensitiveURL(%q) = %q, expected %q", tc.input, res, tc.expected)
		}
	}
}
