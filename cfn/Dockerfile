# Copyright 2026 Cisco Systems, Inc. and its affiliates
#
# SPDX-License-Identifier: Apache-2.0

# Build from the repository root: docker build -f cfn/Dockerfile .
FROM golang:1.25-alpine AS builder
WORKDIR /src
ENV GOWORK=off
RUN apk add --no-cache ca-certificates
COPY api/go.mod api/go.sum ./api/
COPY cfn/go.mod cfn/go.sum ./cfn/
WORKDIR /src/cfn
RUN go mod download
COPY api/ /src/api/
COPY cfn/ /src/cfn/
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o /cfn ./cmd/cfn

FROM alpine:3.24
WORKDIR /app
RUN apk add --no-cache ca-certificates tzdata && adduser -D -g '' appuser
COPY --from=builder /cfn /app/cfn
USER appuser
EXPOSE 9002 9003
ENTRYPOINT ["/app/cfn"]
