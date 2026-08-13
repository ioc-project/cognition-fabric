"""Tests for CE registration module."""
import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from pathlib import Path
import sys
import os

# Add src to path
sys.path.insert(0, str(Path(__file__).parent.parent / 'src'))

from registration import (
    CERegistrationRequest,
    CERegistrationResponse,
    CELifecycleClient,
    register_casa_ce,
    shutdown_lifecycle_client,
    get_ce_id,
    get_cfn_id,
    CE_TYPE,
    CE_ENDPOINT,
)


class TestCERegistrationRequest:
    """Test CERegistrationRequest dataclass."""

    def test_create_registration_request(self):
        """Test creating a registration request with new schema."""
        request = CERegistrationRequest(
            cfn_id="cfn-test",
            ce_type="CASA",
            base_url="http://localhost:8000",
            endpoint="/authorize",
            mas_auto_associate=False,
        )

        assert request.cfn_id == "cfn-test"
        assert request.ce_type == "CASA"
        assert request.base_url == "http://localhost:8000"
        assert request.endpoint == "/authorize"
        assert request.mas_auto_associate is False


class TestCERegistrationResponse:
    """Test CERegistrationResponse dataclass."""

    def test_create_registration_response(self):
        """Test creating a registration response with new schema."""
        response = CERegistrationResponse(
            ce_id="ce-123",
            cfn_id="cfn-456",
            ce_type="CASA",
            base_url="http://localhost:8000",
            endpoint="/authorize",
            enabled=True,
            status="offline",
            created=True,
        )

        assert response.ce_id == "ce-123"
        assert response.cfn_id == "cfn-456"
        assert response.ce_type == "CASA"
        assert response.base_url == "http://localhost:8000"
        assert response.endpoint == "/authorize"
        assert response.enabled is True
        assert response.status == "offline"
        assert response.created is True


class TestCELifecycleClient:
    """Test CELifecycleClient."""

    def test_init(self):
        """Test client initialization."""
        client = CELifecycleClient(
            cfn_base_url="http://localhost:9002",
            heartbeat_interval_sec=30.0,
            timeout=10.0,
        )

        assert client.cfn_base_url == "http://localhost:9002"
        assert client.heartbeat_interval_sec == 30.0
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
        assert client._heartbeat_task is None


@pytest.mark.asyncio
class TestRegisterCasaCE:
    """Test register_casa_ce function."""

    @patch.dict(os.environ, {}, clear=True)
    async def test_no_cfn_url_skips_registration(self, caplog):
        """Test that missing CFN_URL skips registration."""
        await register_casa_ce()
        assert "CFN_URL not set" in caplog.text

    @patch.dict(os.environ, {"CFN_URL": "http://localhost:9002", "CFN_ID": "cfn-test"})
    @patch('registration.CELifecycleClient')
    async def test_successful_registration(self, mock_client_class):
        """Test successful CE registration."""
        # Mock the lifecycle client
        mock_client = AsyncMock()
        mock_client.register = AsyncMock(return_value=CERegistrationResponse(
            ce_id="ce-123",
            cfn_id="cfn-test",
            ce_type=CE_TYPE,
            base_url="http://localhost:8000",
            endpoint=CE_ENDPOINT,
            enabled=True,
            status="offline",
            created=True,
        ))
        mock_client_class.return_value = mock_client

        await register_casa_ce()

        # Verify client was created with correct URL
        mock_client_class.assert_called_once()
        call_kwargs = mock_client_class.call_args[1]
        assert call_kwargs['cfn_base_url'] == "http://localhost:9002"

        # Verify register was called
        mock_client.register.assert_called_once()

        # Verify heartbeat was started
        mock_client.start_heartbeat.assert_called_once()

    @patch.dict(os.environ, {"CFN_URL": "http://localhost:9002", "CFN_ID": "cfn-test", "COGNITION_ENGINE_HOST": "example.com", "COGNITION_ENGINE_PORT": "9999"})
    @patch('registration.CELifecycleClient')
    async def test_custom_ce_url(self, mock_client_class):
        """Test CE base_url constructed from environment variables."""
        mock_client = AsyncMock()
        mock_client.register = AsyncMock(return_value=CERegistrationResponse(
            ce_id="ce-123",
            cfn_id="cfn-test",
            ce_type=CE_TYPE,
            base_url="http://example.com:9999",
            endpoint=CE_ENDPOINT,
            enabled=True,
            status="offline",
            created=True,
        ))
        mock_client_class.return_value = mock_client

        await register_casa_ce()

        # Verify register was called with correct CE base_url
        register_call = mock_client.register.call_args[0][0]
        assert register_call.base_url == "http://example.com:9999"

    @patch.dict(os.environ, {"CFN_URL": "http://localhost:9002", "CFN_ID": "cfn-test"})
    @patch('registration.CELifecycleClient')
    async def test_registration_failure(self, mock_client_class, caplog):
        """Test handling of registration failure."""
        mock_client = AsyncMock()
        mock_client.register = AsyncMock(return_value=None)  # Registration failed
        mock_client_class.return_value = mock_client

        await register_casa_ce()

        # Verify warning logged
        assert "registration failed" in caplog.text

        # Verify heartbeat was NOT started
        mock_client.start_heartbeat.assert_not_called()


@pytest.mark.asyncio
class TestShutdownLifecycleClient:
    """Test shutdown_lifecycle_client function."""

    async def test_shutdown_with_no_client(self):
        """Test shutdown when no client exists."""
        # Should not raise
        await shutdown_lifecycle_client()

    @patch.dict(os.environ, {"CFN_URL": "http://localhost:9002", "CFN_ID": "cfn-test"})
    @patch('registration.CELifecycleClient')
    async def test_shutdown_after_registration(self, mock_client_class):
        """Test shutdown after successful registration."""
        mock_client = AsyncMock()
        mock_client.register = AsyncMock(return_value=CERegistrationResponse(
            ce_id="ce-123",
            cfn_id="cfn-test",
            ce_type=CE_TYPE,
            base_url="http://localhost:8000",
            endpoint=CE_ENDPOINT,
            enabled=True,
            status="offline",
            created=True,
        ))
        mock_client.close = AsyncMock()
        mock_client_class.return_value = mock_client

        # Register
        await register_casa_ce()

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
class TestCasaCEConfiguration:
    """Test CASA CE specific configuration."""

    @patch.dict(os.environ, {"CFN_URL": "http://localhost:9002", "CFN_ID": "cfn-test"})
    @patch('registration.CELifecycleClient')
    async def test_casa_ce_config_fields(self, mock_client_class):
        """Test that CASA CE registration includes correct fields."""
        mock_client = AsyncMock()
        mock_client.register = AsyncMock(return_value=CERegistrationResponse(
            ce_id="ce-123",
            cfn_id="cfn-test",
            ce_type=CE_TYPE,
            base_url="http://localhost:8000",
            endpoint=CE_ENDPOINT,
            enabled=True,
            status="offline",
            created=True,
        ))
        mock_client_class.return_value = mock_client

        await register_casa_ce()

        # Get the registration request that was passed
        register_call = mock_client.register.call_args[0][0]

        # Verify CASA CE registration fields
        assert register_call.cfn_id == "cfn-test"
        assert register_call.ce_type == CE_TYPE
        assert register_call.base_url == "http://localhost:8000"
        assert register_call.endpoint == CE_ENDPOINT
