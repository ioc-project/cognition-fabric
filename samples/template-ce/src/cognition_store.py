"""
Cognition Store client for CASA CE.

This module handles communication with the Cognition Store APIs in the OXP backend.
The Cognition Store provides:
- Storage of CE findings (decisions and check results)
- Retrieval of prior CE findings for context

The CE dials the Cognition Store to:
1. Read prior findings for MAS-level context (trajectory)
2. Store current finding after evaluation
"""
from __future__ import annotations

import logging
import os
from dataclasses import dataclass, field
from datetime import datetime
from typing import Optional

import httpx

logger = logging.getLogger(__name__)


# Environment variable for Cognition Store URL
COGNITION_STORE_URL_ENV = "COGNITION_STORE_URL"


@dataclass
class CEFinding:
    """
    A single CE finding (evaluation decision).

    Represents the outcome of a CE evaluation, stored in the Cognition Store
    for later retrieval as MAS-level context.
    """
    # Core identifiers
    finding_id: str = ""
    mas_id: str = ""
    trace_id: str = ""

    # Decision
    outcome: str = ""  # ALLOW, DENY, MODIFY
    denial_reason: Optional[str] = None
    reason: str = ""

    # Context
    source_agent_id: str = ""
    destination_agent_id: str = ""
    action_class: str = ""
    direction: str = ""

    # Check results (list of check_id -> passed/failed)
    checks_run: list[dict] = field(default_factory=list)

    # Metadata
    ce_type: str = "CASA"
    ce_id: Optional[str] = None
    timestamp: str = ""


@dataclass
class PriorFindingsResult:
    """
    Result of fetching prior CE findings for a MAS.

    Contains the trajectory of prior findings that inform the current evaluation.
    """
    mas_id: str
    findings: list[CEFinding] = field(default_factory=list)
    context_complete: bool = True  # Whether all expected findings were retrieved


class CognitionStoreClient:
    """
    Client for the Cognition Store APIs in OXP backend.

    Handles:
    - Fetching prior CE findings for MAS-level context
    - Storing current CE finding after evaluation

    The Cognition Store is the persistent storage layer for CE findings,
    enabling MAS-level context for semantic checks.
    """

    def __init__(
        self,
        base_url: str,
        timeout: float = 10.0,
    ):
        """
        Initialize the Cognition Store client.

        Args:
            base_url: Base URL of the Cognition Store API (e.g., "http://localhost:8080")
            timeout: Request timeout in seconds
        """
        self.base_url = base_url.rstrip("/")
        self.timeout = timeout
        self._client: Optional[httpx.AsyncClient] = None

    async def _get_client(self) -> httpx.AsyncClient:
        """Get or create async HTTP client."""
        if self._client is None:
            self._client = httpx.AsyncClient(timeout=self.timeout)
        return self._client

    async def close(self):
        """Close the HTTP client."""
        if self._client:
            await self._client.aclose()
            self._client = None

    async def get_prior_findings(
        self,
        mas_id: str,
        trace_id: Optional[str] = None,
        limit: int = 100,
    ) -> PriorFindingsResult:
        """
        Fetch prior CE findings for a MAS.

        This provides MAS-level context (trajectory) for semantic checks.
        The findings represent the history of CE decisions for this MAS,
        which can inform whether the current action is consistent with
        the established pattern.

        Args:
            mas_id: MAS identifier to fetch findings for
            trace_id: Optional trace ID to filter findings within a specific trace
            limit: Maximum number of findings to return (default: 100)

        Returns:
            PriorFindingsResult containing the list of prior findings

        Note:
            This is a PLACEHOLDER implementation. The actual implementation
            will call the Cognition Store API:
            GET /api/cognition-store/findings?mas_id={mas_id}&limit={limit}
        """
        # TODO: Implement actual Cognition Store API call
        # Example API endpoint:
        #   GET {base_url}/api/cognition-store/findings
        #   Query params: mas_id, trace_id (optional), limit
        #   Response: { "mas_id": "...", "findings": [...], "context_complete": true }

        logger.info(
            "get_prior_findings called (PLACEHOLDER)",
            extra={
                "mas_id": mas_id,
                "trace_id": trace_id,
                "limit": limit,
            }
        )

        # Placeholder: return empty findings
        return PriorFindingsResult(
            mas_id=mas_id,
            findings=[],
            context_complete=True,
        )

    async def store_finding(
        self,
        finding: CEFinding,
    ) -> bool:
        """
        Store a CE finding in the Cognition Store.

        After the CE makes an evaluation decision, the finding is stored
        in the Cognition Store for:
        - Audit/compliance logging
        - Future MAS-level context (trajectory)
        - Analytics and observability

        Args:
            finding: The CE finding to store

        Returns:
            True if the finding was stored successfully, False otherwise

        Note:
            This is a PLACEHOLDER implementation. The actual implementation
            will call the Cognition Store API:
            POST /api/cognition-store/findings
        """
        # TODO: Implement actual Cognition Store API call
        # Example API endpoint:
        #   POST {base_url}/api/cognition-store/findings
        #   Body: CEFinding as JSON
        #   Response: { "finding_id": "...", "stored": true }

        logger.info(
            "store_finding called (PLACEHOLDER)",
            extra={
                "mas_id": finding.mas_id,
                "trace_id": finding.trace_id,
                "outcome": finding.outcome,
            }
        )

        # Placeholder: always succeed
        return True


# Global client instance
_cognition_store_client: Optional[CognitionStoreClient] = None


def get_cognition_store_client() -> Optional[CognitionStoreClient]:
    """
    Get the global Cognition Store client.

    Returns:
        CognitionStoreClient if COGNITION_STORE_URL is configured, None otherwise
    """
    global _cognition_store_client

    if _cognition_store_client is not None:
        return _cognition_store_client

    store_url = os.getenv(COGNITION_STORE_URL_ENV, "").strip()
    if not store_url:
        logger.debug("Cognition Store URL not configured, skipping store operations")
        return None

    _cognition_store_client = CognitionStoreClient(base_url=store_url)
    logger.info(f"Cognition Store client initialized: {store_url}")
    return _cognition_store_client


async def shutdown_cognition_store_client() -> None:
    """Shutdown the global Cognition Store client."""
    global _cognition_store_client

    if _cognition_store_client:
        await _cognition_store_client.close()
        _cognition_store_client = None
        logger.info("Cognition Store client shutdown")
