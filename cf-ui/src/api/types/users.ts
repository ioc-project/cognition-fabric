// Copyright 2026 Cisco Systems, Inc. and its affiliates
//
// SPDX-License-Identifier: Apache-2.0

export interface UserListItem {
  id: string;
  username: string;
  email?: string;
  name?: string;
  role?: string;
  created_at?: string;
}

export interface ListUsersResponse {
  users: UserListItem[];
  total?: number;
}
