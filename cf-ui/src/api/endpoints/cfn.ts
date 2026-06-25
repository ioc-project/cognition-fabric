// Copyright 2026 Cisco Systems, Inc. and its affiliates
//
// SPDX-License-Identifier: Apache-2.0

import {apiClient} from '../client';
import type {Cfn, CreateCfnRequest, CreateCfnResponse, ListCfnResponse, UpdateCfnRequest} from '../types/cfn';

export const cfnApi = {
  list: async (workspaceId?: string): Promise<ListCfnResponse> => {
    const {data, error} = await apiClient.GET('/api/cognition-fabric-nodes', {
      params: {
        query: workspaceId ? {workspace_id: workspaceId} : undefined
      }
    });

    if (error) {
      throw error;
    }
    return data;
  },

  get: async (cfnId: string): Promise<Cfn> => {
    const {data, error} = await apiClient.GET('/api/cognition-fabric-nodes/{id}', {
      params: {
        path: {id: cfnId}
      }
    });

    if (error) {
      throw error;
    }
    return data;
  },

  create: async (payload: CreateCfnRequest): Promise<CreateCfnResponse> => {
    const {data, error} = await apiClient.POST('/api/cognition-fabric-nodes', {
      body: payload
    });

    if (error) {
      throw error;
    }
    return data;
  },

  update: async (cfnId: string, payload: UpdateCfnRequest): Promise<Cfn> => {
    const {data, error} = await apiClient.PUT('/api/cognition-fabric-nodes/{id}', {
      params: {
        path: {id: cfnId}
      },
      body: payload
    });

    if (error) {
      throw error;
    }
    return data;
  },

  delete: async (cfnId: string): Promise<void> => {
    const {error} = await apiClient.DELETE('/api/cognition-fabric-nodes/{id}', {
      params: {
        path: {id: cfnId}
      }
    });

    if (error) {
      throw error;
    }
  },

  enable: async (cfnId: string): Promise<Cfn> => {
    const {data, error} = await apiClient.PATCH('/api/cognition-fabric-nodes/{id}/enable', {
      params: {
        path: {id: cfnId}
      }
    });

    if (error) {
      throw error;
    }
    return data;
  },

  disable: async (cfnId: string): Promise<Cfn> => {
    const {data, error} = await apiClient.PATCH('/api/cognition-fabric-nodes/{id}/disable', {
      params: {
        path: {id: cfnId}
      }
    });

    if (error) {
      throw error;
    }
    return data;
  }
};
