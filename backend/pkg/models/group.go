// backend/pkg/models/group.go
package models

import (
	"time"
)

// Group maps directly to the groups table
type Group struct {
	ID          int       `json:"id" db:"id"`
	Name        string    `json:"name" db:"name"`
	Description *string   `json:"description,omitempty" db:"description"`
	CreatorID   int       `json:"creatorId" db:"creator_id"`
	Image       *string   `json:"image,omitempty" db:"img"`
	Privacy     string    `json:"privacy" db:"privacy"` // "public" | "private"
	CreatedAt   time.Time `json:"createdAt" db:"created_at"`
}

// GroupMember maps directly to the group_members table
type GroupMember struct {
	ID          int       `json:"id" db:"id"`
	GroupID     int       `json:"groupId" db:"group_id"`
	UserID      int       `json:"userId" db:"user_id"`
	InviterID   int       `json:"inviterId" db:"inviter_id"`
	Status      string    `json:"status" db:"status"`            // "pending" or "accepted"
	RequestType string    `json:"requestType" db:"request_type"` // "invitation" or "join_request"
	CreatedAt   time.Time `json:"createdAt" db:"created_at"`
}

// GroupListItem is one row in GET /api/groups (browse); includes viewer membership for UI.
type GroupListItem struct {
	Group
	IsMember     bool    `json:"isMember"`
	MemberStatus *string `json:"memberStatus,omitempty"`
}

// GroupWithDetails includes group info with member count and creator info
type GroupWithDetails struct {
	*Group
	MemberCount  int       `json:"memberCount"`
	Creator      *SafeUser `json:"creator,omitempty"`
	IsMember     bool      `json:"isMember,omitempty"`
	IsCreator    bool      `json:"isCreator,omitempty"`
	MemberStatus *string   `json:"memberStatus,omitempty"` // "pending", "accepted", or nil
}

// Request/Response types for Groups API

// CreateGroupRequest used when creating a new group
type CreateGroupRequest struct {
	Name        string `json:"name" validate:"required,min=3,max=100"`
	Description string `json:"description,omitempty" validate:"max=500"`
	Privacy     string `json:"privacy,omitempty"` // "public" (default) or "private"
	Image       []byte `json:"-"`                   // for file uploads
}

// UpdateGroupRequest used when updating group details
type UpdateGroupRequest struct {
	Name        string `json:"name,omitempty" validate:"min=3,max=100"`
	Description string `json:"description,omitempty" validate:"max=500"`
	Privacy     string `json:"privacy,omitempty"` // "public" or "private"
	Image       []byte `json:"-"`                 // for file uploads
}

// JoinGroupRequest used when a user wants to join a group
type JoinGroupRequest struct {
	GroupID int `json:"groupId" validate:"required"`
}

// InviteToGroupRequest used when inviting a user to a group
type InviteToGroupRequest struct {
	GroupID int `json:"groupId" validate:"required"`
	UserID  int `json:"userId" validate:"required"`
}

// GroupResponse standard response for group operations
type GroupResponse struct {
	Group   *GroupWithDetails   `json:"group,omitempty"`
	Groups  []*GroupWithDetails `json:"groups,omitempty"`
	Message string              `json:"message,omitempty"`
	Success bool                `json:"success"`
}
