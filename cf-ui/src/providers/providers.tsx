'use client';

import {ErrorBoundary} from 'react-error-boundary';
import {SWRConfig} from 'swr';
import {SessionProvider} from 'next-auth/react';
import {ErrorPage} from '@/components/router/error-page';
import {ThemeProvider} from './theme-provider';
import {swrFetcher} from '@/lib/swr-config';

export function Providers({children}: {children: React.ReactNode}) {
  const content = (
    <SWRConfig
      value={{
        revalidateOnFocus: false,
        revalidateOnReconnect: true,
        dedupingInterval: 60000,
        errorRetryCount: 3,
        fetcher: swrFetcher
      }}
    >
      {children}
    </SWRConfig>
  );

  return (
    <ThemeProvider>
      <SessionProvider>
        <ErrorBoundary fallbackRender={(props) => <ErrorPage {...props} />}>{content}</ErrorBoundary>
      </SessionProvider>
    </ThemeProvider>
  );
}
