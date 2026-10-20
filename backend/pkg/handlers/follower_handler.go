package handlers

import (
	"encoding/json"
	"log"
	"net/http"
	"strconv"
	"time"

	"backend/pkg/db/repository"
	"backend/pkg/ws"
)

type FollowerHandler struct {
	followerRepo     *repository.FollowerRepository
	userRepo         *repository.UserRepository
	notificationRepo *repository.NotificationRepository
	wsHub            *ws.Hub
}

func NewFollowerHandler(followerRepo *repository.FollowerRepository, userRepo *repository.UserRepository, notificationRepo *repository.NotificationRepository, wsHub *ws.Hub) *FollowerHandler {
	return &FollowerHandler{
		followerRepo:     followerRepo,
		userRepo:         userRepo,
		notificationRepo: notificationRepo,
		wsHub:            wsHub,
	}
}

func (h *FollowerHandler) FollowHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	userID := getUserIDFromContext(r)
	if userID == 0 {
		sendUnauthorized(w)
		return
	}

	var req struct {
		FollowedID int `json:"followedId"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	if req.FollowedID == 0 {
		http.Error(w, "followedId is required", http.StatusBadRequest)
		return
	}

	if req.FollowedID == userID {
		http.Error(w, "You cannot follow yourself", http.StatusBadRequest)
		return
	}

	target, err := h.userRepo.FindByID(req.FollowedID)
	if err != nil {
		log.Printf("Error finding user %d: %v", req.FollowedID, err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}
	if target == nil {
		http.Error(w, "User not found", http.StatusNotFound)
		return
	}

	status, err := h.followerRepo.GetFollowStatus(userID, req.FollowedID)
	if err != nil {
		log.Printf("Error checking follow status: %v", err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}
	if status != "" {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"success": true,
			"status":  status,
			"message": "Already following or pending",
		})
		return
	}

	followStatus := "pending"
	if target.IsPublic {
		followStatus = "accepted"
	}

	if err := h.followerRepo.Follow(userID, req.FollowedID, followStatus); err != nil {
		log.Printf("Error following user: %v", err)
		http.Error(w, "Failed to follow user", http.StatusInternalServerError)
		return
	}

	sender, _ := h.userRepo.FindByID(userID)
	if sender != nil {
		var notificationType string
		var message string

		if followStatus == "pending" {
			notificationType = "follow_request"
			message = sender.Username + " requested to follow you"
		} else {
			notificationType = "follow"
			message = sender.Username + " started following you"
		}

		// Create DB notification
		h.notificationRepo.Create(req.FollowedID, userID, userID, notificationType, message)

		// Get updated follower count for the target user
		updatedFollowerCount, _ := h.followerRepo.CountFollowers(req.FollowedID)

		// Send real-time WebSocket notification
		wsNotification := map[string]interface{}{
			"type":          notificationType,
			"fromUserId":    userID,
			"fromUsername":  sender.Username,
			"message":       message,
			"timestamp":     time.Now().Format(time.RFC3339),
			"followerCount": updatedFollowerCount,
		}
		if data, err := json.Marshal(wsNotification); err == nil {
			h.wsHub.SendToUser(req.FollowedID, data)
		}
	}

	// Get updated counts
	targetFollowerCount, _ := h.followerRepo.CountFollowers(req.FollowedID)
	currentUserFollowingCount, _ := h.followerRepo.CountFollowing(userID)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"success":                   true,
		"status":                    followStatus,
		"targetFollowerCount":       targetFollowerCount,
		"currentUserFollowingCount": currentUserFollowingCount,
	})
}

func (h *FollowerHandler) UnfollowHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	userID := getUserIDFromContext(r)
	if userID == 0 {
		sendUnauthorized(w)
		return
	}

	var req struct {
		FollowedID int `json:"followedId"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	if req.FollowedID == 0 {
		http.Error(w, "followedId is required", http.StatusBadRequest)
		return
	}

	if err := h.followerRepo.Unfollow(userID, req.FollowedID); err != nil {
		log.Printf("Error unfollowing user: %v", err)
		http.Error(w, "Failed to unfollow user", http.StatusInternalServerError)
		return
	}

	h.notificationRepo.Delete(req.FollowedID, userID, "follow_request")
	h.notificationRepo.Delete(req.FollowedID, userID, "follow")

	// Optionally send real-time notification about unfollow
	sender, _ := h.userRepo.FindByID(userID)
	if sender != nil {
		updatedFollowerCount, _ := h.followerRepo.CountFollowers(req.FollowedID)
		wsNotification := map[string]interface{}{
			"type":          "unfollowed",
			"fromUserId":    userID,
			"fromUsername":  sender.Username,
			"timestamp":     time.Now().Format(time.RFC3339),
			"followerCount": updatedFollowerCount,
		}
		if data, err := json.Marshal(wsNotification); err == nil {
			h.wsHub.SendToUser(req.FollowedID, data)
		}
	}

	// Get updated counts
	targetFollowerCount, _ := h.followerRepo.CountFollowers(req.FollowedID)
	currentUserFollowingCount, _ := h.followerRepo.CountFollowing(userID)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"success":                   true,
		"targetFollowerCount":       targetFollowerCount,
		"currentUserFollowingCount": currentUserFollowingCount,
	})
}

