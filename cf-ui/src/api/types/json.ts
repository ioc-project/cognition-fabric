import {z} from 'zod';

// Record of JSON values used across types as a flexible map
const JsonValueSchema: z.ZodType<unknown> = z.lazy(() =>
  z.union([z.string(), z.number(), z.boolean(), z.null(), z.array(JsonValueSchema), z.record(JsonValueSchema)])
);

export const JsonRecordSchema = z.record(JsonValueSchema);

export type JsonRecord = z.infer<typeof JsonRecordSchema>;
