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
  CreateSoftwareRequest,
  CreateSoftwareResponse,
  ListSoftwaresResponse,
  Software,
  UpdateSoftwareRequest,
  UpdateSoftwareResponse,
  DeleteSoftwareResponse
} from './types';

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

async function fetchAPI<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers
    }
  });

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
    return fetchAPI('/api/workspaces');
  },

  get: async (id: string): Promise<Workspace> => {
    return fetchAPI(`/api/workspaces/${id}`);
  },

  update: async (id: string, data: UpdateWorkspaceRequest): Promise<Workspace> => {
    return fetchAPI(`/api/workspaces/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data)
    });
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
    return fetchAPI(`/api/workspaces/${workspaceId}/users`);
  },

  get: async (workspaceId: string, userId: string): Promise<User> => {
    return fetchAPI(`/api/workspaces/${workspaceId}/users/${userId}`);
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
    return fetchAPI(`/api/workspaces/${workspaceId}/api-keys`);
  },

  delete: async (workspaceId: string, keyId: string): Promise<void> => {
    return fetchAPI(`/api/workspaces/${workspaceId}/api-keys/${keyId}`, {
      method: 'DELETE'
    });
  }
};

export const softwareApi = {
  create: async (workspaceId: string, data: CreateSoftwareRequest): Promise<CreateSoftwareResponse> => {
    return fetchAPI(`/api/workspaces/${workspaceId}/softwares`, {
      method: 'POST',
      body: JSON.stringify(data)
    });
  },

  list: async (workspaceId: string): Promise<ListSoftwaresResponse> => {
    return fetchAPI(`/api/workspaces/${workspaceId}/softwares`);
  },

  get: async (workspaceId: string, softwareId: string): Promise<Software> => {
    return fetchAPI(`/api/workspaces/${workspaceId}/softwares/${softwareId}`);
  },

  update: async (workspaceId: string, softwareId: string, data: UpdateSoftwareRequest): Promise<UpdateSoftwareResponse> => {
    return fetchAPI(`/api/workspaces/${workspaceId}/softwares/${softwareId}`, {
      method: 'PUT',
      body: JSON.stringify(data)
    });
  },

  delete: async (workspaceId: string, softwareId: string): Promise<DeleteSoftwareResponse> => {
    return fetchAPI(`/api/workspaces/${workspaceId}/softwares/${softwareId}`, {
      method: 'DELETE'
    });
  }
};
