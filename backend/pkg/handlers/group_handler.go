package handlers

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"strconv"
	"strings"
	"time"

	"backend/pkg/db/repository"
	"backend/pkg/models"
	"backend/pkg/ws"
)

type GroupHandler struct {
	groupRepo        *repository.GroupRepository
	userRepo         *repository.UserRepository
	notificationRepo *repository.NotificationRepository
	hub              *ws.Hub
}

func NewGroupHandler(groupRepo *repository.GroupRepository, userRepo *repository.UserRepository, notificationRepo *repository.NotificationRepository, hub *ws.Hub) *GroupHandler {
	return &GroupHandler{
		groupRepo:        groupRepo,
		userRepo:         userRepo,
		notificationRepo: notificationRepo,
		hub:              hub,
	}
}

func decodeOptionalUserID(r *http.Request) (*int, error) {
	if r.Body == nil {
		return nil, nil
	}

	var req struct {
		UserID *int `json:"userId"`
	}
	decoder := json.NewDecoder(r.Body)
	if err := decoder.Decode(&req); err != nil {
		if err == io.EOF {
			return nil, nil
		}
		return nil, err
	}
	return req.UserID, nil
}

func (h *GroupHandler) resolvePendingGroupActionTarget(group *models.Group, actorUserID int, requestedTargetUserID *int) (int, string, error) {
	targetUserID := actorUserID
	if requestedTargetUserID != nil {
		if *requestedTargetUserID <= 0 {
			return 0, "", errors.New("invalid_user_id")
		}
		targetUserID = *requestedTargetUserID
	}

	isMember, status, requestType, err := h.groupRepo.IsMember(group.ID, targetUserID)
	if err != nil {
		return 0, "", err
	}
	if !isMember || status != "pending" {
		return 0, "", errors.New("no_pending_request")
	}

	switch requestType {
	case "invitation":
		if targetUserID != actorUserID {
			return 0, "", errors.New("forbidden_invitation")
		}
	case "join_request":
		if group.CreatorID != actorUserID {
			return 0, "", errors.New("forbidden_join_request")
		}
	default:
		return 0, "", errors.New("invalid_request_type")
	}

	return targetUserID, requestType, nil
}

func (h *GroupHandler) notifyGroupResolution(group *models.Group, pending *models.GroupMember, actorUserID, targetUserID int, accepted bool) {
	if group == nil || pending == nil {
		return
	}
	actor, _ := h.userRepo.FindByID(actorUserID)
	actorName := "Someone"
	if actor != nil && actor.Username != "" {
		actorName = actor.Username
	}
	gname := group.Name

	switch pending.RequestType {
	case "invitation":
		recipientID := pending.InviterID
		if accepted {
			_ = h.notificationRepo.Create(recipientID, actorUserID, group.ID, "group_invitation_accepted",
				fmt.Sprintf("%s accepted your invitation to %s", actorName, gname))
		} else {
			_ = h.notificationRepo.Create(recipientID, actorUserID, group.ID, "group_invitation_declined",
				fmt.Sprintf("%s declined your invitation to %s", actorName, gname))
		}
	case "join_request":
		recipientID := targetUserID
		if accepted {
			_ = h.notificationRepo.Create(recipientID, actorUserID, group.ID, "group_join_accepted",
				fmt.Sprintf("%s accepted your join request for %s", actorName, gname))
		} else {
			_ = h.notificationRepo.Create(recipientID, actorUserID, group.ID, "group_join_declined",
				fmt.Sprintf("%s declined your join request for %s", actorName, gname))
		}
	}
}

