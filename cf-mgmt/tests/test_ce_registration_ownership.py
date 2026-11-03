# Copyright 2026 Cisco Systems, Inc. and its affiliates
#
# SPDX-License-Identifier: Apache-2.0

"""Registration ownership identifies the CE being monitored."""

import asyncio
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from unittest.mock import patch

import pytest

from server.schemas.cognition_engine import CognitionEngineRegisterRequest
from server.services.cognition_engine import cognition_engine_service
from server.services.cognition_engine_monitor import CognitionEngineMonitor
from tests.test_cognition_engines import _base_payload, _create_mas, _get_ce, _register, _set_ce

SHARED_ENDPOINTS = {
    "health_url": "http://127.0.0.1:18000",
    "enforcing_url": "127.0.0.1:18001",
}


def _targets():
    return {target.ce_id: target.registration_token for target in cognition_engine_service.list_probe_targets()}


def _reconnect(client, ce_id, **endpoints):
    response = client.patch(f"/api/cognition-engines/{ce_id}?reconnect=true", json={**SHARED_ENDPOINTS, **endpoints})
    assert response.status_code == 200, response.text
    return response


@pytest.mark.parametrize("name,version", [("demo-ce", "reference-v1"), ("policy-ce", "1.0.0")])
def test_replacement_retires_only_the_old_registration(client, registered_cfn, name, version):
    old = _register(client, registered_cfn, name="policy-ce", version="reference-v1", **SHARED_ENDPOINTS)
    old_token = _targets()[old]
    _set_ce(old, last_seen=datetime.now(timezone.utc) - timedelta(seconds=30))
    replacement = _register(client, registered_cfn, name=name, version=version, **SHARED_ENDPOINTS)

    assert _get_ce(old)["status"] == "offline"
    assert client.get(f"/api/cognition-engines/{old}").json()["enabled"] is True
    assert set(_targets()) == {replacement}
    assert cognition_engine_service.record_probe_result(old, True, 6, registration_token=old_token) is None
    assert _get_ce(old)["status"] == "offline"

    with patch("server.services.cognition_engine_monitor.probe_ce_health", return_value=True) as probe:
        asyncio.run(CognitionEngineMonitor().probe_all())
    probe.assert_called_once_with(replacement, 1)
    assert _get_ce(replacement)["status"] == "online"

    # When the replacement stops, the old registration does not become an owner again.
    _set_ce(replacement, last_seen=datetime.now(timezone.utc) - timedelta(seconds=30))
    with patch("server.services.cognition_engine_monitor.probe_ce_health", return_value=False):
        asyncio.run(CognitionEngineMonitor().probe_all())
    assert _get_ce(replacement)["status"] == _get_ce(old)["status"] == "offline"
    assert set(_targets()) == {replacement}


def test_409_then_unchanged_patch_reclaims_an_older_registration(client, registered_cfn):
    old = _register(client, registered_cfn, name="policy-ce", **SHARED_ENDPOINTS)
    original_token = _targets()[old]
    newer = _register(client, registered_cfn, name="demo-ce", **SHARED_ENDPOINTS)
    conflict = client.post(
        "/api/cognition-engines", json={**_base_payload(registered_cfn, name="policy-ce"), **SHARED_ENDPOINTS}
    )
    assert conflict.status_code == 409
    assert conflict.json()["detail"]["existing_ce_id"] == old
    assert set(_targets()) == {newer}  # A failed POST alone does not claim ownership.

    _reconnect(client, old)
    assert set(_targets()) == {old}
    assert _targets()[old] != original_token
    assert _get_ce(newer)["status"] == "offline"
    # Even an A -> B -> A ownership change rejects the original A probe.
    assert cognition_engine_service.record_probe_result(old, True, 6, registration_token=original_token) is None
    assert _get_ce(old)["status"] == "offline"

    with patch("server.services.cognition_engine_monitor.probe_ce_health", return_value=True):
        asyncio.run(CognitionEngineMonitor().probe_all())
    assert _get_ce(old)["status"] == "online"
    assert _get_ce(newer)["status"] == "offline"


def test_same_identity_restart_renews_ownership_and_recovers(client, registered_cfn):
    ce_id = _register(client, registered_cfn, name="demo-ce", **SHARED_ENDPOINTS)
    original_token = _targets()[ce_id]
    _set_ce(ce_id, status="offline")
    _reconnect(client, ce_id)
    assert _targets()[ce_id] != original_token
    with patch("server.services.cognition_engine_monitor.probe_ce_health", return_value=True):
        asyncio.run(CognitionEngineMonitor().probe_all())
    assert _get_ce(ce_id)["status"] == "online"


def test_monitor_ignores_a_probe_completed_after_replacement(client, registered_cfn):
    old = _register(client, registered_cfn, name="old", **SHARED_ENDPOINTS)
    replacement = []

    def replace_during_probe(ce_id, timeout):
        assert ce_id == old
        replacement.append(_register(client, registered_cfn, name="new", **SHARED_ENDPOINTS))
        return True  # The endpoint answered, but its registration changed during the call.

    with patch("server.services.cognition_engine_monitor.probe_ce_health", side_effect=replace_during_probe):
        asyncio.run(CognitionEngineMonitor().probe_all())
    assert _get_ce(old)["status"] == "offline"
    assert _get_ce(old)["last_seen"] is None
    assert set(_targets()) == set(replacement)


