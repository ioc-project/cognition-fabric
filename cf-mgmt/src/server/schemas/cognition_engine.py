# Copyright 2026 Cisco Systems, Inc. and its affiliates
#
# SPDX-License-Identifier: Apache-2.0

"""Cognition Engine schemas"""

from datetime import datetime
from enum import Enum
from typing import List, Optional

from pydantic import BaseModel, Field


class CEType(str, Enum):
    """Type of Cognition Engine.

    - CASA: Gateway CE for L9 enforcement
    - DEMO_CE: Gateway CE for L9 enforcement
    - DETECTIVE: Detective CE for investigation/analysis
    """

    CASA = "CASA"
    DEMO_CE = "Demo CE"
    DETECTIVE = "DETECTIVE"


class CognitionEngineRegisterRequest(BaseModel):
    """Schema for CE self-registration (idempotent upsert)"""

    cfn_id: str = Field(..., description="CFN this engine is registering under")
    ce_type: CEType = Field(..., description="Type of Cognition Engine: CASA, Demo CE, or DETECTIVE")
    base_url: str = Field(..., description="Base URL for the CFN to reach this engine (e.g., 'http://casa-ce:8080')")
    endpoint: str = Field(..., description="API endpoint path for request forwarding (e.g., '/api/l9/enforcement')")
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
    ce_type: CEType
    base_url: str
    endpoint: str
    enabled: bool
    mas_auto_associate: bool
    status: str
    created: bool = Field(..., description="True if new registration, False if existing record was updated")


class CognitionEngineListItem(BaseModel):
    """Schema for a cognition engine in the list response"""

    id: str
    cfn_id: str
    ce_type: CEType
    base_url: str
    endpoint: str
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
    ce_type: CEType
    base_url: str
    endpoint: str
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
    Attempting to update immutable fields (cfn_id, ce_type)
    will be rejected with 400.
    """

    # Mutable fields — all optional, only provided fields are updated
    base_url: Optional[str] = Field(None, description="Base URL for the CFN to reach this engine")
    endpoint: Optional[str] = Field(None, description="API endpoint path for request forwarding")
    enabled: Optional[bool] = Field(None, description="Enable or disable the CE")
    mas_auto_associate: Optional[bool] = Field(None, description="Enable or disable auto-association to new MAS")

    # Immutable fields — declared so callers get a 400 with a clear message rather than silent ignore
    cfn_id: Optional[str] = Field(None, description="Immutable — cannot be updated via PATCH")
    ce_type: Optional[CEType] = Field(None, description="Immutable — cannot be updated via PATCH")


class CognitionEngineAssociateResponse(BaseModel):
    """Schema for CE-MAS association response"""

    ce_id: str
    mas_id: str
    created_at: datetime


class CognitionEngineHeartbeatResponse(BaseModel):
    """Schema for CE heartbeat response"""

    status: str
    last_seen: datetime
