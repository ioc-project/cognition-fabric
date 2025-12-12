import {fetchAPI} from '../client';
import {CreateApiKeyRequest, CreateApiKeyResponse, IamUser, IamUsersResponseSchema} from '../types';
import {apiRoutes} from '@/constants/routes';

export const apiKeyApi = {
  roles: async (): Promise<{roles: string[]}> => {
    return fetchAPI(apiRoutes.apiKeys.roles);
  },

  users: async (): Promise<{users: IamUser[]}> => {
    const raw = await fetchAPI(apiRoutes.apiKeys.users);
    return IamUsersResponseSchema.parse(raw);
  },

  create: async (payload: CreateApiKeyRequest): Promise<CreateApiKeyResponse> => {
    return fetchAPI(apiRoutes.apiKeys.create, {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  }
};
