'use client';

import {Sidebar} from './sidebar';
import {NavBar} from './navbar';
import {NodeRoute} from '../router/node-route';
import {memo} from 'react';

interface LayoutProps {
  children: React.ReactNode;
}

export const Layout = memo(({children}: LayoutProps) => {
  return (
    <div className="flex flex-col h-screen bg-background">
      <NavBar />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        <main className="flex-1 overflow-y-auto p-8">
          <NodeRoute>{children}</NodeRoute>
        </main>
      </div>
    </div>
  );
});

Layout.displayName = 'Layout';
