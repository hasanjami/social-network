// backend/pkg/handlers/post_handler.go
package handlers

import (
    "crypto/rand"
    "encoding/hex"
    "encoding/json"
    "fmt"
    "io"
    "net/http"
    "os"
    "path/filepath"
    "strings"
    "strconv"
    "backend/pkg/models"
    "backend/pkg/db/repository"
)

type PostHandler struct {
    postRepo     *repository.PostRepository
    userRepo     *repository.UserRepository
    followerRepo *repository.FollowerRepository
    commentRepo  *repository.CommentRepository
    groupRepo    *repository.GroupRepository
}

func NewPostHandler(postRepo *repository.PostRepository, userRepo *repository.UserRepository, followerRepo *repository.FollowerRepository, commentRepo *repository.CommentRepository, groupRepo *repository.GroupRepository) *PostHandler {
    return &PostHandler{
        postRepo:     postRepo,
        userRepo:     userRepo,
        followerRepo: followerRepo,
        commentRepo:  commentRepo,
        groupRepo:    groupRepo,
    }
}

// PostWithAuthor wraps a post with its author's safe data for API responses
type PostWithAuthor struct {
	*models.Post
	Author       *models.SafeUser `json:"author,omitempty"`
	LikeCount    int              `json:"likeCount"`
	IsLiked      bool             `json:"isLiked"`
	CommentCount int              `json:"commentCount"`
}

// enrichPostsWithAuthors fetches author and like data for a slice of posts
func (h *PostHandler) enrichPostsWithAuthors(posts []*models.Post) []PostWithAuthor {
	return h.enrichPostsForUser(posts, 0)
}

func (h *PostHandler) enrichPostsForUser(posts []*models.Post, userID int) []PostWithAuthor {
	result := make([]PostWithAuthor, 0, len(posts))
	if len(posts) == 0 {
		return result
	}

	// Batch fetch like counts and liked status
	postIDs := make([]int, len(posts))
	for i, p := range posts {
		postIDs[i] = p.ID
	}

	likeCounts, _ := h.postRepo.GetLikeCounts(postIDs)
	likedByUser, _ := h.postRepo.GetLikedPostIDs(userID, postIDs)

	for _, post := range posts {
		p := PostWithAuthor{
			Post:      post,
			LikeCount: likeCounts[post.ID],
			IsLiked:   likedByUser[post.ID],
		}
		if author, err := h.userRepo.FindByID(post.UserID); err == nil && author != nil {
			p.Author = author.Safe()
		}
		p.CommentCount, _ = h.commentRepo.CountByPostID(post.ID)
		result = append(result, p)
	}
	return result
}

type CreatePostRequest struct {
    Title   string  `json:"title"`
    Content string  `json:"content"`
    Image   *string `json:"image,omitempty"`
    Privacy string  `json:"privacy"`
    GroupID *int    `json:"group_id,omitempty"`
}

type UpdatePostRequest struct {
    Title   string  `json:"title,omitempty"`
    Content string  `json:"content,omitempty"`
    Image   *string `json:"image,omitempty"`
    Privacy string  `json:"privacy,omitempty"`
}

// PostMainHandler handles all post-related requests
func (h *PostHandler) PostMainHandler(w http.ResponseWriter, r *http.Request) {
    switch r.Method {
    case http.MethodPost:
        h.CreatePostHandler(w, r)
    case http.MethodGet:
        // Determine if it's getting a single post, user posts, or feed
        path := r.URL.Path
        
        // Check for special endpoints
        if strings.Contains(path, "/feed") {
            h.GetFeedHandler(w, r)
        } else if strings.Contains(path, "/user") {
            h.GetUserPostsHandler(w, r)
        } else if strings.Contains(path, "/allowed-viewers") {
            h.GetAllowedViewersHandler(w, r)
        } else {
            h.GetPostHandler(w, r)
        }
    case http.MethodPut, http.MethodPatch:
        h.UpdatePostHandler(w, r)
    case http.MethodDelete:
        h.DeletePostHandler(w, r)
    default:
        sendErrorResponse(w, "Method not allowed", http.StatusMethodNotAllowed)
    }
}

