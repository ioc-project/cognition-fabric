import {fetchAPI} from '../client';
import {
  CreateReasonerRequest,
  CreateReasonerResponse,
  Reasoner,
  ListReasonersResponseSchema,
  ReasonerSchema,
  ReasonerQueryRequest,
  ReasonerQueryResponse
} from '../types/reasoner';

export const reasonerApi = {
  create: async (workspaceId: string, data: CreateReasonerRequest): Promise<CreateReasonerResponse> => {
    return fetchAPI(`/api/workspaces/${workspaceId}/reasoners`, {
      method: 'POST',
      body: JSON.stringify(data)
    });
  },

  list: async (workspaceId: string): Promise<Reasoner[]> => {
    const response = await fetchAPI(`/api/workspaces/${workspaceId}/reasoners`);
    const parsed = ListReasonersResponseSchema.parse(response);
    return parsed.reasoners;
  },

  get: async (workspaceId: string, id: string): Promise<Reasoner> => {
    const data = await fetchAPI<Reasoner>(`/api/workspaces/${workspaceId}/reasoners/${id}`);
    return ReasonerSchema.parse(data);
  },

  delete: async (workspaceId: string, id: string): Promise<void> => {
    await fetchAPI(`/api/workspaces/${workspaceId}/reasoners/${id}`, {method: 'DELETE'});
  },

  query: async (workspaceId: string, reasonerId: string, data: ReasonerQueryRequest): Promise<ReasonerQueryResponse> => {
    const controller = new AbortController();
    return fetchAPI(`/api/workspaces/${workspaceId}/reasoners/${reasonerId}/query`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(data),
      signal: controller.signal
    });
  }
};
