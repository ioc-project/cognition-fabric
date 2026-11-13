# Copyright 2026 Cisco Systems, Inc. and its affiliates
#
# SPDX-License-Identifier: Apache-2.0

"""Tests for CE registration module."""
import pytest
import httpx
from unittest.mock import AsyncMock, MagicMock, patch
from pathlib import Path
import sys
import os
import json

# Add src to path
sys.path.insert(0, str(Path(__file__).parent.parent / 'src'))

@pytest.fixture(autouse=True)
def start_mas_sync_spy(monkeypatch):
    calls = []

    def spy(*args, **kwargs):
        calls.append((args, kwargs))

    monkeypatch.setattr("mas_sync.start_mas_sync", spy)
    return calls


from registration import (
    CERegistrationRequest,
    CERegistrationResponse,
    CELifecycleClient,
    register_template_ce,
    shutdown_lifecycle_client,
    get_ce_id,
    get_cfn_id,
    CE_NAME,
    CE_VERSION,
    CE_TYPE,
    CE_ENDPOINT,
)


class TestCERegistrationRequest:
    """Test CERegistrationRequest dataclass."""

    def test_create_registration_request(self):
        """Test creating a registration request with new schema."""
        request = CERegistrationRequest(
            name="template-ce",
            version="1.0.0",
            ce_type="CASA",
            enforcing_url="localhost:50051",
            enforcing_endpoint="ioc.ce.v1.CognitionEngine",
            health_url="http://localhost:8080",
        )

        assert request.name == "template-ce"
        assert request.version == "1.0.0"
        assert request.ce_type == "CASA"
        assert request.enforcing_url == "localhost:50051"
        assert request.enforcing_endpoint == "ioc.ce.v1.CognitionEngine"
        assert request.health_url == "http://localhost:8080"


class TestCERegistrationResponse:
    """Test CERegistrationResponse dataclass."""

    def test_create_registration_response(self):
        """Test creating a registration response with new schema."""
        response = CERegistrationResponse(
            ce_id="ce-123",
            cfn_id="cfn-456",
            name="template-ce",
            version="1.0.0",
            ce_type="CASA",
            enforcing_url="http://localhost:8000",
            enforcing_endpoint="/authorize",
            enabled=True,
            status="offline",
            created=True,
        )

        assert response.ce_id == "ce-123"
        assert response.cfn_id == "cfn-456"
        assert response.name == "template-ce"
        assert response.version == "1.0.0"
        assert response.ce_type == "CASA"
        assert response.enforcing_url == "http://localhost:8000"
        assert response.enforcing_endpoint == "/authorize"
        assert response.enabled is True
        assert response.status == "offline"
        assert response.created is True


class TestCELifecycleClient:
    """Test CELifecycleClient."""

    def test_init(self):
        """Test client initialization."""
        client = CELifecycleClient(
            cfn_base_url="http://localhost:9002",
            timeout=10.0,
        )

        assert client.cfn_base_url == "http://localhost:9002"
        assert client.timeout == 10.0
        assert client.ce_id is None
        assert client.cfn_id is None

    def test_init_strips_trailing_slash(self):
        """Test that trailing slash is stripped from CFN URL."""
        client = CELifecycleClient(
            cfn_base_url="http://localhost:9002/",
        )
        assert client.cfn_base_url == "http://localhost:9002"

    @pytest.mark.asyncio
    async def test_close(self):
        """Test client close."""
        client = CELifecycleClient("http://localhost:9002")
        await client.close()
        assert client._client is None


