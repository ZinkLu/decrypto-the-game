package main

import (
	"log"
	"net/http"

	"github.com/ZinkLu/decrypto-the-game/internal/game"
	"github.com/ZinkLu/decrypto-the-game/internal/room"
	"github.com/ZinkLu/decrypto-the-game/internal/server"
	"github.com/ZinkLu/decrypto-the-game/internal/ws"
)

func main() {
	game.RegisterHandlers()
	roomManager := room.NewManager()

	// Handler needs hub reference. Create handler first with nil hub, then create hub, then set handler.Hub.
	handler := server.NewHandler(roomManager, nil)
	hub := ws.NewHub(handler.HandleMessage)
	handler.Hub = hub

	go hub.Run()

	http.Handle("/", http.FileServer(http.Dir("web/dist")))
	// Preview is a client-rendered page and must also work on a direct visit.
	for _, path := range []string{"/preview", "/preview/"} {
		http.HandleFunc(path, func(w http.ResponseWriter, r *http.Request) {
			http.ServeFile(w, r, "web/dist/index.html")
		})
	}
	http.HandleFunc("/ws", hub.ServeWS)

	log.Println("Starting Decrypto server on http://localhost:8080")
	log.Fatal(http.ListenAndServe(":8080", nil))
}
