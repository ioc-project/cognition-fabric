import {z} from 'zod';

export const ConceptAttributesSchema = z.object({
  domain: z.string().nullable().optional(),
  capabilities: z.unknown().nullable().optional()
});

export type ConceptAttributes = z.infer<typeof ConceptAttributesSchema>;

export const ConceptSchema = z.object({
  concept_id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  type: z.string(),
  attributes: ConceptAttributesSchema.optional()
});

export type Concept = z.infer<typeof ConceptSchema>;

export const RelationAttributesSchema = z.object({
  source_name: z.string().optional(),
  target_name: z.string().optional()
});

export type RelationAttributes = z.infer<typeof RelationAttributesSchema>;

// Relation schema
export const RelationSchema = z.object({
  id: z.string(),
  node_ids: z.array(z.string()),
  relationship: z.string(),
  attributes: RelationAttributesSchema.optional()
});

export type Relation = z.infer<typeof RelationSchema>;

export const ConceptTopKResultSchema = z.object({
  distance: z.number(),
  concept: ConceptSchema,
  relations: z.array(RelationSchema).optional(),
  neighbor_concepts: z.array(ConceptSchema).optional()
});

export type ConceptTopKResult = z.infer<typeof ConceptTopKResultSchema>;

export const ConceptTopKEntrySchema = z.object({
  entity_name: z.string().optional(),
  results: z.array(ConceptTopKResultSchema).optional()
});

export type ConceptTopKEntry = z.infer<typeof ConceptTopKEntrySchema>;

export const ConceptTopKSchema = z.object({
  distance: z.number(),
  concept: ConceptSchema,
  relations: z.array(RelationSchema).optional(),
  neighbor_concepts: z.array(ConceptSchema).optional()
});

export type ConceptTopK = z.infer<typeof ConceptTopKSchema>;

export const EvidencePathStepSchema = z.object({
  kind: z.enum(['concept', 'relation']),
  value: z.union([ConceptSchema, RelationSchema])
});

export type EvidencePathStep = z.infer<typeof EvidencePathStepSchema>;

export const EvidencePathsSchema = z.object({
  selected_structured: z.array(z.array(EvidencePathStepSchema)).optional(),
  selected_nl: z.array(z.string()).optional(),
  sufficient: z.boolean().optional(),
  max_depth_reached: z.boolean().optional()
});

export type EvidencePaths = z.infer<typeof EvidencePathsSchema>;

export const TraceNeighborSchema = z.object({
  to: z.string(),
  relation: z.string()
});

export type TraceNeighbor = z.infer<typeof TraceNeighborSchema>;

export const TopSimilarConceptSchema = z.object({
  anchor_concept: z.string(),
  firs_neighbour: z.array(TraceNeighborSchema)
});

export type TopSimilarConcept = z.infer<typeof TopSimilarConceptSchema>;

export const SelectedEdgeSchema = z.object({
  from: z.string(),
  relation: z.string(),
  to: z.string()
});

export type SelectedEdge = z.infer<typeof SelectedEdgeSchema>;

export const TraceIterationSchema = z.object({
  iteration: z.number(),
  anchor_concept: z.string(),
  selected: z.array(SelectedEdgeSchema),
  selected_paths_symbolic: z.array(z.string()),
  judge_reason_for_sufficiency: z.string()
});

export type TraceIteration = z.infer<typeof TraceIterationSchema>;

export const WinningSchema = z.object({
  anchor_concept: z.string(),
  reason_for_sufficiency: z.string()
});

export type Winning = z.infer<typeof WinningSchema>;

export const TraceSchema = z.object({
  extracted_entity: z.string(),
  tope_similar_concepts: z.array(TopSimilarConceptSchema),
  iterations: z.array(TraceIterationSchema),
  lanes_count: z.number().optional(),
  sufficient: z.boolean().optional(),
  winning: WinningSchema.optional(),
  llm_calls: z.number().optional()
});

export type Trace = z.infer<typeof TraceSchema>;

