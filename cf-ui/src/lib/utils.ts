// Copyright 2026 Cisco Systems, Inc. and its affiliates
//
// SPDX-License-Identifier: Apache-2.0

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

type ApiTimestamp = string | null | undefined;

// API timestamps must identify an instant. Never infer a zone from the browser.
export function parseTimestamp(value: ApiTimestamp): Date | null {
  if (typeof value !== 'string') {
    return null;
  }
  const parts = /^(\d{4})-(\d{2})-(\d{2})[Tt](\d{2}):(\d{2}):(\d{2})(?:\.\d+)?([Zz]|[+-](\d{2}):(\d{2}))$/.exec(value);
  if (!parts) {
    return null;
  }
  const [, yearText, monthText, dayText, hourText, minuteText, secondText, , offsetHourText, offsetMinuteText] = parts;
  const [year, month, day, hour, minute, second] = [yearText, monthText, dayText, hourText, minuteText, secondText].map(Number);
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
  if (
    !daysInMonth ||
    day < 1 ||
    day > daysInMonth ||
    hour > 23 ||
    minute > 59 ||
    second > 59 ||
    Number(offsetHourText || 0) > 23 ||
    Number(offsetMinuteText || 0) > 59
  ) {
    return null;
  }
  const timestamp = new Date(value);
  return Number.isNaN(timestamp.getTime()) ? null : timestamp;
}

export function formatTimestamp(
  value: ApiTimestamp,
  options: Intl.DateTimeFormatOptions = DATE_TIME_FORMAT_OPTIONS,
  placeholder = 'Unknown',
  timeZone = 'UTC'
): string {
  const timestamp = parseTimestamp(value);
  return timestamp ? new Intl.DateTimeFormat('en-US', {...options, timeZone, timeZoneName: 'short'}).format(timestamp) : placeholder;
}

export function formatRelativeTimestamp(value: ApiTimestamp, now = Date.now(), placeholder = 'Never'): string {
  const timestamp = parseTimestamp(value);
  if (!timestamp) {
    return placeholder;
  }
  const minutes = Math.floor((now - timestamp.getTime()) / 60000);
  if (minutes < 60) {
    return `${minutes}m ago`;
  }
  if (minutes < 1440) {
    return `${Math.floor(minutes / 60)}h ago`;
  }
  return `${Math.floor(minutes / 1440)}d ago`;
}

// Missing/invalid values retain their place after valid timestamps in descending lists.
export function compareTimestamps(a: ApiTimestamp, b: ApiTimestamp): number {
  const left = parseTimestamp(a)?.getTime();
  const right = parseTimestamp(b)?.getTime();
  if (left === undefined) {
    return right === undefined ? 0 : -1;
  }
  return right === undefined ? 1 : left - right;
}

export function formatAuditTimestamp(value: ApiTimestamp, shortYear = false): string {
  const timestamp = parseTimestamp(value);
  if (!timestamp) {
    return 'N/A';
  }
  const pad = (part: number, length = 2) => String(part).padStart(length, '0');
  const year = pad(timestamp.getUTCFullYear(), 4);
  const date = `${pad(timestamp.getUTCMonth() + 1)}/${pad(timestamp.getUTCDate())}/${shortYear ? year.slice(-2) : year}`;
  const time = `${pad(timestamp.getUTCHours())}:${pad(timestamp.getUTCMinutes())}:${pad(timestamp.getUTCSeconds())}`;
  return `${date} ${time}`;
}

export function sortByCreatedAtDesc<T extends {created_at?: string | null}>(items: T[]): T[] {
  return [...items].sort((a, b) => compareTimestamps(b.created_at, a.created_at));
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
