package models

import "time"

type Post struct {
	ID        int       `json:"id"`
	UserID    int       `json:"user_id"`
	GroupID   *int      `json:"group_id,omitempty"`
	Title     string    `json:"title"`
	Content   string    `json:"content"`
	Image     *string   `json:"image,omitempty"`
	Privacy   string    `json:"privacy"`
	CreatedAt time.Time `json:"created_at"`
}
