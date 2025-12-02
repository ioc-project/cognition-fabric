import {fetchAPI} from './client';
import {ListSoftwaresResponse, ListSoftwareTemplatesResponse, Software} from './types';
import {SoftwareSchema, ListSoftwaresResponseSchema, ListSoftwareTemplatesResponseSchema} from './types/software';

export const softwareApi = {
  list: async (workspaceId: string): Promise<ListSoftwaresResponse> => {
    const data = await fetchAPI<ListSoftwaresResponse>(`/api/workspaces/${workspaceId}/softwares`);
    return ListSoftwaresResponseSchema.parse(data);
  },
  get: async (workspaceId: string, softwareId: string): Promise<Software> => {
    const data = await fetchAPI<Software>(`/api/workspaces/${workspaceId}/softwares/${softwareId}`);
    return SoftwareSchema.parse(data);
  }
};

export const softwareTemplatesApi = {
  list: async (): Promise<ListSoftwareTemplatesResponse> => {
    const data = await fetchAPI<ListSoftwareTemplatesResponse>('/api/softwares?type=knowledge-adapter-templates');
    return ListSoftwareTemplatesResponseSchema.parse(data);
  }
};
