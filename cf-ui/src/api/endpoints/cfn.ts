import {fetchAPI} from '../client';
import {Cfn, CreateCfnRequest, ListCfnResponse, ListCfnResponseSchema, UpdateCfnRequest} from '../types/cfn';
import {apiRoutes} from '@/constants/routes';

export const cfnApi = {
  list: async (workspaceId: string): Promise<ListCfnResponse> => {
    const data = await fetchAPI(apiRoutes.cfn.list(workspaceId));
    return ListCfnResponseSchema.parse(data);
  },

  get: async (workspaceId: string, cfnId: string): Promise<Cfn> => {
    return fetchAPI(apiRoutes.cfn.details(workspaceId, cfnId));
  },

  create: async (payload: CreateCfnRequest, workspaceId: string): Promise<Cfn> => {
    return fetchAPI(`${apiRoutes.cfn.list(workspaceId)}/register`, {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  },

  update: async (workspaceId: string, cfnId: string, payload: UpdateCfnRequest): Promise<Cfn> => {
    return fetchAPI(apiRoutes.cfn.details(workspaceId, cfnId), {
      method: 'PUT',
      body: JSON.stringify(payload)
    });
  },

  delete: async (workspaceId: string, cfnId: string): Promise<void> => {
    await fetchAPI(apiRoutes.cfn.delete(workspaceId, cfnId), {
      method: 'DELETE'
    });
  }
};
