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

export const ListSoftwaresResponseSchema = z.object({
  softwares: z.array(SoftwareSchema),
  total: z.number().int().nonnegative()
});
export type ListSoftwaresResponse = z.infer<typeof ListSoftwaresResponseSchema>;

export const ListSoftwareTemplatesResponseSchema = z.object({
  softwares: z.array(z.record(z.any()))
});
export type ListSoftwareTemplatesResponse = z.infer<typeof ListSoftwareTemplatesResponseSchema>;
