import {z} from 'zod';
import {JsonRecordSchema} from '@/api/types/json';

export const ReasonerSchema = z.object({
  id: z.string().uuid(),
  workspace_id: z.string().uuid().optional(),
  mas_id: z.string().uuid(),
  name: z.string(),
  config: JsonRecordSchema.optional().nullable(),
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
  created_by: z.string().optional().nullable(),
  updated_by: z.string().optional().nullable()
});

export type Reasoner = z.infer<typeof ReasonerSchema>;

export const CreateReasonerRequestSchema = z.object({
  name: z.string().min(1, 'Reasoner name is required').min(3, 'Name must be at least 3 characters'),
  mas_id: z.string().uuid({message: 'Select a MAS'}),
  config: JsonRecordSchema.optional()
});

export type CreateReasonerRequest = z.infer<typeof CreateReasonerRequestSchema>;

export const CreateReasonerResponseSchema = z.object({
  id: z.string().uuid(),
  name: z.string()
});

export type CreateReasonerResponse = z.infer<typeof CreateReasonerResponseSchema>;

export const ListReasonersResponseSchema = z.object({
  reasoners: z.array(ReasonerSchema)
});

export type ListReasonersResponse = z.infer<typeof ListReasonersResponseSchema>;

export const ReasonerQueryRequestSchema = z.object({
  intent: z.string().min(1, 'Intent is required'),
  records: z.array(JsonRecordSchema).default([])
});

export type ReasonerQueryRequest = z.infer<typeof ReasonerQueryRequestSchema>;

export type ReasonerQueryResponse = z.infer<typeof JsonRecordSchema>;
