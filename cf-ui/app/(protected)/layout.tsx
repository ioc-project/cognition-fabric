'use client';

import {AuthGuard} from '../../providers/auth-guard';

export default function ProtectedLayout({children}: {children: React.ReactNode}) {
  return <AuthGuard>{children}</AuthGuard>;
}
