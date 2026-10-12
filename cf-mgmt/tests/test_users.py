# Copyright 2026 Cisco Systems, Inc. and its affiliates
#
# SPDX-License-Identifier: Apache-2.0

"""
Tests for user management endpoints and services.
"""
import pytest
from fastapi.testclient import TestClient

from server.database.relational_db.db import RelationalDB
from server.database.relational_db.models.user import User as UserModel
from server.main import app


@pytest.fixture
def unauthenticated_client(setup_test_environment):
    """Create a test client without authentication headers."""
    return TestClient(app)


class TestUserSignup:
    """Test cases for user sign-up functionality."""

    def test_signup_with_valid_data(self, unauthenticated_client):
        """Test successful user sign-up with valid data."""
        response = unauthenticated_client.post("/api/auth/signup", json={
            "username": "newuser",
            "email": "newuser@example.com",
            "password": "SecurePassword123",
        })

        assert response.status_code == 201
        data = response.json()

        # Verify response structure
        assert "access_token" in data
        assert "refresh_token" in data
        assert data["token_type"] == "bearer"
        assert "user" in data

        # Verify user data
        user = data["user"]
        assert user["username"] == "newuser"
        assert user["email"] == "newuser@example.com"
        assert user["domain"] == "ioc.local"  # default domain
        assert user["role"] == "admin"  # default role
        assert "id" in user

    def test_signup_with_custom_domain_and_role(self, unauthenticated_client):
        """Test sign-up with custom domain and role."""
        response = unauthenticated_client.post("/api/auth/signup", json={
            "username": "customuser",
            "email": "customuser@example.com",
            "password": "SecurePassword123",
            "domain": "custom.domain",
            "role": "admin",
        })

        assert response.status_code == 201
        data = response.json()
        user = data["user"]

        assert user["username"] == "customuser"
        assert user["domain"] == "custom.domain"
        assert user["role"] == "admin"

    def test_signup_with_duplicate_username(self, unauthenticated_client):
        """Test sign-up with a username that already exists."""
        # First signup
        response1 = unauthenticated_client.post("/api/auth/signup", json={
            "username": "duplicateuser",
            "email": "first@example.com",
            "password": "SecurePassword123",
        })
        assert response1.status_code == 201

        # Attempt duplicate signup
        response2 = unauthenticated_client.post("/api/auth/signup", json={
            "username": "duplicateuser",
            "email": "second@example.com",
            "password": "SecurePassword123",
        })

        assert response2.status_code == 409
        assert "already taken" in response2.json()["detail"]

    def test_signup_with_invalid_username_format(self, unauthenticated_client):
        """Test sign-up with invalid username format (special characters)."""
        response = unauthenticated_client.post("/api/auth/signup", json={
            "username": "user@#$%",
            "email": "invalid@example.com",
            "password": "SecurePassword123",
        })

        assert response.status_code == 422  # Validation error

    def test_signup_with_username_too_short(self, unauthenticated_client):
        """Test sign-up with username shorter than minimum length."""
        response = unauthenticated_client.post("/api/auth/signup", json={
            "username": "ab",  # Less than 3 characters
            "email": "short@example.com",
            "password": "SecurePassword123",
        })

        assert response.status_code == 422  # Validation error

    def test_signup_with_username_too_long(self, unauthenticated_client):
        """Test sign-up with username longer than maximum length."""
        response = unauthenticated_client.post("/api/auth/signup", json={
            "username": "a" * 101,  # More than 100 characters
            "email": "long@example.com",
            "password": "SecurePassword123",
        })

        assert response.status_code == 422  # Validation error

    def test_signup_with_invalid_email(self, unauthenticated_client):
        """Test sign-up with invalid email format."""
        response = unauthenticated_client.post("/api/auth/signup", json={
            "username": "newuser",
            "email": "invalid-email",  # Invalid email format
            "password": "SecurePassword123",
        })

        assert response.status_code == 422  # Validation error

    def test_signup_with_weak_password(self, unauthenticated_client):
        """Test sign-up with password shorter than minimum length."""
        response = unauthenticated_client.post("/api/auth/signup", json={
            "username": "newuser",
            "email": "newuser@example.com",
            "password": "weak",  # Less than 8 characters
        })

        assert response.status_code == 422  # Validation error

    def test_signup_missing_required_field(self, unauthenticated_client):
        """Test sign-up with missing required field."""
        response = unauthenticated_client.post("/api/auth/signup", json={
            "username": "newuser",
            # Missing email
            "password": "SecurePassword123",
        })

        assert response.status_code == 422  # Validation error

    def test_signup_user_can_login_after_registration(self, unauthenticated_client):
        """Test that newly signed-up user can log in."""
        # Sign up
        signup_response = unauthenticated_client.post("/api/auth/signup", json={
            "username": "testlogin",
            "email": "testlogin@example.com",
            "password": "SecurePassword123",
        })
        assert signup_response.status_code == 201

        # Login with same credentials
        login_response = unauthenticated_client.post("/api/auth/login", json={
            "username": "testlogin",
            "password": "SecurePassword123",
        })

        assert login_response.status_code == 200
        login_data = login_response.json()
        assert login_data["user"]["username"] == "testlogin"

    def test_signup_returns_valid_tokens(self, unauthenticated_client):
        """Test that signup returns valid access and refresh tokens."""
        response = unauthenticated_client.post("/api/auth/signup", json={
            "username": "tokenuser",
            "email": "tokenuser@example.com",
            "password": "SecurePassword123",
        })

        assert response.status_code == 201
        data = response.json()
        access_token = data["access_token"]

        # Use the access token to access a protected endpoint
        protected_response = unauthenticated_client.get(
            "/api/workspaces/",
            headers={"Authorization": f"Bearer {access_token}"}
        )

        assert protected_response.status_code == 200

    def test_signup_with_hyphens_in_username(self, unauthenticated_client):
        """Test sign-up with valid username containing hyphens."""
        response = unauthenticated_client.post("/api/auth/signup", json={
            "username": "user-with-hyphens",
            "email": "hyphen@example.com",
            "password": "SecurePassword123",
        })

        assert response.status_code == 201
        assert response.json()["user"]["username"] == "user-with-hyphens"

    def test_signup_with_underscores_in_username(self, unauthenticated_client):
        """Test sign-up with valid username containing underscores."""
        response = unauthenticated_client.post("/api/auth/signup", json={
            "username": "user_with_underscores",
            "email": "underscore@example.com",
            "password": "SecurePassword123",
        })

        assert response.status_code == 201
        assert response.json()["user"]["username"] == "user_with_underscores"


