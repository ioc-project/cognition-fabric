import {z} from 'zod';

const AgentFormSchema = z.object({
  agent_id: z.string().optional(),
  name: z.string().optional(),
  url: z.string().url('Must be a valid URL').optional().or(z.literal('')),
  agentic_memory_provider_id: z.string().optional(),
  identity_type: z.string().optional(),
  identity_identifiers: z
    .string()
    .optional()
    .refine(
      (val) => {
        if (!val || val.trim() === '') {
          return true;
        }
        try {
          JSON.parse(val);
          return true;
        } catch {
          return false;
        }
      },
      {message: 'Must be valid JSON'}
    )
});

export const UpdateMASFormSchema = z
  .object({
    name: z.string().min(1, 'Name is required').min(3, 'Name must be at least 3 characters'),
    description: z.string().optional(),
    shared_memory_provider_id: z.string().optional(),
    agents: z.array(AgentFormSchema).optional().default([]),
    config: z
      .string()
      .optional()
      .refine(
        (val) => {
          if (!val || val.trim() === '') {
            return true;
          }
          try {
            JSON.parse(val);
            return true;
          } catch {
            return false;
          }
        },
        {message: 'Must be valid JSON'}
      )
  })
  .superRefine((data, ctx) => {
    const names: string[] = [];
    (data.agents || []).forEach((agent, index) => {
      const trimmed = agent.name?.trim();
      if (trimmed) {
        if (names.includes(trimmed)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Agent name "${trimmed}" already exists in this system`,
            path: ['agents', index, 'name']
          });
        }
        names.push(trimmed);
      }
    });
  });

export type FormValues = z.infer<typeof UpdateMASFormSchema>;
