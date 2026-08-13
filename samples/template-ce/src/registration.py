"""
CE registration logic for CASA Authorization CE.

This module handles registration with the Cognition Fabric (CFN) on startup.
Registration is idempotent - safe to run multiple times.
"""
from __future__ import annotations

import asyncio
import logging
import os
from typing import Optional
from dataclasses import dataclass
from enum import Enum

import httpx

logger = logging.getLogger(__name__)


# Constants
CE_NAME = "CASA Authorization CE"
CE_VERSION = os.getenv("CE_VERSION", "0.1.0")


@dataclass
class CERegistrationRequest:
    """
    Minimal CE registration payload for CFN API.

    Simplified payload for fake CE - only essentials.
    Full L9 protocol fields (kinds_subkinds, subprotocols, etc.)
    will be added once L9 refactor is finalized.
    """
    name: str
    url: str
    version: str


@dataclass
class CERegistrationResponse:
    """CE registration response from CFN."""
    ce_id: str
    cfn_id: str
    name: str
    version: str
    enabled: bool
    status: str
    created: bool


class CELifecycleClient:
    """
    Client for CE registration and heartbeat management.

    Handles:
    - Registration with CFN on startup
    - Periodic heartbeats to keep CE status "online"
    - Graceful error handling (logs errors, never raises)
    """

    def __init__(
        self,
        cfn_base_url: str,
        heartbeat_interval_sec: float = 30.0,
        timeout: float = 10.0,
    ):
        self.cfn_base_url = cfn_base_url.rstrip("/")
        self.heartbeat_interval_sec = heartbeat_interval_sec
        self.timeout = timeout

        self._client: Optional[httpx.AsyncClient] = None
        self._heartbeat_task: Optional[asyncio.Task] = None

        # Stored after successful registration
        self.ce_id: Optional[str] = None
        self.cfn_id: Optional[str] = None
        self.name: Optional[str] = None

    async def _get_client(self) -> httpx.AsyncClient:
        """Get or create async HTTP client."""
        if self._client is None:
            self._client = httpx.AsyncClient(timeout=self.timeout)
        return self._client

    async def close(self):
        """Close HTTP client and stop heartbeat task."""
        if self._heartbeat_task:
            self._heartbeat_task.cancel()
            try:
                await self._heartbeat_task
            except asyncio.CancelledError:
                pass
            self._heartbeat_task = None

        if self._client:
            await self._client.aclose()
            self._client = None

    async def register(
        self,
        request: CERegistrationRequest,
    ) -> Optional[CERegistrationResponse]:
        """
        Register CE with CFN (idempotent).

        If CE already exists, returns existing ce_id.
        If CE is new, creates and returns new ce_id.

        Returns:
            CERegistrationResponse if successful, None on failure.
        """
        endpoint = f"{self.cfn_base_url}/api/cognition-engines"
        payload = {
            "name": request.name,
            "url": request.url,
            "version": request.version,
        }

        try:
            client = await self._get_client()
            logger.info(f"Registering CE '{request.name}' at {endpoint}")

            response = await client.post(
                endpoint,
                json=payload,
                headers={"Content-Type": "application/json"},
            )

            if response.status_code in (200, 201):
                data = response.json()
                result = CERegistrationResponse(
                    ce_id=data["ce_id"],
                    cfn_id=data["cfn_id"],
                    name=data["name"],
                    version=data["version"],
                    enabled=data["enabled"],
                    status=data["status"],
                    created=data["created"],
                )

                # Store for heartbeats
                self.ce_id = result.ce_id
                self.cfn_id = result.cfn_id
                self.name = result.name

                action = "created" if result.created else "updated"
                logger.info(
                    f"CE '{request.name}' {action}: ce_id={result.ce_id}, "
                    f"status={result.status}, enabled={result.enabled}"
                )
                return result
            else:
                logger.error(
                    f"CE registration failed: {response.status_code} - {response.text[:200]}"
                )
                return None

        except httpx.ConnectError as e:
            logger.warning(
                f"Cannot connect to CFN at {self.cfn_base_url}: {e}. "
                f"CE will run without CFN registration."
            )
            return None
        except Exception as e:
            logger.error(f"CE registration error: {e}", exc_info=True)
            return None

    def start_heartbeat(self):
        """Start background heartbeat task."""
        if self._heartbeat_task is None and self.ce_id:
            self._heartbeat_task = asyncio.create_task(self._heartbeat_loop())
            logger.info(f"Heartbeat task started for CE '{self.name}' (interval={self.heartbeat_interval_sec}s)")

    async def _heartbeat_loop(self):
        """Background task that sends periodic heartbeats to CFN."""
        endpoint = f"{self.cfn_base_url}/api/cognition-engines/{self.ce_id}/heartbeat"

        while True:
            try:
                await asyncio.sleep(self.heartbeat_interval_sec)

                client = await self._get_client()
                response = await client.post(endpoint)

                if response.status_code == 200:
                    logger.debug(f"Heartbeat sent for CE '{self.name}'")
                else:
                    logger.warning(
                        f"Heartbeat failed: {response.status_code} - {response.text[:100]}"
                    )

            except asyncio.CancelledError:
                logger.info(f"Heartbeat task cancelled for CE '{self.name}'")
                break
            except Exception as e:
                logger.error(f"Heartbeat error: {e}")
                # Continue loop - don't crash on transient errors


