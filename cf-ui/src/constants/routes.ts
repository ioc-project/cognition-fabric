export interface BreadcrumbItem {
  link: string;
  text: string;
  active?: boolean;
}

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
    cognitiveAgents: {
      list: (workspaceId: string) => `/workspaces/${workspaceId}/cognitive-agents`,
      create: (workspaceId: string) => `/workspaces/${workspaceId}/cognitive-agents/create`,
      details: (workspaceId: string, cognitiveAgentId: string) => `/workspaces/${workspaceId}/cognitive-agents/${cognitiveAgentId}`
    },
    reasoningHistory: {
      list: (workspaceId: string) => `/workspaces/${workspaceId}/reasoning-history`,
      details: (workspaceId: string, historyId: string) => `/workspaces/${workspaceId}/reasoning-history/${historyId}`
    },
    summary: (workspaceId: string) => `/workspaces/${workspaceId}/summary`,
    members: (workspaceId: string) => `/workspaces/${workspaceId}/members`
  },

  software: {
    list: '/software',
    listByType: (type: 'ReasonerTemplates') => `/software?type=${encodeURIComponent(type)}`,
    details: (id: string, type: string) => `/software/${id}?type=${encodeURIComponent(type)}`
  },

  queries: {
    list: '/queries'
  },

  apiKeys: '/api-keys',

  invitations: '/invitations'
} as const;

export const apiRoutes = {
  auth: {
    signIn: '/api/auth/signin',
    signOut: '/api/auth/signout',
    session: '/api/auth/session'
  },

  workspaces: {
    list: '/api/workspaces/',
    details: (id: string) => `/api/workspaces/${id}/`,
    summary: (id: string) => `/api/workspaces/${id}/summary/`
  },

  users: {
    list: (workspaceId: string) => `/api/workspaces/${workspaceId}/users`,
    details: (workspaceId: string, userId: string) => `/api/workspaces/${workspaceId}/users/${userId}`
  },

  apiKeys: {
    list: '/api/iam/api-keys',
    create: '/api/iam/api-keys',
    delete: (id: string) => `/api/iam/api-keys/${id}`,
    roles: '/api/iam/roles',
    users: '/api/iam/users'
  },

  software: {
    list: '/api/softwares',
    listByType: (type: string) => `/api/softwares?type=${encodeURIComponent(type)}`
  }
} as const;

export function getWorkspaceBasePath(workspaceId: string | null | undefined): string {
  return workspaceId ? routes.workspaces.details(workspaceId) : routes.workspaces.list;
}

export function isRouteActive(currentPath: string, route: string): boolean {
  return currentPath.startsWith(route);
}

export const breadcrumbs = {
  workspacesList: (): BreadcrumbItem[] => [
    {link: routes.home, text: 'Home'},
    {link: '', text: 'Workspaces', active: true}
  ],

  softwareList: (tabName?: string): BreadcrumbItem[] => {
    if (tabName) {
      return [
        {link: routes.software.list, text: 'Software Templates'},
        {link: '', text: tabName, active: true}
      ];
    }
    return [
      {link: routes.home, text: 'Home'},
      {link: '', text: 'Software Templates', active: true}
    ];
  },

  queriesList: (): BreadcrumbItem[] => [
    {link: routes.home, text: 'Home'},
    {link: '', text: 'Saved Queries', active: true}
  ],

  softwareDetails: (templateId: string): BreadcrumbItem[] => [
    {link: routes.software.list, text: 'Software Templates'},
    {link: '', text: templateId, active: true}
  ],

  workspaceDetails: (workspaceName: string): BreadcrumbItem[] => [
    {link: routes.workspaces.list, text: 'Workspaces'},
    {link: '', text: workspaceName, active: true}
  ],

  workspaceMAS: (workspaceId: string, workspaceName: string): BreadcrumbItem[] => [
    {link: routes.workspaces.list, text: 'Workspaces'},
    {link: routes.workspaces.details(workspaceId), text: workspaceName},
    {link: '', text: 'Multi-Agentic Systems', active: true}
  ],

  createMAS: (workspaceId: string, _workspaceName: string): BreadcrumbItem[] => [
    {link: routes.workspaces.mas.list(workspaceId), text: 'Multi-Agentic Systems'},
    {link: '', text: 'Create', active: true}
  ],

  workspaceCognitiveAgents: (workspaceId: string, workspaceName: string): BreadcrumbItem[] => [
    {link: routes.workspaces.list, text: 'Workspaces'},
    {link: routes.workspaces.details(workspaceId), text: workspaceName},
    {link: '', text: 'Cognitive Agents', active: true}
  ],

  createCognitiveAgent: (workspaceId: string, _workspaceName: string): BreadcrumbItem[] => [
    {link: routes.workspaces.cognitiveAgents.list(workspaceId), text: 'Cognitive Agents'},
    {link: '', text: 'Create', active: true}
  ],

  workspaceReasoningHistory: (workspaceId: string, workspaceName: string): BreadcrumbItem[] => [
    {link: routes.workspaces.list, text: 'Workspaces'},
    {link: routes.workspaces.details(workspaceId), text: workspaceName},
    {link: '', text: 'Reasoning History', active: true}
  ],

  reasoningHistoryDetails: (workspaceId: string, workspaceName: string, _historyId: string): BreadcrumbItem[] => [
    {link: routes.workspaces.list, text: 'Workspaces'},
    {link: routes.workspaces.details(workspaceId), text: workspaceName},
    {link: routes.workspaces.reasoningHistory.list(workspaceId), text: 'Reasoning History'},
    {link: '', text: 'Query Details', active: true}
  ],

  workspaceSummary: (workspaceId: string, workspaceName: string): BreadcrumbItem[] => [
    {link: routes.workspaces.list, text: 'Workspaces'},
    {link: routes.workspaces.details(workspaceId), text: workspaceName},
    {link: '', text: 'Summary', active: true}
  ],

  apiKeysList: (): BreadcrumbItem[] => [
    {link: routes.home, text: 'Home'},
    {link: '', text: 'API Keys', active: true}
  ]
} as const;
