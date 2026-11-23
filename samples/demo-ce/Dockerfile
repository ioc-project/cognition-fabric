# Copyright 2026 Cisco Systems, Inc. and its affiliates
#
# SPDX-License-Identifier: Apache-2.0

# Build from the repository root; the API module is a local dependency.
FROM golang:1.27-alpine AS build
WORKDIR /src
ENV GOWORK=off
COPY api/go.mod api/go.sum ./api/
COPY samples/demo-ce/go.mod samples/demo-ce/go.sum ./samples/demo-ce/
WORKDIR /src/samples/demo-ce
RUN go mod download
COPY api/ /src/api/
COPY samples/demo-ce/ /src/samples/demo-ce/
RUN CGO_ENABLED=0 go build -trimpath -ldflags='-s -w' -o /out/demo-ce ./cmd/demo-ce

FROM alpine:3.24
RUN apk add --no-cache ca-certificates && adduser -D -H -u 65532 demo
COPY --from=build /out/demo-ce /usr/local/bin/demo-ce
USER demo
EXPOSE 18000 18001
ENTRYPOINT ["/usr/local/bin/demo-ce"]
