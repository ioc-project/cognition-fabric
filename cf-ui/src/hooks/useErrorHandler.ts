'use client';

import {useState, useCallback} from 'react';
import {parseError} from '@/lib/utils';

type ErrorHandlerOptions = {
  notify?: (message: string) => void;
};

export function useErrorHandler(options?: ErrorHandlerOptions) {
  const [error, setError] = useState<string | null>(null);

  const handleError = useCallback((err: unknown, message?: string) => {
    const errorMessage = parseError(err);
    const fullMessage = message ? `${message}: ${errorMessage}` : errorMessage;
    setError(fullMessage);
    if (options?.notify) options.notify(fullMessage);
    return errorMessage;
  }, [options?.notify]);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const withErrorHandler = useCallback(
    async <T>(fn: () => Promise<T>, errorMessage?: string): Promise<{success: boolean; data?: T; error?: string}> => {
      try {
        const data = await fn();
        clearError();
        return {success: true, data};
      } catch (err) {
        const error = handleError(err, errorMessage);
        return {success: false, error};
      }
    },
    [handleError, clearError]
  );

  return {error, handleError, clearError, withErrorHandler};
}
