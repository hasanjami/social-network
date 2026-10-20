package handlers

import (
	"encoding/json"
	"log"
	"net/http"
	"sort"
	"strconv"
	"time"

	"backend/pkg/db/repository"
	"backend/pkg/ws"

	"github.com/gorilla/websocket"
)

var upgrader = websocket.Upgrader{
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
	CheckOrigin: func(r *http.Request) bool {
		return true
	},
}

type ChatHandler struct {
	chatRepo     *repository.ChatRepository
	followerRepo *repository.FollowerRepository
	groupRepo    *repository.GroupRepository
	userRepo     *repository.UserRepository
	hub          *ws.Hub
}

func NewChatHandler(chatRepo *repository.ChatRepository, followerRepo *repository.FollowerRepository, groupRepo *repository.GroupRepository, userRepo *repository.UserRepository, hub *ws.Hub) *ChatHandler {
	return &ChatHandler{
		chatRepo:     chatRepo,
		followerRepo: followerRepo,
		groupRepo:    groupRepo,
		userRepo:     userRepo,
		hub:          hub,
	}
}

func (h *ChatHandler) WebSocketHandler(w http.ResponseWriter, r *http.Request) {
	userID := getUserIDFromContext(r)
	if userID == 0 {
		sendUnauthorized(w)
		return
	}

	// upgrade to websocket
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("websocket upgrade error: %v", err)
		return
	}

	client := &ws.Client{
		Hub:       h.hub,
		Conn:      conn,
		UserID:    userID,
		Send:      make(chan []byte, 256),
		OnMessage: h.handleMessage,
	}

	h.hub.Register(client)
	go client.WritePump()
	go client.ReadPump()
}

func (h *ChatHandler) handleMessage(senderID int, raw []byte) {
	var msg struct {
		Type       string `json:"type"`
		ReceiverID int    `json:"receiverId,omitempty"`
		GroupID    int    `json:"groupId,omitempty"`
		Content    string `json:"content,omitempty"`
	}
	if err := json.Unmarshal(raw, &msg); err != nil {
		return
	}

	switch msg.Type {
	case "chat":
		if msg.ReceiverID != 0 {
			h.handlePrivateMessage(senderID, msg.ReceiverID, msg.Content)
		} else if msg.GroupID != 0 {
			h.handleGroupMessage(senderID, msg.GroupID, msg.Content)
		}
	case "typing":
		h.handleTyping(senderID, msg.ReceiverID, msg.GroupID)
	}
}

func (h *ChatHandler) handlePrivateMessage(senderID, receiverID int, content string) {
	if content == "" {
		return
	}

	// check if they follow each other
	aFollowsB, _ := h.followerRepo.IsFollowing(senderID, receiverID)
	bFollowsA, _ := h.followerRepo.IsFollowing(receiverID, senderID)
	if !aFollowsB && !bFollowsA {
		// allow only if recipient has a public profile (per spec)
		receiver, _ := h.userRepo.FindByID(receiverID)
		if receiver == nil || !receiver.IsPublic {
			return
		}
	}

	msg, err := h.chatRepo.SaveMessage(senderID, &receiverID, nil, content)
	if err != nil {
		log.Printf("error saving message: %v", err)
		return
	}

	h.chatRepo.AddChatNotify(msg.ID, receiverID)

	response, _ := json.Marshal(map[string]interface{}{
		"type":       "chat",
		"id":         msg.ID,
		"senderId":   senderID,
		"receiverId": receiverID,
		"content":    content,
		"createdAt":  msg.CreatedAt.Format(time.RFC3339),
	})

	h.hub.SendToUser(receiverID, response)
	h.hub.SendToUser(senderID, response)
}

func (h *ChatHandler) handleGroupMessage(senderID, groupID int, content string) {
	if content == "" {
		return
	}

	// check group membership
	isMember, status, _, _ := h.groupRepo.IsMember(groupID, senderID)
	if !isMember || status != "accepted" {
		return
	}

	msg, err := h.chatRepo.SaveMessage(senderID, nil, &groupID, content)
	if err != nil {
		log.Printf("error saving group message: %v", err)
		return
	}

	members, _ := h.groupRepo.GetMembers(groupID, "accepted")

	response, _ := json.Marshal(map[string]interface{}{
		"type":      "chat",
		"id":        msg.ID,
		"senderId":  senderID,
		"groupId":   groupID,
		"content":   content,
		"createdAt": msg.CreatedAt.Format(time.RFC3339),
	})

	for _, m := range members {
		if m.UserID == senderID {
			continue
		}
		h.chatRepo.AddChatNotify(msg.ID, m.UserID)
		h.hub.SendToUser(m.UserID, response)
	}

	// echo back to sender
	h.hub.SendToUser(senderID, response)
}

func (h *ChatHandler) handleTyping(senderID, receiverID, groupID int) {
	data, _ := json.Marshal(map[string]interface{}{
		"type":     "typing",
		"senderId": senderID,
	})

	if receiverID != 0 {
		h.hub.SendToUser(receiverID, data)
	} else if groupID != 0 {
		members, _ := h.groupRepo.GetMembers(groupID, "accepted")
		for _, m := range members {
			if m.UserID == senderID {
				continue
			}
			h.hub.SendToUser(m.UserID, data)
		}
	}
}

