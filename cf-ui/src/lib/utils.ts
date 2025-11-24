import {type ClassValue, clsx} from 'clsx';
import {twMerge} from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const parseError = (error: unknown) => {
  if (!error) {
    return 'Unknown error';
  }
  if (typeof error === 'string') {
    return error;
  }
  if (typeof error === 'object' && (error as any)?.response?.data?.error) {
    return (error as any)?.response?.data?.error;
  }
  if (typeof error === 'object' && (error as any)?.response?.data?.message) {
    return (error as any)?.response?.data?.message;
  }
  if (typeof error === 'object' && (error as any)?.response?.data) {
    return (error as any)?.response?.data;
  }
  if (typeof error === 'object' && 'message' in error) {
    return (error as any).message;
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
    const isValid = result instanceof Date && !isNaN(result as any);
    if (!isValid) {
      return null;
    }
    return result;
  } catch {
    return null;
  }
};
