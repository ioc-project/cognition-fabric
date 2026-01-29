import {z} from 'zod';
import {JsonRecordSchema} from '@/api/types/json';

export const CognitiveAgentSchema = z.object({
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

export type CognitiveAgent = z.infer<typeof CognitiveAgentSchema>;

export const CreateCognitiveAgentRequestSchema = z.object({
  name: z.string().min(1, 'Cognitive Agent name is required').min(3, 'Name must be at least 3 characters'),
  mas_id: z.string().uuid({message: 'Select a MAS'}),
  config: JsonRecordSchema.optional()
});

export type CreateCognitiveAgentRequest = z.infer<typeof CreateCognitiveAgentRequestSchema>;

export const CreateCognitiveAgentResponseSchema = z.object({
  id: z.string().uuid(),
  name: z.string()
});

export type CreateCognitiveAgentResponse = z.infer<typeof CreateCognitiveAgentResponseSchema>;

export const ListCognitiveAgentsResponseSchema = z.object({
  cognitive_agents: z.array(CognitiveAgentSchema)
});

export type ListCognitiveAgentsResponse = z.infer<typeof ListCognitiveAgentsResponseSchema>;

export const CognitiveAgentQueryRequestSchema = z.object({
  intent: z.string().min(1, 'Intent is required'),
  records: z.array(JsonRecordSchema).default([])
});

export type CognitiveAgentQueryRequest = z.infer<typeof CognitiveAgentQueryRequestSchema>;

export type CognitiveAgentQueryResponse = z.infer<typeof JsonRecordSchema>;
