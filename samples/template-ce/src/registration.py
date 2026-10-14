"""
CE registration logic for Demo CE Cognition Engine.

This module handles registration with the Cognition Fabric (CFN) on startup.
Registration is idempotent - safe to run multiple times.
"""
from __future__ import annotations

import logging
import os
from typing import Optional
from dataclasses import dataclass
from enum import Enum

import httpx

from health import HEALTH_PATH, get_health_port

logger = logging.getLogger(__name__)


# Constants (can be overridden via environment variables)
CE_NAME = os.getenv("CE_NAME", "demo-ce")  # CE name for registration
CE_VERSION = os.getenv("CE_VERSION", "1.0.0")  # CE version for registration
CE_TYPE = os.getenv("CE_TYPE", "CASA")  # CEType: CASA or DETECTIVE
CE_ENDPOINT = "ioc.ce.v1.CognitionEngine"  # gRPC service name
DEFAULT_GRPC_PORT = "50051"  # Default gRPC port


class CEType(str, Enum):
    """Type of Cognition Engine."""
    CASA = "CASA"
    DETECTIVE = "DETECTIVE"


@dataclass
class CERegistrationRequest:
    """
    CE registration payload for POST /api/cognition-engine.

    Note: cfn_id is NOT included here - the CFN adds it before forwarding
    to the management plane. mas_auto_associate is also not included -
    CFN defaults it to true.
    """
    name: str  # CE name (e.g., "demo-ce")
    version: str  # CE version (e.g., "1.0.0")
    ce_type: str  # "CASA" or "DETECTIVE"
    base_url: str  # gRPC address (e.g., "demo-ce:50051")
    endpoint: str  # gRPC service name (e.g., "ioc.ce.v1.CognitionEngine")
    health_url: str  # CFN probes this with an HTTP GET (e.g., "http://demo-ce:8080/healthz")


@dataclass
class CERegistrationResponse:
    """CE registration response from CFN."""
    ce_id: str
    cfn_id: str
    name: str
    version: str
    ce_type: str
    base_url: str
    endpoint: str
    enabled: bool
    status: str
    created: bool


class CELifecycleClient:
    """
    Client for CE registration.

    Handles:
    - Registration with CFN on startup
    - Graceful error handling (logs errors, never raises)
    """

    def __init__(
        self,
        cfn_base_url: str,
        timeout: float = 10.0,
    ):
        self.cfn_base_url = cfn_base_url.rstrip("/")
        self.timeout = timeout

        self._client: Optional[httpx.AsyncClient] = None

        # Stored after successful registration
        self.ce_id: Optional[str] = None
        self.cfn_id: Optional[str] = None
        self.ce_type: Optional[str] = None

    async def _get_client(self) -> httpx.AsyncClient:
        """Get or create async HTTP client."""
        if self._client is None:
            self._client = httpx.AsyncClient(timeout=self.timeout)
        return self._client

    async def close(self):
        """Close HTTP client."""
        if self._client:
            await self._client.aclose()
            self._client = None

    async def register(
        self,
        request: CERegistrationRequest,
    ) -> Optional[CERegistrationResponse]:
        """
        Register CE with CFN.

        If CE with same (name, version) already exists:
        - Gets 409 with existing_ce_id
        - Calls PATCH to update base_url/endpoint/health_url (address may have changed
          after restart, e.g., new IP, different port, different hostname)
        - Returns the updated CE record

        If CE is new, creates and returns new ce_id.

        Returns:
            CERegistrationResponse if successful, None on failure.
        """
        endpoint = f"{self.cfn_base_url}/api/cognition-engine"
        payload = {
            "name": request.name,
            "version": request.version,
            "ce_type": request.ce_type,
            "base_url": request.base_url,
            "endpoint": request.endpoint,
            "health_url": request.health_url,
        }

        try:
            client = await self._get_client()
            logger.info(f"Registering CE '{request.name}' v{request.version} at {endpoint}")

            response = await client.post(
                endpoint,
                json=payload,
                headers={"Content-Type": "application/json"},
            )

            if response.status_code == 201:
                # New CE created
                data = response.json()
                result = self._parse_response(data, created=True)
                self._store_ce_info(result)
                logger.info(
                    f"CE '{request.name}' v{request.version} created: ce_id={result.ce_id}, "
                    f"status={result.status}, enabled={result.enabled}"
                )
                return result

            elif response.status_code == 409:
                # CE with same (name, version) already exists - this happens on CE restart/reconnect.
                # We PATCH to update base_url/endpoint/health_url because the CE's address may have changed:
                # - Container got a new IP after restart
                # - Running on a different port
                # - Different hostname in a new deployment
                data = response.json()
                existing_ce_id = data.get("detail", {}).get("existing_ce_id") or data.get("existing_ce_id")
                if not existing_ce_id:
                    logger.error(f"409 Conflict but no existing_ce_id in response: {data}")
                    return None

                logger.info(f"CE '{request.name}' v{request.version} already exists (ce_id={existing_ce_id}), updating via PATCH")
                return await self._update_existing_ce(existing_ce_id, request)

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

    async def _update_existing_ce(
        self,
        ce_id: str,
        request: CERegistrationRequest,
    ) -> Optional[CERegistrationResponse]:
        """Update an existing CE via PATCH after 409 conflict."""
        endpoint = f"{self.cfn_base_url}/api/cognition-engine/{ce_id}"
        payload = {
            "base_url": request.base_url,
            "endpoint": request.endpoint,
            "health_url": request.health_url,
        }

        try:
            client = await self._get_client()
            response = await client.patch(
                endpoint,
                json=payload,
                headers={"Content-Type": "application/json"},
            )

            if response.status_code == 200:
                data = response.json()
                result = CERegistrationResponse(
                    ce_id=data["id"],
                    cfn_id=data["cfn_id"],
                    name=data["name"],
                    version=data["version"],
                    ce_type=data["ce_type"],
                    base_url=data["base_url"],
                    endpoint=data["endpoint"],
                    enabled=data["enabled"],
                    status=data["status"],
                    created=False,
                )
                self._store_ce_info(result)
                logger.info(f"CE '{request.name}' v{request.version} updated: ce_id={result.ce_id}")
                return result
            else:
                logger.error(f"CE update failed: {response.status_code} - {response.text[:200]}")
                return None

        except Exception as e:
            logger.error(f"CE update error: {e}", exc_info=True)
            return None

    def _parse_response(self, data: dict, created: bool) -> CERegistrationResponse:
        """Parse registration response data into CERegistrationResponse."""
        return CERegistrationResponse(
            ce_id=data["ce_id"],
            cfn_id=data["cfn_id"],
            name=data["name"],
            version=data["version"],
            ce_type=data["ce_type"],
            base_url=data["base_url"],
            endpoint=data["endpoint"],
            enabled=data["enabled"],
            status=data["status"],
            created=created,
        )

    def _store_ce_info(self, result: CERegistrationResponse) -> None:
        """Store CE info from the registration response."""
        self.ce_id = result.ce_id
        self.cfn_id = result.cfn_id
        self.ce_type = result.ce_type


