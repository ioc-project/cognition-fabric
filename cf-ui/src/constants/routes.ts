export const routes = {
  home: '/',
  login: '/login',

  workspaces: {
    list: '/workspaces',
    details: (id: string) => `/workspaces/${id}`,
    overview: (id: string) => `/workspaces/${id}/overview`,
    mas: {
      list: (workspaceId: string) => `/workspaces/${workspaceId}/mas`,
      create: (workspaceId: string) => `/workspaces/${workspaceId}/mas/create`,
      details: (workspaceId: string, masId: string) => `/workspaces/${workspaceId}/mas/${masId}`
    },
    knowledge: {
      list: (workspaceId: string) => `/workspaces/${workspaceId}/knowledge`,
      details: (workspaceId: string, adapterId: string) => `/workspaces/${workspaceId}/knowledge/${adapterId}`
    },
    reasoners: {
      list: (workspaceId: string) => `/workspaces/${workspaceId}/reasoners`,
      details: (workspaceId: string, reasonerId: string) => `/workspaces/${workspaceId}/reasoners/${reasonerId}`
    },
    reasoningHistory: (workspaceId: string) => `/workspaces/${workspaceId}/reasoning-history`,
    summary: (workspaceId: string) => `/workspaces/${workspaceId}/summary`
  },

  software: {
    list: '/software',
    listByType: (type: 'KnowledgeAdapterTemplates' | 'ReasonerTemplates') => `/software?type=${encodeURIComponent(type)}`,
    details: (id: string, type: string) => `/software/${id}?type=${encodeURIComponent(type)}`
  },

  queries: {
    list: '/queries'
  },

  settings: {
    apiKeys: '/settings/api-keys'
  }
} as const;

export const apiRoutes = {
  auth: {
    signIn: '/api/auth/signin',
    signOut: '/api/auth/signout',
    session: '/api/auth/session'
  },

  workspaces: {
    list: '/api/workspaces',
    details: (id: string) => `/api/workspaces/${id}`,
    summary: (id: string) => `/api/workspaces/${id}/summary`
  },

  users: {
    list: (workspaceId: string) => `/api/workspaces/${workspaceId}/users`,
    details: (workspaceId: string, userId: string) => `/api/workspaces/${workspaceId}/users/${userId}`
  },

  apiKeys: {
    list: '/api/iam/api-keys',
    create: '/api/iam/api-keys',
    delete: (id: string) => `/api/iam/api-keys/${id}`
  },

  software: {
    list: '/api/software-templates',
    listByType: (type: string) => `/api/software-templates?type=${encodeURIComponent(type)}`
  }
} as const;

export function getWorkspaceBasePath(workspaceId: string | null | undefined): string {
  return workspaceId ? routes.workspaces.details(workspaceId) : routes.workspaces.list;
}

export function isRouteActive(currentPath: string, route: string): boolean {
  return currentPath.startsWith(route);
}
