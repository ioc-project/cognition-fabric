# Copyright 2026 Cisco Systems, Inc. and its affiliates
#
# SPDX-License-Identifier: Apache-2.0

FROM python:3.11-slim

# Pin the uv binary. Dependency versions are locked in uv.lock and installed with --frozen.
COPY --from=ghcr.io/astral-sh/uv:0.13.7 /uv /usr/local/bin/uv

# Add user app
RUN useradd -u 1001 app

# Create the app directory and set permissions to app
RUN mkdir /home/app/ && chown -R app:app /home/app

WORKDIR /home/app

# Copy dependency files
COPY --chown=app:app samples/template-ce/pyproject.toml samples/template-ce/uv.lock ./

# Run the application as user app
USER app

# Install dependencies using uv
RUN uv sync --frozen --no-dev

# Copy the source code to the working directory
COPY --chown=app:app samples/template-ce/src/ ./src/

ENV GRPC_PORT=50051
ENV HTTP_PORT=8080
ENV HEALTH_PORT=8081

# gRPC, MAS notifications, health probe
EXPOSE 50051 8080 8081

# Locked venv; do not resolve or sync at startup
CMD [".venv/bin/python", "-m", "src"]