// CreateGroupHandler handles POST /api/groups
// Requires authenticated user (creator)
func (h *GroupHandler) CreateGroupHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	userID := getUserIDFromContext(r)
	if userID == 0 {
		sendUnauthorized(w)
		return
	}

	var req models.CreateGroupRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid JSON body", http.StatusBadRequest)
		return
	}

	req.Name = strings.TrimSpace(req.Name)
	req.Description = strings.TrimSpace(req.Description)

	if req.Name == "" {
		http.Error(w, "Group name is required", http.StatusBadRequest)
		return
	}

	privacy := strings.TrimSpace(strings.ToLower(req.Privacy))
	if privacy == "" {
		privacy = "public"
	}
	if privacy != "public" && privacy != "private" {
		http.Error(w, "privacy must be public or private", http.StatusBadRequest)
		return
	}

	now := time.Now()
	group := &models.Group{
		Name:      req.Name,
		CreatorID: userID,
		Privacy:   privacy,
		CreatedAt: now,
	}

	// Optional description
	if req.Description != "" {
		desc := req.Description
		group.Description = &desc
	}

	id, err := h.groupRepo.Create(group)
	if err != nil {
		log.Printf("Error creating group: %v", err)
		http.Error(w, "Failed to create group", http.StatusInternalServerError)
		return
	}

	group.ID = id

	// Also add creator as accepted member
	member := &models.GroupMember{
		GroupID:     id,
		UserID:      userID,
		InviterID:   userID,
		Status:      "accepted",
		RequestType: "join_request",
		CreatedAt:   now,
	}

	if err := h.groupRepo.AddMember(member); err != nil {
		log.Printf("Error adding creator as group member: %v", err)
		// Keep the request successful, but log the error.
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
		"group":   group,
	})
}

// GetGroupHandler handles GET /api/groups/{id}
func (h *GroupHandler) GetGroupHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// Expect path like /api/groups/123
	parts := strings.Split(strings.Trim(r.URL.Path, "/"), "/")
	if len(parts) < 3 {
		http.Error(w, "Group ID is required", http.StatusBadRequest)
		return
	}

	idStr := parts[2]
	groupID, err := strconv.Atoi(idStr)
	if err != nil || groupID <= 0 {
		http.Error(w, "Invalid group ID", http.StatusBadRequest)
		return
	}

	group, err := h.groupRepo.FindByID(groupID)
	if err != nil {
		log.Printf("Error fetching group %d: %v", groupID, err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}

	if group == nil {
		w.WriteHeader(http.StatusNotFound)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"success": false,
			"error":   "Group not found",
		})
		return
	}

	// Build details
	memberCount, _ := h.groupRepo.CountMembers(groupID)

	var creator *models.SafeUser
	if creatorUser, err := h.userRepo.FindByID(group.CreatorID); err == nil && creatorUser != nil {
		creator = creatorUser.Safe()
	}

	userID := getUserIDFromContext(r)
	isMember, status, _, _ := h.groupRepo.IsMember(groupID, userID)
	isCreator := userID != 0 && userID == group.CreatorID

	var memberStatus *string
	if status != "" {
		memberStatus = &status
	}

	details := &models.GroupWithDetails{
		Group:        group,
		MemberCount:  memberCount,
		Creator:      creator,
		IsMember:     isMember,
		IsCreator:    isCreator,
		MemberStatus: memberStatus,
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
		"group":   details,
	})
}

// GetGroupsHandler handles GET /api/groups
// Supports optional ?limit=&offset=&q=
func (h *GroupHandler) GetGroupsHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	query := strings.TrimSpace(r.URL.Query().Get("q"))
	limit := 20
	offset := 0

	if limitStr := r.URL.Query().Get("limit"); limitStr != "" {
		if l, err := strconv.Atoi(limitStr); err == nil && l > 0 {
			limit = l
		}
	}

	if offsetStr := r.URL.Query().Get("offset"); offsetStr != "" {
		if o, err := strconv.Atoi(offsetStr); err == nil && o >= 0 {
			offset = o
		}
	}

	var groups []*models.Group
	var err error

	if query != "" {
		groups, err = h.groupRepo.SearchByName(query, limit)
	} else {
		groups, err = h.groupRepo.GetAll(limit, offset)
	}

	if err != nil {
		log.Printf("Error fetching groups: %v", err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}

	userID := getUserIDFromContext(r)
	items := make([]models.GroupListItem, 0, len(groups))
	for _, g := range groups {
		if g == nil {
			continue
		}
		isMember, st, _, _ := h.groupRepo.IsMember(g.ID, userID)
		var ms *string
		if isMember && st != "" {
			ms = &st
		}
		items = append(items, models.GroupListItem{
			Group:        *g,
			IsMember:     isMember,
			MemberStatus: ms,
		})
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
		"groups":  items,
	})
}

