import {fetchAPI} from '../client';
import type {ListWorkspaceMembersResponse, UpdateMemberRoleRequest, WorkspaceMember} from '../types/member';

export const memberApi = {
  list: async (workspaceId: string): Promise<ListWorkspaceMembersResponse> => {
    return fetchAPI(`/api/workspaces/${workspaceId}/members`);
  },

  updateRole: async (workspaceId: string, memberId: string, data: UpdateMemberRoleRequest): Promise<WorkspaceMember> => {
    return fetchAPI(`/api/workspaces/${workspaceId}/members/${memberId}`, {
      method: 'PATCH',
      body: JSON.stringify(data)
    });
  },

  remove: async (workspaceId: string, memberId: string): Promise<void> => {
    await fetchAPI(`/api/workspaces/${workspaceId}/members/${memberId}`, {
      method: 'DELETE'
    });
  }
};
