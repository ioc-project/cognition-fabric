'use client';

import useSWR from 'swr';
import {workspaceApi, apiKeyApi, softwareApi, cognitiveAgentApi, masApi, invitationApi, memberApi, cfnApi} from '@/api/endpoints';
import type {Workspace, ListWorkspacesResponse} from '@/api/types/workspace';
import type {CognitiveAgent, CreateCognitiveAgentRequest} from '@/api/types/cognitive-agent';
import type {MAS, CreateMASRequest} from '@/api/types/mas';
import type {CreateCfnRequest, ListCfnResponse} from '@/api/types/cfn';
import type {CreateInvitationRequest, ListInvitationsResponse} from '@/api/types/invitation';
import type {ListWorkspaceMembersResponse, UpdateMemberRoleRequest} from '@/api/types/member';
import {swrKeys} from '@/lib/swr-config';
import {parseError, sortByCreatedAtDesc} from '@/lib/utils';
import {useInvalidateMutation} from './useSWRResource';

function hasStatus(error: unknown): error is {status: number} {
  return typeof error === 'object' && error !== null && 'status' in error && typeof (error as {status: unknown}).status === 'number';
}

export function useWorkspaces() {
  const {data, error, isLoading, mutate} = useSWR<ListWorkspacesResponse>(swrKeys.workspaces(), () => workspaceApi.list(), {
    revalidateOnMount: true,
    keepPreviousData: true
  });

  return {
    workspaces: sortByCreatedAtDesc(data?.workspaces || []),
    isLoading,
    error: error ? parseError(error) : null,
    mutate
  };
}

export function useWorkspace(workspaceId: string) {
  const {data, error, isLoading, mutate} = useSWR<Workspace | null>(
    workspaceId ? swrKeys.workspace(workspaceId) : null,
    async () => {
      try {
        return await workspaceApi.get(workspaceId);
      } catch (e) {
        const list = await workspaceApi.list();
        const found = list.workspaces.find((w) => w.id === workspaceId);
        if (!found) {
          throw e;
        }
        return found;
      }
    },
    {
      keepPreviousData: true
    }
  );

  return {
    workspace: data || null,
    isLoading,
    error: error ? parseError(error) : null,
    mutate
  };
}

export function useApiKeys() {
  const {
    data: listData,
    isLoading: listLoading,
    error: listError,
    mutate
  } = useSWR(swrKeys.apiKeys(), () => apiKeyApi.list(), {
    revalidateOnMount: true,
    keepPreviousData: true
  });
  const {data: rolesData, isLoading: rolesLoading, error: rolesError, mutate: mutateRoles} = useSWR(swrKeys.iamRoles(), () => apiKeyApi.roles());
  const {data: usersData, isLoading: usersLoading, error: usersError, mutate: mutateUsers} = useSWR(swrKeys.iamUsers(), () => apiKeyApi.users());

  const {run: generateApiKey} = useInvalidateMutation(swrKeys.apiKeys(), (payload: {name: string}) => apiKeyApi.create(payload));

  const {run: runDeleteApiKey} = useInvalidateMutation(swrKeys.apiKeys(), (id: string) => apiKeyApi.delete(id));

  const deleteApiKey = async (id: string) => {
    await mutate(
      async (current) => {
        await runDeleteApiKey(id);
        return {
          api_keys: (current?.api_keys || []).filter((key) => key.id !== id),
          total: Math.max((current?.total || 1) - 1, 0)
        };
      },
      {
        optimisticData: (current) => ({
          api_keys: (current?.api_keys || []).filter((key) => key.id !== id),
          total: Math.max((current?.total || 1) - 1, 0)
        }),
        rollbackOnError: true,
        revalidate: false
      }
    );
  };

  const rawError = rolesError || usersError || listError;
  const normalizedError = rawError && hasStatus(rawError) && rawError.status === 404 ? null : rawError ? parseError(rawError) : null;

  return {
    apiKeys: sortByCreatedAtDesc(listData?.api_keys || []),
    total: listData?.total || 0,
    roles: rolesData?.roles || [],
    users: usersData?.users || [],
    isLoading: rolesLoading || usersLoading || listLoading,
    error: normalizedError,
    mutate,
    mutateRoles,
    mutateUsers,
    generateApiKey,
    deleteApiKey
  };
}

export function useSoftwareTemplates(templateType: 'ReasonerTemplates') {
  const {data, error, isLoading, mutate} = useSWR(swrKeys.softwareTemplates(templateType), () => softwareApi.listByType(templateType));

  return {
    templates: Array.isArray(data) ? data : [],
    isLoading,
    error: error ? parseError(error) : null,
    mutate
  };
}

