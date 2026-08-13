"""Data models for the CASA enforcement API."""
from enum import Enum
from typing import Optional
from uuid import UUID
from pydantic import BaseModel, Field


class EnforcementAction(str, Enum):
    """Enforcement action types."""
    ALLOW = "allow"
    BLOCK = "block"
    MODIFY = "modify"


class EnforcementPayload(BaseModel):
    """Payload for enforcement request."""
    workspace_id: UUID = Field(..., description="Workspace identifier")
    mas_id: UUID = Field(..., description="MAS identifier")
    source_agent_id: str = Field(..., description="Source agent identifier")
    destination_agent_id: str = Field(..., description="Destination agent identifier")
    trace_id: str = Field(..., description="Trace ID for span coordination")


class EnforcementRequest(BaseModel):
    """Request model for enforcement endpoint."""
    extra: Optional[dict] = Field(None, description="Additional headers/metadata")
    payload: EnforcementPayload


class EnforcementResponse(BaseModel):
    """Response model for enforcement endpoint."""
    action: EnforcementAction = Field(..., description="Enforcement action to take")
    modify: Optional[bool] = Field(None, description="Whether to modify the request")
