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
    cfn: {
      list: (workspaceId: string) => `/workspaces/${workspaceId}/cognitive-fabric-node`,
      create: (workspaceId: string) => `/workspaces/${workspaceId}/cognitive-fabric-node/create`,
      details: (workspaceId: string, cfnId: string) => `/workspaces/${workspaceId}/cognitive-fabric-node/${cfnId}`
    },
    summary: (workspaceId: string) => `/workspaces/${workspaceId}/summary`,
    members: (workspaceId: string) => `/workspaces/${workspaceId}/members`
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
    list: (workspaceId: string) => `/api/workspaces/${workspaceId}/cognitive-fabric-node`,
    details: (workspaceId: string, id: string) => `/api/workspaces/${workspaceId}/cognitive-fabric-node/${id}`,
    create: (workspaceId: string) => `/api/workspaces/${workspaceId}/cognitive-fabric-node`,
    delete: (workspaceId: string, id: string) => `/api/workspaces/${workspaceId}/cognitive-fabric-node/${id}`
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

  workspaceCfn: (workspaceId: string, workspaceName: string): BreadcrumbItem[] => [
    {link: routes.workspaces.list, text: 'Workspaces'},
    {link: routes.workspaces.details(workspaceId), text: workspaceName},
    {link: '', text: 'Cognitive Fabric Nodes', active: true}
  ],

  workspaceCFN: (workspaceId: string, workspaceName: string): BreadcrumbItem[] => [
    {link: routes.workspaces.list, text: 'Workspaces'},
    {link: routes.workspaces.details(workspaceId), text: workspaceName},
    {link: '', text: 'Cognitive Fabric Nodes', active: true}
  ],

  createCfn: (workspaceId: string, _workspaceName: string): BreadcrumbItem[] => [
    {link: routes.workspaces.cfn.list(workspaceId), text: 'Cognitive Fabric Nodes'},
    {link: '', text: 'Create', active: true}
  ]
} as const;
