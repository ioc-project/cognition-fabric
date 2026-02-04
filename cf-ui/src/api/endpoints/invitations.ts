import {apiClient} from '../client';
import type {CreateInvitationRequest, CreateInvitationResponse, ListInvitationsResponse} from '../types/invitation';

export const invitationApi = {
  create: async (workspaceId: string, data: CreateInvitationRequest): Promise<CreateInvitationResponse> => {
    const {data: response, error} = await apiClient.POST('/api/workspaces/{workspace_id}/invitations', {
      params: {
        path: {workspace_id: workspaceId}
      },
      body: data
    });

    if (error) {
      throw error;
    }
    return response;
  },

  listWorkspaceInvitations: async (workspaceId: string): Promise<ListInvitationsResponse> => {
    const {data, error} = await apiClient.GET('/api/workspaces/{workspace_id}/invitations', {
      params: {
        path: {workspace_id: workspaceId}
      }
    });

    if (error) {
      throw error;
    }
    return data;
  },

  cancel: async (workspaceId: string, invitationId: string): Promise<void> => {
    const {error} = await apiClient.DELETE('/api/workspaces/{workspace_id}/invitations/{invitation_id}', {
      params: {
        path: {workspace_id: workspaceId, invitation_id: invitationId}
      }
    });

    if (error) {
      throw error;
    }
  },

  getMyPendingInvitations: async (): Promise<ListInvitationsResponse> => {
    const {data, error} = await apiClient.GET('/api/invitations/pending');

    if (error) {
      throw error;
    }
    return data;
  },

  accept: async (invitationId: string): Promise<void> => {
    const {error} = await apiClient.POST('/api/invitations/{invitation_id}/accept', {
      params: {
        path: {invitation_id: invitationId}
      }
    });

    if (error) {
      throw error;
    }
  },

  decline: async (invitationId: string): Promise<void> => {
    const {error} = await apiClient.POST('/api/invitations/{invitation_id}/decline', {
      params: {
        path: {invitation_id: invitationId}
      }
    });

    if (error) {
      throw error;
    }
  }
};
