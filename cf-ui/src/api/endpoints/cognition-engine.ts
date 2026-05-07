import {apiClient} from '../client';
import type {components} from '../generated/schema';

type CognitionEngineDetail = components['schemas']['CognitionEngineDetail'];
type CognitionEngineListItem = components['schemas']['CognitionEngineListItem'];
type CognitionEngineList = components['schemas']['CognitionEngineList'];

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
    const {data, error} = await apiClient.GET('/api/workspaces/{workspace_id}/cognition-engines/{id}', {
      params: {
        path: {workspace_id: workspaceId, id: id}
      }
    });

    if (error) {
      throw error;
    }
    return data;
  }
};

export type {CognitionEngineDetail, CognitionEngineListItem, CognitionEngineList};
