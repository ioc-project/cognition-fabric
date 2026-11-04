# Copyright 2026 Cisco Systems, Inc. and its affiliates
#
# SPDX-License-Identifier: Apache-2.0

"""Tests for Cognition Engine API endpoints"""

import asyncio
import json
import time
from datetime import datetime, timedelta, timezone
from unittest.mock import patch

import pytest
import requests
from fastapi import status

from server.database.relational_db.db import RelationalDB
from server.services.cfn_ce_probe import probe_ce_health
from server.services.cognition_engine import cognition_engine_service
from server.services.cognition_engine_monitor import CognitionEngineMonitor


def _base_payload(cfn_id: str, ce_type: str = "CASA", name: str = "test-ce", version: str = "1.0.0") -> dict:
    return {
        "cfn_id": cfn_id,
        "name": name,
        "version": version,
        "ce_type": ce_type,
        "enforcing_url": "http://ce.internal:8080",
        "enforcing_endpoint": "/api/l9/enforcement",
        "health_url": "http://ce.internal:8080/healthz",
        "health_endpoint": "/healthz",
    }


def _register(client, cfn_id, ce_type="CASA", name: str = None, version: str = "1.0.0", **extra):
    # Generate unique name if not provided to avoid 409 conflicts
    if name is None:
        import uuid

        name = f"test-ce-{uuid.uuid4().hex[:8]}"
    resp = client.post(
        "/api/cognition-engines",
        json={
            **_base_payload(cfn_id, ce_type, name, version),
            "enforcing_url": f"{name}:50051",
            "health_url": f"http://{name}:8080",
            **extra,
        },
    )
    assert resp.status_code == status.HTTP_201_CREATED
    return resp.json()["ce_id"]


def _delete(client, ce_id: str) -> None:
    """Disable then soft-delete a CE."""
    client.patch(f"/api/cognition-engines/{ce_id}", json={"enabled": False})
    resp = client.delete(f"/api/cognition-engines/{ce_id}")
    assert resp.status_code == status.HTTP_204_NO_CONTENT


def _force_offline(ce_id: str) -> None:
    """Directly flip a CE to offline, simulating a CE that failed its health probes."""
    from server.database.relational_db.models.cognition_engine import CognitionEngine as CognitionEngineModel

    db = RelationalDB()
    session = db.get_session()
    try:
        engine = session.query(CognitionEngineModel).filter(CognitionEngineModel.id == ce_id).first()
        engine.status = "offline"
        session.commit()
    finally:
        session.close()


class TestCognitionEngineRegister:
    """Tests for POST /cognition-engines"""

    def test_register_invalid_cfn(self, client):
        """Registration under a non-existent CFN returns 404"""
        response = client.post(
            "/api/cognition-engines",
            json=_base_payload("non-existent-cfn-id"),
        )
        assert response.status_code == status.HTTP_404_NOT_FOUND
        assert "cognition fabric node" in response.json()["detail"].lower()

    def test_register_new_engine_returns_201(self, client, registered_cfn):
        """New registration returns 201 and created=true"""
        response = client.post(
            "/api/cognition-engines",
            json=_base_payload(registered_cfn, name="new-engine-test", version="1.0.0"),
        )

        assert response.status_code == status.HTTP_201_CREATED
        data = response.json()
        assert data["ce_id"]
        assert data["cfn_id"] == registered_cfn
        assert data["name"] == "new-engine-test"
        assert data["version"] == "1.0.0"
        assert data["ce_type"] == "CASA"
        assert data["enforcing_url"] == "http://ce.internal:8080"
        assert data["enforcing_endpoint"] == "/api/l9/enforcement"
        assert data["status"] == "online"
        assert data["created"] is True

    def test_register_same_name_version_returns_409(self, client, registered_cfn):
        """Re-registering the same (cfn_id, name, version) returns 409 Conflict with existing_ce_id"""
        payload = _base_payload(registered_cfn, "CASA", name="conflict-test-ce", version="1.0.0")

        first = client.post("/api/cognition-engines", json=payload)
        assert first.status_code == status.HTTP_201_CREATED
        ce_id = first.json()["ce_id"]

        second = client.post(
            "/api/cognition-engines",
            json={**payload, "enforcing_url": "http://ce-updated.internal:8080"},
        )

        assert second.status_code == status.HTTP_409_CONFLICT
        data = second.json()
        # FastAPI wraps the dict in 'detail' field
        assert data["detail"]["existing_ce_id"] == ce_id
        assert "already exists" in data["detail"]["error"].lower()

    def test_register_different_version_creates_new_record(self, client, registered_cfn):
        """Registering same name with different version creates a new record (201)"""
        first = client.post(
            "/api/cognition-engines",
            json=_base_payload(registered_cfn, "CASA", name="version-test-ce", version="1.0.0"),
        )
        assert first.status_code == status.HTTP_201_CREATED
        ce_id_v1 = first.json()["ce_id"]

        second = client.post(
            "/api/cognition-engines",
            json=_base_payload(registered_cfn, "CASA", name="version-test-ce", version="2.0.0"),
        )

        assert second.status_code == status.HTTP_201_CREATED
        data = second.json()
        assert data["ce_id"] != ce_id_v1
        assert data["version"] == "2.0.0"
        assert data["name"] == "version-test-ce"
        assert data["created"] is True

    def test_register_different_ce_type_creates_new_record(self, client, registered_cfn):
        """Registering a different ce_type under the same CFN creates a new record (201)"""
        first = client.post("/api/cognition-engines", json=_base_payload(registered_cfn, "CASA", name="type-test-casa"))
        assert first.status_code == status.HTTP_201_CREATED
        ce_id_casa = first.json()["ce_id"]

        second = client.post(
            "/api/cognition-engines",
            json=_base_payload(registered_cfn, "DETECTIVE", name="type-test-detective"),
        )

        assert second.status_code == status.HTTP_201_CREATED
        data = second.json()
        assert data["ce_id"] != ce_id_casa
        assert data["ce_type"] == "DETECTIVE"
        assert data["created"] is True

    def test_register_full_payload(self, client, registered_cfn):
        """Registration with all optional fields"""
        payload = {
            "cfn_id": registered_cfn,
            "name": "full-payload-ce",
            "version": "2.0.0",
            "ce_type": "DETECTIVE",
            "enforcing_url": "https://detective.internal:9090",
            "enforcing_endpoint": "/api/l9/detective",
            "health_url": "http://ce.internal:8080/healthz",
            "health_endpoint": "/healthz",
            "mas_config": {"timeout": 30, "max_requests": 3000},
        }

        response = client.post("/api/cognition-engines", json=payload)

        assert response.status_code == status.HTTP_201_CREATED
        data = response.json()
        assert data["name"] == "full-payload-ce"
        assert data["version"] == "2.0.0"
        assert data["ce_type"] == "DETECTIVE"
        assert data["enforcing_endpoint"] == "/api/l9/detective"
        assert data["created"] is True

    def test_register_casa_ce_type(self, client, registered_cfn):
        """Registration with CASA CE type"""
        payload = {
            "cfn_id": registered_cfn,
            "name": "casa-type-test",
            "version": "1.0.0",
            "ce_type": "CASA",
            "enforcing_url": "https://casa.internal:9090",
            "enforcing_endpoint": "/api/l9/enforcement",
            "health_url": "http://ce.internal:8080/healthz",
            "health_endpoint": "/healthz",
        }

        response = client.post("/api/cognition-engines", json=payload)

        assert response.status_code == status.HTTP_201_CREATED
        data = response.json()
        assert data["ce_type"] == "CASA"

    def test_register_detective_ce_type(self, client, registered_cfn):
        """Registration with DETECTIVE CE type"""
        payload = {
            "cfn_id": registered_cfn,
            "name": "detective-type-test",
            "version": "1.0.0",
            "ce_type": "DETECTIVE",
            "enforcing_url": "https://detective.internal:9090",
            "enforcing_endpoint": "/api/l9/detective",
            "health_url": "http://ce.internal:8080/healthz",
            "health_endpoint": "/healthz",
        }

        response = client.post("/api/cognition-engines", json=payload)

        assert response.status_code == status.HTTP_201_CREATED
        data = response.json()
        assert data["ce_type"] == "DETECTIVE"

    def test_register_missing_required_fields(self, client, registered_cfn):
        """Missing url or version is rejected with 422"""
        response = client.post(
            "/api/cognition-engines",
            json={"cfn_id": registered_cfn, "ce_type": "CASA"},
        )
        assert response.status_code == status.HTTP_422_UNPROCESSABLE_CONTENT

    def test_register_same_name_version_different_cfns(self, client):
        """Same (name, version) can be registered under different CFNs"""
        cfn1_id = client.post(
            "/api/cognition-fabric-nodes/register",
            json={"id": "cfn-ce-test-1", "name": "CFN CE Test 1"},
        ).json()["id"]

        cfn2_id = client.post(
            "/api/cognition-fabric-nodes/register",
            json={"id": "cfn-ce-test-2", "name": "CFN CE Test 2"},
        ).json()["id"]

        resp1 = client.post(
            "/api/cognition-engines", json=_base_payload(cfn1_id, "CASA", name="shared-ce", version="1.0.0")
        )
        assert resp1.status_code == status.HTTP_201_CREATED

        resp2 = client.post(
            "/api/cognition-engines", json=_base_payload(cfn2_id, "CASA", name="shared-ce", version="1.0.0")
        )
        assert resp2.status_code == status.HTTP_201_CREATED
        assert resp2.json()["cfn_id"] == cfn2_id
        assert resp2.json()["ce_id"] != resp1.json()["ce_id"]


class TestCognitionEngineList:
    """Tests for GET /cognition-engines"""

    def test_list_empty(self, client, registered_cfn):
        """No engines registered under CFN returns empty list"""
        response = client.get(f"/api/cognition-engines?cfn_id={registered_cfn}")

        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["total"] == 0
        assert data["cognition_engines"] == []

    def test_list_by_cfn_id(self, client, registered_cfn):
        """Lists all engines under a CFN"""
        _register(client, registered_cfn, "CASA")
        _register(client, registered_cfn, "DETECTIVE")

        response = client.get(f"/api/cognition-engines?cfn_id={registered_cfn}")

        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["total"] == 2
        ce_types = [e["ce_type"] for e in data["cognition_engines"]]
        assert "CASA" in ce_types
        assert "DETECTIVE" in ce_types

    def test_list_filter_by_status(self, client, registered_cfn):
        """Status filter returns only matching engines"""
        ce_id = _register(client, registered_cfn, "CASA")
        _register(client, registered_cfn, "DETECTIVE")

        # Both are online immediately on registration; force one back offline
        # (simulating the stale-engine sweep) so the filter has something to distinguish.
        _force_offline(ce_id)

        response = client.get(f"/api/cognition-engines?cfn_id={registered_cfn}&status=online")

        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["total"] == 1
        assert data["cognition_engines"][0]["ce_type"] == "DETECTIVE"

    def test_list_cfn_isolation(self, client):
        """Engines from one CFN don't appear in another CFN's listing"""
        cfn1_id = client.post(
            "/api/cognition-fabric-nodes/register",
            json={"id": "cfn-list-iso-1", "name": "CFN List Iso 1"},
        ).json()["id"]

        cfn2_id = client.post(
            "/api/cognition-fabric-nodes/register",
            json={"id": "cfn-list-iso-2", "name": "CFN List Iso 2"},
        ).json()["id"]

        _register(client, cfn1_id, "CASA")
        _register(client, cfn2_id, "DETECTIVE")

        resp1 = client.get(f"/api/cognition-engines?cfn_id={cfn1_id}")
        assert resp1.json()["total"] == 1
        assert resp1.json()["cognition_engines"][0]["ce_type"] == "CASA"

        resp2 = client.get(f"/api/cognition-engines?cfn_id={cfn2_id}")
        assert resp2.json()["total"] == 1
        assert resp2.json()["cognition_engines"][0]["ce_type"] == "DETECTIVE"

    def test_list_deleted_engines_excluded(self, client, registered_cfn):
        """Soft-deleted engines do not appear in the list"""
        _register(client, registered_cfn, "CASA")
        del_id = _register(client, registered_cfn, "DETECTIVE")

        _delete(client, del_id)

        data = client.get(f"/api/cognition-engines?cfn_id={registered_cfn}").json()
        assert data["total"] == 1
        assert data["cognition_engines"][0]["ce_type"] == "CASA"

    def test_list_response_fields(self, client, registered_cfn):
        """List items contain the expected fields per spec"""
        _register(client, registered_cfn, "CASA")

        item = client.get(f"/api/cognition-engines?cfn_id={registered_cfn}").json()["cognition_engines"][0]

        for field in (
            "id",
            "cfn_id",
            "name",
            "version",
            "ce_type",
            "enforcing_url",
            "enforcing_endpoint",
            "enabled",
            "status",
            "mas_config",
        ):
            assert field in item