# Global lifecycle client
_lifecycle_client: Optional[CELifecycleClient] = None


async def register_demo_ce() -> None:
    """
    Register Demo CE Cognition Engine with CFN on startup.

    This function:
    1. Checks CFN_URL environment variable
    2. Creates CELifecycleClient
    3. Calls client.register() (idempotent)

    Environment variables:
        CFN_URL: Base URL of CFN service (e.g. "http://localhost:9002")
                 If not set, skips registration (CE runs standalone)
        COGNITION_ENGINE_HOST: Advertised host for this service (default: "localhost")
        GRPC_PORT: Advertised gRPC port for this service (default: "50051")
        MAS_AUTO_ASSOCIATE: Auto-associate with all MAS (default: "false")
        HEALTH_PORT: Port of the HTTP health endpoint (default: "8080")
    """
    global _lifecycle_client

    # Get configuration from environment
    cfn_url = os.getenv("CFN_URL", "").rstrip("/")
    ce_host = os.getenv("COGNITION_ENGINE_HOST", "localhost")
    grpc_port = os.getenv("GRPC_PORT", DEFAULT_GRPC_PORT)
    health_port = get_health_port()

    if not cfn_url:
        logger.warning(
            "CFN_URL not set - Demo CE will run without CFN registration. "
            "This CE will not appear in Management Plane. "
            "Set CFN_URL environment variable for production deployments."
        )
        return

    # base_url format for registration (CFN expects URL with scheme)
    # For gRPC services, we use the host:port that CFN will dial
    base_url = f"{ce_host}:{grpc_port}"
    health_url = f"http://{ce_host}:{health_port}{HEALTH_PATH}"

    logger.info(
        f"Starting Demo CE registration with cfn_url={cfn_url}, base_url={base_url}, health_url={health_url}"
    )

    # Create lifecycle client
    _lifecycle_client = CELifecycleClient(
        cfn_base_url=cfn_url,
        timeout=10.0,
    )

    # Define Demo CE configuration
    # Note: cfn_id and mas_auto_associate are added by CFN before forwarding to management plane
    ce_config = CERegistrationRequest(
        name=CE_NAME,
        version=CE_VERSION,
        ce_type=CE_TYPE,
        base_url=base_url,
        endpoint=CE_ENDPOINT,
        health_url=health_url,
    )

    # Attempt registration
    response = await _lifecycle_client.register(ce_config)

    if response:
        logger.info(f"Demo CE registration complete: ce_id={response.ce_id}")
    else:
        logger.warning(
            "Demo CE registration failed - CE will operate without CFN visibility"
        )


async def shutdown_lifecycle_client() -> None:
    """
    Shutdown lifecycle client on service shutdown.

    This function:
    1. Closes HTTP client
    2. Clears global client reference

    Called from service lifespan shutdown phase.
    """
    global _lifecycle_client

    if _lifecycle_client:
        logger.info("Shutting down Demo CE lifecycle client...")
        await _lifecycle_client.close()
        _lifecycle_client = None
        logger.info("Demo CE lifecycle client shutdown complete")


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
