import {z} from 'zod';

export const SoftwareConfigSchema = z.object({
  reasoning_engine: z.string(),
  endpoint_url: z.string().url(),
  timeout: z.number().int().nonnegative(),
  max_retries: z.number().int().nonnegative()
});

export type SoftwareConfig = z.infer<typeof SoftwareConfigSchema>;

export const SoftwareSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  type: z.string(),
  config: SoftwareConfigSchema,
  workspace_id: z.string().uuid(),
  created_at: z.string().datetime()
});

export type Software = z.infer<typeof SoftwareSchema>;

export const CreateSoftwareRequestSchema = z.object({
  name: z.string().min(1, 'Software name is required'),
  type: z.string().min(1, 'Software type is required'),
  config: SoftwareConfigSchema
});

export type CreateSoftwareRequest = z.infer<typeof CreateSoftwareRequestSchema>;

export const CreateSoftwareResponseSchema = SoftwareSchema;

export type CreateSoftwareResponse = z.infer<typeof CreateSoftwareResponseSchema>;

export const ListSoftwaresResponseSchema = z.object({
  softwares: z.array(SoftwareSchema),
  total: z.number().int().nonnegative()
});

export type ListSoftwaresResponse = z.infer<typeof ListSoftwaresResponseSchema>;

export const UpdateSoftwareRequestSchema = z.object({
  name: z.string().min(1, 'Software name is required')
});

export type UpdateSoftwareRequest = z.infer<typeof UpdateSoftwareRequestSchema>;

export const UpdateSoftwareResponseSchema = SoftwareSchema;

export type UpdateSoftwareResponse = z.infer<typeof UpdateSoftwareResponseSchema>;

export const DeleteSoftwareResponseSchema = z.string();

export type DeleteSoftwareResponse = z.infer<typeof DeleteSoftwareResponseSchema>;
