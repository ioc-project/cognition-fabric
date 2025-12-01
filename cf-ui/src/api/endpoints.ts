import {
  CreateWorkspaceRequest,
  CreateWorkspaceResponse,
  ListWorkspacesResponse,
  Workspace,
  UpdateWorkspaceRequest,
  CreateUserRequest,
  CreateUserResponse,
  ListUsersResponse,
  User,
  DeleteUserResponse,
  CreateApiKeyResponse,
  ListApiKeysResponse,
  ListSoftwaresResponse,
  ListSoftwareTemplatesResponse,
  Software
} from './types';
import {WorkspaceSchema, ListWorkspacesResponseSchema, UserSchema, ListUsersResponseSchema, ListApiKeysResponseSchema} from './types/workspace';
import {SoftwareSchema, ListSoftwaresResponseSchema, ListSoftwareTemplatesResponseSchema} from './types/software';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || '';

class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public statusText: string
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export async function fetchAPI<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const controller = new AbortController();
  const timeout = typeof options?.signal === 'undefined' ? 15000 : undefined;
  let timeoutId: NodeJS.Timeout | undefined;
  if (typeof timeout === 'number') {
    timeoutId = setTimeout(() => controller.abort('Request timeout'), timeout);
  }
  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    signal: options?.signal ?? controller.signal,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers
    }
  });

  if (timeoutId) clearTimeout(timeoutId);

  if (!response.ok) {
    let errorMessage = response.statusText;
    try {
      const errorData = await response.json();
      errorMessage = errorData.message || errorData.error || errorMessage;
    } catch {}
    throw new ApiError(errorMessage, response.status, response.statusText);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json();
}

export const workspaceApi = {
  create: async (data: CreateWorkspaceRequest): Promise<CreateWorkspaceResponse> => {
    return fetchAPI('/api/workspaces', {
      method: 'POST',
      body: JSON.stringify(data)
    });
  },

  list: async (): Promise<ListWorkspacesResponse> => {
    const data = await fetchAPI<ListWorkspacesResponse>('/api/workspaces');
    return ListWorkspacesResponseSchema.parse(data);
  },

  get: async (id: string): Promise<Workspace> => {
    const data = await fetchAPI<Workspace>(`/api/workspaces/${id}`);
    return WorkspaceSchema.parse(data);
  },

  update: async (id: string, data: UpdateWorkspaceRequest): Promise<Workspace> => {
    const res = await fetchAPI<Workspace>(`/api/workspaces/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data)
    });
    return WorkspaceSchema.parse(res);
  },

  delete: async (id: string): Promise<void> => {
    return fetchAPI(`/api/workspaces/${id}`, {
      method: 'DELETE'
    });
  }
};

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

export const apiKeyApi = {
  create: async (workspaceId: string): Promise<CreateApiKeyResponse> => {
    return fetchAPI(`/api/workspaces/${workspaceId}/api-keys`, {
      method: 'POST'
    });
  },

  list: async (workspaceId: string): Promise<ListApiKeysResponse> => {
    const data = await fetchAPI<ListApiKeysResponse>(`/api/workspaces/${workspaceId}/api-keys`);
    return ListApiKeysResponseSchema.parse(data);
  },

  delete: async (workspaceId: string, keyId: string): Promise<void> => {
    return fetchAPI(`/api/workspaces/${workspaceId}/api-keys/${keyId}`, {
      method: 'DELETE'
    });
  }
};

export const softwareApi = {
  list: async (workspaceId: string): Promise<ListSoftwaresResponse> => {
    const data = await fetchAPI<ListSoftwaresResponse>(`/api/workspaces/${workspaceId}/softwares`);
    return ListSoftwaresResponseSchema.parse(data);
  },
  get: async (workspaceId: string, softwareId: string): Promise<Software> => {
    const data = await fetchAPI<Software>(`/api/workspaces/${workspaceId}/softwares/${softwareId}`);
    return SoftwareSchema.parse(data);
  }
};

export const softwareTemplatesApi = {
  list: async (): Promise<ListSoftwareTemplatesResponse> => {
    const data = await fetchAPI<ListSoftwareTemplatesResponse>('/api/softwares?type=knowledge-adapter-templates');
    return ListSoftwareTemplatesResponseSchema.parse(data);
  }
};