class TestCognitionEngineGet:
    """Tests for GET /cognition-engines/{ce_id}"""

    def test_get_cognition_engine(self, client, registered_cfn):
        """Returns full detail for a known engine"""
        ce_id = _register(
            client,
            registered_cfn,
            "DETECTIVE",
            enforcing_endpoint="/api/l9/detective",
        )

        response = client.get(f"/api/cognition-engines/{ce_id}")

        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["id"] == ce_id
        assert data["cfn_id"] == registered_cfn
        assert data["ce_type"] == "DETECTIVE"
        assert data["enforcing_endpoint"] == "/api/l9/detective"
        assert data["status"] == "online"
        assert "created_at" in data
        assert "updated_at" in data

    def test_get_nonexistent_engine(self, client):
        """Returns 404 for unknown ce_id"""
        response = client.get("/api/cognition-engines/nonexistent-id")
        assert response.status_code == status.HTTP_404_NOT_FOUND
        assert "not found" in response.json()["detail"].lower()


class TestCognitionEngineDelete:
    """Tests for DELETE /cognition-engines/{ce_id}"""

    def test_delete_enabled_ce_returns_409(self, client, registered_cfn):
        """Deleting an enabled CE returns 409 — must disable first."""
        ce_id = _register(client, registered_cfn, "CASA")

        response = client.delete(f"/api/cognition-engines/{ce_id}")

        assert response.status_code == status.HTTP_409_CONFLICT
        assert "disabled" in response.json()["detail"].lower()

    def test_delete_returns_204_after_disable(self, client, registered_cfn):
        """Disabling then deleting returns 204 No Content."""
        ce_id = _register(client, registered_cfn, "CASA")
        client.patch(f"/api/cognition-engines/{ce_id}", json={"enabled": False})

        response = client.delete(f"/api/cognition-engines/{ce_id}")

        assert response.status_code == status.HTTP_204_NO_CONTENT

    def test_deleted_engine_not_accessible(self, client, registered_cfn):
        """Deleted engine returns 404 on get."""
        ce_id = _register(client, registered_cfn, "CASA")
        _delete(client, ce_id)

        assert client.get(f"/api/cognition-engines/{ce_id}").status_code == status.HTTP_404_NOT_FOUND

    def test_delete_nonexistent_engine(self, client):
        """Deleting an unknown ce_id returns 404."""
        response = client.delete("/api/cognition-engines/nonexistent-id")
        assert response.status_code == status.HTTP_404_NOT_FOUND
        assert "not found" in response.json()["detail"].lower()

    def test_deleted_engine_excluded_from_list(self, client, registered_cfn):
        """Deleted engines do not appear in list results."""
        _register(client, registered_cfn, "CASA")
        del_id = _register(client, registered_cfn, "DETECTIVE")
        _delete(client, del_id)

        data = client.get(f"/api/cognition-engines?cfn_id={registered_cfn}").json()
        assert data["total"] == 1
        assert data["cognition_engines"][0]["ce_type"] == "CASA"

    def test_deleted_engine_name_version_can_be_reregistered(self, client, registered_cfn):
        """After deletion the same (name, version) can be registered again (partial unique index)."""
        ce_id = _register(client, registered_cfn, "CASA", name="rereg-test-ce", version="1.0.0")
        _delete(client, ce_id)

        new = client.post(
            "/api/cognition-engines", json=_base_payload(registered_cfn, "CASA", name="rereg-test-ce", version="1.0.0")
        )
        assert new.status_code == status.HTTP_201_CREATED
        assert new.json()["ce_id"] != ce_id

    def test_delete_with_attached_mas_returns_409(self, client, registered_cfn, created_workspace):
        """Cannot delete a CE while it is associated with an active MAS.

        To reach this guard: disable the CE first (no MAS attached), then
        associate a MAS — now the CE is disabled but still has an active MAS.
        """
        ce_id = _register(client, registered_cfn, "CASA")
        # Disable first so we can bypass the "must disable" guard
        client.patch(f"/api/cognition-engines/{ce_id}", json={"enabled": False})
        # Associate a MAS after disabling
        mas_id = _create_mas(client, created_workspace, "delete-guard-mas")
        client.post(
            f"/api/workspaces/{created_workspace}/multi-agentic-systems/{mas_id}/cognition-engines",
            json={"ce_id": ce_id},
        )

        resp = client.delete(f"/api/cognition-engines/{ce_id}")

        assert resp.status_code == status.HTTP_409_CONFLICT
        assert "mas" in resp.json()["detail"].lower()

    def test_delete_ignores_soft_deleted_mas(self, client, registered_cfn, created_workspace):
        """Soft-deleted MAS associations do not block CE deletion."""
        ce_id = _register(client, registered_cfn, "CASA")
        # Disable first, then associate a MAS
        client.patch(f"/api/cognition-engines/{ce_id}", json={"enabled": False})
        mas_id = _create_mas(client, created_workspace, "delete-soft-mas")
        client.post(
            f"/api/workspaces/{created_workspace}/multi-agentic-systems/{mas_id}/cognition-engines",
            json={"ce_id": ce_id},
        )
        # Soft-delete the MAS — junction row remains but MAS is gone
        client.delete(f"/api/workspaces/{created_workspace}/multi-agentic-systems/{mas_id}")

        resp = client.delete(f"/api/cognition-engines/{ce_id}")

        assert resp.status_code == status.HTTP_204_NO_CONTENT


def _get_ce(ce_id: str) -> dict:
    """Read status, last_seen and created_at straight from the DB."""
    from server.database.relational_db.models.cognition_engine import CognitionEngine as CognitionEngineModel

    db = RelationalDB()
    session = db.get_session()
    try:
        engine = session.query(CognitionEngineModel).filter(CognitionEngineModel.id == ce_id).first()
        return {
            "status": engine.status,
            "last_seen": engine.last_seen,
            "created_at": engine.created_at,
            "registration_token": engine.registration_token,
        }
    finally:
        session.close()


def _set_ce(ce_id: str, **fields) -> None:
    from server.database.relational_db.models.cognition_engine import CognitionEngine as CognitionEngineModel

    db = RelationalDB()
    session = db.get_session()
    try:
        engine = session.query(CognitionEngineModel).filter(CognitionEngineModel.id == ce_id).first()
        for key, value in fields.items():
            setattr(engine, key, value)
        session.commit()
    finally:
        session.close()


def _config_version(client, cfn_id: str) -> int:
    return client.put(f"/api/cognition-fabric-nodes/{cfn_id}/heartbeat").json()["config_version"]


def _record_probe(ce_id, healthy, offline_threshold_seconds, now=None):
    """Submit a probe against the current generation; race tests capture their token explicitly."""
    targets = {target.ce_id: target.registration_token for target in cognition_engine_service.list_probe_targets()}
    return cognition_engine_service.record_probe_result(
        ce_id, healthy, offline_threshold_seconds, now, registration_token=targets.get(ce_id, "expired")
    )


class TestCognitionEngineHealthProbeResult:
    """Tests for CognitionEngineService.record_probe_result"""

    def test_no_heartbeat_endpoint(self, client, registered_cfn):
        """The CE heartbeat endpoint was replaced by CFN probing"""
        ce_id = _register(client, registered_cfn, "CASA")
        resp = client.put(f"/api/cognition-engines/{ce_id}/heartbeat")
        assert resp.status_code in (status.HTTP_404_NOT_FOUND, status.HTTP_405_METHOD_NOT_ALLOWED)

    def test_healthy_probe_flips_offline_to_online(self, client, registered_cfn):
        ce_id = _register(client, registered_cfn, "CASA")
        _force_offline(ce_id)

        changed = _record_probe(ce_id, True, 6)

        assert changed == "online"
        ce = _get_ce(ce_id)
        assert ce["status"] == "online"
        assert ce["last_seen"] is not None
        assert client.get(f"/api/cognition-engines/{ce_id}").json()["status"] == "online"

    def test_healthy_probe_updates_last_seen(self, client, registered_cfn):
        ce_id = _register(client, registered_cfn, "CASA")

        _record_probe(ce_id, True, 6)
        first = _get_ce(ce_id)["last_seen"]
        _record_probe(ce_id, True, 6)

        assert _get_ce(ce_id)["last_seen"] > first

    def test_healthy_probe_on_online_engine_reports_no_change(self, client, registered_cfn):
        ce_id = _register(client, registered_cfn, "CASA")

        assert _record_probe(ce_id, True, 6) is None
        assert _get_ce(ce_id)["status"] == "online"

    def test_offline_to_online_increments_config_version(self, client, registered_cfn, created_workspace):
        """A probe that brings a CE back online refreshes CFN's config snapshot."""
        ce_id = _register(client, registered_cfn, "CASA")
        _force_offline(ce_id)
        initial_version = _config_version(client, registered_cfn)

        _record_probe(ce_id, True, 6)

        assert _config_version(client, registered_cfn) > initial_version

    def test_already_online_does_not_increment_config_version(self, client, registered_cfn, created_workspace):
        ce_id = _register(client, registered_cfn, "CASA")
        stable_version = _config_version(client, registered_cfn)

        _record_probe(ce_id, True, 6)

        assert _config_version(client, registered_cfn) == stable_version

    def test_unhealthy_probe_within_threshold_keeps_online(self, client, registered_cfn):
        ce_id = _register(client, registered_cfn, "CASA")
        now = datetime.now(timezone.utc)
        _set_ce(ce_id, last_seen=now)

        assert _record_probe(ce_id, False, 6, now=now + timedelta(seconds=4)) is None
        assert _get_ce(ce_id)["status"] == "online"

    def test_unhealthy_probe_past_threshold_goes_offline(self, client, registered_cfn):
        ce_id = _register(client, registered_cfn, "CASA")
        now = datetime.now(timezone.utc)
        _set_ce(ce_id, last_seen=now)

        changed = _record_probe(ce_id, False, 6, now=now + timedelta(seconds=7))

        assert changed == "offline"
        assert _get_ce(ce_id)["status"] == "offline"

    def test_never_answered_engine_goes_offline_from_registration_time(self, client, registered_cfn):
        """A CE that registered but never answered a probe has no last_seen, so created_at is the baseline."""
        ce_id = _register(client, registered_cfn, "CASA")
        ce = _get_ce(ce_id)
        assert ce["last_seen"] is None

        early = ce["created_at"] + timedelta(seconds=3)
        assert _record_probe(ce_id, False, 6, now=early) is None
        assert _record_probe(ce_id, False, 6, now=ce["created_at"] + timedelta(seconds=7)) == "offline"

    def test_unhealthy_probe_on_offline_engine_reports_no_change(self, client, registered_cfn):
        ce_id = _register(client, registered_cfn, "CASA")
        _force_offline(ce_id)

        changed = _record_probe(ce_id, False, 6, now=datetime.now(timezone.utc) + timedelta(seconds=60))

        assert changed is None
        assert _get_ce(ce_id)["status"] == "offline"

    def test_unknown_engine_returns_none(self, client):
        assert _record_probe("nonexistent-ce", True, 6) is None

    def test_probe_result_for_engine_disabled_meanwhile_is_ignored(self, client, registered_cfn):
        """A probe in flight when the CE is disabled must not flip it back online (disabling set it offline)."""
        from server.services.cognition_fabric_node import cognition_fabric_node_service

        ce_id = _register(client, registered_cfn, "CASA")
        assert ce_id in {target.ce_id for target in cognition_engine_service.list_probe_targets()}
        registration_token = _get_ce(ce_id)["registration_token"]
        assert client.patch(f"/api/cognition-engines/{ce_id}", json={"enabled": False}).status_code == 200
        assert _get_ce(ce_id)["status"] == "offline"

        with patch.object(cognition_fabric_node_service, "update_config_for_cfn") as refresh:
            changed = cognition_engine_service.record_probe_result(
                ce_id, True, 6, registration_token=registration_token
            )

        assert changed is None
        assert _get_ce(ce_id)["status"] == "offline"
        assert _get_ce(ce_id)["last_seen"] is None
        refresh.assert_not_called()


