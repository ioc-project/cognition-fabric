'use client';

import {useEffect} from 'react';
import {useRouter, usePathname} from 'next/navigation';

export function AuthGuard({children}: {children: React.ReactNode}) {
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    const publicRoutes = ['/login'];

    if (publicRoutes.includes(pathname)) {
      return;
    }

    const isAuthenticated = localStorage.getItem('isAuthenticated');

    if (isAuthenticated !== 'true') {
      router.push('/login');
    }
  }, [pathname, router]);

  return <>{children}</>;
}
