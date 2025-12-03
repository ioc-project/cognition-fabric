import {fetchAPI} from '../client';
import {CreateWorkspaceRequest, CreateWorkspaceResponse, ListWorkspacesResponse, Workspace, UpdateWorkspaceRequest} from '../types';
import {WorkspaceSchema, ListWorkspacesResponseSchema} from '../types/workspace';

export const workspaceApi = {
  create: async (data: CreateWorkspaceRequest): Promise<CreateWorkspaceResponse> => {
    return fetchAPI('/api/workspaces', {
      method: 'POST',
      body: JSON.stringify(data)
    });
  },

  list: async (): Promise<ListWorkspacesResponse> => {
    const data = await fetchAPI<ListWorkspacesResponse>('/api/workspaces');
    return ListWorkspacesResponseSchema.parse(data);
  },

  get: async (id: string): Promise<Workspace> => {
    const data = await fetchAPI<Workspace>(`/api/workspaces/${id}`);
    return WorkspaceSchema.parse(data);
  },

  update: async (id: string, data: UpdateWorkspaceRequest): Promise<Workspace> => {
    const res = await fetchAPI<Workspace>(`/api/workspaces/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data)
    });
    return WorkspaceSchema.parse(res);
  },

  delete: async (id: string): Promise<void> => {
    return fetchAPI(`/api/workspaces/${id}`, {
      method: 'DELETE'
    });
  }
};
