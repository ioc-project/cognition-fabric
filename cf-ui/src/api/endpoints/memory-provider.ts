import {apiClient} from '../client';
import type {components} from '../generated/schema';

type MemoryProvider = components['schemas']['MemoryProviderDetail'];
type CreateMemoryProviderRequest = components['schemas']['MemoryProviderCreate'];
type UpdateMemoryProviderRequest = components['schemas']['MemoryProviderUpdate'];
type ListMemoryProviderResponse = components['schemas']['MemoryProviderList'];

export const memoryProviderApi = {
  async list(): Promise<ListMemoryProviderResponse> {
    const {data, error} = await apiClient.GET('/api/memory-providers');

    if (error) {
      throw error;
    }
    return data;
  },

  async get(id: string): Promise<MemoryProvider> {
    const {data, error} = await apiClient.GET('/api/memory-providers/{memory_provider_id}', {
      params: {
        path: {memory_provider_id: id}
      }
    });

    if (error) {
      throw error;
    }
    return data;
  },

  async create(data: CreateMemoryProviderRequest): Promise<MemoryProvider> {
    const {data: response, error} = await apiClient.POST('/api/memory-providers', {
      body: data
    });

    if (error) {
      throw error;
    }
    return response;
  },

  async update(id: string, data: UpdateMemoryProviderRequest): Promise<MemoryProvider> {
    const {data: response, error} = await apiClient.PATCH('/api/memory-providers/{memory_provider_id}', {
      params: {
        path: {memory_provider_id: id}
      },
      body: data
    });

    if (error) {
      throw error;
    }
    return response;
  },

  async delete(id: string): Promise<void> {
    const {error} = await apiClient.DELETE('/api/memory-providers/{memory_provider_id}', {
      params: {
        path: {memory_provider_id: id}
      }
    });

    if (error) {
      throw error;
    }
  }
};

export type {MemoryProvider, CreateMemoryProviderRequest, UpdateMemoryProviderRequest, ListMemoryProviderResponse};
