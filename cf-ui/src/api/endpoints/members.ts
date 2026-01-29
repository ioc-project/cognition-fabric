import {fetchAPI} from '../client';
import type {ListWorkspaceMembersResponse, UpdateMemberRoleRequest, WorkspaceMember} from '../types/member';
import {ListWorkspaceMembersResponseSchema, WorkspaceMemberSchema} from '../types/member';

export const memberApi = {
  list: async (workspaceId: string): Promise<ListWorkspaceMembersResponse> => {
    const data = await fetchAPI(`/api/workspaces/${workspaceId}/members`);
    return ListWorkspaceMembersResponseSchema.parse(data);
  },

  updateRole: async (workspaceId: string, memberId: string, data: UpdateMemberRoleRequest): Promise<WorkspaceMember> => {
    const res = await fetchAPI(`/api/workspaces/${workspaceId}/members/${memberId}`, {
      method: 'PATCH',
      body: JSON.stringify(data)
    });
    return WorkspaceMemberSchema.parse(res);
  },

  remove: async (workspaceId: string, memberId: string): Promise<void> => {
    await fetchAPI(`/api/workspaces/${workspaceId}/members/${memberId}`, {
      method: 'DELETE'
    });
  }
};
