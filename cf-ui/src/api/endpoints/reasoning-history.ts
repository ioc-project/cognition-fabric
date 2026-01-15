import {fetchAPI} from '../client';
import {QueryHistoryListResponseSchema, QueryHistoryListItem} from '../types/reasoning-history';

function transformConceptsTopKToEvidence(data: any): any {
  const content = data.records?.[0]?.content;

  if (content?.evidence || content?.trace) {
    return data;
  }

  if (content?.concepts_top_k) {
    const allConcepts: any[] = [];
    const allRelations: any[] = [];
    const conceptIds = new Set<string>();
    const relationIds = new Set<string>();

    content.concepts_top_k.forEach((entityData: any) => {
      entityData.results?.forEach((result: any) => {
        if (result.concept && !conceptIds.has(result.concept.concept_id)) {
          allConcepts.push(result.concept);
          conceptIds.add(result.concept.concept_id);
        }

        result.relations?.forEach((relation: any) => {
          if (!relationIds.has(relation.id)) {
            allRelations.push(relation);
            relationIds.add(relation.id);
          }
        });

        result.neighbor_concepts?.forEach((concept: any) => {
          if (!conceptIds.has(concept.concept_id)) {
            allConcepts.push(concept);
            conceptIds.add(concept.concept_id);
          }
        });
      });
    });

    // Build transformed structure
    return {
      ...data,
      records: [
        {
          id: data.records[0].id,
          type: data.records[0].type,
          content: {
            evidence: {
              details: {
                concepts: allConcepts,
                relations: allRelations
              }
            }
          }
        }
      ]
    };
  }

  return data;
}

export const reasoningHistoryApi = {
  list: async (workspaceId: string): Promise<QueryHistoryListItem[]> => {
    const response = await fetchAPI(`/api/workspaces/${workspaceId}/reasoning_history/events`, {
      method: 'POST',
      body: JSON.stringify({})
    });
    const parsed = QueryHistoryListResponseSchema.parse(response);
    return parsed.records;
  },

  get: async (workspaceId: string, historyId: string): Promise<any> => {
    const response = await fetchAPI(`/api/workspaces/${workspaceId}/reasoning_history/events/${historyId}`);

    const actualData = (response as any).response_data?.response || response;

    return transformConceptsTopKToEvidence(actualData);
  }
};
