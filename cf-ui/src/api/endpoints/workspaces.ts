import {apiClient} from '../client';
import {CreateWorkspaceRequest, CreateWorkspaceResponse, ListWorkspacesResponse, Workspace, UpdateWorkspaceRequest} from '../types';

export const workspaceApi = {
  create: async (data: CreateWorkspaceRequest): Promise<CreateWorkspaceResponse> => {
    const {data: response, error} = await apiClient.POST('/api/workspaces/create', {
      body: data
    });

    if (error) {
      throw error;
    }
    return response;
  },

  list: async (): Promise<ListWorkspacesResponse> => {
    const {data, error} = await apiClient.GET('/api/workspaces');

    if (error) {
      throw error;
    }
    return data;
  },

  get: async (id: string): Promise<Workspace> => {
    const {data, error} = await apiClient.GET('/api/workspaces/{workspace_id}', {
      params: {
        path: {workspace_id: id}
      }
    });

    if (error) {
      throw error;
    }
    return data;
  },

  update: async (id: string, data: UpdateWorkspaceRequest): Promise<Workspace> => {
    const {data: response, error} = await apiClient.PUT('/api/workspaces/{workspace_id}', {
      params: {
        path: {workspace_id: id}
      },
      body: data
    });

    if (error) {
      throw error;
    }
    return response;
  },

  delete: async (id: string): Promise<{message: string}> => {
    const {error} = await apiClient.DELETE('/api/workspaces/{workspace_id}', {
      params: {
        path: {workspace_id: id}
      }
    });

    if (error) {
      throw error;
    }
    return {message: 'Workspace deleted successfully'};
  }
};
