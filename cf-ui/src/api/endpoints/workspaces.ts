import {fetchAPI} from '../client';
import {CreateWorkspaceRequest, CreateWorkspaceResponse, ListWorkspacesResponse, Workspace, UpdateWorkspaceRequest} from '../types';
import {apiRoutes} from '@/constants/routes';

export const workspaceApi = {
  create: async (data: CreateWorkspaceRequest): Promise<CreateWorkspaceResponse> => {
    return fetchAPI(apiRoutes.workspaces.list, {
      method: 'POST',
      body: JSON.stringify(data)
    });
  },

  list: async (): Promise<ListWorkspacesResponse> => {
    return fetchAPI(apiRoutes.workspaces.list);
  },

  get: async (id: string): Promise<Workspace> => {
    return fetchAPI(apiRoutes.workspaces.details(id));
  },

  update: async (id: string, data: UpdateWorkspaceRequest): Promise<Workspace> => {
    return fetchAPI(apiRoutes.workspaces.details(id), {
      method: 'PUT',
      body: JSON.stringify(data)
    });
  },

  delete: async (id: string): Promise<{message: string}> => {
    return fetchAPI(apiRoutes.workspaces.details(id), {
      method: 'DELETE'
    });
  }
};
