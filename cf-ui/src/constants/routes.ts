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
    members: (workspaceId: string) => `/workspaces/${workspaceId}/members`
  },

  mas: {
    list: '/mas',
    create: '/mas/create',
    details: (masId: string) => `/mas/${masId}`,
    knowledgeGraph: (masId: string) => `/mas/${masId}/knowledge-graph`
  },

  cognitiveAgents: {
    list: '/cognitive-agents',
    create: '/cognitive-agents/create',
    details: (cognitiveAgentId: string) => `/cognitive-agents/${cognitiveAgentId}`
  },

  cfn: {
    list: '/cfn',
    create: '/cfn/create',
    details: (cfnId: string) => `/cfn/${cfnId}`
  },

  memoryProviders: {
    list: '/memory-providers',
    create: '/memory-providers/create',
    details: (providerId: string) => `/memory-providers/${providerId}`
  },

  queries: {
    list: '/queries'
  },

  apiKeys: '/api-keys',

  invitations: '/invitations',

  audits: '/audits'
} as const;

export const apiRoutes = {
  auth: {
    signIn: '/api/auth/signin',
    signOut: '/api/auth/signout',
    session: '/api/auth/session'
  },

  workspaces: {
    list: '/api/workspaces/',
    details: (id: string) => `/api/workspaces/${id}/`
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
    list: '/api/cognition-fabric-nodes',
    details: (id: string) => `/api/cognition-fabric-nodes/${id}`,
    create: '/api/cognition-fabric-nodes',
    delete: (id: string) => `/api/cognition-fabric-nodes/${id}`
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

  workspaceCognitiveAgents: (workspaceId: string, workspaceName: string): BreadcrumbItem[] => [
    {link: routes.workspaces.list, text: 'Workspaces'},
    {link: routes.workspaces.details(workspaceId), text: workspaceName},
    {link: '', text: 'Cognition Engines', active: true}
  ],

  createCognitiveAgent: (workspaceId: string, _workspaceName: string): BreadcrumbItem[] => [
    {link: routes.workspaces.cognitiveAgents.list(workspaceId), text: 'Cognition Engines'},
    {link: '', text: 'Create', active: true}
  ],

  // New non-workspace-scoped breadcrumbs
  masList: (): BreadcrumbItem[] => [
    {link: routes.home, text: 'Home'},
    {link: '', text: 'Multi-Agentic Systems', active: true}
  ],

  masDetails: (masName: string): BreadcrumbItem[] => [
    {link: routes.mas.list, text: 'Multi-Agentic Systems'},
    {link: '', text: masName, active: true}
  ],

  masCreate: (): BreadcrumbItem[] => [
    {link: routes.mas.list, text: 'Multi-Agentic Systems'},
    {link: '', text: 'Create', active: true}
  ],

  cognitiveAgentsList: (): BreadcrumbItem[] => [
    {link: routes.home, text: 'Home'},
    {link: '', text: 'Cognition Engines', active: true}
  ],

  cognitiveAgentDetails: (agentName: string): BreadcrumbItem[] => [
    {link: routes.cognitiveAgents.list, text: 'Cognition Engines'},
    {link: '', text: agentName, active: true}
  ],

  cognitiveAgentCreate: (): BreadcrumbItem[] => [
    {link: routes.cognitiveAgents.list, text: 'Cognition Engines'},
    {link: '', text: 'Create', active: true}
  ],

  apiKeysList: (): BreadcrumbItem[] => [
    {link: routes.home, text: 'Home'},
    {link: '', text: 'API Keys', active: true}
  ],

  cfnList: (): BreadcrumbItem[] => [
    {link: routes.home, text: 'Home'},
    {link: '', text: 'Cognition Fabric Nodes', active: true}
  ],

  cfnDetails: (cfnName: string): BreadcrumbItem[] => [
    {link: routes.cfn.list, text: 'Cognition Fabric Nodes'},
    {link: '', text: cfnName, active: true}
  ],

  createCfn: (): BreadcrumbItem[] => [
    {link: routes.cfn.list, text: 'Cognition Fabric Nodes'},
    {link: '', text: 'Register Cognition Fabric Node', active: true}
  ],

  memoryProvidersList: (): BreadcrumbItem[] => [
    {link: routes.home, text: 'Home'},
    {link: '', text: 'Memory Providers', active: true}
  ],

  memoryProviderDetails: (providerName: string): BreadcrumbItem[] => [
    {link: routes.memoryProviders.list, text: 'Memory Providers'},
    {link: '', text: providerName, active: true}
  ],

  createMemoryProvider: (): BreadcrumbItem[] => [
    {link: routes.memoryProviders.list, text: 'Memory Providers'},
    {link: '', text: 'Create', active: true}
  ],

  auditsList: (): BreadcrumbItem[] => [
    {link: routes.home, text: 'Home'},
    {link: '', text: 'Audits', active: true}
  ]
} as const;
