# Copyright 2026 Cisco Systems, Inc. and its affiliates
#
# SPDX-License-Identifier: Apache-2.0

"""Observe SDK lifecycle shared by application processes."""

import os

from ioa_observe.sdk import Observe
from ioa_observe.sdk.instrumentations.a2a import A2AInstrumentor
from ioa_observe.sdk.instrumentations.mcp import McpInstrumentor


COORDINATOR_APPLICATION_ID = "noa-trip-planner-mas"
MCP_APPLICATION_ID = "noa-trip-planner-mcp"

_initialized_applications: set[str] = set()
_a2a_instrumented = False
_mcp_instrumented = False


def observe_enabled() -> bool:
    """Return whether an OTLP endpoint is configured."""
    return bool(os.getenv("OTLP_HTTP_ENDPOINT"))


def initialize_observe(application_id: str) -> bool:
    """Initialize Observe once per application process when configured."""
    global _a2a_instrumented, _mcp_instrumented

    endpoint = os.getenv("OTLP_HTTP_ENDPOINT")
    if not endpoint:
        return False
    if application_id not in _initialized_applications:
        Observe.init(application_id, api_endpoint=endpoint)
        _initialized_applications.add(application_id)
    if not _a2a_instrumented:
        instrumentor = A2AInstrumentor()
        if not instrumentor.is_instrumented_by_opentelemetry:
            instrumentor.instrument()
        _a2a_instrumented = True
    if not _mcp_instrumented:
        instrumentor = McpInstrumentor()
        if not instrumentor.is_instrumented_by_opentelemetry:
            instrumentor.instrument()
        _mcp_instrumented = True
    return True