@pytest.mark.asyncio
class TestHealthURLInPayloads:
    """health_url must be sent on both the POST and the PATCH after a 409."""

    def _request(self):
        return CERegistrationRequest(
            name="template-ce",
            version="1.0.0",
            ce_type="CASA",
            enforcing_url="template-ce:50051",
            enforcing_endpoint="ioc.ce.v1.CognitionEngine",
            health_url="http://template-ce:8080",
        )

    def _ce_json(self, key):
        return {
            key: "ce-123", "cfn_id": "cfn-1", "name": "template-ce", "version": "1.0.0",
            "ce_type": "CASA", "enforcing_url": "template-ce:50051",
            "enforcing_endpoint": "ioc.ce.v1.CognitionEngine", "enabled": True, "status": "online",
        }

    async def test_post_includes_health_url(self):
        client = CELifecycleClient("http://cfn:9002")
        http = AsyncMock()
        http.post.return_value = MagicMock(status_code=201, json=lambda: self._ce_json("ce_id"))
        client._client = http

        await client.register(self._request())

        assert http.post.call_args[1]["json"]["health_url"] == "http://template-ce:8080"
        assert http.post.call_args[1]["json"]["health_endpoint"] == "/healthz"

    async def test_patch_after_409_includes_health_url(self):
        client = CELifecycleClient("http://cfn:9002")
        http = AsyncMock()
        http.post.return_value = MagicMock(
            status_code=409, json=lambda: {"detail": {"existing_ce_id": "ce-123"}}
        )
        http.patch.return_value = MagicMock(status_code=200, json=lambda: self._ce_json("id"))
        client._client = http

        await client.register(self._request())

        assert http.patch.call_args[1]["json"]["health_url"] == "http://template-ce:8080"
        assert http.patch.call_args[1]["json"]["notification_url"] is None
        assert http.patch.call_args[1]["json"]["notification_endpoint"] is None

    async def test_patch_after_409_includes_notification_trio(self):
        request = self._request()
        request.notification_url = "http://template-ce:8080"
        request.notification_endpoint = "/notification"
        request.notification_protocol = "http"
        client = CELifecycleClient("http://cfn:9002")
        http = AsyncMock()
        http.post.return_value = MagicMock(
            status_code=409, json=lambda: {"detail": {"existing_ce_id": "ce-123"}}
        )
        http.patch.return_value = MagicMock(status_code=200, json=lambda: self._ce_json("id"))
        client._client = http

        await client.register(request)

        body = http.patch.call_args[1]["json"]
        assert body["notification_url"] == "http://template-ce:8080"
        assert body["notification_endpoint"] == "/notification"
        assert body["notification_protocol"] == "http"


@pytest.mark.asyncio
@pytest.mark.parametrize("notifications_enabled", [True, False], ids=["enabled", "disabled"])
@pytest.mark.parametrize(
    ("host", "previous_host"),
    [("localhost", "host.docker.internal"), ("host.docker.internal", "localhost")],
    ids=["source-cfn", "image-cfn"],
)
async def test_reregistration_replaces_stale_notification_callback(
    monkeypatch, host, previous_host, notifications_enabled
):
    import registration

    monkeypatch.setattr(registration, "_lifecycle_client", None)
    stored = {
        "id": "ce-123", "cfn_id": "cfn-1", "name": CE_NAME, "version": CE_VERSION,
        "ce_type": CE_TYPE, "enforcing_url": f"{previous_host}:50051",
        "enforcing_endpoint": CE_ENDPOINT, "health_url": f"http://{previous_host}:8082",
        "health_endpoint": "/healthz", "notification_url": f"http://{previous_host}:8080",
        "notification_endpoint": "/old-notification", "notification_protocol": "http",
        "enabled": True, "status": "online",
    }
    calls = []

    def handle(request):
        calls.append((request.method, request.url.path))
        if request.method == "POST":
            return httpx.Response(409, json={"detail": {"existing_ce_id": stored["id"]}})
        assert request.method == "PATCH"
        assert request.url.path == "/api/cognition-engine/ce-123"
        stored.update(json.loads(request.content))
        return httpx.Response(200, json=stored)

    client = CELifecycleClient("http://cfn:9002")
    async with httpx.AsyncClient(transport=httpx.MockTransport(handle)) as http:
        client._client = http
        with (
            patch.dict(os.environ, {
                "CFN_URL": "http://cfn:9002", "COGNITION_ENGINE_HOST": host,
                "GRPC_PORT": "50051", "HEALTH_PORT": "8082", "HTTP_PORT": "8080",
                "ENABLE_NOTIFICATIONS": str(notifications_enabled).lower(),
            }, clear=True),
            patch("registration.CELifecycleClient", return_value=client),
            patch("mas_sync.start_mas_sync"),
        ):
            await register_template_ce()

    assert calls == [("POST", "/api/cognition-engine"), ("PATCH", "/api/cognition-engine/ce-123")]
    assert client.ce_id == stored["id"] == "ce-123"
    assert stored["enforcing_url"] == f"{host}:50051"
    assert stored["health_url"] == f"http://{host}:8082"
    assert stored["notification_url"] == (f"http://{host}:8080" if notifications_enabled else None)
    assert stored["notification_endpoint"] == ("/notification" if notifications_enabled else None)
    assert stored["notification_protocol"] == "http"
    assert stored["enabled"] is True


