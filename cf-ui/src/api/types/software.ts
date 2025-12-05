import {z} from 'zod';

export const SoftwareTemplateSchema = z.object({
  id: z.string().uuid(),
  type: z.enum(['KnowledgeAdapterTemplates', 'ReasonerTemplates']),
  config: z.record(z.any()),
  created_at: z.string(),
  updated_at: z.string()
});
export type SoftwareTemplate = z.infer<typeof SoftwareTemplateSchema>;

export const ListSoftwareTemplatesResponseSchema = z.array(SoftwareTemplateSchema);
export type ListSoftwareTemplatesResponse = z.infer<typeof ListSoftwareTemplatesResponseSchema>;
