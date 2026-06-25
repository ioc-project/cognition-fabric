// Copyright 2026 Cisco Systems, Inc. and its affiliates
//
// SPDX-License-Identifier: Apache-2.0

import {apiClient} from '../client';
import type {ListWorkspaceMembersResponse, UpdateMemberRoleRequest, WorkspaceMember} from '../types/member';

export const memberApi = {
  list: async (workspaceId: string): Promise<ListWorkspaceMembersResponse> => {
    const {data, error} = await apiClient.GET(
      '/api/workspaces/{workspace_id}/members' as any,
      {
        params: {
          path: {workspace_id: workspaceId}
        }
      } as any
    );

    if (error) {
      throw error;
    }
    return data as ListWorkspaceMembersResponse;
  },

  updateRole: async (workspaceId: string, memberId: string, data: UpdateMemberRoleRequest): Promise<WorkspaceMember> => {
    const {data: response, error} = await apiClient.PUT(
      '/api/workspaces/{workspace_id}/members/{user_id}' as any,
      {
        params: {
          path: {workspace_id: workspaceId, user_id: memberId}
        },
        body: data
      } as any
    );

    if (error) {
      throw error;
    }
    return response as WorkspaceMember;
  },

  remove: async (workspaceId: string, memberId: string): Promise<void> => {
    const {error} = await apiClient.DELETE(
      '/api/workspaces/{workspace_id}/members/{user_id}' as any,
      {
        params: {
          path: {workspace_id: workspaceId, user_id: memberId}
        }
      } as any
    );

    if (error) {
      throw error;
    }
  }
};
