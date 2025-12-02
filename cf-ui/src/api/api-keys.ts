import {fetchAPI} from './client';
import {CreateApiKeyResponse, ListApiKeysResponse} from './types';
import {ListApiKeysResponseSchema} from './types/workspace';

export const apiKeyApi = {
  create: async (workspaceId: string): Promise<CreateApiKeyResponse> => {
    return fetchAPI(`/api/workspaces/${workspaceId}/api-keys`, {
      method: 'POST'
    });
  },

  list: async (workspaceId: string): Promise<ListApiKeysResponse> => {
    const data = await fetchAPI<ListApiKeysResponse>(`/api/workspaces/${workspaceId}/api-keys`);
    return ListApiKeysResponseSchema.parse(data);
  },

  delete: async (workspaceId: string, keyId: string): Promise<void> => {
    return fetchAPI(`/api/workspaces/${workspaceId}/api-keys/${keyId}`, {
      method: 'DELETE'
    });
  }
};
