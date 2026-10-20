package models

import "time"

type Follower struct {
	ID         int       `json:"id"`
	FollowerID int       `json:"followerId"`
	FollowedID int       `json:"followedId"`
	Status     string    `json:"status"`
	CreatedAt  time.Time `json:"createdAt"`
}
