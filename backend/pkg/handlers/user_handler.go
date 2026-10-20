package handlers

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"backend/pkg/db/repository"
	"backend/pkg/models"

	"golang.org/x/crypto/bcrypt"
)

type UserHandler struct {
	userRepo         *repository.UserRepository
	followerRepo     *repository.FollowerRepository
	postRepo         *repository.PostRepository
	notificationRepo *repository.NotificationRepository
}

func NewUserHandler(userRepo *repository.UserRepository, followerRepo *repository.FollowerRepository, postRepo *repository.PostRepository, notificationRepo *repository.NotificationRepository) *UserHandler {
	return &UserHandler{
		userRepo:         userRepo,
		followerRepo:     followerRepo,
		postRepo:         postRepo,
		notificationRepo: notificationRepo,
	}
}

// saveAvatarFile saves an uploaded avatar file
func saveAvatarFile(file io.Reader, contentType string) (string, error) {
	uploadDir := "./pkg/db/uploads/avatars"

	// Create directory
	if err := os.MkdirAll(uploadDir, 0755); err != nil {
		return "", fmt.Errorf("failed to create upload directory: %v", err)
	}

	// Validate file type
	allowedTypes := map[string]bool{
		"image/jpeg": true,
		"image/png":  true,
		"image/gif":  true,
		"image/jpg":  true,
	}

	contentType = strings.ToLower(contentType)
	if !allowedTypes[contentType] {
		return "", fmt.Errorf("unsupported image type: %s. Allowed: JPEG, PNG, GIF", contentType)
	}

	// Generate unique name
	bytes := make([]byte, 16)
	if _, err := rand.Read(bytes); err != nil {
		return "", fmt.Errorf("failed to generate filename: %v", err)
	}
	filename := hex.EncodeToString(bytes)

	// Add correct extension
	ext := getExtensionFromContentType(contentType)
	filename += ext

	// Save file
	filePath := filepath.Join(uploadDir, filename)
	dst, err := os.Create(filePath)
	if err != nil {
		return "", fmt.Errorf("failed to create file: %v", err)
	}
	defer dst.Close()

	if _, err := io.Copy(dst, file); err != nil {
		// Clean up on error
		os.Remove(filePath)
		return "", fmt.Errorf("failed to save file: %v", err)
	}

	return filename, nil
}

// Helper to get extension from content type
func getExtensionFromContentType(contentType string) string {
	contentType = strings.ToLower(contentType)

	switch {
	case strings.Contains(contentType, "jpeg") || strings.Contains(contentType, "jpg"):
		return ".jpg"
	case strings.Contains(contentType, "png"):
		return ".png"
	case strings.Contains(contentType, "gif"):
		return ".gif"
	default:
		return ".jpg" // Default to jpg
	}
}

// deleteAvatarFile deletes an avatar file
func deleteAvatarFile(filename string) error {
	if filename == "" || filename == "default-avatar.png" {
		return nil
	}

	filePath := filepath.Join("./pkg/db/uploads/avatars", filename)

	// Check if file exists
	if _, err := os.Stat(filePath); os.IsNotExist(err) {
		return nil
	}

	return os.Remove(filePath)
}

// fileExists checks if a file exists
func fileExists(filePath string) (bool, error) {
	_, err := os.Stat(filePath)
	if err == nil {
		return true, nil
	}
	if os.IsNotExist(err) {
		return false, nil
	}
	return false, err
}

// Helper to get user ID from context
func getUserIDFromContext(r *http.Request) int {
	userID, ok := r.Context().Value("userID").(int)
	if !ok {
		return 0
	}
	return userID
}

