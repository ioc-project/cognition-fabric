import {z} from 'zod';

export const ApiKeySchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  key_preview: z.string(),
  user_id: z.string(),
  created_at: z.string()
});

export type ApiKey = z.infer<typeof ApiKeySchema>;

export const CreateApiKeyRequestSchema = z.object({
  name: z.string().min(1, 'API key name is required').max(100, 'API key name must be at most 100 characters')
});

export type CreateApiKeyRequest = z.infer<typeof CreateApiKeyRequestSchema>;

export const CreateApiKeyResponseSchema = z.object({
  id: z.string().uuid(),
  key: z.string(),
  key_preview: z.string(),
  name: z.string(),
  user_id: z.string(),
  created_at: z.string()
});

export type CreateApiKeyResponse = z.infer<typeof CreateApiKeyResponseSchema>;

export const ListApiKeysResponseSchema = z.object({
  api_keys: z.array(ApiKeySchema),
  total: z.number().int().nonnegative()
});

export type ListApiKeysResponse = z.infer<typeof ListApiKeysResponseSchema>;

export const IamUserSchema = z.object({
  id: z.string(),
  username: z.string(),
  domain: z.string(),
  role: z.string(),
  created_at: z.string(),
  updated_at: z.string()
});

export type IamUser = z.infer<typeof IamUserSchema>;

export const IamUsersResponseSchema = z.object({
  users: z.array(IamUserSchema),
  total: z.number().int().nonnegative()
});

export type IamUsersResponse = z.infer<typeof IamUsersResponseSchema>;