export const EntitySchema = z.object({
  name: z.string(),
  description: z.string().optional()
});

export type Entity = z.infer<typeof EntitySchema>;

export const EvidencePathSchema = z.object({
  path_id: z.string(),
  symbolic: z.string()
});

export type EvidencePath = z.infer<typeof EvidencePathSchema>;

export const EvidenceSummarySchema = z.object({
  supporting_paths: z.number(),
  unique_concepts: z.number()
});

export type EvidenceSummary = z.infer<typeof EvidenceSummarySchema>;
export const EvidenceDetailsSchema = z.object({
  concepts: z.array(ConceptSchema),
  relations: z.array(RelationSchema)
});

export type EvidenceDetails = z.infer<typeof EvidenceDetailsSchema>;

export const EvidenceMetadataSchema = z.object({
  retrieval_mode: z.string().optional(),
  pruning_applied: z.boolean().optional(),
  llm_assisted: z.boolean().optional()
});

export type EvidenceMetadata = z.infer<typeof EvidenceMetadataSchema>;

export const EvidenceSchema = z.object({
  entity: EntitySchema.optional(),
  status: z.string().optional(),
  summary: EvidenceSummarySchema.optional(),
  paths: z.array(EvidencePathSchema).optional(),
  details: EvidenceDetailsSchema.optional(),
  metadata: EvidenceMetadataSchema.optional()
});

export type Evidence = z.infer<typeof EvidenceSchema>;

export const BackendContentSchema = z.object({
  concepts_top_k: z.array(ConceptTopKEntrySchema).optional(),
  evidence: EvidenceSchema.optional(),
  trace: TraceSchema.optional()
});

export type BackendContent = z.infer<typeof BackendContentSchema>;

export const BackendRecordSchema = z.object({
  id: z.string(),
  type: z.string(),
  content: BackendContentSchema
});

export type BackendRecord = z.infer<typeof BackendRecordSchema>;

export const BackendResponseSchema = z.object({
  records: z.array(BackendRecordSchema)
});

export type BackendResponse = z.infer<typeof BackendResponseSchema>;

export const ReasoningHistoryContentSchema = z.object({
  evidence: EvidenceSchema.optional(),
  trace: TraceSchema.optional()
});

export type ReasoningHistoryContent = z.infer<typeof ReasoningHistoryContentSchema>;

export const ReasoningHistoryRecordSchema = z.object({
  id: z.string(),
  type: z.string(),
  content: ReasoningHistoryContentSchema
});

export type ReasoningHistoryRecord = z.infer<typeof ReasoningHistoryRecordSchema>;

export const ReasoningHistoryResponseSchema = z.object({
  reasoner_cognition_response_id: z.string(),
  status: z.string(),
  reasoner_cognition_request_id: z.string(),
  records: z.array(ReasoningHistoryRecordSchema),
  meta: z.unknown().nullable()
});

export type ReasoningHistoryResponse = z.infer<typeof ReasoningHistoryResponseSchema>;

export const QueryHistoryListItemSchema = z.object({
  id: z.string(),
  reasoner_id: z.string(),
  workspace_id: z.string(),
  request_id: z.string().nullable(),
  response_id: z.string().nullable(),
  query_input: z.string(),
  created_at: z.string(),
  created_by: z.string()
});

export type QueryHistoryListItem = z.infer<typeof QueryHistoryListItemSchema>;

export const QueryHistoryRecordSchema = z.object({
  id: z.string(),
  reasoner_id: z.string(),
  workspace_id: z.string(),
  request_id: z.string(),
  response_id: z.string(),
  response_data: ReasoningHistoryResponseSchema,
  created_at: z.string()
});

export type QueryHistoryRecord = z.infer<typeof QueryHistoryRecordSchema>;

export const QueryHistoryListResponseSchema = z.object({
  records: z.array(QueryHistoryListItemSchema),
  total: z.number()
});

export type QueryHistoryListResponse = z.infer<typeof QueryHistoryListResponseSchema>;
