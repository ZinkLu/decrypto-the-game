# Entry points for the three parts: server/ (Go), web/ (the Console), assets/ (model and sound sources).
# The server runs from the repository root, where it finds web/dist and keeps data/.
# The word list is compiled into the binary, so nothing else is needed beside it.

.PHONY: build build-server build-web run dev-web test test-server test-web docker

build: build-web build-server

build-server:
	cd server && CGO_ENABLED=0 go build -o ../bin/server ./cmd/server

build-web:
	cd web && pnpm install && pnpm build

run: build
	./bin/server

# Port 3000, proxies /ws to a server on 8080 (make run in another terminal).
dev-web:
	cd web && pnpm dev

test: test-server test-web

test-server:
	cd server && go test ./...

test-web:
	cd web && pnpm test && pnpm build

docker:
	docker build -t decrypto-demo:latest .
