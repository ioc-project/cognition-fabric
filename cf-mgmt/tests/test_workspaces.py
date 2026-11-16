# Copyright 2026 Cisco Systems, Inc. and its affiliates
#
# SPDX-License-Identifier: Apache-2.0

"""
Tests for workspace endpoints in cf-mgmt.
"""
import uuid

import pytest
from fastapi.testclient import TestClient

from server.database.relational_db.db import RelationalDB
from server.database.relational_db.models.user import User
from server.main import app


class TestWorkspaceEndpoints:
    """Test cases for workspace management endpoints."""

    def test_create_workspace_success(self, client, sample_workspace_data):
        """Test successful workspace creation."""
        response = client.post("/api/workspaces/create", json=sample_workspace_data)

        assert response.status_code == 201
        data = response.json()
        assert "id" in data
        assert isinstance(data["id"], str)
        import uuid

        uuid.UUID(data["id"])

    def test_create_workspace_invalid_data(self, client):
        """Test workspace creation with invalid data."""
        response = client.post("/api/workspaces/create", json={})
        assert response.status_code == 422

        response = client.post("/api/workspaces/create", json={"name": ""})
        assert response.status_code == 422

    def test_create_workspace_invalid_json(self, client):
        """Test workspace creation with invalid JSON."""
        response = client.post("/api/workspaces/create", content="invalid json", headers={"Content-Type": "application/json"})
        assert response.status_code == 422

    def test_list_workspaces_empty(self, client):
        """Test listing workspaces when none exist."""
        response = client.get("/api/workspaces/list")

        assert response.status_code == 200
        data = response.json()
        assert "workspaces" in data
        assert data["workspaces"] == []

    def test_list_workspaces_with_data(self, client, sample_workspace_data):
        """Test listing workspaces after creating some."""
        create_response = client.post("/api/workspaces/create", json=sample_workspace_data)
        assert create_response.status_code == 201
        workspace_id = create_response.json()["id"]

        list_response = client.get("/api/workspaces/list")
        assert list_response.status_code == 200

        data = list_response.json()
        assert "workspaces" in data
        assert len(data["workspaces"]) == 1

        workspace = data["workspaces"][0]
        assert workspace["id"] == workspace_id
        assert workspace["name"] == sample_workspace_data["name"]
        assert "created_at" in workspace

    def test_list_workspaces_multiple(self, client, registered_cfn):
        """Test listing multiple workspaces."""
        workspaces_data = [
            {"name": "Workspace 1", "cfn_id": registered_cfn},
            {"name": "Workspace 2", "cfn_id": registered_cfn},
            {"name": "Workspace 3", "cfn_id": registered_cfn},
        ]

        created_ids = []
        for ws_data in workspaces_data:
            response = client.post("/api/workspaces/create", json=ws_data)
            assert response.status_code == 201
            created_ids.append(response.json()["id"])

        response = client.get("/api/workspaces/list")
        assert response.status_code == 200

        data = response.json()
        assert len(data["workspaces"]) == 3

        returned_ids = [ws["id"] for ws in data["workspaces"]]
        for created_id in created_ids:
            assert created_id in returned_ids

    def test_get_workspace_by_id(self, client, created_workspace, sample_workspace_data):
        """Test getting a specific workspace by ID."""
        response = client.get(f"/api/workspaces/{created_workspace}")

        assert response.status_code == 200
        data = response.json()
        assert data["id"] == created_workspace
        assert data["name"] == sample_workspace_data["name"]
        assert "created_at" in data

    def test_get_workspace_not_found(self, client):
        """Test getting a workspace that doesn't exist."""
        fake_id = "00000000-0000-0000-0000-000000000000"
        response = client.get(f"/api/workspaces/{fake_id}")

        assert response.status_code == 404

    def test_get_workspace_invalid_id(self, client):
        """Test getting a workspace with invalid ID format."""
        response = client.get("/api/workspaces/invalid-id")

        assert response.status_code == 404

    def test_delete_workspace_blocked_then_succeeds(self, client, sample_workspace_data):
        """Workspace delete should be blocked with dependents, then succeed after cleanup."""
        ws_resp = client.post("/api/workspaces/create", json=sample_workspace_data)
        assert ws_resp.status_code == 201
        workspace_id = ws_resp.json()["id"]

        mas_data = {
            "name": "WS-Del Test MAS",
            "description": "",
            "agents": [{"agent_id": "a1", "config": {"type": "t"}}],
            "config": {},
        }
        mas_resp = client.post(f"/api/workspaces/{workspace_id}/multi-agentic-systems", json=mas_data)
        assert mas_resp.status_code == 201
        mas_id = mas_resp.json()["id"]

        # Attempt to delete workspace should be blocked (409) due to dependents
        del_ws_resp_blocked = client.delete(f"/api/workspaces/{workspace_id}")
        assert del_ws_resp_blocked.status_code == 409
        assert "Workspace has dependent objects" in del_ws_resp_blocked.json()["detail"]

        # Delete dependents first
        del_mas_resp = client.delete(f"/api/workspaces/{workspace_id}/multi-agentic-systems/{mas_id}")
        assert del_mas_resp.status_code == 204

        # Workspace delete succeeds
        del_ws_resp_ok = client.delete(f"/api/workspaces/{workspace_id}")
        assert del_ws_resp_ok.status_code == 204

    def test_delete_default_workspace_public_forbidden(self, client, registered_cfn):
        """Public delete of Default Workspace should be forbidden (403)."""
        create_resp = client.post("/api/workspaces/create", json={"name": "Default Workspace", "cfn_id": registered_cfn})
        assert create_resp.status_code == 201
        default_ws_id = create_resp.json()["id"]

        # Attempt public delete
        del_resp = client.delete(f"/api/workspaces/{default_ws_id}")
        assert del_resp.status_code == 403
        assert del_resp.json()["detail"] == "Failed to delete workspace: Default Workspace cannot be deleted"

    def test_super_admin_can_see_all_workspaces(self, setup_test_environment):
        """Test that super_admin role can see all workspaces (future feature)."""
        from server.common import hash_password

        db = RelationalDB()
        session = db.session_factory()

        # Create a super_admin user
        super_admin_id = str(uuid.uuid4())
        super_admin = User(
            id=super_admin_id,
            username="superadmin",
            password=hash_password("password"),
            domain="test.local",
            role="super_admin",
        )
        session.add(super_admin)
        session.commit()

        # Create super_admin client
        super_admin_client = TestClient(app)

        # Create regular users
        user1_id = str(uuid.uuid4())
        user1 = User(
            id=user1_id,
            username="user1",
            password=hash_password("password1"),
            domain="test.local",
            role="admin",
        )
        session.add(user1)

        user2_id = str(uuid.uuid4())
        user2 = User(
            id=user2_id,
            username="user2",
            password=hash_password("password2"),
            domain="test.local",
            role="admin",
        )
        session.add(user2)
        session.commit()

        # Create clients for regular users
        user1_client = TestClient(app)
        user2_client = TestClient(app)

        # Create CFNs for each workspace
        user1_cfn_resp = user1_client.post("/api/cognition-fabric-nodes", json={"name": "user1-super-admin-cfn"})
        assert user1_cfn_resp.status_code == 201
        user1_cfn_id = user1_cfn_resp.json()["id"]

        user2_cfn_resp = user2_client.post("/api/cognition-fabric-nodes", json={"name": "user2-super-admin-cfn"})
        assert user2_cfn_resp.status_code == 201
        user2_cfn_id = user2_cfn_resp.json()["id"]

        # User1 creates a workspace
        user1_ws_resp = user1_client.post("/api/workspaces/create", json={"name": "User1 Workspace", "cfn_id": user1_cfn_id})
        assert user1_ws_resp.status_code == 201
        user1_ws_id = user1_ws_resp.json()["id"]

        # User2 creates a workspace
        user2_ws_resp = user2_client.post("/api/workspaces/create", json={"name": "User2 Workspace", "cfn_id": user2_cfn_id})
        assert user2_ws_resp.status_code == 201
        user2_ws_id = user2_ws_resp.json()["id"]

        # Super admin should see all workspaces without being a member
        super_admin_list_resp = super_admin_client.get("/api/workspaces/list")
        assert super_admin_list_resp.status_code == 200
        super_admin_workspaces = super_admin_list_resp.json()["workspaces"]
        assert len(super_admin_workspaces) == 2

        super_admin_ws_ids = {ws["id"] for ws in super_admin_workspaces}
        assert user1_ws_id in super_admin_ws_ids
        assert user2_ws_id in super_admin_ws_ids

        # Super admin should be able to access any workspace
        super_admin_get_resp = super_admin_client.get(f"/api/workspaces/{user1_ws_id}")
        assert super_admin_get_resp.status_code == 200
        assert super_admin_get_resp.json()["id"] == user1_ws_id

        session.close()