func (h *ChatHandler) GetConversationsHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	userID := getUserIDFromContext(r)
	if userID == 0 {
		sendUnauthorized(w)
		return
	}

	conversations := []interface{}{}

	// private conversations
	partnerIDs, _ := h.chatRepo.GetPrivateConversations(userID)
	for _, partnerID := range partnerIDs {
		partner, err := h.userRepo.FindByID(partnerID)
		if err != nil || partner == nil {
			continue
		}

		lastMsg, _ := h.chatRepo.GetLastPrivateMessage(userID, partnerID)
		unread, _ := h.chatRepo.CountConversationUnread(userID, partnerID)

		entry := map[string]interface{}{
			"type":   "private",
			"user":   partner.Safe(),
			"unread": unread,
			"online": h.hub.IsOnline(partnerID),
		}

		if lastMsg != nil {
			entry["lastMessage"] = lastMsg.Content
			entry["lastTime"] = lastMsg.CreatedAt
		}

		conversations = append(conversations, entry)
	}

	// group conversations
	groupIDs, _ := h.chatRepo.GetGroupConversations(userID)
	for _, gID := range groupIDs {
		group, err := h.groupRepo.FindByID(gID)
		if err != nil || group == nil {
			continue
		}

		lastMsg, _ := h.chatRepo.GetLastGroupMessage(gID)
		unread, _ := h.chatRepo.CountGroupUnread(userID, gID)

		entry := map[string]interface{}{
			"type":   "group",
			"group":  group,
			"unread": unread,
		}

		if lastMsg != nil {
			entry["lastMessage"] = lastMsg.Content
			entry["lastTime"] = lastMsg.CreatedAt
		}

		conversations = append(conversations, entry)
	}

	// sort by last message time
	sort.Slice(conversations, func(i, j int) bool {
		var iTime, jTime time.Time
		if m, ok := conversations[i].(map[string]interface{}); ok {
			if t, ok := m["lastTime"].(time.Time); ok {
				iTime = t
			}
		}
		if m, ok := conversations[j].(map[string]interface{}); ok {
			if t, ok := m["lastTime"].(time.Time); ok {
				jTime = t
			}
		}
		return iTime.After(jTime)
	})

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"success":       true,
		"conversations": conversations,
	})
}

func (h *ChatHandler) GetMessagesHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	userID := getUserIDFromContext(r)
	if userID == 0 {
		sendUnauthorized(w)
		return
	}

	limit := 20
	offset := 0
	if l := r.URL.Query().Get("limit"); l != "" {
		if parsed, err := strconv.Atoi(l); err == nil && parsed > 0 {
			limit = parsed
		}
	}
	if o := r.URL.Query().Get("offset"); o != "" {
		if parsed, err := strconv.Atoi(o); err == nil && parsed >= 0 {
			offset = parsed
		}
	}

	userIDParam := r.URL.Query().Get("user_id")
	groupIDParam := r.URL.Query().Get("group_id")

	if userIDParam != "" {
		targetID, err := strconv.Atoi(userIDParam)
		if err != nil {
			http.Error(w, "Invalid user_id", http.StatusBadRequest)
			return
		}

		messages, err := h.chatRepo.GetPrivateMessages(userID, targetID, limit, offset)
		if err != nil {
			log.Printf("error getting messages: %v", err)
			http.Error(w, "Internal server error", http.StatusInternalServerError)
			return
		}

		// clear unread for this conversation
		h.chatRepo.ClearChatNotify(userID, targetID)

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"success":  true,
			"messages": messages,
		})
		return
	}

	if groupIDParam != "" {
		groupID, err := strconv.Atoi(groupIDParam)
		if err != nil {
			http.Error(w, "Invalid group_id", http.StatusBadRequest)
			return
		}

		// check membership
		isMember, status, _, _ := h.groupRepo.IsMember(groupID, userID)
		if !isMember || status != "accepted" {
			http.Error(w, "You must be a group member", http.StatusForbidden)
			return
		}

		messages, err := h.chatRepo.GetGroupMessages(groupID, limit, offset)
		if err != nil {
			log.Printf("error getting group messages: %v", err)
			http.Error(w, "Internal server error", http.StatusInternalServerError)
			return
		}

		// clear unread for this group
		h.chatRepo.ClearGroupChatNotify(userID, groupID)

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"success":  true,
			"messages": messages,
		})
		return
	}

	http.Error(w, "user_id or group_id is required", http.StatusBadRequest)
}

func (h *ChatHandler) GetEligibleUsersHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	userID := getUserIDFromContext(r)
	if userID == 0 {
		sendUnauthorized(w)
		return
	}

	// people who follow me + people I follow = people I can chat with
	followers, _ := h.followerRepo.GetFollowers(userID)
	following, _ := h.followerRepo.GetFollowing(userID)

	seen := map[int]bool{}
	result := []interface{}{}

	for _, u := range followers {
		if !seen[u.ID] {
			seen[u.ID] = true
			result = append(result, map[string]interface{}{
				"user":   u.Safe(),
				"online": h.hub.IsOnline(u.ID),
			})
		}
	}

	for _, u := range following {
		if !seen[u.ID] {
			seen[u.ID] = true
			result = append(result, map[string]interface{}{
				"user":   u.Safe(),
				"online": h.hub.IsOnline(u.ID),
			})
		}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
		"users":   result,
	})
}
