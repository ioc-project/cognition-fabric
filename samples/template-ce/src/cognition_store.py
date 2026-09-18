"""
Cognition Store client for CASA CE.

Handles communication with the Cognition Store APIs (OXP backend) for:
- Reading prior CE findings (MAS-level context)
- Storing current CE finding after evaluation
"""
import logging
import os
from dataclasses import dataclass, field
from typing import Optional

import httpx

logger = logging.getLogger(__name__)

COGNITION_STORE_URL_ENV = "COGNITION_STORE_URL"


@dataclass
class CEFinding:
    """A CE finding (evaluation decision) stored in the Cognition Store."""
    finding_id: str = ""
    mas_id: str = ""
    trace_id: str = ""
    session_id: str = ""  # Identifies a specific session within a trace
    outcome: str = ""  # ALLOW, DENY, MODIFY
    reason: str = ""
    source_agent_id: str = ""
    destination_agent_id: str = ""
    action_class: str = ""
    direction: str = ""
    timestamp: str = ""


@dataclass
class PriorFindingsResult:
    """Result of fetching prior CE findings."""
    mas_id: str
    findings: list[CEFinding] = field(default_factory=list)
    context_complete: bool = True


class CognitionStoreClient:
    """Client for Cognition Store APIs."""

    def __init__(self, base_url: str, timeout: float = 10.0):
        self.base_url = base_url.rstrip("/")
        self.timeout = timeout
        self._client: Optional[httpx.AsyncClient] = None

    async def _get_client(self) -> httpx.AsyncClient:
        if self._client is None:
            self._client = httpx.AsyncClient(timeout=self.timeout)
        return self._client

    async def close(self):
        if self._client:
            await self._client.aclose()
            self._client = None

    async def get_prior_findings(
        self,
        mas_id: str,
        trace_id: Optional[str] = None,
        session_id: Optional[str] = None,
        limit: int = 100,
    ) -> PriorFindingsResult:
        """
        Fetch prior CE findings for a MAS.

        TODO: Implement actual API call:
        GET {base_url}/api/cognition-store/findings?mas_id={mas_id}&session_id={session_id}
        """
        logger.info(f"[CognitionStore] GET prior findings: mas_id={mas_id} trace_id={trace_id} session_id={session_id} limit={limit}")
        logger.info(f"[CognitionStore] Would call: GET {self.base_url}/api/cognition-store/findings?mas_id={mas_id}&session_id={session_id}")
        # PLACEHOLDER: Return empty findings
        result = PriorFindingsResult(mas_id=mas_id, findings=[], context_complete=True)
        logger.info(f"[CognitionStore] Returning {len(result.findings)} findings (PLACEHOLDER)")
        return result

    async def store_finding(self, finding: CEFinding) -> bool:
        """
        Store a CE finding.

        TODO: Implement actual API call:
        POST {base_url}/api/cognition-store/findings
        """
        logger.info(f"[CognitionStore] POST finding: finding_id={finding.finding_id} mas_id={finding.mas_id} outcome={finding.outcome}")
        logger.info(f"[CognitionStore] Would call: POST {self.base_url}/api/cognition-store/findings")
        logger.info(f"[CognitionStore] Payload: trace_id={finding.trace_id} session_id={finding.session_id} action={finding.action_class} direction={finding.direction}")
        # PLACEHOLDER: Always succeed
        logger.info("[CognitionStore] Finding stored (PLACEHOLDER)")
        return True


_client: Optional[CognitionStoreClient] = None


def get_cognition_store_client() -> Optional[CognitionStoreClient]:
    """Get the Cognition Store client (None if not configured)."""
    global _client

    if _client is not None:
        return _client

    url = os.getenv(COGNITION_STORE_URL_ENV, "").strip()
    if not url:
        return None

    _client = CognitionStoreClient(base_url=url)
    logger.info(f"Cognition Store client initialized: {url}")
    return _client


async def shutdown_cognition_store_client() -> None:
    """Shutdown the Cognition Store client."""
    global _client
    if _client:
        await _client.close()
        _client = None
