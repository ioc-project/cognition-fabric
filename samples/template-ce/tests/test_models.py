"""Tests for Pydantic models."""
import pytest
from uuid import uuid4
from pydantic import ValidationError
from pathlib import Path
import sys

# Add src to path
sys.path.insert(0, str(Path(__file__).parent.parent / 'src'))

from models import (
    EnforcementAction,
    EnforcementPayload,
    EnforcementRequest,
    EnforcementResponse
)


class TestEnforcementAction:
    """Test EnforcementAction enum."""

    def test_valid_actions(self):
        """Test valid action values."""
        assert EnforcementAction.ALLOW == "allow"
        assert EnforcementAction.BLOCK == "block"
        assert EnforcementAction.MODIFY == "modify"

    def test_action_values(self):
        """Test all enum values."""
        actions = [e.value for e in EnforcementAction]
        assert actions == ["allow", "block", "modify"]


class TestEnforcementPayload:
    """Test EnforcementPayload model."""

    def test_valid_payload(self):
        """Test creating valid payload."""
        payload = EnforcementPayload(
            workspace_id=uuid4(),
            mas_id=uuid4(),
            source_agent_id="agent-1",
            destination_agent_id="agent-2",
            trace_id="trace-123"
        )

        assert payload.source_agent_id == "agent-1"
        assert payload.destination_agent_id == "agent-2"
        assert payload.trace_id == "trace-123"

    def test_uuid_validation(self):
        """Test UUID field validation."""
        workspace_id = uuid4()
        mas_id = uuid4()

        payload = EnforcementPayload(
            workspace_id=workspace_id,
            mas_id=mas_id,
            source_agent_id="agent-1",
            destination_agent_id="agent-2",
            trace_id="trace-123"
        )

        assert payload.workspace_id == workspace_id
        assert payload.mas_id == mas_id

    def test_invalid_uuid(self):
        """Test invalid UUID fails validation."""
        with pytest.raises(ValidationError) as exc_info:
            EnforcementPayload(
                workspace_id="not-a-uuid",
                mas_id=uuid4(),
                source_agent_id="agent-1",
                destination_agent_id="agent-2",
                trace_id="trace-123"
            )

        errors = exc_info.value.errors()
        assert any("uuid" in str(e).lower() for e in errors)

    def test_missing_required_fields(self):
        """Test missing required fields fails validation."""
        with pytest.raises(ValidationError) as exc_info:
            EnforcementPayload(
                workspace_id=uuid4(),
                mas_id=uuid4(),
                # Missing other required fields
            )

        errors = exc_info.value.errors()
        assert len(errors) >= 3  # At least 3 missing fields

    def test_trace_id_string(self):
        """Test trace_id accepts string (not just UUID)."""
        payload = EnforcementPayload(
            workspace_id=uuid4(),
            mas_id=uuid4(),
            source_agent_id="agent-1",
            destination_agent_id="agent-2",
            trace_id="custom-trace-string"
        )

        assert payload.trace_id == "custom-trace-string"


class TestEnforcementRequest:
    """Test EnforcementRequest model."""

    def test_valid_request_with_extra(self):
        """Test creating valid request with extra metadata."""
        request = EnforcementRequest(
            extra={"user_agent": "test", "timestamp": "2026-08-11"},
            payload=EnforcementPayload(
                workspace_id=uuid4(),
                mas_id=uuid4(),
                source_agent_id="agent-1",
                destination_agent_id="agent-2",
                trace_id="trace-123"
            )
        )

        assert request.extra == {"user_agent": "test", "timestamp": "2026-08-11"}
        assert request.payload.source_agent_id == "agent-1"

    def test_valid_request_without_extra(self):
        """Test creating valid request without extra metadata."""
        request = EnforcementRequest(
            payload=EnforcementPayload(
                workspace_id=uuid4(),
                mas_id=uuid4(),
                source_agent_id="agent-1",
                destination_agent_id="agent-2",
                trace_id="trace-123"
            )
        )

        assert request.extra is None
        assert request.payload.source_agent_id == "agent-1"

    def test_extra_accepts_any_dict(self):
        """Test extra field accepts any dictionary."""
        request = EnforcementRequest(
            extra={
                "custom_field": "value",
                "nested": {"key": "value"},
                "number": 123
            },
            payload=EnforcementPayload(
                workspace_id=uuid4(),
                mas_id=uuid4(),
                source_agent_id="agent-1",
                destination_agent_id="agent-2",
                trace_id="trace-123"
            )
        )

        assert request.extra["custom_field"] == "value"
        assert request.extra["nested"]["key"] == "value"
        assert request.extra["number"] == 123

    def test_missing_payload(self):
        """Test missing payload fails validation."""
        with pytest.raises(ValidationError) as exc_info:
            EnforcementRequest(extra={"test": "value"})

        errors = exc_info.value.errors()
        assert any(e["loc"] == ("payload",) for e in errors)


