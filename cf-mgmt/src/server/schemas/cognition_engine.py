# Copyright 2026 Cisco Systems, Inc. and its affiliates
#
# SPDX-License-Identifier: Apache-2.0

"""Cognition Engine schemas"""

from datetime import datetime
from enum import Enum
from typing import List, Optional

from pydantic import BaseModel, Field

HEALTH_URL_PATTERN = r"^https?://\S+$"


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
    base_url: str = Field(..., description="Base URL for the CFN to reach this engine (e.g., 'http://demo-ce:8080')")
    endpoint: str = Field(..., description="API endpoint path for request forwarding (e.g., '/api/l9/enforcement')")
    health_url: str = Field(
        ...,
        pattern=HEALTH_URL_PATTERN,
        max_length=512,
        description="Full URL CFN probes with an HTTP GET to check liveness (e.g., 'http://demo-ce:8080/healthz')",
    )
    mas_auto_associate: bool = Field(
        False, description="If true, CE is auto-associated with all MAS under the same CFN's workspaces"
    )
    mas_config: Optional[dict] = Field(
        default_factory=dict,
        description="Factory defaults for per-MAS configuration (e.g. schedule). Copied to each MAS on association and overridable per MAS.",  # noqa: E501
    )


class CognitionEngineResponse(BaseModel):
    """Schema for CE registration response"""

    ce_id: str
    cfn_id: str
    name: str
    version: str
    ce_type: CEType
    base_url: str
    endpoint: str
    health_url: str
    enabled: bool
    mas_auto_associate: bool
    status: str
    created: bool = Field(..., description="True if new registration, False if existing record was updated")


class CognitionEngineListItem(BaseModel):
    """Schema for a cognition engine in the list response"""

    id: str
    cfn_id: str
    name: str
    version: str
    ce_type: CEType
    base_url: str
    endpoint: str
    health_url: str
    enabled: bool
    mas_auto_associate: bool
    status: str
    last_seen: Optional[datetime]
    mas_config: Optional[dict]
    created_at: datetime


class CognitionEngineList(BaseModel):
    """Schema for cognition engine list response"""

    cognition_engines: List[CognitionEngineListItem]
    total: int


class CognitionEngineDetail(BaseModel):
    """Schema for detailed cognition engine information"""

    id: str
    cfn_id: str
    name: str
    version: str
    ce_type: CEType
    base_url: str
    endpoint: str
    health_url: str
    enabled: bool
    mas_auto_associate: bool
    status: str
    last_seen: Optional[datetime]
    mas_config: Optional[dict]
    created_at: datetime
    updated_at: Optional[datetime]


class CognitionEnginePatchRequest(BaseModel):
    """Schema for PATCH /cognition-engines/{id}.

    Only the fields listed here can be updated.
    Attempting to update immutable fields (cfn_id, name, version, ce_type)
    will be rejected with 400.
    """

    # Mutable fields — all optional, only provided fields are updated
    base_url: Optional[str] = Field(None, description="Base URL for the CFN to reach this engine")
    endpoint: Optional[str] = Field(None, description="API endpoint path for request forwarding")
    health_url: Optional[str] = Field(
        None,
        pattern=HEALTH_URL_PATTERN,
        max_length=512,
        description="Full URL CFN probes with an HTTP GET to check liveness",
    )
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
    created_at: datetime


class CognitionEngineConflictError(BaseModel):
    """Schema for 409 Conflict response when CE with same (name, version) already exists"""

    error: str = Field(..., description="Error message")
    existing_ce_id: str = Field(..., description="ID of the existing CE with same (name, version)")
