import {fetchAPI} from '../client';
import {CreateUserRequest, CreateUserResponse, ListUsersResponse, User, DeleteUserResponse} from '../types';
import {UserSchema, ListUsersResponseSchema} from '../types/workspace';

export const userApi = {
  create: async (workspaceId: string, data: CreateUserRequest): Promise<CreateUserResponse> => {
    return fetchAPI(`/api/workspaces/${workspaceId}/users`, {
      method: 'POST',
      body: JSON.stringify(data)
    });
  },

  list: async (workspaceId: string): Promise<ListUsersResponse> => {
    const data = await fetchAPI<ListUsersResponse>(`/api/workspaces/${workspaceId}/users`);
    return ListUsersResponseSchema.parse(data);
  },

  get: async (workspaceId: string, userId: string): Promise<User> => {
    const data = await fetchAPI<User>(`/api/workspaces/${workspaceId}/users/${userId}`);
    return UserSchema.parse(data);
  },

  delete: async (workspaceId: string, userId: string): Promise<DeleteUserResponse> => {
    return fetchAPI(`/api/workspaces/${workspaceId}/users/${userId}`, {
      method: 'DELETE'
    });
  }
};
