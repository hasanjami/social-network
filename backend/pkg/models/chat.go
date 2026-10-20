package models

import "time"

type ChatMessage struct {
	ID         int       `json:"id"`
	SenderID   int       `json:"senderId"`
	ReceiverID *int      `json:"receiverId,omitempty"`
	GroupID    *int      `json:"groupId,omitempty"`
	Content    string    `json:"content"`
	CreatedAt  time.Time `json:"createdAt"`
}
