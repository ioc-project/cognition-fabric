import {fetchAPI} from '../client';
import {CreateUserRequest, CreateUserResponse, ListUsersResponse, User, DeleteUserResponse} from '../types';
import {UserSchema, ListUsersResponseSchema} from '../types/workspace';
import {apiRoutes} from '@/constants/routes';

export const userApi = {
  create: async (workspaceId: string, data: CreateUserRequest): Promise<CreateUserResponse> => {
    return fetchAPI(apiRoutes.users.list(workspaceId), {
      method: 'POST',
      body: JSON.stringify(data)
    });
  },

  list: async (workspaceId: string): Promise<ListUsersResponse> => {
    const data = await fetchAPI<ListUsersResponse>(apiRoutes.users.list(workspaceId));
    return ListUsersResponseSchema.parse(data);
  },

  get: async (workspaceId: string, userId: string): Promise<User> => {
    const data = await fetchAPI<User>(apiRoutes.users.details(workspaceId, userId));
    return UserSchema.parse(data);
  },

  delete: async (workspaceId: string, userId: string): Promise<DeleteUserResponse> => {
    return fetchAPI(apiRoutes.users.details(workspaceId, userId), {
      method: 'DELETE'
    });
  }
};
