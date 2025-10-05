package utils

import (
	"log/slog"
	"os"
)

var Log *slog.Logger = slog.New(
	slog.NewTextHandler(os.Stdout, &slog.HandlerOptions{AddSource: true}),
)

func init() {

}
