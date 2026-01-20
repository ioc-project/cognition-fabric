import {fetchAPI} from '../client';
import {
  QueryHistoryListResponseSchema,
  QueryHistoryListItem,
  BackendResponseSchema,
  BackendResponse,
  ReasoningHistoryResponse,
  ReasoningHistoryRecord,
  Concept,
  Relation,
  ReasoningHistoryEventsFilter
} from '../types/reasoning-history';
import {isObject, hasArrayProperty, hasObjectProperty} from '@/utils/type-guards';

function hasResponseDataWrapper(data: unknown): data is {response_data: {response: unknown}} {
  return isObject(data) && hasObjectProperty(data, 'response_data') && hasObjectProperty(data.response_data, 'response');
}

function transformConceptsTopKToEvidence(data: unknown): ReasoningHistoryResponse | unknown {
  const actualData = hasResponseDataWrapper(data) ? data.response_data.response : data;

  if (!isObject(actualData) || !hasArrayProperty(actualData, 'records')) {
    return actualData;
  }

  const parsed = BackendResponseSchema.safeParse(actualData);
  if (!parsed.success) {
    console.error('Failed to parse reasoning history response:', parsed.error);
    return actualData;
  }

  const backendData = parsed.data;
  const firstRecord = backendData.records[0];

  if (!firstRecord?.content) {
    return actualData;
  }

  if (firstRecord.content.evidence || firstRecord.content.trace) {
    return actualData as ReasoningHistoryResponse;
  }

  if (firstRecord.content.concepts_top_k) {
    const allConcepts: Concept[] = [];
    const allRelations: Relation[] = [];
    const conceptIds = new Set<string>();
    const relationIds = new Set<string>();

    firstRecord.content.concepts_top_k.forEach((entityData) => {
      entityData.results?.forEach((result) => {
        if (result.concept && !conceptIds.has(result.concept.concept_id)) {
          allConcepts.push(result.concept);
          conceptIds.add(result.concept.concept_id);
        }

        result.relations?.forEach((relation) => {
          if (!relationIds.has(relation.id)) {
            allRelations.push(relation);
            relationIds.add(relation.id);
          }
        });

        result.neighbor_concepts?.forEach((concept) => {
          if (!conceptIds.has(concept.concept_id)) {
            allConcepts.push(concept);
            conceptIds.add(concept.concept_id);
          }
        });
      });
    });

    const transformedRecord: ReasoningHistoryRecord = {
      id: firstRecord.id,
      type: firstRecord.type,
      content: {
        evidence: {
          details: {
            concepts: allConcepts,
            relations: allRelations
          }
        }
      }
    };

    const response: ReasoningHistoryResponse = {
      ...(actualData as BackendResponse),
      records: [transformedRecord]
    } as ReasoningHistoryResponse;

    return response;
  }

  return actualData;
}

export const reasoningHistoryApi = {
  list: async (workspaceId: string, filters: ReasoningHistoryEventsFilter = {}): Promise<{records: QueryHistoryListItem[]; total: number}> => {
    const defaulted: ReasoningHistoryEventsFilter = {
      limit: filters.limit ?? 50,
      offset: filters.offset ?? 0,
      reasoner_id: filters.reasoner_id,
      request_id: filters.request_id ?? undefined,
      response_id: filters.response_id ?? undefined,
      created_by: filters.created_by,
      start_date: filters.start_date,
      end_date: filters.end_date
    };

    const body = Object.fromEntries(Object.entries(defaulted).filter(([, v]) => v !== undefined));

    const response = await fetchAPI(`/api/workspaces/${workspaceId}/reasoning_history/events`, {
      method: 'POST',
      body: JSON.stringify(body)
    });
    const parsed = QueryHistoryListResponseSchema.parse(response);
    return {records: parsed.records, total: parsed.total};
  },

  get: async (workspaceId: string, historyId: string): Promise<ReasoningHistoryResponse> => {
    const response = await fetchAPI(`/api/workspaces/${workspaceId}/reasoning_history/events/${historyId}`);
    const transformed = transformConceptsTopKToEvidence(response);
    return transformed as ReasoningHistoryResponse;
  }
};