@pytest.mark.asyncio
class TestRegisterTemplateCE:
    """Test register_template_ce function."""

    @patch.dict(os.environ, {}, clear=True)
    async def test_no_cfn_url_skips_registration(self, caplog):
        """Test that missing CFN_URL skips registration."""
        await register_template_ce()
        assert "CFN_URL not set" in caplog.text

    @patch.dict(os.environ, {"CFN_URL": "http://localhost:9002"}, clear=True)
    @patch('registration.CELifecycleClient')
    async def test_successful_registration(self, mock_client_class, start_mas_sync_spy):
        """Test successful CE registration."""
        # Mock the lifecycle client
        mock_client = AsyncMock()
        mock_client.register = AsyncMock(return_value=CERegistrationResponse(
            ce_id="ce-123",
            cfn_id="cfn-test",
            name=CE_NAME,
            version=CE_VERSION,
            ce_type=CE_TYPE,
            enforcing_url="http://localhost:8000",
            enforcing_endpoint=CE_ENDPOINT,
            enabled=True,
            status="offline",
            created=True,
        ))
        mock_client_class.return_value = mock_client

        await register_template_ce()

        # Verify client was created with correct URL
        mock_client_class.assert_called_once()
        call_kwargs = mock_client_class.call_args[1]
        assert call_kwargs['cfn_base_url'] == "http://localhost:9002"

        # Verify register was called
        mock_client.register.assert_called_once()

        # Verify health_url is sent in the registration request
        register_call = mock_client.register.call_args[0][0]
        assert register_call.health_url == "http://localhost:8081"
        assert register_call.notification_url == "http://localhost:8080"
        assert register_call.notification_endpoint == "/notification"
        assert register_call.notification_protocol == "http"
        assert start_mas_sync_spy == [(("ce-123",), {"cfn_url": "http://localhost:9002"})]

    @patch.dict(os.environ, {"CFN_URL": "http://localhost:9002","COGNITION_ENGINE_HOST": "example.com", "COGNITION_ENGINE_PORT": "9999"}, clear=True)
    @patch('registration.CELifecycleClient')
    async def test_custom_ce_url(self, mock_client_class):
        """Test CE enforcing_url constructed from environment variables."""
        mock_client = AsyncMock()
        mock_client.register = AsyncMock(return_value=CERegistrationResponse(
            ce_id="ce-123",
            cfn_id="cfn-test",
            name=CE_NAME,
            version=CE_VERSION,
            ce_type=CE_TYPE,
            enforcing_url="http://example.com:9999",
            enforcing_endpoint=CE_ENDPOINT,
            enabled=True,
            status="offline",
            created=True,
        ))
        mock_client_class.return_value = mock_client

        await register_template_ce()

        # Verify register was called with correct CE enforcing_url
        register_call = mock_client.register.call_args[0][0]
        # gRPC endpoint format: host:port (no http:// prefix)
        assert register_call.enforcing_url == "example.com:50051"

    @patch.dict(os.environ, {"CFN_URL": "http://localhost:9002"}, clear=True)
    @patch('registration.CELifecycleClient')
    async def test_registration_failure(self, mock_client_class, caplog, start_mas_sync_spy):
        """Test handling of registration failure."""
        mock_client = AsyncMock()
        mock_client.register = AsyncMock(return_value=None)  # Registration failed
        mock_client_class.return_value = mock_client

        await register_template_ce()

        # Verify warning logged
        assert "registration failed" in caplog.text
        assert start_mas_sync_spy == []