// UpdateGroupHandler handles PUT /api/groups/{id}
// Only the creator can update the group
func (h *GroupHandler) UpdateGroupHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPut && r.Method != http.MethodPatch {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	userID := getUserIDFromContext(r)
	if userID == 0 {
		sendUnauthorized(w)
		return
	}

	parts := strings.Split(strings.Trim(r.URL.Path, "/"), "/")
	if len(parts) < 3 {
		http.Error(w, "Group ID is required", http.StatusBadRequest)
		return
	}

	idStr := parts[2]
	groupID, err := strconv.Atoi(idStr)
	if err != nil || groupID <= 0 {
		http.Error(w, "Invalid group ID", http.StatusBadRequest)
		return
	}

	group, err := h.groupRepo.FindByID(groupID)
	if err != nil {
		log.Printf("Error fetching group %d: %v", groupID, err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}
	if group == nil {
		http.Error(w, "Group not found", http.StatusNotFound)
		return
	}

	if group.CreatorID != userID {
		http.Error(w, "Only the group creator can update this group", http.StatusForbidden)
		return
	}

	var req models.UpdateGroupRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid JSON body", http.StatusBadRequest)
		return
	}

	if strings.TrimSpace(req.Name) != "" {
		group.Name = strings.TrimSpace(req.Name)
	}

	desc := strings.TrimSpace(req.Description)
	if desc != "" {
		group.Description = &desc
	}

	if p := strings.TrimSpace(strings.ToLower(req.Privacy)); p != "" {
		if p != "public" && p != "private" {
			http.Error(w, "privacy must be public or private", http.StatusBadRequest)
			return
		}
		group.Privacy = p
	}

	if err := h.groupRepo.Update(group); err != nil {
		log.Printf("Error updating group %d: %v", groupID, err)
		http.Error(w, "Failed to update group", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
		"group":   group,
	})
}

// DeleteGroupHandler handles DELETE /api/groups/{id}
// Only the creator can delete the group
func (h *GroupHandler) DeleteGroupHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodDelete {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	userID := getUserIDFromContext(r)
	if userID == 0 {
		sendUnauthorized(w)
		return
	}

	parts := strings.Split(strings.Trim(r.URL.Path, "/"), "/")
	if len(parts) < 3 {
		http.Error(w, "Group ID is required", http.StatusBadRequest)
		return
	}

	idStr := parts[2]
	groupID, err := strconv.Atoi(idStr)
	if err != nil || groupID <= 0 {
		http.Error(w, "Invalid group ID", http.StatusBadRequest)
		return
	}

	group, err := h.groupRepo.FindByID(groupID)
	if err != nil {
		log.Printf("Error fetching group %d: %v", groupID, err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}
	if group == nil {
		http.Error(w, "Group not found", http.StatusNotFound)
		return
	}

	if group.CreatorID != userID {
		http.Error(w, "Only the group creator can delete this group", http.StatusForbidden)
		return
	}

	if err := h.groupRepo.Delete(groupID); err != nil {
		log.Printf("Error deleting group %d: %v", groupID, err)
		http.Error(w, "Failed to delete group", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
		"message": "Group deleted successfully",
	})
}

// JoinGroupHandler handles POST /api/groups/{id}/join
func (h *GroupHandler) JoinGroupHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	userID := getUserIDFromContext(r)
	if userID == 0 {
		sendUnauthorized(w)
		return
	}

	parts := strings.Split(strings.Trim(r.URL.Path, "/"), "/")
	// expect /api/groups/{id}/join -> ["api","groups","{id}","join"]
	if len(parts) < 4 {
		http.Error(w, "Group ID is required", http.StatusBadRequest)
		return
	}

	idStr := parts[2]
	groupID, err := strconv.Atoi(idStr)
	if err != nil || groupID <= 0 {
		http.Error(w, "Invalid group ID", http.StatusBadRequest)
		return
	}

	group, err := h.groupRepo.FindByID(groupID)
	if err != nil {
		log.Printf("Error fetching group %d: %v", groupID, err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}
	if group == nil {
		http.Error(w, "Group not found", http.StatusNotFound)
		return
	}

	if userID == group.CreatorID {
		http.Error(w, "Group creators cannot submit a join request; you are already a member as the creator", http.StatusBadRequest)
		return
	}

	if group.Privacy == "private" {
		http.Error(w, "This group is private; open join is not available. Ask the creator for an invitation.", http.StatusForbidden)
		return
	}

	// Check existing membership
	isMember, status, _, err := h.groupRepo.IsMember(groupID, userID)
	if err != nil {
		log.Printf("Error checking membership: %v", err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}

	if isMember {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"success":       true,
			"alreadyMember": true,
			"status":        status,
		})
		return
	}

	member := &models.GroupMember{
		GroupID:     groupID,
		UserID:      userID,
		InviterID:   userID,
		Status:      "pending",
		RequestType: "join_request",
		CreatedAt:   time.Now(),
	}

	if err := h.groupRepo.AddMember(member); err != nil {
		log.Printf("Error adding member to group: %v", err)
		http.Error(w, "Failed to join group", http.StatusInternalServerError)
		return
	}

	sender, _ := h.userRepo.FindByID(userID)
	if group != nil && sender != nil {
		msg := sender.Username + " requested to join " + group.Name
		h.notificationRepo.Create(group.CreatorID, userID, groupID, "group_join_request", msg)

		wsData, _ := json.Marshal(map[string]interface{}{
			"type":     "group_join_request",
			"senderId": userID,
			"groupId":  groupID,
			"message":  msg,
		})
		h.hub.SendToUser(group.CreatorID, wsData)
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
		"status":  "pending",
	})
}

