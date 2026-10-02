FROM node:22-alpine AS web-build
WORKDIR /src/web
RUN npm install --global pnpm@10.20.0
COPY web/package.json web/pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY web/ ./
RUN pnpm build

FROM golang:1.27-alpine AS server-build
WORKDIR /src/server
COPY server/go.mod server/go.sum ./
RUN go mod download
COPY server/cmd/ ./cmd/
COPY server/internal/ ./internal/
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/server ./cmd/server

FROM alpine:3.22
RUN addgroup -S app && adduser -S -G app app
WORKDIR /app
COPY --from=server-build --chown=app:app /out/server ./server
COPY --from=web-build --chown=app:app /src/web/dist ./web/dist
COPY --chown=app:app server/words.txt ./words.txt
# Rooms are kept here. Mount a named volume to keep them when the container is replaced.
RUN mkdir /data && chown app:app /data
ENV PORT=8080 DECRYPTO_DB_PATH=/data/decrypto.db
VOLUME /data
EXPOSE 8080
USER app
CMD ["./server"]
