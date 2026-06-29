// Copyright 2026 Cisco Systems, Inc. and its affiliates
//
// SPDX-License-Identifier: Apache-2.0

'use client';

import {Button} from '@/components/ui/button';
import {FallbackProps} from 'react-error-boundary';
import {AlertCircle, Info} from 'lucide-react';

interface ErrorPageProps extends FallbackProps {
  className?: string;
  showRefreshButton?: boolean;
  info?: boolean;
}

export const ErrorPage = ({error, className, showRefreshButton = true, info = true, resetErrorBoundary}: ErrorPageProps) => {
  let errorMessage: string;

  if (error instanceof Error) {
    errorMessage = error.message;
  } else if (typeof error === 'string') {
    errorMessage = error;
  } else {
    errorMessage = 'Unknown error';
  }

  return (
    <div className={`flex flex-col items-center justify-center text-center py-20 w-full ${className ?? ''}`}>
      <div>
        <div className="p-3 inline-flex items-center align-center rounded-full">
          {info ? <Info className="w-14 h-14" /> : <AlertCircle className="w-14 h-14 text-destructive" />}
        </div>
      </div>
      <h1 className="text-[40px]">Oops!</h1>
      <p className="text-muted-foreground italic">An unexpected error has occurred. Sorry about that!</p>
      <div className="flex flex-col gap-2 text-center text-xs text-muted-foreground mt-4">
        <p>
          <b>Data of error:</b>
        </p>
        {errorMessage && error.name ? (
          <p>
            <b>{error.name}</b>: {errorMessage}
          </p>
        ) : (
          <p>{errorMessage}</p>
        )}
        <p>Please try refreshing the page, or contact support if the problem persists.</p>
      </div>
      {showRefreshButton && (
        <Button className="mt-6" onClick={() => resetErrorBoundary()}>
          Refresh
        </Button>
      )}
    </div>
  );
};
