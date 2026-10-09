package server

import (
	"bufio"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net"
	"net/http"
	"os"
	"strconv"
	"strings"
	"sync"
	"time"
)

var (
	ErrInsecureJWTSecret = errors.New("JWT_SECRET must be at least 32 characters long and non-default in production/staging")
)

// ServerConfig encapsulates security, network, and runtime operational parameters.
type ServerConfig struct {
	Environment        string        // "production", "staging", "development", "test"
	JWTSecret          string        // Secret key for HMAC-SHA256 signing
	JWTTTL             time.Duration // Access token lifetime
	AllowedOrigins     []string      // Whitelisted origins for CORS & CSWSH
	EnableRateLimiting bool          // Rate limiting switch
	AuthRateLimit      int           // Max auth requests per minute per IP
	AIRateLimit        int           // Max AI requests per minute per IP
	APIRateLimit       int           // Max general API requests per minute per IP
	MaxRequestBodySize int64         // Maximum JSON payload size in bytes
	MaxThumbnailSize   int64         // Maximum thumbnail upload size in bytes
}

// DefaultServerConfig returns safe development defaults.
func DefaultServerConfig() ServerConfig {
	return ServerConfig{
		Environment:        "development",
		JWTSecret:          "alignify-dev-jwt-secret-key-change-in-production-2026",
		JWTTTL:             7 * 24 * time.Hour,
		AllowedOrigins:     []string{"*"},
		EnableRateLimiting: true,
		AuthRateLimit:      10,
		AIRateLimit:        30,
		APIRateLimit:       300,
		MaxRequestBodySize: 1024 * 1024,     // 1 MB
		MaxThumbnailSize:   5 * 1024 * 1024, // 5 MB
	}
}

// LoadServerConfigFromEnv loads configuration from environment variables with production security validation.
func LoadServerConfigFromEnv() (ServerConfig, error) {
	cfg := DefaultServerConfig()

	env := os.Getenv("ENVIRONMENT")
	if env == "" {
		env = os.Getenv("ENV")
	}
	if env != "" {
		cfg.Environment = strings.ToLower(strings.TrimSpace(env))
	}

	secret := os.Getenv("JWT_SECRET")
	isProdLike := cfg.Environment == "production" || cfg.Environment == "staging"

	if isProdLike {
		if secret == "" || len(secret) < 32 || strings.Contains(secret, "alignify-dev") {
			return cfg, fmt.Errorf("%w (current length: %d)", ErrInsecureJWTSecret, len(secret))
		}
		cfg.JWTSecret = secret
	} else {
		if secret != "" {
			cfg.JWTSecret = secret
		} else {
			log.Println("[Security Warning] Using default JWT secret in non-production environment. Set JWT_SECRET in production.")
		}
	}

	if origins := os.Getenv("ALLOWED_ORIGINS"); origins != "" {
		parts := strings.Split(origins, ",")
		var cleaned []string
		for _, p := range parts {
			trimmed := strings.TrimSpace(p)
			if trimmed != "" {
				cleaned = append(cleaned, trimmed)
			}
		}
		if len(cleaned) > 0 {
			cfg.AllowedOrigins = cleaned
		}
	} else if isProdLike {
		cfg.AllowedOrigins = []string{"https://alignify.dev", "https://staging.alignify.dev"}
	}

	if rl := os.Getenv("ENABLE_RATE_LIMITING"); rl != "" {
		cfg.EnableRateLimiting = rl != "false" && rl != "0"
	}

	if authLimit := os.Getenv("AUTH_RATE_LIMIT"); authLimit != "" {
		if v, err := strconv.Atoi(authLimit); err == nil && v > 0 {
			cfg.AuthRateLimit = v
		}
	}

	if aiLimit := os.Getenv("AI_RATE_LIMIT"); aiLimit != "" {
		if v, err := strconv.Atoi(aiLimit); err == nil && v > 0 {
			cfg.AIRateLimit = v
		}
	}

	if apiLimit := os.Getenv("API_RATE_LIMIT"); apiLimit != "" {
		if v, err := strconv.Atoi(apiLimit); err == nil && v > 0 {
			cfg.APIRateLimit = v
		}
	}

	return cfg, nil
}

// SecurityHeadersMiddleware attaches standard hardening headers to every HTTP response.
func SecurityHeadersMiddleware(isProd bool, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("X-Frame-Options", "DENY")
		w.Header().Set("X-XSS-Protection", "1; mode=block")
		w.Header().Set("Referrer-Policy", "strict-origin-when-cross-origin")
		w.Header().Set("Content-Security-Policy", "default-src 'self'; script-src 'self' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; connect-src 'self' ws: wss: http: https:;")

		if isProd || r.TLS != nil || r.Header.Get("X-Forwarded-Proto") == "https" {
			w.Header().Set("Strict-Transport-Security", "max-age=31536000; includeSubDomains")
		}

		next.ServeHTTP(w, r)
	})
}

