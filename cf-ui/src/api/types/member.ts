// Copyright 2026 Cisco Systems, Inc. and its affiliates
//
// SPDX-License-Identifier: Apache-2.0

import type {components} from '../generated/schema';

export type WorkspaceMember = components['schemas']['WorkspaceMemberDetail'];
export type MemberRole = components['schemas']['WorkspaceRole'];

export interface ListWorkspaceMembersResponse {
  members: WorkspaceMember[];
  total: number;
}

export interface UpdateMemberRoleRequest {
  role: MemberRole;
}
