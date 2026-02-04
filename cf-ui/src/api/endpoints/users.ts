import {apiClient} from '../client';
import type {ListUsersResponse} from '../types';

export const userApi = {
  list: async (): Promise<ListUsersResponse> => {
    const {data, error} = await apiClient.GET('/api/iam/users');

    if (error) {
      throw error;
    }
    return data;
  }
};
