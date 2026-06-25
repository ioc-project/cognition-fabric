// Copyright 2026 Cisco Systems, Inc. and its affiliates
//
// SPDX-License-Identifier: Apache-2.0

import {apiClient} from '../client';
import type {MemoryProvider, CreateMemoryProviderRequest, UpdateMemoryProviderRequest, ListMemoryProviderResponse} from '../types/memory-provider';

export const memoryProviderApi = {
  async list(): Promise<ListMemoryProviderResponse> {
    const {data, error} = await apiClient.GET('/api/memory-providers');

    if (error) {
      throw error;
    }
    return data;
  },

  async get(id: string): Promise<MemoryProvider> {
    const {data, error} = await apiClient.GET('/api/memory-providers/{id}', {
      params: {
        path: {id: id}
      }
    });

    if (error) {
      throw error;
    }
    return data as MemoryProvider;
  },

  async create(data: CreateMemoryProviderRequest): Promise<MemoryProvider> {
    const {data: response, error} = await apiClient.POST('/api/memory-providers', {
      body: data as any
    });

    if (error) {
      throw error;
    }
    return response as MemoryProvider;
  },

  async update(id: string, data: UpdateMemoryProviderRequest): Promise<MemoryProvider> {
    const {data: response, error} = await apiClient.PATCH('/api/memory-providers/{id}', {
      params: {
        path: {id: id}
      },
      body: data as any
    });

    if (error) {
      throw error;
    }
    return response as MemoryProvider;
  },

  async delete(id: string): Promise<void> {
    const {error} = await apiClient.DELETE('/api/memory-providers/{id}', {
      params: {
        path: {id: id}
      }
    });

    if (error) {
      throw error;
    }
  }
};

export type {MemoryProvider, CreateMemoryProviderRequest, UpdateMemoryProviderRequest, ListMemoryProviderResponse};
