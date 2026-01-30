import {z} from 'zod';
import {JsonRecordSchema} from '@/api/types/json';

const WorkspaceUserSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  email: z.string().email()
});

const WorkspaceMemberSchema = z.object({
  id: z.string().uuid(),
  workspace_id: z.string().uuid(),
  user_id: z.string().uuid(),
  username: z.string(),
  role: z.enum(['admin', 'viewer', 'guest']),
  joined_at: z.string(),
  is_creator: z.boolean()
});

export const WorkspaceSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  created_at: z.string().nullable(),
  updated_at: z.string().nullable(),
  created_by: z.string().nullable().optional(),
  created_by_username: z.string().optional(),
  updated_by: z.string().nullable().optional(),
  users: z.array(z.union([WorkspaceUserSchema, z.string().uuid()])).default([]),
  members: z.array(WorkspaceMemberSchema).optional(),
  config: JsonRecordSchema.default({})
});

export type Workspace = z.infer<typeof WorkspaceSchema>;

export const CreateWorkspaceRequestSchema = z.object({
  name: z.string().min(1, 'Workspace name is required').max(100),
  users: z.array(z.string()).optional(),
  config: z.record(z.any()).optional()
});

export type CreateWorkspaceRequest = z.infer<typeof CreateWorkspaceRequestSchema>;

export const CreateWorkspaceResponseSchema = z.object({
  id: z.string().uuid()
});

export type CreateWorkspaceResponse = z.infer<typeof CreateWorkspaceResponseSchema>;

export const ListWorkspacesResponseSchema = z.object({
  workspaces: z.array(WorkspaceSchema),
  total: z.number().int().nonnegative()
});

export type ListWorkspacesResponse = z.infer<typeof ListWorkspacesResponseSchema>;

export const UpdateWorkspaceRequestSchema = z.object({
  name: z.string().min(1, 'Workspace name is required').max(100).optional()
});

export type UpdateWorkspaceRequest = z.infer<typeof UpdateWorkspaceRequestSchema>;

export const ValidationErrorDetailSchema = z.object({
  loc: z.array(z.string()),
  msg: z.string(),
  type: z.string()
});

export type ValidationErrorDetail = z.infer<typeof ValidationErrorDetailSchema>;

export const ValidationErrorSchema = z.object({
  detail: z.array(ValidationErrorDetailSchema)
});

export type ValidationError = z.infer<typeof ValidationErrorSchema>;

export const ApiErrorSchema = z.object({
  message: z.string(),
  error: z.string().optional(),
  statusCode: z.number().optional(),
  detail: z.array(ValidationErrorDetailSchema).optional()
});

export type ApiError = z.infer<typeof ApiErrorSchema>;
