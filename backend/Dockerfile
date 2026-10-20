# Build stage
FROM golang:1.24-alpine AS builder

WORKDIR /app

RUN apk add --no-cache gcc musl-dev sqlite-dev

COPY go.mod go.sum ./
RUN go mod download

COPY . .

RUN CGO_ENABLED=1 GOOS=linux go build -o main .

# Runtime stage
FROM alpine:latest

WORKDIR /app

RUN apk add --no-cache sqlite-libs

COPY --from=builder /app/main .
COPY --from=builder /app/pkg/db/migrations ./pkg/db/migrations
COPY --from=builder /app/pkg/db/uploads ./pkg/db/uploads

EXPOSE 8080
CMD ["./main"]