// GetUserHandler returns a user's profile with stats
func (h *UserHandler) GetUserHandler(w http.ResponseWriter, r *http.Request) {
	// Extract username from path
	path := r.URL.Path
	parts := strings.Split(path, "/")
	if len(parts) < 4 {
		http.Error(w, "Username is required", http.StatusBadRequest)
		return
	}
	username := parts[3]

	// Get profile user from database
	profileUser, err := h.userRepo.FindByUsername(username)
	if err != nil {
		log.Printf("Error fetching user %s: %v", username, err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}

	if profileUser == nil {
		w.WriteHeader(http.StatusNotFound)
		json.NewEncoder(w).Encode(map[string]string{
			"error":   "User not found",
			"message": "The requested user does not exist",
		})
		return
	}

	// Try to get authenticated user ID from context
	userID := getUserIDFromContext(r)

	log.Printf("GetUserHandler: username=%s, userID=%d, profileUser.ID=%d", username, userID, profileUser.ID)

	isOwner := profileUser.ID == userID

	canView := true
	if !isOwner && !profileUser.IsPublic {
		isFollower, _ := h.followerRepo.IsFollowing(userID, profileUser.ID)
		canView = isFollower
	}

	// If cannot view private profile, return limited info
	if !canView {
		limitedUser := profileUser.Safe()
		// Clear sensitive information
		limitedUser.Email = ""

		isPending := false
		if !isOwner {
			status, _ := h.followerRepo.GetFollowStatus(userID, profileUser.ID)
			isPending = status == "pending"
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"user":           limitedUser,
			"isOwnProfile":   isOwner,
			"canView":        false,
			"profilePrivate": true,
			"isFollowing":    false,
			"isPending":      isPending,
			"message":        "This profile is private.",
		})
		return
	}

	followers, _ := h.followerRepo.CountFollowers(profileUser.ID)
	following, _ := h.followerRepo.CountFollowing(profileUser.ID)
	postCount, _ := h.postRepo.CountByUserID(profileUser.ID)
	followState := "not_following"
	if !isOwner {
		status, _ := h.followerRepo.GetFollowStatus(userID, profileUser.ID)
		if status == "accepted" {
			followState = "following"
		} else if status == "pending" {
			followState = "pending"
		}
	}
	notifications := 0
	if isOwner {
		notifications, _ = h.notificationRepo.CountUnread(userID)
	}

	// Build complete response
	response := map[string]interface{}{
		"user": profileUser.Safe(),
		"stats": map[string]interface{}{
			"followers":     followers,
			"following":     following,
			"postCount":     postCount,
			"notifications": notifications,
		},
		"followState":  followState,
		"isFollowing":  followState == "following",
		"isPending":    followState == "pending",
		"isOwnProfile": isOwner,
		"canView":      true,
		"profileType":  getProfileType(profileUser.IsPublic),
	}

	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(response); err != nil {
		log.Printf("Error encoding response: %v", err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
	}
}

// UpdateUserHandler updates user profile information
func (h *UserHandler) UpdateUserHandler(w http.ResponseWriter, r *http.Request) {
	// Get authenticated user ID from context
	userID := getUserIDFromContext(r)
	if userID == 0 {
		sendUnauthorized(w)
		return
	}

	// Parse multipart form (max 10MB for file uploads)
	if err := r.ParseMultipartForm(10 << 20); err != nil {
		http.Error(w, "Invalid request payload", http.StatusBadRequest)
		return
	}

	// Get current user data
	currentUser, err := h.userRepo.FindByID(userID)
	if err != nil {
		log.Printf("Error fetching current user: %v", err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}

	// Prepare updated user
	updatedUser := *currentUser // Start with current values

	// Update fields from form
	if firstName := r.FormValue("firstName"); firstName != "" {
		updatedUser.FirstName = firstName
	}
	if lastName := r.FormValue("lastName"); lastName != "" {
		updatedUser.LastName = lastName
	}
	if nickname := r.FormValue("nickname"); nickname != "" {
		updatedUser.Nickname = &nickname
	}
	if aboutMe := r.FormValue("aboutMe"); aboutMe != "" {
		updatedUser.AboutMe = &aboutMe
	}

	// Parse date of birth
	if dobStr := r.FormValue("dateOfBirth"); dobStr != "" {
		dob, err := time.Parse("2006-01-02", dobStr)
		if err != nil {
			http.Error(w, "Invalid date format. Use YYYY-MM-DD", http.StatusBadRequest)
			return
		}
		updatedUser.DateOfBirth = dob
	}

	// Handle isPublic
	if isPublicStr := r.FormValue("isPublic"); isPublicStr != "" {
		updatedUser.IsPublic = isPublicStr == "true"
	}

	// Handle password if provided
	if password := r.FormValue("password"); password != "" {
		hashedPassword, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
		if err != nil {
			http.Error(w, "Could not hash password", http.StatusInternalServerError)
			return
		}
		updatedUser.Password = string(hashedPassword)
	}

	// Handle avatar upload or deletion
	isAvatarDeleted := r.FormValue("isAvatarDeleted") == "true"

	// Check if a new file is being uploaded
	if file, header, err := r.FormFile("profileImg"); err == nil {
		defer file.Close()

		// Get content type
		contentType := header.Header.Get("Content-Type")

		// Save the file
		filename, err := saveAvatarFile(file, contentType)
		if err != nil {
			log.Printf("Error saving avatar file: %v", err)
			http.Error(w, "Failed to save avatar: "+err.Error(), http.StatusInternalServerError)
			return
		}

		// Delete old avatar if it exists
		if currentUser.Avatar != nil && *currentUser.Avatar != "" && *currentUser.Avatar != "default-avatar.png" {
			if err := deleteAvatarFile(*currentUser.Avatar); err != nil {
				log.Printf("Warning: Could not delete old avatar: %v", err)
			}
		}

		updatedUser.Avatar = &filename

	} else if isAvatarDeleted {
		// Delete existing avatar
		if currentUser.Avatar != nil && *currentUser.Avatar != "" && *currentUser.Avatar != "default-avatar.png" {
			if err := deleteAvatarFile(*currentUser.Avatar); err != nil {
				log.Printf("Warning: Could not delete avatar: %v", err)
			}
		}
		// Set to default
		defaultAvatar := "default-avatar.png"
		updatedUser.Avatar = &defaultAvatar
	}
	// If no new file and not deleted, keep current avatar

	// Update user in database
	err = h.userRepo.Update(&updatedUser)
	if err != nil {
		log.Printf("Error updating user %d: %v", userID, err)
		http.Error(w, "Failed to update profile", http.StatusInternalServerError)
		return
	}

	// Fetch updated user
	finalUser, err := h.userRepo.FindByID(userID)
	if err != nil {
		log.Printf("Error fetching updated user %d: %v", userID, err)
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"success": true,
			"message": "Profile updated successfully",
			"user":    updatedUser.Safe(),
		})
		return
	}

	// Return success response
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"success":     true,
		"message":     "Profile updated successfully",
		"user":        finalUser.Safe(),
		"profileType": getProfileType(finalUser.IsPublic),
	})
}

