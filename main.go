package main

import (
	"os"
	"strings"

	"github.com/ZinkLu/decrypto-the-game/pkg/decrypto/fronts/discord_bot"
)

func main() {
	discord_bot.CreateBot(
		os.Getenv("BOT_SECRET"),
		strings.ToLower(os.Getenv("DEBUG")) == "true",
	).Start()
}
