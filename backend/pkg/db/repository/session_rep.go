// backend/pkg/db/repository/session_repository.go
package repository

import (
	"database/sql"
	"time"
	"crypto/rand"
	"encoding/hex"
	"backend/pkg/models"
)

type SessionRepository struct {
	db *sql.DB
}

func NewSessionRepository(db *sql.DB) *SessionRepository {
	return &SessionRepository{db: db}
}

// CreateSession creates a new session for a user
func (r *SessionRepository) CreateSession(userID int) (string, error) {
	// Generate random session ID
	sessionID := generateSessionID()
	
	// keep session for a week
	expiresAt := time.Now().Add(7 * 24 * time.Hour)
	
	_, err := r.db.Exec(`
		INSERT INTO sessions (id, user_id, expires_at)
		VALUES (?, ?, ?)
	`, sessionID, userID, expiresAt)
	
	return sessionID, err
}

// GetUserIDFromSession returns user ID from session
func (r *SessionRepository) GetUserIDFromSession(sessionID string) (int, error) {
	var userID int
	var expiresAt time.Time
	
	err := r.db.QueryRow(`
		SELECT user_id, expires_at FROM sessions 
		WHERE id = ? AND expires_at > CURRENT_TIMESTAMP
	`, sessionID).Scan(&userID, &expiresAt)
	
	if err != nil {
		if err == sql.ErrNoRows {
			return 0, nil // Session not found or expired
		}
		return 0, err
	}
	
	return userID, nil
}

// GetSessionUser gets full user from session
func (r *SessionRepository) GetSessionUser(sessionID string) (*models.User, error) {
	var user models.User
	var nickname, avatar, aboutMe sql.NullString
	var dateOfBirthStr string
	
	err := r.db.QueryRow(`
		SELECT u.* FROM users u
		JOIN sessions s ON u.id = s.user_id
		WHERE s.id = ? AND s.expires_at > CURRENT_TIMESTAMP
	`, sessionID).Scan(
		&user.ID, &user.Username, &user.Email, &user.Password,
		&user.FirstName, &user.LastName, &dateOfBirthStr,
		&nickname, &avatar, &aboutMe,
		&user.IsPublic, &user.CreatedAt,
	)
	
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, nil
		}
		return nil, err
	}
	
	// Parse date
	user.DateOfBirth, _ = time.Parse("2006-01-02", dateOfBirthStr)
	
	// Handle nullable fields
	if nickname.Valid {
		user.Nickname = &nickname.String
	}
	if avatar.Valid {
		user.Avatar = &avatar.String
	}
	if aboutMe.Valid {
		user.AboutMe = &aboutMe.String
	}
	
	return &user, nil
}

// DeleteSession removes a session
func (r *SessionRepository) DeleteSession(sessionID string) error {
	_, err := r.db.Exec(`DELETE FROM sessions WHERE id = ?`, sessionID)
	return err
}

// RemoveExistingSession removes existing session for user
func (r *SessionRepository) RemoveExistingSession(userID int) error {
	_, err := r.db.Exec(`DELETE FROM sessions WHERE user_id = ?`, userID)
	return err
}

// CleanExpiredSessions removes expired sessions
func (r *SessionRepository) CleanExpiredSessions() error {
	_, err := r.db.Exec(`DELETE FROM sessions WHERE expires_at <= CURRENT_TIMESTAMP`)
	return err
}

// Helper: Generate random session ID
func generateSessionID() string {
	bytes := make([]byte, 32)
	rand.Read(bytes)
	return hex.EncodeToString(bytes)
}