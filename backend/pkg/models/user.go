// backend/pkg/models/user.go
package models

import (
	"time"
)

// User maps directly to the users table
type User struct {
	ID          int        `json:"id" db:"id"`
	Username    string     `json:"username" db:"username"`
	Email       string     `json:"email" db:"email"`
	Password    string     `json:"-" db:"password"`           // never expose
	FirstName   string     `json:"firstName" db:"first_name"`
	LastName    string     `json:"lastName" db:"last_name"`
	DateOfBirth time.Time  `json:"dateOfBirth" db:"date_of_birth"`
	Nickname    *string    `json:"nickname,omitempty" db:"nickname"`
	Avatar      *string    `json:"avatar,omitempty"`
	AboutMe     *string    `json:"aboutMe,omitempty" db:"about_me"`
	IsPublic    bool       `json:"isPublic" db:"is_public"`
	CreatedAt   time.Time  `json:"createdAt" db:"created_at"`
}

// SafeUser is returned in API responses (no password)
type SafeUser struct {
	ID          int        `json:"id"`
	Username    string     `json:"username"`
	Email       string     `json:"email"`
	FirstName   string     `json:"firstName"`
	LastName    string     `json:"lastName"`
	DateOfBirth time.Time  `json:"dateOfBirth"`
	Avatar      *string    `json:"avatar,omitempty"`
	Nickname    *string    `json:"nickname,omitempty"`
	AboutMe     *string    `json:"aboutMe,omitempty"`
	IsPublic    bool       `json:"isPublic"`
	CreatedAt   time.Time  `json:"createdAt"`
}

// Safe returns a SafeUser from a User
func (u *User) Safe() *SafeUser {
	var avatarUrl *string = nil
	if u.Avatar != nil && *u.Avatar != "" {
		// Build full URL from filename
		fullUrl := "/uploads/avatars/" + *u.Avatar
		avatarUrl = &fullUrl
	}
	return &SafeUser{
		ID:          u.ID,
		Username:    u.Username,
		Email:       u.Email,
		FirstName:   u.FirstName,
		LastName:    u.LastName,
		DateOfBirth: u.DateOfBirth,
		Avatar:      avatarUrl,
		Nickname:    u.Nickname,
		AboutMe:     u.AboutMe,
		IsPublic:    u.IsPublic,
		CreatedAt:   u.CreatedAt,
	}
}

// UserWithStats adds calculated fields for API responses
type UserWithStats struct {
	*SafeUser
	Following     int `json:"following"`
	Followers     int `json:"followers"`
	PostCount     int `json:"postCount"`
	Notifications int `json:"notifications,omitempty"`
	FollowState   string `json:"followState,omitempty"`
	IsOwner       bool   `json:"isOwner,omitempty"`
}

// Request/Response types
type RegisterRequest struct {
	Username    string `json:"username" validate:"required"`
	Email       string `json:"email" validate:"required,email"`
	Password    string `json:"password" validate:"required,min=6"`
	FirstName   string `json:"firstName" validate:"required"`
	LastName    string `json:"lastName" validate:"required"`
	DateOfBirth string `json:"dateOfBirth" validate:"required"` // format "2006-01-02"
	Nickname    string `json:"nickname,omitempty"`
	AboutMe     string `json:"aboutMe,omitempty"`
	Avatar      []byte `json:"-"` // for file uploads
}

type LoginRequest struct {
	Email    string `json:"email" validate:"required,email"`
	Password string `json:"password" validate:"required"`
}

type LoginResponse struct {
	User  *SafeUser `json:"user"`
	Token string    `json:"token,omitempty"`
}

// FollowRequest used for follow/unfollow actions
type FollowRequest struct {
	FollowerID  int    `json:"followerId"`  // user performing action
	FollowedID  int    `json:"followedId"`  // profile being followed
	ButtonState string `json:"buttonState"` // "follow", "unfollow", "pending"
}

// Add this to user.go (or create profile.go)
type ProfileResponse struct {
	User         *SafeUser `json:"user"`
	Followers    int       `json:"followers"`
	Following    int       `json:"following"`
	PostCount    int       `json:"postCount"`
	IsFollowing  bool      `json:"isFollowing"`
	IsPending    bool      `json:"isPending"`
	IsOwnProfile bool      `json:"isOwnProfile"`
	CanView      bool      `json:"canView"` // For private profiles
}