class TestCognitionEngineMonitorProbe:
    """Tests for the monitor's probe loop (CFN call mocked)"""

    @staticmethod
    def _monitor(**kwargs) -> CognitionEngineMonitor:
        options = dict(probe_interval_seconds=1, probe_timeout_seconds=1, offline_threshold_seconds=0.001)
        options.update(kwargs)
        return CognitionEngineMonitor(**options)

    def test_probe_all_sets_status_from_results(self, client, registered_cfn):
        healthy_id = _register(client, registered_cfn, "CASA", health_url="http://healthy-ce:8080/healthz")
        broken_id = _register(client, registered_cfn, "CASA", health_url="http://broken-ce:8080/healthz")
        _force_offline(healthy_id)
        _set_ce(broken_id, last_seen=datetime.now(timezone.utc) - timedelta(seconds=60))

        with patch(
            "server.services.cognition_engine_monitor.probe_ce_health",
            side_effect=lambda ce_id, timeout: ce_id == healthy_id,
        ) as probe:
            asyncio.run(self._monitor().probe_all())

        assert probe.call_count == 2
        assert _get_ce(healthy_id)["status"] == "online"
        assert _get_ce(broken_id)["status"] == "offline"

    def test_probe_all_passes_ce_id_and_probe_timeout(self, client, registered_cfn):
        ce_id = _register(client, registered_cfn, "CASA")

        with patch("server.services.cognition_engine_monitor.probe_ce_health", return_value=True) as probe:
            asyncio.run(self._monitor().probe_all())

        probe.assert_called_once_with(ce_id, 1)

    def test_probe_all_skips_disabled_engines(self, client, registered_cfn):
        ce_id = _register(client, registered_cfn, "CASA")
        client.patch(f"/api/cognition-engines/{ce_id}", json={"enabled": False})

        with patch("server.services.cognition_engine_monitor.probe_ce_health", return_value=True) as probe:
            asyncio.run(self._monitor().probe_all())

        probe.assert_not_called()

    def test_probe_all_skips_deleted_engines(self, client, registered_cfn):
        ce_id = _register(client, registered_cfn, "CASA")
        _delete(client, ce_id)

        with patch("server.services.cognition_engine_monitor.probe_ce_health", return_value=True) as probe:
            asyncio.run(self._monitor().probe_all())

        probe.assert_not_called()

    def test_one_failing_engine_does_not_block_others(self, client, registered_cfn):
        bad_id = _register(client, registered_cfn, "CASA", health_url="http://bad-ce:8080/healthz")
        good_id = _register(client, registered_cfn, "CASA", health_url="http://good-ce:8080/healthz")
        _force_offline(good_id)

        def fake_probe(ce_id, timeout):
            if ce_id == bad_id:
                raise RuntimeError("boom")
            return True

        with patch("server.services.cognition_engine_monitor.probe_ce_health", side_effect=fake_probe):
            asyncio.run(self._monitor().probe_all())

        assert _get_ce(good_id)["status"] == "online"
        assert _get_ce(bad_id)["status"] == "online"  # error is logged, status untouched

    def test_never_answered_engine_goes_offline_after_the_threshold(self, client, registered_cfn):
        ce_id = _register(client, registered_cfn, "CASA")
        monitor = self._monitor(offline_threshold_seconds=0.2)

        with patch("server.services.cognition_engine_monitor.probe_ce_health", return_value=False):
            asyncio.run(monitor.probe_all())
            assert _get_ce(ce_id)["status"] == "online"
            time.sleep(0.3)
            asyncio.run(monitor.probe_all())

        assert _get_ce(ce_id)["status"] == "offline"

    def test_healthy_engine_comes_back_online_and_last_seen_is_updated(self, client, registered_cfn):
        ce_id = _register(client, registered_cfn, "CASA")
        _force_offline(ce_id)

        with patch("server.services.cognition_engine_monitor.probe_ce_health", return_value=True):
            asyncio.run(self._monitor().probe_all())

        ce = _get_ce(ce_id)
        assert ce["status"] == "online"
        assert ce["last_seen"] is not None

    def test_failed_listing_skips_the_tick(self, client, registered_cfn, caplog):
        ce_id = _register(client, registered_cfn, "CASA")
        _force_offline(ce_id)

        with patch.object(cognition_engine_service, "list_probe_targets", side_effect=RuntimeError("db down")):
            with patch("server.services.cognition_engine_monitor.probe_ce_health", return_value=True) as probe:
                with caplog.at_level("ERROR"):
                    asyncio.run(self._monitor().probe_all())

        probe.assert_not_called()
        assert "Failed to list Cognition Engines to probe" in caplog.text
        assert _get_ce(ce_id)["status"] == "offline"

    def test_list_probe_targets_raises_on_database_errors(self, client):
        with patch("server.services.cognition_engine.RelationalDB", side_effect=RuntimeError("db down")):
            with pytest.raises(RuntimeError):
                cognition_engine_service.list_probe_targets()

    def test_monitor_probes_until_stopped_and_survives_a_failed_listing(self, client, registered_cfn):
        ce_id = _register(client, registered_cfn, "CASA")
        _force_offline(ce_id)
        monitor = self._monitor(probe_interval_seconds=0.05, offline_threshold_seconds=6)
        real_list = cognition_engine_service.list_probe_targets
        calls = {"n": 0}

        def flaky_list():
            calls["n"] += 1
            if calls["n"] == 1:
                raise RuntimeError("db blip")
            return real_list()

        async def run_for_a_moment():
            task = asyncio.create_task(monitor.start())
            await asyncio.sleep(0.4)
            monitor.stop()
            await asyncio.wait_for(task, timeout=2)

        with patch.object(cognition_engine_service, "list_probe_targets", side_effect=flaky_list):
            with patch("server.services.cognition_engine_monitor.probe_ce_health", return_value=True):
                asyncio.run(run_for_a_moment())

        assert calls["n"] > 1
        assert _get_ce(ce_id)["status"] == "online"

    def test_settings_come_from_the_environment(self, monkeypatch):
        monkeypatch.setenv("CE_PROBE_INTERVAL_SECONDS", "3")
        monkeypatch.setenv("CE_PROBE_TIMEOUT_SECONDS", "0.5")
        monkeypatch.setenv("CE_OFFLINE_THRESHOLD_SECONDS", "20")

        monitor = CognitionEngineMonitor()

        assert (monitor.probe_interval, monitor.probe_timeout, monitor.offline_threshold) == (3, 0.5, 20)

    def test_defaults(self, monkeypatch):
        for name in ("CE_PROBE_INTERVAL_SECONDS", "CE_PROBE_TIMEOUT_SECONDS", "CE_OFFLINE_THRESHOLD_SECONDS"):
            monkeypatch.delenv(name, raising=False)

        monitor = CognitionEngineMonitor()

        assert (monitor.probe_interval, monitor.probe_timeout, monitor.offline_threshold) == (2, 1, 6)


_POST = "server.services.cfn_ce_probe.requests.post"


class TestCfnCeProbeClient:
    """probe_ce_health asks cfn-svc to probe a CE by ID: True only for a 200 with healthy true"""

    @staticmethod
    def _response(status_code=200, json_body=None, json_error=None):
        response = requests.Response()
        response.status_code = status_code
        if json_error is not None:
            response._content = b"not json"
        else:
            response._content = json.dumps(json_body).encode()
        return response

    def test_healthy_answer(self):
        with patch(_POST, return_value=self._response(json_body={"healthy": True})) as post:
            assert probe_ce_health("ce-1", 1) is True

        assert post.call_args.kwargs["json"] == {"ce_id": "ce-1"}
        assert post.call_args.args[0].endswith("/api/internal/mgmt/cognition-engine/probe")
        assert post.call_args.kwargs["timeout"] == 2

    def test_unhealthy_answer(self):
        with patch(_POST, return_value=self._response(json_body={"healthy": False})):
            assert probe_ce_health("ce-1", 1) is False

    @pytest.mark.parametrize("code", [404, 500, 502])
    def test_error_status_is_unhealthy(self, code):
        with patch(_POST, return_value=self._response(code, {"healthy": True})):
            assert probe_ce_health("ce-1", 1) is False

    @pytest.mark.parametrize("body", [{}, {"healthy": "yes"}, {"healthy": None}, [], "healthy", 5])
    def test_malformed_body_is_unhealthy(self, body):
        with patch(_POST, return_value=self._response(json_body=body)):
            assert probe_ce_health("ce-1", 1) is False

    def test_body_that_is_not_json_is_unhealthy(self):
        with patch(_POST, return_value=self._response(json_error=True)):
            assert probe_ce_health("ce-1", 1) is False

    @pytest.mark.parametrize("error", [requests.exceptions.ConnectionError, requests.exceptions.Timeout])
    def test_transport_error_is_unhealthy(self, error):
        with patch(_POST, side_effect=error("boom")):
            assert probe_ce_health("ce-1", 1) is False

    def test_cfn_svc_url_is_read_from_env(self, monkeypatch):
        monkeypatch.setenv("CFN_SVC_URL", "http://cfn-svc:9002")
        with patch(_POST, return_value=self._response(json_body={"healthy": True})) as post:
            probe_ce_health("ce-1", 1)

        assert post.call_args.args[0] == "http://cfn-svc:9002/api/internal/mgmt/cognition-engine/probe"


class TestCognitionEngineHealthUrl:
    """health_url is required at registration and mutable via PATCH"""

    def test_register_requires_health_url(self, client, registered_cfn):
        payload = _base_payload(registered_cfn, name="no-health-url")
        del payload["health_url"]

        resp = client.post("/api/cognition-engines", json=payload)

        assert resp.status_code == status.HTTP_422_UNPROCESSABLE_CONTENT

    @pytest.mark.parametrize("bad_url", ["", "healthz", "ftp://ce:8080/healthz", "http://", "http://ce 8080/healthz"])
    def test_register_rejects_invalid_health_url(self, client, registered_cfn, bad_url):
        payload = {**_base_payload(registered_cfn, name="bad-health-url"), "health_url": bad_url}

        resp = client.post("/api/cognition-engines", json=payload)

        assert resp.status_code == status.HTTP_422_UNPROCESSABLE_CONTENT

    def test_register_returns_health_url(self, client, registered_cfn):
        payload = {**_base_payload(registered_cfn, name="with-health-url"), "health_url": "https://ce:8443/healthz"}

        resp = client.post("/api/cognition-engines", json=payload)

        assert resp.status_code == status.HTTP_201_CREATED
        assert resp.json()["health_url"] == "https://ce:8443/healthz"

    def test_get_and_list_include_health_url(self, client, registered_cfn):
        ce_id = _register(client, registered_cfn, "CASA", health_url="http://ce:9000/live")

        assert client.get(f"/api/cognition-engines/{ce_id}").json()["health_url"] == "http://ce:9000/live"
        listed = client.get(f"/api/cognition-engines?cfn_id={registered_cfn}").json()["cognition_engines"]
        assert [e["health_url"] for e in listed if e["id"] == ce_id] == ["http://ce:9000/live"]

    def test_patch_updates_health_url(self, client, registered_cfn):
        ce_id = _register(client, registered_cfn, "CASA")

        resp = client.patch(f"/api/cognition-engines/{ce_id}", json={"health_url": "http://new-host:8080/healthz"})

        assert resp.status_code == status.HTTP_200_OK
        assert resp.json()["health_url"] == "http://new-host:8080/healthz"

    def test_patch_rejects_invalid_health_url(self, client, registered_cfn):
        ce_id = _register(client, registered_cfn, "CASA")

        resp = client.patch(f"/api/cognition-engines/{ce_id}", json={"health_url": "not-a-url"})

        assert resp.status_code == status.HTTP_422_UNPROCESSABLE_CONTENT


