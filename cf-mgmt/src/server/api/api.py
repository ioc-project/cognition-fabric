# Copyright 2026 Cisco Systems, Inc. and its affiliates
#
# SPDX-License-Identifier: Apache-2.0

from fastapi import APIRouter

from server.api.endpoints.audit_cfn_event import router as audit_cfn_events_router
from server.api.endpoints.auth import router as auth_router
from server.api.endpoints.cognition_engine import router as cognition_engine_router
from server.api.endpoints.cognition_fabric import router as cognition_fabric_router
from server.api.endpoints.cognition_fabric_node import router as cognition_fabric_node_router
from server.api.endpoints.multi_agentic_system import router as multi_agentic_system_router
from server.api.endpoints.policies import router as policy_router
from server.api.endpoints.workspaces import router as workspaces_router
from server.diagnostics import router as diagnostics_router

api_router = APIRouter()

api_router.include_router(cognition_fabric_node_router, prefix="", tags=["cognition-fabric-nodes"])
api_router.include_router(cognition_fabric_router, prefix="/cognition-fabric", tags=["cognition-fabric"])
api_router.include_router(workspaces_router, prefix="/workspaces", tags=["workspaces"])
api_router.include_router(multi_agentic_system_router, prefix="/workspaces", tags=["multi-agentic-systems"])
api_router.include_router(cognition_engine_router, prefix="", tags=["cognition-engines"])
api_router.include_router(policy_router, prefix="/workspaces", tags=["policies"])
api_router.include_router(audit_cfn_events_router, prefix="/audit-events", tags=["audit-events"])

api_router.include_router(
    diagnostics_router, prefix="/internal/diagnostics", tags=["diagnostics"], include_in_schema=False
)

# hidden endpoints
api_router.include_router(auth_router, prefix="/auth", tags=["authentication"], include_in_schema=False)
