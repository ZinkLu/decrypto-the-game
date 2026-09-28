package main

import (
	"log"
	"net/http"
	"os"
	"time"

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

	mux := http.NewServeMux()
	mux.HandleFunc("/healthz", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			w.Header().Set("Allow", http.MethodGet)
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		w.Header().Set("Cache-Control", "no-store")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("ok\n"))
	})
	mux.Handle("/", http.FileServer(http.Dir("web/dist")))
	// Preview is a client-rendered page and must also work on a direct visit.
	for _, path := range []string{"/preview", "/preview/"} {
		mux.HandleFunc(path, func(w http.ResponseWriter, r *http.Request) {
			http.ServeFile(w, r, "web/dist/index.html")
		})
	}
	mux.HandleFunc("/ws", hub.ServeWS)

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}
	server := &http.Server{Addr: ":" + port, Handler: mux, ReadHeaderTimeout: 10 * time.Second}
	log.Printf("Starting Decrypto server on port %s", port)
	log.Fatal(server.ListenAndServe())
}
