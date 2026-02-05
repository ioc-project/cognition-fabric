export interface ApiConfig {
  baseUrl: string;
  timeout: number;
  headers: Record<string, string>;
}

const getDefaultBaseUrl = (): string => {
  if (typeof window === 'undefined') {
    const url = process.env.CFN_UI_API_BASE_URL || '';
    console.log('[API Config] Server-side baseUrl:', url);
    return url;
  }

  const url = process.env.NEXT_PUBLIC_CFN_UI_API_BASE_URL || '';
  console.log('[API Config] Client-side baseUrl:', url);
  return url;
};

let apiConfig: ApiConfig = {
  baseUrl: getDefaultBaseUrl(),
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

  if (updates.baseUrl) {
    void import('./client').then(({recreateApiClient}) => {
      recreateApiClient(updates.baseUrl!);
    });
  }
}

export function resetApiConfig(): void {
  apiConfig = {
    baseUrl: getDefaultBaseUrl(),
    timeout: parseInt(process.env.CFN_UI_API_TIMEOUT || '15000', 10),
    headers: {
      'Content-Type': 'application/json'
    }
  };
}
