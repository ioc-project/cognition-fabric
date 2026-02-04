import {apiClient} from '../client';
import type {ListWorkspaceMembersResponse, UpdateMemberRoleRequest, WorkspaceMember} from '../types/member';

export const memberApi = {
  list: async (workspaceId: string): Promise<ListWorkspaceMembersResponse> => {
    const {data, error} = await apiClient.GET('/api/workspaces/{workspace_id}/members', {
      params: {
        path: {workspace_id: workspaceId}
      }
    });

    if (error) throw error;
    return data;
  },

  updateRole: async (workspaceId: string, memberId: string, data: UpdateMemberRoleRequest): Promise<WorkspaceMember> => {
    const {data: response, error} = await apiClient.PUT('/api/workspaces/{workspace_id}/members/{user_id}', {
      params: {
        path: {workspace_id: workspaceId, user_id: memberId}
      },
      body: data
    });

    if (error) throw error;
    return response;
  },

  remove: async (workspaceId: string, memberId: string): Promise<void> => {
    const {error} = await apiClient.DELETE('/api/workspaces/{workspace_id}/members/{user_id}', {
      params: {
        path: {workspace_id: workspaceId, user_id: memberId}
      }
    });

    if (error) throw error;
  }
};
