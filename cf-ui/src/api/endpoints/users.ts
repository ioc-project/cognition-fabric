import {fetchAPI} from '../client';
import {ListUsersResponse, ListUsersResponseSchema} from '../types';

export const userApi = {
  list: async (): Promise<ListUsersResponse> => {
    const data = await fetchAPI<ListUsersResponse>('/api/iam/users/');
    return ListUsersResponseSchema.parse(data);
  }
};
