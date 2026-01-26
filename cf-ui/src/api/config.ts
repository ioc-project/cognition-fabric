export interface ApiConfig {
  baseUrl: string;
  timeout: number;
  headers: Record<string, string>;
}

let apiConfig: ApiConfig = {
  baseUrl: process.env.CFN_UI_API_BASE_URL || '',
  timeout: parseInt(process.env.CFN_UI_API_TIMEOUT || '15000', 10),
  headers: {
    'Content-Type': 'application/json'
  }
};

export function getApiConfig(): Readonly<ApiConfig> {
  return apiConfig;
}

export function updateApiConfig(updates: Partial<ApiConfig>): void {
  apiConfig = {
    ...apiConfig,
    ...updates,
    headers: {
      ...apiConfig.headers,
      ...(updates.headers || {})
    }
  };
}

export function resetApiConfig(): void {
  apiConfig = {
    baseUrl: process.env.CFN_UI_API_BASE_URL || '',
    timeout: parseInt(process.env.CFN_UI_API_TIMEOUT || '15000', 10),
    headers: {
      'Content-Type': 'application/json'
    }
  };
}
