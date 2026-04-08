package ws

import (
	"encoding/json"
	"log"
	"sync"
	"time"

	"github.com/gorilla/websocket"
)

const (
	writeWait      = 10 * time.Second
	pongWait       = 60 * time.Second
	pingPeriod     = (pongWait * 9) / 10
	maxMessageSize = 4096
)

// Client wraps a single WebSocket connection.
type Client struct {
	hub      *Hub
	conn     *websocket.Conn
	send     chan []byte
	PlayerID string
	Nickname string
	RoomCode string
	mu       sync.Mutex
}

// NewClient constructs a new Client.
func NewClient(hub *Hub, conn *websocket.Conn) *Client {
	return &Client{
		hub:  hub,
		conn: conn,
		send: make(chan []byte, 256),
	}
}

// SendMessage marshals msg to JSON and writes it to the send channel non-blocking.
// If the channel is full the message is dropped.
func (c *Client) SendMessage(msg ServerMessage) {
	data, err := json.Marshal(msg)
	if err != nil {
		log.Printf("ws: marshal error: %v", err)
		return
	}
	select {
	case c.send <- data:
	default:
		log.Printf("ws: send channel full for player %s, dropping message", c.PlayerID)
	}
}

// SendError is a convenience helper for sending an error message to the client.
func (c *Client) SendError(message string) {
	c.SendMessage(ServerMessage{
		Type: MsgError,
		Data: ErrorData{Message: message},
	})
}

// ReadPump reads messages from the WebSocket connection and dispatches them to
// the hub. It runs in its own goroutine. When it exits it unregisters the client
// and closes the underlying connection.
func (c *Client) ReadPump() {
	defer func() {
		c.hub.unregister <- c
		c.conn.Close()
	}()

	c.conn.SetReadLimit(maxMessageSize)
	c.conn.SetReadDeadline(time.Now().Add(pongWait))
	c.conn.SetPongHandler(func(string) error {
		c.conn.SetReadDeadline(time.Now().Add(pongWait))
		return nil
	})

	for {
		_, message, err := c.conn.ReadMessage()
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
				log.Printf("ws: read error for player %s: %v", c.PlayerID, err)
			}
			break
		}

		var msg ClientMessage
		if err := json.Unmarshal(message, &msg); err != nil {
			log.Printf("ws: unmarshal error from player %s: %v", c.PlayerID, err)
			c.SendError("invalid message format")
			continue
		}

		c.hub.HandleMessage(c, msg)
	}
}

// WritePump reads from the send channel and writes messages to the WebSocket
// connection. It also sends periodic pings to keep the connection alive.
func (c *Client) WritePump() {
	ticker := time.NewTicker(pingPeriod)
	defer func() {
		ticker.Stop()
		c.conn.Close()
	}()

	for {
		select {
		case message, ok := <-c.send:
			c.conn.SetWriteDeadline(time.Now().Add(writeWait))
			if !ok {
				// Hub closed the channel.
				c.conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}

			if err := c.conn.WriteMessage(websocket.TextMessage, message); err != nil {
				return
			}

			// Send any queued messages, each in its own frame.
			n := len(c.send)
			for i := 0; i < n; i++ {
				if err := c.conn.WriteMessage(websocket.TextMessage, <-c.send); err != nil {
					return
				}
			}

		case <-ticker.C:
			c.conn.SetWriteDeadline(time.Now().Add(writeWait))
			if err := c.conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
		}
	}
}
