'use client';

import {ErrorBoundary} from 'react-error-boundary';
import {SWRConfig} from 'swr';
import {SessionProvider} from 'next-auth/react';
import {useEffect, useState} from 'react';
import {ErrorPage} from '@/components/router/error-page';
import {ThemeProvider} from './theme-provider';
import {swrFetcher} from '@/lib/swr-config';
import {updateApiConfig} from '@/api/config';

export function Providers({children}: {children: React.ReactNode}) {
  const [configLoaded, setConfigLoaded] = useState(false);

  useEffect(() => {
    fetch('/api/config')
      .then((res) => res.json())
      .then((config) => {
        if (config.apiBaseUrl) {
          updateApiConfig({baseUrl: config.apiBaseUrl});
        }
        setConfigLoaded(true);
      })
      .catch((error) => {
        console.error('[Providers] Failed to load runtime config:', error);
        setConfigLoaded(true);
      });
  }, []);

  if (!configLoaded) {
    return null;
  }

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