// CreatePostHandler creates a new post
func (h *PostHandler) CreatePostHandler(w http.ResponseWriter, r *http.Request) {
    userID, ok := r.Context().Value("userID").(int)
    if !ok {
        sendErrorResponse(w, "Unauthorized", http.StatusUnauthorized)
        return
    }

    // Parse multipart form (max 10MB)
    if err := r.ParseMultipartForm(10 << 20); err != nil {
        sendErrorResponse(w, "Invalid form data", http.StatusBadRequest)
        return
    }

    title   := strings.TrimSpace(r.FormValue("title"))
    content := strings.TrimSpace(r.FormValue("content"))
    privacy := r.FormValue("privacy")

    if title == "" {
        sendErrorResponse(w, "Title is required", http.StatusBadRequest)
        return
    }
    if content == "" {
        sendErrorResponse(w, "Content is required", http.StatusBadRequest)
        return
    }

    validPrivacy := map[string]bool{
        "public": true, "private": true, "almost_private": true,
    }
    if !validPrivacy[privacy] {
        sendErrorResponse(w, "Invalid privacy setting", http.StatusBadRequest)
        return
    }

    // Optional group_id (when posting inside a group)
    var groupID *int
    if gidStr := strings.TrimSpace(r.FormValue("group_id")); gidStr != "" {
        gid, err := strconv.Atoi(gidStr)
        if err != nil || gid <= 0 {
            sendErrorResponse(w, "Invalid group_id", http.StatusBadRequest)
            return
        }
        isMember, status, _, err := h.groupRepo.IsMember(gid, userID)
        if err != nil || !isMember || status != "accepted" {
            sendErrorResponse(w, "You must be a group member to post in it", http.StatusForbidden)
            return
        }
        groupID = &gid
    }

    // Handle optional image upload - same approach as avatar upload
    var imagePath *string
    file, header, err := r.FormFile("image")
    if err == nil {
        defer file.Close()

        contentType := header.Header.Get("Content-Type")
        filename, saveErr := savePostImageFile(file, contentType)
        if saveErr != nil {
            sendErrorResponse(w, saveErr.Error(), http.StatusBadRequest)
            return
        }
        path := "/uploads/posts/" + filename
        imagePath = &path
    }

    post, err := h.postRepo.CreatePost(userID, title, content, imagePath, privacy, groupID)
    if err != nil {
        sendErrorResponse(w, "Failed to create post: "+err.Error(), http.StatusInternalServerError)
        return
    }

    // If private, save allowed viewers
    if privacy == "private" {
        allowedStr := r.FormValue("allowedUsers") // comma-separated user IDs
        if allowedStr != "" {
            var allowedIDs []int
            for _, s := range strings.Split(allowedStr, ",") {
                s = strings.TrimSpace(s)
                if id, err := strconv.Atoi(s); err == nil && id > 0 {
                    allowedIDs = append(allowedIDs, id)
                }
            }
            if len(allowedIDs) > 0 {
                h.postRepo.AddAllowedViewers(post.ID, allowedIDs)
            }
        }
    }

    user, err := h.userRepo.FindByID(userID)
    if err != nil || user == nil {
        response := map[string]interface{}{"success": true, "post": post}
        w.Header().Set("Content-Type", "application/json")
        w.WriteHeader(http.StatusCreated)
        json.NewEncoder(w).Encode(response)
        return
    }

    response := map[string]interface{}{
        "success": true,
        "message": "Post created successfully",
        "post":    post,
        "author":  user.Safe(),
    }
    w.Header().Set("Content-Type", "application/json")
    w.WriteHeader(http.StatusCreated)
    json.NewEncoder(w).Encode(response)
}

// GetPostHandler retrieves a single post by ID
func (h *PostHandler) GetPostHandler(w http.ResponseWriter, r *http.Request) {
    userID, ok := r.Context().Value("userID").(int)
    if !ok {
        sendErrorResponse(w, "Unauthorized", http.StatusUnauthorized)
        return
    }

    // Try to get ID from URL path first (e.g., /api/posts/123)
    path := r.URL.Path
    var postID int
    var err error
    
    // Extract ID from path by removing "/api/posts/" prefix
    basePath := "/api/posts/"
    if strings.HasPrefix(path, basePath) {
        idStr := strings.TrimPrefix(path, basePath)
        
        // Remove any trailing slashes
        idStr = strings.TrimSuffix(idStr, "/")
        
        // Check if this is actually an ID (not "feed" or "user")
        if idStr != "" && idStr != "feed" && idStr != "user" && !strings.Contains(idStr, "/") {
            postID, err = strconv.Atoi(idStr)
        }
    }
    
    // If no ID from path, try query parameter
    if err != nil || postID == 0 {
        idStr := r.URL.Query().Get("id")
        if idStr == "" {
            sendErrorResponse(w, "Post ID is required", http.StatusBadRequest)
            return
        }
        postID, err = strconv.Atoi(idStr)
        if err != nil {
            sendErrorResponse(w, "Invalid post ID", http.StatusBadRequest)
            return
        }
    }

    // Get post from repository
    post, err := h.postRepo.GetPostByID(postID)
    if err != nil {
        sendErrorResponse(w, "Failed to retrieve post: "+err.Error(), http.StatusInternalServerError)
        return
    }
    
    if post == nil {
        sendErrorResponse(w, "Post not found", http.StatusNotFound)
        return
    }

    // Check if user has permission to view this post
    canView := h.canViewPost(userID, post)
    if !canView {
        sendErrorResponse(w, "You don't have permission to view this post", http.StatusForbidden)
        return
    }

    // Get author details
    author, err := h.userRepo.FindByID(post.UserID)
    if err != nil {
        sendErrorResponse(w, "Failed to get author details", http.StatusInternalServerError)
        return
    }

    enriched := PostWithAuthor{Post: post, Author: author.Safe()}

    // Add like data for single post
    enriched.LikeCount, _ = h.postRepo.GetLikeCount(post.ID)
    enriched.IsLiked, _ = h.postRepo.IsLikedByUser(post.ID, userID)
    enriched.CommentCount, _ = h.commentRepo.CountByPostID(post.ID)

    response := map[string]interface{}{
        "success": true,
        "post":    enriched,
    }

    w.Header().Set("Content-Type", "application/json")
    json.NewEncoder(w).Encode(response)
}

