package middleware

import (
	"backend/pkg/db/repository"
	"context"
	"database/sql"
	"encoding/json"
	"net/http"
)

// AppCore - simplified version
type AppCore struct {
	SessionRepo *repository.SessionRepository
}

func NewAppCore(db *sql.DB) *AppCore {
	return &AppCore{
		SessionRepo: repository.NewSessionRepository(db),
	}
}

// AuthMiddleware - basic version
func AuthMiddleware(ac *AppCore, next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		cookie, err := r.Cookie("session_id")
		if err != nil {
			sendUnauthorized(w)
			return
		}

		userID, err := ac.SessionRepo.GetUserIDFromSession(cookie.Value)
		if err != nil || userID == 0 {
			sendUnauthorized(w)
			return
		}

		ctx := context.WithValue(r.Context(), "userID", userID)
		next.ServeHTTP(w, r.WithContext(ctx))
	}
}

// OptionalAuthMiddleware - tries to authenticate but doesn't fail if no session
func OptionalAuthMiddleware(ac *AppCore, next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		cookie, err := r.Cookie("session_id")
		if err == nil {
			// Try to get user ID from session
			userID, err := ac.SessionRepo.GetUserIDFromSession(cookie.Value)
			if err == nil && userID != 0 {
				// Add userID to context
				ctx := context.WithValue(r.Context(), "userID", userID)
				next.ServeHTTP(w, r.WithContext(ctx))
				return
			}
		}

		// No valid session, continue without authentication
		next.ServeHTTP(w, r)
	}
}

// CorsMiddleware - basic version
func CorsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "http://localhost:3000")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
		w.Header().Set("Access-Control-Allow-Credentials", "true")

		if r.Method == "OPTIONS" {
			w.WriteHeader(http.StatusOK)
			return
		}

		next.ServeHTTP(w, r)
	})
}

func sendUnauthorized(w http.ResponseWriter) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusUnauthorized)
	json.NewEncoder(w).Encode(map[string]interface{}{
		"error":   "Unauthorized",
		"success": false,
	})
}
