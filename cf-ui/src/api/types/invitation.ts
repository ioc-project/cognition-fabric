import type {components} from '../generated/schema';

export type Invitation = components['schemas']['WorkspaceInvitationDetail'];
export type InvitationStatus = components['schemas']['InvitationStatus'];
export type InvitationRole = components['schemas']['WorkspaceRole'];

export type CreateInvitationRequest = components['schemas']['WorkspaceInvitationCreate'];
export type CreateInvitationResponse = components['schemas']['WorkspaceInvitationResponse'];

export type ListInvitationsResponse = components['schemas']['WorkspaceInvitationList'];

export type AcceptInvitationResponse = components['schemas']['WorkspaceInvitationAcceptResponse'];
