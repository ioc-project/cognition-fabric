"""Tests for FastAPI service."""
import pytest
from uuid import uuid4
from fastapi.testclient import TestClient
from pathlib import Path
import sys

# Add src to path
sys.path.insert(0, str(Path(__file__).parent.parent / 'src'))

from service import app


@pytest.fixture
def client():
    """Create test client."""
    return TestClient(app)


class TestAuthorizeEndpoint:
    """Test /authorize endpoint."""

    def test_authorize_returns_200_for_valid_request(self, client):
        """Test authorize endpoint returns 200 for valid request."""
        request_data = {
            "payload": {
                "mas_id": str(uuid4()),
                "source_agent_id": "agent-1",
                "destination_agent_id": "agent-2",
                "trace_id": str(uuid4())
            }
        }

        response = client.post("/authorize", json=request_data)
        assert response.status_code == 200

    def test_authorize_returns_action(self, client):
        """Test authorize endpoint returns action field."""
        request_data = {
            "payload": {
                "mas_id": str(uuid4()),
                "source_agent_id": "agent-1",
                "destination_agent_id": "agent-2",
                "trace_id": str(uuid4())
            }
        }

        response = client.post("/authorize", json=request_data)
        data = response.json()

        assert "action" in data
        assert data["action"] in ["allow", "block", "modify"]

    def test_authorize_default_action_is_allow(self, client):
        """Test authorize endpoint defaults to allow (current implementation)."""
        request_data = {
            "payload": {
                "mas_id": str(uuid4()),
                "source_agent_id": "agent-1",
                "destination_agent_id": "agent-2",
                "trace_id": str(uuid4())
            }
        }

        response = client.post("/authorize", json=request_data)
        data = response.json()

        # Current implementation defaults to allow
        assert data["action"] == "allow"

    def test_authorize_with_extra_metadata(self, client):
        """Test authorize endpoint accepts extra metadata."""
        request_data = {
            "extra": {
                "user_agent": "test-client/1.0",
                "request_timestamp": "2026-08-11T12:00:00Z"
            },
            "payload": {
                "mas_id": str(uuid4()),
                "source_agent_id": "agent-1",
                "destination_agent_id": "agent-2",
                "trace_id": str(uuid4())
            }
        }

        response = client.post("/authorize", json=request_data)
        assert response.status_code == 200

    def test_authorize_without_extra_metadata(self, client):
        """Test authorize endpoint works without extra metadata."""
        request_data = {
            "payload": {
                "mas_id": str(uuid4()),
                "source_agent_id": "agent-1",
                "destination_agent_id": "agent-2",
                "trace_id": str(uuid4())
            }
        }

        response = client.post("/authorize", json=request_data)
        assert response.status_code == 200

    def test_authorize_with_string_trace_id(self, client):
        """Test authorize endpoint accepts string trace_id."""
        request_data = {
            "payload": {
                "mas_id": str(uuid4()),
                "source_agent_id": "agent-1",
                "destination_agent_id": "agent-2",
                "trace_id": "custom-trace-string-123"
            }
        }

        response = client.post("/authorize", json=request_data)
        assert response.status_code == 200

    def test_authorize_returns_422_for_invalid_uuid(self, client):
        """Test authorize endpoint returns 422 for invalid UUID."""
        request_data = {
            "payload": {
                "mas_id": "not-a-valid-uuid",
                "source_agent_id": "agent-1",
                "destination_agent_id": "agent-2",
                "trace_id": str(uuid4())
            }
        }

        response = client.post("/authorize", json=request_data)
        assert response.status_code == 422

    def test_authorize_returns_422_for_missing_fields(self, client):
        """Test authorize endpoint returns 422 for missing required fields."""
        request_data = {
            "payload": {
                "mas_id": str(uuid4()),
                # Missing other required fields
            }
        }

        response = client.post("/authorize", json=request_data)
        assert response.status_code == 422

    def test_authorize_returns_422_for_missing_payload(self, client):
        """Test authorize endpoint returns 422 for missing payload."""
        request_data = {
            "extra": {"test": "value"}
            # No payload
        }

        response = client.post("/authorize", json=request_data)
        assert response.status_code == 422

    def test_authorize_returns_422_for_empty_body(self, client):
        """Test authorize endpoint returns 422 for empty body."""
        response = client.post("/authorize", json={})
        assert response.status_code == 422

    def test_authorize_includes_modify_field(self, client):
        """Test enforce response includes modify field."""
        request_data = {
            "payload": {
                "mas_id": str(uuid4()),
                "source_agent_id": "agent-1",
                "destination_agent_id": "agent-2",
                "trace_id": str(uuid4())
            }
        }

        response = client.post("/authorize", json=request_data)
        data = response.json()

        # modify field should be present (even if None)
        assert "modify" in data


class TestAPIDocumentation:
    """Test API documentation endpoints."""

    def test_openapi_json_available(self, client):
        """Test OpenAPI JSON schema is available."""
        response = client.get("/openapi.json")
        assert response.status_code == 200

    def test_openapi_includes_authorize_endpoint(self, client):
        """Test OpenAPI schema includes /authorize endpoint."""
        response = client.get("/openapi.json")
        data = response.json()

        assert "paths" in data
        assert "/authorize" in data["paths"]
        assert "post" in data["paths"]["/authorize"]

    def test_openapi_includes_models(self, client):
        """Test OpenAPI schema includes Pydantic models."""
        response = client.get("/openapi.json")
        data = response.json()

        assert "components" in data
        assert "schemas" in data["components"]

        schemas = data["components"]["schemas"]
        assert "EnforcementRequest" in schemas or any("Request" in s for s in schemas)


class TestErrorHandling:
    """Test error handling."""

    def test_invalid_json_returns_422(self, client):
        """Test invalid JSON returns 422."""
        response = client.post(
            "/authorize",
            data="not valid json",
            headers={"Content-Type": "application/json"}
        )
        assert response.status_code == 422

    def test_wrong_content_type_returns_422(self, client):
        """Test wrong content type returns 422."""
        response = client.post(
            "/authorize",
            data="mas_id=test",
            headers={"Content-Type": "application/x-www-form-urlencoded"}
        )
        assert response.status_code == 422

    def test_404_for_unknown_endpoint(self, client):
        """Test 404 for unknown endpoint."""
        response = client.get("/unknown")
        assert response.status_code == 404


class TestBlockingBehavior:
    """Test that API is synchronous/blocking."""

    def test_authorize_is_synchronous(self, client):
        """Test authorize endpoint waits for response (blocking)."""
        request_data = {
            "payload": {
                "mas_id": str(uuid4()),
                "source_agent_id": "agent-1",
                "destination_agent_id": "agent-2",
                "trace_id": str(uuid4())
            }
        }

        # Client waits for response - this is blocking
        response = client.post("/authorize", json=request_data)

        # Response is immediate (within test client timeout)
        assert response.status_code == 200
        assert "action" in response.json()

    def test_multiple_concurrent_requests(self, client):
        """Test multiple requests can be handled (server-side async)."""
        request_data = {
            "payload": {
                "mas_id": str(uuid4()),
                "source_agent_id": "agent-1",
                "destination_agent_id": "agent-2",
                "trace_id": str(uuid4())
            }
        }

        # Make multiple requests
        responses = [
            client.post("/authorize", json=request_data)
            for _ in range(5)
        ]

        # All should succeed
        assert all(r.status_code == 200 for r in responses)
        assert all("action" in r.json() for r in responses)
