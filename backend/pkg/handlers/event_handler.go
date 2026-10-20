package handlers

import (
	"encoding/json"
	"log"
	"net/http"
	"strconv"
	"strings"
	"time"

	"backend/pkg/db/repository"
	"backend/pkg/ws"
)

type EventHandler struct {
	eventRepo        *repository.EventRepository
	groupRepo        *repository.GroupRepository
	userRepo         *repository.UserRepository
	notificationRepo *repository.NotificationRepository
	hub              *ws.Hub
}

func NewEventHandler(eventRepo *repository.EventRepository, groupRepo *repository.GroupRepository, userRepo *repository.UserRepository, notificationRepo *repository.NotificationRepository, hub *ws.Hub) *EventHandler {
	return &EventHandler{
		eventRepo:        eventRepo,
		groupRepo:        groupRepo,
		userRepo:         userRepo,
		notificationRepo: notificationRepo,
		hub:              hub,
	}
}

func (h *EventHandler) CreateEventHandler(w http.ResponseWriter, r *http.Request) {
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
	if len(parts) < 4 {
		http.Error(w, "Group ID is required", http.StatusBadRequest)
		return
	}

	groupID, err := strconv.Atoi(parts[2])
	if err != nil || groupID <= 0 {
		http.Error(w, "Invalid group ID", http.StatusBadRequest)
		return
	}

	isMember, status, _, err := h.groupRepo.IsMember(groupID, userID)
	if err != nil {
		log.Printf("Error checking membership: %v", err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}
	if !isMember || status != "accepted" {
		http.Error(w, "You must be a group member to create events", http.StatusForbidden)
		return
	}

	var req struct {
		Title       string    `json:"title"`
		Description *string   `json:"description"`
		EventDate   time.Time `json:"eventDate"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	if req.Title == "" {
		http.Error(w, "title is required", http.StatusBadRequest)
		return
	}

	if req.EventDate.IsZero() {
		http.Error(w, "eventDate is required", http.StatusBadRequest)
		return
	}

	event, err := h.eventRepo.CreateEvent(groupID, userID, req.Title, req.Description, req.EventDate)
	if err != nil {
		log.Printf("Error creating event: %v", err)
		http.Error(w, "Failed to create event", http.StatusInternalServerError)
		return
	}

	sender, _ := h.userRepo.FindByID(userID)
	members, _ := h.groupRepo.GetMembers(groupID, "accepted")
	for _, m := range members {
		if m.UserID == userID {
			continue
		}
		content := "New event: " + req.Title
		if sender != nil {
			content = sender.Username + " created an event: " + req.Title
		}
		h.notificationRepo.Create(m.UserID, userID, event.ID, "event_creation", content)

		// push via websocket
		wsData, _ := json.Marshal(map[string]interface{}{
			"type":      "event_creation",
			"senderId":  userID,
			"groupId":   groupID,
			"eventId":   event.ID,
			"message":   content,
			"timestamp": time.Now().Format(time.RFC3339),
		})
		h.hub.SendToUser(m.UserID, wsData)
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
		"event":   event,
	})
}

func (h *EventHandler) GetGroupEventsHandler(w http.ResponseWriter, r *http.Request) {
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
	if len(parts) < 4 {
		http.Error(w, "Group ID is required", http.StatusBadRequest)
		return
	}

	groupID, err := strconv.Atoi(parts[2])
	if err != nil || groupID <= 0 {
		http.Error(w, "Invalid group ID", http.StatusBadRequest)
		return
	}

	isMember, status, _, err := h.groupRepo.IsMember(groupID, userID)
	if err != nil {
		log.Printf("Error checking membership: %v", err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}
	if !isMember || status != "accepted" {
		http.Error(w, "You must be a group member to view events", http.StatusForbidden)
		return
	}

	events, err := h.eventRepo.GetEventsByGroupID(groupID)
	if err != nil {
		log.Printf("Error getting events: %v", err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}

	result := []interface{}{}
	for _, e := range events {
		going, notGoing, _ := h.eventRepo.CountResponses(e.ID)
		myResponse, _ := h.eventRepo.GetUserResponse(e.ID, userID)

		entry := map[string]interface{}{
			"id":          e.ID,
			"groupId":     e.GroupID,
			"creatorId":   e.CreatorID,
			"title":       e.Title,
			"description": e.Description,
			"eventDate":   e.EventDate,
			"createdAt":   e.CreatedAt,
			"going":       going,
			"notGoing":    notGoing,
			"myResponse":  myResponse,
		}

		creator, err := h.userRepo.FindByID(e.CreatorID)
		if err == nil && creator != nil {
			entry["creator"] = creator.Safe()
		}

		result = append(result, entry)
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
		"events":  result,
	})
}

func (h *EventHandler) RespondToEventHandler(w http.ResponseWriter, r *http.Request) {
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
	if len(parts) < 4 {
		http.Error(w, "Event ID is required", http.StatusBadRequest)
		return
	}

	eventID, err := strconv.Atoi(parts[2])
	if err != nil || eventID <= 0 {
		http.Error(w, "Invalid event ID", http.StatusBadRequest)
		return
	}

	event, err := h.eventRepo.GetEventByID(eventID)
	if err != nil {
		log.Printf("Error getting event: %v", err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}
	if event == nil {
		http.Error(w, "Event not found", http.StatusNotFound)
		return
	}

	isMember, status, _, err := h.groupRepo.IsMember(event.GroupID, userID)
	if err != nil {
		log.Printf("Error checking membership: %v", err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}
	if !isMember || status != "accepted" {
		http.Error(w, "You must be a group member to respond to events", http.StatusForbidden)
		return
	}

	var req struct {
		Response string `json:"response"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	if req.Response != "going" && req.Response != "not_going" {
		http.Error(w, "response must be going or not_going", http.StatusBadRequest)
		return
	}

	if err := h.eventRepo.RespondToEvent(eventID, userID, req.Response); err != nil {
		log.Printf("Error responding to event: %v", err)
		http.Error(w, "Failed to respond to event", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
	})
}
