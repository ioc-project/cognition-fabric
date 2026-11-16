# Copyright 2026 Cisco Systems, Inc. and its affiliates
# SPDX-License-Identifier: Apache-2.0

"""Round-trip provenance and nonblocking, consistent MAS reads on real Postgres."""

import copy
import logging
from concurrent.futures import ThreadPoolExecutor
from threading import Event, get_ident
from unittest.mock import patch

import pytest
from sqlalchemy import event, text

from server.database.relational_db.db import RelationalDB
from server.database.relational_db.models.cognition_fabric_node import CognitionFabricNode
from server.schemas.mas_metadata import DocumentSnapshot
from server.schemas.multi_agentic_system import MultiAgenticSystemUpdate
from server.services.mas_metadata import lock_mas, snapshot_documents
from server.services.multi_agentic_system import multi_agentic_system_service
from tests.test_cognition_engines import _register
from tests.test_mas_metadata import create, read, rich_request


def disable_cfn(cfn_id):
    with RelationalDB().get_session() as session:
        session.query(CognitionFabricNode).filter_by(id=cfn_id).one().enabled = False
        session.commit()


@pytest.mark.parametrize("operation", ["create", "update"])
def test_inactive_cfn_skips_auto_attachment_but_preserves_onboarding(client, created_cfn, caplog, operation):
    workspace_id, cfn_id = created_cfn
    collection = f"/api/workspaces/{workspace_id}/multi-agentic-systems"
    path = create(client, workspace_id) if operation == "update" else None
    ce_id = _register(client, cfn_id, mas_auto_associate=True)
    disable_cfn(cfn_id)

    with caplog.at_level(logging.WARNING, logger="server.services.cognition_engine"):
        if operation == "create":
            path = create(client, workspace_id)
        else:
            response = client.put(path, json={"description": "Updated while inactive"})
            assert response.status_code == 200, response.text
    saved = read(client, path)
    assert saved["cognition_engines"] == []
    assert saved["tools"] and saved["topologies"]
    assert "Skipping automatic CE attachment" in caplog.text
    assert cfn_id in caplog.text

    # Explicit requests still fail, and must roll back any accompanying edits.
    response = client.put(path, json={"description": "Must roll back", "cognition_engine_ids": [ce_id]})
    assert response.status_code == 404, response.text
    assert read(client, path) == saved
    response = client.post(collection, json={"name": "Explicit inactive", "cognition_engine_ids": [ce_id]})
    assert response.status_code == 404, response.text
    assert len(read(client, collection)["systems"]) == 1


def test_get_does_not_wait_for_uncommitted_writer_and_does_not_leak_readonly_state(client, created_workspace):
    path = create(client, created_workspace)
    before = read(client, path)
    mas_id = before["id"]
    writer = RelationalDB().get_session()
    try:
        mas = lock_mas(writer, mas_id)
        mas.description = "Uncommitted"
        writer.flush()
        with ThreadPoolExecutor(1) as pool:
            result = pool.submit(multi_agentic_system_service.get, created_workspace, mas_id)
            try:
                # FOR SHARE would wait here until the writer below releases its lock.
                snapshot = result.result(timeout=2)
                assert snapshot.model_dump(mode="json") == before
            finally:
                writer.rollback()
    finally:
        writer.close()

    assert client.put(path, json={"description": "Committed after read"}).status_code == 200
    with RelationalDB().get_session() as session:
        assert session.execute(text("SHOW transaction_read_only")).scalar() == "off"
        assert session.execute(text("SHOW transaction_isolation")).scalar() == "read committed"


def test_get_keeps_one_committed_snapshot_when_inventories_change_between_queries(client, created_workspace):
    path = create(client, created_workspace)
    before = read(client, path)
    mas_id = before["id"]
    parent_read = Event()
    resume = Event()
    reader_thread = []
    flags = []

    def after_query(connection, cursor, statement, parameters, context, executemany):
        if not reader_thread or get_ident() != reader_thread[0] or parent_read.is_set():
            return
        if "FROM multi_agentic_system" not in statement:
            return
        # Inspect actual database characteristics, not just requested execution options.
        with connection.connection.driver_connection.cursor() as state:
            state.execute("SHOW transaction_isolation")
            isolation = state.fetchone()[0]
            state.execute("SHOW transaction_read_only")
            flags.append((isolation, state.fetchone()[0]))
        parent_read.set()
        assert resume.wait(5)

    def fetch():
        reader_thread.append(get_ident())
        return multi_agentic_system_service.get(created_workspace, mas_id)

    engine = RelationalDB().engine
    event.listen(engine, "after_cursor_execute", after_query)
    try:
        with ThreadPoolExecutor(1) as pool:
            result = pool.submit(fetch)
            try:
                assert parent_read.wait(5)
                multi_agentic_system_service.update(
                    created_workspace,
                    mas_id,
                    MultiAgenticSystemUpdate(
                        description="New snapshot", agents=[], tools=[], mcp_servers=[], topologies=[]
                    ),
                )
            finally:
                resume.set()
            assert result.result(timeout=5).model_dump(mode="json") == before
    finally:
        resume.set()
        event.remove(engine, "after_cursor_execute", after_query)
    assert flags == [("repeatable read", "on")]
    after = read(client, path)
    assert after["description"] == "New snapshot"
    assert after["agents"] == after["tools"] == after["topologies"] == after["mcp_servers"] == []


