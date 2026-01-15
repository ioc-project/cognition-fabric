/**
 * Type guard utilities for runtime type checking
 */

export function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isArray(value: unknown): value is unknown[] {
  return Array.isArray(value);
}

export function isString(value: unknown): value is string {
  return typeof value === 'string';
}

export function isNumber(value: unknown): value is number {
  return typeof value === 'number';
}

export function hasProperty<K extends string>(obj: unknown, key: K): obj is Record<K, unknown> {
  return isObject(obj) && key in obj;
}

export function hasStringProperty<K extends string>(obj: unknown, key: K): obj is Record<K, string> {
  return hasProperty(obj, key) && isString(obj[key]);
}

export function hasArrayProperty<K extends string>(obj: unknown, key: K): obj is Record<K, unknown[]> {
  return hasProperty(obj, key) && isArray(obj[key]);
}

export function hasObjectProperty<K extends string>(obj: unknown, key: K): obj is Record<K, Record<string, unknown>> {
  return hasProperty(obj, key) && isObject(obj[key]);
}
