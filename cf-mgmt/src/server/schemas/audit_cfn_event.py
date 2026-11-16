# Copyright 2026 Cisco Systems, Inc. and its affiliates
#
# SPDX-License-Identifier: Apache-2.0

from typing import Optional, Dict, Any, List
from server.utils.timestamps import UtcDateTime
from uuid import UUID
from pydantic import BaseModel, Field, ConfigDict


class AuditCfnEventResponse(BaseModel):
    """Response model for CFN audit events from cfn_cp database."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID = Field(..., description="Unique audit event ID (UUID)")
    source: Optional[str] = Field(
        default=None, description="Original audit producer, e.g. CFN or PROXY; absent from older CFN versions"
    )
    success: Optional[bool] = Field(
        default=None,
        description=(
            "Whether the entire audited operation completed without an operational error; "
            "a completed policy DENY/BLOCK is successful"
        ),
    )
    operation_id: Optional[str] = Field(default=None, description="Operation identifier")
    outcome: Optional[str] = Field(
        default=None,
        description=(
            "Canonical result across producers: ALLOW, BLOCK, MODIFY_REQUESTED, ERROR, DEGRADED, "
            "UNSUPPORTED or UNKNOWN; absent from older records/CFN"
        ),
    )
    resource_type: str = Field(..., description="Type of the resource (e.g. COGNITION_ENGINE or ENFORCEMENT_PROXY)")
    resource_identifier: str = Field(
        ..., description="Selected CE ID for CFN dispositions; empty if no CE was selected or for Proxy records"
    )
    audit_type: str = Field(
        ...,
        description=(
            "CFN dispositions use CE_INVOKED when Evaluate was attempted, "
            "CE_NOT_INVOKED for an earlier failure; Proxy records use PROXY_MEDIATED"
        ),
    )
    audit_resource_identifier: str = Field(
        ...,
        description=(
            "MAS association for CFN and Proxy records; empty if missing or too long; "
            "full Proxy MAS ID remains in audit_information"
        ),
    )
    audit_information: Optional[Dict[str, Any]] = Field(default=None, description="JSONB audit event details")
    audit_extra_information: Optional[str] = Field(default=None, description="Additional information as text")
    created_by: UUID = Field(..., description="UUID of the user who created the event")
    created_on: UtcDateTime = Field(..., description="Timestamp when the event was created")
    last_modified_by: UUID = Field(..., description="UUID of the user who last modified the event")
    last_modified_on: UtcDateTime = Field(..., description="Timestamp when the event was last modified")


class AuditCfnPageInfo(BaseModel):
    """Pagination metadata matching the upstream cfn-svc response."""

    page: int = Field(..., description="Current 0-based page number")
    pageSize: int = Field(..., description="Requested page size")
    pageCount: int = Field(..., description="Number of elements returned in this page")
    totalElements: int = Field(..., description="Total number of matching records across all pages")


class AuditCfnEventListResponse(BaseModel):
    """Paginated list response matching the upstream cfn-svc shape."""

    data: List[AuditCfnEventResponse] = Field(..., description="List of audit events")
    pageInfo: AuditCfnPageInfo = Field(..., description="Pagination metadata")