class TestCognitionEngineEndpointProtocol:
    """Each purpose (enforcing, health, notification) has a url, an endpoint and a protocol."""

    def test_protocol_defaults_on_register_and_read(self, client, registered_cfn):
        payload = _base_payload(registered_cfn, name="protocol-defaults-ce")
        resp = client.post("/api/cognition-engines", json=payload)
        assert resp.status_code == status.HTTP_201_CREATED
        body = resp.json()
        assert body["enforcing_protocol"] == "grpc"
        assert body["health_protocol"] == "http"
        assert body["notification_protocol"] == "http"
        assert body["health_endpoint"] == "/healthz"

        detail = client.get(f"/api/cognition-engines/{body['ce_id']}").json()
        assert detail["enforcing_protocol"] == "grpc"
        assert detail["health_protocol"] == "http"
        assert detail["notification_protocol"] == "http"

        listed = next(
            ce
            for ce in client.get(f"/api/cognition-engines?cfn_id={registered_cfn}").json()["cognition_engines"]
            if ce["id"] == body["ce_id"]
        )
        assert listed["health_url"] == payload["health_url"]
        assert listed["enforcing_protocol"] == "grpc"

    def test_list_includes_notification_fields(self, client, registered_cfn):
        payload = {
            **_base_payload(registered_cfn, name="list-notification-ce"),
            "notification_url": "http://ce.internal:8080",
            "notification_endpoint": "/notification/mas-lifecycle",
        }
        ce_id = client.post("/api/cognition-engines", json=payload).json()["ce_id"]

        listed = next(
            ce
            for ce in client.get(f"/api/cognition-engines?cfn_id={registered_cfn}").json()["cognition_engines"]
            if ce["id"] == ce_id
        )
        assert listed["notification_url"] == "http://ce.internal:8080"
        assert listed["notification_endpoint"] == "/notification/mas-lifecycle"

    @pytest.mark.parametrize("missing", ["enforcing_endpoint", "enforcing_url"])
    def test_register_requires_enforcing_url_and_endpoint_together(self, client, registered_cfn, missing):
        payload = _base_payload(registered_cfn, name=f"half-enforcing-{missing}")
        del payload[missing]
        resp = client.post("/api/cognition-engines", json=payload)
        assert resp.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY
        assert "enforcing_url and enforcing_endpoint must be set together" in resp.text

    def test_register_without_enforcing_succeeds(self, client, registered_cfn):
        payload = _base_payload(registered_cfn, name="no-enforcing-ce")
        del payload["enforcing_url"], payload["enforcing_endpoint"]
        resp = client.post("/api/cognition-engines", json=payload)
        assert resp.status_code == status.HTTP_201_CREATED
        body = client.get(f"/api/cognition-engines/{resp.json()['ce_id']}").json()
        assert body["enforcing_url"] is None
        assert body["enforcing_endpoint"] is None

    def test_patch_clears_enforcing_url_and_endpoint_together(self, client, registered_cfn):
        ce_id = _register(client, registered_cfn)
        resp = client.patch(f"/api/cognition-engines/{ce_id}", json={"enforcing_url": None, "enforcing_endpoint": None})
        assert resp.status_code == status.HTTP_200_OK
        assert resp.json()["enforcing_url"] is None
        assert resp.json()["enforcing_endpoint"] is None

    @pytest.mark.parametrize(
        "field,value",
        [
            ("enforcing_protocol", "http"),
            ("health_protocol", "grpc"),
            ("notification_protocol", "grpc"),
        ],
    )
    def test_register_rejects_unsupported_protocol(self, client, registered_cfn, field, value):
        payload = {**_base_payload(registered_cfn, name=f"bad-{field}-ce"), field: value}
        resp = client.post("/api/cognition-engines", json=payload)
        assert resp.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY

    def test_register_stores_health_endpoint(self, client, registered_cfn):
        payload = {**_base_payload(registered_cfn, name="health-endpoint-ce"), "health_endpoint": "/healthz"}
        ce_id = client.post("/api/cognition-engines", json=payload).json()["ce_id"]
        assert client.get(f"/api/cognition-engines/{ce_id}").json()["health_endpoint"] == "/healthz"

    def test_patch_updates_endpoints(self, client, registered_cfn):
        ce_id = _register(client, registered_cfn)
        resp = client.patch(
            f"/api/cognition-engines/{ce_id}",
            json={"enforcing_endpoint": "ioc.ce.v2.CognitionEngine", "health_endpoint": "/ready"},
        )
        assert resp.status_code == status.HTTP_200_OK
        assert resp.json()["enforcing_endpoint"] == "ioc.ce.v2.CognitionEngine"
        assert resp.json()["health_endpoint"] == "/ready"

    @pytest.mark.parametrize(
        "extra",
        [
            {"notification_url": "http://ce.internal:8080"},
            {"notification_endpoint": "/notifications"},
        ],
    )
    def test_register_requires_notification_url_and_endpoint_together(self, client, registered_cfn, extra):
        payload = {**_base_payload(registered_cfn, name="half-notification-ce"), **extra}
        resp = client.post("/api/cognition-engines", json=payload)
        assert resp.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY
        assert "must be set together" in resp.text

    def test_register_requires_health_endpoint(self, client, registered_cfn):
        payload = _base_payload(registered_cfn, name="no-health-endpoint-ce")
        del payload["health_endpoint"]
        resp = client.post("/api/cognition-engines", json=payload)
        assert resp.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY

    @pytest.mark.parametrize("field", ["health_endpoint", "notification_endpoint"])
    def test_register_rejects_endpoint_without_leading_slash(self, client, registered_cfn, field):
        payload = {
            **_base_payload(registered_cfn, name=f"no-slash-{field}"),
            "notification_url": "http://ce.internal:8080",
            "notification_endpoint": "/notifications",
            field: "no-slash",
        }
        resp = client.post("/api/cognition-engines", json=payload)
        assert resp.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY
        assert f"{field} must start with '/'" in resp.text

    def test_patch_sets_notification_url_and_endpoint_together(self, client, registered_cfn):
        ce_id = _register(client, registered_cfn)
        resp = client.patch(
            f"/api/cognition-engines/{ce_id}",
            json={"notification_url": "http://ce.internal:8080", "notification_endpoint": "/notifications"},
        )
        assert resp.status_code == status.HTTP_200_OK
        assert resp.json()["notification_endpoint"] == "/notifications"

    def test_patch_rejects_half_notification(self, client, registered_cfn):
        ce_id = _register(client, registered_cfn)
        resp = client.patch(f"/api/cognition-engines/{ce_id}", json={"notification_url": "http://ce.internal:8080"})
        assert resp.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY
        assert "must be set together" in resp.text
        # The rejected patch must not have been saved
        assert client.get(f"/api/cognition-engines/{ce_id}").json()["notification_url"] is None

    def test_patch_null_clears_notification(self, client, registered_cfn):
        ce_id = _register(
            client,
            registered_cfn,
            notification_url="http://ce.internal:8080",
            notification_endpoint="/notifications",
        )
        resp = client.patch(
            f"/api/cognition-engines/{ce_id}", json={"notification_url": None, "notification_endpoint": None}
        )
        assert resp.status_code == status.HTTP_200_OK
        assert resp.json()["notification_url"] is None
        assert resp.json()["notification_endpoint"] is None

    def test_patch_clearing_only_one_notification_field_is_rejected(self, client, registered_cfn):
        ce_id = _register(
            client,
            registered_cfn,
            notification_url="http://ce.internal:8080",
            notification_endpoint="/notifications",
        )
        resp = client.patch(f"/api/cognition-engines/{ce_id}", json={"notification_endpoint": None})
        assert resp.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY

    def test_patch_clearing_only_enforcing_url_is_rejected(self, client, registered_cfn):
        ce_id = _register(client, registered_cfn)
        resp = client.patch(f"/api/cognition-engines/{ce_id}", json={"enforcing_url": None})
        assert resp.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY

    def test_patch_null_on_required_field_is_ignored(self, client, registered_cfn):
        ce_id = _register(client, registered_cfn)
        original_health_url = client.get(f"/api/cognition-engines/{ce_id}").json()["health_url"]
        resp = client.patch(f"/api/cognition-engines/{ce_id}", json={"health_url": None, "enabled": True})
        assert resp.status_code == status.HTTP_200_OK
        assert resp.json()["health_url"] == original_health_url

    def test_patch_rejects_endpoint_without_leading_slash(self, client, registered_cfn):
        ce_id = _register(client, registered_cfn)
        resp = client.patch(f"/api/cognition-engines/{ce_id}", json={"health_endpoint": "healthz"})
        assert resp.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY
        assert "health_endpoint must start with '/'" in resp.text

    def test_patch_rejects_unsupported_protocol(self, client, registered_cfn):
        ce_id = _register(client, registered_cfn)
        resp = client.patch(f"/api/cognition-engines/{ce_id}", json={"enforcing_protocol": "http"})
        assert resp.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY


class TestCognitionEngineEnabled:
    """enabled is a lifecycle field set by the service — not the caller."""

    def test_new_ce_is_enabled_on_registration(self, client, registered_cfn):
        """A freshly registered CE always has enabled=true."""
        ce_id = _register(client, registered_cfn, "CASA")

        detail = client.get(f"/api/cognition-engines/{ce_id}").json()
        assert detail["enabled"] is True

    def test_enabled_present_in_registration_response(self, client, registered_cfn):
        """Registration response includes enabled=true."""
        resp = client.post(
            "/api/cognition-engines", json=_base_payload(registered_cfn, "CASA", name="enabled-resp-test")
        )
        assert resp.status_code == status.HTTP_201_CREATED
        assert resp.json()["enabled"] is True

    def test_enabled_present_in_list_response(self, client, registered_cfn):
        """List items include enabled field."""
        _register(client, registered_cfn, "CASA")
        item = client.get(f"/api/cognition-engines?cfn_id={registered_cfn}").json()["cognition_engines"][0]
        assert "enabled" in item
        assert item["enabled"] is True

    def test_caller_cannot_set_enabled_via_registration(self, client, registered_cfn):
        """enabled is ignored even if the caller tries to pass it in the registration payload."""
        payload = {**_base_payload(registered_cfn, "CASA", name="enabled-ignore-test"), "enabled": False}
        resp = client.post("/api/cognition-engines", json=payload)
        assert resp.status_code == status.HTTP_201_CREATED

        detail = client.get(f"/api/cognition-engines/{resp.json()['ce_id']}").json()
        assert detail["enabled"] is True


class TestCognitionEngineAutoAttach:
    """mas_auto_associate is caller-provided at registration — defaults to false."""

    def test_mas_auto_associate_defaults_to_false(self, client, registered_cfn):
        """CE registered without mas_auto_associate has mas_auto_associate=false."""
        ce_id = _register(client, registered_cfn, "CASA")
        detail = client.get(f"/api/cognition-engines/{ce_id}").json()
        assert detail["mas_auto_associate"] is False

    def test_mas_auto_associate_can_be_set_true_on_registration(self, client, registered_cfn):
        """CE registered with mas_auto_associate=true reflects that value."""
        resp = client.post(
            "/api/cognition-engines",
            json={**_base_payload(registered_cfn, "CASA", name="auto-assoc-set-test"), "mas_auto_associate": True},
        )
        assert resp.status_code == status.HTTP_201_CREATED
        assert resp.json()["mas_auto_associate"] is True

        detail = client.get(f"/api/cognition-engines/{resp.json()['ce_id']}").json()
        assert detail["mas_auto_associate"] is True

    def test_mas_auto_associate_present_in_list_response(self, client, registered_cfn):
        """List items include mas_auto_associate field."""
        _register(client, registered_cfn, "CASA")
        item = client.get(f"/api/cognition-engines?cfn_id={registered_cfn}").json()["cognition_engines"][0]
        assert "mas_auto_associate" in item

    def test_mas_auto_associate_can_be_updated_via_patch(self, client, registered_cfn):
        """mas_auto_associate can be updated via PATCH."""
        ce_id = _register(client, registered_cfn, "CASA", name="patch-auto-assoc-ce")

        resp = client.patch(f"/api/cognition-engines/{ce_id}", json={"mas_auto_associate": True})
        assert resp.status_code == status.HTTP_200_OK
        assert resp.json()["mas_auto_associate"] is True


