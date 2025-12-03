import {fetchAPI} from '../client';
import {ListSoftwareTemplatesResponse} from '../types';
import {ListSoftwareTemplatesResponseSchema} from '../types/software';

export const softwareApi = {
  listByType: async (templateType: 'KnowledgeAdapterTemplates' | 'ReasonerTemplates'): Promise<ListSoftwareTemplatesResponse> => {
    const raw = await fetchAPI<unknown>(`/api/softwares?type=${encodeURIComponent(templateType)}`);
    const normalized = Array.isArray(raw) ? raw : [];
    return ListSoftwareTemplatesResponseSchema.parse(normalized);
  },
  listAll: async (): Promise<ListSoftwareTemplatesResponse> => {
    const data = await fetchAPI<ListSoftwareTemplatesResponse>('/api/softwares');
    return ListSoftwareTemplatesResponseSchema.parse(data);
  }
};