// GetUserPostsHandler retrieves posts for a specific user
func (h *PostHandler) GetUserPostsHandler(w http.ResponseWriter, r *http.Request) {
    currentUserID, ok := r.Context().Value("userID").(int)
    if !ok {
        sendErrorResponse(w, "Unauthorized", http.StatusUnauthorized)
        return
    }

    // Get target user ID from query params
    targetUserIDStr := r.URL.Query().Get("user_id")
    targetUserID := currentUserID // Default to current user

    if targetUserIDStr != "" {
        parsedID, err := strconv.Atoi(targetUserIDStr)
        if err != nil {
            sendErrorResponse(w, "Invalid user ID", http.StatusBadRequest)
            return
        }
        targetUserID = parsedID
    }

    // Get posts for target user
    posts, err := h.postRepo.GetPostsByUserID(targetUserID)
    if err != nil {
        sendErrorResponse(w, "Failed to fetch posts: "+err.Error(), http.StatusInternalServerError)
        return
    }

    // Filter posts based on privacy settings if viewing another user's posts
    if targetUserID != currentUserID {
        filteredPosts := []*models.Post{}
        for _, post := range posts {
            if h.canViewPost(currentUserID, post) {
                filteredPosts = append(filteredPosts, post)
            }
        }
        posts = filteredPosts
    }

    response := map[string]interface{}{
        "success": true,
        "posts":   h.enrichPostsForUser(posts, currentUserID),
        "count":   len(posts),
    }

    w.Header().Set("Content-Type", "application/json")
    json.NewEncoder(w).Encode(response)
}

// GetFeedHandler retrieves posts for the user's feed
func (h *PostHandler) GetFeedHandler(w http.ResponseWriter, r *http.Request) {
    userID, ok := r.Context().Value("userID").(int)
    if !ok {
        sendErrorResponse(w, "Unauthorized", http.StatusUnauthorized)
        return
    }

    posts, err := h.postRepo.GetFeedPosts(userID)
    if err != nil {
        sendErrorResponse(w, "Failed to fetch feed: "+err.Error(), http.StatusInternalServerError)
        return
    }

    response := map[string]interface{}{
        "success": true,
        "posts":   h.enrichPostsForUser(posts, userID),
        "count":   len(posts),
    }

    w.Header().Set("Content-Type", "application/json")
    json.NewEncoder(w).Encode(response)
}

