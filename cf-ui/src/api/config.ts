export interface ApiConfig {
  baseUrl: string;
  timeout: number;
  headers: Record<string, string>;
}

async function fetchRuntimeConfig(): Promise<string> {
  try {
    const response = await fetch('/api/config');
    const config = await response.json();
    return config.apiBaseUrl || '';
  } catch (error) {
    console.error('Failed to fetch runtime config:', error);
    return '';
  }
}

const getDefaultBaseUrl = (): string => {
  // Server-side: always use CFN_UI_API_BASE_URL
  if (typeof window === 'undefined') {
    return process.env.CFN_UI_API_BASE_URL || '';
  }

  return process.env.NEXT_PUBLIC_CFN_UI_API_BASE_URL || '';
};

let apiConfig: ApiConfig = {
  baseUrl: getDefaultBaseUrl(),
  timeout: parseInt(process.env.CFN_UI_API_TIMEOUT || '15000', 10),
  headers: {
    'Content-Type': 'application/json'
  }
};

let runtimeConfigInitialized = false;

export async function initializeApiConfig(): Promise<void> {
  if (typeof window === 'undefined' || runtimeConfigInitialized) {
    return;
  }

  const runtimeBaseUrl = await fetchRuntimeConfig();
  if (runtimeBaseUrl) {
    apiConfig.baseUrl = runtimeBaseUrl;
    runtimeConfigInitialized = true;
  }
}

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
    baseUrl: getDefaultBaseUrl(),
    timeout: parseInt(process.env.CFN_UI_API_TIMEOUT || '15000', 10),
    headers: {
      'Content-Type': 'application/json'
    }
  };
}
