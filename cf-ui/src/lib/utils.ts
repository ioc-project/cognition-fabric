import {type ClassValue, clsx} from 'clsx';
import {twMerge} from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const parseError = (error: unknown): string => {
  if (!error) {
    return 'Unknown error';
  }
  if (typeof error === 'string') {
    return error;
  }

  if (typeof error === 'object' && error && 'response' in (error as Record<string, unknown>)) {
    const resp = (error as any).response;
    const data = resp?.data;
    if (data) {
      if (typeof data === 'string') {
        return data;
      }
      if (typeof data === 'object') {
        if (typeof data.error === 'string') {
          return data.error;
        }
        if (typeof data.message === 'string') {
          return data.message;
        }
      }
    }
    if (typeof resp?.statusText === 'string') {
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
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    const isValid = result instanceof Date && !isNaN(Number(result));
    if (!isValid) {
      return null;
    }
    return result;
  } catch {
    return null;
  }
};
