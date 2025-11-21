'use client';

import {Sidebar} from './sidebar';
import {NavBar} from './navbar';

interface LayoutProps {
  children: React.ReactNode;
}

export const Layout = ({children}: LayoutProps) => {
  return (
    <div className="flex h-screen bg-gray-50 dark:bg-gray-900">
      <Sidebar />
      <div className="flex flex-col flex-1 overflow-hidden">
        <NavBar />
        <main className="flex-1 overflow-y-auto p-8">{children}</main>
      </div>
    </div>
  );
};
