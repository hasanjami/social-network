package main

import (
	"log"
	"net/http"
	"os"
	"strings"

	"backend/pkg/db/repository"
	"backend/pkg/db/sqlite"
	"backend/pkg/handlers"
	"backend/pkg/middleware"
	"backend/pkg/ws"
)

func main() {
	db, err := sqlite.ConnectAndMigrate()
	if err != nil {
		log.Fatal(err)
	}
	defer db.Close()

	log.Println("Database setup complete")

	uploadDir := "./pkg/db/uploads/avatars/"
	if err := os.MkdirAll(uploadDir, 0755); err != nil {
		log.Printf("Warning: Failed to create upload directory: %v", err)
	} else {
		log.Printf("Upload directory ready: %s", uploadDir)
	}

	userRepo := repository.NewUserRepository(db)
	sessionRepo := repository.NewSessionRepository(db)
	groupRepo := repository.NewGroupRepository(db)
	followerRepo := repository.NewFollowerRepository(db)
	postRepo := repository.NewPostRepository(db)
	commentRepo := repository.NewCommentRepository(db)
	notificationRepo := repository.NewNotificationRepository(db)
	eventRepo := repository.NewEventRepository(db)
	chatRepo := repository.NewChatRepository(db)

	hub := ws.NewHub()
	go hub.Run()

	authHandler := handlers.NewAuthHandler(userRepo, sessionRepo)
	userHandler := handlers.NewUserHandler(userRepo, followerRepo, postRepo, notificationRepo)
	groupHandler := handlers.NewGroupHandler(groupRepo, userRepo, notificationRepo, hub)
	followerHandler := handlers.NewFollowerHandler(followerRepo, userRepo, notificationRepo, hub)
	postHandler := handlers.NewPostHandler(postRepo, userRepo, followerRepo, commentRepo, groupRepo)
	likeHandler := handlers.NewLikeHandler(postRepo, followerRepo, groupRepo)
	commentHandler := handlers.NewCommentHandler(commentRepo, userRepo, postRepo, groupRepo, followerRepo)
	notificationHandler := handlers.NewNotificationHandler(notificationRepo)
	eventHandler := handlers.NewEventHandler(eventRepo, groupRepo, userRepo, notificationRepo, hub)
	chatHandler := handlers.NewChatHandler(chatRepo, followerRepo, groupRepo, userRepo, hub)

	appCore := middleware.NewAppCore(db)

	mux := http.NewServeMux()

	fs := http.FileServer(http.Dir("./pkg/db/uploads"))
	mux.Handle("/uploads/", http.StripPrefix("/uploads/", fs))

	uploadPostsDir := "./pkg/db/uploads/posts/"
	if err := os.MkdirAll(uploadPostsDir, 0755); err != nil {
		log.Printf("Warning: Failed to create posts upload directory: %v", err)
	}

	// Auth routes (public)
	mux.HandleFunc("/login", authHandler.LoginHandler)
	mux.HandleFunc("/signup", authHandler.RegisterHandler)
	mux.HandleFunc("/api/logout", authHandler.LogoutHandler)
	mux.HandleFunc("/api/check-session", authHandler.CheckSessionHandler)

	// User routes (public but with optional auth)
	mux.HandleFunc("/api/user/", middleware.OptionalAuthMiddleware(appCore, userHandler.GetUserHandler))
	mux.HandleFunc("/api/user/id", userHandler.GetUserByIdHandler)
	mux.HandleFunc("/api/user/avatar", userHandler.GetProfileImageHandler)

	// User routes (protected)
	mux.HandleFunc("/api/user/current", func(w http.ResponseWriter, r *http.Request) {
		middleware.AuthMiddleware(appCore, userHandler.GetCurrentUserHandler)(w, r)
	})
	mux.HandleFunc("/api/users", middleware.AuthMiddleware(appCore, userHandler.GetUsersHandler))
	mux.HandleFunc("/api/users/search", middleware.AuthMiddleware(appCore, userHandler.SearchUsersHandler))
	mux.HandleFunc("/api/user/update", middleware.AuthMiddleware(appCore, userHandler.UpdateUserHandler))

	// Group routes (protected)
	mux.HandleFunc("/api/groups", func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodGet:
			middleware.AuthMiddleware(appCore, groupHandler.GetGroupsHandler)(w, r)
		case http.MethodPost:
			middleware.AuthMiddleware(appCore, groupHandler.CreateGroupHandler)(w, r)
		default:
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		}
	})

	mux.HandleFunc("/api/groups/", func(w http.ResponseWriter, r *http.Request) {
		path := r.URL.Path
		if strings.HasSuffix(path, "/join") {
			middleware.AuthMiddleware(appCore, groupHandler.JoinGroupHandler)(w, r)
			return
		}
		if strings.HasSuffix(path, "/leave") {
			middleware.AuthMiddleware(appCore, groupHandler.LeaveGroupHandler)(w, r)
			return
		}
		if strings.HasSuffix(path, "/invite") {
			middleware.AuthMiddleware(appCore, groupHandler.InviteToGroupHandler)(w, r)
			return
		}
		if strings.HasSuffix(path, "/accept") {
			middleware.AuthMiddleware(appCore, groupHandler.AcceptInviteHandler)(w, r)
			return
		}
		if strings.HasSuffix(path, "/decline") {
			middleware.AuthMiddleware(appCore, groupHandler.DeclineInviteHandler)(w, r)
			return
		}
		if strings.HasSuffix(path, "/posts") && r.Method == http.MethodGet {
			middleware.AuthMiddleware(appCore, postHandler.GetGroupPostsHandler)(w, r)
			return
		}
		if strings.HasSuffix(path, "/members") {
			middleware.AuthMiddleware(appCore, groupHandler.GetGroupMembersHandler)(w, r)
			return
		}
		if strings.HasSuffix(path, "/events") {
			switch r.Method {
			case http.MethodGet:
				middleware.AuthMiddleware(appCore, eventHandler.GetGroupEventsHandler)(w, r)
			case http.MethodPost:
				middleware.AuthMiddleware(appCore, eventHandler.CreateEventHandler)(w, r)
			default:
				http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			}
			return
		}

		switch r.Method {
		case http.MethodGet:
			middleware.AuthMiddleware(appCore, groupHandler.GetGroupHandler)(w, r)
		case http.MethodPut, http.MethodPatch:
			middleware.AuthMiddleware(appCore, groupHandler.UpdateGroupHandler)(w, r)
		case http.MethodDelete:
			middleware.AuthMiddleware(appCore, groupHandler.DeleteGroupHandler)(w, r)
		default:
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		}
	})

	mux.HandleFunc("/api/user/groups", func(w http.ResponseWriter, r *http.Request) {
		middleware.AuthMiddleware(appCore, groupHandler.GetUserGroupsHandler)(w, r)
	})

	// Follower routes (protected)
	mux.HandleFunc("/api/follow", middleware.AuthMiddleware(appCore, followerHandler.FollowHandler))
	mux.HandleFunc("/api/unfollow", middleware.AuthMiddleware(appCore, followerHandler.UnfollowHandler))
	mux.HandleFunc("/api/follow/accept", middleware.AuthMiddleware(appCore, followerHandler.AcceptFollowHandler))
	mux.HandleFunc("/api/follow/decline", middleware.AuthMiddleware(appCore, followerHandler.DeclineFollowHandler))
	mux.HandleFunc("/api/followers", middleware.AuthMiddleware(appCore, followerHandler.GetFollowersHandler))
	mux.HandleFunc("/api/following", middleware.AuthMiddleware(appCore, followerHandler.GetFollowingHandler))
	mux.HandleFunc("/api/follow/pending", middleware.AuthMiddleware(appCore, followerHandler.GetPendingRequestsHandler))

	// Post routes (protected)
	mux.HandleFunc("/api/posts/like", middleware.AuthMiddleware(appCore, likeHandler.ToggleLikeHandler))
	mux.HandleFunc("/api/posts/", middleware.AuthMiddleware(appCore, postHandler.PostMainHandler))
	mux.HandleFunc("/api/posts", middleware.AuthMiddleware(appCore, postHandler.PostMainHandler))

	// Comment routes (protected)
	mux.HandleFunc("/api/comments", middleware.AuthMiddleware(appCore, func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodPost:
			commentHandler.CreateCommentHandler(w, r)
		case http.MethodGet:
			commentHandler.GetCommentsHandler(w, r)
		case http.MethodDelete:
			commentHandler.DeleteCommentHandler(w, r)
		default:
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		}
	}))

	// Notification routes (protected)
	mux.HandleFunc("/api/notifications", middleware.AuthMiddleware(appCore, notificationHandler.GetNotificationsHandler))
	mux.HandleFunc("/api/notifications/read", middleware.AuthMiddleware(appCore, notificationHandler.MarkReadHandler))
	mux.HandleFunc("/api/notifications/read-all", middleware.AuthMiddleware(appCore, notificationHandler.MarkAllReadHandler))

	// Event routes (protected)
	mux.HandleFunc("/api/events/", middleware.AuthMiddleware(appCore, eventHandler.RespondToEventHandler))

	// WebSocket
	mux.HandleFunc("/ws", middleware.AuthMiddleware(appCore, chatHandler.WebSocketHandler))

	// Chat routes (protected)
	mux.HandleFunc("/api/chat/conversations", middleware.AuthMiddleware(appCore, chatHandler.GetConversationsHandler))
	mux.HandleFunc("/api/chat/messages", middleware.AuthMiddleware(appCore, chatHandler.GetMessagesHandler))
	mux.HandleFunc("/api/chat/eligible", middleware.AuthMiddleware(appCore, chatHandler.GetEligibleUsersHandler))

	handler := middleware.CorsMiddleware(mux)

	port := ":8080"
	log.Printf("Server starting on http://localhost%s", port)

	if err := http.ListenAndServe(port, handler); err != nil {
		log.Fatalf("Server failed: %v", err)
	}
}
