import {z} from 'zod';

export interface ConceptAttributes {
  domain?: string | null;
  capabilities?: unknown;
}

export interface Concept {
  concept_id: string;
  name: string;
  description?: string;
  type: string | null;
  attributes?: ConceptAttributes;
}

export interface RelationAttributes {
  source_name?: string;
  target_name?: string;
}

export interface Relation {
  id: string;
  node_ids: string[];
  relationship: string;
  attributes?: RelationAttributes;
}

export interface TraceNeighbor {
  to: string;
  relation: string;
}

export interface TopSimilarConcept {
  anchor_concept: string;
  firs_neighbour: TraceNeighbor[];
}

export interface SelectedEdge {
  from: string;
  relation: string;
  to: string;
}

export interface TraceIteration {
  iteration: number;
  anchor_concept: string;
  selected: SelectedEdge[];
  selected_paths_symbolic: string[];
  judge_reason_for_sufficiency: string;
}

export interface Winning {
  anchor_concept: string;
  reason_for_sufficiency: string;
}

export interface Trace {
  extracted_entity: string;
  tope_similar_concepts: TopSimilarConcept[];
  iterations: TraceIteration[];
  lanes_count?: number;
  sufficient?: boolean;
  winning?: Winning;
  llm_calls?: number;
}

export interface Entity {
  name: string;
  description?: string;
}

export interface EvidencePath {
  path_id: string;
  symbolic: string;
}

export interface EvidenceSummary {
  supporting_paths: number;
  unique_concepts: number;
}

export interface EvidenceDetails {
  concepts: Concept[];
  relations: Relation[];
}

export interface EvidenceMetadata {
  retrieval_mode?: string;
  pruning_applied?: boolean;
  llm_assisted?: boolean;
}

export interface Evidence {
  entity?: Entity;
  status?: string;
  summary?: EvidenceSummary;
  paths?: EvidencePath[];
  details?: EvidenceDetails;
  metadata?: EvidenceMetadata;
}

export interface ReasoningHistoryContent {
  evidence?: Evidence;
  trace?: Trace;
}

export interface ReasoningHistoryRecord {
  id: string;
  type: string;
  content: ReasoningHistoryContent;
}

export interface ReasoningHistoryResponse {
  reasoner_cognition_response_id?: string;
  status?: string;
  reasoner_cognition_request_id?: string;
  records: ReasoningHistoryRecord[];
  meta?: unknown;
  returned?: number;
  source?: string;
  mode?: string;
  lanes?: number;
}

export interface QueryHistoryListItem {
  id: string;
  reasoner_id: string;
  workspace_id: string;
  request_id: string | null;
  response_id: string | null;
  query_input: string;
  created_at: string;
  created_by: string;
}

export interface QueryHistoryRecord {
  id: string;
  reasoner_id: string;
  workspace_id: string;
  request_id: string | null;
  response_id: string | null;
  response_data: {
    meta?: unknown;
    status?: unknown;
    records?: unknown;
    response?: ReasoningHistoryResponse;
    query_input?: string;
    reasoner_cognition_request_id?: string | null;
    reasoner_cognition_response_id?: string | null;
  };
  query_input?: string;
  created_at: string;
}

const ConceptAttributesSchema = z.object({
  domain: z.string().nullable().optional(),
  capabilities: z.unknown().nullable().optional()
});

const ConceptSchema = z.object({
  concept_id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  type: z.string().nullable(),
  attributes: ConceptAttributesSchema.optional()
});

const RelationAttributesSchema = z.object({
  source_name: z.string().optional(),
  target_name: z.string().optional()
});

const RelationSchema = z.object({
  id: z.string(),
  node_ids: z.array(z.string()),
  relationship: z.string(),
  attributes: RelationAttributesSchema.optional()
});

const ConceptTopKResultSchema = z.object({
  distance: z.number(),
  concept: ConceptSchema,
  relations: z.array(RelationSchema).optional(),
  neighbor_concepts: z.array(ConceptSchema).optional()
});

const ConceptTopKEntrySchema = z.object({
  entity_name: z.string().optional(),
  results: z.array(ConceptTopKResultSchema).optional()
});

const TraceNeighborSchema = z.object({
  to: z.string(),
  relation: z.string()
});

const TopSimilarConceptSchema = z.object({
  anchor_concept: z.string(),
  firs_neighbour: z.array(TraceNeighborSchema)
});

const SelectedEdgeSchema = z.object({
  from: z.string(),
  relation: z.string(),
  to: z.string()
});

const TraceIterationSchema = z.object({
  iteration: z.number(),
  anchor_concept: z.string(),
  selected: z.array(SelectedEdgeSchema),
  selected_paths_symbolic: z.array(z.string()),
  judge_reason_for_sufficiency: z.string()
});

const WinningSchema = z.object({
  anchor_concept: z.string(),
  reason_for_sufficiency: z.string()
});

const TraceSchema = z.object({
  extracted_entity: z.string(),
  tope_similar_concepts: z.array(TopSimilarConceptSchema),
  iterations: z.array(TraceIterationSchema),
  lanes_count: z.number().optional(),
  sufficient: z.boolean().optional(),
  winning: WinningSchema.optional(),
  llm_calls: z.number().optional()
});

const EntitySchema = z.object({
  name: z.string(),
  description: z.string().optional()
});

const EvidencePathSchema = z.object({
  path_id: z.string(),
  symbolic: z.string()
});

const EvidenceSummarySchema = z.object({
  supporting_paths: z.number(),
  unique_concepts: z.number()
});

const EvidenceDetailsSchema = z.object({
  concepts: z.array(ConceptSchema),
  relations: z.array(RelationSchema)
});

const EvidenceMetadataSchema = z.object({
  retrieval_mode: z.string().optional(),
  pruning_applied: z.boolean().optional(),
  llm_assisted: z.boolean().optional()
});

const EvidenceSchema = z.object({
  entity: EntitySchema.optional(),
  status: z.string().optional(),
  summary: EvidenceSummarySchema.optional(),
  paths: z.array(EvidencePathSchema).optional(),
  details: EvidenceDetailsSchema.optional(),
  metadata: EvidenceMetadataSchema.optional()
});

const BackendContentSchema = z.object({
  concepts_top_k: z.array(ConceptTopKEntrySchema).optional(),
  evidence: EvidenceSchema.optional(),
  trace: TraceSchema.optional()
});

const BackendRecordSchema = z.object({
  id: z.string(),
  type: z.string(),
  content: BackendContentSchema
});

export const BackendResponseSchema = z
  .object({
    records: z.array(BackendRecordSchema),
    meta: z.unknown().optional(),
    status: z.string().optional(),
    reasoner_cognition_request_id: z.string().optional(),
    reasoner_cognition_response_id: z.string().optional(),
    returned: z.number().optional(),
    source: z.string().optional(),
    mode: z.string().optional(),
    lanes: z.number().optional()
  })
  .passthrough();

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

export const QueryHistoryListResponseSchema = z.object({
  records: z.array(QueryHistoryListItemSchema),
  total: z.number()
});

export type BackendResponse = z.infer<typeof BackendResponseSchema>;

export interface ReasoningHistoryEventsFilter {
  reasoner_id?: string;
  request_id?: string | null;
  response_id?: string | null;
  created_by?: string;
  start_date?: string;
  end_date?: string;
  limit?: number;
  offset?: number;
}
