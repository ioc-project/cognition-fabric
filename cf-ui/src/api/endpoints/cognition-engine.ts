import {apiClient} from '../client';
import type {components} from '../generated/schema';

type CognitionEngineDetail = components['schemas']['CognitionEngineDetail'];
type CognitionEngineListItem = components['schemas']['CognitionEngineListItem'];
type CognitionEngineList = components['schemas']['CognitionEngineList'];
type CognitionEnginePatchRequest = components['schemas']['CognitionEnginePatchRequest'];

export const cognitionEngineApi = {
  async list(cfnId?: string): Promise<CognitionEngineListItem[]> {
    const {data, error} = await apiClient.GET('/api/cognition-engines', {
      params: {
        query: cfnId ? {cfn_id: cfnId} : undefined
      }
    });

    if (error) {
      throw error;
    }
    return data.cognition_engines;
  },

  async get(id: string): Promise<CognitionEngineDetail> {
    const {data, error} = await apiClient.GET('/api/cognition-engines/{ce_id}', {
      params: {
        path: {ce_id: id}
      }
    });

    if (error) {
      throw error;
    }
    return data;
  },

  async delete(id: string): Promise<void> {
    const {error} = await apiClient.DELETE('/api/cognition-engines/{ce_id}', {
      params: {
        path: {ce_id: id}
      }
    });

    if (error) {
      throw error;
    }
  },

  async patch(id: string, payload: CognitionEnginePatchRequest): Promise<CognitionEngineDetail> {
    const {data, error} = await apiClient.PATCH('/api/cognition-engines/{ce_id}', {
      params: {
        path: {ce_id: id}
      },
      body: payload
    });

    if (error) {
      throw error;
    }
    return data;
  }
};

export type {CognitionEngineDetail, CognitionEngineListItem, CognitionEngineList, CognitionEnginePatchRequest};