// CORSMiddleware provides strict CORS handling respecting configured allowed origins.
func CORSMiddleware(allowedOrigins []string, next http.Handler) http.Handler {
	allowAll := false
	originSet := make(map[string]bool)
	for _, o := range allowedOrigins {
		if o == "*" {
			allowAll = true
		}
		originSet[strings.ToLower(o)] = true
	}

	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		origin := r.Header.Get("Origin")
		matchedOrigin := ""

		if allowAll {
			matchedOrigin = "*"
		} else if origin != "" {
			normalized := strings.ToLower(origin)
			if originSet[normalized] || isLocalhostOrigin(origin) {
				matchedOrigin = origin
			}
		}

		if matchedOrigin != "" {
			w.Header().Set("Access-Control-Allow-Origin", matchedOrigin)
			if matchedOrigin != "*" {
				w.Header().Set("Access-Control-Allow-Credentials", "true")
				w.Header().Set("Vary", "Origin")
			}
			w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS")
			w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With, X-Request-ID")
			w.Header().Set("Access-Control-Max-Age", "86400")
		}

		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}

		next.ServeHTTP(w, r)
	})
}

func isLocalhostOrigin(origin string) bool {
	lower := strings.ToLower(origin)
	return strings.HasPrefix(lower, "http://localhost:") ||
		strings.HasPrefix(lower, "http://127.0.0.1:") ||
		strings.HasPrefix(lower, "https://localhost:") ||
		strings.HasPrefix(lower, "https://127.0.0.1:")
}

// CSWSHOriginChecker validates the Origin header during WebSocket handshakes to prevent CSWSH.
func CSWSHOriginChecker(allowedOrigins []string, isProd bool) func(r *http.Request) bool {
	allowAll := false
	originSet := make(map[string]bool)
	for _, o := range allowedOrigins {
		if o == "*" {
			allowAll = true
		}
		originSet[strings.ToLower(o)] = true
	}

	return func(r *http.Request) bool {
		origin := r.Header.Get("Origin")
		if origin == "" {
			// Non-browser clients (e.g. backend workers or CLI tools) may omit Origin
			return true
		}

		if allowAll && !isProd {
			return true
		}

		normalized := strings.ToLower(origin)
		if originSet[normalized] {
			return true
		}

		if !isProd && isLocalhostOrigin(origin) {
			return true
		}

		return false
	}
}

// RequestBodyLimitMiddleware protects endpoints from resource exhaustion via excessive payloads.
func RequestBodyLimitMiddleware(maxStandard, maxThumbnail int64, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Body == nil || r.Method == http.MethodGet || r.Method == http.MethodHead || r.Method == http.MethodOptions {
			next.ServeHTTP(w, r)
			return
		}

		limit := maxStandard
		if strings.Contains(r.URL.Path, "/thumbnail") {
			limit = maxThumbnail
		}

		r.Body = http.MaxBytesReader(w, r.Body, limit)
		next.ServeHTTP(w, r)
	})
}

// SlidingWindowRateLimiter tracks per-IP request rates.
type SlidingWindowRateLimiter struct {
	mu           sync.Mutex
	requests     map[string][]time.Time
	limitPerMin  int
	window       time.Duration
	lastCleaned  time.Time
}

func NewSlidingWindowRateLimiter(limitPerMin int) *SlidingWindowRateLimiter {
	return &SlidingWindowRateLimiter{
		requests:    make(map[string][]time.Time),
		limitPerMin: limitPerMin,
		window:      time.Minute,
		lastCleaned: time.Now(),
	}
}

func (rl *SlidingWindowRateLimiter) Allow(ip string) (bool, time.Duration) {
	rl.mu.Lock()
	defer rl.mu.Unlock()

	now := time.Now()
	if now.Sub(rl.lastCleaned) > 2*time.Minute {
		rl.cleanupLocked(now)
	}

	cutoff := now.Add(-rl.window)
	timestamps := rl.requests[ip]

	// Filter out expired timestamps
	valid := make([]time.Time, 0, len(timestamps))
	for _, t := range timestamps {
		if t.After(cutoff) {
			valid = append(valid, t)
		}
	}

	if len(valid) >= rl.limitPerMin {
		oldest := valid[0]
		retryAfter := rl.window - now.Sub(oldest)
		if retryAfter <= 0 {
			retryAfter = time.Second
		}
		rl.requests[ip] = valid
		return false, retryAfter
	}

	valid = append(valid, now)
	rl.requests[ip] = valid
	return true, 0
}

func (rl *SlidingWindowRateLimiter) cleanupLocked(now time.Time) {
	cutoff := now.Add(-rl.window)
	for ip, list := range rl.requests {
		var active []time.Time
		for _, t := range list {
			if t.After(cutoff) {
				active = append(active, t)
			}
		}
		if len(active) == 0 {
			delete(rl.requests, ip)
		} else {
			rl.requests[ip] = active
		}
	}
	rl.lastCleaned = now
}

