FROM golang:1.24-alpine AS builder

WORKDIR /app

RUN apk add --no-cache git ca-certificates tzdata

COPY go.mod go.sum ./
RUN go mod download && go mod verify

COPY . .

RUN CGO_ENABLED=0 GOOS=linux go build -a -installsuffix cgo -o opencode-server .

FROM alpine:latest AS runner

RUN apk add --no-cache ca-certificates tzdata bash

WORKDIR /app

RUN addgroup -g 1000 appgroup && \
    adduser -u 1000 -G appgroup -s /bin/bash -D appuser

COPY --from=builder /app/opencode-server ./
COPY --from=builder /app/configs ./configs
COPY --from=builder /app/skills ./skills

RUN chown -R appuser:appgroup /app

USER appuser

EXPOSE 3000

ENV GIN_MODE=release

ENTRYPOINT ["./opencode-server"]
