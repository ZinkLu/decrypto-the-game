package main

import (
	"os"
	"strings"

	"github.com/ZinkLu/decrypto-the-game/pkg/decrypto/fronts/qq_bot"
)

func main() {

	qq_bot.CreateBot(
		os.Getenv("BOT_ID"),
		os.Getenv("BOT_SECRET"),
		strings.ToLower(os.Getenv("DEBUG")) == "true",
	).Start()
}
