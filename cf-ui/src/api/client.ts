const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || '';

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
  const controller = new AbortController();
  const timeout = typeof options?.signal === 'undefined' ? 15000 : undefined;
  let timeoutId: NodeJS.Timeout | undefined;
  if (typeof timeout === 'number') {
    timeoutId = setTimeout(() => controller.abort('Request timeout'), timeout);
  }
  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    signal: options?.signal ?? controller.signal,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers
    }
  });

  if (timeoutId) {
    clearTimeout(timeoutId);
  }

  if (!response.ok) {
    let errorMessage = response.statusText;
    try {
      const errorData = await response.json();
      errorMessage = (errorData).message || (errorData).error || errorMessage;
    } catch {
      // Failed to parse error response as JSON
    }
    throw new ApiError(errorMessage, response.status, response.statusText);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

export type {ApiError};
