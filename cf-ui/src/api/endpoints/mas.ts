import {fetchAPI} from '../client';
import {CreateMASRequest, CreateMASResponse, MAS, UpdateMASRequest} from '../types/mas';
import {MASSchema, ListMASResponseSchema} from '../types/mas';

export const masApi = {
  create: async (workspaceId: string, data: CreateMASRequest): Promise<CreateMASResponse> => {
    return fetchAPI(`/api/workspaces/${workspaceId}/multi-agentic-systems`, {
      method: 'POST',
      body: JSON.stringify(data)
    });
  },

  list: async (workspaceId: string): Promise<MAS[]> => {
    const response = await fetchAPI(`/api/workspaces/${workspaceId}/multi-agentic-systems`);
    const parsed = ListMASResponseSchema.parse(response);
    return parsed.systems;
  },

  get: async (workspaceId: string, id: string): Promise<MAS> => {
    const data = await fetchAPI<MAS>(`/api/workspaces/${workspaceId}/multi-agentic-systems/${id}`);
    return MASSchema.parse(data);
  },

  update: async (workspaceId: string, id: string, data: UpdateMASRequest): Promise<MAS> => {
    const res = await fetchAPI<MAS>(`/api/workspaces/${workspaceId}/multi-agentic-systems/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data)
    });
    return MASSchema.parse(res);
  },

  delete: async (workspaceId: string, id: string): Promise<void> => {
    return fetchAPI(`/api/workspaces/${workspaceId}/multi-agentic-systems/${id}`, {
      method: 'DELETE'
    });
  }
};
