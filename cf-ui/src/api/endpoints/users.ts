import {fetchAPI} from '../client';
import type {ListUsersResponse} from '../types';

export const userApi = {
  list: async (): Promise<ListUsersResponse> => {
    return fetchAPI<ListUsersResponse>('/api/iam/users/');
  }
};