// LeaveGroupHandler handles POST /api/groups/{id}/leave
func (h *GroupHandler) LeaveGroupHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	userID := getUserIDFromContext(r)
	if userID == 0 {
		sendUnauthorized(w)
		return
	}

	parts := strings.Split(strings.Trim(r.URL.Path, "/"), "/")
	// expect /api/groups/{id}/leave
	if len(parts) < 4 {
		http.Error(w, "Group ID is required", http.StatusBadRequest)
		return
	}

	idStr := parts[2]
	groupID, err := strconv.Atoi(idStr)
	if err != nil || groupID <= 0 {
		http.Error(w, "Invalid group ID", http.StatusBadRequest)
		return
	}

	group, err := h.groupRepo.FindByID(groupID)
	if err != nil {
		log.Printf("Error fetching group %d: %v", groupID, err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}
	if group == nil {
		http.Error(w, "Group not found", http.StatusNotFound)
		return
	}

	// Creator cannot leave their own group (must delete instead)
	if group.CreatorID == userID {
		http.Error(w, "Group creator cannot leave the group", http.StatusBadRequest)
		return
	}

	if err := h.groupRepo.RemoveMember(groupID, userID); err != nil {
		log.Printf("Error removing member from group: %v", err)
		http.Error(w, "Failed to leave group", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
		"message": "Left group successfully",
	})
}

// InviteToGroupHandler handles POST /api/groups/{id}/invite
// Body: { "userId": number }
func (h *GroupHandler) InviteToGroupHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	inviterID := getUserIDFromContext(r)
	if inviterID == 0 {
		sendUnauthorized(w)
		return
	}

	parts := strings.Split(strings.Trim(r.URL.Path, "/"), "/")
	// expect /api/groups/{id}/invite
	if len(parts) < 4 {
		http.Error(w, "Group ID is required", http.StatusBadRequest)
		return
	}

	idStr := parts[2]
	groupID, err := strconv.Atoi(idStr)
	if err != nil || groupID <= 0 {
		http.Error(w, "Invalid group ID", http.StatusBadRequest)
		return
	}

	group, err := h.groupRepo.FindByID(groupID)
	if err != nil {
		log.Printf("Error fetching group %d: %v", groupID, err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}
	if group == nil {
		http.Error(w, "Group not found", http.StatusNotFound)
		return
	}

	// Only creator or existing member can invite
	isMember, _, _, err := h.groupRepo.IsMember(groupID, inviterID)
	if err != nil {
		log.Printf("Error checking inviter membership: %v", err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}
	if !isMember && group.CreatorID != inviterID {
		http.Error(w, "Only group members can invite others", http.StatusForbidden)
		return
	}

	var req models.InviteToGroupRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid JSON body", http.StatusBadRequest)
		return
	}

	if req.UserID <= 0 {
		http.Error(w, "userId must be a positive integer", http.StatusBadRequest)
		return
	}

	if req.UserID == inviterID {
		http.Error(w, "You cannot invite yourself to a group", http.StatusBadRequest)
		return
	}

	// Check if target user already member
	isMember, status, _, err := h.groupRepo.IsMember(groupID, req.UserID)
	if err != nil {
		log.Printf("Error checking target membership: %v", err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}
	if isMember {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"success": true,
			"message": "User already in group",
			"status":  status,
		})
		return
	}

	member := &models.GroupMember{
		GroupID:     groupID,
		UserID:      req.UserID,
		InviterID:   inviterID,
		Status:      "pending",
		RequestType: "invitation",
		CreatedAt:   time.Now(),
	}

	if err := h.groupRepo.AddMember(member); err != nil {
		log.Printf("Error inviting user to group: %v", err)
		http.Error(w, "Failed to invite user", http.StatusInternalServerError)
		return
	}

	inviter, _ := h.userRepo.FindByID(inviterID)
	if inviter != nil && group != nil {
		msg := inviter.Username + " invited you to " + group.Name
		h.notificationRepo.Create(req.UserID, inviterID, groupID, "group_invitation", msg)

		wsData, _ := json.Marshal(map[string]interface{}{
			"type":     "group_invitation",
			"senderId": inviterID,
			"groupId":  groupID,
			"message":  msg,
		})
		h.hub.SendToUser(req.UserID, wsData)
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
		"message": "User invited successfully",
	})
}

