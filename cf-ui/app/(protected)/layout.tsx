'use client';

import {Layout} from '@/components/layout/layout';
import {useSession} from 'next-auth/react';
import {Suspense, useEffect, useRef} from 'react';
import {usePathname, useRouter, useSearchParams} from 'next/navigation';
import {LoaderRelative} from '@/components/ui/loading';
import {workspaceApi, cfnApi} from '@/api/endpoints';
import {mutate as swrMutate} from 'swr';
import {swrKeys} from '@/lib/swr-config';

function EnsureDefaultWorkspace({children}: {children: React.ReactNode}) {
  const {status} = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const ensuredRef = useRef(false);

  useEffect(() => {
    if (status !== 'authenticated') {
      return;
    }
    if (searchParams.get('ensureDefault') !== '1') {
      return;
    }
    if (ensuredRef.current) {
      return;
    }

    ensuredRef.current = true;

    (async () => {
      try {
        const list = await workspaceApi.list();
        const hasDefault = (list.workspaces || []).some((w) => typeof w.name === 'string' && w.name.trim().toLowerCase() === 'default workspace');
        if (!hasDefault) {
          const cfnList = await cfnApi.list();
          const enabledCfn = (cfnList.nodes || []).find((cfn: any) => cfn.enabled);

          if (!enabledCfn?.id) {
            console.warn('No enabled CFN available to create default workspace');
            return;
          }

          // Admin user lookup commented out - not needed for workspace creation
          // try {
          //   const users = await userApi.list();
          //   const admin = (users.users || []).find((u) => typeof u.username === 'string' && u.username.trim().toLowerCase() === 'admin');
          // } catch {
          //   // Ignore error
          // }

          const created = await workspaceApi.create({
            name: 'Default Workspace',
            cfn_id: enabledCfn.id
          });

          if (created?.id) {
            await swrMutate(swrKeys.workspaces(), undefined, {revalidate: true});
          }
        }
      } catch {
        // Ignore error
      } finally {
        try {
          const params = new URLSearchParams(searchParams.toString());
          params.delete('ensureDefault');
          const nextUrl = params.toString() ? `${pathname}?${params.toString()}` : pathname;
          router.replace(nextUrl);
        } catch {
          // Ignore error
        }
      }
    })();
  }, [status, router, pathname, searchParams]);

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
      <EnsureDefaultWorkspace>{children}</EnsureDefaultWorkspace>
    </Suspense>
  );
}
