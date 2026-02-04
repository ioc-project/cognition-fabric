import type {components} from '../generated/schema';

export type WorkspaceMember = components['schemas']['WorkspaceMemberDetail'];
export type MemberRole = components['schemas']['WorkspaceRole'];

export type ListWorkspaceMembersResponse = components['schemas']['WorkspaceMemberList'];

export type UpdateMemberRoleRequest = components['schemas']['WorkspaceMemberRoleUpdate'];
