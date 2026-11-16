# Copyright 2026 Cisco Systems, Inc. and its affiliates
# SPDX-License-Identifier: Apache-2.0

"""CF-owned response timestamps normalize by instant; opaque evidence stays opaque."""

import importlib
import inspect
from datetime import datetime, timezone
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch
from uuid import uuid4

import pytest
import sqlalchemy as sa
from pydantic import BaseModel, TypeAdapter, ValidationError

from scripts.regenerate_cfn_configs import regenerate_and_check, main
from server.database.relational_db.db import RelationalDB
from server.database.relational_db.models.cognition_fabric_node import CognitionFabricNode
from server.database.relational_db.models.cognition_engine import CognitionEngine
from server.database.relational_db.models.mas_cognition_engine import MasCognitionEngine
from server.database.relational_db.models.multi_agentic_system import MultiAgenticSystem
from server.utils.timestamps import UtcDateTime, format_utc, utc_now
from tests.test_mas_metadata import create, read, rich_request

STAMP_NAMES = {"created_at", "updated_at", "last_seen", "created_on", "last_modified_on", "collected_at"}
OFFSET = "2026-07-10T12:34:56.123456+02:00"
UTC = "2026-07-10T10:34:56.123456Z"


def test_response_timestamp_inventory_preserves_instant_and_rejects_naive():
    found = set()
    for path in (Path(__file__).parents[1] / "src/server/schemas").glob("*.py"):
        module = importlib.import_module(f"server.schemas.{path.stem}")
        for _, cls in inspect.getmembers(module, inspect.isclass):
            if not issubclass(cls, BaseModel) or cls.__module__ != module.__name__:
                continue
            # Timestamp input extras are intentionally not declared/validated.
            for name, field in cls.model_fields.items():
                if name not in STAMP_NAMES or field.annotation is None:
                    continue
                adapter = TypeAdapter(field.rebuild_annotation())
                value = adapter.validate_python(OFFSET)
                assert adapter.dump_python(value, mode="json") == UTC, (cls.__name__, name)
                with pytest.raises(ValidationError):
                    adapter.validate_python("2026-07-10T12:34:56")
                found.add(f"{cls.__name__}.{name}")
    assert {
        "DocumentRead.collected_at",
        "SnapshotProvenanceRead.collected_at",
        "TopologyRead.updated_at",
        "CognitionFabricNodeHeartbeatResponse.last_seen",
        "CognitionFabricNodeTopology.created_at",
        "AuditCfnEventResponse.created_on",
        "CognitionEngineAssociateResponse.created_at",
        "WorkspaceDetail.created_at",
        "User.created_at",
        "MultiAgenticSystem.updated_at",
    } <= found
    assert TypeAdapter(UtcDateTime | None).dump_python(None, mode="json") is None
    assert utc_now().tzinfo is timezone.utc
    with pytest.raises(ValueError, match="timezone"):
        format_utc(datetime(2026, 1, 1))


def _assert_receipts(payload):
    assert payload["created_at"].endswith("Z")
    assert payload["updated_at"].endswith("Z")
    assert payload["documentation"][0]["collected_at"].endswith("Z")
    assert payload["agents"][0]["agent_descriptions"][0]["collected_at"].endswith("Z")
    assert payload["topologies"][0]["updated_at"].endswith("Z")
    assert payload["tools"][0]["provenance"]["collected_at"].endswith("Z")
    assert payload["mcp_servers"][0]["tools"][0]["provenance"]["collected_at"].endswith("Z")


