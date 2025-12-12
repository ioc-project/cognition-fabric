import {fetchAPI} from '../client';
import {ListSoftwareTemplatesResponse} from '../types';
import {ListSoftwareTemplatesResponseSchema} from '../types/software';
import {apiRoutes} from '@/constants/routes';

export const softwareApi = {
  listByType: async (templateType: 'KnowledgeAdapterTemplates' | 'ReasonerTemplates'): Promise<ListSoftwareTemplatesResponse> => {
    const raw = await fetchAPI<unknown>(apiRoutes.software.listByType(templateType));
    const normalized = Array.isArray(raw) ? raw : [];
    return ListSoftwareTemplatesResponseSchema.parse(normalized);
  },
  listAll: async (): Promise<ListSoftwareTemplatesResponse> => {
    const data = await fetchAPI<ListSoftwareTemplatesResponse>(apiRoutes.software.list);
    return ListSoftwareTemplatesResponseSchema.parse(data);
  }
};
