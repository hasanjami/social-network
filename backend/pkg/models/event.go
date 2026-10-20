package models

import "time"

type Event struct {
	ID          int       `json:"id"`
	GroupID     int       `json:"groupId"`
	CreatorID   int       `json:"creatorId"`
	Title       string    `json:"title"`
	Description *string   `json:"description,omitempty"`
	EventDate   time.Time `json:"eventDate"`
	CreatedAt   time.Time `json:"createdAt"`
}

type EventResponse struct {
	ID        int       `json:"id"`
	EventID   int       `json:"eventId"`
	UserID    int       `json:"userId"`
	Response  string    `json:"response"`
	CreatedAt time.Time `json:"createdAt"`
}
