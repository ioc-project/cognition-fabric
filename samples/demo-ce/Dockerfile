# syntax=docker/dockerfile:1.7

# Copyright 2026 Cisco Systems, Inc. and its affiliates
#
# SPDX-License-Identifier: Apache-2.0

# Build context: this directory. Needs a GitHub token for the private ioc-scale-cfn-svc module:
#   docker build --secret id=github_token,env=GITHUB_TOKEN -t demo-ce:dev .
FROM golang:1.25-alpine AS build
RUN apk add --no-cache git
ENV GOPRIVATE=github.com/cisco-eti/* GONOSUMDB=github.com/cisco-eti/*
WORKDIR /src
COPY go.mod go.sum ./
RUN --mount=type=secret,id=github_token,required=true \
    trap 'rm -f /root/.gitconfig' EXIT; \
    token="$(cat /run/secrets/github_token)" && \
    git config --global url."https://x-access-token:${token}@github.com/".insteadOf "https://github.com/" && \
    go mod download
COPY cmd ./cmd
COPY internal ./internal
COPY pkg ./pkg
RUN CGO_ENABLED=0 go build -trimpath -ldflags='-s -w' -o /out/demo-ce ./cmd/demo-ce

FROM alpine:3.21
RUN apk add --no-cache ca-certificates && adduser -D -H -u 65532 demo
COPY --from=build /out/demo-ce /usr/local/bin/demo-ce
USER demo
EXPOSE 18000 18001
ENTRYPOINT ["/usr/local/bin/demo-ce"]
