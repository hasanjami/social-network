package handlers

import (
	"encoding/json"
	"net/http"
	"regexp"
	"strings"
	"time"
	"unicode"
	"fmt"
	"io"
	"log"
	"os"
	"path/filepath"

	"backend/pkg/models"
	"backend/pkg/db/repository"
	"golang.org/x/crypto/bcrypt"
)

type AuthHandler struct {
	userRepo    *repository.UserRepository
	sessionRepo *repository.SessionRepository
}

func NewAuthHandler(userRepo *repository.UserRepository, sessionRepo *repository.SessionRepository) *AuthHandler {
	return &AuthHandler{
		userRepo:    userRepo,
		sessionRepo: sessionRepo,
	}
}



func (h *AuthHandler) RegisterHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		sendErrorResponse(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	err := r.ParseMultipartForm(10 << 20) 
	if err != nil {
		sendErrorResponse(w, "Unable to parse form data", http.StatusBadRequest)
		return
	}

	// Get JSON data from form
	jsonData := r.FormValue("data")
	if jsonData == "" {
		sendErrorResponse(w, "Missing form data", http.StatusBadRequest)
		return
	}

	// Parse JSON data
	var req models.RegisterRequest
	if err := json.Unmarshal([]byte(jsonData), &req); err != nil {
		sendErrorResponse(w, "Invalid JSON data", http.StatusBadRequest)
		return
	}

	req.Username = strings.TrimSpace(req.Username)
	req.Email = strings.TrimSpace(req.Email)
	req.FirstName = strings.TrimSpace(req.FirstName)
	req.LastName = strings.TrimSpace(req.LastName)
	req.Nickname = strings.TrimSpace(req.Nickname)
	req.AboutMe = strings.TrimSpace(req.AboutMe)
	req.DateOfBirth = strings.TrimSpace(req.DateOfBirth)

	// Check required fields
	if req.Username == "" || req.Email == "" || req.Password == "" || 
	   req.FirstName == "" || req.LastName == "" || req.DateOfBirth == "" {
		sendErrorResponse(w, "All required fields must be filled", http.StatusBadRequest)
		return
	}

	if !isValidEmail(req.Email) {
		sendErrorResponse(w, "Invalid email format. Example: user@example.com", http.StatusBadRequest)
		return
	}

	if !isValidUsername(req.Username) {
		sendErrorResponse(w, "Username must be 3-20 characters, containing only letters, numbers, underscores (_) or hyphens (-)", http.StatusBadRequest)
		return
	}

	if !isValidPassword(req.Password) {
		sendErrorResponse(w, "Password must be at least 8 characters with uppercase letter, lowercase letter, number and special character (!@#$%^&* etc.)", http.StatusBadRequest)
		return
	}

	if !isValidName(req.FirstName) {
		sendErrorResponse(w, "First name must be 2-50 letters, spaces, hyphens or apostrophes only", http.StatusBadRequest)
		return
	}
	if !isValidName(req.LastName) {
		sendErrorResponse(w, "Last name must be 2-50 letters, spaces, hyphens or apostrophes only", http.StatusBadRequest)
		return
	}

	dob, valid := isValidDateOfBirth(req.DateOfBirth)
	if !valid {
		sendErrorResponse(w, "Invalid date of birth. Format: YYYY-MM-DD. You must be at least 13 years old.", http.StatusBadRequest)
		return
	}

	if req.Nickname != "" && !isValidNickname(req.Nickname) {
		sendErrorResponse(w, "Nickname must be 50 characters or less", http.StatusBadRequest)
		return
	}
	if req.AboutMe != "" && !isValidAboutMe(req.AboutMe) {
		sendErrorResponse(w, "About me must be 500 characters or less", http.StatusBadRequest)
		return
	}

	var avatarFilename *string = nil
	
	file, handler, err := r.FormFile("avatar")
	if err == nil {
		defer file.Close()
		
		// Validate file type
		buff := make([]byte, 512)
		_, err = file.Read(buff)
		if err != nil {
			sendErrorResponse(w, "Invalid file", http.StatusBadRequest)
			return
		}
		file.Seek(0, 0)
		
		contentType := http.DetectContentType(buff)
		allowedTypes := map[string]bool{
			"image/jpeg": true,
			"image/png":  true,
			"image/gif":  true,
		}
		
		if !allowedTypes[contentType] {
			sendErrorResponse(w, "Invalid image type. Only JPEG, PNG, GIF allowed", http.StatusBadRequest)
			return
		}
		
		if handler.Size > 5<<20 { // 5 MB
			sendErrorResponse(w, "File too large. Max 5MB", http.StatusBadRequest)
			return
		}
		
		fileExt := strings.ToLower(strings.TrimPrefix(filepath.Ext(handler.Filename), "."))
		if fileExt == "" {
			// Determine extension from content type
			switch contentType {
			case "image/jpeg":
				fileExt = "jpg"
			case "image/png":
				fileExt = "png"
			case "image/gif":
				fileExt = "gif"
			default:
				fileExt = "jpg"
			}
		}
		
		fileName := fmt.Sprintf("avatar_%s_%d.%s", req.Username, time.Now().Unix(), fileExt)
		
		uploadDir := "./pkg/db/uploads/avatars/"
		if err := os.MkdirAll(uploadDir, 0755); err != nil {
			log.Printf("Failed to create upload directory: %v", err)
			sendErrorResponse(w, "Server error", http.StatusInternalServerError)
			return
		}
		
		filePath := filepath.Join(uploadDir, fileName)
		dst, err := os.Create(filePath)
		if err != nil {
			log.Printf("Failed to create file: %v", err)
			sendErrorResponse(w, "Server error", http.StatusInternalServerError)
			return
		}
		defer dst.Close()
		
		if _, err := io.Copy(dst, file); err != nil {
			log.Printf("Failed to save file: %v", err)
			sendErrorResponse(w, "Server error", http.StatusInternalServerError)
			return
		}
		avatarFilename = &fileName
		
	
	}

	existingUser, _ := h.userRepo.FindByEmail(strings.ToLower(req.Email))
	if existingUser != nil {
		sendErrorResponse(w, "Email already registered", http.StatusConflict)
		return
	}

	// Check if username already exists
	existingUser, _ = h.userRepo.FindByUsername(req.Username)
	if existingUser != nil {
		sendErrorResponse(w, "Username already taken", http.StatusConflict)
		return
	}

	hashedPassword, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	if err != nil {
		sendErrorResponse(w, "Error processing password", http.StatusInternalServerError)
		return
	}

	user := &models.User{
		Username:    req.Username,
		Email:       strings.ToLower(req.Email),
		Password:    string(hashedPassword),
		FirstName:   req.FirstName,
		LastName:    req.LastName,
		DateOfBirth: dob,
		Nickname:    nil,
		AboutMe:     nil,
		Avatar:   avatarFilename,
		IsPublic:    true,
		CreatedAt:   time.Now(),
	}

	// Set optional fields if provided
	if req.Nickname != "" {
		user.Nickname = &req.Nickname
	}
	if req.AboutMe != "" {
		user.AboutMe = &req.AboutMe
	}

	// Save to database
	userID, err := h.userRepo.Create(user)
	if err != nil {
		sendErrorResponse(w, "Failed to create user: "+err.Error(), http.StatusInternalServerError)
		return
	}

	// Create session
	sessionID, err := h.sessionRepo.CreateSession(userID)
	if err != nil {
		sendErrorResponse(w, "Failed to create session", http.StatusInternalServerError)
		return
	}

	// Set session cookie
	http.SetCookie(w, &http.Cookie{
		Name:     "session_id",
		Value:    sessionID,
		Expires:  time.Now().Add(7 * 24 * time.Hour),
		HttpOnly: true,
		Secure:   false,
		SameSite: http.SameSiteLaxMode,
		Path:     "/",
	})

	// Get created user
	createdUser, err := h.userRepo.FindByID(userID)
	if err != nil {
		sendErrorResponse(w, "User created but could not retrieve details", http.StatusInternalServerError)
		return
	}

	response := map[string]interface{}{
		"success": true,
		"message": "Registration successful!",
		"user":    createdUser.Safe(),
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(response)
}

func (h *AuthHandler) LoginHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		sendErrorResponse(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req models.LoginRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		sendErrorResponse(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	// Trim and validate
	req.Email = strings.TrimSpace(req.Email)
	
	if req.Email == "" || req.Password == "" {
		sendErrorResponse(w, "Email and password are required", http.StatusBadRequest)
		return
	}

	if !isValidEmail(req.Email) {
		sendErrorResponse(w, "Invalid email format", http.StatusBadRequest)
		return
	}

	// Find user by email (case-insensitive)
	user, err := h.userRepo.FindByEmail(strings.ToLower(req.Email))
	if err != nil {
		sendErrorResponse(w, "Invalid email or password", http.StatusUnauthorized)
		return
	}
	if user == nil {
		sendErrorResponse(w, "Invalid email or password", http.StatusUnauthorized)
		return
	}

	// Check password
	err = bcrypt.CompareHashAndPassword([]byte(user.Password), []byte(req.Password))
	if err != nil {
		sendErrorResponse(w, "Invalid email or password", http.StatusUnauthorized)
		return
	}

	// Remove any existing session for this user
	h.sessionRepo.RemoveExistingSession(user.ID)

	// Create new session
	sessionID, err := h.sessionRepo.CreateSession(user.ID)
	if err != nil {
		sendErrorResponse(w, "Failed to create session", http.StatusInternalServerError)
		return
	}

	// Set session cookie
	http.SetCookie(w, &http.Cookie{
		Name:     "session_id",
		Value:    sessionID,
		Expires:  time.Now().Add(7 * 24 * time.Hour),
		HttpOnly: true,
		Secure:   false,
		SameSite: http.SameSiteLaxMode,
		Path:     "/",
	})

	response := map[string]interface{}{
		"success": true,
		"message": "Login successful!",
		"user":    user.Safe(),
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

// ========== LOGOUT HANDLER ==========
func (h *AuthHandler) LogoutHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		sendErrorResponse(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// Get session cookie
	cookie, err := r.Cookie("session_id")
	if err == nil && cookie.Value != "" {
		// Delete session from database
		h.sessionRepo.DeleteSession(cookie.Value)
	}

	// Clear cookie
	http.SetCookie(w, &http.Cookie{
		Name:     "session_id",
		Value:    "",
		Expires:  time.Now().Add(-1 * time.Hour),
		HttpOnly: true,
		Secure:   false,
		SameSite: http.SameSiteLaxMode,
		Path:     "/",
	})

	response := map[string]interface{}{
		"success": true,
		"message": "Logged out successfully",
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

// ========== CHECK SESSION HANDLER ==========
func (h *AuthHandler) CheckSessionHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		sendErrorResponse(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// Get session cookie
	cookie, err := r.Cookie("session_id")
	if err != nil {
		// No session found
		json.NewEncoder(w).Encode(map[string]interface{}{
			"isLoggedIn": false,
			"user":       nil,
		})
		return
	}

	// Get user from session
	user, err := h.sessionRepo.GetSessionUser(cookie.Value)
	if err != nil || user == nil {
		// Invalid or expired session
		json.NewEncoder(w).Encode(map[string]interface{}{
			"isLoggedIn": false,
			"user":       nil,
		})
		return
	}

	json.NewEncoder(w).Encode(map[string]interface{}{
		"isLoggedIn": true,
		"user":       user.Safe(),
	})
}

// ========== VALIDATION FUNCTIONS ==========
func isValidEmail(email string) bool {
	email = strings.TrimSpace(email)
	if len(email) > 254 {
		return false
	}
	// Simple but effective email regex
	emailRegex := `^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$`
	re := regexp.MustCompile(emailRegex)
	return re.MatchString(email)
}

func isValidUsername(username string) bool {
	username = strings.TrimSpace(username)
	if len(username) < 3 || len(username) > 20 {
		return false
	}
	// Alphanumeric, underscore, hyphen only
	for _, char := range username {
		if !unicode.IsLetter(char) && !unicode.IsNumber(char) && char != '_' && char != '-' {
			return false
		}
	}
	return true
}

func isValidPassword(password string) bool {
	if len(password) < 8 {
		return false
	}
	
	var hasUpper, hasLower, hasNumber, hasSpecial bool
	for _, char := range password {
		switch {
		case unicode.IsUpper(char):
			hasUpper = true
		case unicode.IsLower(char):
			hasLower = true
		case unicode.IsNumber(char):
			hasNumber = true
		case strings.ContainsAny(string(char), "!@#$%^&*()_+-=[]{}|;:,.<>?/~`"):
			hasSpecial = true
		}
	}
	
	return hasUpper && hasLower && hasNumber && hasSpecial
}

func isValidName(name string) bool {
	name = strings.TrimSpace(name)
	if len(name) < 2 || len(name) > 50 {
		return false
	}
	// Letters, spaces, hyphens, apostrophes only
	for _, char := range name {
		if !unicode.IsLetter(char) && char != ' ' && char != '-' && char != '\'' {
			return false
		}
	}
	return true
}

func isValidDateOfBirth(dateStr string) (time.Time, bool) {
	date, err := time.Parse("2006-01-02", dateStr)
	if err != nil {
		return time.Time{}, false
	}
	
	// Must be at least 13 years old
	now := time.Now()
	age := now.Year() - date.Year()
	if now.YearDay() < date.YearDay() {
		age--
	}
	
	return date, age >= 13
}

func isValidNickname(nickname string) bool {
	return len(strings.TrimSpace(nickname)) <= 50
}

func isValidAboutMe(aboutMe string) bool {
	return len(strings.TrimSpace(aboutMe)) <= 500
}

// Helper for error responses
func sendErrorResponse(w http.ResponseWriter, message string, statusCode int) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(statusCode)
	json.NewEncoder(w).Encode(map[string]interface{}{
		"success": false,
		"error":   message,
	})
}



// func UploadAvatarHandler(w http.ResponseWriter, r *http.Request) {
//     // Get user ID from session
//     userID, ok := r.Context().Value("userID").(int)
//     if !ok {
//         http.Error(w, "Unauthorized", http.StatusUnauthorized)
//         return
//     }
    
//     // Parse multipart form
//     err := r.ParseMultipartForm(10 << 20) // 10 MB
//     if err != nil {
//         http.Error(w, "Unable to parse form", http.StatusBadRequest)
//         return
//     }
    
//     file, handler, err := r.FormFile("avatar")
//     if err != nil {
//         http.Error(w, "No avatar file provided", http.StatusBadRequest)
//         return
//     }
//     defer file.Close()
    
//     // Validate file (same as signup)
//     buff := make([]byte, 512)
//     _, err = file.Read(buff)
//     if err != nil {
//         http.Error(w, "Invalid file", http.StatusBadRequest)
//         return
//     }
//     file.Seek(0, 0)
    
//     contentType := http.DetectContentType(buff)
//     allowedTypes := map[string]bool{
//         "image/jpeg": true,
//         "image/png":  true,
//         "image/gif":  true,
//     }
    
//     if !allowedTypes[contentType] {
//         http.Error(w, "Invalid image type", http.StatusBadRequest)
//         return
//     }
    
//     if handler.Size > 5<<20 {
//         http.Error(w, "File too large. Max 5MB", http.StatusBadRequest)
//         return
//     }
    
//     // Generate unique filename
//     fileExt := strings.ToLower(strings.TrimPrefix(filepath.Ext(handler.Filename), "."))
//     if fileExt == "" {
//         fileExt = "jpg"
//     }
    
//     fileName := fmt.Sprintf("avatar_%d_%d.%s", userID, time.Now().Unix(), fileExt)
//     uploadDir := "./uploads/avatars/"
    
//     if err := os.MkdirAll(uploadDir, 0755); err != nil {
//         log.Printf("Failed to create upload directory: %v", err)
//         http.Error(w, "Server error", http.StatusInternalServerError)
//         return
//     }
    
//     // Delete old avatar if exists
//     // (You'll need to get old avatar URL from database first)
    
//     filePath := filepath.Join(uploadDir, fileName)
//     dst, err := os.Create(filePath)
//     if err != nil {
//         log.Printf("Failed to create file: %v", err)
//         http.Error(w, "Server error", http.StatusInternalServerError)
//         return
//     }
//     defer dst.Close()
    
//     if _, err := io.Copy(dst, file); err != nil {
//         log.Printf("Failed to save file: %v", err)
//         http.Error(w, "Server error", http.StatusInternalServerError)
//         return
//     }
    
//     avatarURL := "/uploads/avatars/" + fileName
    
//     // Update user in database with new avatar URL
//     // db.Exec("UPDATE users SET avatar_url = ? WHERE id = ?", avatarURL, userID)
    
//     json.NewEncoder(w).Encode(map[string]interface{}{
//         "success": true,
//         "message": "Avatar updated successfully",
//         "avatarUrl": avatarURL,
//     })
// }