// UpdatePostHandler updates an existing post
func (h *PostHandler) UpdatePostHandler(w http.ResponseWriter, r *http.Request) {
    userID, ok := r.Context().Value("userID").(int)
    if !ok {
        sendErrorResponse(w, "Unauthorized", http.StatusUnauthorized)
        return
    }

    // Get post ID from query parameter
    postIDStr := r.URL.Query().Get("id")
    if postIDStr == "" {
        sendErrorResponse(w, "Post ID is required as query parameter: ?id=123", http.StatusBadRequest)
        return
    }

    postID, err := strconv.Atoi(postIDStr)
    if err != nil {
        sendErrorResponse(w, "Invalid post ID", http.StatusBadRequest)
        return
    }

    // Parse multipart form for update (to support image upload and allowedUsers)
    if err := r.ParseMultipartForm(10 << 20); err != nil {
        sendErrorResponse(w, "Invalid form data", http.StatusBadRequest)
        return
    }

    title := strings.TrimSpace(r.FormValue("title"))
    content := strings.TrimSpace(r.FormValue("content"))
    privacy := r.FormValue("privacy")

    // Validate privacy if provided
    if privacy != "" {
        validPrivacy := map[string]bool{
            "public":        true,
            "private":       true,
            "almost_private": true,
        }
        if !validPrivacy[privacy] {
            sendErrorResponse(w, "Invalid privacy setting. Must be: public, private, or almost_private", http.StatusBadRequest)
            return
        }
    }

    // Handle optional image upload
    var imagePath *string
    file, header, err := r.FormFile("image")
    if err == nil {
        defer file.Close()
        contentType := header.Header.Get("Content-Type")
        filename, saveErr := savePostImageFile(file, contentType)
        if saveErr != nil {
            sendErrorResponse(w, saveErr.Error(), http.StatusBadRequest)
            return
        }
        path := "/uploads/posts/" + filename
        imagePath = &path
    }

    // Update post
    updatedPost, err := h.postRepo.UpdatePost(postID, userID, title, content, imagePath, privacy)
    if err != nil {
        if err.Error() == "unauthorized" {
            sendErrorResponse(w, "You can only edit your own posts", http.StatusForbidden)
            return
        }
        sendErrorResponse(w, "Failed to update post: "+err.Error(), http.StatusInternalServerError)
        return
    }

    // Update allowed viewers if privacy is private
    if privacy == "private" {
        h.postRepo.RemoveAllowedViewers(postID)
        allowedStr := r.FormValue("allowedUsers")
        if allowedStr != "" {
            var allowedIDs []int
            for _, s := range strings.Split(allowedStr, ",") {
                if id, err := strconv.Atoi(strings.TrimSpace(s)); err == nil && id > 0 {
                    allowedIDs = append(allowedIDs, id)
                }
            }
            if len(allowedIDs) > 0 {
                h.postRepo.AddAllowedViewers(postID, allowedIDs)
            }
        }
    } else if privacy != "" {
        // Switched away from private - clear allowed viewers
        h.postRepo.RemoveAllowedViewers(postID)
    }

    response := map[string]interface{}{
        "success": true,
        "message": "Post updated successfully",
        "post":    updatedPost,
    }

    w.Header().Set("Content-Type", "application/json")
    json.NewEncoder(w).Encode(response)
}

// DeletePostHandler deletes a post
func (h *PostHandler) DeletePostHandler(w http.ResponseWriter, r *http.Request) {
    userID, ok := r.Context().Value("userID").(int)
    if !ok {
        sendErrorResponse(w, "Unauthorized", http.StatusUnauthorized)
        return
    }

    // Get post ID from query parameter
    postIDStr := r.URL.Query().Get("id")
    if postIDStr == "" {
        sendErrorResponse(w, "Post ID is required as query parameter: ?id=123", http.StatusBadRequest)
        return
    }

    postID, err := strconv.Atoi(postIDStr)
    if err != nil {
        sendErrorResponse(w, "Invalid post ID", http.StatusBadRequest)
        return
    }

    // Delete post
    err = h.postRepo.DeletePost(postID, userID)
    if err != nil {
        if err.Error() == "unauthorized" {
            sendErrorResponse(w, "You can only delete your own posts", http.StatusForbidden)
            return
        }
        sendErrorResponse(w, "Failed to delete post: "+err.Error(), http.StatusInternalServerError)
        return
    }

    response := map[string]interface{}{
        "success": true,
        "message": "Post deleted successfully",
    }

    w.Header().Set("Content-Type", "application/json")
    json.NewEncoder(w).Encode(response)
}

// savePostImageFile saves an uploaded post image - mirrors saveAvatarFile from user_handler.go
func savePostImageFile(file io.Reader, contentType string) (string, error) {
    uploadDir := "./pkg/db/uploads/posts"
    if err := os.MkdirAll(uploadDir, 0755); err != nil {
        return "", fmt.Errorf("failed to create upload directory: %v", err)
    }

    allowed := map[string]bool{
        "image/jpeg": true, "image/jpg": true,
        "image/png": true, "image/gif": true, "image/webp": true,
    }
    ct := strings.ToLower(contentType)
    if !allowed[ct] {
        return "", fmt.Errorf("only JPEG, PNG, GIF and WebP images are allowed")
    }

    // Random hex filename - same as avatar approach
    b := make([]byte, 16)
    if _, err := rand.Read(b); err != nil {
        return "", fmt.Errorf("failed to generate filename: %v", err)
    }
    filename := hex.EncodeToString(b) + getExtensionFromContentType(ct)

    dst, err := os.Create(filepath.Join(uploadDir, filename))
    if err != nil {
        return "", fmt.Errorf("failed to create file: %v", err)
    }
    defer dst.Close()

    if _, err := io.Copy(dst, file); err != nil {
        os.Remove(filepath.Join(uploadDir, filename))
        return "", fmt.Errorf("failed to save file: %v", err)
    }
    return filename, nil
}

