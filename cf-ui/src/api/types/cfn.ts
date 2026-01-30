import {z} from 'zod';

export const CfnSchema = z.object({
  cfn_id: z.string(),
  workspace_id: z.string(),
  cfn_name: z.string(),
  mgmt_host_ip: z.string().optional(),
  mgmt_port: z.number().int().min(1).max(65535).optional(),
  cfn_config: z.record(z.unknown()).optional(),
  cloud_config: z.record(z.unknown()).optional(),
  status: z.enum(['online', 'offline', 'blocked']),
  last_seen: z.string().optional(),
  blocked: z.boolean(),
  created_at: z.string(),
  updated_at: z.string().optional(),
  created_by: z.string().optional(),
  updated_by: z.string().optional()
});

export type Cfn = z.infer<typeof CfnSchema>;

export const CreateCfnRequestSchema = z.object({
  cfn_id: z.string().min(1, 'CFN ID is required'),
  cfn_name: z.string().min(1, 'Name is required').max(100, 'Name must be at most 100 characters'),
  mgmt_host_ip: z.string().optional(),
  mgmt_port: z.number().int().min(1).max(65535).optional(),
  cfn_config: z.record(z.unknown()).optional()
});

export type CreateCfnRequest = z.infer<typeof CreateCfnRequestSchema>;

export const UpdateCfnRequestSchema = z.object({
  cfn_name: z.string().min(1, 'Name is required').max(100, 'Name must be at most 100 characters').optional(),
  mgmt_host_ip: z.string().optional(),
  mgmt_port: z.number().int().min(1).max(65535).optional(),
  cfn_config: z.record(z.unknown()).optional()
});

export type UpdateCfnRequest = z.infer<typeof UpdateCfnRequestSchema>;

export const ListCfnResponseSchema = z.object({
  nodes: z.array(CfnSchema),
  total: z.number().int().nonnegative()
});

export type ListCfnResponse = z.infer<typeof ListCfnResponseSchema>;
