import {type ClassValue, clsx} from 'clsx';
import {twMerge} from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const parseError = (error: unknown): string => {
  if (!error) return 'Unknown error';
  if (typeof error === 'string') return error;
  if (typeof error === 'object' && error && 'response' in (error as Record<string, unknown>)) {
    const resp = (error as any).response;
    if (resp?.data?.error && typeof resp.data.error === 'string') return resp.data.error;
    if (resp?.data?.message && typeof resp.data.message === 'string') return resp.data.message;
    if (typeof resp?.data === 'string') return resp.data;
  }
  if (error instanceof Error) return error.message || 'Error occurred';
  try {
    return JSON.stringify(error);
  } catch {
    return 'Unknown error';
  }
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
