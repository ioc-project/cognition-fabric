import {apiClient} from '../client';
import type {
  CreateCognitiveAgentRequest,
  UpdateCognitiveAgentRequest,
  CognitiveAgent,
  CognitiveAgentListItem,
  ListCognitiveAgentsResponse
} from '../types/cognitive-agent';

export const cognitiveAgentApi = {
  list: async (workspaceId: string): Promise<CognitiveAgentListItem[]> => {
    const {data, error} = await apiClient.GET('/api/workspaces/{workspace_id}/cognitive-agents', {
      params: {
        path: {workspace_id: workspaceId}
      }
    });

    if (error) {
      throw error;
    }
    return (data as ListCognitiveAgentsResponse).agents;
  },

  get: async (workspaceId: string, cognitiveAgentId: string): Promise<CognitiveAgent> => {
    const {data, error} = await apiClient.GET('/api/workspaces/{workspace_id}/cognitive-agents/{cognitive_agent_id}', {
      params: {
        path: {workspace_id: workspaceId, cognitive_agent_id: cognitiveAgentId}
      }
    });

    if (error) {
      throw error;
    }
    return data as CognitiveAgent;
  },

  create: async (workspaceId: string, requestData: CreateCognitiveAgentRequest): Promise<CognitiveAgent> => {
    const {data, error} = await apiClient.POST('/api/workspaces/{workspace_id}/cognitive-agents', {
      params: {
        path: {workspace_id: workspaceId}
      },
      body: requestData as never
    });

    if (error) {
      throw error;
    }
    return data as CognitiveAgent;
  },

  update: async (workspaceId: string, cognitiveAgentId: string, requestData: UpdateCognitiveAgentRequest): Promise<CognitiveAgent> => {
    const {data, error} = await apiClient.PATCH('/api/workspaces/{workspace_id}/cognitive-agents/{cognitive_agent_id}', {
      params: {
        path: {workspace_id: workspaceId, cognitive_agent_id: cognitiveAgentId}
      },
      body: requestData as never
    });

    if (error) {
      throw error;
    }
    return data as CognitiveAgent;
  },

  delete: async (workspaceId: string, cognitiveAgentId: string): Promise<void> => {
    const {error} = await apiClient.DELETE('/api/workspaces/{workspace_id}/cognitive-agents/{cognitive_agent_id}', {
      params: {
        path: {workspace_id: workspaceId, cognitive_agent_id: cognitiveAgentId}
      }
    });

    if (error) {
      throw error;
    }
  }
};
