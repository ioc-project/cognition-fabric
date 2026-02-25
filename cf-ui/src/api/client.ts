import {getApiConfig} from './config';
import {getSession} from 'next-auth/react';
import createClient from 'openapi-fetch';
import type {paths} from './generated/schema';

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

let config = getApiConfig();
export let apiClient = createClient<paths>({
  baseUrl: config.baseUrl,
  headers: config.headers
});

export function recreateApiClient(newBaseUrl: string): void {
  config = {...config, baseUrl: newBaseUrl};
  apiClient = createClient<paths>({
    baseUrl: newBaseUrl,
    headers: config.headers
  });

  setupMiddleware();
}

function setupMiddleware() {
  apiClient.use({
    async onRequest({request}) {
      const session = await getSession();
      if (session?.accessToken) {
        request.headers.set('Authorization', `Bearer ${session.accessToken}`);
      }

      const timeout = config.timeout;
      if (timeout && !request.signal) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort('Request timeout'), timeout);

        (request as any).__timeoutId = timeoutId;

        return new Request(request, {signal: controller.signal});
      }

      return request;
    },

    async onResponse({response, request}) {
      const timeoutId = (request as any).__timeoutId as NodeJS.Timeout | undefined;
      if (timeoutId) {
        clearTimeout(timeoutId);
      }

      if (!response.ok) {
        let errorMessage = response.statusText;
        try {
          const errorData = await response.clone().json();
          errorMessage =
            (errorData && typeof errorData === 'object' && 'detail' in errorData ? errorData.detail : undefined) ||
            (errorData && typeof errorData === 'object' && 'message' in errorData ? errorData.message : undefined) ||
            (errorData && typeof errorData === 'object' && 'error' in errorData ? errorData.error : undefined) ||
            errorMessage;
        } catch {
          // Failed to parse error response as JSON
        }

        throw new ApiError(errorMessage, response.status, response.statusText);
      }

      return response;
    }
  });
}

setupMiddleware();

export async function fetchAPI<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const config = getApiConfig();
  const session = await getSession();
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
      ...(session?.accessToken && {
        Authorization: `Bearer ${session.accessToken}`
      }),
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
        errorMessage =
          (errorData && typeof errorData === 'object' && 'detail' in errorData ? errorData.detail : undefined) ||
          (errorData && typeof errorData === 'object' && 'message' in errorData ? errorData.message : undefined) ||
          (errorData && typeof errorData === 'object' && 'error' in errorData ? errorData.error : undefined) ||
          errorMessage;
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