def test_admin_edits_do_not_reclaim_ownership_or_reenable_a_disabled_ce(client, registered_cfn):
    old = _register(client, registered_cfn, name="old", **SHARED_ENDPOINTS)
    current = _register(client, registered_cfn, name="current", **SHARED_ENDPOINTS)
    for body in ({"enabled": False}, {"enabled": True}, {"mas_auto_associate": False}):
        assert client.patch(f"/api/cognition-engines/{old}", json=body).status_code == 200
        assert set(_targets()) == {current}
        assert _get_ce(old)["status"] == "offline"

    assert client.patch(f"/api/cognition-engines/{current}", json={"enabled": False}).status_code == 200
    _reconnect(client, current)
    assert client.get(f"/api/cognition-engines/{current}").json()["enabled"] is False
    assert _targets() == {}


@pytest.mark.parametrize("old_enabled", [True, False])
@pytest.mark.parametrize("query", ["", "?reconnect=false"])
def test_full_ui_save_does_not_reclaim_a_superseded_registration(client, registered_cfn, old_enabled, query):
    old = _register(client, registered_cfn, name="old", **SHARED_ENDPOINTS)
    if not old_enabled:
        assert client.patch(f"/api/cognition-engines/{old}", json={"enabled": False}).status_code == 200
    current = _register(client, registered_cfn, name="current", **SHARED_ENDPOINTS)
    original_targets = _targets()
    old_detail = client.get(f"/api/cognition-engines/{old}").json()
    # Mirrors cognitive-agent-details.tsx:handleSave, including unchanged endpoint fields.
    body = {
        "enforcing_url": old_detail["enforcing_url"] or None,
        "enforcing_endpoint": old_detail["enforcing_endpoint"] or None,
        "enforcing_protocol": old_detail["enforcing_protocol"],
        "health_url": old_detail["health_url"],
        "health_endpoint": old_detail["health_endpoint"],
        "health_protocol": old_detail["health_protocol"],
        "notification_url": old_detail["notification_url"] or None,
        "notification_endpoint": old_detail["notification_endpoint"] or None,
        "notification_protocol": old_detail["notification_protocol"],
        "enabled": old_detail["enabled"],
        "mas_auto_associate": not old_detail["mas_auto_associate"],
    }
    response = client.patch(f"/api/cognition-engines/{old}{query}", json=body)
    assert response.status_code == 200
    assert response.json()["mas_auto_associate"] == body["mas_auto_associate"]
    assert _targets() == original_targets
    with patch("server.services.cognition_engine_monitor.probe_ce_health", return_value=True) as probe:
        asyncio.run(CognitionEngineMonitor().probe_all())
    probe.assert_called_once_with(current, 1)
    assert _get_ce(old)["status"] == "offline"
    assert _get_ce(current)["status"] == "online"


def test_cosmetic_endpoint_edits_do_not_reclaim_ownership(client, registered_cfn):
    old = _register(client, registered_cfn, name="old", **SHARED_ENDPOINTS)
    _register(client, registered_cfn, name="current", **SHARED_ENDPOINTS)
    original_targets = _targets()
    response = client.patch(
        f"/api/cognition-engines/{old}",
        json={"health_url": SHARED_ENDPOINTS["health_url"] + "/", "enforcing_url": "http://127.0.0.1:18001"},
    )
    assert response.status_code == 200
    assert _targets() == original_targets
    assert _get_ce(old)["status"] == "offline"


def test_admin_can_move_a_superseded_registration_to_different_endpoints(client, registered_cfn):
    old = _register(client, registered_cfn, name="old", **SHARED_ENDPOINTS)
    current = _register(client, registered_cfn, name="current", **SHARED_ENDPOINTS)
    current_token = _targets()[current]
    response = client.patch(
        f"/api/cognition-engines/{old}",
        json={"health_url": "http://different:18000", "enforcing_url": "different:18001"},
    )
    assert response.status_code == 200
    assert set(_targets()) == {old, current}
    assert _targets()[current] == current_token


@pytest.mark.parametrize("endpoint", ["health_url", "enforcing_url"])
def test_collision_on_either_service_transfers_ownership(client, registered_cfn, endpoint):
    first = _register(client, registered_cfn, name="first", **SHARED_ENDPOINTS)
    second = _register(client, registered_cfn, name="second", **{endpoint: SHARED_ENDPOINTS[endpoint]})
    assert _get_ce(first)["status"] == "offline"
    assert set(_targets()) == {second}


