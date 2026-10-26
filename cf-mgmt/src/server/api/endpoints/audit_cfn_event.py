# Copyright 2026 Cisco Systems, Inc. and its affiliates
#
# SPDX-License-Identifier: Apache-2.0

"""CFN Audit Event API endpoints.

Read-only endpoints for querying audit events from ioc-cfn-svc
via its internal HTTP API.
"""

from typing import Literal, Optional

from fastapi import APIRouter, Query
from fastapi.responses import JSONResponse

from server.schemas.audit_cfn_event import AuditCfnEventListResponse, AuditCfnEventResponse
from server.services.audit_cfn_event import CfnUpstreamError, audit_cfn_event_service

router = APIRouter()


@router.get(
    "/",
    status_code=200,
    response_model=AuditCfnEventListResponse,
    summary="List CFN Audit Events",
    description=(
        "Retrieve a paginated list of audit events from ioc-cfn-svc. "
        "Supports optional filtering by `resource_type`, `audit_type`, `decision` and `success`, before pagination. "
        "CFN dispositions use CE_INVOKED for Evaluate attempts or CE_NOT_INVOKED "
        "for earlier failures. source identifies the producer; success describes "
        "the whole operation, independently of a policy ALLOW/DENY. "
        "Filters require support in the upstream CFN version."
    ),
    responses={
        200: {"description": "Paginated list of audit events returned successfully"},
        400: {"description": "Invalid pagination or an unsupported upstream resource/event type"},
        500: {"description": "Internal server error while querying ioc-cfn-svc"},
    },
)
def list_audit_events(
    page: int = Query(0, ge=0, description="0-based page number"),
    pageSize: int = Query(
        default=None,
        ge=1,
        description=(
            "Number of records per page. "
            "Defaults to DEFAULT_PAGE_SIZE env var (fallback 20). "
            "Clamped to MAX_PAGE_SIZE env var (fallback 100)."
        ),
    ),
    resource_type: Optional[str] = Query(
        None,
        description="Filter by resource type (e.g. COGNITION_ENGINE)",
    ),
    audit_type: Optional[str] = Query(
        None,
        description="Filter by audit type (CE_INVOKED or CE_NOT_INVOKED; requires upgraded CFN)",
    ),
    decision: Optional[Literal["allow", "block", "modify"]] = Query(
        None,
        description="CFN policy decision: block matches the CE DENY outcome. Requires upgraded CFN.",
    ),
    success: Optional[bool] = Query(
        None,
        description="Whole-flow status: true for success, false for failure. A completed policy block is successful.",
    ),
):
    """
    List all CFN audit events with optional filtering and pagination.

    - **page**: 0-based page number (default 0)
    - **pageSize**: Number of records per page (default 20, max 100)
    - **resource_type**: Optional filter — e.g. `COGNITION_ENGINE`
    - **audit_type**: Optional filter — `CE_INVOKED` or `CE_NOT_INVOKED`
    - **decision**: Optional CFN policy decision — `allow`, `block` (DENY), or `modify`
    - **success**: Optional whole-flow status; omission includes unavailable historical values
    """
    try:
        extra_filters = {}
        if decision is not None:
            extra_filters["decision"] = decision
        if success is not None:
            extra_filters["success"] = success
        result = audit_cfn_event_service.list_audit_events(
            page=page, page_size=pageSize, resource_type=resource_type, audit_type=audit_type, **extra_filters
        )
        return JSONResponse(content=result)
    except CfnUpstreamError as exc:
        return JSONResponse(status_code=exc.status_code, content=exc.detail)
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": f"failed to list audit events: {str(e)}"})


@router.get(
    "/{eventId}",
    status_code=200,
    response_model=AuditCfnEventResponse,
    summary="Get CFN Audit Event by ID",
    description="Retrieve a single audit event from ioc-cfn-svc by its UUID.",
    responses={
        200: {"description": "Audit event returned successfully"},
        400: {"description": "Invalid event ID"},
        404: {"description": "Audit event not found"},
        500: {"description": "Internal server error while querying ioc-cfn-svc"},
    },
)
def get_audit_event(eventId: str):
    """
    Get a specific CFN audit event by UUID.

    - **eventId**: The UUID of the audit event to retrieve
    """
    try:
        audit_event = audit_cfn_event_service.get_audit_event(eventId)
        if not audit_event:
            return JSONResponse(status_code=404, content={"error": "audit event not found"})
        return JSONResponse(content=audit_event)
    except CfnUpstreamError as exc:
        return JSONResponse(status_code=exc.status_code, content=exc.detail)
    except Exception as e:
        return JSONResponse(
            status_code=500,
            content={"error": f"failed to retrieve audit event: {str(e)}"},
        )