export function useCognitiveAgents(workspaceId: string) {
  const {data, error, isLoading, isValidating, mutate} = useSWR<CognitiveAgent[]>(
    workspaceId ? swrKeys.cognitiveAgents(workspaceId) : null,
    () => cognitiveAgentApi.list(workspaceId),
    {revalidateOnMount: true, keepPreviousData: true}
  );

  const {run: runAddCognitiveAgent} = useInvalidateMutation(
    {keys: swrKeys.cognitiveAgents(workspaceId), prefixes: [['cognitive-agents', workspaceId]]},
    (payload: CreateCognitiveAgentRequest) => cognitiveAgentApi.create(workspaceId, payload)
  );

  const addCognitiveAgent = async (payload: CreateCognitiveAgentRequest) => {
    const response = await runAddCognitiveAgent(payload);
    await mutate(undefined, {revalidate: true});
    return response;
  };

  const {run: runDeleteCognitiveAgent} = useInvalidateMutation(
    {keys: swrKeys.cognitiveAgents(workspaceId), prefixes: [['cognitive-agents', workspaceId]]},
    (cognitiveAgentId: string) => cognitiveAgentApi.delete(workspaceId, cognitiveAgentId)
  );

  const deleteCognitiveAgent = async (cognitiveAgentId: string) => {
    const prev = Array.isArray(data) ? data : [];
    await mutate(
      prev.filter((r) => r.id !== cognitiveAgentId),
      {revalidate: false}
    );
    try {
      await runDeleteCognitiveAgent(cognitiveAgentId);
    } catch (e) {
      await mutate(prev, {revalidate: false});
      throw e;
    }
  };

  return {
    cognitiveAgents: sortByCreatedAtDesc(Array.isArray(data) ? data : []),
    isLoading,
    isValidating,
    error: error ? parseError(error) : null,
    mutate,
    addCognitiveAgent,
    deleteCognitiveAgent
  } as const;
}

export function useCfn(workspaceId: string) {
  const {data, error, isLoading, isValidating, mutate} = useSWR<ListCfnResponse>(
    workspaceId ? ['cfn-list', workspaceId] : null,
    () => cfnApi.list(workspaceId),
    {revalidateOnMount: true, keepPreviousData: true}
  );

  const {run: runAddCfn} = useInvalidateMutation(
    {keys: ['cfn-list', workspaceId], prefixes: [['cfn-list', workspaceId]]},
    (payload: CreateCfnRequest) => cfnApi.create(payload, workspaceId)
  );

  const addCfn = async (payload: CreateCfnRequest) => {
    const response = await runAddCfn(payload);
    await mutate(undefined, {revalidate: true});
    return response;
  };

  const {run: runDeleteCfn} = useInvalidateMutation({keys: ['cfn-list', workspaceId], prefixes: [['cfn-list', workspaceId]]}, (cfnId: string) =>
    cfnApi.delete(workspaceId, cfnId)
  );

  const deleteCfn = async (cfnId: string) => {
    const prev = data?.nodes || [];
    await mutate({nodes: prev.filter((c) => c.cfn_id !== cfnId), total: Math.max((data?.total || 1) - 1, 0)}, {revalidate: false});
    try {
      await runDeleteCfn(cfnId);
    } catch (e) {
      await mutate(data, {revalidate: false});
      throw e;
    }
  };

  return {
    cfns: sortByCreatedAtDesc(data?.nodes || []),
    isLoading,
    isValidating,
    error: error ? parseError(error) : null,
    mutate,
    addCfn,
    deleteCfn
  } as const;
}

export function useMAS(workspaceId: string) {
  const {data, error, isLoading, isValidating, mutate} = useSWR<MAS[]>(
    workspaceId ? swrKeys.mas(workspaceId) : null,
    () => masApi.list(workspaceId),
    {revalidateOnMount: true, keepPreviousData: true}
  );

  const {run: runAddMAS} = useInvalidateMutation(
    {keys: swrKeys.mas(workspaceId), prefixes: [['mas-list', workspaceId]]},
    (payload: CreateMASRequest) => masApi.create(workspaceId, payload)
  );

  const addMAS = async (payload: CreateMASRequest) => {
    const response = await runAddMAS(payload);
    await mutate(undefined, {revalidate: true});
    return response;
  };

  const {run: runDeleteMAS} = useInvalidateMutation({keys: swrKeys.mas(workspaceId), prefixes: [['mas-list', workspaceId]]}, (masId: string) =>
    masApi.delete(workspaceId, masId)
  );

  const deleteMAS = async (masId: string) => {
    const prev = Array.isArray(data) ? data : [];
    await mutate(
      prev.filter((m) => m.id !== masId),
      {revalidate: false}
    );
    try {
      await runDeleteMAS(masId);
    } catch (e) {
      await mutate(prev, {revalidate: false});
      throw e;
    }
  };

  return {
    masList: sortByCreatedAtDesc(Array.isArray(data) ? data : []),
    isLoading,
    isValidating,
    error: error ? parseError(error) : null,
    mutate,
    addMAS,
    deleteMAS
  } as const;
}

