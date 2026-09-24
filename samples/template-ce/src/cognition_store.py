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

        GET {base_url}/cognition-store/findings?mas_id={mas_id}&trace_id={trace_id}&session_id={session_id}&limit={limit}
        """
        logger.info(f"[CognitionStore] GET prior findings: mas_id={mas_id} trace_id={trace_id} session_id={session_id} limit={limit}")

        client = await self._get_client()
        params: dict[str, str | int] = {"mas_id": mas_id, "limit": limit}
        if trace_id:
            params["trace_id"] = trace_id
        if session_id:
            params["session_id"] = session_id

        try:
            resp = await client.get(f"{self.base_url}/api/v1/cognition-store/findings", params=params)
            resp.raise_for_status()
            data = resp.json()

            findings = [
                CEFinding(
                    finding_id=f.get("finding_id", ""),
                    mas_id=f.get("mas_id", ""),
                    trace_id=f.get("trace_id", ""),
                    session_id=f.get("session_id", ""),
                    outcome=f.get("outcome", ""),
                    reason=f.get("reason", ""),
                    source_agent_id=f.get("source_agent_id", ""),
                    destination_agent_id=f.get("destination_agent_id", ""),
                    action_class=f.get("action_class", ""),
                    direction=f.get("direction", ""),
                    timestamp=f.get("timestamp", ""),
                )
                for f in data.get("findings", [])
            ]
            result = PriorFindingsResult(
                mas_id=data.get("mas_id", mas_id),
                findings=findings,
                context_complete=data.get("context_complete", True),
            )
            logger.info(f"[CognitionStore] Fetched {len(result.findings)} prior findings")
            return result

        except httpx.HTTPStatusError as e:
            logger.error(f"[CognitionStore] HTTP error fetching prior findings: {e.response.status_code} {e.response.text}")
            return PriorFindingsResult(mas_id=mas_id, findings=[], context_complete=True)
        except Exception as e:
            logger.error(f"[CognitionStore] Error fetching prior findings: {e}")
            return PriorFindingsResult(mas_id=mas_id, findings=[], context_complete=True)

    async def store_finding(self, finding: CEFinding) -> bool:
        """
        Store a CE finding.

        POST {base_url}/cognition-store/findings
        """
        logger.info(f"[CognitionStore] POST finding: finding_id={finding.finding_id} mas_id={finding.mas_id} outcome={finding.outcome}")

        client = await self._get_client()
        payload = {
            "finding_id": finding.finding_id,
            "mas_id": finding.mas_id,
            "trace_id": finding.trace_id,
            "session_id": finding.session_id,
            "outcome": finding.outcome,
            "reason": finding.reason,
            "source_agent_id": finding.source_agent_id,
            "destination_agent_id": finding.destination_agent_id,
            "action_class": finding.action_class,
            "direction": finding.direction,
            "timestamp": finding.timestamp,
        }

        try:
            resp = await client.post(f"{self.base_url}/api/v1/cognition-store/findings", json=payload)
            resp.raise_for_status()
            data = resp.json()
            success = data.get("success", False)
            logger.info(f"[CognitionStore] Finding stored: success={success} finding_id={data.get('finding_id')}")
            return success

        except httpx.HTTPStatusError as e:
            logger.error(f"[CognitionStore] HTTP error storing finding: {e.response.status_code} {e.response.text}")
            return False
        except Exception as e:
            logger.error(f"[CognitionStore] Error storing finding: {e}")
            return False


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