def writable_document(value):
    return {
        k: copy.deepcopy(v)
        for k, v in value.items()
        if k not in {"content_hash", "collected_at", "resolution_state", "support_state"}
    }


def test_reordered_unchanged_document_and_agent_snapshots_keep_collection_times(client, created_workspace):
    body = rich_request()
    body["documentation"].append({"source_url": "https://example.invalid/reference", "provenance": {"owner": "same"}})
    with patch("server.services.mas_metadata.stamp", return_value="2026-11-01T12:00:00Z"):
        path = create(client, created_workspace, body)
    before = read(client, path)
    supplied_docs = [writable_document(item) for item in reversed(before["documentation"])]
    supplied_cards = [writable_document(item) for item in reversed(before["agents"][0]["agent_descriptions"])]
    with patch("server.services.mas_metadata.stamp", return_value="2026-11-09T12:00:00Z"):
        response = client.put(
            path,
            json={
                "documentation": supplied_docs,
                "agents": [{"agent_id": "a", "name": "New display name", "agent_descriptions": supplied_cards}],
            },
        )
    assert response.status_code == 200, response.text
    after = response.json()
    assert after["documentation"] == list(reversed(before["documentation"]))
    assert after["agents"][0]["agent_descriptions"] == list(reversed(before["agents"][0]["agent_descriptions"]))
    assert after["agents"][0]["name"] == "New display name"
    assert after["topologies"] == before["topologies"]


@pytest.mark.parametrize(
    "field,value",
    [
        ("content", {"changed": True}),
        ("source_url", "https://example.invalid/new-source"),
        ("source", {"type": "agntcy-directory", "directory_id": "dir", "record_cid": "changed-cid"}),
        ("format", "future"),
        ("spec_version", "2.0"),
        ("schema_version", "2.0"),
        ("provenance", {"owner": "new-owner"}),
        ("media_type", "text/plain"),
        ("x-extension", "changed"),
    ],
)
def test_meaningfully_changed_document_snapshots_get_new_collection_times(client, created_workspace, field, value):
    document = {
        "content": {"skills": []},
        "source_url": "https://example.invalid/source",
        "source": {"type": "agntcy-directory", "directory_id": "dir", "record_cid": "cid"},
        "format": "a2a",
        "spec_version": "1.0.1",
        "schema_version": "1.0.0",
        "provenance": {"owner": "provider"},
        "media_type": "application/json",
        "x-extension": "original",
    }
    body = rich_request()
    body["documentation"] = [document]
    body["agents"][0]["agent_descriptions"] = [document]
    with patch("server.services.mas_metadata.stamp", return_value="2026-11-01T12:00:00Z"):
        path = create(client, created_workspace, body)
    before = read(client, path)
    edited = {**copy.deepcopy(document), field: value}
    with patch("server.services.mas_metadata.stamp", return_value="2026-11-09T12:00:00Z"):
        response = client.put(
            path, json={"documentation": [edited], "agents": [{"agent_id": "a", "agent_descriptions": [edited]}]}
        )
    assert response.status_code == 200, response.text
    after = response.json()
    for item in (after["documentation"][0], after["agents"][0]["agent_descriptions"][0]):
        assert item[field] == value
        assert item["collected_at"] == "2026-11-09T12:00:00Z"
        if field == "content":
            assert item["content_hash"] != before["documentation"][0]["content_hash"]
        else:
            assert item["content_hash"] == before["documentation"][0]["content_hash"]


def test_duplicate_documents_consume_distinct_previous_times_and_ignore_incoming_bookkeeping():
    first = {"content": "duplicate", "collected_at": "2026-11-01T12:00:00Z"}
    second = {"content": "different", "collected_at": "2026-11-02T12:00:00Z"}
    third = {"content": "duplicate", "collected_at": "2026-11-03T12:00:00Z"}
    entries = [
        DocumentSnapshot(content="duplicate", collected_at="client-time", content_hash="fake"),
        DocumentSnapshot(content="duplicate"),
        DocumentSnapshot(content="different"),
    ]
    result = snapshot_documents(entries, previous=[first, second, third])
    assert [item["collected_at"] for item in result] == [
        first["collected_at"],
        third["collected_at"],
        second["collected_at"],
    ]
    assert result[0]["content_hash"] != "fake"
    assert snapshot_documents([], previous=[first, second, third]) == []
