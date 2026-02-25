import type {components} from '../generated/schema';

export type MemoryProvider = components['schemas']['MemoryProviderDetail'];
export type CreateMemoryProviderRequest = components['schemas']['MemoryProviderCreate'];
export type UpdateMemoryProviderRequest = components['schemas']['MemoryProviderUpdate'];
export type ListMemoryProviderResponse = components['schemas']['MemoryProviderList'];

export type ProviderType = 'native' | 'mem0' | 'hindsight';
export type AuthType = 'none' | 'api_key' | 'token';

export const PROVIDER_TYPE_LABELS: Record<ProviderType, string> = {
  native: 'Native',
  mem0: 'Mem0',
  hindsight: 'Hindsight'
};

export const AUTH_TYPE_LABELS: Record<AuthType, string> = {
  none: 'None',
  api_key: 'API Key',
  token: 'Token'
};
