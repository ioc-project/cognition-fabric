// Copyright 2026 Cisco Systems, Inc. and its affiliates
//
// SPDX-License-Identifier: Apache-2.0

import {apiClient} from '../client';
import type {components} from '../generated/schema';

type MultiAgenticSystem = components['schemas']['MultiAgenticSystem'];
type MultiAgenticSystemRequest = components['schemas']['MultiAgenticSystemRequest'];
type MultiAgenticSystemResponse = components['schemas']['MultiAgenticSystemResponse'];
type MultiAgenticSystemUpdate = components['schemas']['MultiAgenticSystemUpdate'];
type MultiAgenticSystems = components['schemas']['MultiAgenticSystems'];
type AgentConfig = components['schemas']['AgentConfig'];
type AgentDetail = components['schemas']['AgentDetail'];
type CognitionEngineAssociateResponse = components['schemas']['CognitionEngineAssociateResponse'];

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

  associateCE: async (workspaceId: string, masId: string, ceId: string): Promise<CognitionEngineAssociateResponse> => {
    const {data, error} = await apiClient.POST('/api/workspaces/{workspace_id}/multi-agentic-systems/{mas_id}/cognition-engines', {
      params: {
        path: {workspace_id: workspaceId, mas_id: masId}
      },
      body: {ce_id: ceId}
    });

    if (error) {
      throw error;
    }
    return data;
  },

  patchCEMasConfig: async (workspaceId: string, masId: string, ceId: string, masConfig: Record<string, unknown>): Promise<void> => {
    const {error} = await apiClient.PATCH('/api/workspaces/{workspace_id}/multi-agentic-systems/{mas_id}/cognition-engines/{ce_id}', {
      params: {
        path: {workspace_id: workspaceId, mas_id: masId, ce_id: ceId}
      },
      body: {mas_config: masConfig}
    });

    if (error) {
      throw error;
    }
  },

  disassociateCE: async (workspaceId: string, masId: string, ceId: string): Promise<void> => {
    const {error} = await apiClient.DELETE('/api/workspaces/{workspace_id}/multi-agentic-systems/{mas_id}/cognition-engines/{ce_id}', {
      params: {
        path: {workspace_id: workspaceId, mas_id: masId, ce_id: ceId}
      }
    });

    if (error) {
      throw error;
    }
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
  AgentDetail,
  CognitionEngineAssociateResponse
};
