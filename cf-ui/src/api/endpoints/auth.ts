import {apiClient} from '../client';
import type {SignupRequest, SignupResponse} from '../types/auth';

export const authApi = {
  login: async (username: string, password: string) => {
    const {data, error} = await apiClient.POST('/api/auth/login', {
      body: {username, password}
    });

    if (error) {
      throw new Error('Login failed');
    }

    return data;
  },

  signup: async (data: SignupRequest): Promise<SignupResponse> => {
    const {data: response, error} = await apiClient.POST('/api/auth/signup', {
      body: data
    });

    if (error) {
      // Error is thrown by middleware as ApiError with status property
      throw error;
    }

    return response;
  }
};
