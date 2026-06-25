// Copyright 2026 Cisco Systems, Inc. and its affiliates
//
// SPDX-License-Identifier: Apache-2.0

import {apiClient} from '../client';
import type {SignupRequest, SignupResponse, TokenResponse} from '../types/auth';

export const authApi = {
  login: async (username: string, password: string): Promise<TokenResponse> => {
    const {data, error} = await apiClient.POST(
      '/api/auth/login' as any,
      {
        body: {username, password}
      } as any
    );

    if (error) {
      throw new Error('Login failed');
    }

    return data as TokenResponse;
  },

  signup: async (data: SignupRequest): Promise<SignupResponse> => {
    const {data: response, error} = await apiClient.POST(
      '/api/auth/signup' as any,
      {
        body: data
      } as any
    );

    if (error) {
      // Error is thrown by middleware as ApiError with status property
      throw error;
    }

    return response as SignupResponse;
  }
};
