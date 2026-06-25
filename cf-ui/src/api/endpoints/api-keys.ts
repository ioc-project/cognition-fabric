// Copyright 2026 Cisco Systems, Inc. and its affiliates
//
// SPDX-License-Identifier: Apache-2.0

import {apiClient} from '../client';
import {CreateApiKeyRequest, CreateApiKeyResponse, IamUsersResponse, ListApiKeysResponse} from '../types';

export const apiKeyApi = {
  list: async (): Promise<ListApiKeysResponse> => {
    const {data, error} = await apiClient.GET('/api/iam/api-keys' as any, {} as any);

    if (error) {
      throw error;
    }
    return data as ListApiKeysResponse;
  },

  roles: async (): Promise<{roles: string[]}> => {
    const {data, error} = await apiClient.GET('/api/iam/roles' as any, {} as any);

    if (error) {
      throw error;
    }
    return {roles: data as string[]};
  },

  users: async (): Promise<IamUsersResponse> => {
    const {data, error} = await apiClient.GET('/api/iam/users' as any, {} as any);

    if (error) {
      throw error;
    }
    return data as IamUsersResponse;
  },

  create: async (payload: CreateApiKeyRequest): Promise<CreateApiKeyResponse> => {
    const {data, error} = await apiClient.POST(
      '/api/iam/api-keys' as any,
      {
        body: payload
      } as any
    );

    if (error) {
      throw error;
    }
    return data as CreateApiKeyResponse;
  },

  delete: async (id: string): Promise<void> => {
    const {error} = await apiClient.DELETE(
      '/api/iam/api-keys/{key_id}' as any,
      {
        params: {
          path: {key_id: id}
        }
      } as any
    );

    if (error) {
      throw error;
    }
  }
};
