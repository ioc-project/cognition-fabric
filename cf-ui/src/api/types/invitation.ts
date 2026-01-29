import {z} from 'zod';

export const InvitationRoleSchema = z.enum(['admin', 'viewer', 'guest']);
export type InvitationRole = z.infer<typeof InvitationRoleSchema>;

export const InvitationStatusSchema = z.enum(['pending', 'accepted', 'declined', 'expired']);
export type InvitationStatus = z.infer<typeof InvitationStatusSchema>;

export const InvitationSchema = z.object({
  id: z.string().uuid(),
  workspace_id: z.string().uuid(),
  workspace_name: z.string(),
  inviter_id: z.string().uuid(),
  inviter_username: z.string(),
  invitee_username: z.string(),
  role: InvitationRoleSchema,
  status: InvitationStatusSchema,
  created_at: z.string(),
  expires_at: z.string(),
  responded_at: z.string().nullable()
});

export type Invitation = z.infer<typeof InvitationSchema>;

export const CreateInvitationRequestSchema = z.object({
  invitee_username: z.string().min(1, 'Username is required'),
  role: InvitationRoleSchema
});

export type CreateInvitationRequest = z.infer<typeof CreateInvitationRequestSchema>;

export const CreateInvitationResponseSchema = z.object({
  id: z.string().uuid()
});

export type CreateInvitationResponse = z.infer<typeof CreateInvitationResponseSchema>;

export const ListInvitationsResponseSchema = z.object({
  invitations: z.array(InvitationSchema),
  total: z.number().int().nonnegative()
});

export type ListInvitationsResponse = z.infer<typeof ListInvitationsResponseSchema>;