// GetGroupPostsHandler handles GET /api/groups/{id}/posts
func (h *PostHandler) GetGroupPostsHandler(w http.ResponseWriter, r *http.Request) {
    userID, ok := r.Context().Value("userID").(int)
    if !ok {
        sendErrorResponse(w, "Unauthorized", http.StatusUnauthorized)
        return
    }

    parts := strings.Split(strings.Trim(r.URL.Path, "/"), "/")
    if len(parts) < 4 {
        sendErrorResponse(w, "Group ID is required", http.StatusBadRequest)
        return
    }
    groupID, err := strconv.Atoi(parts[2])
    if err != nil || groupID <= 0 {
        sendErrorResponse(w, "Invalid group ID", http.StatusBadRequest)
        return
    }

    isMember, status, _, err := h.groupRepo.IsMember(groupID, userID)
    if err != nil || !isMember || status != "accepted" {
        sendErrorResponse(w, "You must be a group member to view its posts", http.StatusForbidden)
        return
    }

    posts, err := h.postRepo.GetGroupPosts(groupID)
    if err != nil {
        sendErrorResponse(w, "Failed to fetch group posts: "+err.Error(), http.StatusInternalServerError)
        return
    }

    enriched := h.enrichPostsForUser(posts, userID)
    wrapped := make([]map[string]interface{}, 0, len(enriched))
    for _, p := range enriched {
        wrapped = append(wrapped, map[string]interface{}{
            "post":         p.Post,
            "author":       p.Author,
            "likeCount":    p.LikeCount,
            "isLiked":      p.IsLiked,
            "commentCount": p.CommentCount,
        })
    }

    response := map[string]interface{}{
        "success": true,
        "posts":   wrapped,
    }
    w.Header().Set("Content-Type", "application/json")
    json.NewEncoder(w).Encode(response)
}

// Helper method to check if a user can view a post
func (h *PostHandler) canViewPost(userID int, post *models.Post) bool {
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
        return h.isFollowing(userID, post.UserID)
    case "private":
        return h.isAllowedToView(userID, post.ID)
    default:
        return false
    }
}

// Helper method to check if a user follows another user
func (h *PostHandler) isFollowing(followerID, followeeID int) bool {
    isFollowing, err := h.followerRepo.IsFollowing(followerID, followeeID)
    if err != nil {
        // Log error but return false to be safe
        return false
    }
    return isFollowing
}

// Helper method to check if a user is allowed to view a specific post
func (h *PostHandler) isAllowedToView(userID, postID int) bool {
    allowed, err := h.postRepo.IsAllowedViewer(postID, userID)
    if err != nil {
        return false
    }
    return allowed
}

// GetAllowedViewersHandler retrieves the list of user IDs allowed to view a private post
func (h *PostHandler) GetAllowedViewersHandler(w http.ResponseWriter, r *http.Request) {
    userID, ok := r.Context().Value("userID").(int)
    if !ok {
        sendErrorResponse(w, "Unauthorized", http.StatusUnauthorized)
        return
    }

    postIDStr := r.URL.Query().Get("post_id")
    if postIDStr == "" {
        sendErrorResponse(w, "Post ID is required", http.StatusBadRequest)
        return
    }

    postID, err := strconv.Atoi(postIDStr)
    if err != nil {
        sendErrorResponse(w, "Invalid post ID", http.StatusBadRequest)
        return
    }

    // Get the post to verify ownership
    post, err := h.postRepo.GetPostByID(postID)
    if err != nil || post == nil {
        sendErrorResponse(w, "Post not found", http.StatusNotFound)
        return
    }

    // Only the post owner can view the allowed viewers list
    if post.UserID != userID {
        sendErrorResponse(w, "You can only view allowed viewers for your own posts", http.StatusForbidden)
        return
    }

    allowedUserIDs, err := h.postRepo.GetAllowedViewers(postID)
    if err != nil {
        sendErrorResponse(w, "Failed to fetch allowed viewers", http.StatusInternalServerError)
        return
    }

    response := map[string]interface{}{
        "success":    true,
        "allowedUsers": allowedUserIDs,
    }

    w.Header().Set("Content-Type", "application/json")
    json.NewEncoder(w).Encode(response)
}