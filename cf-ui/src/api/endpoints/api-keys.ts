import {fetchAPI} from '../client';
import {CreateApiKeyRequest, CreateApiKeyResponse, IamUser, IamUsersResponseSchema, ListApiKeysResponse, ListApiKeysResponseSchema} from '../types';
import {apiRoutes} from '@/constants/routes';

export const apiKeyApi = {
  list: async (): Promise<ListApiKeysResponse> => {
    const data = await fetchAPI(apiRoutes.apiKeys.list);
    return ListApiKeysResponseSchema.parse(data);
  },

  roles: async (): Promise<{roles: string[]}> => {
    return fetchAPI(apiRoutes.apiKeys.roles);
  },

  users: async (): Promise<{users: IamUser[]}> => {
    const data = await fetchAPI(apiRoutes.apiKeys.users);
    return IamUsersResponseSchema.parse(data);
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
