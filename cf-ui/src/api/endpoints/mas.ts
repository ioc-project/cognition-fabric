import {apiClient} from '../client';
import type {CreateMASRequest, CreateMASResponse, MAS, UpdateMASRequest} from '../types/mas';

export const masApi = {
  create: async (workspaceId: string, data: CreateMASRequest): Promise<CreateMASResponse> => {
    const {data: response, error} = await apiClient.POST('/api/workspaces/{workspace_id}/multi-agentic-systems', {
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

  list: async (workspaceId: string): Promise<MAS[]> => {
    const {data, error} = await apiClient.GET('/api/workspaces/{workspace_id}/multi-agentic-systems', {
      params: {
        path: {workspace_id: workspaceId}
      }
    });

    if (error) {
      throw error;
    }
    return data.systems;
  },

  get: async (workspaceId: string, id: string): Promise<MAS> => {
    const {data, error} = await apiClient.GET('/api/workspaces/{workspace_id}/multi-agentic-systems/{mas_id}', {
      params: {
        path: {workspace_id: workspaceId, mas_id: id}
      }
    });

    if (error) {
      throw error;
    }
    return data;
  },

  update: async (workspaceId: string, id: string, data: UpdateMASRequest): Promise<MAS> => {
    const {data: response, error} = await apiClient.PUT('/api/workspaces/{workspace_id}/multi-agentic-systems/{mas_id}', {
      params: {
        path: {workspace_id: workspaceId, mas_id: id}
      },
      body: data
    });

    if (error) {
      throw error;
    }
    return response;
  },

  delete: async (workspaceId: string, id: string): Promise<void> => {
    const {error} = await apiClient.DELETE('/api/workspaces/{workspace_id}/multi-agentic-systems/{mas_id}', {
      params: {
        path: {workspace_id: workspaceId, mas_id: id}
      }
    });

    if (error) {
      throw error;
    }
  }
};
