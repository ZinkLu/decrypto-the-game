package main

import (
	"errors"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/ZinkLu/decrypto-the-game/internal/game"
	"github.com/ZinkLu/decrypto-the-game/internal/room"
	"github.com/ZinkLu/decrypto-the-game/internal/server"
	"github.com/ZinkLu/decrypto-the-game/internal/store/sqlite"
	"github.com/ZinkLu/decrypto-the-game/internal/ws"
)

func main() {
	game.RegisterHandlers()
	roomManager := room.NewManager()

	dbPath := os.Getenv("DECRYPTO_DB_PATH")
	if dbPath == "" {
		dbPath = "data/decrypto.db"
	}
	rooms, err := sqlite.Open(dbPath)
	if err != nil {
		log.Fatalf("cannot open the room database: %v", err)
	}

	// Handler needs hub reference. Create handler first with nil hub, then create hub, then set handler.Hub.
	handler := server.NewHandler(roomManager, nil, rooms)
	hub := ws.NewHub(handler.HandleMessage)
	handler.Hub = hub

	// Rooms come back before the first connection is accepted.
	if err := handler.Restore(); err != nil {
		log.Fatalf("cannot restore rooms from %s: %v", dbPath, err)
	}

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
	go func() {
		log.Printf("Starting Encrypto server on port %s, rooms kept in %s", port, dbPath)
		if err := server.ListenAndServe(); !errors.Is(err, http.ErrServerClosed) {
			log.Fatal(err)
		}
	}()

	// Every change is stored as it happens, so stopping loses nothing. Closing
	// the database leaves it complete in its one file.
	stop := make(chan os.Signal, 1)
	signal.Notify(stop, os.Interrupt, syscall.SIGTERM)
	<-stop
	log.Println("Stopping: open rooms return with the next start")
	server.Close()
	if err := rooms.Close(); err != nil {
		log.Printf("closing the room database: %v", err)
	}
}
