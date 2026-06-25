// Copyright 2026 Cisco Systems, Inc. and its affiliates
//
// SPDX-License-Identifier: Apache-2.0

import {apiClient} from '../client';
import type {ListUsersResponse} from '../types';

export const userApi = {
  list: async (): Promise<ListUsersResponse> => {
    const {data, error} = await apiClient.GET('/api/iam/users' as any, {} as any);

    if (error) {
      throw error;
    }
    return data as ListUsersResponse;
  }
};
