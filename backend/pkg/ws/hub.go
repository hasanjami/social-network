package ws

import (
	"log"
	"sync"
)

type Hub struct {
	clients    map[int]*Client
	register   chan *Client
	unregister chan *Client
	mu         sync.Mutex
}

func NewHub() *Hub {
	return &Hub{
		clients:    make(map[int]*Client),
		register:   make(chan *Client),
		unregister: make(chan *Client),
	}
}

func (h *Hub) Run() {
	log.Println("WebSocket Hub started")
	for {
		select {
		case client := <-h.register:
			h.mu.Lock()
			// close old connection if same user reconnects
			if old, ok := h.clients[client.UserID]; ok {
				log.Printf("User %d reconnecting, closing old connection", client.UserID)
				close(old.Send)
			}
			h.clients[client.UserID] = client
			log.Printf("User %d connected. Total connections: %d", client.UserID, len(h.clients))
			h.mu.Unlock()

		case client := <-h.unregister:
			h.mu.Lock()
			if cur, ok := h.clients[client.UserID]; ok && cur == client {
				delete(h.clients, client.UserID)
				close(client.Send)
				log.Printf("User %d disconnected. Total connections: %d", client.UserID, len(h.clients))
			}
			h.mu.Unlock()
		}
	}
}

func (h *Hub) Register(client *Client) {
	h.register <- client
}

func (h *Hub) SendToUser(userID int, data []byte) {
	h.mu.Lock()
	client, ok := h.clients[userID]
	h.mu.Unlock()
	if ok {
		select {
		case client.Send <- data:
			log.Printf("Message sent to user %d", userID)
		default:
			log.Printf("Failed to send message to user %d: channel full", userID)
		}
	} else {
		log.Printf("User %d not connected, message not sent", userID)
	}
}

func (h *Hub) SendToUsers(userIDs []int, data []byte) {
	for _, id := range userIDs {
		h.SendToUser(id, data)
	}
}

func (h *Hub) IsOnline(userID int) bool {
	h.mu.Lock()
	_, ok := h.clients[userID]
	h.mu.Unlock()
	return ok
}
