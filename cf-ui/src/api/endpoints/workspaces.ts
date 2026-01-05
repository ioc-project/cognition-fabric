import {fetchAPI} from '../client';
import {CreateWorkspaceRequest, CreateWorkspaceResponse, ListWorkspacesResponse, Workspace, UpdateWorkspaceRequest} from '../types';
import {WorkspaceSchema, ListWorkspacesResponseSchema, CreateWorkspaceResponseSchema} from '../types/workspace';
import {apiRoutes} from '@/constants/routes';

export const workspaceApi = {
  create: async (data: CreateWorkspaceRequest): Promise<CreateWorkspaceResponse> => {
    const res = await fetchAPI(apiRoutes.workspaces.list, {
      method: 'POST',
      body: JSON.stringify(data)
    });
    return CreateWorkspaceResponseSchema.parse(res);
  },

  list: async (): Promise<ListWorkspacesResponse> => {
    const data = await fetchAPI(apiRoutes.workspaces.list);
    return ListWorkspacesResponseSchema.parse(data);
  },

  get: async (id: string): Promise<Workspace> => {
    const data = await fetchAPI(apiRoutes.workspaces.details(id));
    return WorkspaceSchema.parse(data);
  },

  update: async (id: string, data: UpdateWorkspaceRequest): Promise<Workspace> => {
    const res = await fetchAPI(apiRoutes.workspaces.details(id), {
      method: 'PUT',
      body: JSON.stringify(data)
    });
    return WorkspaceSchema.parse(res);
  },

  delete: async (id: string): Promise<{message: string}> => {
    return fetchAPI(apiRoutes.workspaces.details(id), {
      method: 'DELETE'
    });
  }
};
