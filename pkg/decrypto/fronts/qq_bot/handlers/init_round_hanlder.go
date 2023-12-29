package handlers

import (
	"context"

	"github.com/ZinkLu/decrypto-the-game/pkg/decrypto/api"
	"github.com/tencent-connect/botgo/openapi"
)

func InitRoundHandler(client openapi.OpenAPI) {
	api.RegisterInitHandler(func(ctx context.Context, r *api.Round, ts api.TeamState) {
		initState(client, ctx, r, ts)
	})
}

// listens to channel for events
func initState(client openapi.OpenAPI, ctx context.Context, r *api.Round, ts api.TeamState) {

}
