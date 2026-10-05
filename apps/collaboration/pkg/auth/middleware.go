package auth

import (
	"context"
	"encoding/json"
	"net/http"
	"strings"
)

type contextKey string

const (
	UserClaimsContextKey contextKey = "user_claims"
)

// AuthMiddleware inspects incoming requests for Bearer tokens in Authorization header or query param
type AuthMiddleware struct {
	jwtManager *JWTManager
}

func NewAuthMiddleware(jwtManager *JWTManager) *AuthMiddleware {
	return &AuthMiddleware{jwtManager: jwtManager}
}

// ExtractToken retrieves JWT from Authorization header or URL query
func ExtractToken(r *http.Request) string {
	authHeader := r.Header.Get("Authorization")
	if authHeader != "" {
		parts := strings.SplitN(authHeader, " ", 2)
		if len(parts) == 2 && strings.EqualFold(parts[0], "Bearer") {
			return strings.TrimSpace(parts[1])
		}
		return strings.TrimSpace(authHeader)
	}

	// Fallback to URL query parameter (essential for WebSocket upgrade handshake)
	if token := r.URL.Query().Get("token"); token != "" {
		return token
	}

	return ""
}

// Authenticate is middleware that attaches valid user claims to context if token is present
func (m *AuthMiddleware) Authenticate(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		tokenStr := ExtractToken(r)
		if tokenStr != "" {
			claims, err := m.jwtManager.ValidateToken(tokenStr)
			if err == nil {
				ctx := context.WithValue(r.Context(), UserClaimsContextKey, claims)
				r = r.WithContext(ctx)
			}
		}
		next.ServeHTTP(w, r)
	})
}

// RequireAuth enforces that request context contains authenticated user claims
func (m *AuthMiddleware) RequireAuth(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		claims, ok := GetClaimsFromContext(r.Context())
		if !ok || claims == nil {
			tokenStr := ExtractToken(r)
			if tokenStr == "" {
				writeJSONError(w, http.StatusUnauthorized, "Authentication required: missing token")
				return
			}

			var err error
			claims, err = m.jwtManager.ValidateToken(tokenStr)
			if err != nil {
				writeJSONError(w, http.StatusUnauthorized, "Authentication failed: "+err.Error())
				return
			}
			ctx := context.WithValue(r.Context(), UserClaimsContextKey, claims)
			r = r.WithContext(ctx)
		}

		next.ServeHTTP(w, r)
	}
}

// GetClaimsFromContext extracts UserClaims from context
func GetClaimsFromContext(ctx context.Context) (*UserClaims, bool) {
	claims, ok := ctx.Value(UserClaimsContextKey).(*UserClaims)
	return claims, ok && claims != nil
}

// GetUserIDFromContext retrieves the authenticated user's ID
func GetUserIDFromContext(ctx context.Context) (string, bool) {
	claims, ok := GetClaimsFromContext(ctx)
	if !ok || claims == nil {
		return "", false
	}
	return claims.UserID, true
}

func writeJSONError(w http.ResponseWriter, statusCode int, message string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(statusCode)
	_ = json.NewEncoder(w).Encode(map[string]interface{}{
		"error":   message,
		"status":  statusCode,
		"success": false,
	})
}
