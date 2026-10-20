package handlers

import (
	"encoding/json"
	"net/http"
	"strconv"

	"backend/pkg/db/repository"
)

type LikeHandler struct {
	postRepo     *repository.PostRepository
	followerRepo *repository.FollowerRepository
	groupRepo    *repository.GroupRepository
}

func NewLikeHandler(
	postRepo *repository.PostRepository,
	followerRepo *repository.FollowerRepository,
	groupRepo *repository.GroupRepository,
) *LikeHandler {
	return &LikeHandler{
		postRepo:     postRepo,
		followerRepo: followerRepo,
		groupRepo:    groupRepo,
	}
}

func (h *LikeHandler) canSeePost(userID, postID int) bool {
	post, err := h.postRepo.GetPostByID(postID)
	if err != nil || post == nil {
		return false
	}
	if post.UserID == userID {
		return true
	}
	if post.GroupID != nil {
		isMember, status, _, err := h.groupRepo.IsMember(*post.GroupID, userID)
		if err != nil {
			return false
		}
		return isMember && status == "accepted"
	}
	switch post.Privacy {
	case "public":
		return true
	case "almost_private":
		ok, _ := h.followerRepo.IsFollowing(userID, post.UserID)
		return ok
	case "private":
		ok, _ := h.postRepo.IsAllowedViewer(post.ID, userID)
		return ok
	}
	return false
}

// ToggleLikeHandler handles POST /api/posts/like?id=POST_ID
func (h *LikeHandler) ToggleLikeHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		sendErrorResponse(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	userID, ok := r.Context().Value("userID").(int)
	if !ok {
		sendErrorResponse(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	postIDStr := r.URL.Query().Get("id")
	if postIDStr == "" {
		sendErrorResponse(w, "Post ID is required", http.StatusBadRequest)
		return
	}

	postID, err := strconv.Atoi(postIDStr)
	if err != nil {
		sendErrorResponse(w, "Invalid post ID", http.StatusBadRequest)
		return
	}

	if !h.canSeePost(userID, postID) {
		sendErrorResponse(w, "You don't have permission to like this post", http.StatusForbidden)
		return
	}

	isLiked, err := h.postRepo.IsLikedByUser(postID, userID)
	if err != nil {
		sendErrorResponse(w, "Failed to check like status", http.StatusInternalServerError)
		return
	}

	if isLiked {
		if err := h.postRepo.UnlikePost(postID, userID); err != nil {
			sendErrorResponse(w, "Failed to unlike post", http.StatusInternalServerError)
			return
		}
	} else {
		if err := h.postRepo.LikePost(postID, userID); err != nil {
			sendErrorResponse(w, "Failed to like post", http.StatusInternalServerError)
			return
		}
	}

	count, err := h.postRepo.GetLikeCount(postID)
	if err != nil {
		sendErrorResponse(w, "Failed to get like count", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
		"liked":   !isLiked,
		"count":   count,
	})
}
