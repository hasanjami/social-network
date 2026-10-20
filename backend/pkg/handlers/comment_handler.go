package handlers

import (
	"encoding/json"
	"log"
	"net/http"
	"strconv"

	"backend/pkg/db/repository"
	"backend/pkg/models"
)


type CommentHandler struct {
	commentRepo  *repository.CommentRepository
	userRepo     *repository.UserRepository
	postRepo     *repository.PostRepository
	groupRepo    *repository.GroupRepository
	followerRepo *repository.FollowerRepository
}

func NewCommentHandler(
	commentRepo *repository.CommentRepository,
	userRepo *repository.UserRepository,
	postRepo *repository.PostRepository,
	groupRepo *repository.GroupRepository,
	followerRepo *repository.FollowerRepository,
) *CommentHandler {
	return &CommentHandler{
		commentRepo:  commentRepo,
		userRepo:     userRepo,
		postRepo:     postRepo,
		groupRepo:    groupRepo,
		followerRepo: followerRepo,
	}
}

func (h *CommentHandler) CreateCommentHandler(w http.ResponseWriter, r *http.Request) {
	userID := getUserIDFromContext(r)
	if userID == 0 {
		sendUnauthorized(w)
		return
	}

	if err := r.ParseMultipartForm(5 << 20); err != nil {
		http.Error(w, "Invalid form data", http.StatusBadRequest)
		return
	}

	postIDStr := r.FormValue("postId")
	content := r.FormValue("content")

	if postIDStr == "" {
		http.Error(w, "postId is required", http.StatusBadRequest)
		return
	}

	postID, err := strconv.Atoi(postIDStr)
	if err != nil {
		http.Error(w, "Invalid postId", http.StatusBadRequest)
		return
	}

	if content == "" {
		http.Error(w, "content is required", http.StatusBadRequest)
		return
	}

	post, err := h.postRepo.GetPostByID(postID)
	if err != nil {
		log.Printf("Error loading post %d: %v", postID, err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}
	if post == nil {
		http.Error(w, "Post not found", http.StatusNotFound)
		return
	}

	if post.GroupID != nil {
		allowed, err := h.canCommentOnGroupPost(userID, post)
		if err != nil {
			log.Printf("Error checking group post comment permission: %v", err)
			http.Error(w, "Internal server error", http.StatusInternalServerError)
			return
		}
		if !allowed {
			http.Error(w, "Only accepted group members can comment on group posts", http.StatusForbidden)
			return
		}
	} else {
		allowed, err := h.canCommentOnRegularPost(userID, post)
		if err != nil {
			log.Printf("Error checking regular post comment permission: %v", err)
			http.Error(w, "Internal server error", http.StatusInternalServerError)
			return
		}
		if !allowed {
			http.Error(w, "You don't have permission to comment on this post", http.StatusForbidden)
			return
		}
	}

	// optional image
	var imagePath *string
	path, err := saveImage(r, "image", "comments")
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	if path != "" {
		imagePath = &path
	}

	comment, err := h.commentRepo.CreateComment(postID, userID, content, imagePath)
	if err != nil {
		log.Printf("Error creating comment: %v", err)
		http.Error(w, "Failed to create comment", http.StatusInternalServerError)
		return
	}

	response := map[string]interface{}{
		"success": true,
		"comment": comment,
	}

	author, err := h.userRepo.FindByID(userID)
	if err == nil && author != nil {
		response["author"] = author.Safe()
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(response)
}

func (h *CommentHandler) GetCommentsHandler(w http.ResponseWriter, r *http.Request) {
	userID := getUserIDFromContext(r)
	if userID == 0 {
		sendUnauthorized(w)
		return
	}

	postIDStr := r.URL.Query().Get("post_id")
	if postIDStr == "" {
		http.Error(w, "post_id is required", http.StatusBadRequest)
		return
	}

	postID, err := strconv.Atoi(postIDStr)
	if err != nil {
		http.Error(w, "Invalid post_id", http.StatusBadRequest)
		return
	}

	post, err := h.postRepo.GetPostByID(postID)
	if err != nil {
		log.Printf("Error loading post %d: %v", postID, err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}
	if post == nil {
		http.Error(w, "Post not found", http.StatusNotFound)
		return
	}

	if post.GroupID != nil {
		allowed, err := h.canCommentOnGroupPost(userID, post)
		if err != nil {
			log.Printf("Error checking group post comments permission: %v", err)
			http.Error(w, "Internal server error", http.StatusInternalServerError)
			return
		}
		if !allowed {
			http.Error(w, "Only accepted group members can view comments for group posts", http.StatusForbidden)
			return
		}
	} else {
		allowed, err := h.canCommentOnRegularPost(userID, post)
		if err != nil {
			log.Printf("Error checking regular post comments permission: %v", err)
			http.Error(w, "Internal server error", http.StatusInternalServerError)
			return
		}
		if !allowed {
			http.Error(w, "You don't have permission to view comments for this post", http.StatusForbidden)
			return
		}
	}

	comments, err := h.commentRepo.GetCommentsByPostID(postID)
	if err != nil {
		log.Printf("Error getting comments: %v", err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}

	result := []interface{}{}
	for _, c := range comments {
		entry := map[string]interface{}{
			"id":        c.ID,
			"postId":    c.PostID,
			"userId":    c.UserID,
			"content":   c.Content,
			"image":     c.Image,
			"createdAt": c.CreatedAt,
		}

		author, err := h.userRepo.FindByID(c.UserID)
		if err == nil && author != nil {
			entry["author"] = author.Safe()
		}

		result = append(result, entry)
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"success":  true,
		"comments": result,
	})
}

func (h *CommentHandler) DeleteCommentHandler(w http.ResponseWriter, r *http.Request) {
	userID := getUserIDFromContext(r)
	if userID == 0 {
		sendUnauthorized(w)
		return
	}

	commentIDStr := r.URL.Query().Get("id")
	if commentIDStr == "" {
		http.Error(w, "id is required", http.StatusBadRequest)
		return
	}

	commentID, err := strconv.Atoi(commentIDStr)
	if err != nil {
		http.Error(w, "Invalid id", http.StatusBadRequest)
		return
	}

	comment, err := h.commentRepo.GetCommentByID(commentID)
	if err != nil {
		log.Printf("Error loading comment %d: %v", commentID, err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}
	if comment == nil {
		http.Error(w, "Comment not found", http.StatusNotFound)
		return
	}

	// Owner of comment can always delete.
	canDelete := comment.UserID == userID

	if !canDelete {
		post, err := h.postRepo.GetPostByID(comment.PostID)
		if err != nil {
			log.Printf("Error loading post %d for comment delete: %v", comment.PostID, err)
			http.Error(w, "Internal server error", http.StatusInternalServerError)
			return
		}
		if post == nil {
			http.Error(w, "Post not found", http.StatusNotFound)
			return
		}

		// Post owner can delete comments on their post.
		if post.UserID == userID {
			canDelete = true
		}

		// Group creator can moderate comments on group posts.
		if !canDelete && post.GroupID != nil {
			group, err := h.groupRepo.FindByID(*post.GroupID)
			if err != nil {
				log.Printf("Error loading group %d for comment delete: %v", *post.GroupID, err)
				http.Error(w, "Internal server error", http.StatusInternalServerError)
				return
			}
			if group != nil && group.CreatorID == userID {
				canDelete = true
			}
		}
	}

	if !canDelete {
		http.Error(w, "You don't have permission to delete this comment", http.StatusForbidden)
		return
	}

	err = h.commentRepo.DeleteCommentByID(commentID)
	if err != nil {
		log.Printf("Error deleting comment: %v", err)
		http.Error(w, "Failed to delete comment", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
	})
}

func (h *CommentHandler) canCommentOnGroupPost(userID int, post *models.Post) (bool, error) {
	if post.GroupID == nil {
		return false, nil
	}
	if post.UserID == userID {
		return true, nil
	}
	if post.GroupID != nil {
		isMember, status, _, err := h.groupRepo.IsMember(*post.GroupID, userID)
		if err != nil {
			return false, err
		}
		return isMember && status == "accepted", nil
	}
	return false, nil
}

func (h *CommentHandler) canCommentOnRegularPost(userID int, post *models.Post) (bool, error) {
	if post.GroupID != nil {
		return false, nil
	}
	if post.UserID == userID {
		return true, nil
	}
	switch post.Privacy {
	case "public":
		return true, nil
	case "almost_private":
		isFollowing, err := h.followerRepo.IsFollowing(userID, post.UserID)
		if err != nil {
			return false, err
		}
		return isFollowing, nil
	case "private":
		return h.postRepo.IsAllowedViewer(post.ID, userID)
	default:
		return false, nil
	}
}
