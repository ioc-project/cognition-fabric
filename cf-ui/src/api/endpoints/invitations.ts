import {fetchAPI} from '../client';
import type {CreateInvitationRequest, CreateInvitationResponse, ListInvitationsResponse, Invitation} from '../types/invitation';
import {CreateInvitationResponseSchema, ListInvitationsResponseSchema, InvitationSchema} from '../types/invitation';

export const invitationApi = {
  create: async (workspaceId: string, data: CreateInvitationRequest): Promise<CreateInvitationResponse> => {
    const res = await fetchAPI(`/api/workspaces/${workspaceId}/invitations`, {
      method: 'POST',
      body: JSON.stringify(data)
    });
    return CreateInvitationResponseSchema.parse(res);
  },

  listWorkspaceInvitations: async (workspaceId: string): Promise<ListInvitationsResponse> => {
    const data = await fetchAPI(`/api/workspaces/${workspaceId}/invitations`);
    return ListInvitationsResponseSchema.parse(data);
  },

  cancel: async (workspaceId: string, invitationId: string): Promise<void> => {
    await fetchAPI(`/api/workspaces/${workspaceId}/invitations/${invitationId}`, {
      method: 'DELETE'
    });
  },

  getMyPendingInvitations: async (): Promise<ListInvitationsResponse> => {
    const data = await fetchAPI('/api/invitations/pending');
    return ListInvitationsResponseSchema.parse(data);
  },

  accept: async (invitationId: string): Promise<void> => {
    await fetchAPI(`/api/invitations/${invitationId}/accept`, {
      method: 'POST'
    });
  },

  decline: async (invitationId: string): Promise<void> => {
    await fetchAPI(`/api/invitations/${invitationId}/decline`, {
      method: 'POST'
    });
  }
};
