'use client';

import {Layout} from '@/components/layout/layout';
import {useSession} from 'next-auth/react';
import {Suspense, useEffect, useRef} from 'react';
import {usePathname, useRouter, useSearchParams} from 'next/navigation';
import {LoaderRelative} from '@/components/ui/loading';
import {workspaceApi, userApi} from '@/api/endpoints';
import {mutate as swrMutate} from 'swr';
import {swrKeys} from '@/lib/swr-config';

function ProtectedLayoutContent({children}: {children: React.ReactNode}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const ensuredRef = useRef(false);

  useEffect(() => {
    if (searchParams.get('ensureDefault') !== '1') {
      return;
    }
    if (ensuredRef.current) {
      return;
    }

    ensuredRef.current = true;

    void (async () => {
      try {
        const list = await workspaceApi.list();
        const hasDefault = (list.workspaces || []).some((w) => typeof w.name === 'string' && w.name.trim().toLowerCase() === 'default workspace');
        if (!hasDefault) {
          let adminId: string | undefined = undefined;
          try {
            const users = await userApi.list();
            const admin = (users.users || []).find((u) => typeof u.username === 'string' && u.username.trim().toLowerCase() === 'admin');
            adminId = admin?.id;
          } catch (_e) {
            void 0;
          }

          const created = await workspaceApi.create({
            name: 'Default Workspace',
            ...(adminId ? {users: [adminId]} : {})
          });
          if (created?.id) {
            await swrMutate(swrKeys.workspaces(), undefined, {revalidate: true});
          }
        }
      } catch (e) {
        void 0;
      } finally {
        try {
          const params = new URLSearchParams(searchParams.toString());
          params.delete('ensureDefault');

          const nextUrl = params.toString() ? `${pathname}?${params.toString()}` : pathname;
          router.replace(nextUrl);
        } catch (_e) {
          void 0;
        }
      }
    })();
  }, [router, pathname, searchParams]);

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
