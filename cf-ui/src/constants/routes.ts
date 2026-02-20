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
    cognitiveEngines: {
      list: (workspaceId: string) => `/workspaces/${workspaceId}/cognitive-engines`,
      create: (workspaceId: string) => `/workspaces/${workspaceId}/cognitive-engines/create`,
      details: (workspaceId: string, cognitiveEngineId: string) => `/workspaces/${workspaceId}/cognitive-engines/${cognitiveEngineId}`
    },
    summary: (workspaceId: string) => `/workspaces/${workspaceId}/summary`,
    members: (workspaceId: string) => `/workspaces/${workspaceId}/members`
  },

  cfn: {
    list: '/cfn',
    create: '/cfn/create',
    details: (cfnId: string) => `/cfn/${cfnId}`
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

  cfn: {
    list: '/api/cognitive-fabric-nodes',
    details: (id: string) => `/api/cognitive-fabric-nodes/${id}`,
    create: '/api/cognitive-fabric-nodes',
    delete: (id: string) => `/api/cognitive-fabric-nodes/${id}`
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

  queriesList: (): BreadcrumbItem[] => [
    {link: routes.home, text: 'Home'},
    {link: '', text: 'Saved Queries', active: true}
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

  workspaceCognitiveEngines: (workspaceId: string, workspaceName: string): BreadcrumbItem[] => [
    {link: routes.workspaces.list, text: 'Workspaces'},
    {link: routes.workspaces.details(workspaceId), text: workspaceName},
    {link: '', text: 'Cognitive Engines', active: true}
  ],

  createCognitiveEngine: (workspaceId: string, _workspaceName: string): BreadcrumbItem[] => [
    {link: routes.workspaces.cognitiveEngines.list(workspaceId), text: 'Cognitive Engines'},
    {link: '', text: 'Create', active: true}
  ],

  workspaceSummary: (workspaceId: string, workspaceName: string): BreadcrumbItem[] => [
    {link: routes.workspaces.list, text: 'Workspaces'},
    {link: routes.workspaces.details(workspaceId), text: workspaceName},
    {link: '', text: 'Summary', active: true}
  ],

  apiKeysList: (): BreadcrumbItem[] => [
    {link: routes.home, text: 'Home'},
    {link: '', text: 'API Keys', active: true}
  ],

  cfnList: (): BreadcrumbItem[] => [
    {link: routes.home, text: 'Home'},
    {link: '', text: 'Cognitive Fabric Nodes', active: true}
  ],

  cfnDetails: (cfnName: string): BreadcrumbItem[] => [
    {link: routes.cfn.list, text: 'Cognitive Fabric Nodes'},
    {link: '', text: cfnName, active: true}
  ],

  createCfn: (): BreadcrumbItem[] => [
    {link: routes.cfn.list, text: 'Cognitive Fabric Nodes'},
    {link: '', text: 'Create', active: true}
  ]
} as const;