class TestCognitionEnginePatch:
    """Tests for PATCH /cognition-engines/{ce_id}"""

    def test_patch_enabled_false(self, client, registered_cfn):
        """PATCH can disable a CE (enabled=false)."""
        ce_id = _register(client, registered_cfn, "CASA")

        resp = client.patch(f"/api/cognition-engines/{ce_id}", json={"enabled": False})

        assert resp.status_code == status.HTTP_200_OK
        assert resp.json()["enabled"] is False

    def test_patch_enabled_true(self, client, registered_cfn):
        """PATCH can re-enable a disabled CE."""
        ce_id = _register(client, registered_cfn, "CASA")
        client.patch(f"/api/cognition-engines/{ce_id}", json={"enabled": False})

        resp = client.patch(f"/api/cognition-engines/{ce_id}", json={"enabled": True})

        assert resp.status_code == status.HTTP_200_OK
        assert resp.json()["enabled"] is True

    @staticmethod
    def _cfn_config_engine(client, cfn_id: str, ce_id: str) -> dict:
        """The CE entry in the stored CFN config blob, which is what cfn-svc refreshes from."""
        config = client.get(f"/api/cognition-fabric-nodes/{cfn_id}").json()["config"]
        return next(e for e in config["cognition_engines"] if e["id"] == ce_id)

    def test_patch_health_url_refreshes_the_cfn_config(self, client, registered_cfn):
        ce_id = _register(client, registered_cfn, "CASA", health_url="http://ce.internal:8080/healthz")
        initial_version = _config_version(client, registered_cfn)
        assert self._cfn_config_engine(client, registered_cfn, ce_id)["health_url"] == (
            "http://ce.internal:8080/healthz"
        )

        resp = client.patch(f"/api/cognition-engines/{ce_id}", json={"health_url": "http://new-host:9090/live"})

        assert resp.status_code == status.HTTP_200_OK
        assert self._cfn_config_engine(client, registered_cfn, ce_id)["health_url"] == "http://new-host:9090/live"
        assert _config_version(client, registered_cfn) > initial_version

    @pytest.mark.parametrize(
        "field,value",
        [
            ("enforcing_url", "http://elsewhere:8080"),
            ("enforcing_endpoint", "/api/other"),
            ("health_url", "http://elsewhere:8080/healthz"),
            ("enabled", False),
        ],
    )
    def test_patch_of_cfn_visible_field_bumps_config_version(self, client, registered_cfn, field, value):
        ce_id = _register(client, registered_cfn, "CASA")
        before = _config_version(client, registered_cfn)

        client.patch(f"/api/cognition-engines/{ce_id}", json={field: value})

        assert _config_version(client, registered_cfn) == before + 1

    def test_patch_with_unchanged_values_does_not_bump_config_version(self, client, registered_cfn):
        ce_id = _register(client, registered_cfn, "CASA")
        original = client.get(f"/api/cognition-engines/{ce_id}").json()
        before = _config_version(client, registered_cfn)

        client.patch(
            f"/api/cognition-engines/{ce_id}",
            json={"enforcing_url": original["enforcing_url"], "health_url": original["health_url"]},
        )

        assert _config_version(client, registered_cfn) == before

    def test_patch_mas_auto_associate_alone_does_not_bump_config_version(self, client, registered_cfn):
        ce_id = _register(client, registered_cfn, "CASA")
        before = _config_version(client, registered_cfn)

        client.patch(f"/api/cognition-engines/{ce_id}", json={"mas_auto_associate": True})

        assert _config_version(client, registered_cfn) == before

    def test_disabling_a_ce_marks_it_offline(self, client, registered_cfn):
        ce_id = _register(client, registered_cfn, "CASA")
        assert _get_ce(ce_id)["status"] == "online"

        resp = client.patch(f"/api/cognition-engines/{ce_id}", json={"enabled": False})

        assert resp.status_code == status.HTTP_200_OK
        assert resp.json()["status"] == "offline"
        assert _get_ce(ce_id)["status"] == "offline"
        assert self._cfn_config_engine(client, registered_cfn, ce_id)["status"] == "offline"

    def test_re_enabling_a_ce_leaves_status_for_the_probe_loop(self, client, registered_cfn):
        ce_id = _register(client, registered_cfn, "CASA")
        client.patch(f"/api/cognition-engines/{ce_id}", json={"enabled": False})

        resp = client.patch(f"/api/cognition-engines/{ce_id}", json={"enabled": True})

        assert resp.json()["status"] == "offline"
        with patch("server.services.cognition_engine_monitor.probe_ce_health", return_value=True):
            asyncio.run(CognitionEngineMonitor(probe_interval_seconds=1).probe_all())
        assert _get_ce(ce_id)["status"] == "online"

    def test_disabling_an_already_offline_ce_keeps_it_offline(self, client, registered_cfn):
        ce_id = _register(client, registered_cfn, "CASA")
        _force_offline(ce_id)

        resp = client.patch(f"/api/cognition-engines/{ce_id}", json={"enabled": False})

        assert resp.json()["status"] == "offline"

    def test_patch_mutable_fields(self, client, registered_cfn):
        """PATCH updates mutable fields and returns updated detail."""
        ce_id = _register(client, registered_cfn, "CASA")

        resp = client.patch(
            f"/api/cognition-engines/{ce_id}",
            json={
                "enforcing_url": "http://new-url:9090",
                "enforcing_endpoint": "/api/v2/enforcement",
            },
        )

        assert resp.status_code == status.HTTP_200_OK
        data = resp.json()
        assert data["enforcing_url"] == "http://new-url:9090"
        assert data["enforcing_endpoint"] == "/api/v2/enforcement"

    def test_patch_only_provided_fields_updated(self, client, registered_cfn):
        """Unprovided fields are not changed."""
        ce_id = _register(client, registered_cfn, "CASA", mas_config={"key": "original"})

        client.patch(f"/api/cognition-engines/{ce_id}", json={"enabled": False})

        detail = client.get(f"/api/cognition-engines/{ce_id}").json()
        assert detail["mas_config"] == {"key": "original"}
        assert detail["enabled"] is False

    def test_patch_immutable_field_returns_400(self, client, registered_cfn):
        """Attempting to update an immutable field returns 400."""
        ce_id = _register(client, registered_cfn, "CASA")

        for field, value in [
            ("ce_type", "DETECTIVE"),
            ("cfn_id", "other-cfn"),
            ("name", "new-name"),
            ("version", "2.0.0"),
        ]:
            resp = client.patch(f"/api/cognition-engines/{ce_id}", json={field: value})
            assert resp.status_code == status.HTTP_400_BAD_REQUEST, f"Expected 400 for field '{field}'"
            assert field in resp.json()["detail"]

    def test_patch_nonexistent_ce_returns_404(self, client):
        """PATCH on unknown ce_id returns 404."""
        resp = client.patch("/api/cognition-engines/nonexistent-id", json={"enabled": False})
        assert resp.status_code == status.HTTP_404_NOT_FOUND

    def test_patch_enforcing_url(self, client, registered_cfn):
        """PATCH can update the CE enforcing_url."""
        ce_id = _register(client, registered_cfn, "CASA")

        resp = client.patch(f"/api/cognition-engines/{ce_id}", json={"enforcing_url": "http://new-url:9090"})
        assert resp.status_code == status.HTTP_200_OK
        assert resp.json()["enforcing_url"] == "http://new-url:9090"

    def test_patch_endpoint(self, client, registered_cfn):
        """PATCH can update the CE endpoint."""
        ce_id = _register(client, registered_cfn, "CASA")

        resp = client.patch(f"/api/cognition-engines/{ce_id}", json={"enforcing_endpoint": "/api/v2/enforcement"})
        assert resp.status_code == status.HTTP_200_OK
        assert resp.json()["enforcing_endpoint"] == "/api/v2/enforcement"

    def test_patch_notification_url(self, client, registered_cfn):
        """PATCH can update the CE notification_url."""
        ce_id = _register(
            client, registered_cfn, "CASA", notification_url="http://old-notification:9999", notification_endpoint="/n"
        )

        resp = client.patch(
            f"/api/cognition-engines/{ce_id}", json={"notification_url": "http://new-notification:9999"}
        )
        assert resp.status_code == status.HTTP_200_OK
        assert resp.json()["notification_url"] == "http://new-notification:9999"

    def test_patch_notification_endpoint(self, client, registered_cfn):
        """PATCH can update the CE notification_endpoint."""
        ce_id = _register(
            client, registered_cfn, "CASA", notification_url="http://ce.internal:8080", notification_endpoint="/n"
        )

        resp = client.patch(
            f"/api/cognition-engines/{ce_id}", json={"notification_endpoint": "/notification/v2/mas-events"}
        )
        assert resp.status_code == status.HTTP_200_OK
        assert resp.json()["notification_endpoint"] == "/notification/v2/mas-events"

    def test_patch_both_notification_fields(self, client, registered_cfn):
        """PATCH can update both notification fields together."""
        ce_id = _register(client, registered_cfn, "CASA")

        resp = client.patch(
            f"/api/cognition-engines/{ce_id}",
            json={"notification_url": "http://updated-ce:8080", "notification_endpoint": "/notifications/mas"},
        )
        assert resp.status_code == status.HTTP_200_OK
        assert resp.json()["notification_url"] == "http://updated-ce:8080"
        assert resp.json()["notification_endpoint"] == "/notifications/mas"

    def test_patch_empty_body_is_no_op(self, client, registered_cfn):
        """Empty PATCH body leaves the CE unchanged."""
        ce_id = _register(client, registered_cfn, "CASA")
        before = client.get(f"/api/cognition-engines/{ce_id}").json()

        resp = client.patch(f"/api/cognition-engines/{ce_id}", json={})
        assert resp.status_code == status.HTTP_200_OK

        after = client.get(f"/api/cognition-engines/{ce_id}").json()
        assert before["enabled"] == after["enabled"]
        assert before["mas_config"] == after["mas_config"]

    def test_patch_disable_with_attached_mas_succeeds(self, client, registered_cfn, created_workspace):
        """Disabling a CE with attached MAS succeeds — enabled is a pure state toggle, not a precondition."""
        ce_id = _register(client, registered_cfn, "CASA")
        mas_id = _create_mas(client, created_workspace, "attached-mas")
        client.post(
            f"/api/workspaces/{created_workspace}/multi-agentic-systems/{mas_id}/cognition-engines",
            json={"ce_id": ce_id},
        )

        resp = client.patch(f"/api/cognition-engines/{ce_id}", json={"enabled": False})

        assert resp.status_code == status.HTTP_200_OK
        assert resp.json()["enabled"] is False

    def test_patch_disable_preserves_mas_association(self, client, registered_cfn, created_workspace):
        """Disabling a CE does not remove its existing MAS associations."""
        ce_id = _register(client, registered_cfn, "CASA")
        mas_id = _create_mas(client, created_workspace, "disable-preserve-mas")
        client.post(
            f"/api/workspaces/{created_workspace}/multi-agentic-systems/{mas_id}/cognition-engines",
            json={"ce_id": ce_id},
        )

        client.patch(f"/api/cognition-engines/{ce_id}", json={"enabled": False})

        detail = client.get(f"/api/workspaces/{created_workspace}/multi-agentic-systems/{mas_id}").json()
        ce_ids = [ce["ce_id"] for ce in detail["cognition_engines"]]
        assert ce_id in ce_ids

    def test_patch_disable_then_enable_restores_mas_association_without_reassociation(
        self, client, registered_cfn, created_workspace
    ):
        """Re-enabling a CE after a disable cycle keeps serving the same MAS without needing manual re-association."""
        ce_id = _register(client, registered_cfn, "CASA")
        mas_id = _create_mas(client, created_workspace, "disable-enable-mas")
        client.post(
            f"/api/workspaces/{created_workspace}/multi-agentic-systems/{mas_id}/cognition-engines",
            json={"ce_id": ce_id},
        )

        client.patch(f"/api/cognition-engines/{ce_id}", json={"enabled": False})
        resp = client.patch(f"/api/cognition-engines/{ce_id}", json={"enabled": True})

        assert resp.status_code == status.HTTP_200_OK
        assert resp.json()["enabled"] is True

        detail = client.get(f"/api/workspaces/{created_workspace}/multi-agentic-systems/{mas_id}").json()
        ce_ids = [ce["ce_id"] for ce in detail["cognition_engines"]]
        assert ce_id in ce_ids

    def test_patch_ce_mas_config_field_not_accepted(self, client, registered_cfn):
        """CE PATCH does not accept mas_config — it is silently ignored and factory default is unchanged."""
        factory_default = {"schedule": "0 0 * * *"}
        ce_id = _register(client, registered_cfn, "CASA", mas_config=factory_default)

        resp = client.patch(
            f"/api/cognition-engines/{ce_id}",
            json={"mas_config": {"schedule": "0 12 * * *", "top_k": 99}},
        )

        # The request is not rejected — mas_config is simply not in CognitionEnginePatchRequest
        assert resp.status_code == status.HTTP_200_OK
        # Factory default must be unchanged
        assert resp.json()["mas_config"] == factory_default


class TestCognitionEngineMasConfigPerMas:
    """mas_config factory defaults are copied to junction on association and can be overridden per MAS."""

    def test_association_copies_ce_mas_config_to_junction(self, client, registered_cfn, created_workspace):
        """On association, CE's mas_config is copied into the junction for the MAS."""
        ce_id = _register(
            client,
            registered_cfn,
            "CASA",
            mas_config={"schedule": "0 0 * * *"},
        )
        mas_id = _create_mas(client, created_workspace, "mas-config-copy-mas")

        resp = client.post(
            f"/api/workspaces/{created_workspace}/multi-agentic-systems/{mas_id}/cognition-engines",
            json={"ce_id": ce_id},
        )
        assert resp.status_code == status.HTTP_201_CREATED

    def test_mas_update_overrides_per_mas_ce_config(self, client, registered_cfn, created_workspace):
        """PUT MAS with cognition_engine_configs overrides the mas_config for that CE on this MAS only."""
        ce_id = _register(
            client,
            registered_cfn,
            "CASA",
            mas_config={"schedule": "0 0 * * *"},
        )
        mas_id = _create_mas(client, created_workspace, "mas-config-override-mas")
        client.post(
            f"/api/workspaces/{created_workspace}/multi-agentic-systems/{mas_id}/cognition-engines",
            json={"ce_id": ce_id},
        )

        resp = client.put(
            f"/api/workspaces/{created_workspace}/multi-agentic-systems/{mas_id}",
            json={"cognition_engine_configs": {ce_id: {"schedule": "0 */12 * * *"}}},
        )
        assert resp.status_code == status.HTTP_200_OK

    def test_mas_update_ignores_config_for_unattached_ce(self, client, registered_cfn, created_workspace):
        """Providing a ce_id in cognition_engine_configs that is not attached is silently ignored."""
        mas_id = _create_mas(client, created_workspace, "mas-config-unattached")

        resp = client.put(
            f"/api/workspaces/{created_workspace}/multi-agentic-systems/{mas_id}",
            json={"cognition_engine_configs": {"nonexistent-ce": {"schedule": "0 0 * * *"}}},
        )
        assert resp.status_code == status.HTTP_200_OK

    def test_association_seeds_factory_default_into_junction(self, client, registered_cfn, created_workspace):
        """On association, the CE factory mas_config is seeded into the junction row."""
        from server.database.relational_db.models.mas_cognition_engine import MasCognitionEngine

        factory_default = {"schedule": "0 0 * * *"}
        ce_id = _register(
            client,
            registered_cfn,
            "CASA",
            mas_config=factory_default,
        )
        mas_id = _create_mas(client, created_workspace, "seed-junction-mas")
        client.post(
            f"/api/workspaces/{created_workspace}/multi-agentic-systems/{mas_id}/cognition-engines",
            json={"ce_id": ce_id},
        )

        db = RelationalDB()
        session = db.get_session()
        try:
            row = (
                session.query(MasCognitionEngine)
                .filter(MasCognitionEngine.mas_id == mas_id, MasCognitionEngine.ce_id == ce_id)
                .first()
            )
            assert row is not None
            assert row.mas_config == factory_default
        finally:
            session.close()


