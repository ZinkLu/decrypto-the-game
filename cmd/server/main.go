package main

import (
	"log"
	"net/http"

	"github.com/ZinkLu/decrypto-the-game/internal/api"
)

func main() {
	// Initialize game API
	gameAPI := api.NewGameAPI()

	// Serve static files from web directory
	http.Handle("/", http.FileServer(http.Dir("../web")))

	// Game API endpoints
	http.HandleFunc("/api/game/create", gameAPI.HandleCreateGame)
	http.HandleFunc("/api/game/join", gameAPI.HandleJoinGame)
	http.HandleFunc("/api/game/status", gameAPI.HandleGameStatus)

	log.Println("Starting Decrypto server on http://localhost:8080")
	log.Fatal(http.ListenAndServe(":8080", nil))
}
