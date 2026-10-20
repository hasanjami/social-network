package models

import "time"

type Notification struct {
	ID          int       `json:"id"`
	RecipientID int       `json:"recipientId"`
	SenderID    int       `json:"senderId"`
	ObjectID    int       `json:"objectId"`
	Type        string    `json:"type"`
	Content     string    `json:"content"`
	IsRead      bool      `json:"isRead"`
	CreatedAt   time.Time `json:"createdAt"`
}
