import {fetchAPI} from '../client';
import {
  CreateCognitiveEngineRequest,
  CreateCognitiveEngineResponse,
  CognitiveEngine,
  ListCognitiveEnginesResponseSchema,
  CognitiveEngineSchema,
  CognitiveEngineQueryRequest,
  CognitiveEngineQueryResponse
} from '../types/cognitive-engine';

export const cognitiveEngineApi = {
  create: async (workspaceId: string, data: CreateCognitiveEngineRequest): Promise<CreateCognitiveEngineResponse> => {
    return fetchAPI(`/api/workspaces/${workspaceId}/cognitive-engines`, {
      method: 'POST',
      body: JSON.stringify(data)
    });
  },

  list: async (workspaceId: string): Promise<CognitiveEngine[]> => {
    const response = await fetchAPI(`/api/workspaces/${workspaceId}/cognitive-engines`);
    const parsed = ListCognitiveEnginesResponseSchema.parse(response);
    return parsed.cognitive_engines;
  },

  get: async (workspaceId: string, id: string): Promise<CognitiveEngine> => {
    const data = await fetchAPI<CognitiveEngine>(`/api/workspaces/${workspaceId}/cognitive-engines/${id}`);
    return CognitiveEngineSchema.parse(data);
  },

  delete: async (workspaceId: string, id: string): Promise<void> => {
    await fetchAPI(`/api/workspaces/${workspaceId}/cognitive-engines/${id}`, {method: 'DELETE'});
  },

  query: async (workspaceId: string, cognitiveEngineId: string, data: CognitiveEngineQueryRequest): Promise<CognitiveEngineQueryResponse> => {
    const controller = new AbortController();
    return fetchAPI(`/api/workspaces/${workspaceId}/cognitive-engines/${cognitiveEngineId}/query`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(data),
      signal: controller.signal
    });
  }
};