def test_public_nested_reads_config_and_disabled_cache_oneoff(client, created_cfn):
    workspace_id, cfn_id = created_cfn
    body = rich_request()
    body["documentation"][0].update(collected_at="client-time", provenance={"collected_at": "opaque"})
    body["mcp_servers"][0]["tools"][0]["definition"]["collected_at"] = "opaque-tool"
    path = create(client, workspace_id, body)
    saved = read(client, path)
    _assert_receipts(saved)
    assert saved["documentation"][0]["provenance"]["collected_at"] == "opaque"
    assert saved["tools"][0]["source_snapshot"]["collected_at"] == "opaque-tool"
    db = RelationalDB()
    with db.get_session() as session:
        original = session.get(MultiAgenticSystem, saved["id"])
        freshness = original.updated_at
        business = original.documentation
        row = session.get(CognitionFabricNode, cfn_id)
        row.enabled = False
        row.status = "offline"
        row.config = {"config_version": row.config_version, "workspaces": []}
        archived = CognitionFabricNode(
            id=str(uuid4()), name="Archived", deleted_at=utc_now(), config_version=7, config={"opaque": "preserved"}
        )
        ce = CognitionEngine(
            id="utc-ce",
            cfn_id=cfn_id,
            name="UTC CE",
            version="1",
            ce_type="CASA",
            health_url="http://utc-ce:8080",
            health_endpoint="/healthz",
            last_seen=TypeAdapter(UtcDateTime).validate_python(OFFSET),
            mas_config={"timestamp": "CE-opaque"},
        )
        session.add(ce)
        session.flush()
        session.add(MasCognitionEngine(mas_id=saved["id"], ce_id=ce.id, mas_config={"timestamp": "opaque-association"}))
        session.add(archived)
        archived_id = archived.id
        session.commit()
    active = client.post(
        "/api/cognition-fabric-nodes/register",
        json={
            "name": "Active UTC peer",
            "cfn_config": {},
            "ip_address": "192.168.1.101",
            "port": 8080,
        },
    )
    assert active.status_code == 201, active.text
    assert regenerate_and_check(db) == 2
    with db.get_session() as session:
        assert session.get(MultiAgenticSystem, saved["id"]).updated_at == freshness
        assert session.get(MultiAgenticSystem, saved["id"]).documentation == business
        snapshot = session.get(CognitionFabricNode, cfn_id).config["workspaces"][0]["multi_agentic_systems"][0]
        _assert_receipts(snapshot)
        assert snapshot["last_updated_on"] == format_utc(freshness)
        assert snapshot["cognition_engines"][0]["id"] == "utc-ce"
        assert snapshot["cognition_engines"][0]["mas_config"] == {"timestamp": "opaque-association"}
        assert session.get(CognitionEngine, "utc-ce").mas_config == {"timestamp": "CE-opaque"}
        assert session.get(CognitionFabricNode, archived_id).config == {"opaque": "preserved"}
        assert session.get(CognitionFabricNode, archived_id).config_version == 7
        assert session.scalar(sa.text("SHOW TimeZone")) == "UTC"
    topology = client.get("/api/cognition-fabric")
    assert topology.status_code == 200, topology.text
    for node in topology.json()["cognition_fabric_nodes"]:
        assert node["created_at"].endswith("Z") and node["last_seen"].endswith("Z")
    from server.services.cognition_engine import cognition_engine_service

    engines = cognition_engine_service.list_for_cfn(cfn_id)
    assert engines[0]["last_seen"] == UTC
    response = client.get(f"/api/cognition-fabric-nodes/{cfn_id}")
    assert response.status_code == 200
    assert response.json()["config"]["workspaces"][0]["multi_agentic_systems"][0] == snapshot
    with pytest.raises(RuntimeError, match=cfn_id):
        regenerate_and_check(db, SimpleNamespace(update_config_for_all_cfns=lambda: None))
    from server.services.cognition_fabric_node import cognition_fabric_node_service as service

    with patch.object(
        service,
        "generate_config",
        side_effect=lambda cfn_id, workspaces, config, version: {
            "config_version": version,
            "workspaces": [],
            "cognition_engines": [],
        },
    ):
        with pytest.raises(RuntimeError, match=cfn_id):
            regenerate_and_check(db)


def test_oneoff_requires_explicit_target_database(monkeypatch):
    monkeypatch.delenv("POSTGRES_DB", raising=False)
    with pytest.raises(RuntimeError, match="Explicit target database settings required: POSTGRES_DB"):
        main()


def test_audit_output_preserves_ce_evidence():
    from server.schemas.audit_cfn_event import AuditCfnEventResponse

    user_id = str(uuid4())
    opaque = {"timestamp": "CE-local-time", "details": {"created_at": "not-a-date"}}
    event = AuditCfnEventResponse(
        id=user_id,
        created_by=user_id,
        last_modified_by=user_id,
        resource_type="COGNITION_ENGINE",
        resource_identifier="ce",
        audit_type="CE_INVOKED",
        audit_resource_identifier="mas",
        created_on=OFFSET,
        last_modified_on=OFFSET,
        audit_information=opaque,
    )
    payload = event.model_dump(mode="json")
    assert payload["created_on"] == payload["last_modified_on"] == UTC
    assert payload["audit_information"] == opaque


def test_diagnostics_returns_z():
    import asyncio
    import json
    from server.diagnostics import ioc_health

    response = asyncio.run(ioc_health())
    assert json.loads(response.body)["last_updated"].endswith("Z")
