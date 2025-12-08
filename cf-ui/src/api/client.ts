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

export type RequestInterceptor = (url: string, options: RequestInit) => RequestInit | Promise<RequestInit>;
export type ResponseInterceptor = <T>(response: Response, data: T) => T | Promise<T>;
export type ErrorInterceptor = (error: ApiError) => never | Promise<never>;

const requestInterceptors: RequestInterceptor[] = [];
const responseInterceptors: ResponseInterceptor[] = [];
const errorInterceptors: ErrorInterceptor[] = [];

export function registerRequestInterceptor(interceptor: RequestInterceptor): () => void {
  requestInterceptors.push(interceptor);
  return () => {
    const index = requestInterceptors.indexOf(interceptor);
    if (index > -1) {
      requestInterceptors.splice(index, 1);
    }
  };
}

export function registerResponseInterceptor(interceptor: ResponseInterceptor): () => void {
  responseInterceptors.push(interceptor);
  return () => {
    const index = responseInterceptors.indexOf(interceptor);
    if (index > -1) {
      responseInterceptors.splice(index, 1);
    }
  };
}

export function registerErrorInterceptor(interceptor: ErrorInterceptor): () => void {
  errorInterceptors.push(interceptor);
  return () => {
    const index = errorInterceptors.indexOf(interceptor);
    if (index > -1) {
      errorInterceptors.splice(index, 1);
    }
  };
}

export async function fetchAPI<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const config = getApiConfig();
  const controller = new AbortController();
  const timeout = typeof options?.signal === 'undefined' ? config.timeout : undefined;

  let timeoutId: NodeJS.Timeout | undefined;
  if (typeof timeout === 'number') {
    timeoutId = setTimeout(() => controller.abort('Request timeout'), timeout);
  }

  let requestOptions: RequestInit = {
    ...options,
    signal: options?.signal ?? controller.signal,
    headers: {
      ...config.headers,
      ...options?.headers
    }
  };

  for (const interceptor of requestInterceptors) {
    requestOptions = await interceptor(`${config.baseUrl}${endpoint}`, requestOptions);
  }

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

      // Apply error interceptors
      for (const interceptor of errorInterceptors) {
        await interceptor(error);
      }

      throw error;
    }

    // Handle 204 No Content
    if (response.status === 204) {
      return undefined as T;
    }

    let data = (await response.json()) as T;

    // Apply response interceptors
    for (const interceptor of responseInterceptors) {
      data = await interceptor(response, data);
    }

    return data;
  } catch (error) {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }

    // If it's an ApiError that's already been through interceptors, just re-throw
    if (error instanceof ApiError) {
      throw error;
    }

    // For other errors (network, abort, etc.), create an ApiError
    const apiError = new ApiError(error instanceof Error ? error.message : 'Network request failed', 0, 'NetworkError');

    // Apply error interceptors for network errors
    for (const interceptor of errorInterceptors) {
      await interceptor(apiError);
    }

    throw apiError;
  }
}

export type {ApiError};