class TestHealthUrlConfiguration:
    """health_url is built from COGNITION_ENGINE_HOST and HEALTH_PORT."""

    @patch.dict(os.environ, {"CFN_URL": "http://localhost:9002", "HEALTH_PORT": "8081"}, clear=True)
    @patch('registration.CELifecycleClient')
    @pytest.mark.asyncio
    async def test_health_port_is_used_in_health_url(self, mock_client_class):
        mock_client = AsyncMock()
        mock_client.register = AsyncMock(return_value=None)
        mock_client_class.return_value = mock_client

        await register_template_ce()

        assert mock_client.register.call_args[0][0].health_url == "http://localhost:8081"

    @patch.dict(os.environ, {"CFN_URL": "http://localhost:9002", "HEALTH_PORT": "nope"}, clear=True)
    @pytest.mark.asyncio
    async def test_invalid_health_port_raises(self):
        with pytest.raises(ValueError, match="HEALTH_PORT"):
            await register_template_ce()


@pytest.mark.asyncio
class TestShutdownLifecycleClient:
    """Test shutdown_lifecycle_client function."""

    async def test_shutdown_with_no_client(self):
        """Test shutdown when no client exists."""
        # Should not raise
        await shutdown_lifecycle_client()

    @patch.dict(os.environ, {"CFN_URL": "http://localhost:9002"}, clear=True)
    @patch('registration.CELifecycleClient')
    async def test_shutdown_after_registration(self, mock_client_class):
        """Test shutdown after successful registration."""
        mock_client = AsyncMock()
        mock_client.register = AsyncMock(return_value=CERegistrationResponse(
            ce_id="ce-123",
            cfn_id="cfn-test",
            name=CE_NAME,
            version=CE_VERSION,
            ce_type=CE_TYPE,
            enforcing_url="http://localhost:8000",
            enforcing_endpoint=CE_ENDPOINT,
            enabled=True,
            status="offline",
            created=True,
        ))
        mock_client.close = AsyncMock()
        mock_client_class.return_value = mock_client

        # Register
        await register_template_ce()

        # Shutdown
        await shutdown_lifecycle_client()

        # Verify close was called
        mock_client.close.assert_called_once()


class TestHelperFunctions:
    """Test helper functions."""

    def test_get_ce_id_no_client(self):
        """Test get_ce_id when no client exists."""
        # Clear global client
        import registration
        registration._lifecycle_client = None

        assert get_ce_id() is None

    def test_get_cfn_id_no_client(self):
        """Test get_cfn_id when no client exists."""
        # Clear global client
        import registration
        registration._lifecycle_client = None

        assert get_cfn_id() is None


@pytest.mark.asyncio
class TestTemplateCEConfiguration:
    """Test Template CE specific configuration."""

    @patch.dict(os.environ, {"CFN_URL": "http://localhost:9002"}, clear=True)
    @patch('registration.CELifecycleClient')
    async def test_template_ce_config_fields(self, mock_client_class):
        """Test that Template CE registration includes correct fields."""
        mock_client = AsyncMock()
        mock_client.register = AsyncMock(return_value=CERegistrationResponse(
            ce_id="ce-123",
            cfn_id="cfn-test",
            name=CE_NAME,
            version=CE_VERSION,
            ce_type=CE_TYPE,
            enforcing_url="http://localhost:8000",
            enforcing_endpoint=CE_ENDPOINT,
            enabled=True,
            status="offline",
            created=True,
        ))
        mock_client_class.return_value = mock_client

        await register_template_ce()

        # Get the registration request that was passed
        register_call = mock_client.register.call_args[0][0]

        # Verify Template CE registration fields (cfn_id is added by CFN, not CE)
        assert register_call.name == CE_NAME
        assert register_call.version == CE_VERSION
        assert register_call.ce_type == CE_TYPE
        # gRPC endpoint format: host:port (no http:// prefix)
        assert register_call.enforcing_url == "localhost:50051"
        assert register_call.enforcing_endpoint == CE_ENDPOINT
