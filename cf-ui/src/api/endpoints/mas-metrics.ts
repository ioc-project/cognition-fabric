import {fetchAPI} from '../client';

export interface MASMetricSeries {
  metric_name: string;
  agent_id: string;
  attributes: Record<string, unknown>;
  datapoints: [string, number][];
}

export interface CEMetricGroup {
  ce_id: string;
  series: MASMetricSeries[];
}

export interface MASMetricsResponse {
  workspace_id: string;
  mas_id: string;
  start_time: string;
  end_time: string;
  ces: CEMetricGroup[];
}

export interface MASMetricsFilters {
  start_time: string;
  end_time: string;
  ce_id?: string;
  agent_id?: string;
  metric_name?: string;
}

export const masMetricsApi = {
  fetch: async (workspaceId: string, masId: string, filters: MASMetricsFilters): Promise<MASMetricsResponse> => {
    const params = new URLSearchParams({
      start_time: filters.start_time,
      end_time: filters.end_time
    });
    if (filters.ce_id) {
      params.append('ce_id', filters.ce_id);
    }
    if (filters.agent_id) {
      params.append('agent_id', filters.agent_id);
    }
    if (filters.metric_name) {
      params.append('metric_name', filters.metric_name);
    }

    return fetchAPI<MASMetricsResponse>(`/api/workspaces/${workspaceId}/multi-agentic-systems/${masId}/metrics?${params}`);
  }
};
