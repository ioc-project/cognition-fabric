import {fetchAPI} from '../client';
import type {CreateMASRequest, CreateMASResponse, MAS, UpdateMASRequest, ListMASResponse} from '../types/mas';

export const masApi = {
  create: async (workspaceId: string, data: CreateMASRequest): Promise<CreateMASResponse> => {
    return fetchAPI(`/api/workspaces/${workspaceId}/multi-agentic-systems`, {
      method: 'POST',
      body: JSON.stringify(data)
    });
  },

  list: async (workspaceId: string): Promise<MAS[]> => {
    const response = await fetchAPI<ListMASResponse>(`/api/workspaces/${workspaceId}/multi-agentic-systems`);
    return response.systems;
  },

  get: async (workspaceId: string, id: string): Promise<MAS> => {
    return fetchAPI<MAS>(`/api/workspaces/${workspaceId}/multi-agentic-systems/${id}`);
  },

  update: async (workspaceId: string, id: string, data: UpdateMASRequest): Promise<MAS> => {
    return fetchAPI<MAS>(`/api/workspaces/${workspaceId}/multi-agentic-systems/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data)
    });
  },

  delete: async (workspaceId: string, id: string): Promise<void> => {
    return fetchAPI(`/api/workspaces/${workspaceId}/multi-agentic-systems/${id}`, {
      method: 'DELETE'
    });
  }
};
