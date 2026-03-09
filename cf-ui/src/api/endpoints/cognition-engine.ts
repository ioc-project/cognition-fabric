import {apiClient} from '../client';
import type {components} from '../generated/schema';

type CognitionEngineDetail = components['schemas']['CognitiveEngineDetail'];
type CognitionEngineListItem = components['schemas']['CognitiveEngineListItem'];
type CognitionEngineList = components['schemas']['CognitiveEngineList'];

export const cognitionEngineApi = {
  async list(workspaceId: string): Promise<CognitionEngineListItem[]> {
    const {data, error} = await apiClient.GET('/api/workspaces/{workspace_id}/cognition-engines', {
      params: {
        path: {workspace_id: workspaceId}
      }
    });

    if (error) {
      throw error;
    }
    return data.engines;
  },

  async get(workspaceId: string, id: string): Promise<CognitionEngineDetail> {
    const {data, error} = await apiClient.GET('/api/workspaces/{workspace_id}/cognition-engines/{cognitive_engine_id}', {
      params: {
        path: {workspace_id: workspaceId, cognitive_engine_id: id}
      }
    });

    if (error) {
      throw error;
    }
    return data;
  }
};

export type {CognitionEngineDetail, CognitionEngineListItem, CognitionEngineList};
