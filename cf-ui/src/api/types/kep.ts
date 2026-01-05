import {z} from 'zod';
import {JsonRecordSchema} from '@/api/types/json';

export const KEPSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  mas_ids: z.array(z.string().uuid()),
  type: z.enum(['pull', 'push', 'both']),
  software_type: z.enum(['info-extraction', 'otel']),
  software_config: JsonRecordSchema.optional().nullable(),
  workspace_id: z.string().uuid().optional(),
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
  created_by: z.string().optional().nullable(),
  updated_by: z.string().optional().nullable()
});

export type KEP = z.infer<typeof KEPSchema>;

export const CreateKEPRequestSchema = z.object({
  name: z.string().min(1, 'Knowledge Adapter name is required').min(3, 'Name must be at least 3 characters'),
  mas_ids: z.array(z.string().uuid()).min(1, 'Select at least one MAS'),
  type: z.enum(['pull', 'push', 'both']),
  software_type: z.enum(['info-extraction', 'otel']),
  software_config: JsonRecordSchema.optional()
});

export type CreateKEPRequest = z.infer<typeof CreateKEPRequestSchema>;

export const CreateKEPResponseSchema = z.object({
  id: z.string().uuid()
});

export type CreateKEPResponse = z.infer<typeof CreateKEPResponseSchema>;

export const ListKEPResponseSchema = z.object({
  knowledge_adapters: z.array(KEPSchema),
  total: z.number().optional()
});

export type ListKEPResponse = z.infer<typeof ListKEPResponseSchema>;