// RateLimitMiddleware provides endpoint-specific sliding window rate limits based on client IP.
func RateLimitMiddleware(authLimiter, aiLimiter, generalLimiter *SlidingWindowRateLimiter, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		ip := getClientIP(r)
		path := r.URL.Path

		var limiter *SlidingWindowRateLimiter
		if strings.HasPrefix(path, "/api/auth/login") || strings.HasPrefix(path, "/api/auth/register") {
			limiter = authLimiter
		} else if strings.Contains(path, "/ai/") {
			limiter = aiLimiter
		} else if strings.HasPrefix(path, "/api/") {
			limiter = generalLimiter
		}

		if limiter != nil {
			allowed, retryAfter := limiter.Allow(ip)
			if !allowed {
				retrySec := int(retryAfter.Seconds())
				if retrySec <= 0 {
					retrySec = 1
				}
				w.Header().Set("Retry-After", strconv.Itoa(retrySec))
				w.Header().Set("Content-Type", "application/json")
				w.WriteHeader(http.StatusTooManyRequests)
				_ = json.NewEncoder(w).Encode(map[string]interface{}{
					"success":    false,
					"error":      "Too many requests. Please slow down and try again.",
					"retryAfter": retrySec,
				})
				return
			}
		}

		next.ServeHTTP(w, r)
	})
}

func getClientIP(r *http.Request) string {
	// Check X-Forwarded-For header first (used by reverse proxies and load balancers)
	if xff := r.Header.Get("X-Forwarded-For"); xff != "" {
		ips := strings.Split(xff, ",")
		first := strings.TrimSpace(ips[0])
		if first != "" {
			return first
		}
	}

	if xri := r.Header.Get("X-Real-IP"); xri != "" {
		return strings.TrimSpace(xri)
	}

	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err == nil && host != "" {
		return host
	}
	return r.RemoteAddr
}

// RedactSensitiveURL removes credentials, JWTs, and keys from logged query strings.
func RedactSensitiveURL(rawURL string) string {
	sensitiveKeys := []string{"token", "ticket", "password", "secret", "apiKey", "key", "access_token"}
	parts := strings.SplitN(rawURL, "?", 2)
	if len(parts) < 2 {
		return rawURL
	}

	queryParts := strings.Split(parts[1], "&")
	for i, q := range queryParts {
		kv := strings.SplitN(q, "=", 2)
		for _, s := range sensitiveKeys {
			if strings.EqualFold(kv[0], s) {
				if len(kv) == 2 {
					queryParts[i] = kv[0] + "=[REDACTED]"
				}
				break
			}
		}
	}

	return parts[0] + "?" + strings.Join(queryParts, "&")
}

type statusCapturingResponseWriter struct {
	http.ResponseWriter
	statusCode int
}

func (w *statusCapturingResponseWriter) WriteHeader(code int) {
	w.statusCode = code
	w.ResponseWriter.WriteHeader(code)
}

func (w *statusCapturingResponseWriter) Hijack() (net.Conn, *bufio.ReadWriter, error) {
	if hj, ok := w.ResponseWriter.(http.Hijacker); ok {
		return hj.Hijack()
	}
	return nil, nil, errors.New("underlying ResponseWriter does not implement http.Hijacker")
}

func (w *statusCapturingResponseWriter) Flush() {
	if fl, ok := w.ResponseWriter.(http.Flusher); ok {
		fl.Flush()
	}
}

func (w *statusCapturingResponseWriter) Unwrap() http.ResponseWriter {
	return w.ResponseWriter
}

// StructuredLoggingMiddleware logs request metadata with sensitive fields automatically redacted.
func StructuredLoggingMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()

		reqID := r.Header.Get("X-Request-ID")
		if reqID == "" {
			reqID = fmt.Sprintf("req-%d", time.Now().UnixNano())
		}
		w.Header().Set("X-Request-ID", reqID)

		// Don't log health probe noise
		if r.URL.Path == "/health" || r.URL.Path == "/healthz" || r.URL.Path == "/readyz" {
			next.ServeHTTP(w, r)
			return
		}

		wrapped := &statusCapturingResponseWriter{
			ResponseWriter: w,
			statusCode:     http.StatusOK,
		}

		next.ServeHTTP(wrapped, r)

		duration := time.Since(start)
		sanitizedURL := RedactSensitiveURL(r.URL.RequestURI())
		clientIP := getClientIP(r)

		log.Printf("[HTTP] id=%s ip=%s method=%s uri=%s status=%d duration=%v",
			reqID, clientIP, r.Method, sanitizedURL, wrapped.statusCode, duration)
	})
}
