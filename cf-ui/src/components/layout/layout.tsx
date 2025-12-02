'use client';

import {Sidebar} from './sidebar';
import {usePathname} from 'next/navigation';
import {NavBar} from './navbar';
import {NodeRoute} from '../router/node-route';
import {memo} from 'react';
import {WorkspaceProvider} from '@/providers/workspace-context';

interface LayoutProps {
  children: React.ReactNode;
}

export const Layout = memo(({children}: LayoutProps) => {
  const pathname = usePathname();
  const onWorkspaceList = pathname === '/workspaces';

  return (
    <div className="flex flex-col h-screen bg-background">
      <NavBar />
      <WorkspaceProvider>
        <div className="flex flex-1 overflow-hidden">
          <Sidebar />
          <main className="flex-1 overflow-y-auto p-8 bg-[hsl(var(--main-background))] border-l border-[hsl(var(--main-border))] relative z-[1] isolate">
            <NodeRoute>{children}</NodeRoute>
          </main>
        </div>
      </WorkspaceProvider>
    </div>
  );
});

Layout.displayName = 'Layout';
