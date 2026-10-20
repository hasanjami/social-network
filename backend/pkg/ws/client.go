package ws

import (
	"log"
	"time"

	"github.com/gorilla/websocket"
)

const (
	// Time allowed to write a message to the peer
	writeWait = 10 * time.Second

	// Time allowed to read the next pong message from the peer
	pongWait = 60 * time.Second

	// Send pings to peer with this period (must be less than pongWait)
	pingPeriod = 54 * time.Second

	// Maximum message size allowed from peer
	maxMessageSize = 4096
)

type Client struct {
	Hub       *Hub
	Conn      *websocket.Conn
	UserID    int
	Send      chan []byte
	OnMessage func(int, []byte)
}

func (c *Client) ReadPump() {
	defer func() {
		c.Hub.unregister <- c
		c.Conn.Close()
		log.Printf("WebSocket connection closed for user %d", c.UserID)
	}()

	// Configure connection
	c.Conn.SetReadLimit(maxMessageSize)
	c.Conn.SetReadDeadline(time.Now().Add(pongWait))
	c.Conn.SetPongHandler(func(string) error {
		c.Conn.SetReadDeadline(time.Now().Add(pongWait))
		log.Printf("Received pong from user %d", c.UserID)
		return nil
	})

	log.Printf("WebSocket ReadPump started for user %d", c.UserID)

	for {
		_, message, err := c.Conn.ReadMessage()
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseNormalClosure, websocket.CloseAbnormalClosure) {
				log.Printf("WebSocket unexpected close error for user %d: %v", c.UserID, err)
			} else {
				log.Printf("WebSocket read error for user %d: %v", c.UserID, err)
			}
			break
		}
		if c.OnMessage != nil {
			c.OnMessage(c.UserID, message)
		}
	}
}

func (c *Client) WritePump() {
	ticker := time.NewTicker(pingPeriod)
	defer func() {
		ticker.Stop()
		c.Conn.Close()
		log.Printf("WebSocket WritePump stopped for user %d", c.UserID)
	}()

	log.Printf("WebSocket WritePump started for user %d", c.UserID)

	for {
		select {
		case message, ok := <-c.Send:
			c.Conn.SetWriteDeadline(time.Now().Add(writeWait))
			if !ok {
				// Hub closed the channel
				c.Conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}

			err := c.Conn.WriteMessage(websocket.TextMessage, message)
			if err != nil {
				log.Printf("WebSocket write error for user %d: %v", c.UserID, err)
				return
			}

		case <-ticker.C:
			// Send ping to keep connection alive
			c.Conn.SetWriteDeadline(time.Now().Add(writeWait))
			if err := c.Conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				log.Printf("WebSocket ping error for user %d: %v", c.UserID, err)
				return
			}
			log.Printf("Sent ping to user %d", c.UserID)
		}
	}
}