func (h *FollowerHandler) AcceptFollowHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	userID := getUserIDFromContext(r)
	if userID == 0 {
		sendUnauthorized(w)
		return
	}

	var req struct {
		FollowerID int `json:"followerId"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	if req.FollowerID == 0 {
		http.Error(w, "followerId is required", http.StatusBadRequest)
		return
	}

	if err := h.followerRepo.AcceptFollow(req.FollowerID, userID); err != nil {
		log.Printf("Error accepting follow: %v", err)
		http.Error(w, "Failed to accept follow request", http.StatusInternalServerError)
		return
	}

	h.notificationRepo.Delete(userID, req.FollowerID, "follow_request")

	// Get updated counts for both users
	acceptorFollowerCount, _ := h.followerRepo.CountFollowers(userID)
	requesterFollowingCount, _ := h.followerRepo.CountFollowing(req.FollowerID)

	log.Printf("Accept follow: acceptor (user %d) follower count: %d, requester (user %d) following count: %d",
		userID, acceptorFollowerCount, req.FollowerID, requesterFollowingCount)

	acceptor, _ := h.userRepo.FindByID(userID)
	if acceptor != nil {
		message := acceptor.Username + " accepted your follow request"

		// Create DB notification
		h.notificationRepo.Create(req.FollowerID, userID, userID, "follow_accepted", message)

		// Send real-time WebSocket notification to requester with updated counts
		wsNotification := map[string]interface{}{
			"type":           "follow_accepted",
			"fromUserId":     userID,
			"fromUsername":   acceptor.Username,
			"message":        message,
			"timestamp":      time.Now().Format(time.RFC3339),
			"followingCount": requesterFollowingCount,
		}
		if data, err := json.Marshal(wsNotification); err == nil {
			log.Printf("Sending follow_accepted notification to user %d with followingCount: %d", req.FollowerID, requesterFollowingCount)
			h.wsHub.SendToUser(req.FollowerID, data)
		}

		// Also notify the acceptor (current user) about their new follower
		wsNotificationAcceptor := map[string]interface{}{
			"type":          "follower_count_update",
			"followerCount": acceptorFollowerCount,
		}
		if data, err := json.Marshal(wsNotificationAcceptor); err == nil {
			log.Printf("Sending follower_count_update notification to user %d with followerCount: %d", userID, acceptorFollowerCount)
			h.wsHub.SendToUser(userID, data)
		}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"success":                 true,
		"status":                  "accepted",
		"acceptorFollowerCount":   acceptorFollowerCount,
		"requesterFollowingCount": requesterFollowingCount,
	})
}

func (h *FollowerHandler) DeclineFollowHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	userID := getUserIDFromContext(r)
	if userID == 0 {
		sendUnauthorized(w)
		return
	}

	var req struct {
		FollowerID int `json:"followerId"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	if req.FollowerID == 0 {
		http.Error(w, "followerId is required", http.StatusBadRequest)
		return
	}

	if err := h.followerRepo.DeclineFollow(req.FollowerID, userID); err != nil {
		log.Printf("Error declining follow: %v", err)
		http.Error(w, "Failed to decline follow request", http.StatusInternalServerError)
		return
	}

	h.notificationRepo.Delete(userID, req.FollowerID, "follow_request")

	// Send real-time notification about declined request
	decliner, _ := h.userRepo.FindByID(userID)
	if decliner != nil {
		wsNotification := map[string]interface{}{
			"type":         "follow_declined",
			"fromUserId":   userID,
			"fromUsername": decliner.Username,
			"timestamp":    time.Now().Format(time.RFC3339),
		}
		if data, err := json.Marshal(wsNotification); err == nil {
			h.wsHub.SendToUser(req.FollowerID, data)
		}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
	})
}

func (h *FollowerHandler) GetFollowersHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	userID := getUserIDFromContext(r)
	if userID == 0 {
		sendUnauthorized(w)
		return
	}

	targetID := userID
	if idStr := r.URL.Query().Get("user_id"); idStr != "" {
		parsed, err := strconv.Atoi(idStr)
		if err != nil {
			http.Error(w, "Invalid user_id", http.StatusBadRequest)
			return
		}
		targetID = parsed
	}

	followers, err := h.followerRepo.GetFollowers(targetID)
	if err != nil {
		log.Printf("Error getting followers: %v", err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}

	safeUsers := []interface{}{}
	for _, u := range followers {
		safeUsers = append(safeUsers, u.Safe())
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"success":   true,
		"followers": safeUsers,
	})
}

func (h *FollowerHandler) GetFollowingHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	userID := getUserIDFromContext(r)
	if userID == 0 {
		sendUnauthorized(w)
		return
	}

	targetID := userID
	if idStr := r.URL.Query().Get("user_id"); idStr != "" {
		parsed, err := strconv.Atoi(idStr)
		if err != nil {
			http.Error(w, "Invalid user_id", http.StatusBadRequest)
			return
		}
		targetID = parsed
	}

	following, err := h.followerRepo.GetFollowing(targetID)
	if err != nil {
		log.Printf("Error getting following: %v", err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}

	safeUsers := []interface{}{}
	for _, u := range following {
		safeUsers = append(safeUsers, u.Safe())
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"success":   true,
		"following": safeUsers,
	})
}

func (h *FollowerHandler) GetPendingRequestsHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	userID := getUserIDFromContext(r)
	if userID == 0 {
		sendUnauthorized(w)
		return
	}

	pending, err := h.followerRepo.GetPendingRequests(userID)
	if err != nil {
		log.Printf("Error getting pending requests: %v", err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}

	safeUsers := []interface{}{}
	for _, u := range pending {
		safeUsers = append(safeUsers, u.Safe())
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"success":  true,
		"requests": safeUsers,
	})
}