// AcceptInviteHandler handles POST /api/groups/{id}/accept
// - invitation: accepted by invited user (self)
// - join_request: accepted by group creator using { "userId": <requester> }
func (h *GroupHandler) AcceptInviteHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	userID := getUserIDFromContext(r)
	if userID == 0 {
		sendUnauthorized(w)
		return
	}

	parts := strings.Split(strings.Trim(r.URL.Path, "/"), "/")
	// expect /api/groups/{id}/accept
	if len(parts) < 4 {
		http.Error(w, "Group ID is required", http.StatusBadRequest)
		return
	}

	idStr := parts[2]
	groupID, err := strconv.Atoi(idStr)
	if err != nil || groupID <= 0 {
		http.Error(w, "Invalid group ID", http.StatusBadRequest)
		return
	}

	group, err := h.groupRepo.FindByID(groupID)
	if err != nil {
		log.Printf("Error fetching group %d: %v", groupID, err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}
	if group == nil {
		http.Error(w, "Group not found", http.StatusNotFound)
		return
	}

	requestedTargetUserID, err := decodeOptionalUserID(r)
	if err != nil {
		http.Error(w, "Invalid JSON body", http.StatusBadRequest)
		return
	}

	targetUserID, requestType, err := h.resolvePendingGroupActionTarget(group, userID, requestedTargetUserID)
	if err != nil {
		switch err.Error() {
		case "invalid_user_id":
			http.Error(w, "userId must be greater than zero", http.StatusBadRequest)
		case "no_pending_request":
			http.Error(w, "No pending invitation or request", http.StatusBadRequest)
		case "forbidden_invitation":
			http.Error(w, "Only invited user can accept this invitation", http.StatusForbidden)
		case "forbidden_join_request":
			http.Error(w, "Only group creator can accept join requests", http.StatusForbidden)
		case "invalid_request_type":
			http.Error(w, "Invalid request type", http.StatusBadRequest)
		default:
			log.Printf("Error resolving pending group action target: %v", err)
			http.Error(w, "Internal server error", http.StatusInternalServerError)
		}
		return
	}

	pendingMember, err := h.groupRepo.GetMember(groupID, targetUserID)
	if err != nil {
		log.Printf("Error loading pending member: %v", err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}
	if pendingMember == nil {
		http.Error(w, "No pending invitation or request", http.StatusBadRequest)
		return
	}

	if err := h.groupRepo.UpdateMemberStatus(groupID, targetUserID, "accepted"); err != nil {
		log.Printf("Error accepting invite: %v", err)
		http.Error(w, "Failed to accept invite", http.StatusInternalServerError)
		return
	}

	h.notifyGroupResolution(group, pendingMember, userID, targetUserID, true)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"success":     true,
		"status":      "accepted",
		"userId":      targetUserID,
		"requestType": requestType,
	})
}

