import {apiClient} from '../client';
import type {components} from '../generated/schema';

type MultiAgenticSystem = components['schemas']['MultiAgenticSystem'];
type MultiAgenticSystemRequest = components['schemas']['MultiAgenticSystemRequest'];
type MultiAgenticSystemResponse = components['schemas']['MultiAgenticSystemResponse'];
type MultiAgenticSystemUpdate = components['schemas']['MultiAgenticSystemUpdate'];
type MultiAgenticSystems = components['schemas']['MultiAgenticSystems'];
type AgentConfig = components['schemas']['AgentConfig'];
type AgentWithMemory = components['schemas']['AgentWithMemory'];

export const masApi = {
  create: async (workspaceId: string, data: MultiAgenticSystemRequest): Promise<MultiAgenticSystemResponse> => {
    const {data: response, error} = await apiClient.POST('/api/workspaces/{workspace_id}/multi-agentic-systems', {
      params: {
        path: {workspace_id: workspaceId}
      },
      body: data
    });

    if (error) {
      throw error;
    }
    return response;
  },

  list: async (workspaceId: string): Promise<MultiAgenticSystem[]> => {
    const {data, error} = await apiClient.GET('/api/workspaces/{workspace_id}/multi-agentic-systems', {
      params: {
        path: {workspace_id: workspaceId}
      }
    });

    if (error) {
      throw error;
    }
    return data.systems;
  },

  get: async (workspaceId: string, id: string): Promise<MultiAgenticSystem> => {
    const {data, error} = await apiClient.GET('/api/workspaces/{workspace_id}/multi-agentic-systems/{mas_id}', {
      params: {
        path: {workspace_id: workspaceId, mas_id: id}
      }
    });

    if (error) {
      throw error;
    }
    return data;
  },

  update: async (workspaceId: string, id: string, data: MultiAgenticSystemUpdate): Promise<MultiAgenticSystem> => {
    const {data: response, error} = await apiClient.PUT('/api/workspaces/{workspace_id}/multi-agentic-systems/{mas_id}', {
      params: {
        path: {workspace_id: workspaceId, mas_id: id}
      },
      body: data
    });

    if (error) {
      throw error;
    }
    return response;
  },

  knowledgeGraph: async (workspaceId: string, masId: string): Promise<unknown> => {
    const {data, error} = await apiClient.GET('/api/workspaces/{workspaceId}/multi-agentic-systems/{masId}/knowledge-graph', {
      params: {
        path: {workspaceId, masId}
      }
    });

    if (error) {
      throw error;
    }
    return data;
  },

  delete: async (workspaceId: string, id: string): Promise<void> => {
    const {error} = await apiClient.DELETE('/api/workspaces/{workspace_id}/multi-agentic-systems/{mas_id}', {
      params: {
        path: {workspace_id: workspaceId, mas_id: id}
      }
    });

    if (error) {
      throw error;
    }
  }
};

export type {
  MultiAgenticSystem,
  MultiAgenticSystemRequest,
  MultiAgenticSystemResponse,
  MultiAgenticSystemUpdate,
  MultiAgenticSystems,
  AgentConfig,
  AgentWithMemory
};