# Global lifecycle client
_lifecycle_client: Optional[CELifecycleClient] = None


async def register_casa_ce() -> None:
    """
    Register CASA Authorization CE with CFN on startup.

    This function:
    1. Checks CFN_URL environment variable
    2. Creates CELifecycleClient
    3. Calls client.register() (idempotent)
    4. Starts heartbeat background task

    Environment variables:
        CFN_URL: Base URL of CFN service (e.g. "http://localhost:9002")
                 If not set, skips registration (CE runs standalone)
        COGNITION_ENGINE_HOST: Advertised host for this service (default: "localhost")
        COGNITION_ENGINE_PORT: Advertised port for this service (default: "8000")
        CE_VERSION: CE version for registration (default: "0.1.0")
        CE_HEARTBEAT_INTERVAL_SEC: Heartbeat interval in seconds (default: "30.0")
    """
    global _lifecycle_client

    # Get configuration from environment
    cfn_url = os.getenv("CFN_URL", "").rstrip("/")
    ce_host = os.getenv("COGNITION_ENGINE_HOST", "localhost")
    ce_port = os.getenv("COGNITION_ENGINE_PORT", "8000")

    if not cfn_url:
        logger.warning(
            "CFN_URL not set - CASA CE will run without CFN registration. "
            "This CE will not appear in Management Plane. "
            "Set CFN_URL environment variable for production deployments."
        )
        return

    ce_url = f"http://{ce_host}:{ce_port}"
    logger.info(f"Starting CASA CE registration with cfn_url={cfn_url}, ce_url={ce_url}")

    # Create lifecycle client
    _lifecycle_client = CELifecycleClient(
        cfn_base_url=cfn_url,
        heartbeat_interval_sec=float(os.getenv("CE_HEARTBEAT_INTERVAL_SEC", "30.0")),
        timeout=10.0,
    )

    # Define CASA CE configuration - minimal payload
    ce_config = CERegistrationRequest(
        name=CE_NAME,
        url=ce_url,
        version=CE_VERSION,
    )

    # Attempt registration
    response = await _lifecycle_client.register(ce_config)

    if response:
        # Start heartbeat background task
        _lifecycle_client.start_heartbeat()
        logger.info(f"CASA CE registration complete: ce_id={response.ce_id}")
    else:
        logger.warning(
            "CASA CE registration failed - CE will operate without CFN visibility"
        )


async def shutdown_lifecycle_client() -> None:
    """
    Shutdown lifecycle client on service shutdown.

    This function:
    1. Cancels heartbeat background task
    2. Closes HTTP client
    3. Clears global client reference

    Called from service lifespan shutdown phase.
    """
    global _lifecycle_client

    if _lifecycle_client:
        logger.info("Shutting down CASA CE lifecycle client...")
        await _lifecycle_client.close()
        _lifecycle_client = None
        logger.info("CASA CE lifecycle client shutdown complete")


def get_ce_id() -> Optional[str]:
    """
    Get CE ID for this registered CE.

    Returns:
        CE ID if CE is registered, None otherwise.
    """
    return _lifecycle_client.ce_id if _lifecycle_client else None


def get_cfn_id() -> Optional[str]:
    """
    Get CFN ID for this CE instance.

    Returns:
        CFN ID if registration succeeded, None otherwise.
    """
    return _lifecycle_client.cfn_id if _lifecycle_client else None
