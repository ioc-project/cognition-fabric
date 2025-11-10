import {type ClassValue, clsx} from 'clsx';
import {twMerge} from 'tailwind-merge';
import {uniqueNamesGenerator, Config, adjectives, colors, animals} from 'unique-names-generator';
import {z} from 'zod';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const customConfig: Config = {
  dictionaries: [adjectives, colors, animals],
  separator: '-',
  length: 2
};

export const randomName = () => {
  return uniqueNamesGenerator(customConfig);
};

// Used to interpret the response from an API call and attempt to
// return the most relevant error message to the user
export const parseError = (error: unknown) => {
  if (!error) {
    return 'Unknown error';
  }
  if (typeof error === 'string') {
    return error;
  }
  if (
    // If API returns {"error": "some error message""}
    typeof error === 'object' &&
    (error as any)?.response?.data?.error
  ) {
    return (error as any)?.response?.data?.error;
  }
  if (
    // If API returns {"message": "some error message""}
    typeof error === 'object' &&
    (error as any)?.response?.data?.message
  ) {
    return (error as any)?.response?.data?.message;
  }
  if (
    // API returns a raw string error
    typeof error === 'object' &&
    (error as any)?.response?.data
  ) {
    return (error as any)?.response?.data;
  }
  // If the error is actually a JS error object
  if (typeof error === 'object' && 'message' in error) {
    return (error as any).message;
  }
  return 'Unknown error';
};

export const secondsToCron = (seconds: number): string => {
  if (seconds <= 0 || seconds > 86400) {
    throw new Error('Interval must be between 1 second and 86400 seconds (24 hours).');
  }

  const secondsInMinute = 60;
  const minutesInHour = 60;
  const hoursInDay = 24;

  if (seconds < secondsInMinute) {
    // Interval is in seconds
    return `*/${seconds} * * * * *`;
  } else if (seconds < secondsInMinute * minutesInHour) {
    // Interval is in minutes
    const intervalInMinutes = Math.round(seconds / secondsInMinute);
    return `0 */${intervalInMinutes} * * * *`;
  } else if (seconds < secondsInMinute * minutesInHour * hoursInDay) {
    // Interval is in hours
    const intervalInHours = Math.round(seconds / (secondsInMinute * minutesInHour));
    return `0 0 */${intervalInHours} * * *`;
  } else {
    // Interval is 24 hours
    return `0 0 0 * * *`;
  }
};

export const cronToSeconds = (cron: string): number | undefined => {
  const parts = cron.split(' ');
  if (parts.length !== 6) {
    return;
  }

  const [secPart, minPart, hourPart, dayPart] = parts;

  let seconds = 0;

  if (secPart.startsWith('*/')) {
    seconds += parseInt(secPart.slice(2));
  }

  if (minPart.startsWith('*/')) {
    seconds += parseInt(minPart.slice(2)) * 60;
  }

  if (hourPart.startsWith('*/')) {
    seconds += parseInt(hourPart.slice(2)) * 3600;
  }

  if (dayPart.startsWith('*/')) {
    seconds += parseInt(dayPart.slice(2)) * 86400;
  }

  return seconds;
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

export const validateEmail = (email: string): boolean => {
  const regexp = new RegExp(
    /^(([^<>()[\]\\.,;:\s@"]+(\.[^<>()[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/
  );
  return regexp.test(email);
};

// Define the generic validation function
export const validateForm = <T>(schema: z.ZodSchema<T>, values: T) => {
  const result = schema.safeParse(values);
  if (!result.success) {
    return {success: false, errors: result.error.errors};
  }
  return {success: true, data: result.data};
};
