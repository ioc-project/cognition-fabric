# Copyright 2026 Cisco Systems, Inc. and its affiliates
#
# SPDX-License-Identifier: Apache-2.0

"""Authentication endpoints"""

from fastapi import APIRouter, status

from server.schemas.auth import (
    LoginRequest,
    SignupRequest,
    TokenResponse,
)
from server.services.auth import auth_service

router = APIRouter()


@router.post("/signup", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
def signup(signup_data: SignupRequest):
    """
    Register a new user account.

    - **username**: Desired username (3-100 characters, alphanumeric with hyphens and underscores)
    - **email**: Email address
    - **password**: Password (minimum 8 characters)
    - **domain**: User domain (optional, default: ioc.local)
    - **role**: User role (optional, default: user)

    Returns JWT access token, refresh token, and user information
    """
    return auth_service.signup(
        username=signup_data.username,
        email=signup_data.email,
        password=signup_data.password,
        domain=signup_data.domain,
        role=signup_data.role,
    )


@router.post("/login", response_model=TokenResponse, status_code=status.HTTP_200_OK)
def login(login_data: LoginRequest):
    """
    Authenticate user with username and password, return JWT tokens.

    - **username**: User's username
    - **password**: User's password

    Returns JWT access token (1 hour) and refresh token (7 days)
    """
    return auth_service.login(login_data.username, login_data.password)
