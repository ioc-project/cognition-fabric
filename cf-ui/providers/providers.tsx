'use client';

import {ErrorBoundary} from 'react-error-boundary';
import {SWRConfig} from 'swr';
import {ErrorPage} from '@/components/router/error-page';

export function Providers({children}: {children: React.ReactNode}) {
  return (
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
  );
}
