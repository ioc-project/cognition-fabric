import {fetchAPI} from '../client';
import {CreateApiKeyRequest, CreateApiKeyResponse, IamUsersResponse, ListApiKeysResponse} from '../types';
import {apiRoutes} from '@/constants/routes';

export const apiKeyApi = {
  list: async (): Promise<ListApiKeysResponse> => {
    return fetchAPI(apiRoutes.apiKeys.list);
  },

  roles: async (): Promise<{roles: string[]}> => {
    return fetchAPI(apiRoutes.apiKeys.roles);
  },

  users: async (): Promise<IamUsersResponse> => {
    return fetchAPI(apiRoutes.apiKeys.users);
  },

  create: async (payload: CreateApiKeyRequest): Promise<CreateApiKeyResponse> => {
    return fetchAPI(apiRoutes.apiKeys.create, {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  },

  delete: async (id: string): Promise<void> => {
    await fetchAPI(apiRoutes.apiKeys.delete(id), {
      method: 'DELETE'
    });
  }
};
