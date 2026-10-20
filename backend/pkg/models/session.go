// backend/pkg/models/session.go
package models

import (
	"time"
)

type Session struct {
	ID        string    `json:"id" db:"id"`
	UserID    int       `json:"userId" db:"user_id"`
	CreatedAt time.Time `json:"createdAt" db:"created_at"`
	ExpiresAt time.Time `json:"expiresAt" db:"expires_at"`
}