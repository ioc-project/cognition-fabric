import {fetchAPI} from '../client';
import {CreateKEPRequest, CreateKEPResponse, KEP, KEPSchema, ListKEPResponseSchema} from '../types/kep';

export const kepApi = {
  create: async (workspaceId: string, data: CreateKEPRequest): Promise<CreateKEPResponse> => {
    return fetchAPI(`/api/workspaces/${workspaceId}/knowledge-adapters`, {
      method: 'POST',
      body: JSON.stringify(data)
    });
  },

  list: async (workspaceId: string): Promise<KEP[]> => {
    const response = await fetchAPI(`/api/workspaces/${workspaceId}/knowledge-adapters`);
    const parsed = ListKEPResponseSchema.parse(response);
    return parsed.knowledge_adapters;
  },

  get: async (workspaceId: string, id: string): Promise<KEP> => {
    const data = await fetchAPI<KEP>(`/api/workspaces/${workspaceId}/knowledge-adapters/${id}`);
    return KEPSchema.parse(data);
  },

  delete: async (workspaceId: string, id: string): Promise<void> => {
    await fetchAPI(`/api/workspaces/${workspaceId}/knowledge-adapters/${id}`, {method: 'DELETE'});
  }
};
