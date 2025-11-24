'use client';

import {AuthGuard} from '../../providers/auth-guard';
import {Layout} from '@/components/layout/layout';

export default function ProtectedLayout({children}: {children: React.ReactNode}) {
  return (
    <AuthGuard>
      <Layout>{children}</Layout>
    </AuthGuard>
  );
}
