# Copyright 2026 Cisco Systems, Inc. and its affiliates
#
# SPDX-License-Identifier: Apache-2.0

"""Runtime configuration for A2A, SLIM, and MCP transports."""

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    slim_endpoint: str = "http://localhost:46357"
    slim_namespace: str = "agntcy"
    slim_group: str = "noa-trip-planner-a2a"
    slim_shared_secret: str = Field(
        default="secretsecretsecretsecretsecretsecret", repr=False
    )
    mcp_server_url: str = "http://localhost:8001/mcp"
    a2a_transport: str = "slimrpc"
    agent_role: str = "moderator"
    a2a_http_urls: dict[str, str] = Field(default_factory=dict)
    http_ca_file: str | None = None
    http_cert_file: str | None = None
    http_key_file: str | None = Field(default=None, repr=False)
    mcp_control_url: str | None = None
    tool_transport: str = "mcp"
    agent_request_timeout_seconds: float = 120.0
