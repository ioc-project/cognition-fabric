import type {MemberRole} from './member';

// Custom interfaces - these schemas don't exist in the generated file yet
export type InvitationStatus = 'pending' | 'accepted' | 'declined' | 'cancelled' | 'expired';

export type InvitationRole = MemberRole;

export interface Invitation {
  id: string;
  workspace_id: string;
  inviter_user_id: string;
  invitee_username: string;
  role: InvitationRole;
  status: InvitationStatus;
  created_at: string;
  expires_at: string;
  workspace_name?: string;
  inviter_username?: string;
}

export interface CreateInvitationRequest {
  invitee_username: string;
  role: InvitationRole;
}

export interface CreateInvitationResponse {
  id: string;
  workspace_id: string;
  invitee_username: string;
  role: InvitationRole;
  status: InvitationStatus;
  created_at: string;
  expires_at: string;
}

export interface ListInvitationsResponse {
  invitations: Invitation[];
  total?: number;
}

export interface AcceptInvitationResponse {
  workspace_id: string;
  message?: string;
}
