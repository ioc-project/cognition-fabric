import {apiClient} from '../client';
import {CreateApiKeyRequest, CreateApiKeyResponse, IamUsersResponse, ListApiKeysResponse} from '../types';

export const apiKeyApi = {
  list: async (): Promise<ListApiKeysResponse> => {
    const {data, error} = await apiClient.GET('/api/iam/api-keys');

    if (error) {
      throw error;
    }
    return data;
  },

  roles: async (): Promise<{roles: string[]}> => {
    const {data, error} = await apiClient.GET('/api/iam/roles');

    if (error) {
      throw error;
    }
    return {roles: data};
  },

  users: async (): Promise<IamUsersResponse> => {
    const {data, error} = await apiClient.GET('/api/iam/users');

    if (error) {
      throw error;
    }
    return data;
  },

  create: async (payload: CreateApiKeyRequest): Promise<CreateApiKeyResponse> => {
    const {data, error} = await apiClient.POST('/api/iam/api-keys', {
      body: payload
    });

    if (error) {
      throw error;
    }
    return data;
  },

  delete: async (id: string): Promise<void> => {
    const {error} = await apiClient.DELETE('/api/iam/api-keys/{key_id}', {
      params: {
        path: {key_id: id}
      }
    });

    if (error) {
      throw error;
    }
  }
};
