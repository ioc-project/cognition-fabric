import {z} from 'zod';

export const MemberRoleSchema = z.enum(['admin', 'viewer', 'guest']);
export type MemberRole = z.infer<typeof MemberRoleSchema>;

export const WorkspaceMemberSchema = z.object({
  id: z.string().uuid(),
  user_id: z.string().uuid(),
  username: z.string(),
  email: z.string().email(),
  role: MemberRoleSchema,
  joined_at: z.string()
});

export type WorkspaceMember = z.infer<typeof WorkspaceMemberSchema>;

export const ListWorkspaceMembersResponseSchema = z.object({
  members: z.array(WorkspaceMemberSchema),
  total: z.number().int().nonnegative()
});

export type ListWorkspaceMembersResponse = z.infer<typeof ListWorkspaceMembersResponseSchema>;

export const UpdateMemberRoleRequestSchema = z.object({
  role: MemberRoleSchema
});

export type UpdateMemberRoleRequest = z.infer<typeof UpdateMemberRoleRequestSchema>;
