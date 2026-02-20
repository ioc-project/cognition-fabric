'use client';

import {Layout} from '@/components/layout/layout';
import {useSession} from 'next-auth/react';
import {Suspense, useEffect} from 'react';
import {useRouter} from 'next/navigation';
import {LoaderRelative} from '@/components/ui/loading';

function ProtectedLayoutContent({children}: {children: React.ReactNode}) {
  return <Layout>{children}</Layout>;
}

export default function ProtectedLayout({children}: {children: React.ReactNode}) {
  const {status} = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.replace('/login');
    }
  }, [status, router]);

  if (status !== 'authenticated') {
    return (
      <div className="p-6">
        <LoaderRelative />
      </div>
    );
  }

  return (
    <Suspense
      fallback={
        <div className="p-6">
          <LoaderRelative />
        </div>
      }
    >
      <ProtectedLayoutContent>{children}</ProtectedLayoutContent>
    </Suspense>
  );
}
