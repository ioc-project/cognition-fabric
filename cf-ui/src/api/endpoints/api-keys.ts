import {fetchAPI} from '../client';
import {CreateApiKeyRequest, CreateApiKeyResponse} from '../types';

export const apiKeyApi = {
  roles: async (): Promise<{roles: string[]}> => {
    return fetchAPI(`/api/iam/roles`);
  },

  users: async (): Promise<{users: unknown[]}> => {
    return fetchAPI(`/api/iam/users`);
  },

  create: async (payload: CreateApiKeyRequest): Promise<CreateApiKeyResponse> => {
    return fetchAPI(`/api/iam/api-keys`, {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  }
};
