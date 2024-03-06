package main

import (
	"os"
	"strconv"
	"strings"

	"github.com/ZinkLu/decrypto-the-game/pkg/decrypto/fronts/qq_bot"
)

func main() {
	botId, _ := strconv.ParseUint(os.Getenv("BOT_ID"), 10, 64)
	qq_bot.CreateBot(
		botId,
		os.Getenv("BOT_SECRET"),
		strings.ToLower(os.Getenv("DEBUG")) == "true",
	).Start()
}
