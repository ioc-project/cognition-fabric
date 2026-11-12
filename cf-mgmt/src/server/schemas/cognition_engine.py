# Copyright 2026 Cisco Systems, Inc. and its affiliates
#
# SPDX-License-Identifier: Apache-2.0

"""Cognition Engine schemas"""

from server.utils.timestamps import UtcDateTime
from enum import Enum
from typing import List, Literal, Optional

from pydantic import BaseModel, Field, model_validator

HEALTH_URL_PATTERN = r"^https?://\S+$"


# The enforcing, health and notification fields of a CE
CE_CONNECTION_FIELDS = (
    "enforcing_url",
    "enforcing_endpoint",
    "enforcing_protocol",
    "health_url",
    "health_endpoint",
    "health_protocol",
    "notification_url",
    "notification_endpoint",
    "notification_protocol",
)


def ce_connection(source) -> dict:
    """The CE connection fields of a CE row or request, as keyword arguments."""
    return {field: getattr(source, field) for field in CE_CONNECTION_FIELDS}


def connection_error(
    enforcing_url: Optional[str],
    enforcing_endpoint: Optional[str],
    health_endpoint: str,
    notification_url: Optional[str],
    notification_endpoint: Optional[str],
) -> Optional[str]:
    """Return why a CE's endpoints are inconsistent, or None."""
    # Enforcing is optional, but it is gRPC only today and a gRPC address (host:port) has no service name
    if bool(enforcing_url) != bool(enforcing_endpoint):
        return "enforcing_url and enforcing_endpoint must be set together"
    # CFN joins notification_url and notification_endpoint, and skips the CE unless both are set
    if bool(notification_url) != bool(notification_endpoint):
        return "notification_url and notification_endpoint must be set together"
    if not health_endpoint:
        return "health_endpoint is required"
    # health and notification are HTTP, where the endpoint is a path
    for name, value in (("health_endpoint", health_endpoint), ("notification_endpoint", notification_endpoint)):
        if value and not value.startswith("/"):
            return f"{name} must start with '/'"
    return None


class CEConnection(BaseModel):
    """How CFN reaches a CE: one url, endpoint and protocol per purpose."""

    enforcing_url: Optional[str] = None
    enforcing_endpoint: Optional[str] = None
    enforcing_protocol: Optional[str] = None
    health_url: str
    health_endpoint: str
    health_protocol: str
    notification_url: Optional[str] = None
    notification_endpoint: Optional[str] = None
    notification_protocol: Optional[str] = None


class CEType(str, Enum):
    """Type of Cognition Engine.

    - CASA: Gateway CE for L9 enforcement
    - DETECTIVE: Detective CE for investigation/analysis
    """

    CASA = "CASA"
    DETECTIVE = "DETECTIVE"


class CognitionEngineRegisterRequest(BaseModel):
    """Schema for CE self-registration.

    POST behavior:
    - If (cfn_id, name, version) exists: returns 409 Conflict with existing_ce_id
    - If (cfn_id, name) exists with different version: creates new CE record
    - Otherwise: creates new CE record
    """

    cfn_id: str = Field(..., description="CFN this engine is registering under")
    name: str = Field(..., description="CE name (e.g., 'demo-ce')")
    version: str = Field(..., description="CE version (e.g., '1.0.0')")
    ce_type: CEType = Field(..., description="Type of Cognition Engine: CASA or DETECTIVE")
    enforcing_url: Optional[str] = Field(
        None, description="gRPC address CFN sends enforcement requests to (e.g., 'demo-ce:50051'). Optional"
    )
    enforcing_endpoint: Optional[str] = Field(
        None,
        description="gRPC service name (e.g., 'ioc.ce.v1.CognitionEngine'). Required when enforcing_url is set.",
    )
    enforcing_protocol: Literal["grpc"] = Field("grpc", description="Enforcement protocol")
    health_url: str = Field(
        ...,
        pattern=HEALTH_URL_PATTERN,
        max_length=512,
        description="URL CFN probes with an HTTP GET to check liveness (e.g., 'http://demo-ce:8080/healthz')",
    )
    health_endpoint: str = Field(..., description="Health probe path (e.g., '/healthz'). Must start with '/'.")
    health_protocol: Literal["http"] = Field("http", description="Health probe protocol")
    mas_auto_associate: bool = Field(
        False, description="If true, CE is auto-associated with all MAS under the same CFN's workspaces"
    )
    mas_config: Optional[dict] = Field(
        default_factory=dict,
        description="Factory defaults for per-MAS configuration (e.g. schedule). Copied to each MAS on association and overridable per MAS.",  # noqa: E501
    )
    notification_url: Optional[str] = Field(None, description="Webhook base URL for MAS lifecycle notifications")
    notification_endpoint: Optional[str] = Field(
        None,
        description="Path appended to notification_url (e.g., '/notifications'). Must start with '/'.",
    )
    notification_protocol: Literal["http"] = Field("http", description="Notification protocol")

    @model_validator(mode="after")
    def _check_endpoints(self):
        error = connection_error(
            self.enforcing_url,
            self.enforcing_endpoint,
            self.health_endpoint,
            self.notification_url,
            self.notification_endpoint,
        )
        if error:
            raise ValueError(error)
        return self