def _mas_ce_ids(client, workspace_id: str, mas_id: str) -> list:
    detail = client.get(f"/api/workspaces/{workspace_id}/multi-agentic-systems/{mas_id}").json()
    return [ce["ce_id"] for ce in (detail.get("cognition_engines") or [])]


def _disable_cfn(client, cfn_id: str) -> None:
    resp = client.patch(f"/api/cognition-fabric-nodes/{cfn_id}/disable")
    assert resp.status_code == status.HTTP_200_OK


def _create_mas(client, workspace_id: str, name: str = "test-mas") -> str:
    resp = client.post(
        f"/api/workspaces/{workspace_id}/multi-agentic-systems",
        json={"name": name},
    )
    assert resp.status_code == status.HTTP_201_CREATED
    return resp.json()["id"]


class TestCognitionEngineCfnValidation:
    """All non-register ops must reject requests when the CE's CFN is inactive."""

    def test_get_rejects_inactive_cfn(self, client, registered_cfn):
        ce_id = _register(client, registered_cfn, "CASA")
        _disable_cfn(client, registered_cfn)

        resp = client.get(f"/api/cognition-engines/{ce_id}")
        assert resp.status_code == status.HTTP_404_NOT_FOUND
        assert "inactive" in resp.json()["detail"].lower()

    def test_list_rejects_inactive_cfn(self, client, registered_cfn):
        _disable_cfn(client, registered_cfn)

        resp = client.get(f"/api/cognition-engines?cfn_id={registered_cfn}")
        assert resp.status_code == status.HTTP_404_NOT_FOUND

    def test_list_without_cfn_id_unaffected(self, client, registered_cfn):
        """LIST with no cfn_id filter bypasses CFN validation."""
        _register(client, registered_cfn, "CASA")
        _disable_cfn(client, registered_cfn)

        resp = client.get("/api/cognition-engines")
        assert resp.status_code == status.HTTP_200_OK

    def test_patch_rejects_inactive_cfn(self, client, registered_cfn):
        ce_id = _register(client, registered_cfn, "CASA")
        _disable_cfn(client, registered_cfn)

        resp = client.patch(f"/api/cognition-engines/{ce_id}", json={"enabled": False})
        assert resp.status_code == status.HTTP_404_NOT_FOUND

    def test_delete_rejects_inactive_cfn(self, client, registered_cfn):
        ce_id = _register(client, registered_cfn, "CASA")
        _disable_cfn(client, registered_cfn)

        resp = client.delete(f"/api/cognition-engines/{ce_id}")
        assert resp.status_code == status.HTTP_404_NOT_FOUND

    def test_registration_allowed_even_with_inactive_cfn(self, client, registered_cfn):
        """Registration does not check CFN active status — it only checks existence."""
        _disable_cfn(client, registered_cfn)

        resp = client.post(
            "/api/cognition-engines", json=_base_payload(registered_cfn, "DETECTIVE", name="inactive-cfn-test")
        )
        assert resp.status_code == status.HTTP_201_CREATED


class TestCognitionEngineMasAssociation:
    """Tests for POST /workspaces/{ws}/multi-agentic-systems/{mas}/cognition-engines
    and DELETE /workspaces/{ws}/multi-agentic-systems/{mas}/cognition-engines/{ce}"""

    def test_associate_returns_201(self, client, registered_cfn, created_workspace):
        """Associating a CE with a MAS on the same CFN returns 201."""
        ce_id = _register(client, registered_cfn, "CASA")
        mas_id = _create_mas(client, created_workspace, "assoc-mas")

        resp = client.post(
            f"/api/workspaces/{created_workspace}/multi-agentic-systems/{mas_id}/cognition-engines",
            json={"ce_id": ce_id},
        )

        assert resp.status_code == status.HTTP_201_CREATED
        data = resp.json()
        assert data["ce_id"] == ce_id
        assert data["mas_id"] == mas_id
        assert "created_at" in data

    def test_associate_duplicate_returns_409(self, client, registered_cfn, created_workspace):
        """Associating the same CE-MAS pair twice returns 409."""
        ce_id = _register(client, registered_cfn, "CASA")
        mas_id = _create_mas(client, created_workspace, "assoc-dup-mas")

        client.post(
            f"/api/workspaces/{created_workspace}/multi-agentic-systems/{mas_id}/cognition-engines",
            json={"ce_id": ce_id},
        )
        resp = client.post(
            f"/api/workspaces/{created_workspace}/multi-agentic-systems/{mas_id}/cognition-engines",
            json={"ce_id": ce_id},
        )

        assert resp.status_code == status.HTTP_409_CONFLICT

    def test_associate_wrong_cfn_returns_422(self, client, registered_cfn, created_workspace):
        """Associating a CE with a MAS on a different CFN returns 422."""
        ce_id = _register(client, registered_cfn, "CASA")

        # Create a second CFN and workspace not linked to registered_cfn
        other_cfn_id = client.post(
            "/api/cognition-fabric-nodes/register",
            json={"name": "Other CFN", "cfn_config": {}},
        ).json()["id"]
        other_ws_id = client.post(
            "/api/workspaces/create",
            json={"name": "Other Workspace", "cfn_id": other_cfn_id},
        ).json()["id"]
        other_mas_id = _create_mas(client, other_ws_id, "other-mas")

        resp = client.post(
            f"/api/workspaces/{other_ws_id}/multi-agentic-systems/{other_mas_id}/cognition-engines",
            json={"ce_id": ce_id},
        )

        assert resp.status_code == status.HTTP_422_UNPROCESSABLE_CONTENT
        assert "cfn" in resp.json()["detail"].lower()

    def test_associate_nonexistent_ce_returns_404(self, client, registered_cfn, created_workspace):
        """Associating a non-existent CE returns 404."""
        mas_id = _create_mas(client, created_workspace, "assoc-404-mas")

        resp = client.post(
            f"/api/workspaces/{created_workspace}/multi-agentic-systems/{mas_id}/cognition-engines",
            json={"ce_id": "nonexistent-ce"},
        )

        assert resp.status_code == status.HTTP_404_NOT_FOUND

    def test_associate_nonexistent_mas_returns_404(self, client, registered_cfn, created_workspace):
        """Associating with a non-existent MAS returns 404."""
        ce_id = _register(client, registered_cfn, "CASA")

        resp = client.post(
            f"/api/workspaces/{created_workspace}/multi-agentic-systems/nonexistent-mas/cognition-engines",
            json={"ce_id": ce_id},
        )

        assert resp.status_code == status.HTTP_404_NOT_FOUND

    def test_disassociate_returns_204(self, client, registered_cfn, created_workspace):
        """Disassociating an existing CE-MAS pair returns 204."""
        ce_id = _register(client, registered_cfn, "CASA")
        mas_id = _create_mas(client, created_workspace, "disassoc-mas")
        client.post(
            f"/api/workspaces/{created_workspace}/multi-agentic-systems/{mas_id}/cognition-engines",
            json={"ce_id": ce_id},
        )

        resp = client.delete(
            f"/api/workspaces/{created_workspace}/multi-agentic-systems/{mas_id}/cognition-engines/{ce_id}"
        )

        assert resp.status_code == status.HTTP_204_NO_CONTENT

    def test_disassociate_nonexistent_returns_404(self, client, registered_cfn, created_workspace):
        """Disassociating a pair that doesn't exist returns 404."""
        ce_id = _register(client, registered_cfn, "CASA")
        mas_id = _create_mas(client, created_workspace, "disassoc-404-mas")

        resp = client.delete(
            f"/api/workspaces/{created_workspace}/multi-agentic-systems/{mas_id}/cognition-engines/{ce_id}"
        )

        assert resp.status_code == status.HTTP_404_NOT_FOUND

    def test_disassociate_allows_reassociation(self, client, registered_cfn, created_workspace):
        """After disassociation the same pair can be re-associated."""
        ce_id = _register(client, registered_cfn, "CASA")
        mas_id = _create_mas(client, created_workspace, "reassoc-mas")

        client.post(
            f"/api/workspaces/{created_workspace}/multi-agentic-systems/{mas_id}/cognition-engines",
            json={"ce_id": ce_id},
        )
        client.delete(f"/api/workspaces/{created_workspace}/multi-agentic-systems/{mas_id}/cognition-engines/{ce_id}")

        resp = client.post(
            f"/api/workspaces/{created_workspace}/multi-agentic-systems/{mas_id}/cognition-engines",
            json={"ce_id": ce_id},
        )
        assert resp.status_code == status.HTTP_201_CREATED

    def test_associate_increments_config_version(self, client, registered_cfn, created_workspace):
        """Associating a CE with a MAS triggers a CFN config update (config_version increments)."""
        ce_id = _register(client, registered_cfn, "CASA")
        mas_id = _create_mas(client, created_workspace, "assoc-cfg-mas")

        initial_version = client.put(f"/api/cognition-fabric-nodes/{registered_cfn}/heartbeat").json()["config_version"]

        client.post(
            f"/api/workspaces/{created_workspace}/multi-agentic-systems/{mas_id}/cognition-engines",
            json={"ce_id": ce_id},
        )

        updated_version = client.put(f"/api/cognition-fabric-nodes/{registered_cfn}/heartbeat").json()["config_version"]
        assert updated_version > initial_version

    def test_disassociate_increments_config_version(self, client, registered_cfn, created_workspace):
        """Disassociating a CE from a MAS triggers a CFN config update (config_version increments)."""
        ce_id = _register(client, registered_cfn, "CASA")
        mas_id = _create_mas(client, created_workspace, "disassoc-cfg-mas")
        client.post(
            f"/api/workspaces/{created_workspace}/multi-agentic-systems/{mas_id}/cognition-engines",
            json={"ce_id": ce_id},
        )

        initial_version = client.put(f"/api/cognition-fabric-nodes/{registered_cfn}/heartbeat").json()["config_version"]

        client.delete(f"/api/workspaces/{created_workspace}/multi-agentic-systems/{mas_id}/cognition-engines/{ce_id}")

        updated_version = client.put(f"/api/cognition-fabric-nodes/{registered_cfn}/heartbeat").json()["config_version"]
        assert updated_version > initial_version


