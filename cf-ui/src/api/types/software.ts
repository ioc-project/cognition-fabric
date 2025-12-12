import {z} from 'zod';

const numberOrString = z.union([z.number(), z.string().transform((val) => (val === '' ? undefined : Number(val)))]).optional();

// Using explicit type with @ts-expect-error because Zod's recursive lazy types have complex input/output types
// The schema correctly transforms string inputs to numbers at runtime
// @ts-expect-error Zod input type includes string but output type is number
const AttributeValueSchema: z.ZodType<{
  stringValue?: string;
  intValue?: number;
  doubleValue?: number;
  boolValue?: boolean;
  arrayValue?: unknown[];
  kvlistValue?: unknown[];
}> = z.lazy(() =>
  z.object({
    stringValue: z.string().optional(),
    intValue: z.union([z.number(), z.string().transform(Number)]).optional(),
    doubleValue: z.union([z.number(), z.string().transform(Number)]).optional(),
    boolValue: z.boolean().optional(),
    arrayValue: z.array(AttributeValueSchema).optional(),
    kvlistValue: z.array(KeyValueSchema).optional()
  })
);

export type AttributeValue = z.infer<typeof AttributeValueSchema>;

const KeyValueSchema = z.object({
  key: z.string(),
  value: AttributeValueSchema.optional()
});

const ResourceSchema = z.object({
  attributes: z.array(KeyValueSchema).optional(),
  droppedAttributesCount: numberOrString
});

const InstrumentationScopeSchema = z.object({
  name: z.string().optional(),
  version: z.string().optional(),
  attributes: z.array(KeyValueSchema).optional(),
  droppedAttributesCount: numberOrString
});

const SpanStatusSchema = z.object({
  message: z.string().optional(),
  code: z.union([z.number(), z.string()]).optional()
});

const SpanEventSchema = z.object({
  timeUnixNano: z.string().optional(),
  name: z.string().optional(),
  attributes: z.array(KeyValueSchema).optional(),
  droppedAttributesCount: numberOrString
});

const SpanSchema = z.object({
  traceId: z.string().optional(),
  spanId: z.string().optional(),
  traceState: z.string().optional(),
  parentSpanId: z.string().optional(),
  name: z.string().optional(),
  kind: z.union([z.string(), z.number()]).optional(),
  startTimeUnixNano: z.string().optional(),
  endTimeUnixNano: z.string().optional(),
  attributes: z.array(KeyValueSchema).optional(),
  droppedAttributesCount: numberOrString,
  events: z.array(SpanEventSchema).optional(),
  droppedEventsCount: numberOrString,
  status: SpanStatusSchema.optional()
});

const ScopeSpanSchema = z.object({
  scope: InstrumentationScopeSchema.optional(),
  spans: z.array(SpanSchema).optional(),
  schemaUrl: z.string().optional()
});

const ResourceSpanSchema = z.object({
  resource: ResourceSchema.optional(),
  scopeSpans: z.array(ScopeSpanSchema).optional(),
  schemaUrl: z.string().optional()
});

const ExtractionPreprocessingSchema = z.object({
  lowercase: z.boolean().optional(),
  tokenizer: z.string().optional(),
  remove_punctuation: z.boolean().optional()
});

const ExtractionConfigSchema = z.object({
  use_crf: z.boolean().optional(),
  confidence_threshold: numberOrString,
  entities: z.array(z.string()).optional(),
  preprocessing: ExtractionPreprocessingSchema.optional()
});

const TemplateConfigSchema = z
  .object({
    extraction: ExtractionConfigSchema.optional(),
    resourceSpans: z.array(ResourceSpanSchema).optional()
  })
  .passthrough();

export const SoftwareTemplateSchema = z.object({
  id: z.string().uuid(),
  type: z.enum(['KnowledgeAdapterTemplates', 'ReasonerTemplates']),
  config: TemplateConfigSchema.optional(),
  created_at: z.string(),
  updated_at: z.string()
});
export type SoftwareTemplate = z.infer<typeof SoftwareTemplateSchema>;

export const ListSoftwareTemplatesResponseSchema = z.array(SoftwareTemplateSchema);
export type ListSoftwareTemplatesResponse = z.infer<typeof ListSoftwareTemplatesResponseSchema>;