// Workspace Invitations
export function useWorkspaceInvitations(workspaceId: string) {
  const {data, error, isLoading, mutate} = useSWR<ListInvitationsResponse>(
    workspaceId ? swrKeys.workspaceInvitations(workspaceId) : null,
    () => invitationApi.listWorkspaceInvitations(workspaceId),
    {revalidateOnMount: true, keepPreviousData: true}
  );

  const {run: runCreateInvitation} = useInvalidateMutation(swrKeys.workspaceInvitations(workspaceId), (payload: CreateInvitationRequest) =>
    invitationApi.create(workspaceId, payload)
  );

  const createInvitation = async (payload: CreateInvitationRequest) => {
    const response = await runCreateInvitation(payload);
    await mutate();
    return response;
  };

  const {run: runCancelInvitation} = useInvalidateMutation(swrKeys.workspaceInvitations(workspaceId), (invitationId: string) =>
    invitationApi.cancel(workspaceId, invitationId)
  );

  const cancelInvitation = async (invitationId: string) => {
    await mutate(
      async (current) => {
        await runCancelInvitation(invitationId);
        return {
          invitations: (current?.invitations || []).filter((inv) => inv.id !== invitationId),
          total: Math.max((current?.total || 1) - 1, 0)
        };
      },
      {
        optimisticData: (current) => ({
          invitations: (current?.invitations || []).filter((inv) => inv.id !== invitationId),
          total: Math.max((current?.total || 1) - 1, 0)
        }),
        rollbackOnError: true,
        revalidate: false
      }
    );
  };

  return {
    invitations: data?.invitations || [],
    total: data?.total || 0,
    isLoading,
    error: error ? parseError(error) : null,
    mutate,
    createInvitation,
    cancelInvitation
  };
}

export function useMyPendingInvitations() {
  const {data, error, isLoading, mutate} = useSWR<ListInvitationsResponse>(
    swrKeys.myPendingInvitations(),
    () => invitationApi.getMyPendingInvitations(),
    {revalidateOnMount: true, keepPreviousData: true}
  );

  const {run: runAcceptInvitation} = useInvalidateMutation(swrKeys.myPendingInvitations(), (invitationId: string) =>
    invitationApi.accept(invitationId)
  );

  const acceptInvitation = async (invitationId: string) => {
    await runAcceptInvitation(invitationId);
    await mutate();
  };

  const {run: runDeclineInvitation} = useInvalidateMutation(swrKeys.myPendingInvitations(), (invitationId: string) =>
    invitationApi.decline(invitationId)
  );

  const declineInvitation = async (invitationId: string) => {
    await runDeclineInvitation(invitationId);
    await mutate();
  };

  return {
    invitations: data?.invitations || [],
    pendingCount: data?.invitations.filter((inv) => inv.status === 'pending').length || 0,
    total: data?.total || 0,
    isLoading,
    error: error ? parseError(error) : null,
    mutate,
    acceptInvitation,
    declineInvitation
  };
}

// Workspace Members
export function useWorkspaceMembers(workspaceId: string) {
  const {data, error, isLoading, mutate} = useSWR<ListWorkspaceMembersResponse>(
    workspaceId ? swrKeys.workspaceMembers(workspaceId) : null,
    () => memberApi.list(workspaceId),
    {revalidateOnMount: true, keepPreviousData: true}
  );

  const {run: runUpdateMemberRole} = useInvalidateMutation(
    swrKeys.workspaceMembers(workspaceId),
    ({memberId, role}: {memberId: string; role: UpdateMemberRoleRequest}) => memberApi.updateRole(workspaceId, memberId, role)
  );

  const updateMemberRole = async (memberId: string, role: UpdateMemberRoleRequest) => {
    await runUpdateMemberRole({memberId, role});
    await mutate();
  };

  const {run: runRemoveMember} = useInvalidateMutation(swrKeys.workspaceMembers(workspaceId), (memberId: string) =>
    memberApi.remove(workspaceId, memberId)
  );

  const removeMember = async (memberId: string) => {
    await mutate(
      async (current) => {
        await runRemoveMember(memberId);
        return {
          members: (current?.members || []).filter((member) => member.id !== memberId),
          total: Math.max((current?.total || 1) - 1, 0)
        };
      },
      {
        optimisticData: (current) => ({
          members: (current?.members || []).filter((member) => member.id !== memberId),
          total: Math.max((current?.total || 1) - 1, 0)
        }),
        rollbackOnError: true,
        revalidate: false
      }
    );
  };

  return {
    members: data?.members || [],
    total: data?.total || 0,
    isLoading,
    error: error ? parseError(error) : null,
    mutate,
    updateMemberRole,
    removeMember
  };
}