// DeclineInviteHandler handles POST /api/groups/{id}/decline
// - invitation: declined by invited user (self)
// - join_request: declined by group creator using { "userId": <requester> }
func (h *GroupHandler) DeclineInviteHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	requesterID := getUserIDFromContext(r)
	if requesterID == 0 {
		sendUnauthorized(w)
		return
	}

	parts := strings.Split(strings.Trim(r.URL.Path, "/"), "/")
	// expect /api/groups/{id}/decline
	if len(parts) < 4 {
		http.Error(w, "Group ID is required", http.StatusBadRequest)
		return
	}

	idStr := parts[2]
	groupID, err := strconv.Atoi(idStr)
	if err != nil || groupID <= 0 {
		http.Error(w, "Invalid group ID", http.StatusBadRequest)
		return
	}

	group, err := h.groupRepo.FindByID(groupID)
	if err != nil {
		log.Printf("Error fetching group %d: %v", groupID, err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}
	if group == nil {
		http.Error(w, "Group not found", http.StatusNotFound)
		return
	}

	requestedTargetUserID, err := decodeOptionalUserID(r)
	if err != nil {
		http.Error(w, "Invalid JSON body", http.StatusBadRequest)
		return
	}

	targetUserID, requestType, err := h.resolvePendingGroupActionTarget(group, requesterID, requestedTargetUserID)
	if err != nil {
		switch err.Error() {
		case "invalid_user_id":
			http.Error(w, "userId must be greater than zero", http.StatusBadRequest)
		case "no_pending_request":
			http.Error(w, "No pending invitation or request", http.StatusBadRequest)
		case "forbidden_invitation":
			http.Error(w, "Only invited user can decline this invitation", http.StatusForbidden)
		case "forbidden_join_request":
			http.Error(w, "Only group creator can decline join requests", http.StatusForbidden)
		case "invalid_request_type":
			http.Error(w, "Invalid request type", http.StatusBadRequest)
		default:
			log.Printf("Error resolving pending group action target: %v", err)
			http.Error(w, "Internal server error", http.StatusInternalServerError)
		}
		return
	}

	pendingMember, err := h.groupRepo.GetMember(groupID, targetUserID)
	if err != nil {
		log.Printf("Error loading pending member: %v", err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}
	if pendingMember == nil {
		http.Error(w, "No pending invitation or request", http.StatusBadRequest)
		return
	}

	if err := h.groupRepo.RemoveMember(groupID, targetUserID); err != nil {
		log.Printf("Error declining invite/request: %v", err)
		http.Error(w, "Failed to decline invitation/request", http.StatusInternalServerError)
		return
	}

	h.notifyGroupResolution(group, pendingMember, requesterID, targetUserID, false)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"success":     true,
		"status":      "declined",
		"userId":      targetUserID,
		"requestType": requestType,
	})
}

// GetGroupMembersHandler handles GET /api/groups/{id}/members
// Optional query ?status=pending|accepted
func (h *GroupHandler) GetGroupMembersHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	userID := getUserIDFromContext(r)
	if userID == 0 {
		sendUnauthorized(w)
		return
	}

	parts := strings.Split(strings.Trim(r.URL.Path, "/"), "/")
	// expect /api/groups/{id}/members
	if len(parts) < 4 {
		http.Error(w, "Group ID is required", http.StatusBadRequest)
		return
	}

	idStr := parts[2]
	groupID, err := strconv.Atoi(idStr)
	if err != nil || groupID <= 0 {
		http.Error(w, "Invalid group ID", http.StatusBadRequest)
		return
	}

	// Ensure requester is at least a member
	isMember, _, _, err := h.groupRepo.IsMember(groupID, userID)
	if err != nil {
		log.Printf("Error checking requester membership: %v", err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}
	if !isMember {
		http.Error(w, "Only group members can view members list", http.StatusForbidden)
		return
	}

	status := strings.TrimSpace(r.URL.Query().Get("status"))
	if status != "" && status != "pending" && status != "accepted" {
		http.Error(w, "Invalid status filter", http.StatusBadRequest)
		return
	}

	members, err := h.groupRepo.GetMembers(groupID, status)
	if err != nil {
		log.Printf("Error fetching group members: %v", err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
		"members": members,
	})
}

// GetUserGroupsHandler handles GET /api/user/groups
// Returns groups the current user belongs to (optionally filtered by status)
func (h *GroupHandler) GetUserGroupsHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	userID := getUserIDFromContext(r)
	if userID == 0 {
		sendUnauthorized(w)
		return
	}

	status := strings.TrimSpace(r.URL.Query().Get("status"))
	if status != "" && status != "pending" && status != "accepted" {
		http.Error(w, "Invalid status filter", http.StatusBadRequest)
		return
	}

	groups, err := h.groupRepo.GetUserGroups(userID, status)
	if err != nil {
		log.Printf("Error fetching user groups: %v", err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
		"groups":  groups,
	})
}
