package main

import (
	"fmt"
	"os"
	"strconv"
	"strings"

	"github.com/ZinkLu/decrypto-the-game/pkg/decrypto/fronts/qq_bot"
)

func main() {
	fmt.Print(3 % 2)
	botId, _ := strconv.ParseUint(os.Getenv("BOT_ID"), 10, 64)
	qq_bot.CreateBot(
		botId,
		os.Getenv("BOT_SECRET"),
		strings.ToLower(os.Getenv("DEBUG")) == "true",
	).Start()
}
