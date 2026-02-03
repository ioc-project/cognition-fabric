import {fetchAPI} from '../client';
import type {CreateInvitationRequest, CreateInvitationResponse, ListInvitationsResponse} from '../types/invitation';

export const invitationApi = {
  create: async (workspaceId: string, data: CreateInvitationRequest): Promise<CreateInvitationResponse> => {
    return fetchAPI(`/api/workspaces/${workspaceId}/invitations`, {
      method: 'POST',
      body: JSON.stringify(data)
    });
  },

  listWorkspaceInvitations: async (workspaceId: string): Promise<ListInvitationsResponse> => {
    return fetchAPI(`/api/workspaces/${workspaceId}/invitations`);
  },

  cancel: async (workspaceId: string, invitationId: string): Promise<void> => {
    await fetchAPI(`/api/workspaces/${workspaceId}/invitations/${invitationId}`, {
      method: 'DELETE'
    });
  },

  getMyPendingInvitations: async (): Promise<ListInvitationsResponse> => {
    return fetchAPI('/api/invitations/pending');
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
