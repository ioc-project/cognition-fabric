import type {components} from '../generated/schema';

type MemoryProviderDetail = components['schemas']['MemoryProviderDetail'];

export interface AgentConfig {
  agent_id: string;
  agentic_memory_provider_id?: string;
  config?: Record<string, unknown>;
}

export interface AgentWithMemory {
  agent_id: string;
  agentic_memory?: MemoryProviderDetail | null;
  config?: Record<string, unknown> | null;
}

export interface CreateMASRequest {
  name: string;
  description?: string;
  shared_memory_provider_id?: string;
  agents?: AgentConfig[];
  config?: Record<string, unknown>;
}

export interface CreateMASResponse {
  id: string;
  name: string;
}

export interface MAS {
  id: string;
  workspace_id: string;
  name: string;
  description?: string | null;
  shared_memory?: MemoryProviderDetail | null;
  agents?: AgentWithMemory[] | null;
  config?: Record<string, unknown> | null;
  created_at: string;
  updated_at?: string | null;
  created_by?: string | null;
  updated_by?: string | null;
}

export interface UpdateMASRequest {
  name?: string;
  description?: string;
  shared_memory_provider_id?: string;
  agents?: AgentConfig[];
  config?: Record<string, unknown>;
}

export interface ListMASResponse {
  systems: MAS[];
}
