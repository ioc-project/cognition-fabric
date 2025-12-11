import {getApiConfig} from './config';

class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public statusText: string
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export async function fetchAPI<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const config = getApiConfig();
  const controller = new AbortController();
  const timeout = typeof options?.signal === 'undefined' ? config.timeout : undefined;

  let timeoutId: NodeJS.Timeout | undefined;
  if (typeof timeout === 'number') {
    timeoutId = setTimeout(() => controller.abort('Request timeout'), timeout);
  }

  const requestOptions: RequestInit = {
    ...options,
    signal: options?.signal ?? controller.signal,
    headers: {
      ...config.headers,
      ...options?.headers
    }
  };

  try {
    const response = await fetch(`${config.baseUrl}${endpoint}`, requestOptions);

    if (timeoutId) {
      clearTimeout(timeoutId);
    }

    if (!response.ok) {
      let errorMessage = response.statusText;
      try {
        const errorData = await response.json();
        errorMessage = errorData.message || errorData.error || errorMessage;
      } catch {
        // Failed to parse error response as JSON
      }

      const error = new ApiError(errorMessage, response.status, response.statusText);
      throw error;
    }

    if (response.status === 204) {
      return undefined as T;
    }

    const data = (await response.json()) as T;
    return data;
  } catch (error) {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }

    if (error instanceof ApiError) {
      throw error;
    }

    const apiError = new ApiError(error instanceof Error ? error.message : 'Network request failed', 0, 'NetworkError');
    throw apiError;
  }
}

export type {ApiError};
