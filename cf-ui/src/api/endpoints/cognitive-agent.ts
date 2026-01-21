import {fetchAPI} from '../client';
import {
  CreateCognitiveAgentRequest,
  CreateCognitiveAgentResponse,
  CognitiveAgent,
  ListCognitiveAgentsResponseSchema,
  CognitiveAgentSchema,
  CognitiveAgentQueryRequest,
  CognitiveAgentQueryResponse
} from '../types/cognitive-agent';

export const cognitiveAgentApi = {
  create: async (workspaceId: string, data: CreateCognitiveAgentRequest): Promise<CreateCognitiveAgentResponse> => {
    return fetchAPI(`/api/workspaces/${workspaceId}/reasoners`, {
      method: 'POST',
      body: JSON.stringify(data)
    });
  },

  list: async (workspaceId: string): Promise<CognitiveAgent[]> => {
    const response = await fetchAPI(`/api/workspaces/${workspaceId}/reasoners`);
    const parsed = ListCognitiveAgentsResponseSchema.parse(response);
    return parsed.reasoners;
  },

  get: async (workspaceId: string, id: string): Promise<CognitiveAgent> => {
    const data = await fetchAPI<CognitiveAgent>(`/api/workspaces/${workspaceId}/reasoners/${id}`);
    return CognitiveAgentSchema.parse(data);
  },

  delete: async (workspaceId: string, id: string): Promise<void> => {
    await fetchAPI(`/api/workspaces/${workspaceId}/reasoners/${id}`, {method: 'DELETE'});
  },

  query: async (workspaceId: string, cognitiveAgentId: string, data: CognitiveAgentQueryRequest): Promise<CognitiveAgentQueryResponse> => {
    const controller = new AbortController();
    return fetchAPI(`/api/workspaces/${workspaceId}/reasoners/${cognitiveAgentId}/query`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(data),
      signal: controller.signal
    });
  }
};
