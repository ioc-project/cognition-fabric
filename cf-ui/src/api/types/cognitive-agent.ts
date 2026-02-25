import {z} from 'zod';
import {JsonRecordSchema} from '@/api/types/json';

export const CognitiveAgentSchema = z.object({
  cognitive_agent_id: z.string(),
  workspace_id: z.string(),
  cognitive_agent_name: z.string(),
  description: z.string().nullable(),
  config: JsonRecordSchema.nullable(),
  enabled: z.boolean(),
  created_at: z.string(),
  updated_at: z.string().nullable(),
  created_by: z.string(),
  updated_by: z.string().nullable()
});

export type CognitiveAgent = z.infer<typeof CognitiveAgentSchema>;

export const CognitiveAgentListItemSchema = z.object({
  cognitive_agent_id: z.string(),
  workspace_id: z.string(),
  cognitive_agent_name: z.string(),
  description: z.string().nullable(),
  config: JsonRecordSchema.nullable(),
  enabled: z.boolean(),
  created_at: z.string()
});

export type CognitiveAgentListItem = z.infer<typeof CognitiveAgentListItemSchema>;

export const CreateCognitiveAgentRequestSchema = z.object({
  cognitive_agent_name: z.string().min(1, 'Name is required').min(3, 'Name must be at least 3 characters'),
  description: z.string().optional(),
  config: JsonRecordSchema.optional()
});

export type CreateCognitiveAgentRequest = z.infer<typeof CreateCognitiveAgentRequestSchema>;

export const UpdateCognitiveAgentRequestSchema = z.object({
  cognitive_agent_name: z.string().min(1, 'Name is required').optional(),
  description: z.string().optional(),
  config: JsonRecordSchema.optional(),
  enabled: z.boolean().optional()
});

export type UpdateCognitiveAgentRequest = z.infer<typeof UpdateCognitiveAgentRequestSchema>;

export const ListCognitiveAgentsResponseSchema = z.object({
  agents: z.array(CognitiveAgentListItemSchema),
  total: z.number().int().nonnegative()
});

export type ListCognitiveAgentsResponse = z.infer<typeof ListCognitiveAgentsResponseSchema>;
