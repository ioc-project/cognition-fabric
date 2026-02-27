import {apiClient} from '../client';
import type {components} from '../generated/schema';

type CognitiveAgentDetail = components['schemas']['CognitiveAgentDetail'];
type CognitiveAgentListItem = components['schemas']['CognitiveAgentListItem'];
type CognitiveAgentList = components['schemas']['CognitiveAgentList'];
type CognitiveAgentCreate = components['schemas']['CognitiveAgentCreate'];
type CognitiveAgentUpdate = components['schemas']['CognitiveAgentUpdate'];

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
    return data.agents;
  },

  get: async (workspaceId: string, cognitiveAgentId: string): Promise<CognitiveAgentDetail> => {
    const {data, error} = await apiClient.GET('/api/workspaces/{workspace_id}/cognitive-agents/{cognitive_agent_id}', {
      params: {
        path: {workspace_id: workspaceId, cognitive_agent_id: cognitiveAgentId}
      }
    });

    if (error) {
      throw error;
    }
    return data;
  },

  create: async (workspaceId: string, requestData: CognitiveAgentCreate): Promise<CognitiveAgentDetail> => {
    const {data, error} = await apiClient.POST('/api/workspaces/{workspace_id}/cognitive-agents', {
      params: {
        path: {workspace_id: workspaceId}
      },
      body: requestData
    });

    if (error) {
      throw error;
    }
    return data;
  },

  update: async (workspaceId: string, cognitiveAgentId: string, requestData: CognitiveAgentUpdate): Promise<CognitiveAgentDetail> => {
    const {data, error} = await apiClient.PATCH('/api/workspaces/{workspace_id}/cognitive-agents/{cognitive_agent_id}', {
      params: {
        path: {workspace_id: workspaceId, cognitive_agent_id: cognitiveAgentId}
      },
      body: requestData
    });

    if (error) {
      throw error;
    }
    return data;
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

export type {CognitiveAgentDetail, CognitiveAgentListItem, CognitiveAgentList, CognitiveAgentCreate, CognitiveAgentUpdate};