def test_different_services_at_the_same_listener_do_not_conflict(client, registered_cfn):
    first = _register(client, registered_cfn, name="first", **SHARED_ENDPOINTS)
    second = _register(
        client,
        registered_cfn,
        name="second",
        **SHARED_ENDPOINTS,
        health_endpoint="/second/healthz",
        enforcing_endpoint="ioc.ce.v2.SecondEngine",
    )
    assert set(_targets()) == {first, second}


def test_normalized_addresses_have_the_same_owner(client, registered_cfn):
    first = _register(client, registered_cfn, name="first", health_url="http://CE.internal/")
    second = _register(client, registered_cfn, name="second", health_url="http://ce.internal:80")
    assert set(_targets()) == {second}
    assert _get_ce(first)["status"] == "offline"


def test_ownership_is_scoped_to_the_cfn(client, registered_cfn):
    other_cfn = client.post("/api/cognition-fabric-nodes/register", json={"name": "other-cfn", "cfn_config": {}})
    assert other_cfn.status_code == 201
    first = _register(client, registered_cfn, **SHARED_ENDPOINTS)
    second = _register(client, other_cfn.json()["id"], **SHARED_ENDPOINTS)
    assert set(_targets()) == {first, second}


def test_invalid_reconnect_does_not_transfer_ownership(client, registered_cfn):
    old = _register(client, registered_cfn, name="old", **SHARED_ENDPOINTS)
    current = _register(client, registered_cfn, name="current", **SHARED_ENDPOINTS)
    assert client.patch(f"/api/cognition-engines/{old}", json={"health_endpoint": "invalid"}).status_code == 422
    assert set(_targets()) == {current}


def test_failed_registration_rolls_back_ownership_transfer(client, registered_cfn):
    old = _register(client, registered_cfn, name="old", **SHARED_ENDPOINTS)
    original = _targets()
    with patch.object(cognition_engine_service, "_carry_forward_mas_associations", side_effect=RuntimeError("failed")):
        response = client.post(
            "/api/cognition-engines", json={**_base_payload(registered_cfn, name="new"), **SHARED_ENDPOINTS}
        )
    assert response.status_code == 500
    assert _targets() == original
    assert _get_ce(old)["status"] == "online"


def test_concurrent_registration_leaves_exactly_one_owner(client, registered_cfn):
    def register(name):
        request = CognitionEngineRegisterRequest(**{**_base_payload(registered_cfn, name=name), **SHARED_ENDPOINTS})
        return cognition_engine_service.register(request, "00000000-0000-0000-0000-000000000000")[0].ce_id

    with ThreadPoolExecutor(max_workers=2) as executor:
        ids = list(executor.map(register, ["first", "second"]))
    assert len(_targets()) == 1
    assert sorted(_get_ce(ce_id)["status"] for ce_id in ids) == ["offline", "online"]


def test_concurrent_reconnects_leave_exactly_one_owner(client, registered_cfn):
    first = _register(client, registered_cfn, name="first")
    second = _register(client, registered_cfn, name="second")

    def reconnect(ce_id):
        response = client.patch(f"/api/cognition-engines/{ce_id}?reconnect=true", json=SHARED_ENDPOINTS)
        assert response.status_code == 200, response.text

    with ThreadPoolExecutor(max_workers=2) as executor:
        list(executor.map(reconnect, [first, second]))
    assert len(_targets()) == 1
    owner = next(iter(_targets()))
    superseded = second if owner == first else first
    assert _get_ce(superseded)["status"] == "offline"


def test_reconnect_parameter_is_omitted_from_public_schema(client):
    operation = client.app.openapi()["paths"]["/api/cognition-engines/{ce_id}"]["patch"]
    assert "reconnect" not in {parameter["name"] for parameter in operation.get("parameters", [])}


def test_malformed_legacy_endpoint_does_not_block_registration(client, registered_cfn):
    old = _register(client, registered_cfn, name="legacy")
    _set_ce(old, health_url="http://legacy:invalid-port")
    new = _register(client, registered_cfn, name="new")
    assert set(_targets()) == {old, new}


def test_mas_routing_data_preserves_associations_and_retires_old_owner(client, registered_cfn, created_workspace):
    old = _register(client, registered_cfn, name="old", **SHARED_ENDPOINTS)
    mas_id = _create_mas(client, created_workspace, "ownership-mas")
    path = f"/api/workspaces/{created_workspace}/multi-agentic-systems/{mas_id}"
    assert client.post(path + "/cognition-engines", json={"ce_id": old}).status_code == 201
    current = _register(client, registered_cfn, name="current", **SHARED_ENDPOINTS)
    assert client.post(path + "/cognition-engines", json={"ce_id": current}).status_code == 201

    engines = {ce["ce_id"]: ce for ce in client.get(path).json()["cognition_engines"]}
    assert engines[old]["enabled"] is True
    assert engines[old]["status"] == "offline"
    assert engines[current]["status"] == "online"
    assert all("registration_token" not in ce for ce in engines.values())
    snapshot = client.get(f"/api/cognition-fabric-nodes/{registered_cfn}").json()["config"]
    assert {ce["id"]: ce["status"] for ce in snapshot["cognition_engines"]} == {old: "offline", current: "online"}