class TestCognitionEngineAutoAttachTrigger:
    """Tests for auto-attach trigger logic."""

    def test_register_mas_auto_associate_does_not_attach_to_existing_mas(
        self, client, registered_cfn, created_workspace
    ):
        """CE registration does not auto-attach to pre-existing MAS, even with mas_auto_associate=True."""
        mas_id = _create_mas(client, created_workspace, "pre-existing-mas")
        ce_id = _register(client, registered_cfn, "CASA", mas_auto_associate=True)

        # Manual association should succeed — registration does not trigger auto-attach
        resp = client.post(
            f"/api/workspaces/{created_workspace}/multi-agentic-systems/{mas_id}/cognition-engines",
            json={"ce_id": ce_id},
        )
        assert resp.status_code == status.HTTP_201_CREATED

    def test_new_mas_mas_auto_associatees_existing_mas_auto_associate_ce(self, client, registered_cfn):
        """New MAS created in a CFN is auto-associated with all mas_auto_associate=True CEs in that CFN."""
        ce_id = _register(client, registered_cfn, "CASA", mas_auto_associate=True)

        # Create workspace linked to same CFN, then create a new MAS
        ws_id = client.post(
            "/api/workspaces/create",
            json={"name": "New Workspace", "cfn_id": registered_cfn},
        ).json()["id"]
        mas_id = _create_mas(client, ws_id, "new-mas")

        # Association should already exist from auto-attach
        resp = client.post(
            f"/api/workspaces/{ws_id}/multi-agentic-systems/{mas_id}/cognition-engines",
            json={"ce_id": ce_id},
        )
        assert resp.status_code == status.HTTP_409_CONFLICT

    def test_new_mas_does_not_attach_non_mas_auto_associate_ce(self, client, registered_cfn):
        """New MAS is NOT auto-associated with CEs that have mas_auto_associate=False."""
        ce_id = _register(client, registered_cfn, "CASA")  # mas_auto_associate=False

        ws_id = client.post(
            "/api/workspaces/create",
            json={"name": "WS No Attach", "cfn_id": registered_cfn},
        ).json()["id"]
        mas_id = _create_mas(client, ws_id, "mas-no-attach")

        # Manual association should succeed — no auto-attach occurred
        resp = client.post(
            f"/api/workspaces/{ws_id}/multi-agentic-systems/{mas_id}/cognition-engines",
            json={"ce_id": ce_id},
        )
        assert resp.status_code == status.HTTP_201_CREATED

    def test_mas_auto_associate_duplicate_returns_409(self, client, registered_cfn, created_workspace):
        """Re-registering a CE with the same (cfn_id, name, version) returns 409 Conflict."""
        _create_mas(client, created_workspace, "idempotent-mas")
        payload = {
            "cfn_id": registered_cfn,
            "name": "auto-assoc-dup-ce",
            "version": "1.0.0",
            "ce_type": "CASA",
            "enforcing_url": "http://ce:8080",
            "enforcing_endpoint": "/api/l9/enforcement",
            "health_url": "http://ce.internal:8080/healthz",
            "health_endpoint": "/healthz",
            "mas_auto_associate": True,
        }
        first = client.post("/api/cognition-engines", json=payload)  # first registration: creates (201)
        assert first.status_code == status.HTTP_201_CREATED
        ce_id = first.json()["ce_id"]

        resp = client.post("/api/cognition-engines", json=payload)  # second registration: conflict (409)

        assert resp.status_code == status.HTTP_409_CONFLICT
        assert resp.json()["detail"]["existing_ce_id"] == ce_id

    def test_mas_update_mas_auto_associatees_existing_mas_auto_associate_ce(self, client, registered_cfn):
        """Updating a MAS triggers auto-attach for all enabled mas_auto_associate CEs in the CFN."""
        # Create MAS first so no mas_auto_associate CE exists yet at creation time
        ws_id = client.post(
            "/api/workspaces/create",
            json={"name": "WS Update Trigger", "cfn_id": registered_cfn},
        ).json()["id"]
        mas_id = _create_mas(client, ws_id, "mas-before-ce")

        # Register CE after MAS exists — registration does not auto-attach
        ce_id = _register(client, registered_cfn, "CASA", mas_auto_associate=True)

        # Confirm no auto-attach happened: manual association should succeed
        assoc_resp = client.post(
            f"/api/workspaces/{ws_id}/multi-agentic-systems/{mas_id}/cognition-engines",
            json={"ce_id": ce_id},
        )
        assert assoc_resp.status_code == status.HTTP_201_CREATED

        # Disassociate so we can verify that update re-attaches
        client.delete(f"/api/workspaces/{ws_id}/multi-agentic-systems/{mas_id}/cognition-engines/{ce_id}")

        # Update the MAS — auto-attach should fire
        client.put(
            f"/api/workspaces/{ws_id}/multi-agentic-systems/{mas_id}",
            json={"name": "mas-before-ce-updated"},
        )

        # Attempting manual association should return 409 — already associated by update auto-attach
        resp = client.post(
            f"/api/workspaces/{ws_id}/multi-agentic-systems/{mas_id}/cognition-engines",
            json={"ce_id": ce_id},
        )
        assert resp.status_code == status.HTTP_409_CONFLICT

    def test_mas_update_does_not_attach_non_mas_auto_associate_ce(self, client, registered_cfn):
        """Updating a MAS does not auto-attach CEs with mas_auto_associate=False."""
        ws_id = client.post(
            "/api/workspaces/create",
            json={"name": "WS Update No Attach", "cfn_id": registered_cfn},
        ).json()["id"]
        mas_id = _create_mas(client, ws_id, "mas-no-auto-attach")
        ce_id = _register(client, registered_cfn, "DETECTIVE")  # mas_auto_associate=False

        # Update the MAS — should not trigger auto-attach
        client.put(
            f"/api/workspaces/{ws_id}/multi-agentic-systems/{mas_id}",
            json={"name": "mas-no-auto-attach-updated"},
        )

        # Manual association should succeed — CE was not auto-attached
        resp = client.post(
            f"/api/workspaces/{ws_id}/multi-agentic-systems/{mas_id}/cognition-engines",
            json={"ce_id": ce_id},
        )
        assert resp.status_code == status.HTTP_201_CREATED

    def test_new_mas_does_not_attach_disabled_mas_auto_associate_ce(self, client, registered_cfn):
        """New MAS is not wired to a disabled CE even if mas_auto_associate=True."""
        ce_id = _register(client, registered_cfn, "CASA", mas_auto_associate=True)

        # Create a workspace+MAS so the CE auto-attaches, then disassociate and disable
        ws_id = client.post(
            "/api/workspaces/create",
            json={"name": "WS Disable Trigger2", "cfn_id": registered_cfn},
        ).json()["id"]
        existing_mas_id = _create_mas(client, ws_id, "existing-mas")
        client.delete(f"/api/workspaces/{ws_id}/multi-agentic-systems/{existing_mas_id}/cognition-engines/{ce_id}")
        client.patch(f"/api/cognition-engines/{ce_id}", json={"enabled": False})

        # Create a new MAS — disabled CE should not be auto-attached
        new_mas_id = _create_mas(client, ws_id, "new-mas-disabled-ce")

        # Manual association should succeed — CE was not auto-attached
        resp = client.post(
            f"/api/workspaces/{ws_id}/multi-agentic-systems/{new_mas_id}/cognition-engines",
            json={"ce_id": ce_id},
        )
        assert resp.status_code == status.HTTP_201_CREATED


class TestMasCognitionEnginePatch:
    """Tests for PATCH /workspaces/{ws}/multi-agentic-systems/{mas_id}/cognition-engines/{ce_id}

    This endpoint updates the per-MAS mas_config override for a single CE-MAS association.
    It exists because the correct scope for overriding a CE's config for a specific MAS is
    the MAS resource, not the CE resource.
    """

    def test_patch_returns_204(self, client, registered_cfn, created_workspace):
        """PATCH with valid mas_config returns 204 No Content."""
        ce_id = _register(client, registered_cfn, "CASA")
        mas_id = _create_mas(client, created_workspace, "mas-patch-mas")
        client.post(
            f"/api/workspaces/{created_workspace}/multi-agentic-systems/{mas_id}/cognition-engines",
            json={"ce_id": ce_id},
        )

        resp = client.patch(
            f"/api/workspaces/{created_workspace}/multi-agentic-systems/{mas_id}/cognition-engines/{ce_id}",
            json={"mas_config": {"schedule": "0 2 * * *", "top_k": 5}},
        )

        assert resp.status_code == status.HTTP_204_NO_CONTENT

    def test_patch_updates_junction_row(self, client, registered_cfn, created_workspace):
        """PATCH stores the new mas_config in the CE-MAS junction row."""
        from server.database.relational_db.models.mas_cognition_engine import MasCognitionEngine

        ce_id = _register(client, registered_cfn, "CASA")
        mas_id = _create_mas(client, created_workspace, "mas-patch-db-mas")
        client.post(
            f"/api/workspaces/{created_workspace}/multi-agentic-systems/{mas_id}/cognition-engines",
            json={"ce_id": ce_id},
        )

        new_config = {"schedule": "0 6 * * *", "top_k": 20}
        client.patch(
            f"/api/workspaces/{created_workspace}/multi-agentic-systems/{mas_id}/cognition-engines/{ce_id}",
            json={"mas_config": new_config},
        )

        db = RelationalDB()
        session = db.get_session()
        try:
            row = (
                session.query(MasCognitionEngine)
                .filter(MasCognitionEngine.mas_id == mas_id, MasCognitionEngine.ce_id == ce_id)
                .first()
            )
            assert row is not None
            assert row.mas_config == new_config
        finally:
            session.close()

    def test_patch_does_not_modify_ce_factory_default(self, client, registered_cfn, created_workspace):
        """PATCH MAS-scoped config does not modify the CE factory default mas_config."""
        factory_default = {"schedule": "0 0 * * *"}
        ce_id = _register(client, registered_cfn, "CASA", mas_config=factory_default)
        mas_id = _create_mas(client, created_workspace, "mas-patch-factory-mas")
        client.post(
            f"/api/workspaces/{created_workspace}/multi-agentic-systems/{mas_id}/cognition-engines",
            json={"ce_id": ce_id},
        )

        client.patch(
            f"/api/workspaces/{created_workspace}/multi-agentic-systems/{mas_id}/cognition-engines/{ce_id}",
            json={"mas_config": {"schedule": "0 12 * * *"}},
        )

        ce_detail = client.get(f"/api/cognition-engines/{ce_id}").json()
        assert ce_detail["mas_config"] == factory_default

    def test_patch_unknown_keys_returns_422(self, client, registered_cfn, created_workspace):
        """PATCH with keys not in the CE factory default is rejected with 422."""
        ce_id = _register(
            client,
            registered_cfn,
            "CASA",
            mas_config={"schedule": "0 0 * * *", "top_k": 10},
        )
        mas_id = _create_mas(client, created_workspace, "mas-patch-unknown-keys-mas")
        client.post(
            f"/api/workspaces/{created_workspace}/multi-agentic-systems/{mas_id}/cognition-engines",
            json={"ce_id": ce_id},
        )

        resp = client.patch(
            f"/api/workspaces/{created_workspace}/multi-agentic-systems/{mas_id}/cognition-engines/{ce_id}",
            json={"mas_config": {"schedule": "0 6 * * *", "top_k": 5, "foo": "bar"}},
        )

        assert resp.status_code == status.HTTP_422_UNPROCESSABLE_CONTENT
        assert "foo" in resp.json()["detail"]

    def test_patch_subset_of_keys_allowed(self, client, registered_cfn, created_workspace):
        """PATCH with a subset of factory default keys is valid — not all keys need to be provided."""
        ce_id = _register(
            client,
            registered_cfn,
            "CASA",
            mas_config={"schedule": "0 0 * * *", "top_k": 10},
        )
        mas_id = _create_mas(client, created_workspace, "mas-patch-subset-mas")
        client.post(
            f"/api/workspaces/{created_workspace}/multi-agentic-systems/{mas_id}/cognition-engines",
            json={"ce_id": ce_id},
        )

        resp = client.patch(
            f"/api/workspaces/{created_workspace}/multi-agentic-systems/{mas_id}/cognition-engines/{ce_id}",
            json={"mas_config": {"schedule": "0 6 * * *"}},
        )

        assert resp.status_code == status.HTTP_204_NO_CONTENT

    def test_patch_not_associated_returns_404(self, client, registered_cfn, created_workspace):
        """PATCH when CE is not associated with the MAS returns 404."""
        ce_id = _register(client, registered_cfn, "CASA")
        mas_id = _create_mas(client, created_workspace, "mas-patch-404-mas")
        # CE is intentionally not associated with this MAS

        resp = client.patch(
            f"/api/workspaces/{created_workspace}/multi-agentic-systems/{mas_id}/cognition-engines/{ce_id}",
            json={"mas_config": {"schedule": "0 0 * * *"}},
        )

        assert resp.status_code == status.HTTP_404_NOT_FOUND

    def test_patch_increments_config_version(self, client, registered_cfn, created_workspace):
        """PATCH mas_config triggers a CFN config update (config_version increments)."""
        ce_id = _register(client, registered_cfn, "CASA")
        mas_id = _create_mas(client, created_workspace, "mas-patch-cfgv-mas")
        client.post(
            f"/api/workspaces/{created_workspace}/multi-agentic-systems/{mas_id}/cognition-engines",
            json={"ce_id": ce_id},
        )

        initial_version = client.put(f"/api/cognition-fabric-nodes/{registered_cfn}/heartbeat").json()["config_version"]

        client.patch(
            f"/api/workspaces/{created_workspace}/multi-agentic-systems/{mas_id}/cognition-engines/{ce_id}",
            json={"mas_config": {"schedule": "0 3 * * *"}},
        )

        updated_version = client.put(f"/api/cognition-fabric-nodes/{registered_cfn}/heartbeat").json()["config_version"]
        assert updated_version > initial_version

    def test_patch_only_affects_target_mas_junction(self, client, registered_cfn, created_workspace):
        """PATCH for one MAS does not affect other MAS junction rows for the same CE."""
        from server.database.relational_db.models.mas_cognition_engine import MasCognitionEngine

        original_config = {"schedule": "0 0 * * *"}
        ce_id = _register(client, registered_cfn, "CASA", mas_config=original_config)
        mas_id_1 = _create_mas(client, created_workspace, "mas-patch-iso-1")
        mas_id_2 = _create_mas(client, created_workspace, "mas-patch-iso-2")
        for mas_id in (mas_id_1, mas_id_2):
            client.post(
                f"/api/workspaces/{created_workspace}/multi-agentic-systems/{mas_id}/cognition-engines",
                json={"ce_id": ce_id},
            )

        # Override config for MAS 1 only
        client.patch(
            f"/api/workspaces/{created_workspace}/multi-agentic-systems/{mas_id_1}/cognition-engines/{ce_id}",
            json={"mas_config": {"schedule": "0 6 * * *"}},
        )

        db = RelationalDB()
        session = db.get_session()
        try:
            row1 = (
                session.query(MasCognitionEngine)
                .filter(MasCognitionEngine.mas_id == mas_id_1, MasCognitionEngine.ce_id == ce_id)
                .first()
            )
            row2 = (
                session.query(MasCognitionEngine)
                .filter(MasCognitionEngine.mas_id == mas_id_2, MasCognitionEngine.ce_id == ce_id)
                .first()
            )
            assert row1.mas_config == {"schedule": "0 6 * * *"}
            assert row2.mas_config == original_config
        finally:
            session.close()