class CognitionEngineResponse(CEConnection):
    """Schema for CE registration response"""

    ce_id: str
    cfn_id: str
    name: str
    version: str
    ce_type: CEType
    enabled: bool
    mas_auto_associate: bool
    status: str
    created: bool = Field(..., description="True if new registration, False if existing record was updated")


class CognitionEngineListItem(CEConnection):
    """Schema for a cognition engine in the list response"""

    id: str
    cfn_id: str
    name: str
    version: str
    ce_type: CEType
    enabled: bool
    mas_auto_associate: bool
    status: str
    last_seen: Optional[UtcDateTime]
    mas_config: Optional[dict]
    created_at: UtcDateTime


class CognitionEngineList(BaseModel):
    """Schema for cognition engine list response"""

    cognition_engines: List[CognitionEngineListItem]
    total: int


class CognitionEngineDetail(CEConnection):
    """Schema for detailed cognition engine information"""

    id: str
    cfn_id: str
    name: str
    version: str
    ce_type: CEType
    enabled: bool
    mas_auto_associate: bool
    status: str
    last_seen: Optional[UtcDateTime]
    mas_config: Optional[dict]
    created_at: UtcDateTime
    updated_at: Optional[UtcDateTime]


class CognitionEnginePatchRequest(BaseModel):
    """Schema for PATCH /cognition-engines/{id}.

    Only the fields listed here can be updated.
    Attempting to update immutable fields (cfn_id, name, version, ce_type)
    will be rejected with 400.
    """

    # Mutable fields — all optional, only provided fields are updated
    enforcing_url: Optional[str] = Field(
        None, description="gRPC address CFN sends enforcement requests to. Send null to clear"
    )
    enforcing_endpoint: Optional[str] = Field(None, description="gRPC service name for enforcement. Send null to clear")
    enforcing_protocol: Optional[Literal["grpc"]] = Field(None, description="Enforcement protocol")
    health_url: Optional[str] = Field(
        None,
        pattern=HEALTH_URL_PATTERN,
        max_length=512,
        description="URL CFN probes with an HTTP GET to check liveness",
    )
    health_endpoint: Optional[str] = Field(None, description="Health probe path. Must start with '/'")
    health_protocol: Optional[Literal["http"]] = Field(None, description="Health probe protocol")
    notification_url: Optional[str] = Field(
        None, description="Base URL for lifecycle event notifications. Send null to clear"
    )
    notification_endpoint: Optional[str] = Field(
        None, description="Path appended to notification_url. Must start with '/'. Send null to clear"
    )
    notification_protocol: Optional[Literal["http"]] = Field(None, description="Notification protocol")
    enabled: Optional[bool] = Field(None, description="Enable or disable the CE")
    mas_auto_associate: Optional[bool] = Field(None, description="Enable or disable auto-association to new MAS")

    # Immutable fields — declared so callers get a 400 with a clear message rather than silent ignore
    cfn_id: Optional[str] = Field(None, description="Immutable — cannot be updated via PATCH")
    name: Optional[str] = Field(None, description="Immutable — cannot be updated via PATCH")
    version: Optional[str] = Field(None, description="Immutable — cannot be updated via PATCH")
    ce_type: Optional[CEType] = Field(None, description="Immutable — cannot be updated via PATCH")


class CognitionEngineAssociateResponse(BaseModel):
    """Schema for CE-MAS association response"""

    ce_id: str
    mas_id: str
    created_at: UtcDateTime


class CognitionEngineConflictError(BaseModel):
    """Schema for 409 Conflict response when CE with same (name, version) already exists"""

    error: str = Field(..., description="Error message")
    existing_ce_id: str = Field(..., description="ID of the existing CE with same (name, version)")
