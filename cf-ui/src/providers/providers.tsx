'use client';

import {ErrorBoundary} from 'react-error-boundary';
import {SWRConfig} from 'swr';
import {SessionProvider} from 'next-auth/react';
import {useEffect} from 'react';
import {ErrorPage} from '@/components/router/error-page';
import {ThemeProvider} from './theme-provider';
import {swrFetcher} from '@/lib/swr-config';
import {initializeApiConfig} from '@/api/config';

export function Providers({children}: {children: React.ReactNode}) {
  useEffect(() => {
    initializeApiConfig().catch(console.error);
  }, []);

  const content = (
    <SWRConfig
      value={{
        revalidateOnFocus: false,
        revalidateOnReconnect: false,
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
      <SessionProvider refetchInterval={0} refetchOnWindowFocus={false}>
        <ErrorBoundary fallbackRender={(props) => <ErrorPage {...props} />}>{content}</ErrorBoundary>
      </SessionProvider>
    </ThemeProvider>
  );
}