class TestCognitionEngineVersionUpgradeAssociation:
    """Registering a new version of an existing CE (same cfn_id, name) carries forward
    the MAS associations of prior versions, so the upgraded CE keeps serving the same MAS."""

    def test_new_version_inherits_prior_version_mas_association(self, client, registered_cfn, created_workspace):
        """Registering v2 of a CE auto-associates it with every MAS v1 was attached to."""
        ce_v1 = _register(client, registered_cfn, "CASA", name="upgrade-ce", version="1.0.0")
        mas_id = _create_mas(client, created_workspace, "upgrade-mas")
        client.post(
            f"/api/workspaces/{created_workspace}/multi-agentic-systems/{mas_id}/cognition-engines",
            json={"ce_id": ce_v1},
        )

        resp = client.post(
            "/api/cognition-engines",
            json=_base_payload(registered_cfn, "CASA", name="upgrade-ce", version="2.0.0"),
        )
        assert resp.status_code == status.HTTP_201_CREATED
        ce_v2 = resp.json()["ce_id"]

        assert ce_v2 in _mas_ce_ids(client, created_workspace, mas_id)

    def test_new_version_does_not_disassociate_prior_version(self, client, registered_cfn, created_workspace):
        """The prior version's own association is left untouched — disassociation is a separate concern."""
        ce_v1 = _register(client, registered_cfn, "CASA", name="upgrade-keep-ce", version="1.0.0")
        mas_id = _create_mas(client, created_workspace, "upgrade-keep-mas")
        client.post(
            f"/api/workspaces/{created_workspace}/multi-agentic-systems/{mas_id}/cognition-engines",
            json={"ce_id": ce_v1},
        )

        client.post(
            "/api/cognition-engines",
            json=_base_payload(registered_cfn, "CASA", name="upgrade-keep-ce", version="2.0.0"),
        )

        assert ce_v1 in _mas_ce_ids(client, created_workspace, mas_id)

    def test_new_version_with_no_prior_mas_association_is_unaffected(self, client, registered_cfn):
        """A prior version with no MAS attached registers a new version with no errors and no associations."""
        _register(client, registered_cfn, "CASA", name="upgrade-no-mas-ce", version="1.0.0")

        resp = client.post(
            "/api/cognition-engines",
            json=_base_payload(registered_cfn, "CASA", name="upgrade-no-mas-ce", version="2.0.0"),
        )

        assert resp.status_code == status.HTTP_201_CREATED

    def test_first_registration_has_no_prior_version_to_inherit_from(self, client, registered_cfn):
        """A brand-new CE name has no prior version, so registration succeeds with nothing to carry forward."""
        resp = client.post(
            "/api/cognition-engines",
            json=_base_payload(registered_cfn, "CASA", name="brand-new-ce", version="1.0.0"),
        )
        assert resp.status_code == status.HTTP_201_CREATED

    def test_new_version_ignores_association_to_soft_deleted_mas(self, client, registered_cfn, created_workspace):
        """A prior version's association to a since-deleted MAS is not carried forward."""
        ce_v1 = _register(client, registered_cfn, "CASA", name="upgrade-deleted-mas-ce", version="1.0.0")
        mas_id = _create_mas(client, created_workspace, "upgrade-deleted-mas")
        client.post(
            f"/api/workspaces/{created_workspace}/multi-agentic-systems/{mas_id}/cognition-engines",
            json={"ce_id": ce_v1},
        )
        client.delete(f"/api/workspaces/{created_workspace}/multi-agentic-systems/{mas_id}")

        resp = client.post(
            "/api/cognition-engines",
            json=_base_payload(registered_cfn, "CASA", name="upgrade-deleted-mas-ce", version="2.0.0"),
        )
        ce_v2 = resp.json()["ce_id"]

        # Manual association must still succeed — v2 was not auto-attached to the deleted MAS
        manual = client.post(
            f"/api/workspaces/{created_workspace}/multi-agentic-systems/{mas_id}/cognition-engines",
            json={"ce_id": ce_v2},
        )
        assert manual.status_code == status.HTTP_404_NOT_FOUND

    def test_new_version_inherits_only_from_most_recent_predecessor(self, client, registered_cfn, created_workspace):
        """With multiple active siblings, only the most recently registered one is inherited from — not a
        union of every sibling's associations."""
        ce_v1 = _register(client, registered_cfn, "CASA", name="upgrade-predecessor-ce", version="1.0.0")
        ce_v2 = _register(client, registered_cfn, "CASA", name="upgrade-predecessor-ce", version="2.0.0")
        mas_a = _create_mas(client, created_workspace, "upgrade-predecessor-mas-a")
        mas_b = _create_mas(client, created_workspace, "upgrade-predecessor-mas-b")
        client.post(
            f"/api/workspaces/{created_workspace}/multi-agentic-systems/{mas_a}/cognition-engines",
            json={"ce_id": ce_v1},
        )
        client.post(
            f"/api/workspaces/{created_workspace}/multi-agentic-systems/{mas_b}/cognition-engines",
            json={"ce_id": ce_v2},
        )

        resp = client.post(
            "/api/cognition-engines",
            json=_base_payload(registered_cfn, "CASA", name="upgrade-predecessor-ce", version="3.0.0"),
        )
        assert resp.status_code == status.HTTP_201_CREATED
        ce_v3 = resp.json()["ce_id"]

        assert ce_v3 in _mas_ce_ids(client, created_workspace, mas_b)
        assert ce_v3 not in _mas_ce_ids(client, created_workspace, mas_a)

    def test_new_version_does_not_resurrect_a_disassociated_mas(self, client, registered_cfn, created_workspace):
        """If the most recent predecessor was deliberately disassociated from a MAS, an older sibling still
        holding that stale association must not resurrect it for the next version."""
        ce_v1 = _register(client, registered_cfn, "CASA", name="upgrade-resurrect-ce", version="1.0.0")
        mas_id = _create_mas(client, created_workspace, "upgrade-resurrect-mas")
        client.post(
            f"/api/workspaces/{created_workspace}/multi-agentic-systems/{mas_id}/cognition-engines",
            json={"ce_id": ce_v1},
        )

        ce_v2 = client.post(
            "/api/cognition-engines",
            json=_base_payload(registered_cfn, "CASA", name="upgrade-resurrect-ce", version="2.0.0"),
        ).json()["ce_id"]
        assert ce_v2 in _mas_ce_ids(client, created_workspace, mas_id)

        # Deliberately disassociate the most recent version from the MAS
        client.delete(f"/api/workspaces/{created_workspace}/multi-agentic-systems/{mas_id}/cognition-engines/{ce_v2}")

        ce_v3 = client.post(
            "/api/cognition-engines",
            json=_base_payload(registered_cfn, "CASA", name="upgrade-resurrect-ce", version="3.0.0"),
        ).json()["ce_id"]

        ce_ids = _mas_ce_ids(client, created_workspace, mas_id)
        assert ce_v1 in ce_ids  # v1's own association is untouched
        assert ce_v3 not in ce_ids  # v3 must not resurrect what v2 deliberately dropped

    def test_new_version_association_uses_new_engines_own_mas_config(self, client, registered_cfn, created_workspace):
        """The inherited association is seeded with v2's own factory mas_config, not v1's per-MAS override."""
        from server.database.relational_db.models.mas_cognition_engine import MasCognitionEngine

        ce_v1 = _register(
            client,
            registered_cfn,
            "CASA",
            name="upgrade-config-ce",
            version="1.0.0",
            mas_config={"schedule": "0 0 * * *"},
        )
        mas_id = _create_mas(client, created_workspace, "upgrade-config-mas")
        client.post(
            f"/api/workspaces/{created_workspace}/multi-agentic-systems/{mas_id}/cognition-engines",
            json={"ce_id": ce_v1},
        )
        # Override v1's per-MAS config so it differs from its own factory default
        client.patch(
            f"/api/workspaces/{created_workspace}/multi-agentic-systems/{mas_id}/cognition-engines/{ce_v1}",
            json={"mas_config": {"schedule": "0 12 * * *"}},
        )

        v2_factory_config = {"schedule": "0 6 * * *"}
        resp = client.post(
            "/api/cognition-engines",
            json={
                **_base_payload(registered_cfn, "CASA", name="upgrade-config-ce", version="2.0.0"),
                "mas_config": v2_factory_config,
            },
        )
        ce_v2 = resp.json()["ce_id"]

        db = RelationalDB()
        session = db.get_session()
        try:
            row = (
                session.query(MasCognitionEngine)
                .filter(MasCognitionEngine.mas_id == mas_id, MasCognitionEngine.ce_id == ce_v2)
                .first()
            )
            assert row is not None
            assert row.mas_config == v2_factory_config
        finally:
            session.close()

    def test_new_version_registration_increments_config_version(self, client, registered_cfn, created_workspace):
        """Inheriting a MAS association on version upgrade triggers a CFN config update."""
        ce_v1 = _register(client, registered_cfn, "CASA", name="upgrade-cfgv-ce", version="1.0.0")
        mas_id = _create_mas(client, created_workspace, "upgrade-cfgv-mas")
        client.post(
            f"/api/workspaces/{created_workspace}/multi-agentic-systems/{mas_id}/cognition-engines",
            json={"ce_id": ce_v1},
        )

        initial_version = client.put(f"/api/cognition-fabric-nodes/{registered_cfn}/heartbeat").json()["config_version"]

        client.post(
            "/api/cognition-engines",
            json=_base_payload(registered_cfn, "CASA", name="upgrade-cfgv-ce", version="2.0.0"),
        )

        updated_version = client.put(f"/api/cognition-fabric-nodes/{registered_cfn}/heartbeat").json()["config_version"]
        assert updated_version > initial_version

    def test_different_cfn_prior_version_is_not_inherited_from(self, client):
        """A CE with the same name under a different CFN is a separate logical CE — no cross-CFN inheritance."""
        cfn1_id = client.post(
            "/api/cognition-fabric-nodes/register",
            json={"id": "cfn-upgrade-iso-1", "name": "CFN Upgrade Iso 1"},
        ).json()["id"]
        cfn2_id = client.post(
            "/api/cognition-fabric-nodes/register",
            json={"id": "cfn-upgrade-iso-2", "name": "CFN Upgrade Iso 2"},
        ).json()["id"]
        ws1_id = client.post(
            "/api/workspaces/create",
            json={"name": "Upgrade Iso WS 1", "cfn_id": cfn1_id},
        ).json()["id"]

        ce_v1 = _register(client, cfn1_id, "CASA", name="cross-cfn-ce", version="1.0.0")
        mas_id = _create_mas(client, ws1_id, "cross-cfn-mas")
        client.post(
            f"/api/workspaces/{ws1_id}/multi-agentic-systems/{mas_id}/cognition-engines",
            json={"ce_id": ce_v1},
        )

        resp = client.post(
            "/api/cognition-engines",
            json=_base_payload(cfn2_id, "CASA", name="cross-cfn-ce", version="2.0.0"),
        )
        ce_v2 = resp.json()["ce_id"]

        assert ce_v2 not in _mas_ce_ids(client, ws1_id, mas_id)

    def test_new_version_registration_is_atomic_with_carry_forward(
        self, client, registered_cfn, created_workspace, monkeypatch
    ):
        """If carrying forward associations fails, the whole registration rolls back — no orphaned CE row
        is left behind with missing associations."""
        from server.services.cognition_engine import cognition_engine_service

        ce_v1 = _register(client, registered_cfn, "CASA", name="upgrade-atomic-ce", version="1.0.0")
        mas_id = _create_mas(client, created_workspace, "upgrade-atomic-mas")
        client.post(
            f"/api/workspaces/{created_workspace}/multi-agentic-systems/{mas_id}/cognition-engines",
            json={"ce_id": ce_v1},
        )

        def _boom(self, session, engine, user_id):
            raise RuntimeError("simulated carry-forward failure")

        monkeypatch.setattr(
            cognition_engine_service, "_carry_forward_mas_associations", _boom.__get__(cognition_engine_service)
        )

        resp = client.post(
            "/api/cognition-engines",
            json=_base_payload(registered_cfn, "CASA", name="upgrade-atomic-ce", version="2.0.0"),
        )
        assert resp.status_code == status.HTTP_500_INTERNAL_SERVER_ERROR

        # No v2 row was persisted — only the original v1 remains
        remaining = client.get(f"/api/cognition-engines?cfn_id={registered_cfn}").json()["cognition_engines"]
        versions = [e["version"] for e in remaining if e["name"] == "upgrade-atomic-ce"]
        assert versions == ["1.0.0"]
