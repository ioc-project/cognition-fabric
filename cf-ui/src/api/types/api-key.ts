// Copyright 2026 Cisco Systems, Inc. and its affiliates
//
// SPDX-License-Identifier: Apache-2.0

export interface ApiKey {
  id: string;
  key_name: string;
  name?: string;
  key_preview?: string;
  roles: string[];
  users: string[];
  created_at: string;
  created_by?: string | null;
  expires_at?: string | null;
}

export interface CreateApiKeyRequest {
  key_name: string;
  name?: string;
  roles?: string[];
  users?: string[];
  expires_at?: string | null;
}

export interface CreateApiKeyResponse {
  id: string;
  key_name: string;
  api_key: string;
  key?: string;
  roles: string[];
  users: string[];
  created_at: string;
  expires_at?: string | null;
}

export interface ListApiKeysResponse {
  api_keys: ApiKey[];
  total?: number;
}

export interface IamUser {
  user_id: string;
  username: string;
}

export interface IamUsersResponse {
  users: IamUser[];
  total?: number;
}
