import {z} from 'zod';
import {JsonRecordSchema} from '@/api/types/json';

export const MASSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  description: z.string().optional(),
  agents: JsonRecordSchema.nullable().optional(),
  config: JsonRecordSchema.nullable().optional(),
  workspace_id: z.string().uuid().optional(),
  created_at: z.string().optional(),
  updated_at: z.string().optional()
});

export type MAS = z.infer<typeof MASSchema>;

export const CreateMASRequestSchema = z.object({
  name: z.string().min(1, 'Multi-Agent System name is required').min(3, 'Name must be at least 3 characters'),
  description: z.string().optional(),
  agents: JsonRecordSchema.optional().default({}),
  config: JsonRecordSchema.optional().default({})
});

export type CreateMASRequest = z.infer<typeof CreateMASRequestSchema>;

export const CreateMASResponseSchema = z.object({
  id: z.string().uuid(),
  name: z.string()
});

export type CreateMASResponse = z.infer<typeof CreateMASResponseSchema>;

export const ListMASResponseSchema = z.object({
  systems: z.array(MASSchema)
});

export type ListMASResponse = z.infer<typeof ListMASResponseSchema>;

export const UpdateMASRequestSchema = z.object({
  name: z.string().min(1, 'Multi-Agent System name is required').optional(),
  description: z.string().optional(),
  agents: z.record(z.unknown()).optional(),
  config: z.record(z.unknown()).optional()
});

export type UpdateMASRequest = z.infer<typeof UpdateMASRequestSchema>;