class TestGetUserById:
    """Test cases for user data in signup response."""

    def test_signup_response_contains_user_info(self, unauthenticated_client):
        """Test that signup response includes user information."""
        response = unauthenticated_client.post("/api/auth/signup", json={
            "username": "responseuser",
            "email": "response@example.com",
            "password": "SecurePassword123",
        })

        assert response.status_code == 201
        user = response.json()["user"]
        assert user["id"]
        assert user["username"] == "responseuser"
        assert user["email"] == "response@example.com"
        assert user["domain"] == "ioc.local"
        assert user["role"] == "admin"


class TestLoginWithSignedUpUser:
    """Test cases for login with signed-up users."""

    def test_login_after_signup(self, unauthenticated_client):
        """Test that signed-up user can log in immediately."""
        # Sign up
        signup_response = unauthenticated_client.post("/api/auth/signup", json={
            "username": "immediateclogin",
            "email": "immediate@example.com",
            "password": "SecurePassword123",
        })
        assert signup_response.status_code == 201

        # Login
        login_response = unauthenticated_client.post("/api/auth/login", json={
            "username": "immediateclogin",
            "password": "SecurePassword123",
        })

        assert login_response.status_code == 200
        login_data = login_response.json()
        assert login_data["user"]["username"] == "immediateclogin"

    def test_login_with_wrong_password_after_signup(self, unauthenticated_client):
        """Test login fails with wrong password for signed-up user."""
        # Sign up
        unauthenticated_client.post("/api/auth/signup", json={
            "username": "wrongpwuser",
            "email": "wrongpw@example.com",
            "password": "SecurePassword123",
        })

        # Try login with wrong password
        login_response = unauthenticated_client.post("/api/auth/login", json={
            "username": "wrongpwuser",
            "password": "WrongPassword123",
        })

        assert login_response.status_code == 401

    def test_signup_creates_user_in_database(self, unauthenticated_client):
        """Test that signup actually creates user in database."""
        # Sign up
        signup_response = unauthenticated_client.post("/api/auth/signup", json={
            "username": "dbuser",
            "email": "db@example.com",
            "password": "SecurePassword123",
        })
        new_user_id = signup_response.json()["user"]["id"]

        # Query database
        db = RelationalDB()
        session = db.get_session()
        try:
            user = session.query(UserModel).filter(
                UserModel.id == new_user_id,
                UserModel.deleted_at.is_(None)
            ).first()

            assert user is not None
            assert str(user.username) == "dbuser"
            assert str(user.domain) == "ioc.local"
            assert str(user.role) == "admin"
        finally:
            session.close()


class TestUserData:
    """Test cases for user data validation and structure."""

    def test_user_has_unique_id(self, unauthenticated_client):
        """Test that each user gets a unique ID."""
        ids = set()
        for i in range(3):
            response = unauthenticated_client.post("/api/auth/signup", json={
                "username": f"uniqueuser{i}",
                "email": f"unique{i}@example.com",
                "password": "SecurePassword123",
            })
            user_id = response.json()["user"]["id"]
            ids.add(user_id)

        # All IDs should be unique
        assert len(ids) == 3

    def test_user_timestamps_valid(self, unauthenticated_client):
        """Test that user data is returned from signup."""
        response = unauthenticated_client.post("/api/auth/signup", json={
            "username": "timestampuser",
            "email": "timestamp@example.com",
            "password": "SecurePassword123",
        })

        user = response.json()["user"]
        assert "id" in user
        assert "username" in user
        assert "email" in user
        assert "domain" in user
        assert "role" in user

    def test_default_role_is_user(self, unauthenticated_client):
        """Test that default role is 'admin' when not specified."""
        response = unauthenticated_client.post("/api/auth/signup", json={
            "username": "defaultroleuser",
            "email": "defaultrole@example.com",
            "password": "SecurePassword123",
        })

        assert response.json()["user"]["role"] == "admin"

    def test_default_domain_is_ioc_local(self, unauthenticated_client):
        """Test that default domain is 'ioc.local' when not specified."""
        response = unauthenticated_client.post("/api/auth/signup", json={
            "username": "defaultdomainuser",
            "email": "defaultdomain@example.com",
            "password": "SecurePassword123",
        })

        assert response.json()["user"]["domain"] == "ioc.local"
