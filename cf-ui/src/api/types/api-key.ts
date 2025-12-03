import {z} from 'zod';

export const ApiKeySchema = z.object({
  id: z.string().uuid(),
  key_preview: z.string(),
  created_at: z.string().datetime()
});

export type ApiKey = z.infer<typeof ApiKeySchema>;

export const CreateApiKeyRequestSchema = z.object({
  name: z.string().min(1, 'API key name is required'),
  roles: z.array(z.string()).min(1, 'At least one role is required')
});

export type CreateApiKeyRequest = z.infer<typeof CreateApiKeyRequestSchema>;

export const CreateApiKeyResponseSchema = z.object({
  id: z.string().uuid(),
  'api-key': z.string(),
  expires: z.string()
});

export type CreateApiKeyResponse = z.infer<typeof CreateApiKeyResponseSchema>;

export const ListApiKeysResponseSchema = z.object({
  api_keys: z.array(ApiKeySchema),
  total: z.number().int().nonnegative()
});

export type ListApiKeysResponse = z.infer<typeof ListApiKeysResponseSchema>;