class TestEnforcementResponse:
    """Test EnforcementResponse model."""

    def test_response_with_allow(self):
        """Test response with allow action."""
        response = EnforcementResponse(action=EnforcementAction.ALLOW)

        assert response.action == EnforcementAction.ALLOW
        assert response.modify is None

    def test_response_with_block(self):
        """Test response with block action."""
        response = EnforcementResponse(action=EnforcementAction.BLOCK)

        assert response.action == EnforcementAction.BLOCK
        assert response.modify is None

    def test_response_with_modify(self):
        """Test response with modify action and flag."""
        response = EnforcementResponse(
            action=EnforcementAction.MODIFY,
            modify=True
        )

        assert response.action == EnforcementAction.MODIFY
        assert response.modify is True

    def test_response_action_as_string(self):
        """Test action can be specified as string."""
        response = EnforcementResponse(action="allow")

        assert response.action == EnforcementAction.ALLOW

    def test_invalid_action(self):
        """Test invalid action fails validation."""
        with pytest.raises(ValidationError) as exc_info:
            EnforcementResponse(action="invalid")

        errors = exc_info.value.errors()
        assert any("action" in str(e) for e in errors)

    def test_modify_optional(self):
        """Test modify field is optional."""
        response = EnforcementResponse(action=EnforcementAction.ALLOW)
        assert response.modify is None

        response = EnforcementResponse(
            action=EnforcementAction.ALLOW,
            modify=False
        )
        assert response.modify is False


class TestModelSerialization:
    """Test model serialization/deserialization."""

    def test_request_to_dict(self):
        """Test request serialization to dict."""
        request = EnforcementRequest(
            payload=EnforcementPayload(
                workspace_id=uuid4(),
                mas_id=uuid4(),
                source_agent_id="agent-1",
                destination_agent_id="agent-2",
                trace_id="trace-123"
            )
        )

        data = request.model_dump()
        assert "payload" in data
        assert data["payload"]["source_agent_id"] == "agent-1"

    def test_request_from_dict(self):
        """Test request deserialization from dict."""
        workspace_id = str(uuid4())
        mas_id = str(uuid4())

        data = {
            "payload": {
                "workspace_id": workspace_id,
                "mas_id": mas_id,
                "source_agent_id": "agent-1",
                "destination_agent_id": "agent-2",
                "trace_id": "trace-123"
            }
        }

        request = EnforcementRequest(**data)
        assert request.payload.source_agent_id == "agent-1"
        assert str(request.payload.workspace_id) == workspace_id

    def test_response_to_json(self):
        """Test response serialization to JSON."""
        response = EnforcementResponse(
            action=EnforcementAction.ALLOW,
            modify=None
        )

        json_data = response.model_dump_json()
        assert "allow" in json_data

    def test_response_from_json(self):
        """Test response deserialization from JSON."""
        json_data = '{"action": "block", "modify": true}'

        response = EnforcementResponse.model_validate_json(json_data)
        assert response.action == EnforcementAction.BLOCK
        assert response.modify is True
