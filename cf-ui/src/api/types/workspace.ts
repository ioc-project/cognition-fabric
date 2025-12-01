import {z} from 'zod';

export const WorkspaceSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  created_at: z.string().datetime(),
  users: z.array(z.any()).default([]),
  api_keys: z.array(z.any()).default([]),
  mas_count: z.number().int().nonnegative().optional(),
  kep_count: z.number().int().nonnegative().optional(),
  reasoner_count: z.number().int().nonnegative().optional()
});

export type Workspace = z.infer<typeof WorkspaceSchema>;

export const CreateWorkspaceRequestSchema = z.object({
  name: z.string().min(1, 'Workspace name is required')
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
  name: z.string().min(1, 'Workspace name is required')
});

export type UpdateWorkspaceRequest = z.infer<typeof UpdateWorkspaceRequestSchema>;

export const UserSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  email: z.string().email(),
  workspace_id: z.string().uuid(),
  workspace_name: z.string(),
  created_at: z.string().datetime()
});

export type User = z.infer<typeof UserSchema>;

export const CreateUserRequestSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  email: z.string().email('Valid email is required')
});

export type CreateUserRequest = z.infer<typeof CreateUserRequestSchema>;

export const CreateUserResponseSchema = z.object({
  id: z.string().uuid()
});

export type CreateUserResponse = z.infer<typeof CreateUserResponseSchema>;

export const ListUsersResponseSchema = z.array(UserSchema);

export type ListUsersResponse = z.infer<typeof ListUsersResponseSchema>;

export const DeleteUserResponseSchema = z.object({
  message: z.string()
});

export type DeleteUserResponse = z.infer<typeof DeleteUserResponseSchema>;

export const ApiKeySchema = z.object({
  id: z.string().uuid(),
  key_preview: z.string(),
  created_at: z.string().datetime()
});

export type ApiKey = z.infer<typeof ApiKeySchema>;

export const CreateApiKeyResponseSchema = z.object({
  key: z.string().regex(/^tkf_[a-f0-9]{32}$/, 'Invalid API key format')
});

export type CreateApiKeyResponse = z.infer<typeof CreateApiKeyResponseSchema>;

export const ListApiKeysResponseSchema = z.object({
  api_keys: z.array(ApiKeySchema),
  total: z.number().int().nonnegative()
});

export type ListApiKeysResponse = z.infer<typeof ListApiKeysResponseSchema>;

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
