package ws

import (
	"log"
	"net"
	"net/http"
	"net/url"
	"os"
	"strings"
	"sync"

	"github.com/gorilla/websocket"
)

// MessageHandler is the function signature for handling inbound client messages.
type MessageHandler func(client *Client, msg ClientMessage)

// Hub manages all WebSocket connections and room-scoped broadcasting.
type Hub struct {
	clients    map[*Client]bool
	rooms      map[string]map[*Client]bool // roomCode -> set of clients
	register   chan *Client
	unregister chan *Client
	handler    MessageHandler
	mu         sync.RWMutex
}

// NewHub constructs a new Hub with the given message handler.
func NewHub(handler MessageHandler) *Hub {
	return &Hub{
		clients:    make(map[*Client]bool),
		rooms:      make(map[string]map[*Client]bool),
		register:   make(chan *Client, 16),
		unregister: make(chan *Client, 16),
		handler:    handler,
	}
}

// Run is the main event loop goroutine. It handles registration and
// unregistration of clients.
func (h *Hub) Run() {
	for {
		select {
		case client := <-h.register:
			h.mu.Lock()
			h.clients[client] = true
			h.mu.Unlock()

		case client := <-h.unregister:
			h.mu.Lock()
			if _, ok := h.clients[client]; ok {
				delete(h.clients, client)
				client.Close()

				// Remove from room if the client was in one.
				if client.Identity().RoomCode != "" {
					if room, exists := h.rooms[client.Identity().RoomCode]; exists {
						delete(room, client)
						if len(room) == 0 {
							delete(h.rooms, client.Identity().RoomCode)
						}
					}
				}
			}
			h.mu.Unlock()

			// Notify the application layer about the disconnection.
			if h.handler != nil {
				h.handler(client, ClientMessage{Type: "_disconnect"})
			}
		}
	}
}

// JoinRoom adds client to the given room's broadcast group. If the client was
// already in another room it is removed from that room first.
func (h *Hub) JoinRoom(client *Client, roomCode string) {
	h.mu.Lock()
	defer h.mu.Unlock()

	// Leave old room if any.
	if client.Identity().RoomCode != "" && client.Identity().RoomCode != roomCode {
		if oldRoom, exists := h.rooms[client.Identity().RoomCode]; exists {
			delete(oldRoom, client)
			if len(oldRoom) == 0 {
				delete(h.rooms, client.Identity().RoomCode)
			}
		}
	}

	client.setRoom(roomCode)

	if h.rooms[roomCode] == nil {
		h.rooms[roomCode] = make(map[*Client]bool)
	}
	h.rooms[roomCode][client] = true
}

// BroadcastToRoom sends msg to every client currently in the given room.
func (h *Hub) BroadcastToRoom(roomCode string, msg ServerMessage) {
	h.mu.RLock()
	room := h.rooms[roomCode]
	// Snapshot the client set so we can release the lock before sending.
	targets := make([]*Client, 0, len(room))
	for c := range room {
		targets = append(targets, c)
	}
	h.mu.RUnlock()

	for _, c := range targets {
		c.SendMessage(msg)
	}
}

// SendToPlayer sends msg to the specific player (by PlayerID) within a room.
func (h *Hub) SendToPlayer(roomCode, playerID string, msg ServerMessage) {
	h.mu.RLock()
	room := h.rooms[roomCode]
	var target *Client
	for c := range room {
		if c.Identity().PlayerID == playerID {
			target = c
			break
		}
	}
	h.mu.RUnlock()

	if target == nil {
		log.Printf("ws: player %s not found in room %s", playerID, roomCode)
		return
	}
	target.SendMessage(msg)
}

// GetRoomClients returns a snapshot of all clients currently in a room.
func (h *Hub) GetRoomClients(roomCode string) []*Client {
	h.mu.RLock()
	defer h.mu.RUnlock()

	room := h.rooms[roomCode]
	clients := make([]*Client, 0, len(room))
	for c := range room {
		clients = append(clients, c)
	}
	return clients
}

// HandleMessage delegates an inbound message to the registered handler.
func (h *Hub) HandleMessage(client *Client, msg ClientMessage) {
	if h.handler != nil {
		h.handler(client, msg)
	}
}

var upgrader = websocket.Upgrader{
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
	CheckOrigin:     allowedOrigin,
}

// Browser WebSocket connections must come from this site. Local Vite development
// uses a different port, while deployments with a rewritten Host may specify
// exact extra origins with DECRYPTO_ALLOWED_ORIGINS.
func allowedOrigin(r *http.Request) bool {
	origin := r.Header.Get("Origin")
	if origin == "" {
		return true // Non-browser clients do not send Origin.
	}
	u, err := url.Parse(origin)
	if err != nil || (u.Scheme != "http" && u.Scheme != "https") || u.Host == "" || u.User != nil || u.Path != "" || u.RawQuery != "" || u.Fragment != "" {
		return false
	}
	if strings.EqualFold(u.Host, r.Host) {
		return true
	}
	host := r.Host
	if parsed, err := url.Parse("//" + host); err == nil {
		host = parsed.Hostname()
	}
	if loopbackHost(host) && loopbackHost(u.Hostname()) {
		return true
	}
	for _, allowed := range strings.Split(os.Getenv("DECRYPTO_ALLOWED_ORIGINS"), ",") {
		if strings.EqualFold(strings.TrimSpace(allowed), origin) {
			return true
		}
	}
	return false
}

func loopbackHost(host string) bool {
	if strings.EqualFold(host, "localhost") {
		return true
	}
	ip := net.ParseIP(host)
	return ip != nil && ip.IsLoopback()
}

// ServeWS upgrades an HTTP request to a WebSocket connection, creates a Client,
// registers it with the hub and starts its read/write goroutines.
func (h *Hub) ServeWS(w http.ResponseWriter, r *http.Request) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("ws: upgrade error: %v", err)
		return
	}

	client := NewClient(h, conn)
	h.register <- client

	go client.WritePump()
	go client.ReadPump()
}
