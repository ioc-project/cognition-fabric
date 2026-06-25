// Copyright 2026 Cisco Systems, Inc. and its affiliates
//
// SPDX-License-Identifier: Apache-2.0

import {apiClient} from '../client';
import type {CreateInvitationRequest, CreateInvitationResponse, ListInvitationsResponse} from '../types/invitation';

export const invitationApi = {
  create: async (workspaceId: string, data: CreateInvitationRequest): Promise<CreateInvitationResponse> => {
    const {data: response, error} = await apiClient.POST(
      '/api/workspaces/{workspace_id}/invitations' as any,
      {
        params: {
          path: {workspace_id: workspaceId}
        },
        body: data
      } as any
    );

    if (error) {
      throw error;
    }
    return response as CreateInvitationResponse;
  },

  listWorkspaceInvitations: async (workspaceId: string): Promise<ListInvitationsResponse> => {
    const {data, error} = await apiClient.GET(
      '/api/workspaces/{workspace_id}/invitations' as any,
      {
        params: {
          path: {workspace_id: workspaceId}
        }
      } as any
    );

    if (error) {
      throw error;
    }
    return data as ListInvitationsResponse;
  },

  cancel: async (workspaceId: string, invitationId: string): Promise<void> => {
    const {error} = await apiClient.DELETE(
      '/api/workspaces/{workspace_id}/invitations/{invitation_id}' as any,
      {
        params: {
          path: {workspace_id: workspaceId, invitation_id: invitationId}
        }
      } as any
    );

    if (error) {
      throw error;
    }
  },

  getMyPendingInvitations: async (): Promise<ListInvitationsResponse> => {
    const {data, error} = await apiClient.GET('/api/invitations/pending' as any, {} as any);

    if (error) {
      throw error;
    }
    return data as ListInvitationsResponse;
  },

  accept: async (invitationId: string): Promise<void> => {
    const {error} = await apiClient.POST(
      '/api/invitations/{invitation_id}/accept' as any,
      {
        params: {
          path: {invitation_id: invitationId}
        }
      } as any
    );

    if (error) {
      throw error;
    }
  },

  decline: async (invitationId: string): Promise<void> => {
    const {error} = await apiClient.POST(
      '/api/invitations/{invitation_id}/decline' as any,
      {
        params: {
          path: {invitation_id: invitationId}
        }
      } as any
    );

    if (error) {
      throw error;
    }
  }
};
