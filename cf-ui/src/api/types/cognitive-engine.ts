import {z} from 'zod';
import {JsonRecordSchema} from '@/api/types/json';

export const CognitiveEngineSchema = z.object({
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

export type CognitiveEngine = z.infer<typeof CognitiveEngineSchema>;

export const CreateCognitiveEngineRequestSchema = z.object({
  name: z.string().min(1, 'Cognitive Engine name is required').min(3, 'Name must be at least 3 characters'),
  mas_id: z.string().uuid({message: 'Select a MAS'}),
  config: JsonRecordSchema.optional()
});

export type CreateCognitiveEngineRequest = z.infer<typeof CreateCognitiveEngineRequestSchema>;

export const CreateCognitiveEngineResponseSchema = z.object({
  id: z.string().uuid(),
  name: z.string()
});

export type CreateCognitiveEngineResponse = z.infer<typeof CreateCognitiveEngineResponseSchema>;

export const ListCognitiveEnginesResponseSchema = z.object({
  cognitive_engines: z.array(CognitiveEngineSchema)
});

export type ListCognitiveEnginesResponse = z.infer<typeof ListCognitiveEnginesResponseSchema>;

export const CognitiveEngineQueryRequestSchema = z.object({
  intent: z.string().min(1, 'Intent is required'),
  records: z.array(JsonRecordSchema).default([])
});

export type CognitiveEngineQueryRequest = z.infer<typeof CognitiveEngineQueryRequestSchema>;

export type CognitiveEngineQueryResponse = z.infer<typeof JsonRecordSchema>;
