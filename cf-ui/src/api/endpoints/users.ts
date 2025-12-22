import {fetchAPI} from '../client';
import {ListUsersResponse, ListUsersResponseSchema} from '../types';

export const userApi = {
  list: async (): Promise<ListUsersResponse> => {
    const data = await fetchAPI<ListUsersResponse>('/api/users/');
    return ListUsersResponseSchema.parse(data);
  }
};
