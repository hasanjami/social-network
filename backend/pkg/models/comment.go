package models

import "time"

type Comment struct {
	ID        int       `json:"id"`
	PostID    int       `json:"postId"`
	UserID    int       `json:"userId"`
	Content   string    `json:"content"`
	Image     *string   `json:"image,omitempty"`
	CreatedAt time.Time `json:"createdAt"`
}
