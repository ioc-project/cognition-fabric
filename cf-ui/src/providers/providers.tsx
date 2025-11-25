'use client';

import {ErrorBoundary} from 'react-error-boundary';
import {SWRConfig} from 'swr';
import {SessionProvider} from 'next-auth/react';
import {ErrorPage} from '@/components/router/error-page';
import {ThemeProvider} from './theme-provider';

export function Providers({children}: {children: React.ReactNode}) {
  return (
    <ThemeProvider>
      <SessionProvider>
        <ErrorBoundary fallbackRender={(props) => <ErrorPage {...props} />}>
          <SWRConfig
            value={{
              revalidateOnFocus: false,
              revalidateOnReconnect: true,
              dedupingInterval: 60000,
              errorRetryCount: 3,
              fetcher: (url: string) => fetch(url).then((res) => res.json())
            }}
          >
            {children}
          </SWRConfig>
        </ErrorBoundary>
      </SessionProvider>
    </ThemeProvider>
  );
}
