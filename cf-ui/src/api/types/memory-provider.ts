import type {components} from '../generated/schema';

// Base types from generated schema
export type MemoryProviderBase = components['schemas']['MemoryProviderDetail'];
export type CreateMemoryProviderRequestBase = components['schemas']['MemoryProviderCreate'];
export type UpdateMemoryProviderRequestBase = components['schemas']['MemoryProviderUpdate'];
export type ListMemoryProviderResponse = components['schemas']['MemoryProviderList'];

export interface MemoryProviderAuthCredentials {
  api_key?: string;
  access_token?: string;
  refresh_token?: string;
  token_type?: string;
  expires_at?: string;
  username?: string;
  password?: string;
  header_name?: string;
  header_value?: string;
}

export interface MemoryProviderAuthConfig {
  type: 'none' | 'token' | 'bearer' | 'basic' | 'custom';
  credentials?: MemoryProviderAuthCredentials;
}

export interface MemoryProviderConfig {
  url: string;
  auth?: MemoryProviderAuthConfig;
}

export interface MemoryProvider extends Omit<MemoryProviderBase, 'config'> {
  description?: string;
  config: MemoryProviderConfig | Record<string, unknown> | null;
}

export interface CreateMemoryProviderRequest extends Omit<CreateMemoryProviderRequestBase, 'config'> {
  description?: string;
  config: MemoryProviderConfig;
}

export interface UpdateMemoryProviderRequest extends Omit<UpdateMemoryProviderRequestBase, 'config'> {
  description?: string;
  config?: MemoryProviderConfig | Record<string, unknown>;
}

export type AuthType = 'none' | 'token' | 'bearer' | 'basic' | 'custom';

export const AUTH_TYPE_LABELS: Record<AuthType, string> = {
  none: 'None',
  token: 'API Key',
  bearer: 'Bearer Token',
  basic: 'Basic Auth',
  custom: 'Custom Header'
};
