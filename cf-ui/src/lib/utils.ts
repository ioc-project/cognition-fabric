import {type ClassValue, clsx} from 'clsx';
import {twMerge} from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface ErrorResponse {
  response?: {
    data?: unknown;
    statusText?: string;
  };
}

function isErrorResponse(error: unknown): error is ErrorResponse {
  return typeof error === 'object' && error !== null && 'response' in error;
}

function isObjectWithProperty(obj: unknown, prop: string): obj is Record<string, unknown> {
  return typeof obj === 'object' && obj !== null && prop in obj;
}

export const parseError = (error: unknown): string => {
  if (!error) {
    return 'Unknown error';
  }
  if (typeof error === 'string') {
    return error;
  }

  if (isErrorResponse(error)) {
    const resp = error.response;
    const data = resp?.data;
    if (data) {
      if (typeof data === 'string') {
        return data;
      }
      if (isObjectWithProperty(data, 'error') && typeof data.error === 'string') {
        return data.error;
      }
      if (isObjectWithProperty(data, 'detail') && typeof data.detail === 'string') {
        return String(data.detail);
      }
      if (isObjectWithProperty(data, 'message') && typeof data.message === 'string') {
        return data.message;
      }
    }
    if (typeof resp?.statusText === 'string' && resp.statusText) {
      return resp.statusText;
    }
  }

  if (error instanceof Error) {
    return error.message || 'Error occurred';
  }

  return 'Unknown error';
};

export const safeGetDate = (date?: string | number | Date | null | undefined): null | Date => {
  if (!date) {
    return null;
  }

  try {
    const result = new Date(date);

    const isValid = result instanceof Date && !isNaN(Number(result));
    if (!isValid) {
      return null;
    }
    return result;
  } catch {
    return null;
  }
};

export const DATE_TIME_FORMAT_OPTIONS: Intl.DateTimeFormatOptions = {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
  timeZone: 'UTC'
} as const;

export function sortByCreatedAtDesc<T extends {created_at?: string | null}>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    if (!a.created_at && !b.created_at) {
      return 0;
    }
    if (!a.created_at) {
      return 1;
    }
    if (!b.created_at) {
      return -1;
    }
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });
}

export function formatJson(value: string): string {
  if (!value || value.trim() === '') {
    return value;
  }
  try {
    const parsed = JSON.parse(value);
    return JSON.stringify(parsed, null, 2);
  } catch {
    return value;
  }
}

export function validateJSON(jsonString: string): boolean {
  try {
    JSON.parse(jsonString);
    return true;
  } catch {
    return false;
  }
}