// GetCurrentUserHandler returns the authenticated user's own profile
func (h *UserHandler) GetCurrentUserHandler(w http.ResponseWriter, r *http.Request) {
	// Get authenticated user ID from context
	userID := getUserIDFromContext(r)
	if userID == 0 {
		sendUnauthorized(w)
		return
	}

	// Get full user data
	fullUser, err := h.userRepo.FindByID(userID)
	if err != nil {
		log.Printf("Error fetching current user: %v", err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}

	followers, _ := h.followerRepo.CountFollowers(userID)
	following, _ := h.followerRepo.CountFollowing(userID)
	postCount, _ := h.postRepo.CountByUserID(userID)
	notifications, _ := h.notificationRepo.CountUnread(userID)

	response := map[string]interface{}{
		"user": fullUser.Safe(),
		"stats": map[string]interface{}{
			"followers":     followers,
			"following":     following,
			"postCount":     postCount,
			"notifications": notifications,
		},
		"isOwnProfile": true,
		"profileType":  getProfileType(fullUser.IsPublic),
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

// GetUsersHandler returns all users except the authenticated user with follow status
func (h *UserHandler) GetUsersHandler(w http.ResponseWriter, r *http.Request) {
	// Get authenticated user ID from context
	userID := getUserIDFromContext(r)
	if userID == 0 {
		sendUnauthorized(w)
		return
	}

	users, err := h.userRepo.GetAllExcluding(userID)
	if err != nil {
		log.Printf("Error fetching users: %v", err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}

	// Build response with follow status for each user
	type UserWithFollowStatus struct {
		*models.SafeUser
		FollowState string `json:"followState"`
		IsFollowing bool   `json:"isFollowing"`
		IsPending   bool   `json:"isPending"`
	}

	var usersWithStatus []UserWithFollowStatus
	for _, u := range users {
		followState := "not_following"
		status, _ := h.followerRepo.GetFollowStatus(userID, u.ID)
		if status == "accepted" {
			followState = "following"
		} else if status == "pending" {
			followState = "pending"
		}

		usersWithStatus = append(usersWithStatus, UserWithFollowStatus{
			SafeUser:    u.Safe(),
			FollowState: followState,
			IsFollowing: followState == "following",
			IsPending:   followState == "pending",
		})
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(usersWithStatus)
}

// GetUserByIdHandler returns a user by ID
func (h *UserHandler) GetUserByIdHandler(w http.ResponseWriter, r *http.Request) {
	userIDStr := r.URL.Query().Get("id")
	if userIDStr == "" {
		http.Error(w, "User ID is required", http.StatusBadRequest)
		return
	}

	userID, err := strconv.Atoi(userIDStr)
	if err != nil {
		http.Error(w, "Invalid user ID", http.StatusBadRequest)
		return
	}

	profileUser, err := h.userRepo.FindByID(userID)
	if err != nil {
		log.Printf("Error fetching user %d: %v", userID, err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}

	if profileUser == nil {
		w.WriteHeader(http.StatusNotFound)
		json.NewEncoder(w).Encode(map[string]string{"error": "User not found"})
		return
	}

	// Get authenticated user ID from context
	requestUserID := getUserIDFromContext(r)
	isOwner := profileUser.ID == requestUserID

	followers, _ := h.followerRepo.CountFollowers(profileUser.ID)
	following, _ := h.followerRepo.CountFollowing(profileUser.ID)
	postCount, _ := h.postRepo.CountByUserID(profileUser.ID)
	followState := "not_following"
	if !isOwner {
		status, _ := h.followerRepo.GetFollowStatus(requestUserID, profileUser.ID)
		if status == "accepted" {
			followState = "following"
		} else if status == "pending" {
			followState = "pending"
		}
	}

	response := map[string]interface{}{
		"user":         profileUser.Safe(),
		"followers":    followers,
		"following":    following,
		"postCount":    postCount,
		"followState":  followState,
		"isFollowing":  followState == "following",
		"isPending":    followState == "pending",
		"isOwnProfile": isOwner,
		"profileType":  getProfileType(profileUser.IsPublic),
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

// GetProfileImageHandler serves profile images
func (h *UserHandler) GetProfileImageHandler(w http.ResponseWriter, r *http.Request) {
	imageName := r.URL.Query().Get("image")
	if imageName == "" {
		http.Error(w, "Image name is required", http.StatusBadRequest)
		return
	}

	// Security check
	if strings.Contains(imageName, "..") || strings.Contains(imageName, "/") {
		http.Error(w, "Invalid image name", http.StatusBadRequest)
		return
	}

	imagePath := filepath.Join("./pkg/db/uploads/avatars", imageName)

	// Check if file exists
	if exists, _ := fileExists(imagePath); !exists {
		// Serve default avatar
		imagePath := filepath.Join("./pkg/db/uploads/avatars", imageName)
		if exists, _ := fileExists(imagePath); !exists {
			// Create a simple default avatar if it doesn't exist
			createDefaultAvatar(imagePath)
		}
	}

	// Determine content type from extension
	ext := strings.ToLower(filepath.Ext(imagePath))
	contentType := "image/jpeg"
	switch ext {
	case ".png":
		contentType = "image/png"
	case ".gif":
		contentType = "image/gif"
	}

	w.Header().Set("Content-Type", contentType)
	w.Header().Set("Cache-Control", "public, max-age=86400")
	http.ServeFile(w, r, imagePath)
}

// SearchUsersHandler searches users by username with follow status
func (h *UserHandler) SearchUsersHandler(w http.ResponseWriter, r *http.Request) {
	// Get authenticated user ID from context
	userID := getUserIDFromContext(r)
	if userID == 0 {
		sendUnauthorized(w)
		return
	}

	query := r.URL.Query().Get("q")
	if query == "" {
		http.Error(w, "Search query is required", http.StatusBadRequest)
		return
	}

	limit := 10
	if limitStr := r.URL.Query().Get("limit"); limitStr != "" {
		if l, err := strconv.Atoi(limitStr); err == nil && l > 0 {
			limit = l
		}
	}

	users, err := h.userRepo.SearchByUsername(query, limit)
	if err != nil {
		log.Printf("Error searching users: %v", err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}

	// Filter out current user
	var filteredUsers []*models.User
	for _, u := range users {
		if u.ID != userID {
			filteredUsers = append(filteredUsers, u)
		}
	}

	// Build response with follow status for each user
	type UserWithFollowStatus struct {
		*models.SafeUser
		FollowState string `json:"followState"`
		IsFollowing bool   `json:"isFollowing"`
		IsPending   bool   `json:"isPending"`
	}

	var usersWithStatus []UserWithFollowStatus
	for _, u := range filteredUsers {
		followState := "not_following"
		status, _ := h.followerRepo.GetFollowStatus(userID, u.ID)
		if status == "accepted" {
			followState = "following"
		} else if status == "pending" {
			followState = "pending"
		}

		usersWithStatus = append(usersWithStatus, UserWithFollowStatus{
			SafeUser:    u.Safe(),
			FollowState: followState,
			IsFollowing: followState == "following",
			IsPending:   followState == "pending",
		})
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(usersWithStatus)
}

// Helper functions

func getProfileType(isPublic bool) string {
	if isPublic {
		return "public"
	}
	return "private"
}

func sendUnauthorized(w http.ResponseWriter) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusUnauthorized)
	json.NewEncoder(w).Encode(map[string]interface{}{
		"error":   "Unauthorized",
		"success": false,
	})
}

func createDefaultAvatar(path string) {
	// Create directory if it doesn't exist
	os.MkdirAll(filepath.Dir(path), 0755)

	// For now, we'll just create an empty file
	// In production, you should have a proper default avatar image
	file, err := os.Create(path)
	if err == nil {
		file.Close()
	}
}
