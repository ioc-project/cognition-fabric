import {apiClient} from '../client';
import type {Cfn, CreateCfnRequest, CreateCfnResponse, ListCfnResponse, UpdateCfnRequest} from '../types/cfn';

export const cfnApi = {
  list: async (workspaceId: string): Promise<ListCfnResponse> => {
    const {data, error} = await apiClient.GET('/api/workspaces/{workspace_id}/cognitive-fabric-node', {
      params: {
        path: {workspace_id: workspaceId}
      }
    });

    if (error) {
      throw error;
    }
    return data;
  },

  get: async (workspaceId: string, cfnId: string): Promise<Cfn> => {
    const {data, error} = await apiClient.GET('/api/workspaces/{workspace_id}/cognitive-fabric-node/{cfn_id}', {
      params: {
        path: {workspace_id: workspaceId, cfn_id: cfnId}
      }
    });

    if (error) {
      throw error;
    }
    return data;
  },

  create: async (payload: CreateCfnRequest, workspaceId: string): Promise<CreateCfnResponse> => {
    const {data, error} = await apiClient.POST('/api/workspaces/{workspace_id}/cognitive-fabric-node', {
      params: {
        path: {workspace_id: workspaceId}
      },
      body: payload
    });

    if (error) {
      throw error;
    }
    return data;
  },

  update: async (workspaceId: string, cfnId: string, payload: UpdateCfnRequest): Promise<Cfn> => {
    const {data, error} = await apiClient.PUT('/api/workspaces/{workspace_id}/cognitive-fabric-node/{cfn_id}', {
      params: {
        path: {workspace_id: workspaceId, cfn_id: cfnId}
      },
      body: payload
    });

    if (error) {
      throw error;
    }
    return data;
  },

  delete: async (workspaceId: string, cfnId: string): Promise<void> => {
    const {error} = await apiClient.DELETE('/api/workspaces/{workspace_id}/cognitive-fabric-node/{cfn_id}', {
      params: {
        path: {workspace_id: workspaceId, cfn_id: cfnId}
      }
    });

    if (error) {
      throw error;
    }
  },

  enable: async (workspaceId: string, cfnId: string): Promise<Cfn> => {
    const {data, error} = await apiClient.PATCH('/api/workspaces/{workspace_id}/cognitive-fabric-node/{cfn_id}/enable', {
      params: {
        path: {workspace_id: workspaceId, cfn_id: cfnId}
      }
    });

    if (error) {
      throw error;
    }
    return data;
  },

  disable: async (workspaceId: string, cfnId: string): Promise<Cfn> => {
    const {data, error} = await apiClient.PATCH('/api/workspaces/{workspace_id}/cognitive-fabric-node/{cfn_id}/disable', {
      params: {
        path: {workspace_id: workspaceId, cfn_id: cfnId}
      }
    });

    if (error) {
      throw error;
    }
    return data;
  }
};
